import { db } from "@/lib/db";
import { BadRequest, fail, ok, parseTimestamp, readJson } from "@/lib/http";
import { snapshotBeforeDelete } from "@/lib/snapshot";
import type { SleepSession } from "@/lib/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Ends the active sleep ("Baby's Awake") and doubles as the edit endpoint for
 * a finished one. Pass `sleep_end: null` to reopen a session.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = await readJson(req);

    const sql = await db();
    const existing = (await sql`SELECT * FROM sleep_sessions WHERE id = ${id}`) as SleepSession[];
    const row = existing[0];
    if (!row) throw new BadRequest("That sleep session no longer exists");

    const start =
      body.sleep_start === undefined
        ? new Date(row.sleep_start)
        : parseTimestamp(body.sleep_start, "sleep_start");

    let end: Date | null;
    if (body.sleep_end === undefined) {
      end = row.sleep_end ? new Date(row.sleep_end) : null;
    } else if (body.sleep_end === null) {
      end = null;
    } else {
      end = parseTimestamp(body.sleep_end, "sleep_end");
    }

    if (end && end.getTime() <= start.getTime()) {
      throw new BadRequest("Wake-up time has to be after the time the baby fell asleep");
    }
    // Reopening only makes sense if nothing else is currently running.
    if (!end && row.sleep_end) {
      const active = (await sql`
        SELECT id FROM sleep_sessions WHERE sleep_end IS NULL LIMIT 1`) as { id: string }[];
      if (active[0]) throw new BadRequest("There is already an active sleep session");
    }

    const rows = (await sql`
      UPDATE sleep_sessions
         SET sleep_start = ${start.toISOString()},
             sleep_end   = ${end ? end.toISOString() : null}
       WHERE id = ${id}
      RETURNING *`) as SleepSession[];

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
    await sql`DELETE FROM sleep_sessions WHERE id = ${id}`;
    return ok({ deleted: id });
  } catch (err) {
    return fail(err);
  }
}
