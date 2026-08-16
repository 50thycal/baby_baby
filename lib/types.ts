export const DIAPER_TYPES = ["pee", "poop", "both", "massive_blowout"] as const;
export type DiaperType = (typeof DIAPER_TYPES)[number];

export const DIAPER_LABEL: Record<DiaperType, string> = {
  pee: "Pee",
  poop: "Poop",
  both: "Both",
  massive_blowout: "Massive Blowout",
};

/** For tight spots like the home-screen status strip. */
export const DIAPER_SHORT: Record<DiaperType, string> = {
  pee: "Pee",
  poop: "Poop",
  both: "Both",
  massive_blowout: "Blowout",
};

export type Feeding = {
  id: string;
  amount_ml: number;
  ts: string;
  created_at: string;
};

export type SleepSession = {
  id: string;
  sleep_start: string;
  sleep_end: string | null;
  created_at: string;
};

export type Diaper = {
  id: string;
  type: DiaperType;
  ts: string;
  created_at: string;
};

/**
 * Things that happen at a moment and have no size worth recording — you only
 * want to know roughly when. Kept in one table with a kind, the way diapers
 * carry a type, so a third one costs nothing.
 */
export const MOMENT_KINDS = ["spit_up", "fussy"] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export const MOMENT_LABEL: Record<MomentKind, string> = {
  spit_up: "Big spit up",
  fussy: "Fussy fussy",
};

/** Which track each one belongs to — spit-ups ride with feeding, fussiness with sleep. */
export const MOMENT_ACCENT: Record<MomentKind, string> = {
  spit_up: "var(--c-feed)",
  fussy: "var(--c-sleep)",
};

export type Moment = {
  id: string;
  kind: MomentKind;
  ts: string;
  created_at: string;
};

export type Comment = {
  id: string;
  ts: string;
  text: string;
  reactions: Record<string, number>;
  created_at: string;
};

/**
 * A weigh-in.
 *
 * Not part of `EventsPayload`, and deliberately so: weight is a state rather
 * than an event. "What does she weigh" is answered by the most recent reading
 * whatever window you happen to be looking at — range-filtering it would blank
 * the figure out on a 24h view whenever she was last weighed on Tuesday. It
 * gets its own endpoint that always returns the lot, which is affordable
 * because there are only ever a handful.
 */
export type Weight = {
  id: string;
  weight_g: number;
  ts: string;
  /**
   * The one weigh-in from before the app existed. Flagged rather than inferred
   * from being the earliest row: the moment someone logs an ordinary weigh-in
   * before backfilling this, "earliest" would name a real reading and offer to
   * overwrite it. At most one row can carry it.
   */
  is_birth: boolean;
  created_at: string;
};

/** Everything the dashboard needs for one time range. */
export type EventsPayload = {
  start: string;
  end: string;
  feedings: Feeding[];
  sleep: SleepSession[];
  diapers: Diaper[];
  comments: Comment[];
  moments: Moment[];
};

/** The small amount of "what's happening right now" the home screen shows. */
export type HomeState = {
  now: string;
  activeSleep: SleepSession | null;
  lastFeeding: Feeding | null;
  lastSleep: SleepSession | null;
  lastDiaper: Diaper | null;
};

/**
 * Labels are short because there are five of them across one phone-width row.
 * `all` has no fixed width — see `rangeHours`.
 */
export const RANGES = [
  { key: "24h", label: "24h", hours: 24 },
  { key: "2d", label: "2d", hours: 48 },
  { key: "3d", label: "3d", hours: 72 },
  { key: "1w", label: "1w", hours: 168 },
  { key: "all", label: "All", hours: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

/**
 * Where `all` starts. A fixed date rather than the epoch, so the query is still
 * bounded — but decades before the first nappy, so nothing should draw a
 * timeline from here. See `timelineWindow`.
 */
export const ALL_TIME_FLOOR = "2000-01-01T00:00:00.000Z";

/** `null` means "no fixed width" — the caller falls back to ALL_TIME_FLOOR. */
export function rangeHours(key: RangeKey): number | null {
  const found = RANGES.find((r) => r.key === key);
  return found ? found.hours : 24;
}

/** Anything tappable on the timeline. */
export type TimelineEvent =
  | { kind: "feeding"; data: Feeding }
  | { kind: "sleep"; data: SleepSession }
  | { kind: "diaper"; data: Diaper }
  | { kind: "comment"; data: Comment }
  | { kind: "moment"; data: Moment };
