import { db } from "@/lib/db";
import { fail, ok, parseCommentText, parseTimestamp, readJson, readMe } from "@/lib/http";
import type { Comment } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const text = parseCommentText(body.text);
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      INSERT INTO comments (text, ts, logged_by)
      VALUES (${text}, ${ts.toISOString()}, (SELECT name FROM people WHERE id = ${readMe(req)}))
      RETURNING *`) as Comment[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
