/**
 * Everything is stored as UTC `timestamptz` and rendered with the browser's
 * own locale/timezone, so each family member sees their own wall clock.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export function fmtClock(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function fmtDayLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" });
}

/** 134 -> "2h 14m". Always the two coarsest useful units. */
export function fmtDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / MINUTE));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "2h 14m ago", or "just now" inside the first minute. */
export function fmtAgo(from: Date | string, now: Date = new Date()): string {
  const date = typeof from === "string" ? new Date(from) : from;
  const delta = now.getTime() - date.getTime();
  if (delta < 0) return `in ${fmtDuration(-delta)}`;
  if (delta < MINUTE) return "just now";
  return `${fmtDuration(delta)} ago`;
}

/** "in 15m" / "2h ago" — the short form used next to the time wheel. */
export function fmtOffset(minutes: number): string {
  if (minutes === 0) return "now";
  const abs = Math.abs(minutes);
  const label = fmtDuration(abs * MINUTE);
  return minutes < 0 ? `${label} ago` : `in ${label}`;
}

export function startOfLocalDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Rounds to the nearest `step` minutes — keeps wheel values tidy. */
export function roundToStep(d: Date, stepMinutes: number): Date {
  const step = stepMinutes * MINUTE;
  return new Date(Math.round(d.getTime() / step) * step);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
