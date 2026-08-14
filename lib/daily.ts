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

/** Which log a metric is drawn from — see `coverageStart`. */
export type LogKind = "feedings" | "sleep" | "diapers";

export function metricKind(metric: Metric): LogKind {
  switch (metric) {
    case "feed_ml":
    case "feed_count":
      return "feedings";
    case "sleep_ms":
      return "sleep";
    case "diaper_count":
    case "poop_count":
      return "diapers";
  }
}

/**
 * A day with no entries in the first four hours wasn't being watched from
 * midnight. A newborn feeds, sleeps and fills nappies right through the small
 * hours, so a genuine full day of logging always has *something* before 4am;
 * if the first record lands at two in the afternoon, logging started at two in
 * the afternoon.
 */
const LATE_START_MS = 4 * 3_600_000;

const nextDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
};

/** When each kind of record first covers a day, and from what moment in it. */
function firstRecordIn(data: EventsPayload, kind: LogKind, from: number, to: number): number | null {
  if (kind === "sleep") {
    // A nap that began the previous evening covers this day from midnight, so
    // the clipped start is the honest answer rather than `sleep_start`.
    const starts = data.sleep
      .map((s) => clipSleep(s, from, to))
      .filter((x): x is { from: number; to: number } => x !== null)
      .map((x) => x.from);
    return starts.length ? Math.min(...starts) : null;
  }
  const rows = kind === "feedings" ? data.feedings : data.diapers;
  const times = rows.map((r) => new Date(r.ts).getTime()).filter((t) => t >= from && t < to);
  return times.length ? Math.min(...times) : null;
}

/**
 * The first day this kind of record can be read as a whole day.
 *
 * The three logs didn't all start on the same day: feeds were written down from
 * birth, sleep and nappies weeks later. Counting a day as "0 hours of sleep"
 * because nobody was writing sleep down yet isn't a quiet day, it's no data —
 * and averaged in, or fitted through, it invents a climb that never happened.
 *
 * So each metric begins where its own log begins, and the first day is dropped
 * too if that day was only half watched. Only the leading edge is trimmed: a
 * gap in the middle is a day someone forgot, which is real and stays a zero.
 *
 * Returns null when that kind has never been logged at all.
 */
