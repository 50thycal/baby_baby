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

export type DailyPoint = { dayStart: number; value: number };

/**
 * One finished day's total per point, oldest first.
 *
 * Today is deliberately absent. It is partial by definition, so plotting it
 * would put a dip at the right-hand end of every chart every single morning,
 * and a trend fitted through that dip would report a decline that isn't real.
 * The same rule the averages panel already follows.
 *
 * `days` is a cap, not a promise: a database three days old returns three
 * points however far back you ask.
 */
export function dailyTotals(
  data: EventsPayload,
  metric: Metric,
  now: Date,
  days: number | "all",
): DailyPoint[] {
  const todayStart = startOfDay(now).getTime();

  const earliest = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((s) => new Date(s.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
  ].sort((a, b) => a - b)[0];
  if (earliest === undefined) return [];

  const firstDay = startOfDay(new Date(earliest)).getTime();
  const available = Math.round((todayStart - firstDay) / 86_400_000);
  if (available < 1) return [];

  const wanted = days === "all" ? available : Math.min(days, available);

  const points: DailyPoint[] = [];
  for (let i = wanted; i >= 1; i--) {
    // Built with addDays rather than by subtracting milliseconds so the points
    // stay on local midnight across a daylight-saving change.
    const from = addDays(now, -i).getTime();
    const to = addDays(now, -i + 1).getTime();
    points.push({ dayStart: from, value: metricValue(totalsBetween(data, from, to), metric) });
  }
  return points;
}

export type Trend = {
  /** Change per day, in the metric's own unit. */
  slope: number;
  /** Fitted value at the first and last point — the line to draw. */
  from: number;
  to: number;
  /**
   * Whether the direction is worth saying out loud: is the whole fitted move
   * bigger than the day-to-day scatter it was drawn through?
   *
   * A least-squares line always has *some* slope, so without this every chart
   * announces a direction, and a run of ordinary days reads as a decline. The
   * comparison is against the standard deviation of the values themselves,
   * which means it scales with the metric — no per-chart threshold to tune,
   * and a noisy count is held to a higher bar than a steady one.
   */
  significant: boolean;
};

/**
 * Least-squares fit through the daily totals.
 *
 * Ordinary regression rather than a moving average: with a week of points a
 * moving average is nearly the raw line, and the question being asked here is
 * "which way is this going", which is exactly what a slope answers.
 *
 * Fewer than three points has no trend worth stating — two points always make
 * a perfectly straight line, and drawing one would dress noise up as direction.
 */
export function linearFit(points: DailyPoint[]): Trend | null {
  if (points.length < 3) return null;

  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;

  const slope = num / den;
  const intercept = meanY - slope * meanX;

  const variance = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0) / n;
  const spread = Math.sqrt(variance);
  const move = Math.abs(slope * (n - 1));

  return {
    slope,
    from: intercept,
    to: intercept + slope * (n - 1),
    // A perfectly flat series has no scatter and no slope; that's steady, not
    // significant, so the `> 0` guard keeps 0 >= 0 from claiming a direction.
    significant: move > 0 && move >= spread,
  };
}

export type SleepClock = {
  /**
   * One entry per slot from local midnight, each the share of the selected days
   * she was asleep during that slot. 1 means asleep then on every day of the
   * window, 0 means never.
   */
  slots: number[];
  /** How many finished days went into the average. */
  dayCount: number;
  slotMinutes: number;
};

/**
 * When in the day she actually sleeps, averaged across recent days.
 *
 * Folds every finished day onto one midnight-to-midnight axis and asks, for
 * each slot: on what share of those days was she asleep at this time? Totals
 * and averages say *how much* she sleeps; this is the only thing that says
 * *when*, which is the question you're really asking at 9pm.
 *
 * Finished days only, the same rule the trends follow. A partial today would
 * drag every slot after the current hour toward zero and make the afternoon
 * look like a time she never sleeps.
 */
export function sleepClock(
  data: EventsPayload,
  now: Date,
  days: number | "all",
  slotMinutes = 15,
): SleepClock {
  const slotMs = slotMinutes * 60_000;
  const slotCount = Math.round(86_400_000 / slotMs);
  const totals = new Array<number>(slotCount).fill(0);

  const todayStart = startOfDay(now).getTime();
  // How far back the log goes, not how far back *sleep* goes: a day when
  // nobody logged a nap is still a day, and it belongs in the denominator as a
  // day she wasn't recorded asleep. Same measure `dailyTotals` uses.
  const earliest = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((s) => new Date(s.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
  ].sort((a, b) => a - b)[0];
  if (earliest === undefined) return { slots: totals, dayCount: 0, slotMinutes };

  const firstDay = startOfDay(new Date(earliest)).getTime();
  const available = Math.round((todayStart - firstDay) / 86_400_000);
  if (available < 1) return { slots: totals, dayCount: 0, slotMinutes };

  const dayCount = days === "all" ? available : Math.min(days, available);

  for (let i = dayCount; i >= 1; i--) {
    const from = addDays(now, -i).getTime();
    const to = addDays(now, -i + 1).getTime();

    for (const nap of data.sleep) {
      const clipped = clipSleep(nap, from, to);
      if (!clipped) continue;

      // Offsets from that day's local midnight. A daylight-saving day is 23 or
      // 25 hours long; clamping to the 24-hour grid keeps the axis honest and
      // costs at most one hour, once or twice a year.
      const startOffset = clipped.from - from;
      const endOffset = clipped.to - from;
      const firstSlot = Math.max(0, Math.floor(startOffset / slotMs));
      const lastSlot = Math.min(slotCount - 1, Math.ceil(endOffset / slotMs) - 1);

      for (let s = firstSlot; s <= lastSlot; s++) {
        const overlap =
          Math.min(endOffset, (s + 1) * slotMs) - Math.max(startOffset, s * slotMs);
        if (overlap > 0) totals[s] += overlap;
      }
    }
  }

  return {
    // Clamped: two sleep sessions can overlap if someone edited one to run
    // across another, and a bar past 100% would draw outside the chart.
    slots: totals.map((ms) => Math.min(1, ms / (slotMs * dayCount))),
    dayCount,
    slotMinutes,
  };
}

export type ClockWindow = { fromSlot: number; toSlot: number; slotCount: number };

/**
 * The longest stretch she's usually asleep for.
 *
 * Scanned circularly, because the answer is nearly always a night — a run from
 * 22:00 to 05:00 is one stretch, and a scan that stopped at the end of the
 * array would report it as two short ones and pick the wrong stretch as the
 * longest.
 *
 * `toSlot` is exclusive and may be less than `fromSlot` when the run wraps.
 */
export function typicalSleepWindow(fractions: number[], threshold = 0.5): ClockWindow | null {
  const n = fractions.length;
  if (n === 0) return null;

  const asleep = fractions.map((f) => f >= threshold);
  if (asleep.every((a) => !a)) return null;
  if (asleep.every((a) => a)) return { fromSlot: 0, toSlot: n, slotCount: n };

  // Start from a slot that begins a run, so no run is split by the array's end.
  const start = asleep.findIndex((a, i) => a && !asleep[(i - 1 + n) % n]);

  let best: ClockWindow | null = null;
  let i = 0;
  while (i < n) {
    const at = (start + i) % n;
    if (!asleep[at]) {
      i++;
      continue;
    }
    let len = 0;
    while (len < n && asleep[(start + i + len) % n]) len++;
    if (!best || len > best.slotCount) {
      best = { fromSlot: at, toSlot: (at + len) % n, slotCount: len };
    }
    i += len;
  }
  return best;
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
