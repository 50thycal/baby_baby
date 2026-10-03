import assert from "node:assert/strict";
import { test } from "node:test";
import { cumulativeSeries, feedRecords, projectDay, projectToday, totalsBetween } from "../lib/daily";
import { expectedWeightAt, weightTrend } from "../lib/weight";
import type { EventsPayload } from "../lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 2pm: far enough in that "so far" and "the rest of the day" are both non-empty.
const NOW = new Date(2026, 7, 12, 14, 0);

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: new Date(NOW.getTime() - 30 * DAY).toISOString(),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

/** A feed of `ml` at `hour` local time, `daysAgo` days back. */
const feed = (ml: number, daysAgo: number, hour: number) => {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 0, 0);
  const ts = new Date(d.getTime() + hour * HOUR).toISOString();
  return { id: `f${daysAgo}-${hour}-${ml}`, amount_ml: ml, ts, created_at: ts };
};

/** The same day, `n` days running: 100 mL at 1am, 9am, 6pm and 10pm. */
const routine = (n: number) =>
  Array.from({ length: n }, (_, i) => i + 1).flatMap((ago) => [
    feed(100, ago, 1),
    feed(100, ago, 9),
    feed(100, ago, 18),
    feed(100, ago, 22),
  ]);

// --- projectDay --------------------------------------------------------------

test("the expected finish is so-far plus what past days added after this hour", () => {
  // Two past days on a 5-point grid (0, 6, 12, 18, 24h). At 12h one had 10 and
  // finished on 30, the other had 20 and finished on 60: they added 20 and 40.
  const p = projectDay(5, [
    [0, 5, 10, 20, 30],
    [0, 10, 20, 40, 60],
  ], 0.5);
  assert.ok(p);
  assert.equal(p.expected, 5 + 30);
  assert.equal(p.days, 2);
});

test("the curve is NaN up to now and follows the past days' shape after it", () => {
  const p = projectDay(5, [[0, 5, 10, 20, 30]], 0.5);
  assert.ok(p);
  assert.ok(Number.isNaN(p.curve[0]) && Number.isNaN(p.curve[2]));
  assert.deepEqual(p.curve.slice(3), [15, 25]);
});

test("between grid samples the past day's 'now' is interpolated, not snapped", () => {
  // At 0.375 of the way through (between samples 1 and 2) the past day stood
  // at 7.5, so it went on to add 22.5 — not 20 or 25.
  const p = projectDay(0, [[0, 5, 10, 20, 30]], 0.375);
  assert.ok(p);
  assert.equal(p.expected, 22.5);
});

test("at midnight the expectation is simply the average day", () => {
  const p = projectDay(0, [[0, 0, 0, 0, 300], [0, 0, 0, 0, 500]], 0);
  assert.equal(p?.expected, 400);
});

test("no finished days, no projection — rather than a guess of zero", () => {
  assert.equal(projectDay(120, [], 0.5), null);
});

// --- projectToday ------------------------------------------------------------

test("projects from the shape of her days, not from this morning's rate", () => {
  // By 2pm she's had 200 of an ordinary 400 — but two of the four feeds are
  // still to come, in the evening. A straight-line rate would say ~343.
  const today = [feed(100, 0, 1), feed(100, 0, 9)];
  const p = projectToday(payload({ feedings: [...routine(7), ...today] }), NOW, "feed_ml");
  assert.ok(p);
  assert.equal(p.soFar, 200);
  assert.equal(p.expected, 400);
  assert.equal(p.days, 7);
});

test("a big morning carries through rather than being averaged away", () => {
  const today = [feed(250, 0, 1), feed(250, 0, 9)];
  const p = projectToday(payload({ feedings: [...routine(7), ...today] }), NOW, "feed_ml");
  assert.equal(p?.expected, 700);
});

test("the basis stops where the metric's own log starts", () => {
  // Only three finished days of feeds: the projection must not count four more
  // empty days as days she drank nothing in the evening.
  const p = projectToday(payload({ feedings: routine(3) }), NOW, "feed_ml");
  assert.ok(p);
  assert.equal(p.days, 3);
  assert.equal(p.expected, 200);
});

