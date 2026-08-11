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

  return {
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
 * Walking distance from Kansas City at an amble, so the sleep total turns into
 * somewhere you'd have got to. Miles from KC, roughly.
 */
export const WALK_MPH = 2;

const PLACE_LADDER: Rung[] = [
  { at: 12, label: "Lenexa" },
  { at: 30, label: "Lawrence" },
  { at: 60, label: "Topeka" },
  { at: 125, label: "Columbia" },
  { at: 185, label: "Omaha" },
  { at: 250, label: "St. Louis" },
  { at: 320, label: "Wichita and back" },
  { at: 375, label: "Sioux Falls" },
  { at: 440, label: "Minneapolis" },
  { at: 510, label: "Chicago" },
  { at: 600, label: "Denver" },
  { at: 800, label: "Mount Rushmore" },
  { at: 1_200, label: "New York City" },
  { at: 1_600, label: "Los Angeles" },
  { at: 1_850, label: "Seattle" },
];

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

export function sleepComparison(sleepMs: number): Comparison {
  const hours = sleepMs / 3_600_000;
  const miles = hours * WALK_MPH;
  if (miles < 1) return null;

  const rung = rungFor(PLACE_LADDER, miles);
  const next = rung ? PLACE_LADDER.find((r) => r.at > rung.at) : PLACE_LADDER[0];
  return {
    headline: rung
      ? `walked past ${rung.label}`
      : `${Math.round(miles)} miles out of Kansas City`,
    detail: next ? `${Math.round(next.at - miles)} more miles to ${next.label}` : "coast to coast",
  };
}
