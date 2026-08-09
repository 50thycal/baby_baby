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

export const DIAPER_EMOJI: Record<DiaperType, string> = {
  pee: "💧",
  poop: "💩",
  both: "💧💩",
  massive_blowout: "💥",
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

export type Comment = {
  id: string;
  ts: string;
  text: string;
  reactions: Record<string, number>;
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
};

/** The small amount of "what's happening right now" the home screen shows. */
export type HomeState = {
  now: string;
  activeSleep: SleepSession | null;
  lastFeeding: Feeding | null;
  lastSleep: SleepSession | null;
  lastDiaper: Diaper | null;
};

export const RANGES = [
  { key: "24h", label: "24 Hours", hours: 24 },
  { key: "2d", label: "2 Days", hours: 48 },
  { key: "3d", label: "3 Days", hours: 72 },
  { key: "1w", label: "1 Week", hours: 168 },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export function rangeHours(key: RangeKey): number {
  return RANGES.find((r) => r.key === key)?.hours ?? 24;
}

/** Anything tappable on the timeline. */
export type TimelineEvent =
  | { kind: "feeding"; data: Feeding }
  | { kind: "sleep"; data: SleepSession }
  | { kind: "diaper"; data: Diaper }
  | { kind: "comment"; data: Comment };
