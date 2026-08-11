/**
 * Automatic backups.
 *
 * The app deliberately has no accounts — anyone with the link can log a feed,
 * and anyone with the link can delete one. That openness is the point, so the
 * safety net has to sit behind it rather than in front.
 *
 * Snapshots are triggered by activity rather than a clock. Every read the app
 * already makes calls `maybeSnapshot()`, which is throttled twice over: an
 * in-memory timer keeps all but one request in a few minutes from touching the
 * database at all, and a fingerprint check means an idle week doesn't fill the
 * table with identical copies. No cron job, so no scheduling limits, and
 * nothing to notice when it silently stops running.
 */
import { db } from "./db";
import { BadRequest } from "./http";
import type { Comment, Diaper, Feeding, Moment, SleepSession, Weight } from "./types";

export type SnapshotCounts = {
  feedings: number;
  sleep: number;
  diapers: number;
  comments: number;
  moments: number;
  weights: number;
};

export type SnapshotPayload = {
  feedings: Feeding[];
  sleep: SleepSession[];
  diapers: Diaper[];
  comments: Comment[];
  moments: Moment[];
  weights: Weight[];
};

export type SnapshotRow = {
  id: string;
  taken_at: string;
  reason: string;
  counts: SnapshotCounts;
};

/** Don't take a fresh copy more often than this on the routine path. */
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
/** Don't even ask the database whether one is due more often than this. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
/** Back off only briefly when there was nothing to copy, or the check failed. */
const RETRY_INTERVAL_MS = 30 * 1000;
/**
 * How stale the newest copy may be before a delete forces a fresh one. Deletes
 * are the operation that actually loses data, so they get a much tighter bound
 * than the hourly baseline — without it, a deletion 50 minutes into the hour
 * would cost 50 minutes of legitimate entries to undo.
 */
const PRE_DELETE_MAX_AGE_MS = 2 * 60 * 1000;
/** Roughly three months of hourly copies. The rows are a few KB each. */
const KEEP = 2000;

// Per warm instance. Being wrong after a cold start just means one extra check.
let nextCheckAt = 0;

/**
 * A cheap stand-in for "has anything changed". Counts catch deletes, which a
 * max(created_at) alone would miss, and created_at catches edits and inserts.
 */
async function fingerprint(): Promise<{ counts: SnapshotCounts; touched: string | null }> {
  const sql = await db();
  const rows = (await sql`
    SELECT
      (SELECT count(*) FROM feedings)       AS feedings,
      (SELECT count(*) FROM sleep_sessions) AS sleep,
      (SELECT count(*) FROM diapers)        AS diapers,
      (SELECT count(*) FROM comments)       AS comments,
      (SELECT count(*) FROM moments)        AS moments,
      (SELECT count(*) FROM weights)        AS weights,
      GREATEST(
        COALESCE((SELECT max(created_at) FROM feedings),       'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM sleep_sessions), 'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM diapers),        'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM comments),       'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM moments),        'epoch'::timestamptz),
        COALESCE((SELECT max(created_at) FROM weights),        'epoch'::timestamptz)
      ) AS touched`) as {
    feedings: number;
    sleep: number;
    diapers: number;
    comments: number;
    moments: number;
    weights: number;
    touched: string | null;
  }[];

  const r = rows[0];
  return {
    counts: {
      feedings: Number(r.feedings),
      sleep: Number(r.sleep),
      diapers: Number(r.diapers),
      comments: Number(r.comments),
      moments: Number(r.moments),
      weights: Number(r.weights),
    },
    touched: r.touched,
  };
}

async function readAll(): Promise<SnapshotPayload> {
  const sql = await db();
  const [feedings, sleep, diapers, comments, moments, weights] = await Promise.all([
    sql`SELECT * FROM feedings ORDER BY ts`,
    sql`SELECT * FROM sleep_sessions ORDER BY sleep_start`,
    sql`SELECT * FROM diapers ORDER BY ts`,
    sql`SELECT * FROM comments ORDER BY ts`,
    sql`SELECT * FROM moments ORDER BY ts`,
    sql`SELECT * FROM weights ORDER BY ts`,
  ]);
  return {
    feedings: feedings as Feeding[],
    sleep: sleep as SleepSession[],
    diapers: diapers as Diaper[],
    comments: comments as Comment[],
    moments: moments as Moment[],
    weights: weights as Weight[],
  };
}

