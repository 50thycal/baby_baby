import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseCommentText, parseTimestamp, readJson } from "@/lib/http";
import { snapshotBeforeDelete } from "@/lib/snapshot";
import type { Comment } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED_REACTIONS = ["❤️", "😂", "🎉", "😮"];

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);
    const sql = await db();

    // Reactions are a counter bump, not a replacement, so two people tapping
    // the same heart at once both count.
    if (typeof body.react === "string") {
      if (!ALLOWED_REACTIONS.includes(body.react)) throw new BadRequest("Unknown reaction");
      const rows = (await sql`
        UPDATE comments
           SET reactions = jsonb_set(
                 reactions,
                 ARRAY[${body.react}::text],
                 to_jsonb(COALESCE((reactions ->> ${body.react})::int, 0) + 1),
                 true)
         WHERE id = ${id}
        RETURNING *`) as Comment[];
      if (!rows[0]) throw new BadRequest("That comment no longer exists");
      return ok(rows[0]);
    }

    const text: string | null = body.text === undefined ? null : parseCommentText(body.text);
    const ts = body.ts === undefined ? null : parseTimestamp(body.ts);
    if (text === null && ts === null) throw new BadRequest("Nothing to update");

    const rows = (await sql`
      UPDATE comments
         SET text = COALESCE(${text}, text),
             ts   = COALESCE(${ts ? ts.toISOString() : null}, ts)
       WHERE id = ${id}
      RETURNING *`) as Comment[];

    if (!rows[0]) throw new BadRequest("That comment no longer exists");
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
    await sql`DELETE FROM comments WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
