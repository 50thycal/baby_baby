import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson } from "@/lib/http";
import { snapshotBeforeDelete } from "@/lib/snapshot";
import type { Weight } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function parseGrams(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequest("weight_g must be a number");
  const grams = Math.round(n);
  if (grams <= 0 || grams > 50_000) throw new BadRequest("weight_g is out of range");
  return grams;
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    if (body.weight_g === undefined && body.ts === undefined) {
      throw new BadRequest("Nothing to update");
    }
    const grams = body.weight_g === undefined ? null : parseGrams(body.weight_g);
    const ts = body.ts === undefined ? null : parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      UPDATE weights
      SET weight_g = COALESCE(${grams}, weight_g),
          ts       = COALESCE(${ts ? ts.toISOString() : null}, ts)
      WHERE id = ${id}
      RETURNING *`) as Weight[];

    if (!rows[0]) throw new BadRequest("That weigh-in no longer exists");
    return ok(rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    // Always leave a restore point on the other side of a delete.
    await snapshotBeforeDelete();
    const { id } = await params;
    const sql = await db();
    await sql`DELETE FROM weights WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
