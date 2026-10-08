/**
 * Nights, for the question every parent of a newborn is really asking: is she
 * getting closer to sleeping through?
 *
 * Totals can't answer it. Fifteen hours of sleep in ninety-minute pieces is a
 * very different night from fifteen hours with a six-hour stretch in the
 * middle, and every cumulative chart draws them identically. So this file is
 * about stretches: where each one fell (the diary) and how long the longest
 * one each night ran (the progress chart).
 *
 * Everything is in the reader's local time, like the rest of the dashboards.
 */
import { addDays, coverageStart, startOfDay } from "./daily";
import type { EventsPayload, SleepSession } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * A stretch belongs to a night if it *starts* between these hours. The same
 * rule the 6-hour bet used: bedtime drifts, but it doesn't drift outside this.
 */
export const NIGHT_FROM_HOUR = 18;
export const NIGHT_TO_HOUR = 6;

/** "Sleeping through the night", as the usual milestone has it. */
export const THROUGH_THE_NIGHT_MS = 6 * HOUR;

/** The rungs drawn on the progress chart, longest last. */
export const MILESTONES_MS = [4 * HOUR, 5 * HOUR, 6 * HOUR];

const startMs = (s: SleepSession) => new Date(s.sleep_start).getTime();
const endMs = (s: SleepSession, now: number) =>
  s.sleep_end === null ? now : new Date(s.sleep_end).getTime();

/** The night that begins on the evening of `evening` (any time that day). */
export function nightWindow(evening: Date) {
  const y = evening.getFullYear();
  const m = evening.getMonth();
  const d = evening.getDate();
  // By date parts, so a daylight-saving night is still 6pm to 6am on the wall.
  return {
    from: new Date(y, m, d, NIGHT_FROM_HOUR).getTime(),
    to: new Date(y, m, d + 1, NIGHT_TO_HOUR).getTime(),
  };
}

/**
 * The night's longest stretch: the longest sleep that started in its window,
 * followed to its end however late that is. Null when nothing started then.
 */
export function longestStretch(
  sleep: SleepSession[],
  evening: Date,
  now: number,
): { session: SleepSession; ms: number; running: boolean } | null {
  const win = nightWindow(evening);
  let best: { session: SleepSession; ms: number; running: boolean } | null = null;
  for (const s of sleep) {
    const at = startMs(s);
    if (at < win.from || at >= win.to || at > now) continue;
    const ms = endMs(s, now) - at;
    if (!best || ms > best.ms) best = { session: s, ms, running: s.sleep_end === null };
  }
  return best;
}

// ---------------------------------------------------------------------------
// The diary.

export type DiarySegment = {
  /** Where the sleep sits in its row, as fractions of the row from noon. */
  from: number;
  to: number;
  /** Still going: the bar ends at now, not at a wake-up. */
  running: boolean;
  /** Part of that night's longest stretch. */
  longest: boolean;
};

export type DiaryRow = {
  /** The noon the row starts at. */
  start: number;
  end: number;
  segments: DiarySegment[];
  /** Feeds, as fractions of the row. */
  feeds: number[];
  /** Where now falls, on the row that contains it. */
  now: number | null;
  /** That night's longest stretch, for the label at the end of the row. */
  longestMs: number | null;
};

/**
 * One row per day, newest first, each running **noon to noon**.
 *
 * Midnight to midnight is the natural cut for totals and the worst one for
 * this: it slices every night in two, and the stretch you most want to see —
 * 10pm to 4am — comes out as two short bars on two different rows. Starting
 * at noon puts the whole night in the middle of its row, with the afternoon
 * naps before it and the morning after.
 *
 * Rows from before anyone was writing sleep down are left off rather than
 * drawn empty: an empty row would read as a night she didn't sleep.
 */
