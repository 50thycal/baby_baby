import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import { maybeSnapshot } from "@/lib/snapshot";
import type { Diaper, Feeding, HomeState, SleepSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The home screen's single source of truth: is the baby asleep right now, and
 * what were the last few things that happened. Deliberately unbounded in time
 * so a quiet overnight doesn't blank out the status line.
 */
export async function GET() {
  try {
    const sql = await db();

    const [feedings, activeSleeps, lastSleeps, diapers] = await Promise.all([
      sql`SELECT * FROM feedings ORDER BY ts DESC LIMIT 1`,
      sql`SELECT * FROM sleep_sessions WHERE sleep_end IS NULL ORDER BY sleep_start DESC LIMIT 1`,
      sql`SELECT * FROM sleep_sessions WHERE sleep_end IS NOT NULL ORDER BY sleep_end DESC LIMIT 1`,
      sql`SELECT * FROM diapers ORDER BY ts DESC LIMIT 1`,
    ]);

    const state: HomeState = {
      now: new Date().toISOString(),
      activeSleep: (activeSleeps[0] as SleepSession) ?? null,
      lastFeeding: (feedings[0] as Feeding) ?? null,
      lastSleep: (lastSleeps[0] as SleepSession) ?? null,
      lastDiaper: (diapers[0] as Diaper) ?? null,
    };
    // Piggybacks the backup check on the poll every open phone already makes.
    // Heavily throttled in-process and never allowed to fail the request.
    await maybeSnapshot();

    return ok(state);
  } catch (err) {
    return fail(err);
  }
}
