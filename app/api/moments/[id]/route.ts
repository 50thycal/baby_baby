import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson } from "@/lib/http";
import { snapshotBeforeDelete } from "@/lib/snapshot";
import type { Moment } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    if (body.ts === undefined) throw new BadRequest("Nothing to update");
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      UPDATE moments SET ts = ${ts.toISOString()} WHERE id = ${id} RETURNING *`) as Moment[];

    if (!rows[0]) throw new BadRequest("That no longer exists");
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
    await sql`DELETE FROM moments WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
