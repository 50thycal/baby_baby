import { DIAPER_TYPES, type DiaperType, type EventsPayload } from "./types";

export type Summary = {
  totalFeedingMl: number;
  feedingCount: number;
  avgFeedingMl: number | null;
  avgBetweenFeedingsMs: number | null;
  totalSleepMs: number;
  sleepCount: number;
  longestSleepMs: number;
  diaperCount: number;
  diaperBreakdown: Record<DiaperType, number>;
  commentCount: number;
};

/**
 * Sleep is clipped to the window so a session that straddles the boundary
 * only contributes the part you can actually see on the timeline.
 */
export function clipSleep(
  session: { sleep_start: string; sleep_end: string | null },
  windowStart: number,
  windowEnd: number,
): { from: number; to: number } | null {
  const from = Math.max(new Date(session.sleep_start).getTime(), windowStart);
  const to = Math.min(session.sleep_end ? new Date(session.sleep_end).getTime() : windowEnd, windowEnd);
  return to > from ? { from, to } : null;
}

export function summarise(data: EventsPayload): Summary {
  const windowStart = new Date(data.start).getTime();
  const windowEnd = new Date(data.end).getTime();

  const amounts = data.feedings.map((f) => f.amount_ml);
  const totalFeedingMl = amounts.reduce((a, b) => a + b, 0);

  const times = data.feedings.map((f) => new Date(f.ts).getTime()).sort((a, b) => a - b);
  let avgBetweenFeedingsMs: number | null = null;
  if (times.length >= 2) {
    avgBetweenFeedingsMs = (times[times.length - 1] - times[0]) / (times.length - 1);
  }

  let totalSleepMs = 0;
  let longestSleepMs = 0;
  let sleepCount = 0;
  for (const session of data.sleep) {
    const clipped = clipSleep(session, windowStart, windowEnd);
    if (!clipped) continue;
    const duration = clipped.to - clipped.from;
    totalSleepMs += duration;
    longestSleepMs = Math.max(longestSleepMs, duration);
    sleepCount += 1;
  }

  const diaperBreakdown = Object.fromEntries(DIAPER_TYPES.map((t) => [t, 0])) as Record<
    DiaperType,
    number
  >;
  for (const d of data.diapers) diaperBreakdown[d.type] += 1;

  return {
    totalFeedingMl,
    feedingCount: data.feedings.length,
    avgFeedingMl: amounts.length ? totalFeedingMl / amounts.length : null,
    avgBetweenFeedingsMs,
    totalSleepMs,
    sleepCount,
    longestSleepMs,
    diaperCount: data.diapers.length,
    diaperBreakdown,
    commentCount: data.comments.length,
  };
}
