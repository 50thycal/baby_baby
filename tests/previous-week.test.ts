import assert from "node:assert/strict";
import { test } from "node:test";
import { computeStats, previousWeekStats } from "../lib/daily";
import type { EventsPayload } from "../lib/types";

/**
 * The week before the week being reported.
 *
 * The averages panel shows the past week; underneath each figure it shows the
 * same average for the seven days before that, so "720 mL" carries which way it
 * is moving. Two fixed windows back to back rather than a rolling one: "up from
 * last week" should mean the same thing all week instead of shifting under the
 * reader every morning.
 */

const HOUR = 3_600_000;
const NOW = new Date(2026, 7, 12, 14, 30);

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: new Date(NOW.getTime() - 60 * 86_400_000).toISOString(),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

/** `daysAgo` back at `hour` local. 01:00 keeps a day's own coverage intact. */
const at = (daysAgo: number, hour: number) =>
  new Date(
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 0, 0).getTime() +
      hour * HOUR,
  );

const feed = (daysAgo: number, ml = 100, hour = 1) => ({
  id: `f${daysAgo}-${hour}`,
  amount_ml: ml,
  ts: at(daysAgo, hour).toISOString(),
  created_at: at(daysAgo, hour).toISOString(),
});

const nap = (daysAgo: number, fromH: number, toH: number) => ({
  id: `s${daysAgo}-${fromH}`,
  sleep_start: at(daysAgo, fromH).toISOString(),
  sleep_end: at(daysAgo, toH).toISOString(),
  created_at: at(daysAgo, fromH).toISOString(),
});

const diaper = (daysAgo: number, hour = 1) => ({
  id: `d${daysAgo}-${hour}`,
  type: "poop" as const,
  ts: at(daysAgo, hour).toISOString(),
  created_at: at(daysAgo, hour).toISOString(),
});

test("last week is the seven days before the week on show", () => {
  // Three weeks of feeds: 120 mL a day for the past week, 60 before that. The
  // panel reports 120 and says it is up from 60 — which is the whole point of
  // showing the pair, because either figure alone hides that she is growing.
  const data = payload({
    feedings: Array.from({ length: 21 }, (_, i) => feed(i, i <= 7 ? 120 : 60)),
  });
  assert.equal(computeStats(data, NOW).mlPerDay, 120);

  const p = previousWeekStats(data, NOW);
  assert.equal(p.feedDays, 7, "a full week behind the full week on show");
  assert.equal(p.mlPerDay, 60);
});

test("the two windows meet without overlapping", () => {
  // Seven days each, back to back. A day counted twice would flatter whichever
  // way it leans, and a day counted in neither would quietly vanish. Day 7 back
  // is the last day of the reported week; day 8 the last of the one before.
  const data = payload({
    feedings: Array.from({ length: 15 }, (_, i) =>
      feed(i, i === 7 ? 800 : i === 8 ? 450 : 100),
    ),
  });

  // Reported week: days 1-7, so the 800 lands here and the 450 does not.
  assert.equal(computeStats(data, NOW).mlPerDay, (6 * 100 + 800) / 7);
  // Week before: days 8-14, so the 450 lands here and the 800 does not.
  assert.equal(previousWeekStats(data, NOW).mlPerDay, (6 * 100 + 450) / 7);
});

test("a log with nothing behind the reported week has nothing to compare with", () => {
  // Four days of feeds. There is no week before to be up or down from, and
  // saying "up from 0 mL" would invent a week of starvation.
  const data = payload({ feedings: Array.from({ length: 4 }, (_, i) => feed(i)) });
  const p = previousWeekStats(data, NOW);
  assert.equal(p.feedDays, 0);
  assert.equal(p.mlPerDay, null);
  assert.equal(p.longestSleepMs, 0, "and no stray zero to draw an arrow against");
});

test("a short week before is still a comparison, and says how short", () => {
  // Ten days of feeds: a full week on show, and two days behind it. Two days is
  // a fair thing to compare against; it just isn't a week, and the day count is
  // what lets the row say so.
  const data = payload({ feedings: Array.from({ length: 10 }, (_, i) => feed(i, i >= 8 ? 200 : 100)) });
  const p = previousWeekStats(data, NOW);
  assert.equal(p.feedDays, 2, "days 8 and 9 back");
  assert.equal(p.mlPerDay, 200);
});

test("each log answers for its own previous week", () => {
  // Feeds for three weeks, sleep for ten days, nappies never. The three
  // comparisons are independent, exactly as the three averages above them are.
  const data = payload({
    feedings: Array.from({ length: 21 }, (_, i) => feed(i)),
    sleep: Array.from({ length: 10 }, (_, i) => nap(i, 1, 13)),
  });
  const p = previousWeekStats(data, NOW);
  assert.equal(p.feedDays, 7);
  assert.equal(p.sleepDays, 2, "sleep only reaches two days past the reported week");
  assert.equal(p.diaperDays, 0);
  assert.equal(p.sleepPerDayMs, 12 * HOUR);
  assert.equal(p.diapersPerDay, null);
});

test("every figure on the panel has a previous-week counterpart", () => {
  // The rows are paired one for one, so anything the current window can report
  // the previous window must be able to report too.
  const both = (i: number) => [feed(i, 100), feed(i, 100, 23)];
  const data = payload({
    feedings: Array.from({ length: 21 }, (_, i) => both(i)).flat(),
    sleep: Array.from({ length: 21 }, (_, i) => nap(i, 2, 6)),
    diapers: Array.from({ length: 21 }, (_, i) => diaper(i)),
  });
  const s = computeStats(data, NOW);
  const p = previousWeekStats(data, NOW);

  for (const key of Object.keys(s) as (keyof typeof s)[]) {
    assert.notEqual(p[key], null, `${key} has no previous-week figure`);
  }
  assert.equal(p.feedsPerDay, s.feedsPerDay, "and on a steady fixture they agree");
  assert.equal(p.nightFeedsPerNight, s.nightFeedsPerNight);
  assert.equal(p.poopsPerDay, s.poopsPerDay);
});

test("the longest sleep compared is the longest of that week, not of all time", () => {
  // An eight-hour night ten days ago belongs to the week before; the reported
  // week's longest is three hours. Each window answers for itself.
  const data = payload({
    sleep: [nap(10, 1, 9), nap(9, 1, 3), nap(2, 1, 4), nap(1, 1, 2)],
  });
  assert.equal(computeStats(data, NOW).longestSleepMs, 3 * HOUR);
  assert.equal(previousWeekStats(data, NOW).longestSleepMs, 8 * HOUR);
});
