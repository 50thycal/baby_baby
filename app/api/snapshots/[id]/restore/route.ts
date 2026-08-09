import { fail, ok } from "@/lib/http";
import { restoreSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return ok(await restoreSnapshot(id));
  } catch (err) {
    return fail(err);
  }
}
