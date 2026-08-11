/**
 * How wide to draw the timeline, and where to put the gridlines.
 *
 * The four fixed ranges have a span known in advance, so their density is just
 * tuned by hand. `All` doesn't: it's a few days now and will be a few years
 * eventually, so its scale has to be worked out from the data each time.
 */
import { HOUR } from "./time";
import type { EventsPayload, RangeKey } from "./types";

export type Scale = { pxPerHour: number; tickHours: number };

const FIXED: Record<Exclude<RangeKey, "all">, Scale> = {
  "24h": { pxPerHour: 56, tickHours: 3 },
  "2d": { pxPerHour: 32, tickHours: 6 },
  "3d": { pxPerHour: 23, tickHours: 6 },
  "1w": { pxPerHour: 12, tickHours: 12 },
};

/**
 * Roughly a dozen phone-widths of scrolling. `All` is a view you skim, so the
 * whole canvas should stay reachable by thumb rather than growing without limit
 * as the months pile up.
 */
export const ALL_MAX_WIDTH_PX = 4200;

/** Never denser than the week view — `All` shouldn't out-zoom `24h`. */
const ALL_MAX_PX_PER_HOUR = 12;

/**
 * ...and never sparser than about three and a half pixels to the day, below
 * which a week is a smudge and nothing can be tapped. The two limits disagree
 * past roughly three years of history, and this one wins: a canvas that scrolls
 * longer than you'd like still beats one you can't hit anything on. Three years
 * is well beyond what a newborn tracker is for, so in practice the width budget
 * is the one that holds.
 */
export const ALL_MIN_PX_PER_HOUR = 0.15;

/** Gridline labels are ~28px wide; below this gap they'd sit on top of each other. */
const MIN_TICK_GAP_PX = 56;

/** Hours between gridlines, coarsest last: 3h up to 3 months. */
const TICK_STEPS = [3, 6, 12, 24, 48, 72, 168, 336, 720, 2_160];

export function scaleFor(range: RangeKey, spanHours: number): Scale {
  if (range !== "all") return FIXED[range];

  const fit = ALL_MAX_WIDTH_PX / Math.max(1, spanHours);
  const pxPerHour = Math.max(ALL_MIN_PX_PER_HOUR, Math.min(ALL_MAX_PX_PER_HOUR, fit));
  const tickHours =
    TICK_STEPS.find((h) => h * pxPerHour >= MIN_TICK_GAP_PX) ?? TICK_STEPS[TICK_STEPS.length - 1];

  return { pxPerHour, tickHours };
}

/** The earliest thing logged, of any kind, or null if nothing has been. */
export function firstStamp(data: EventsPayload): number | null {
  const stamps = [
    ...data.feedings.map((f) => new Date(f.ts).getTime()),
    ...data.sleep.map((s) => new Date(s.sleep_start).getTime()),
    ...data.diapers.map((d) => new Date(d.ts).getTime()),
    ...data.comments.map((c) => new Date(c.ts).getTime()),
    ...(data.moments ?? []).map((m) => new Date(m.ts).getTime()),
  ].filter((t) => Number.isFinite(t));

  return stamps.length ? Math.min(...stamps) : null;
}

/**
 * The window the timeline actually draws.
 *
 * For the fixed ranges that's exactly what the server returned. `All` is
 * different: the server floors that query at a fixed date so it stays bounded,
 * and the floor is decades before the first entry — drawing from there would be
 * a canvas of empty years with everything crushed against the right-hand edge.
 * So `all` anchors on the first thing actually logged, and an empty database
 * falls back to a plain day rather than to the year 2000.
 */
export function timelineWindow(data: EventsPayload, range: RangeKey) {
  const end = new Date(data.end).getTime();
  if (range !== "all") return { start: new Date(data.start).getTime(), end };

  const first = firstStamp(data);
  return { start: first === null ? end - 24 * HOUR : first, end };
}