export function coverageStart(data: EventsPayload, kind: LogKind, now: Date): number | null {
  const todayStart = startOfDay(now).getTime();

  const stamps =
    kind === "sleep"
      ? data.sleep.map((s) => new Date(s.sleep_start).getTime())
      : (kind === "feedings" ? data.feedings : data.diapers).map((r) => new Date(r.ts).getTime());
  if (!stamps.length) return null;

  const firstDay = startOfDay(new Date(Math.min(...stamps))).getTime();
  if (firstDay >= todayStart) return null;

  const covered = firstRecordIn(data, kind, firstDay, nextDay(firstDay));
  if (covered === null) return nextDay(firstDay);

  return covered - firstDay > LATE_START_MS ? nextDay(firstDay) : firstDay;
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

  // Not "since the log began" but "since *this* log began": feeds were written
  // down from birth, sleep and nappies later, and a run of zeroes from before
  // anyone was recording sleep would drag the fitted line into a climb that
  // never happened.
  const firstDay = coverageStart(data, metricKind(metric), now);
  if (firstDay === null) return [];

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
  // Days before anyone was writing sleep down aren't days she was awake — they
  // are days with no data, and averaging them in flattens every band. Days
  // *after* that with nothing logged are kept: those are days someone forgot,
  // which is a real thing that happened.
  const firstDay = coverageStart(data, "sleep", now);
  if (firstDay === null) return { slots: totals, dayCount: 0, slotMinutes };

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

/** Which slot of the clock a moment falls in. */
export function slotAt(clock: SleepClock, at: Date): number {
  const minutes = at.getHours() * 60 + at.getMinutes();
  return Math.min(clock.slots.length - 1, Math.floor(minutes / clock.slotMinutes));
}

/**
 * The share of recent days she was asleep at this time of day.
 *
 * A base rate, not a live reading: it says "on 3 of the last 4 days she was
 * down at half nine", which is the useful thing to know when you're deciding
 * whether to start the bedtime routine. It does not know whether she is
 * actually asleep right now — the Log screen answers that, and answers it from
 * a fact rather than a frequency.
 *
 * Null when there are no finished days to average, rather than 0: no data is
 * not the same claim as "never".
 */
export function oddsAsleepAt(clock: SleepClock, at: Date): number | null {
  if (clock.dayCount === 0) return null;
  return clock.slots[slotAt(clock, at)] ?? null;
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
  /** The widest of the three windows below — 0 means nothing to average yet. */
  days: number;
  /** Whole days each log has actually covered. They differ; see `coverageStart`. */
  feedDays: number;
  sleepDays: number;
  diaperDays: number;
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
 *
 * Each of the three groups is divided by its *own* number of covered days. The
 * logs didn't start together, and a shared denominator would report her sleeping
 * nine hours a day purely because the weeks before anyone wrote sleep down are
 * still in the divisor — while the chart directly above says seventeen. Same
 * screen, same baby, two answers.
 */
export function computeStats(data: EventsPayload, now: Date): Stats {
  const todayStart = startOfDay(now).getTime();

  const spanOf = (kind: LogKind) => {
    const from = coverageStart(data, kind, now);
    if (from === null) return { from: todayStart, days: 0 };
    return { from, days: Math.max(0, Math.round((todayStart - from) / 86_400_000)) };
  };

  const feed = spanOf("feedings");
  const sleep = spanOf("sleep");
  const diaper = spanOf("diapers");

  const empty: Stats = {
    days: 0,
    feedDays: 0,
    sleepDays: 0,
    diaperDays: 0,
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
  const days = Math.max(feed.days, sleep.days, diaper.days);
  if (days < 1) return empty;

  const feedWindow = totalsBetween(data, feed.from, todayStart);
  const sleepWindow = totalsBetween(data, sleep.from, todayStart);
  const diaperWindow = totalsBetween(data, diaper.from, todayStart);

  // Feed spacing, across complete days only.
  const feedTimes = data.feedings
    .map((f) => new Date(f.ts).getTime())
    .filter((t) => t >= feed.from && t < todayStart)
    .sort((a, b) => a - b);
  const avgBetweenFeedsMs =
    feedTimes.length >= 2
      ? (feedTimes[feedTimes.length - 1] - feedTimes[0]) / (feedTimes.length - 1)
      : null;

  // Naps, and the gaps between them.
  const naps = data.sleep
    .map((s) => clipSleep(s, sleep.from, todayStart))
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
  /** A rate needs days to divide by; without them there is no answer, not zero. */
  const per = (total: number, over: number) => (over > 0 ? total / over : null);

  return {
    days,
    feedDays: feed.days,
    sleepDays: sleep.days,
    diaperDays: diaper.days,
    feedsPerDay: per(feedWindow.feedCount, feed.days),
    mlPerDay: per(feedWindow.feedingMl, feed.days),
    avgFeedMl: feedWindow.feedCount ? feedWindow.feedingMl / feedWindow.feedCount : null,
    avgBetweenFeedsMs,
    sleepPerDayMs: per(sleepWindow.sleepMs, sleep.days),
    awakePerDayMs: sleep.days > 0 ? 86_400_000 - sleepWindow.sleepMs / sleep.days : null,
    avgNapMs: mean(napDurations),
    avgAwakeStretchMs: mean(awakeGaps),
    longestSleepMs: napDurations.length ? Math.max(...napDurations) : 0,
    napsPerDay: per(naps.length, sleep.days),
    diapersPerDay: per(diaperWindow.diaperCount, diaper.days),
    poopsPerDay: per(diaperWindow.poopCount, diaper.days),
    nightFeedsPerNight: per(nightFeeds, feed.days),
  };
}
