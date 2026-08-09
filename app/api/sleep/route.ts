import { db } from "@/lib/db";
import { fail, ok, parseTimestamp, readJson } from "@/lib/http";
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

    const sql = await db();
    const active = (await sql`
      SELECT * FROM sleep_sessions WHERE sleep_end IS NULL LIMIT 1`) as SleepSession[];
    if (active[0]) {
      return ok({ error: "The baby is already down for a sleep", active: active[0] }, 409);
    }

    try {
      const rows = (await sql`
        INSERT INTO sleep_sessions (sleep_start) VALUES (${start.toISOString()})
        RETURNING *`) as SleepSession[];
      return ok(rows[0], 201);
    } catch (err) {
      // Lost the race between the SELECT and the INSERT.
      if (isUniqueViolation(err)) {
        const rows = (await sql`
          SELECT * FROM sleep_sessions WHERE sleep_end IS NULL LIMIT 1`) as SleepSession[];
        return ok({ error: "The baby is already down for a sleep", active: rows[0] ?? null }, 409);
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
