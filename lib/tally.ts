/**
 * The Grand Tally: everything she's done since day one, plus something to
 * measure it against.
 *
 * Raw lifetime totals stop meaning much quite quickly — "38,400 mL" is a number
 * nobody has intuition for. Each one is therefore paired with a comparison that
 * grows with her: a few cans of Coke now, a bathtub eventually. The ladders are
 * ordered, and the biggest rung she's passed is the one that gets shown, so the
 * comparison keeps changing on its own.
 */
import { coverageStart, startOfDay, totalsBetween } from "./daily";
import { clipSleep } from "./summary";
import type { EventsPayload } from "./types";

export type Tally = {
  milkMl: number;
  feeds: number;
  sleepMs: number;
  naps: number;
  diapers: number;
  dirtyDiapers: number;
  spitUps: number;
  fussies: number;
  notes: number;
  days: number;
  /**
   * Her average day, which is what the animal is matched against. Null until
   * there is a finished day of sleep to average.
   */
  sleepPerDayMs: number | null;
};

const POOPY = new Set(["poop", "both", "massive_blowout"]);

export function computeTally(data: EventsPayload, now: Date): Tally {
  const milkMl = data.feedings.reduce((s, f) => s + f.amount_ml, 0);

  let sleepMs = 0;
  let naps = 0;
  for (const nap of data.sleep) {
    const clipped = clipSleep(nap, 0, now.getTime());
    if (!clipped) continue;
    sleepMs += clipped.to - clipped.from;
    naps += 1;
  }

  const stamps = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((s) => new Date(s.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
  ];
  const first = stamps.length ? Math.min(...stamps) : now.getTime();

  // The average that picks the animal needs a denominator counting only days
  // sleep was actually being written down — the same rule the averages panel
  // follows, and for the same reason: a fortnight from before anyone logged
  // sleep would halve her average and drop her several animals. Today is left
  // out too, being partial; without that she would start every morning as a
  // rabbit and climb back to a hedgehog by bedtime.
  const sleepFrom = coverageStart(data, "sleep", now);
  const todayStart = startOfDay(now).getTime();
  const sleepDays = sleepFrom === null ? 0 : Math.round((todayStart - sleepFrom) / 86_400_000);

  return {
    sleepPerDayMs:
      sleepFrom !== null && sleepDays > 0
        ? totalsBetween(data, sleepFrom, todayStart).sleepMs / sleepDays
        : null,
    milkMl,
    feeds: data.feedings.length,
    sleepMs,
    naps,
    diapers: data.diapers.length,
    dirtyDiapers: data.diapers.filter((d) => POOPY.has(d.type)).length,
    spitUps: (data.moments ?? []).filter((m) => m.kind === "spit_up").length,
    fussies: (data.moments ?? []).filter((m) => m.kind === "fussy").length,
    notes: data.comments.length,
    days: Math.max(1, Math.ceil((now.getTime() - first) / 86_400_000)),
  };
}

// ---------------------------------------------------------------------------

type Rung = { at: number; label: string };

/** Ascending. The largest rung she has passed is the one worth mentioning. */
const VOLUME_LADDER: Rung[] = [
  { at: 355, label: "a can of Coke" },
  { at: 1_000, label: "a litre bottle" },
  { at: 2_000, label: "a big bottle of pop" },
  { at: 3_785, label: "a gallon of milk" },
  { at: 4_260, label: "a 12-pack of Coke" },
  { at: 8_520, label: "a 24-pack of Coke" },
  { at: 19_000, label: "a five-gallon water cooler" },
  { at: 50_000, label: "a car's fuel tank" },
  { at: 150_000, label: "a full bathtub" },
  { at: 750_000, label: "a hot tub" },
  { at: 5_000_000, label: "a backyard swimming pool" },
  { at: 2_500_000_000, label: "an Olympic swimming pool" },
];

/**
 * Who else sleeps like that.
 *
 * One animal per hour from twenty down to eight, so her average always lands on
 * exactly one and the match moves as she grows — she starts up near a koala and
 * works her way down the list over the first year, which is the whole point of
 * it. The figures are the usual cited daily averages and are not worth
 * defending to a decimal place; what matters is that the ladder is ordered and
 * that every hour in the range has somebody standing on it.
 */
export type Sleeper = { hours: number; name: string; article: string };

export const SLEEPERS: Sleeper[] = [
  { hours: 20, name: "koala", article: "a" },
  { hours: 19, name: "brown bat", article: "a" },
  { hours: 18, name: "hedgehog", article: "a" },
  { hours: 17, name: "armadillo", article: "an" },
  { hours: 16, name: "dormouse", article: "a" },
  { hours: 15, name: "sloth", article: "a" },
  { hours: 14, name: "squirrel", article: "a" },
  { hours: 13, name: "chipmunk", article: "a" },
  { hours: 12, name: "owl", article: "an" },
  { hours: 11, name: "raccoon", article: "a" },
  { hours: 10, name: "fox", article: "a" },
  { hours: 9, name: "badger", article: "a" },
  { hours: 8, name: "rabbit", article: "a" },
];

/**
 * The animal whose day is closest to hers.
 *
 * Clamped at both ends rather than left open: above twenty she is simply the
 * sleepiest thing on the list, and below eight something has gone wrong with
 * the logging rather than with her.
 */
export function sleeperFor(hoursPerDay: number): Sleeper {
  return SLEEPERS.reduce((best, s) =>
    Math.abs(s.hours - hoursPerDay) < Math.abs(best.hours - hoursPerDay) ? s : best,
  );
}

/**
 * A stacked diaper is close enough to an inch thick that the count and the
 * height in inches are the same number — which makes the arithmetic honest and
 * the ladder easy to sanity-check. Heights below are in inches.
 */
export const DIAPER_INCHES = 1;

const STACK_LADDER: Rung[] = [
  { at: 60, label: "a car" },
  { at: 120, label: "a single-story house" },
  { at: 396, label: "a three-story apartment block" },
  { at: 1_020, label: "an eight-story apartment complex" },
  { at: 2_160, label: "a fifteen-story building" },
  { at: 3_660, label: "the Statue of Liberty" },
  { at: 7_476, label: "One Kansas City Place" },
  { at: 12_996, label: "the Eiffel Tower" },
  { at: 17_448, label: "the Empire State Building" },
  { at: 21_312, label: "One World Trade Center" },
  { at: 32_604, label: "the Burj Khalifa" },
];

function rungFor(ladder: Rung[], value: number): Rung | null {
  let found: Rung | null = null;
  for (const rung of ladder) {
    if (value >= rung.at) found = rung;
    else break;
  }
  return found;
}

/** "2.4 × a can of Coke" reads badly; "about 2½ cans of Coke" doesn't fit either. */
function times(value: number, at: number): string {
  const n = value / at;
  if (n >= 10) return `${Math.round(n)}×`;
  if (n >= 2) return `${n.toFixed(1)}×`;
  return "";
}

export type Comparison = { headline: string; detail: string } | null;

export function milkComparison(milkMl: number): Comparison {
  if (milkMl <= 0) return null;
  const rung = rungFor(VOLUME_LADDER, milkMl);
  if (!rung) {
    // Not yet a full can — say how close, rather than nothing.
    const pct = Math.round((milkMl / VOLUME_LADDER[0].at) * 100);
    return { headline: `${pct}% of a can of Coke`, detail: "next up: a whole one" };
  }
  const multiple = times(milkMl, rung.at);
  const next = VOLUME_LADDER.find((r) => r.at > rung.at);
  return {
    headline: multiple ? `${multiple} ${rung.label}` : rung.label,
    detail: next ? `next up: ${next.label}` : "that's the whole ladder",
  };
}

/** Feet and inches, because nobody pictures "412 inches". */
function heightLabel(inches: number): string {
  const feet = Math.floor(inches / 12);
  const rest = Math.round(inches % 12);
  if (feet === 0) return `${rest} in`;
  return rest ? `${feet} ft ${rest} in` : `${feet} ft`;
}

/** Every diaper she's been through, stacked into one tower. */
export function diaperComparison(diapers: number): Comparison {
  if (diapers <= 0) return null;
  const inches = diapers * DIAPER_INCHES;
  const rung = rungFor(STACK_LADDER, inches);

  if (!rung) {
    return {
      headline: `${heightLabel(inches)} tall`,
      detail: `${STACK_LADDER[0].at - diapers} more to reach a car`,
    };
  }
  const multiple = times(inches, rung.at);
  const next = STACK_LADDER.find((r) => r.at > rung.at);
  return {
    headline: multiple ? `${multiple} ${rung.label}` : `as tall as ${rung.label}`,
    detail: next
      ? `${(next.at - inches).toLocaleString()} more to reach ${next.label}`
      : "nothing left to climb",
  };
}

/**
 * Not a total but a rate: the animal is about the shape of her day, so it takes
 * the per-day average rather than the lifetime sum. Null until a finished day
 * exists to average — with nothing to divide, "she sleeps like a rabbit" would
 * be a claim rather than a gap.
 */
export function sleepComparison(sleepPerDayMs: number | null): Comparison {
  if (sleepPerDayMs === null || sleepPerDayMs <= 0) return null;

  const hours = sleepPerDayMs / 3_600_000;
  const who = sleeperFor(hours);
  return {
    headline: `Sleeps like ${who.article} ${who.name}`,
    detail: `${hours.toFixed(1)} h a day · they get ${who.hours}`,
  };
}