test("nothing logged before today, nothing to project from", () => {
  assert.equal(projectToday(payload({ feedings: [feed(100, 0, 1)] }), NOW, "feed_ml"), null);
});

test("sleep's expected finish never runs past the hours left in the day", () => {
  // Asleep the whole of every past day: the most the rest of today can add is
  // the ten hours left, whatever came before.
  const sleep = Array.from({ length: 3 }, (_, i) => {
    const from = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - (i + 1));
    const to = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
    return {
      id: `s${i}`,
      sleep_start: from.toISOString(),
      sleep_end: to.toISOString(),
      created_at: from.toISOString(),
    };
  });
  const p = projectToday(payload({ sleep }), NOW, "sleep_ms");
  assert.ok(p);
  assert.equal(p.soFar, 0);
  assert.equal(Math.round(p.expected / HOUR), 10);
});

// --- cumulativeSeries narrowing ------------------------------------------------

test("narrowing to the day doesn't change a single sample", () => {
  const data = payload({ feedings: [...routine(5), feed(100, 0, 3)] });
  const dayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 2).getTime();
  const series = cumulativeSeries(data, dayStart, "feed_ml");
  const slow = Array.from({ length: series.length }, (_, i) =>
    totalsBetween(data, dayStart, dayStart + i * 10 * 60_000).feedingMl,
  );
  assert.deepEqual(series, slow);
});

// --- feedRecords -------------------------------------------------------------

test("the biggest day and the biggest feed are found across everything", () => {
  const r = feedRecords(
    payload({ feedings: [feed(100, 20, 3), feed(150, 20, 9), feed(180, 5, 9), feed(60, 5, 12)] }),
  );
  assert.equal(r.biggestFeed?.ml, 180);
  assert.equal(r.biggestDay?.ml, 250);
  assert.equal(
    r.biggestDay?.dayStart,
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 20).getTime(),
  );
});

test("today counts: a partial day that already beats the record has set one", () => {
  const r = feedRecords(payload({ feedings: [feed(100, 3, 9), feed(120, 0, 2), feed(120, 0, 8)] }));
  assert.equal(r.biggestDay?.ml, 240);
  assert.equal(
    r.biggestDay?.dayStart,
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime(),
  );
});

test("a tie doesn't take the record from whoever set it first", () => {
  const r = feedRecords(payload({ feedings: [feed(150, 1, 9), feed(150, 4, 9)] }));
  assert.equal(r.biggestFeed?.at, new Date(feed(150, 4, 9).ts).getTime());
  assert.equal(
    r.biggestDay?.dayStart,
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 4).getTime(),
  );
});

test("no feeds, or only empty ones, is no record", () => {
  assert.deepEqual(feedRecords(payload()), { biggestFeed: null, biggestDay: null });
  assert.deepEqual(feedRecords(payload({ feedings: [feed(0, 1, 3)] })), {
    biggestFeed: null,
    biggestDay: null,
  });
});

// --- expectedWeightAt --------------------------------------------------------

test("weight carries the series' own pace forward from the last reading", () => {
  const t0 = NOW.getTime() - 14 * DAY;
  // 7 oz a week: 3000 g, then 14 days later 3000 + 14 oz.
  const trend = weightTrend([
    { grams: 3000, at: t0 },
    { grams: 3000 + Math.round(14 * 28.349523125), at: t0 + 14 * DAY },
  ]);
  assert.ok(trend);
  const at = t0 + 21 * DAY;
  const g = expectedWeightAt(trend, at);
  assert.ok(g !== null);
  // Seven days on at an ounce a day: seven more ounces.
  assert.ok(Math.abs(g - (trend.latest.grams + 7 * 28.349523125)) < 1);
});

test("no pace, or a reading already at that time, is no estimate", () => {
  const single = weightTrend([{ grams: 3000, at: NOW.getTime() - DAY }]);
  assert.ok(single);
  assert.equal(expectedWeightAt(single, NOW.getTime()), null);

  const two = weightTrend([
    { grams: 3000, at: NOW.getTime() - 10 * DAY },
    { grams: 3300, at: NOW.getTime() },
  ]);
  assert.ok(two);
  assert.equal(expectedWeightAt(two, NOW.getTime()), null);
});
