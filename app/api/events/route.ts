import { db } from "@/lib/db";
import { fail, ok } from "@/lib/http";
import {
  rangeHours,
  RANGES,
  type Comment,
  type Diaper,
  type EventsPayload,
  type Feeding,
  type Moment,
  type RangeKey,
  type SleepSession,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** GET /api/events?range=24h — everything the dashboard draws, in one trip. */
export async function GET(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("range") ?? "24h";
    const end = new Date();

    // `all` is for the export, not the dashboard — it has no button. The floor
    // is a fixed date rather than the epoch so the window is still bounded.
    let start: Date;
    if (key === "all") {
      start = new Date("2000-01-01T00:00:00.000Z");
    } else {
      const valid = RANGES.some((r) => r.key === key);
      const hours = rangeHours((valid ? key : "24h") as RangeKey);
      start = new Date(end.getTime() - hours * 3600_000);
    }

    const sql = await db();
    const [feedings, sleep, diapers, comments, moments] = await Promise.all([
      sql`SELECT * FROM feedings
          WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
          ORDER BY ts ASC`,
      // A sleep that started before the window but is still running (or ended
      // inside it) must be included, otherwise the track loses its block.
      sql`SELECT * FROM sleep_sessions
          WHERE (sleep_end IS NULL OR sleep_end >= ${start.toISOString()})
            AND sleep_start <= ${end.toISOString()}
          ORDER BY sleep_start ASC`,
      sql`SELECT * FROM diapers
          WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
          ORDER BY ts ASC`,
      sql`SELECT * FROM comments
          WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
          ORDER BY ts ASC`,
      sql`SELECT * FROM moments
          WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
          ORDER BY ts ASC`,
    ]);

    const payload: EventsPayload = {
      start: start.toISOString(),
      end: end.toISOString(),
      feedings: feedings as Feeding[],
      sleep: sleep as SleepSession[],
      diapers: diapers as Diaper[],
      comments: comments as Comment[],
      moments: moments as Moment[],
    };
    return ok(payload);
  } catch (err) {
    return fail(err);
  }
}