export function sleepDiary(data: EventsPayload, now: Date, days = 14): DiaryRow[] {
  const t = now.getTime();
  // The row containing now starts at today's noon, or yesterday's before it.
  const anchor = now.getHours() >= 12 ? now : addDays(now, -1);
  const first = data.sleep.length ? Math.min(...data.sleep.map(startMs)) : null;
  if (first === null) return [];

  const rows: DiaryRow[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(anchor, -i);
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12).getTime();
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 12).getTime();
    if (end <= first) break;

    const len = end - start;
    const visibleEnd = Math.min(end, t);
    const night = longestStretch(data.sleep, day, t);

    const segments: DiarySegment[] = [];
    for (const s of data.sleep) {
      const from = Math.max(startMs(s), start);
      const to = Math.min(endMs(s, t), visibleEnd);
      if (to <= from) continue;
      segments.push({
        from: (from - start) / len,
        to: (to - start) / len,
        running: s.sleep_end === null && to >= t,
        longest: night !== null && night.session.id === s.id,
      });
    }
    segments.sort((a, b) => a.from - b.from);

    const feeds = data.feedings
      .map((f) => new Date(f.ts).getTime())
      .filter((ts) => ts >= start && ts < visibleEnd)
      .map((ts) => (ts - start) / len);

    rows.push({
      start,
      end,
      segments,
      feeds,
      now: t >= start && t < end ? (t - start) / len : null,
      longestMs: night?.ms ?? null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The progress chart.

export type NightPoint = {
  /** Local midnight of the evening the night began. */
  evening: number;
  /** The longest stretch that night. */
  ms: number;
};

/**
 * The longest stretch of each finished night, oldest first.
 *
 * Finished means past 6am and with nothing from that night still running — a
 * stretch that started at 11pm and is still going at 7am may yet become the
 * best night of her life, and drawing it now would be drawing it short.
 *
 * A night with no sleep logged at all is left out rather than drawn as zero.
 * A baby sleeps every night; a night with nothing written down is a night
 * somebody was too tired to log, and a zero would drag the trend into the
 * floor for it. Nights before the sleep log began are left out for the same
 * reason.
 */
export function nightStretches(
  data: EventsPayload,
  now: Date,
  nights: number | "all",
): NightPoint[] {
  const t = now.getTime();
  const covered = coverageStart(data, "sleep", now);
  if (covered === null) return [];

  // The first evening worth reading: the night that starts on the first day
  // the sleep log covers.
  const firstEvening = covered;
  const points: NightPoint[] = [];

  // `nights` counts calendar evenings back from last night, not points: "the
  // last two weeks" shouldn't quietly reach back three because a few nights
  // weren't logged.
  for (let back = 1; nights === "all" || back <= nights; back++) {
    const evening = addDays(startOfDay(now), -back);
    if (evening.getTime() < firstEvening) break;
    const win = nightWindow(evening);
    if (t < win.to) continue;
    const best = longestStretch(data.sleep, evening, t);
    if (!best || best.running) continue;
    points.push({ evening: evening.getTime(), ms: best.ms });
  }
  return points.reverse();
}

export type NightTrend = {
  /** Change in the longest stretch per day, in ms. */
  slopePerDay: number;
  /** The fitted value at the first and last night. */
  from: number;
  to: number;
  /** Same test as the other trend charts: is the move bigger than the scatter? */
  significant: boolean;
};

/**
 * Least-squares fit against real dates rather than point positions, because
 * forgotten nights leave gaps and the projection below has to know how many
 * *days* away a milestone is, not how many points.
 */
export function fitNights(points: NightPoint[]): NightTrend | null {
  if (points.length < 3) return null;
  const x0 = points[0].evening;
  const xs = points.map((p) => (p.evening - x0) / DAY);
  const ys = points.map((p) => p.ms);
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;
  const spread = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0) / n);
  const move = Math.abs(slope * xs[n - 1]);
  return {
    slopePerDay: slope,
    from: intercept,
    to: intercept + slope * xs[n - 1],
    significant: move > 0 && move >= spread,
  };
}

/** Projections further out than this are a guess wearing a date, so none is made. */
export const MAX_PROJECTION_DAYS = 90;

export type Projection =
  | { kind: "there" }
  | { kind: "eta"; date: number }
  | { kind: "none" };

/**
 * When the trend line reaches six hours, if it's heading there.
 *
 * Only for a trend that has earned the claim — significant, climbing, and
 * arriving within three months. Anything else gets no date at all, because a
 * date printed on a phone is read as a promise.
 */
export function projectMilestone(
  points: NightPoint[],
  trend: NightTrend | null,
  target = THROUGH_THE_NIGHT_MS,
): Projection {
  if (!trend || !points.length) return { kind: "none" };
  if (trend.to >= target) return { kind: "there" };
  if (!trend.significant || trend.slopePerDay <= 0) return { kind: "none" };
  const days = (target - trend.to) / trend.slopePerDay;
  if (days > MAX_PROJECTION_DAYS) return { kind: "none" };
  const last = new Date(points[points.length - 1].evening);
  return { kind: "eta", date: addDays(last, Math.ceil(days)).getTime() };
}