/** Takes a copy unconditionally. Returns the new snapshot's id. */
export async function captureSnapshot(reason = "auto"): Promise<string> {
  const sql = await db();
  const payload = await readAll();
  const counts: SnapshotCounts = {
    feedings: payload.feedings.length,
    sleep: payload.sleep.length,
    diapers: payload.diapers.length,
    comments: payload.comments.length,
    moments: payload.moments.length,
    weights: payload.weights.length,
  };

  const rows = (await sql`
    INSERT INTO snapshots (reason, counts, payload)
    VALUES (${reason}, ${JSON.stringify(counts)}, ${JSON.stringify(payload)})
    RETURNING id`) as { id: string }[];

  // Keep the table from growing without bound.
  await sql`
    DELETE FROM snapshots
    WHERE id IN (SELECT id FROM snapshots ORDER BY taken_at DESC OFFSET ${KEEP})`;

  return rows[0].id;
}

/**
 * Called from read paths. Never throws — a backup failing is not a reason to
 * fail the request someone is waiting on, so problems are logged and dropped.
 */
export async function maybeSnapshot(): Promise<void> {
  const now = Date.now();
  if (now < nextCheckAt) return;
  nextCheckAt = now + CHECK_INTERVAL_MS;

  try {
    const sql = await db();
    const latest = (await sql`
      SELECT taken_at, counts FROM snapshots ORDER BY taken_at DESC LIMIT 1`) as {
      taken_at: string;
      counts: SnapshotCounts;
    }[];

    const { counts, touched } = await fingerprint();
    const isEmpty =
      counts.feedings + counts.sleep + counts.diapers + counts.comments + counts.moments + counts.weights ===
      0;
    if (isEmpty) {
      // Nothing worth preserving yet, but the very first entry shouldn't have to
      // wait out a full check interval before it's protected.
      nextCheckAt = now + RETRY_INTERVAL_MS;
      return;
    }

    if (!latest.length) {
      await captureSnapshot("first");
      return;
    }

    const takenAt = new Date(latest[0].taken_at).getTime();
    if (now - takenAt < SNAPSHOT_INTERVAL_MS) return;

    // Due by time — but only worth doing if something actually moved.
    const prev = latest[0].counts;
    const countsChanged =
      prev.feedings !== counts.feedings ||
      prev.sleep !== counts.sleep ||
      prev.diapers !== counts.diapers ||
      prev.comments !== counts.comments ||
      prev.moments !== counts.moments ||
      prev.weights !== counts.weights;
    const editedSince = touched ? new Date(touched).getTime() > takenAt : false;

    if (countsChanged || editedSince) await captureSnapshot("auto");
  } catch (err) {
    console.error("[snapshot] skipped:", err);
    nextCheckAt = Date.now() + RETRY_INTERVAL_MS;
  }
}

/**
 * Called immediately before anything is deleted, so there is always a recent
 * restore point on the other side of the destructive act. Cheap in practice:
 * deletes are rare, and back-to-back ones reuse the copy just taken.
 *
 * Like `maybeSnapshot`, this never throws — refusing to delete because the
 * backup failed would be a worse outcome than the missing backup.
 */
export async function snapshotBeforeDelete(): Promise<void> {
  try {
    const sql = await db();
    const latest = (await sql`
      SELECT taken_at FROM snapshots ORDER BY taken_at DESC LIMIT 1`) as { taken_at: string }[];

    if (latest.length) {
      const age = Date.now() - new Date(latest[0].taken_at).getTime();
      if (age < PRE_DELETE_MAX_AGE_MS) return;
    }

    const { counts } = await fingerprint();
    if (
      counts.feedings + counts.sleep + counts.diapers + counts.comments + counts.moments + counts.weights ===
      0
    )
      return;

    await captureSnapshot("before a delete");
  } catch (err) {
    console.error("[snapshot] pre-delete skipped:", err);
  }
}

