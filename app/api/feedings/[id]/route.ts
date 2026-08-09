import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseAmount, parseTimestamp, readJson } from "@/lib/http";
import type { Feeding } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);

    const amount = body.amount_ml === undefined ? null : parseAmount(body.amount_ml);
    const ts = body.ts === undefined ? null : parseTimestamp(body.ts);
    if (amount === null && ts === null) throw new BadRequest("Nothing to update");

    const sql = await db();
    const rows = (await sql`
      UPDATE feedings
         SET amount_ml = COALESCE(${amount}, amount_ml),
             ts        = COALESCE(${ts ? ts.toISOString() : null}, ts)
       WHERE id = ${id}
      RETURNING *`) as Feeding[];

    if (!rows[0]) throw new BadRequest("That feeding no longer exists");
    return ok(rows[0]);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const sql = await db();
    await sql`DELETE FROM feedings WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
