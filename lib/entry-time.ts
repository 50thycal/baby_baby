import { HOUR, MINUTE, roundToStep, startOfLocalDay } from "./time";

export const ENTRY_STEP = 5;
export const ENTRY_SPAN = 24 * HOUR;
export const ENTRY_ITEM_WIDTH = 24;
export const ENTRY_COUNT = (ENTRY_SPAN * 2) / (ENTRY_STEP * MINUTE) + 1;

export function entryAnchor(base: Date): number {
  return roundToStep(base, ENTRY_STEP).getTime();
}

export function entryIndex(timestamp: number, anchor: number): number {
  return Math.max(
    0,
    Math.min(
      ENTRY_COUNT - 1,
      Math.round((timestamp - anchor + ENTRY_SPAN) / (ENTRY_STEP * MINUTE)),
    ),
  );
}

export function entryTime(index: number, anchor: number): number {
  return anchor - ENTRY_SPAN + index * ENTRY_STEP * MINUTE;
}

/** Calendar-day moves preserve the local clock across daylight-saving changes. */
export function shiftLocalDay(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function localDayWindow(value: Date): { start: Date; end: Date } {
  const start = startOfLocalDay(value);
  return { start, end: shiftLocalDay(start, 1) };
}

/** New catch-up entries belong in the past, even when advancing back to today. */
export function catchUpTime(value: Date, days: number, now = new Date()): Date {
  return new Date(Math.min(now.getTime(), shiftLocalDay(value, days).getTime()));
}
