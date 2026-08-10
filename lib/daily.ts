/**
 * Per-calendar-day arithmetic for the dashboards.
 *
 * Everything here works in the reader's local time. A rolling 24-hour window
 * can't answer "how is she doing today" — at 9am it's still mostly yesterday —
 * so the summary is anchored to local midnight instead, and the comparison is
 * against the same point in yesterday rather than yesterday's finished total.
 * Comparing a half-finished day to a whole one is the easiest way to convince
 * yourself something is wrong when it isn't.
 */
import { clipSleep } from "./summary";
import type { DiaperType, EventsPayload } from "./types";

export type DayTotals = {
  feedingMl: number;
  feedCount: number;
  sleepMs: number;
  diaperCount: number;
  poopCount: number;
};

export type Metric = "feed_ml" | "feed_count" | "sleep_ms" | "diaper_count" | "poop_count";

/** Anything that isn't purely wet counts as a poop. */
const POOPY: DiaperType[] = ["poop", "both", "massive_blowout"];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Totals for an arbitrary window. Sleep is clipped to it. */
export function totalsBetween(data: EventsPayload, from: number, to: number): DayTotals {
  let feedingMl = 0;
  let feedCount = 0;
  for (const f of data.feedings) {
    const t = new Date(f.ts).getTime();
    if (t >= from && t < to) {
      feedingMl += f.amount_ml;
      feedCount += 1;
    }
  }

  let sleepMs = 0;
  for (const nap of data.sleep) {
    const clipped = clipSleep(nap, from, to);
    if (clipped) sleepMs += clipped.to - clipped.from;
  }

  let diaperCount = 0;
  let poopCount = 0;
  for (const d of data.diapers) {
    const t = new Date(d.ts).getTime();
    if (t >= from && t < to) {
      diaperCount += 1;
      if (POOPY.includes(d.type)) poopCount += 1;
    }
  }

  return { feedingMl, feedCount, sleepMs, diaperCount, poopCount };
}

export type TodayComparison = {
  today: DayTotals;
  /** Yesterday up to the same clock time — the honest like-for-like. */
  yesterdaySoFar: DayTotals;
  /** Yesterday's finished day, for context. */
  yesterdayFull: DayTotals;
  /** Milliseconds elapsed since local midnight. */
  elapsedMs: number;
};

export function compareToYesterday(data: EventsPayload, now: Date): TodayComparison {
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = addDays(now, -1).getTime();
  const elapsedMs = now.getTime() - todayStart;

  return {
    today: totalsBetween(data, todayStart, now.getTime()),
    yesterdaySoFar: totalsBetween(data, yesterdayStart, yesterdayStart + elapsedMs),
    yesterdayFull: totalsBetween(data, yesterdayStart, todayStart),
    elapsedMs,
  };
}

function metricValue(totals: DayTotals, metric: Metric): number {
  switch (metric) {
    case "feed_ml":
      return totals.feedingMl;
    case "feed_count":
      return totals.feedCount;
    case "sleep_ms":
      return totals.sleepMs;
    case "diaper_count":
      return totals.diaperCount;
    case "poop_count":
      return totals.poopCount;
  }
}

/**
 * Running total across a day, sampled on a fixed grid so two days can be drawn
 * on the same axis and read against each other. Feeds step, sleep ramps; a
 * uniform grid renders both without special-casing either.
 */
export function cumulativeSeries(
  data: EventsPayload,
  dayStart: number,
  metric: Metric,
  stepMs = 10 * 60_000,
  upToMs = 24 * 3600_000,
): number[] {
  const points: number[] = [];
  for (let offset = 0; offset <= upToMs; offset += stepMs) {
    points.push(metricValue(totalsBetween(data, dayStart, dayStart + offset), metric));
  }
  return points;
}

export type Stats = {
  days: number;
  feedsPerDay: number | null;
  mlPerDay: number | null;
  avgFeedMl: number | null;
  avgBetweenFeedsMs: number | null;
  sleepPerDayMs: number | null;
  awakePerDayMs: number | null;
  avgNapMs: number | null;
  avgAwakeStretchMs: number | null;
  longestSleepMs: number;
  napsPerDay: number | null;
  diapersPerDay: number | null;
  poopsPerDay: number | null;
  nightFeedsPerNight: number | null;
};

/** Feeds logged between 10pm and 6am — the ones you actually feel. */
const NIGHT_FROM = 22;
const NIGHT_TO = 6;

/**
 * Averages over whole days only. Today is excluded: it is partial by
 * definition, and folding a half day into a per-day mean drags every figure
 * down for no reason.
 */
export function computeStats(data: EventsPayload, now: Date): Stats {
  const todayStart = startOfDay(now).getTime();
  const earliest = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((s) => new Date(s.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
  ].sort((a, b) => a - b)[0];

  const empty: Stats = {
    days: 0,
    feedsPerDay: null,
    mlPerDay: null,
    avgFeedMl: null,
    avgBetweenFeedsMs: null,
    sleepPerDayMs: null,
    awakePerDayMs: null,
    avgNapMs: null,
    avgAwakeStretchMs: null,
    longestSleepMs: 0,
    napsPerDay: null,
    diapersPerDay: null,
    poopsPerDay: null,
    nightFeedsPerNight: null,
  };
  if (earliest === undefined) return empty;

  const firstFullDay = startOfDay(new Date(earliest)).getTime();
  const days = Math.round((todayStart - firstFullDay) / 86_400_000);
  if (days < 1) return { ...empty, days: 0 };

  const window = totalsBetween(data, firstFullDay, todayStart);

  // Feed spacing, across complete days only.
  const feedTimes = data.feedings
    .map((f) => new Date(f.ts).getTime())
    .filter((t) => t >= firstFullDay && t < todayStart)
    .sort((a, b) => a - b);
  const avgBetweenFeedsMs =
    feedTimes.length >= 2
      ? (feedTimes[feedTimes.length - 1] - feedTimes[0]) / (feedTimes.length - 1)
      : null;

  // Naps, and the gaps between them.
  const naps = data.sleep
    .map((s) => clipSleep(s, firstFullDay, todayStart))
    .filter((x): x is { from: number; to: number } => x !== null)
    .sort((a, b) => a.from - b.from);
  const napDurations = naps.map((n) => n.to - n.from);
  const awakeGaps: number[] = [];
  for (let i = 1; i < naps.length; i++) {
    const gap = naps[i].from - naps[i - 1].to;
    if (gap > 0) awakeGaps.push(gap);
  }

  const nightFeeds = feedTimes.filter((t) => {
    const h = new Date(t).getHours();
    return h >= NIGHT_FROM || h < NIGHT_TO;
  }).length;

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  return {
    days,
    feedsPerDay: window.feedCount / days,
    mlPerDay: window.feedingMl / days,
    avgFeedMl: window.feedCount ? window.feedingMl / window.feedCount : null,
    avgBetweenFeedsMs,
    sleepPerDayMs: window.sleepMs / days,
    awakePerDayMs: 86_400_000 - window.sleepMs / days,
    avgNapMs: mean(napDurations),
    avgAwakeStretchMs: mean(awakeGaps),
    longestSleepMs: napDurations.length ? Math.max(...napDurations) : 0,
    napsPerDay: naps.length / days,
    diapersPerDay: window.diaperCount / days,
    poopsPerDay: window.poopCount / days,
    nightFeedsPerNight: nightFeeds / days,
  };
}
