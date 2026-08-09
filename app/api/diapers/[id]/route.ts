import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseDiaperType, parseTimestamp, readJson } from "@/lib/http";
import { snapshotBeforeDelete } from "@/lib/snapshot";
import type { Diaper, DiaperType } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);

    const type: DiaperType | null = body.type === undefined ? null : parseDiaperType(body.type);
    const ts = body.ts === undefined ? null : parseTimestamp(body.ts);
    if (type === null && ts === null) throw new BadRequest("Nothing to update");

    const sql = await db();
    const rows = (await sql`
      UPDATE diapers
         SET type = COALESCE(${type}, type),
             ts   = COALESCE(${ts ? ts.toISOString() : null}, ts)
       WHERE id = ${id}
      RETURNING *`) as Diaper[];

    if (!rows[0]) throw new BadRequest("That diaper no longer exists");
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
    await sql`DELETE FROM diapers WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
