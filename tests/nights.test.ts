import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fitNights,
  longestStretch,
  nightStretches,
  projectMilestone,
  sleepDiary,
  THROUGH_THE_NIGHT_MS,
  type NightPoint,
} from "../lib/nights";
import type { EventsPayload } from "../lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Noon on 12 Aug 2026.
const NOW = new Date(2026, 7, 12, 12, 30);

/** Local time `daysAgo` days back from NOW's date, at `hour` (may exceed 24). */
const at = (daysAgo: number, hour: number) =>
  new Date(new Date(2026, 7, 12 - daysAgo).getTime() + hour * HOUR);

let n = 0;
const nap = (from: Date, to: Date | null) => ({
  id: `s${n++}`,
  sleep_start: from.toISOString(),
  sleep_end: to ? to.toISOString() : null,
  created_at: from.toISOString(),
});
const feed = (when: Date) => ({
  id: `f${n++}`,
  amount_ml: 100,
  ts: when.toISOString(),
  created_at: when.toISOString(),
});

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: at(60, 0).toISOString(),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

/**
 * A night's sleep: down at `down` (hours after that evening's midnight), a
 * stretch of `hours`, then back down briefly. Plus a 1am sleep the first
 * evening so the sleep log counts as covering it from midnight.
 */
const night = (daysAgo: number, down: number, hours: number) => [
  nap(at(daysAgo, down), at(daysAgo, down + hours)),
  nap(at(daysAgo, down + hours + 0.5), at(daysAgo, down + hours + 2)),
];

// --- longestStretch ----------------------------------------------------------

test("a night's stretch is the longest sleep starting 6pm–6am, followed to its end", () => {
  const sleep = [
    nap(at(1, 15), at(1, 17.5)), // afternoon nap: not the night
    nap(at(1, 21), at(1, 23)),
    nap(at(1, 23.5), at(1, 29)), // 11:30pm to 5am — 5h30, across midnight
  ];
  const best = longestStretch(sleep, at(1, 0), NOW.getTime());
  assert.equal(best?.ms, 5.5 * HOUR);
});

test("a stretch still running counts up to now, and says so", () => {
  const best = longestStretch([nap(at(0, 2), null)], at(1, 0), at(0, 5).getTime());
  assert.deepEqual([best?.ms, best?.running], [3 * HOUR, true]);
});

// --- nightStretches ----------------------------------------------------------

test("one point per finished night, oldest first", () => {
  const sleep = [nap(at(5, 1), at(5, 2)), ...night(4, 20, 3), ...night(3, 21, 4), ...night(2, 22, 5)];
  const pts = nightStretches(payload({ sleep }), NOW, "all");
  assert.deepEqual(pts.map((p) => p.ms / HOUR), [3, 4, 5]);
});

test("a night with nothing logged is a gap, not a zero", () => {
  const sleep = [nap(at(5, 1), at(5, 2)), ...night(4, 20, 3), ...night(2, 22, 5)];
  const pts = nightStretches(payload({ sleep }), NOW, "all");
  assert.deepEqual(pts.map((p) => p.ms / HOUR), [3, 5]);
});

test("last night isn't counted while it's still running", () => {
  const sleep = [nap(at(3, 1), at(3, 2)), ...night(2, 22, 5), nap(at(1, 23), null)];
  const pts = nightStretches(payload({ sleep }), NOW, "all");
  assert.deepEqual(pts.map((p) => p.ms / HOUR), [5]);
});

test("the window counts evenings, not points", () => {
  const sleep = [nap(at(9, 1), at(9, 2)), ...night(8, 20, 3), ...night(2, 22, 5)];
  // Two evenings back reaches the night of 2 days ago but not 8.
  assert.equal(nightStretches(payload({ sleep }), NOW, 2).length, 1);
});

// --- trend and projection ----------------------------------------------------

const pts = (hours: number[]): NightPoint[] =>
  hours.map((h, i) => ({ evening: at(hours.length - i, 0).getTime(), ms: h * HOUR }));

test("a steady climb projects a date for six hours", () => {
  // Up half an hour a night to 4h30: the 1h30 still to go is three nights out.
  const p = pts([3, 3.5, 4, 4.5]);
  const proj = projectMilestone(p, fitNights(p));
  assert.equal(proj.kind, "eta");
  if (proj.kind === "eta") {
    const days = Math.round((proj.date - p[p.length - 1].evening) / DAY);
    assert.equal(days, 3);
  }
});

test("no date for a flat or falling trend, or one too far out", () => {
  assert.equal(projectMilestone(pts([4, 3.8, 4.1, 4]), fitNights(pts([4, 3.8, 4.1, 4]))).kind, "none");
  assert.equal(projectMilestone(pts([5, 4.5, 4, 3.5]), fitNights(pts([5, 4.5, 4, 3.5]))).kind, "none");
  const slow = pts([3, 3.02, 3.04, 3.06]);
  assert.equal(projectMilestone(slow, fitNights(slow)).kind, "none", "years away isn't a date");
});

test("already at six hours on the trend line says so", () => {
  const p = pts([5.5, 6, 6.5, 7]);
  assert.equal(projectMilestone(p, fitNights(p)).kind, "there");
  assert.ok(THROUGH_THE_NIGHT_MS === 6 * HOUR);
});

test("gaps are measured in days, not points", () => {
  // Same values, but the last night is a week after the one before it: the
  // climb per day is far slower than the climb per point.
  const p = pts([3, 3.5, 4, 4.5]);
  p[3] = { ...p[3], evening: p[2].evening + 7 * DAY };
  const fit = fitNights(p)!;
  assert.ok(fit.slopePerDay < 0.5 * HOUR / 2);
});

// --- sleepDiary --------------------------------------------------------------

test("rows run noon to noon, newest first, so a night stays in one piece", () => {
  const sleep = [nap(at(2, 1), at(2, 2)), nap(at(1, 22), at(1, 28))]; // 10pm–4am
  const rows = sleepDiary(payload({ sleep }), NOW, 3);
  // The row for yesterday noon → today noon holds the whole night as one bar.
  const row = rows.find((r) => r.start === at(1, 12).getTime())!;
  assert.equal(row.segments.length, 1);
  assert.deepEqual([row.segments[0].from, row.segments[0].to], [10 / 24, 16 / 24]);
  assert.ok(row.segments[0].longest);
  assert.equal(rows[0].start, at(0, 12).getTime(), "today's row first");
});

test("the row with now in it stops at now, and marks it", () => {
  const sleep = [nap(at(1, 1), at(1, 2)), nap(at(0, 12.25), null)];
  const rows = sleepDiary(payload({ sleep }), NOW, 1);
  assert.ok(rows[0].now !== null && Math.abs(rows[0].now - 0.5 / 24) < 1e-9);
  assert.ok(rows[0].segments[0].running);
  assert.ok(Math.abs(rows[0].segments[0].to - 0.5 / 24) < 1e-9);
});

test("feeds land on their row as fractions", () => {
  const sleep = [nap(at(1, 1), at(1, 2))];
  const rows = sleepDiary(payload({ sleep, feedings: [feed(at(1, 18))] }), NOW, 2);
  const row = rows.find((r) => r.start === at(1, 12).getTime())!;
  assert.deepEqual(row.feeds, [6 / 24]);
});

test("rows from before the sleep log began are left off", () => {
  const sleep = [nap(at(2, 14), at(2, 15))];
  assert.equal(sleepDiary(payload({ sleep }), NOW, 14).length, 3);
  assert.deepEqual(sleepDiary(payload(), NOW, 14), []);
});
