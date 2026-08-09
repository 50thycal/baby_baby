import { BadRequest, fail, ok } from "@/lib/http";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

/**
 * The snapshot's full contents. `?download=1` sends it as a file so a copy can
 * be kept somewhere that isn't this database.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const snap = await getSnapshot(id);
    if (!snap) throw new BadRequest("That backup no longer exists");

    const url = new URL(_req.url);
    if (url.searchParams.get("download")) {
      const stamp = new Date(snap.taken_at).toISOString().replace(/[:.]/g, "-").slice(0, 19);
      return new Response(JSON.stringify(snap, null, 2), {
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="baby-baby-${stamp}.json"`,
          "cache-control": "no-store",
        },
      });
    }
    return ok(snap);
  } catch (err) {
    return fail(err);
  }
}
