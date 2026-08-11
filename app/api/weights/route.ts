import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson } from "@/lib/http";
import { maybeSnapshot } from "@/lib/snapshot";
import type { Weight } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Matches the CHECK on the table, so a bad value is a 400 rather than a 500. */
function parseGrams(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequest("weight_g must be a number");
  const grams = Math.round(n);
  if (grams <= 0 || grams > 50_000) throw new BadRequest("weight_g is out of range");
  return grams;
}

/**
 * GET /api/weights — every weigh-in, oldest first.
 *
 * Unrangeed on purpose: there are only ever a handful, and both the current
 * figure and the chart want the whole series regardless of which window the
 * timeline happens to be showing.
 */
export async function GET() {
  try {
    const sql = await db();
    const rows = (await sql`SELECT * FROM weights ORDER BY ts ASC`) as Weight[];
    void maybeSnapshot();
    return ok(rows);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const grams = parseGrams(body.weight_g);
    const ts = parseTimestamp(body.ts);

    const sql = await db();
    const rows = (await sql`
      INSERT INTO weights (weight_g, ts) VALUES (${grams}, ${ts.toISOString()})
      RETURNING *`) as Weight[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
