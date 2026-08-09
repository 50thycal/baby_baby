import { db } from "@/lib/db";
import { fail, ok, parseAmount, parseTimestamp, readJson } from "@/lib/http";
import type { Feeding } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const amount = parseAmount(body.amount_ml);
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      INSERT INTO feedings (amount_ml, ts) VALUES (${amount}, ${ts.toISOString()})
      RETURNING *`) as Feeding[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
