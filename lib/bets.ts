/**
 * The nightly bet: will she sleep six hours straight tonight?
 *
 * Everything here is pure, so the server (which enforces the lock) and every
 * phone (which draws the cards and the leaderboard) reach the same answer from
 * the same rows. Nothing about a result is stored — it's recomputed from
 * `sleep_sessions` every time, so correcting a mis-logged sleep corrects the
 * bet with it.
 *
 * "Tonight" is a wall-clock idea and the server runs in UTC, so each night
 * carries the time zone of whoever bet on it first, and every boundary below
 * is computed in that zone. A family in one house all share one anyway.
 */
import { HOUR, MINUTE } from "./time";
import type { SleepSession } from "./types";

/** What counts as a good night: one unbroken stretch at least this long. */
export const GOOD_NIGHT_MS = 6 * HOUR;

/** A stretch belongs to the night if it *starts* between these hours. */
export const NIGHT_FROM_HOUR = 18;
export const NIGHT_TO_HOUR = 6;

/** Betting closes when she goes down for the night, or at this hour at the latest. */
export const LOCK_BY_HOUR = 20;

/** Baby baby points. */
export const BBP = {
  /** Called it. */
  correct: 10,
  /** Called it when most of the family didn't. */
  underdog: 5,
  /** Nearest guess at the longest stretch. Needs two or more guessers. */
  closest: 5,
} as const;

export type Pick = "yes" | "no";

/** `YYYY-MM-DD` — the local date of the evening the night begins on. */
export type NightKey = string;

export type Person = { id: string; name: string };

