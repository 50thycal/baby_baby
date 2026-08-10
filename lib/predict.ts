/**
 * Forecasts from her own recent history.
 *
 * Three rules run through all of this.
 *
 * Ranges, never points. "3:15pm" claims a precision that isn't there; "between
 * 2:45 and 3:35" is the same information told honestly, and it stays true on the
 * days she's unpredictable instead of being quietly wrong.
 *
 * Quartiles, not means. A cluster-feeding evening or one missed log would drag
 * an average around badly. The 25th–75th percentile is the middle half of what
 * she actually does, and it shrugs off both.
 *
 * Refuse rather than guess. Every function returns null below a minimum sample
 * size. A newborn's patterns also move fast, so nothing older than five days is
 * counted — a fortnight ago is a different baby.
 */
import { startOfDay } from "./daily";
import type { EventsPayload, Feeding, SleepSession } from "./types";

const DAY = 86_400_000;
/** Older than this and it isn't her current pattern any more. */
const LOOKBACK_MS = 5 * DAY;

const MIN_GAPS = 5;
const MIN_FEEDS = 5;
const MIN_SLEEPS = 3;
const MIN_DAYS = 2;

/**
 * No forecast here is good to the minute, so no window is allowed to be
 * narrower than this. Very regular days collapse the quartiles onto a single
 * value, which would render as "5:00 – 5:00" — a point estimate wearing a
 * range's clothes, and precisely what these functions exist to avoid.
 */
const MIN_WINDOW_MS = 40 * 60_000;

/** Widens a quartile pair around its midpoint until it spans MIN_WINDOW_MS. */
function widen(low: number, high: number): [number, number] {
  const span = high - low;
  if (span >= MIN_WINDOW_MS) return [low, high];
  const mid = (low + high) / 2;
  return [mid - MIN_WINDOW_MS / 2, mid + MIN_WINDOW_MS / 2];
}

/** Linear-interpolated quantile over an ascending array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const asc = (xs: number[]) => [...xs].sort((a, b) => a - b);

// ---------------------------------------------------------------------------

export type FeedWindow = {
  /** Earliest and latest of the usual gap, as absolute times. */
  from: Date;
  to: Date;
  /** The gap itself, for phrasing like "usually 2h30–3h20 apart". */
  lowMs: number;
  highMs: number;
  lastFeedAt: Date;
  /** Past the far end of the window — she's gone longer than usual. */
  overdue: boolean;
  samples: number;
};

/** When the next feed is likely, from the spread of her recent gaps. */
export function nextFeedWindow(
  feedings: Feeding[],
  now: Date,
  lookbackMs = LOOKBACK_MS,
): FeedWindow | null {
  const times = feedings
    .map((f) => new Date(f.ts).getTime())
    .filter((t) => t <= now.getTime() && t >= now.getTime() - lookbackMs)
    .sort((a, b) => a - b);
  if (times.length < MIN_GAPS + 1) return null;

  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);

  const sorted = asc(gaps);
  const [lowMs, highMs] = widen(quantile(sorted, 0.25), quantile(sorted, 0.75));
  const last = times[times.length - 1];

  return {
    from: new Date(last + lowMs),
    to: new Date(last + highMs),
    lowMs,
    highMs,
    lastFeedAt: new Date(last),
    overdue: now.getTime() > last + highMs,
    samples: gaps.length,
  };
}

// ---------------------------------------------------------------------------

export type AmountHint = {
  lowMl: number;
  highMl: number;
  medianMl: number;
  /** Comparing the recent half against the earlier half of the window. */
  trend: "up" | "down" | "steady";
  samples: number;
};

/** Only call it a trend if the middle has moved by more than this. */
const TREND_THRESHOLD = 0.12;

export function likelyAmount(
  feedings: Feeding[],
  now: Date,
  lookbackMs = LOOKBACK_MS,
): AmountHint | null {
  const recent = feedings
    .filter((f) => {
      const t = new Date(f.ts).getTime();
      return t <= now.getTime() && t >= now.getTime() - lookbackMs;
    })
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  if (recent.length < MIN_FEEDS) return null;

  const amounts = recent.map((f) => f.amount_ml);
  const sorted = asc(amounts);

  // Split the window in half and compare the middles; a mean would swing on one
  // unusually big bottle.
  const mid = Math.floor(amounts.length / 2);
  const earlier = quantile(asc(amounts.slice(0, mid)), 0.5);
  const later = quantile(asc(amounts.slice(mid)), 0.5);
  const change = earlier > 0 ? (later - earlier) / earlier : 0;

  return {
    lowMl: Math.round(quantile(sorted, 0.25)),
    highMl: Math.round(quantile(sorted, 0.75)),
    medianMl: Math.round(quantile(sorted, 0.5)),
    trend: change > TREND_THRESHOLD ? "up" : change < -TREND_THRESHOLD ? "down" : "steady",
    samples: amounts.length,
  };
}

