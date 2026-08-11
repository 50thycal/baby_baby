import { summarise } from "./summary";
import { MINUTE } from "./time";
import type { EventsPayload, Weight } from "./types";
import { fmtOunceChange, fmtWeight, weightTrend } from "./weight";

/**
 * The text behind "Copy data".
 *
 * This used to be pretty-printed JSON with an ISO timestamp *and* a localised
 * string on every row, which spent most of its length repeating the date. The
 * point of the export is to paste a lot of history into a chat window, so it is
 * now one line per day with a 24-hour clock: unambiguous without am/pm, and
 * roughly a tenth of the size, which is the difference between a week fitting
 * in a message and not.
 *
 * Comments are deliberately left out. They're jokes and reactions between
 * family, not data worth analysing.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayLabel = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** "2h41", "48m" — short enough to sit inline without a unit column. */
function dur(ms: number): string {
  const mins = Math.round(ms / MINUTE);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? pad(m) : ""}` : `${m}m`;
}

function dateRangeLabel(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
  return fmt(start) === fmt(end) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Weights arrive separately because they aren't range-scoped — see `Weight` in
 * types.ts. They're summarised in the header rather than filed under a day: a
 * weigh-in is a fact about the baby, not about last Tuesday.
 */
function buildWeightLine(weights: Weight[]): string | null {
  const trend = weightTrend(
    weights.map((w) => ({ grams: w.weight_g, at: new Date(w.ts).getTime() })),
  );
  if (!trend) return null;

  const parts = [`weight ${fmtWeight(trend.latest.grams)}`];
  if (trend.previous) {
    parts.push(`${fmtOunceChange(trend.changeOz!)} since ${dayLabel(new Date(trend.previous.at))}`);
  }
  if (trend.perWeekOz !== null) {
    parts.push(`${fmtOunceChange(Math.round(trend.perWeekOz))}/wk`);
  }
  return `       ${parts.join(" · ")}`;
}

export function buildExport(data: EventsPayload, weights: Weight[] = []): string {
  const s = summarise(data);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Describe the span the data actually covers, not the window that was asked
  // for. The all-time query floor is a fixed early date, so using it verbatim
  // would head the export "Jan 1 2000 – Aug 9 2026 · 9718 days", which is both
  // wrong and useless for working out a per-day rate.
  const stamps = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((n) => new Date(n.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
    ...(data.moments ?? []).map((m) => new Date(m.ts).getTime()),
  ];
  const queryStart = new Date(data.start);
  const queryEnd = new Date(data.end);
  const start = stamps.length
    ? new Date(Math.max(queryStart.getTime(), Math.min(...stamps)))
    : queryStart;
  const end = stamps.length ? new Date(Math.min(queryEnd.getTime(), Math.max(...stamps))) : queryEnd;

  // Bucket everything by the local day it happened on. Sleep is filed under the
  // day it started, so a nap across midnight stays one entry.
  type Day = {
    label: string;
    feeds: { ml: number; at: Date }[];
    sleep: string[];
    diapers: string[];
    marks: string[];
  };
  const days = new Map<string, Day>();
  const bucket = (d: Date): Day => {
    const key = dayKey(d);
    const existing = days.get(key);
    if (existing) return existing;
    const created: Day = { label: dayLabel(d), feeds: [], sleep: [], diapers: [], marks: [] };
    days.set(key, created);
    return created;
  };

  for (const f of data.feedings) {
    const at = new Date(f.ts);
    bucket(at).feeds.push({ ml: f.amount_ml, at });
  }
  for (const nap of data.sleep) {
    const from = new Date(nap.sleep_start);
    const to = nap.sleep_end ? new Date(nap.sleep_end) : null;
    bucket(from).sleep.push(
      to
        ? `${clock(from)}-${clock(to)} (${dur(to.getTime() - from.getTime())})`
        : `${clock(from)}- (ongoing)`,
    );
  }
  for (const d of data.diapers) {
    const at = new Date(d.ts);
    const type = d.type === "massive_blowout" ? "blowout" : d.type;
    bucket(at).diapers.push(`${type}@${clock(at)}`);
  }

  for (const m of data.moments ?? []) {
    const at = new Date(m.ts);
    bucket(at).marks.push(`${m.kind === "spit_up" ? "spit-up" : "fussy"}@${clock(at)}`);
  }

  // Built before the empty check: a birth weight logged before the first feed
  // is still something, and heading that export "nothing logged" would be a lie.
  const weightLine = buildWeightLine(weights);

  const lines: string[] = [];
  if (!stamps.length) {
    // Nothing timed to report. With `range=all` the window starts at the query
    // floor, so printing it would head an empty export "Jan 1 2000 · 9718 days".
    lines.push(`Baby log · nothing logged · local time (${tz}), 24h clock`);
    if (weightLine) lines.push(weightLine);
    // "nothing else" only once something else has in fact been printed.
    return (
      lines.join("\n") +
      (weightLine
        ? "\n(nothing else logged in this period)"
        : "\n(nothing logged in this period)")
    );
  }
  lines.push(`Baby log · ${dateRangeLabel(start, end)} · local time (${tz}), 24h clock`);

  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const totals = [
    `${spanDays} day${spanDays === 1 ? "" : "s"}`,
    `${s.feedingCount} feeds`,
    `${s.totalFeedingMl} mL`,
  ];
  if (s.avgFeedingMl !== null) totals.push(`avg ${Math.round(s.avgFeedingMl)} mL/feed`);
  if (s.avgBetweenFeedingsMs !== null) totals.push(`every ${dur(s.avgBetweenFeedingsMs)}`);
  lines.push(`TOTALS ${totals.join(" · ")}`);

  const second: string[] = [];
  if (s.sleepCount) {
    second.push(
      `sleep ${dur(s.totalSleepMs)} over ${s.sleepCount} nap${s.sleepCount === 1 ? "" : "s"}` +
        (s.longestSleepMs ? ` (longest ${dur(s.longestSleepMs)})` : ""),
    );
  }
  if (s.diaperCount) {
    const breakdown = Object.entries(s.diaperBreakdown)
      .filter(([, n]) => n > 0)
      .map(([type, n]) => `${n} ${type === "massive_blowout" ? "blowout" : type}`)
      .join(", ");
    second.push(
      `${s.diaperCount} diaper${s.diaperCount === 1 ? "" : "s"}${breakdown ? `: ${breakdown}` : ""}`,
    );
  }
  if (second.length) lines.push(`       ${second.join(" · ")}`);

  if (weightLine) lines.push(weightLine);

  lines.push("");

  for (const key of [...days.keys()].sort()) {
    const day = days.get(key)!;
    if (day.feeds.length) {
      const ml = day.feeds.reduce((sum, f) => sum + f.ml, 0);
      const items = day.feeds
        .sort((a, b) => a.at.getTime() - b.at.getTime())
        .map((f) => `${f.ml}@${clock(f.at)}`)
        .join(" ");
      lines.push(`${day.label}  feeds ${day.feeds.length} / ${ml} mL  ${items}`);
    } else {
      lines.push(`${day.label}  no feeds`);
    }
    if (day.sleep.length) lines.push(`      sleep ${day.sleep.join("  ")}`);
    if (day.diapers.length) lines.push(`      diaper ${day.diapers.join("  ")}`);
    if (day.marks.length) lines.push(`      also ${day.marks.join("  ")}`);
  }

  if (!days.size) lines.push("(nothing logged in this period)");

  return lines.join("\n");
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
