import { summarise } from "./summary";
import { MINUTE } from "./time";
import type { EventsPayload } from "./types";

/**
 * The payload behind "Copy for AI" — deliberately verbose and readable so it
 * can be pasted straight into a chat and asked questions about.
 */
export function buildExport(data: EventsPayload) {
  const start = new Date(data.start);
  const end = new Date(data.end);
  const s = summarise(data);
  const round = (n: number) => Math.round(n);

  return {
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      duration_hours: round((end.getTime() - start.getTime()) / 3_600_000),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    summary: {
      total_feeding_ml: s.totalFeedingMl,
      feeding_count: s.feedingCount,
      average_feeding_ml: s.avgFeedingMl === null ? null : Math.round(s.avgFeedingMl * 10) / 10,
      average_minutes_between_feedings:
        s.avgBetweenFeedingsMs === null ? null : round(s.avgBetweenFeedingsMs / MINUTE),
      total_sleep_minutes: round(s.totalSleepMs / MINUTE),
      sleep_sessions: s.sleepCount,
      longest_sleep_minutes: round(s.longestSleepMs / MINUTE),
      diaper_count: s.diaperCount,
      diapers_by_type: s.diaperBreakdown,
    },
    feedings: data.feedings.map((f) => ({
      timestamp: new Date(f.ts).toISOString(),
      local_time: new Date(f.ts).toLocaleString(),
      amount_ml: f.amount_ml,
    })),
    sleep: data.sleep.map((s2) => {
      const from = new Date(s2.sleep_start);
      const to = s2.sleep_end ? new Date(s2.sleep_end) : null;
      return {
        start: from.toISOString(),
        end: to ? to.toISOString() : null,
        local_start: from.toLocaleString(),
        duration_minutes: to ? round((to.getTime() - from.getTime()) / MINUTE) : null,
        in_progress: to === null,
      };
    }),
    diapers: data.diapers.map((d) => ({
      timestamp: new Date(d.ts).toISOString(),
      local_time: new Date(d.ts).toLocaleString(),
      type: d.type,
    })),
    comments: data.comments.map((c) => ({
      timestamp: new Date(c.ts).toISOString(),
      local_time: new Date(c.ts).toLocaleString(),
      text: c.text,
      reactions: c.reactions ?? {},
    })),
  };
}

/** Clipboard API needs a secure context; the textarea path covers the rest. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const worked = document.execCommand("copy");
  document.body.removeChild(area);
  if (!worked) throw new Error("Couldn't copy to the clipboard");
}
