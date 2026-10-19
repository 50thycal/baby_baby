import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson, readMe } from "@/lib/http";
import type { SleepSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Starts a sleep session. If somebody else already put the baby down — two
 * phones, same minute — we return their session with 409 rather than creating
 * a second one. The client just adopts it, so the race is invisible.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const start = parseTimestamp(body.sleep_start ?? body.ts, "sleep_start");
    const end = body.sleep_end == null ? null : parseTimestamp(body.sleep_end, "sleep_end");
    if (end && (end <= start || end.getTime() > Date.now())) {
      throw new BadRequest(
        "A past sleep needs a wake-up after falling asleep and no later than now",
      );
    }

    const sql = await db();
    // Backfill a finished nap atomically. Never create or end the live timer.
    if (end) {
      const rows = (await sql`
        INSERT INTO sleep_sessions (sleep_start, sleep_end, logged_by)
        SELECT ${start.toISOString()}::timestamptz, ${end.toISOString()}::timestamptz,
               (SELECT name FROM people WHERE id = ${readMe(req)})
        WHERE NOT EXISTS (
          SELECT 1 FROM sleep_sessions
          WHERE sleep_start < ${end.toISOString()}
            AND (sleep_end IS NULL OR sleep_end > ${start.toISOString()})
        )
        RETURNING *`) as SleepSession[];
      if (!rows[0])
        return ok(
          {
            error: "That sleep overlaps a sleep already logged. Check the times.",
          },
          409,
        );
      return ok(rows[0], 201);
    }
    const active = (await sql`
      SELECT * FROM sleep_sessions WHERE sleep_end IS NULL LIMIT 1`) as SleepSession[];
    if (active[0]) {
      return ok({ error: "The baby is already down for a sleep", active: active[0] }, 409);
    }

    try {
      const rows = (await sql`
        INSERT INTO sleep_sessions (sleep_start, logged_by)
        VALUES (${start.toISOString()}, (SELECT name FROM people WHERE id = ${readMe(req)}))
        RETURNING *`) as SleepSession[];
      return ok(rows[0], 201);
    } catch (err) {
      // Lost the race between the SELECT and the INSERT.
      if (isUniqueViolation(err)) {
        const rows = (await sql`
          SELECT * FROM sleep_sessions WHERE sleep_end IS NULL LIMIT 1`) as SleepSession[];
        return ok(
          {
            error: "The baby is already down for a sleep",
            active: rows[0] ?? null,
          },
          409,
        );
      }
      throw err;
    }
  } catch (err) {
    return fail(err);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}
