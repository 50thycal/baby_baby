/**
 * The daily question: one prediction a day, about tomorrow.
 *
 * Betting is always open — anyone can open the app at any hour and call it —
 * because the question is always about a day that hasn't started yet. It locks
 * at that day's midnight, plays out live through the day, and settles itself
 * from the log at the following midnight. A question about *today* that stayed
 * open all day would just reward whoever bet last.
 *
 * Everything here is pure, so the server (which enforces the lock and freezes
 * each day's question) and every phone (which draws the cards and the
 * leaderboard) reach the same answer from the same rows. Nothing about a
 * result is stored: it is recomputed from the log every time, so correcting a
 * mis-logged feed corrects the bet with it.
 *
 * "Tomorrow" and "midnight" are wall-clock ideas and the server runs in UTC,
 * so each day carries the time zone of the phone that first asked for it, and
 * every boundary below is computed in that zone.
 */
import { clipSleep } from "./summary";
import { HOUR, MINUTE } from "./time";
import type { EventsPayload } from "./types";

/** `YYYY-MM-DD` — the local date the question is about. */
export type DayKey = string;

export type Person = { id: string; name: string };

// ---------------------------------------------------------------------------
// The questions.

/**
 * How an answer is given and judged.
 *
 * - `closest`: name a figure; nearest wins.
 * - `overunder`: a line set from her own past week, so it's close to a coin
 *   flip; pick a side.
 * - `yesno`: will it happen at all.
 * - `person`: which of the family.
 */
export type Format = "closest" | "overunder" | "yesno" | "person";

/** What the figure is measured in, which decides how it's shown and entered. */
export type Unit = "ml" | "count" | "duration" | "clock";

/** Which log a question reads, so it's only asked once that log is in use. */
type Source = "feedings" | "sleep" | "diapers" | "moments" | "people";

export type KindId =
  | "milk_total"
  | "feeds_count"
  | "diapers_count"
  | "dirty_count"
  | "longest_sleep"
  | "sleep_total"
  | "biggest_feed"
  | "first_poop"
  | "blowout"
  | "spit_up"
  | "six_hours"
  | "top_logger";

export type Kind = {
  id: KindId;
  format: Format;
  /** Figures are in mL, a count, minutes, or minutes after midnight. */
  unit: Unit;
  /** The question as asked. `{line}` is filled in for over/under. */
  ask: string;
  /** A few words, for the history list. */
  short: string;
  source: Source;
  /** `closest` only: within this much of the actual is a bullseye. */
  bullseye?: number;
  /** `closest` only: the stepper's small and large steps, and its range. */
  steps?: [number, number];
  range?: [number, number];
};

export const KINDS: Kind[] = [
  {
    id: "milk_total",
    format: "closest",
    unit: "ml",
    ask: "How much milk will she drink?",
    short: "Milk total",
    source: "feedings",
    bullseye: 25,
    steps: [10, 50],
    range: [0, 3000],
  },
  {
    id: "feeds_count",
    format: "overunder",
    unit: "count",
    ask: "Over or under {line} feeds?",
    short: "Feeds",
    source: "feedings",
  },
  {
    id: "diapers_count",
    format: "closest",
    unit: "count",
    ask: "How many diapers?",
    short: "Diapers",
    source: "diapers",
    bullseye: 0,
    steps: [1, 5],
    range: [0, 40],
  },
  {
    id: "dirty_count",
    format: "overunder",
    unit: "count",
    ask: "Over or under {line} dirty diapers?",
    short: "Dirty diapers",
    source: "diapers",
  },
  {
    id: "longest_sleep",
    format: "closest",
    unit: "duration",
    ask: "How long will her longest sleep be?",
    short: "Longest sleep",
    source: "sleep",
    bullseye: 15,
    steps: [15, 60],
    range: [15, 16 * 60],
  },
  {
    id: "sleep_total",
    format: "overunder",
    unit: "duration",
    ask: "Over or under {line} of sleep?",
    short: "Total sleep",
    source: "sleep",
  },
  {
    id: "biggest_feed",
    format: "closest",
    unit: "ml",
    ask: "How big will her biggest bottle be?",
    short: "Biggest bottle",
    source: "feedings",
    bullseye: 5,
    steps: [5, 20],
    range: [0, 400],
  },
  {
    id: "first_poop",
    format: "closest",
    unit: "clock",
    ask: "What time is the first poop?",
    short: "First poop",
    source: "diapers",
    bullseye: 15,
    steps: [15, 60],
    range: [0, 24 * 60 - 1],
  },
  {
    id: "blowout",
    format: "yesno",
    unit: "count",
    ask: "Any blowouts?",
    short: "Blowout",
    source: "diapers",
  },
  {
    id: "spit_up",
    format: "yesno",
    unit: "count",
    ask: "Any big spit-ups?",
    short: "Spit-up",
    source: "moments",
  },
  {
    id: "six_hours",
    format: "yesno",
    unit: "duration",
    ask: "Will she sleep 6 hours straight?",
    short: "6 hours straight",
    source: "sleep",
  },
  {
    id: "top_logger",
    format: "person",
    unit: "count",
    ask: "Who'll log the most?",
    short: "Top logger",
    source: "people",
  },
];

