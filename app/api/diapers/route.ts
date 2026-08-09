import { db } from "@/lib/db";
import { fail, ok, parseDiaperType, parseTimestamp, readJson } from "@/lib/http";
import type { Diaper } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const type = parseDiaperType(body.type);
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      INSERT INTO diapers (type, ts) VALUES (${type}, ${ts.toISOString()})
      RETURNING *`) as Diaper[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
