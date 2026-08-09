import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseAmount, parseDiaperType, parseTimestamp } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

type Incoming = {
  feedings?: { amount_ml: unknown; ts: unknown }[];
  diapers?: { type: unknown; ts: unknown }[];
};

/**
 * Bulk insert for the import box.
 *
 * Two things matter here beyond speed. It inserts each table in a single
 * statement via `unnest`, so a paste of forty rows is two round trips rather
 * than forty. And it skips rows that exactly match something already stored,
 * which makes re-pasting safe — if the first attempt half-succeeded, or someone
 * taps Import twice, the second run adds only what's missing instead of
 * silently doubling a day's feeds.
 */
export async function POST(req: Request) {
  try {
    let body: Incoming;
    try {
      body = await req.json();
    } catch {
      throw new BadRequest("Expected a JSON body");
    }

    const feedings = Array.isArray(body.feedings) ? body.feedings : [];
    const diapers = Array.isArray(body.diapers) ? body.diapers : [];
    if (!feedings.length && !diapers.length) throw new BadRequest("Nothing to import");
    if (feedings.length + diapers.length > MAX_ROWS) {
      throw new BadRequest(`Too many rows at once (${MAX_ROWS} max)`);
    }

    // Validate everything before writing anything, so a bad row on line 30
    // doesn't leave the first 29 committed.
    const feedRows = feedings.map((f) => ({
      amount: parseAmount(f.amount_ml),
      ts: parseTimestamp(f.ts).toISOString(),
    }));
    const diaperRows = diapers.map((d) => ({
      type: parseDiaperType(d.type),
      ts: parseTimestamp(d.ts).toISOString(),
    }));

    const sql = await db();
    let insertedFeedings = 0;
    let insertedDiapers = 0;

    if (feedRows.length) {
      const rows = await sql.query(
        `INSERT INTO feedings (amount_ml, ts)
         SELECT a, b FROM unnest($1::int[], $2::timestamptz[]) AS t(a, b)
         WHERE NOT EXISTS (
           SELECT 1 FROM feedings f WHERE f.ts = t.b AND f.amount_ml = t.a
         )
         RETURNING id`,
        [feedRows.map((r) => r.amount), feedRows.map((r) => r.ts)],
      );
      insertedFeedings = (rows as unknown[]).length;
    }

    if (diaperRows.length) {
      const rows = await sql.query(
        `INSERT INTO diapers (type, ts)
         SELECT a, b FROM unnest($1::text[], $2::timestamptz[]) AS t(a, b)
         WHERE NOT EXISTS (
           SELECT 1 FROM diapers d WHERE d.ts = t.b AND d.type = t.a
         )
         RETURNING id`,
        [diaperRows.map((r) => r.type), diaperRows.map((r) => r.ts)],
      );
      insertedDiapers = (rows as unknown[]).length;
    }

    return ok(
      {
        feedings: insertedFeedings,
        diapers: insertedDiapers,
        skipped: feedRows.length + diaperRows.length - insertedFeedings - insertedDiapers,
      },
      201,
    );
  } catch (err) {
    return fail(err);
  }
}