export function kindById(id: string): Kind | undefined {
  return KINDS.find((k) => k.id === id);
}

/** A good stretch, for `six_hours`. */
export const GOOD_STRETCH_MS = 6 * HOUR;

/** Baby baby points. Worth exactly nothing; argued over endlessly. */
export const BBP = {
  /** Called a yes/no, an over/under or a person right. */
  correct: 10,
  /** …when most of the family called it wrong. */
  underdog: 5,
  /** Nearest figure. Needs two or more guessers. */
  nearest: 10,
  /** Second nearest. Needs three or more. */
  runnerUp: 5,
  /** Within a hair of the real figure, whoever else played. */
  bullseye: 5,
} as const;

// ---------------------------------------------------------------------------
// Time zones, without a library. `Intl` knows every zone's rules; it just only
// answers in one direction (instant → wall clock), so the other direction is
// solved by asking twice.

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(ms: number, tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const { type, value } of f.formatToParts(new Date(ms))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/** How far the zone's wall clock is ahead of UTC at this instant. */
function offsetAt(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The instant a wall clock in `tz` reads `hour`:00 on `key` plus `dayOffset`
 * days. Guess with the offset at the naive instant, then correct once with the
 * offset at the guess — which is what lands a daylight-saving day right.
 */
export function zonedInstant(key: DayKey, dayOffset: number, hour: number, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d + dayOffset, hour);
  const first = wall - offsetAt(wall, tz);
  return new Date(wall - offsetAt(first, tz));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The date on the wall in `tz` right now. */
export function currentDay(now: Date, tz: string): DayKey {
  const w = wallClock(now.getTime(), tz);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
}

/** The only day that can be bet on: tomorrow. */
export function openDay(now: Date, tz: string): DayKey {
  return shiftDay(currentDay(now, tz), 1);
}

export function shiftDay(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftDay(value, 0) === value; // rejects 2026-02-31
}

export type DayWindow = { key: DayKey; from: Date; to: Date };

/** Midnight to midnight, in the day's own zone. Betting locks at `from`. */
export function dayWindow(key: DayKey, tz: string): DayWindow {
  return { key, from: zonedInstant(key, 0, 0, tz), to: zonedInstant(key, 1, 0, tz) };
}

// ---------------------------------------------------------------------------
// Which question, which day.

/** A small seeded PRNG — enough to shuffle twelve cards the same way everywhere. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function dayNumber(key: DayKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** The deck for one cycle, arranged so a cycle never starts with the card the last one ended on. */
function cycleOrder(cycle: number): KindId[] {
  const ids = KINDS.map((k) => k.id);
  const order = shuffled(ids, cycle + 1);
  const prev = shuffled(ids, cycle);
  if (order[0] === prev[prev.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/**
 * The question for a day.
 *
 * The pool is dealt like a deck: shuffled once per cycle of `KINDS.length`
 * days, so every question comes round once before any repeats, and the order
 * still feels random. A question whose log isn't in use yet — no spit-ups ever
 * written down, only one person with a name — is skipped for the next card.
 */
export function pickKind(key: DayKey, available: (kind: Kind) => boolean): Kind {
  const n = dayNumber(key);
  const len = KINDS.length;
  const cycle = Math.floor(n / len);
  const order = cycleOrder(cycle);
  const start = ((n % len) + len) % len;
  for (let i = 0; i < len; i++) {
    const kind = kindById(order[(start + i) % len])!;
    if (available(kind)) return kind;
  }
  return KINDS[0];
}

// ---------------------------------------------------------------------------
// Watching a day play out.

const POOPY = new Set(["poop", "both", "massive_blowout"]);

export type Observation = {
  /**
   * The figure so far, in the kind's unit. For `first_poop`, null until there
   * has been one. For `top_logger`, the leader's count.
   */
  value: number | null;
  /** The figure can no longer change. */
  done: boolean;
  /** Nothing at all was logged for this question's source: no contest. */
  empty: boolean;
  /** A sleep that belongs to this day is still going. */
  running: boolean;
  /** `top_logger`: who's ahead, by name. */
  leaders: string[];
};

const ts = (s: string) => new Date(s).getTime();

/**
 * What the log says about one kind over one day, as of `now`.
 *
 * Sleep is read two ways. Totals clip to the day, because a day has 24 hours
 * of sleep to give and no more. Stretches (`longest_sleep`, `six_hours`) belong
 * to the day they *start* in and are followed to their end, because a 10pm
 * sleep that runs to 5am is a seven-hour stretch, not a two-hour one — which is
 * why those settle when she wakes rather than at midnight.
 */
export function observe(
  kind: Kind,
  data: EventsPayload,
  win: DayWindow,
  now: Date,
): Observation {
  const from = win.from.getTime();
  const to = win.to.getTime();
  const t = Math.min(now.getTime(), to);
  const over = now.getTime() >= to;
  const inDay = (s: string) => {
    const at = ts(s);
    return at >= from && at < t;
  };

  const base = { done: over, running: false, leaders: [] as string[] };
  const feeds = data.feedings.filter((f) => inDay(f.ts));
  const diapers = data.diapers.filter((d) => inDay(d.ts));

  switch (kind.id) {
    case "milk_total":
      return { ...base, value: feeds.reduce((s, f) => s + f.amount_ml, 0), empty: !feeds.length };
    case "feeds_count":
      return { ...base, value: feeds.length, empty: !feeds.length };
    case "biggest_feed":
      return {
        ...base,
        value: feeds.length ? Math.max(...feeds.map((f) => f.amount_ml)) : 0,
        empty: !feeds.length,
      };
    case "diapers_count":
      return { ...base, value: diapers.length, empty: !diapers.length };
    case "dirty_count":
      return {
        ...base,
        value: diapers.filter((d) => POOPY.has(d.type)).length,
        empty: !diapers.length,
      };
    case "blowout":
      return {
        ...base,
        value: diapers.filter((d) => d.type === "massive_blowout").length,
        empty: !diapers.length,
      };
    case "first_poop": {
      const first = diapers
        .filter((d) => POOPY.has(d.type))
        .map((d) => ts(d.ts))
        .sort((a, b) => a - b)[0];
      return {
        ...base,
        value: first === undefined ? null : Math.round((first - from) / MINUTE),
        // Settled the moment it happens: there's only one first.
        done: first !== undefined || over,
        empty: !diapers.length,
      };
    }
    case "spit_up": {
      const moments = (data.moments ?? []).filter((m) => m.kind === "spit_up" && inDay(m.ts));
      // Spit-ups are only written down when they happen, so a day with feeds
      // logged and no spit-up is a genuine "no" rather than an empty day.
      return { ...base, value: moments.length, empty: !moments.length && !feeds.length };
    }
    case "sleep_total": {
      let ms = 0;
      let any = false;
      for (const s of data.sleep) {
        const c = clipSleep(s, from, t);
        if (c) {
          ms += c.to - c.from;
          any = true;
        }
      }
      return { ...base, value: Math.round(ms / MINUTE), empty: !any };
    }
    case "longest_sleep":
    case "six_hours": {
      const mine = data.sleep.filter((s) => {
        const at = ts(s.sleep_start);
        return at >= from && at < to && at <= now.getTime();
      });
      const running = mine.some((s) => s.sleep_end === null);
      const longest = Math.max(
        0,
        ...mine.map((s) => (s.sleep_end === null ? now.getTime() : ts(s.sleep_end)) - ts(s.sleep_start)),
      );
      return {
        value: Math.round(longest / MINUTE),
        done: over && !running,
        empty: !mine.length,
        running,
        leaders: [],
      };
    }
    case "top_logger": {
      const counts = new Map<string, { name: string; n: number }>();
      const add = (who: string | null | undefined, at: string) => {
        if (!who || !inDay(at)) return;
        const key = who.trim().toLowerCase();
        const row = counts.get(key) ?? { name: who.trim(), n: 0 };
        row.n += 1;
        counts.set(key, row);
      };
      for (const f of data.feedings) add(f.logged_by, f.ts);
      for (const s of data.sleep) add(s.logged_by, s.sleep_start);
      for (const d of data.diapers) add(d.logged_by, d.ts);
      for (const m of data.moments ?? []) add(m.logged_by, m.ts);
      for (const c of data.comments ?? []) add(c.logged_by, c.ts);
      const top = Math.max(0, ...[...counts.values()].map((r) => r.n));
      return {
        ...base,
        value: top,
        empty: top === 0,
        leaders: top ? [...counts.values()].filter((r) => r.n === top).map((r) => r.name) : [],
      };
    }
  }
}

/** Whether a figure counts as "it happened" for a yes/no question. */
function happened(kind: Kind, value: number | null): boolean {
  if (value === null) return false;
  return kind.id === "six_hours" ? value * MINUTE >= GOOD_STRETCH_MS : value > 0;
}

export type Outcome = {
  /** `open` until the day starts, `live` through it, `final` once nothing can change. */
  phase: "open" | "live" | "final";
  obs: Observation;
  /** The question is decided and points can be given. */
  settled: boolean;
  /** Decided as no contest: nothing logged, or an over/under that landed on the line. */
  void: boolean;
  /** yes / no / over / under, once known. */
  winning: "yes" | "no" | "over" | "under" | null;
};

/**
 * How a day's question stands. Some questions settle early, because some
 * things can't be undone: a blowout has happened, the fifth feed of an
 * "under 4.5" day has already gone over, the first poop has been and gone.
 * Everything else waits for midnight, or for her to wake from a stretch that
 * started before it.
 */
export function outcome(
  kind: Kind,
  line: number | null,
  data: EventsPayload,
  win: DayWindow,
  now: Date,
): Outcome {
  const obs = observe(kind, data, win, now);
  const t = now.getTime();
  const phase: Outcome["phase"] =
    t < win.from.getTime() ? "open" : t >= win.to.getTime() && !obs.running ? "final" : "live";
  const base = { phase, obs, settled: false, void: false, winning: null } as Outcome;
  if (phase === "open") return base;

  // A day nobody logged isn't a day nothing happened.
  if (obs.done && obs.empty) return { ...base, settled: true, void: true };

  switch (kind.format) {
    case "yesno": {
      if (happened(kind, obs.value)) return { ...base, settled: true, winning: "yes" };
      return obs.done ? { ...base, settled: true, winning: "no" } : base;
    }
    case "overunder": {
      if (line === null) return { ...base, settled: obs.done, void: obs.done };
      const v = obs.value ?? 0;
      // Every over/under figure only ever grows through a day, so passing the
      // line is final the moment it happens.
      if (v > line) return { ...base, settled: true, winning: "over" };
      if (!obs.done) return base;
      return v === line
        ? { ...base, settled: true, void: true }
        : { ...base, settled: true, winning: "under" };
    }
    case "closest":
      if (!obs.done) return base;
      // A whole day with no poop has no first poop to be nearest to.
      return obs.value === null ? { ...base, settled: true, void: true } : { ...base, settled: true };
    case "person":
      return obs.done ? { ...base, settled: true, void: !obs.leaders.length } : base;
  }
}

// ---------------------------------------------------------------------------
// Lines and hints, from her own past week.

/** How many finished days the line and the hint look back over. */
export const LOOKBACK_DAYS = 7;

/** The days before `key`, most recent first. Pass today's key to get only finished days. */
export function pastWindows(key: DayKey, tz: string, days = LOOKBACK_DAYS): DayWindow[] {
  return Array.from({ length: days }, (_, i) => dayWindow(shiftDay(key, -(i + 1)), tz));
}

/** Each past day's figure for a kind, skipping days that weren't logged. */
function history(kind: Kind, data: EventsPayload, windows: DayWindow[]): number[] {
  return windows
    .map((w) => observe(kind, data, w, w.to))
    .filter((o) => !o.empty && o.value !== null)
    .map((o) => o.value as number);
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * The over/under line: her average over the past week, nudged off whole
 * numbers so a count can't land exactly on it. Sleep is in minutes and set to
 * the nearest quarter hour; landing on it to the minute is a no contest.
 * Null when there's no history to set one from.
 */
export function lineFor(kind: Kind, data: EventsPayload, windows: DayWindow[]): number | null {
  if (kind.format !== "overunder") return null;
  const xs = history(kind, data, windows);
  if (!xs.length) return null;
  const avg = mean(xs);
  return kind.unit === "duration" ? Math.round(avg / 15) * 15 : Math.floor(avg) + 0.5;
}

export type Hint = {
  /** A typical figure, for the stepper to start from. */
  typical: number | null;
  /** yes/no: how many of the past days it happened on. */
  happenedDays: number;
  days: number;
};

/** What her past week says, shown under the question so a guess has something to go on. */
export function hintFor(kind: Kind, data: EventsPayload, windows: DayWindow[]): Hint {
  const xs = history(kind, data, windows);
  if (!xs.length) return { typical: null, happenedDays: 0, days: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  // The median for a time of day: one 11pm first poop shouldn't drag the
  // typical one into the afternoon.
  const typical = kind.unit === "clock" ? sorted[Math.floor(sorted.length / 2)] : mean(xs);
  return {
    typical,
    happenedDays: xs.filter((v) => happened(kind, v)).length,
    days: xs.length,
  };
}

/** Whether a kind can be asked: its log is in use, and a person question has people to pick. */
export function availability(data: EventsPayload, windows: DayWindow[], peopleCount: number) {
  const since = Math.min(...windows.map((w) => w.from.getTime()));
  const recent = (s: string) => ts(s) >= since;
  const used: Record<Source, boolean> = {
    feedings: data.feedings.some((f) => recent(f.ts)),
    sleep: data.sleep.some((s) => recent(s.sleep_start)),
    diapers: data.diapers.some((d) => recent(d.ts)),
    moments: (data.moments ?? []).some((m) => m.kind === "spit_up" && recent(m.ts)),
    people: peopleCount >= 2,
  };
  return (kind: Kind) =>
    used[kind.source] &&
    // An over/under needs a line, and a line needs a week with something in it.
    (kind.format !== "overunder" || lineFor(kind, data, windows) !== null);
}

// ---------------------------------------------------------------------------
// Answers and points.

export type BetDay = { day: DayKey; tz: string; kind: KindId; line: number | null };

export type Prediction = {
  id: string;
  day: DayKey;
  person_id: string;
  name: string;
  /** `null` when it's someone else's and the day hasn't started yet. */
  answer: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** What `GET /api/bets` returns. The log itself comes from `/api/events`. */
export type BetsPayload = {
  now: string;
  people: Person[];
  days: BetDay[];
  predictions: Prediction[];
};

/**
 * Checks an answer against its question and returns it in stored form, or
 * null when it doesn't fit. Shared by the API, which rejects a bad one, and
 * the phone, which never offers one.
 */
export function normaliseAnswer(kind: Kind, raw: unknown, people: Person[]): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  switch (kind.format) {
    case "yesno":
      return s === "yes" || s === "no" ? s : null;
    case "overunder":
      return s === "over" || s === "under" ? s : null;
    case "person": {
      const p = people.find((x) => x.name.toLowerCase() === s.toLowerCase());
      return p ? p.name : null;
    }
    case "closest": {
      if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
      const n = Math.round(Number(s));
      const [lo, hi] = kind.range!;
      return n >= lo && n <= hi ? String(n) : null;
    }
  }
}

export type Score = {
  person_id: string;
  points: number;
  /** Earned anything at all. */
  won: boolean;
  /** Why, in a few words each: "called it", "underdog +5"… */
  reasons: string[];
};

/** Points for one settled day. Empty until it's settled, and for a void one. */
export function scoreDay(kind: Kind, preds: Prediction[], result: Outcome): Score[] {
  if (!result.settled || result.void) return [];
  const decided = preds.filter((p) => p.answer !== null);
  if (!decided.length) return [];

  if (kind.format === "closest") {
    const actual = result.obs.value!;
    const miss = (p: Prediction) => Math.abs(Number(p.answer) - actual);
    const distances = [...new Set(decided.map(miss))].sort((a, b) => a - b);
    const nearest = decided.length >= 2 ? distances[0] : null;
    const second = decided.length >= 3 && distances.length >= 2 ? distances[1] : null;
    return decided.map((p) => {
      const d = miss(p);
      const reasons: string[] = [];
      let points = 0;
      if (nearest !== null && d === nearest) {
        points += BBP.nearest;
        reasons.push("nearest");
      } else if (second !== null && d === second) {
        points += BBP.runnerUp;
        reasons.push(`runner-up +${BBP.runnerUp}`);
      }
      if (d <= (kind.bullseye ?? 0)) {
        points += BBP.bullseye;
        reasons.push(`bullseye +${BBP.bullseye}`);
      }
      return { person_id: p.person_id, points, won: points > 0, reasons };
    });
  }

  const right = (p: Prediction) =>
    kind.format === "person"
      ? result.obs.leaders.some((n) => n.toLowerCase() === p.answer!.toLowerCase())
      : p.answer === result.winning;
  const winners = decided.filter(right).length;
  const underdog = winners < decided.length - winners;

  return decided.map((p) => {
    const ok = right(p);
    const points = ok ? BBP.correct + (underdog ? BBP.underdog : 0) : 0;
    const reasons = ok ? ["called it", ...(underdog ? [`underdog +${BBP.underdog}`] : [])] : [];
    return { person_id: p.person_id, points, won: ok, reasons };
  });
}

export type Standing = {
  person_id: string;
  name: string;
  bbp: number;
  wins: number;
  losses: number;
  /** Days in a row with points, up to the most recent settled day they played. */
  streak: number;
};

/** Everyone who has ever played, best first. */
export function standings(
  people: Person[],
  days: { key: DayKey; kind: Kind; preds: Prediction[]; result: Outcome }[],
): Standing[] {
  const byId = new Map<string, Standing>();
  const row = (id: string) => {
    let r = byId.get(id);
    if (!r) {
      const name = people.find((p) => p.id === id)?.name ?? "?";
      r = { person_id: id, name, bbp: 0, wins: 0, losses: 0, streak: 0 };
      byId.set(id, r);
    }
    return r;
  };

  // Oldest first, so the streak ends up describing the most recent run.
  for (const d of [...days].sort((a, b) => a.key.localeCompare(b.key))) {
    for (const p of d.preds) row(p.person_id);
    for (const s of scoreDay(d.kind, d.preds, d.result)) {
      const r = row(s.person_id);
      r.bbp += s.points;
      if (s.won) {
        r.wins += 1;
        r.streak += 1;
      } else {
        r.losses += 1;
        r.streak = 0;
      }
    }
  }

  return [...byId.values()].sort(
    (a, b) => b.bbp - a.bbp || b.wins - a.wins || a.name.localeCompare(b.name),
  );
}