export type Bet = {
  id: string;
  night: NightKey;
  person_id: string;
  name: string;
  /** `null` when it's someone else's bet and the night hasn't locked yet. */
  pick: Pick | null;
  guess_min: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type Night = { night: NightKey; tz: string };

/** What `GET /api/bets` returns. */
export type BetsPayload = {
  now: string;
  people: Person[];
  nights: Night[];
  bets: Bet[];
  sleep: SleepSession[];
};

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
 * offset at the guess — which is what lands a daylight-saving evening right.
 */
export function zonedInstant(key: NightKey, dayOffset: number, hour: number, tz: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d + dayOffset, hour);
  const first = wall - offsetAt(wall, tz);
  return new Date(wall - offsetAt(first, tz));
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The night in progress, or the next one to bet on. Before 6am it's still last
 * night — at 3am nobody means the coming evening by "tonight".
 */
export function currentNight(now: Date, tz: string): NightKey {
  const w = wallClock(now.getTime(), tz);
  const date = new Date(Date.UTC(w.y, w.m - 1, w.d - (w.h < NIGHT_TO_HOUR ? 1 : 0)));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function shiftNight(key: NightKey, days: number): NightKey {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isNightKey(value: unknown): value is NightKey {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return shiftNight(value, 0) === value; // rejects 2026-02-31
}

export type NightWindow = {
  key: NightKey;
  /** Stretches starting from here… */
  from: Date;
  /** …and before here belong to the night. */
  to: Date;
  /** The latest betting can close. */
  lockBy: Date;
};

export function nightWindow(key: NightKey, tz: string): NightWindow {
  return {
    key,
    from: zonedInstant(key, 0, NIGHT_FROM_HOUR, tz),
    to: zonedInstant(key, 1, NIGHT_TO_HOUR, tz),
    lockBy: zonedInstant(key, 0, LOCK_BY_HOUR, tz),
  };
}

const startMs = (s: SleepSession) => new Date(s.sleep_start).getTime();

function nightSleeps(win: NightWindow, sleep: SleepSession[]) {
  const from = win.from.getTime();
  const to = win.to.getTime();
  return sleep.filter((s) => startMs(s) >= from && startMs(s) < to);
}

/**
 * When betting closes: the moment she goes down for the night, so nobody gets
 * to watch how bedtime went before choosing — or 8pm, whichever is first.
 */
export function lockTime(win: NightWindow, sleep: SleepSession[]): Date {
  const starts = nightSleeps(win, sleep).map(startMs);
  const first = starts.length ? Math.min(...starts) : Infinity;
  return new Date(Math.min(first, win.lockBy.getTime()));
}

export type Outcome = {
  /** `upcoming` before 6pm, `live` through the night, `final` once it's over. */
  phase: "upcoming" | "live" | "final";
  /**
   * `true` the moment any stretch reaches six hours — that can't be undone, so
   * it's called early. `false` only once the night is over. `null` until then,
   * and for a void night.
   */
  good: boolean | null;
  /** Nothing logged for the night at all. Nobody wins or loses. */
  void: boolean;
  /** The longest stretch so far, counting one still running up to now. */
  longestMs: number;
  /** A stretch belonging to this night is still going. */
  running: boolean;
};

export function nightOutcome(win: NightWindow, sleep: SleepSession[], now: Date): Outcome {
  const t = now.getTime();
  const mine = nightSleeps(win, sleep).filter((s) => startMs(s) <= t);
  const running = mine.some((s) => s.sleep_end === null);
  const longestMs = Math.max(
    0,
    ...mine.map((s) => (s.sleep_end === null ? t : new Date(s.sleep_end).getTime()) - startMs(s)),
  );

  // A stretch that started before 6am can run on well past it, and may yet
  // reach six hours — so the night isn't over until it ends.
  const over = t >= win.to.getTime() && !running;
  const hit = longestMs >= GOOD_NIGHT_MS;

  if (over && mine.length === 0) {
    return { phase: "final", good: null, void: true, longestMs: 0, running: false };
  }
  return {
    phase: over ? "final" : t < win.from.getTime() ? "upcoming" : "live",
    good: hit ? true : over ? false : null,
    void: false,
    longestMs,
    running,
  };
}

export type Score = {
  person_id: string;
  points: number;
  correct: boolean;
  underdog: boolean;
  closest: boolean;
};

/**
 * Points for one finished night. Empty until the night is final — an early
 * "yes" is certain, but the closest-guess bonus still depends on how long the
 * best stretch finally runs.
 */
export function scoreNight(bets: Bet[], outcome: Outcome): Score[] {
  if (outcome.phase !== "final" || outcome.void || outcome.good === null) return [];
  const decided = bets.filter((b) => b.pick !== null);
  const won = (b: Bet) => (b.pick === "yes") === outcome.good;
  const winners = decided.filter(won).length;
  const underdog = winners < decided.length - winners;

  const guessers = decided.filter((b) => b.guess_min !== null);
  const actual = Math.round(outcome.longestMs / MINUTE);
  const miss = (b: Bet) => Math.abs(b.guess_min! - actual);
  const best = guessers.length >= 2 ? Math.min(...guessers.map(miss)) : null;

  return decided.map((b) => {
    const correct = won(b);
    const closest = best !== null && b.guess_min !== null && miss(b) === best;
    return {
      person_id: b.person_id,
      correct,
      underdog: correct && underdog,
      closest,
      points:
        (correct ? BBP.correct : 0) +
        (correct && underdog ? BBP.underdog : 0) +
        (closest ? BBP.closest : 0),
    };
  });
}

export type Standing = {
  person_id: string;
  name: string;
  bbp: number;
  wins: number;
  losses: number;
  /** Correct calls in a row, up to the most recent finished night they bet on. */
  streak: number;
};

/** Everyone who has ever bet, best first. */
export function standings(
  people: Person[],
  nights: { key: NightKey; bets: Bet[]; outcome: Outcome }[],
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
  for (const n of [...nights].sort((a, b) => a.key.localeCompare(b.key))) {
    for (const b of n.bets) row(b.person_id);
    for (const s of scoreNight(n.bets, n.outcome)) {
      const r = row(s.person_id);
      r.bbp += s.points;
      if (s.correct) {
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