export async function listSnapshots(limit = 60): Promise<SnapshotRow[]> {
  const sql = await db();
  return (await sql`
    SELECT id, taken_at, reason, counts FROM snapshots
    ORDER BY taken_at DESC LIMIT ${limit}`) as SnapshotRow[];
}

export async function getSnapshot(id: string) {
  const sql = await db();
  const rows = (await sql`SELECT * FROM snapshots WHERE id = ${id}`) as {
    id: string;
    taken_at: string;
    reason: string;
    counts: SnapshotCounts;
    payload: SnapshotPayload;
  }[];
  return rows[0] ?? null;
}

/**
 * Puts the data back as it was.
 *
 * Takes a copy of the current state first, under its own reason, so restoring
 * to the wrong point is itself undoable — the most likely mistake here is a
 * panicked restore to a snapshot that turns out to be too old.
 */
export async function restoreSnapshot(id: string): Promise<SnapshotCounts> {
  const snap = await getSnapshot(id);
  // A missing id is the caller's problem, not a server fault — 400, not 500.
  if (!snap) throw new BadRequest("That backup no longer exists");

  await captureSnapshot("pre-restore");

  const sql = await db();
  const p = snap.payload;

  await sql`DELETE FROM feedings`;
  await sql`DELETE FROM sleep_sessions`;
  await sql`DELETE FROM diapers`;
  await sql`DELETE FROM comments`;
  await sql`DELETE FROM moments`;
  await sql`DELETE FROM weights`;

  if (p.feedings.length) {
    await sql.query(
      `INSERT INTO feedings (id, amount_ml, ts, created_at)
       SELECT * FROM unnest($1::uuid[], $2::int[], $3::timestamptz[], $4::timestamptz[])`,
      [
        p.feedings.map((r) => r.id),
        p.feedings.map((r) => r.amount_ml),
        p.feedings.map((r) => r.ts),
        p.feedings.map((r) => r.created_at),
      ],
    );
  }
  if (p.sleep.length) {
    await sql.query(
      `INSERT INTO sleep_sessions (id, sleep_start, sleep_end, created_at)
       SELECT * FROM unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[], $4::timestamptz[])`,
      [
        p.sleep.map((r) => r.id),
        p.sleep.map((r) => r.sleep_start),
        p.sleep.map((r) => r.sleep_end),
        p.sleep.map((r) => r.created_at),
      ],
    );
  }
  if (p.diapers.length) {
    await sql.query(
      `INSERT INTO diapers (id, type, ts, created_at)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::timestamptz[])`,
      [
        p.diapers.map((r) => r.id),
        p.diapers.map((r) => r.type),
        p.diapers.map((r) => r.ts),
        p.diapers.map((r) => r.created_at),
      ],
    );
  }
  if (p.comments.length) {
    await sql.query(
      `INSERT INTO comments (id, ts, text, reactions, created_at)
       SELECT * FROM unnest($1::uuid[], $2::timestamptz[], $3::text[], $4::jsonb[], $5::timestamptz[])`,
      [
        p.comments.map((r) => r.id),
        p.comments.map((r) => r.ts),
        p.comments.map((r) => r.text),
        p.comments.map((r) => JSON.stringify(r.reactions ?? {})),
        p.comments.map((r) => r.created_at),
      ],
    );
  }

  if (p.moments?.length) {
    await sql.query(
      `INSERT INTO moments (id, kind, ts, created_at)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::timestamptz[], $4::timestamptz[])`,
      [
        p.moments.map((r) => r.id),
        p.moments.map((r) => r.kind),
        p.moments.map((r) => r.ts),
        p.moments.map((r) => r.created_at),
      ],
    );
  }

  // `?.` because backups taken before weigh-ins existed have no such key.
  if (p.weights?.length) {
    await sql.query(
      `INSERT INTO weights (id, weight_g, ts, created_at)
       SELECT * FROM unnest($1::uuid[], $2::int[], $3::timestamptz[], $4::timestamptz[])`,
      [
        p.weights.map((r) => r.id),
        p.weights.map((r) => r.weight_g),
        p.weights.map((r) => r.ts),
        p.weights.map((r) => r.created_at),
      ],
    );
  }

  return snap.counts;
}