// ---------------------------------------------------------------------------

export type WakeWindow = {
  from: Date;
  to: Date;
  lowMs: number;
  highMs: number;
  overdue: boolean;
  samples: number;
  /** Which pool the estimate came from, so the caption can say so. */
  kind: "night" | "nap";
};

/** Anything starting in these hours is treated as the night sleep. */
const NIGHT_START = 19;
const NIGHT_END = 6;

const isNight = (d: Date) => d.getHours() >= NIGHT_START || d.getHours() < NIGHT_END;

/**
 * When she's likely to wake, from how long her sleeps usually run.
 *
 * Naps and night sleep are pooled separately — an hour-long afternoon nap and a
 * five-hour night stretch averaged together describe neither. Of the four
 * forecasts this is the softest: newborn sleep varies enormously, so the window
 * is wide by construction and should be read as such.
 */
export function wakeWindow(
  sleep: SleepSession[],
  active: SleepSession,
  now: Date,
  lookbackMs = 7 * DAY,
): WakeWindow | null {
  const startedAt = new Date(active.sleep_start);
  const kind = isNight(startedAt) ? "night" : "nap";

  const durations = sleep
    .filter((s) => s.sleep_end !== null && s.id !== active.id)
    .filter((s) => new Date(s.sleep_start).getTime() >= now.getTime() - lookbackMs)
    .filter((s) => (isNight(new Date(s.sleep_start)) ? "night" : "nap") === kind)
    .map((s) => new Date(s.sleep_end!).getTime() - new Date(s.sleep_start).getTime())
    .filter((ms) => ms > 0);

  if (durations.length < MIN_SLEEPS) return null;

  const sorted = asc(durations);
  const [lowMs, highMs] = widen(quantile(sorted, 0.25), quantile(sorted, 0.75));
  const start = startedAt.getTime();

  return {
    from: new Date(start + lowMs),
    to: new Date(start + highMs),
    lowMs,
    highMs,
    overdue: now.getTime() > start + highMs,
    samples: durations.length,
    kind,
  };
}

// ---------------------------------------------------------------------------

export type DayPace = {
  todayMl: number;
  /** What she'd typically have taken by this time of day. */
  expectedByNowMl: number;
  /** What a whole day usually comes to. */
  typicalFullDayMl: number;
  days: number;
  /** Positive means ahead of the usual pace. */
  deltaMl: number;
};

/**
 * Today against the usual shape of a day.
 *
 * The comparison is against the same *time of day* across recent complete days,
 * not against their finished totals — otherwise every morning reads as far
 * behind, which is true and useless.
 */
export function dayPace(
  data: EventsPayload,
  now: Date,
  lookbackDays = 5,
): DayPace | null {
  const todayStart = startOfDay(now).getTime();
  const elapsed = now.getTime() - todayStart;

  const feeds = data.feedings.map((f) => ({
    t: new Date(f.ts).getTime(),
    ml: f.amount_ml,
  }));

  const byNow: number[] = [];
  const fullDays: number[] = [];
  for (let d = 1; d <= lookbackDays; d++) {
    const dayStart = todayStart - d * DAY;
    // Skip days with nothing logged; they're gaps in the record, not fasting.
    const total = feeds
      .filter((f) => f.t >= dayStart && f.t < dayStart + DAY)
      .reduce((s, f) => s + f.ml, 0);
    if (total === 0) continue;
    fullDays.push(total);
    byNow.push(
      feeds.filter((f) => f.t >= dayStart && f.t < dayStart + elapsed).reduce((s, f) => s + f.ml, 0),
    );
  }
  if (fullDays.length < MIN_DAYS) return null;

  const todayMl = feeds
    .filter((f) => f.t >= todayStart && f.t <= now.getTime())
    .reduce((s, f) => s + f.ml, 0);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const expectedByNowMl = Math.round(mean(byNow));

  return {
    todayMl,
    expectedByNowMl,
    typicalFullDayMl: Math.round(mean(fullDays)),
    days: fullDays.length,
    deltaMl: todayMl - expectedByNowMl,
  };
}
