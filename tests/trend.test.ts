import assert from "node:assert/strict";
import { test } from "node:test";
import { dailyTotals, linearFit, type DailyPoint } from "../lib/daily";
import type { EventsPayload } from "../lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 7, 12, 14, 30);

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: new Date(NOW.getTime() - 60 * DAY).toISOString(),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

/** A feed of `ml` at `hour` (noon unless said otherwise), `daysAgo` days back. */
const feed = (ml: number, daysAgo: number, hour = 12) => {
  const d = new Date(
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 0, 0).getTime() +
      hour * HOUR,
  );
  return {
    id: `f${daysAgo}-${ml}-${hour}`,
    amount_ml: ml,
    ts: d.toISOString(),
    created_at: d.toISOString(),
  };
};

/**
 * A series starts where its log starts, and a first day whose earliest record
 * lands hours after midnight is dropped as a day logging began part-way through
 * (see `coverageStart`). These fixtures write one feed a day at noon, so without
 * something in the small hours of the oldest day every case below would lose it
 * — to the rule, not to the behaviour under test. A 0 mL entry anchors the
 * window without moving any total.
 */
const anchor = (daysAgo: number) => feed(0, daysAgo, 0.5);

// --- dailyTotals -------------------------------------------------------------

test("one point per finished day, oldest first", () => {
  const data = payload({ feedings: [feed(100, 1), feed(200, 2), feed(300, 3), anchor(3)] });
  const pts = dailyTotals(data, "feed_ml", NOW, 7);
  assert.deepEqual(pts.map((p) => p.value), [300, 200, 100]);
});

test("today is left out, however much has been logged", () => {
  // A partial day at the right-hand end would show a dip every morning, and a
  // trend fitted through it would report a decline that isn't real.
  const data = payload({ feedings: [feed(999, 0), feed(100, 1), feed(200, 2), anchor(2)] });
  const pts = dailyTotals(data, "feed_ml", NOW, 7);
  assert.ok(!pts.some((p) => p.value === 999), "today leaked into the series");
  assert.equal(pts.length, 2);
});

test("the day count is a cap, not a promise", () => {
  const data = payload({ feedings: [feed(100, 1), feed(200, 2), anchor(2)] });
  assert.equal(dailyTotals(data, "feed_ml", NOW, 30).length, 2, "only two days exist");
});

test("all asks for every finished day there is", () => {
  const data = payload({ feedings: [feed(50, 1), feed(50, 9), anchor(9)] });
  assert.equal(dailyTotals(data, "feed_ml", NOW, "all").length, 9);
});

test("days in the middle with nothing logged are zeros, not gaps", () => {
  // Dropping them would compress the x-axis and make a two-day gap look like
  // one day, which is exactly the sort of thing that flatters a trend.
  const data = payload({ feedings: [feed(100, 1), feed(300, 4), anchor(4)] });
  const pts = dailyTotals(data, "feed_ml", NOW, 7);
  assert.deepEqual(pts.map((p) => p.value), [300, 0, 0, 100]);
});

test("nothing logged has no series", () => {
  assert.deepEqual(dailyTotals(payload(), "feed_ml", NOW, 7), []);
});

test("a database younger than a day has no finished day yet", () => {
  const data = payload({ feedings: [feed(100, 0)] });
  assert.deepEqual(dailyTotals(data, "feed_ml", NOW, 7), []);
});

test("points land on local midnight", () => {
  const data = payload({ feedings: [feed(100, 1), feed(100, 2)] });
  for (const p of dailyTotals(data, "feed_ml", NOW, 7)) {
    const d = new Date(p.dayStart);
    assert.equal(d.getHours(), 0, `${d} is not midnight`);
    assert.equal(d.getMinutes(), 0);
  }
});

test("sleep totals come through in milliseconds", () => {
  const start = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 1, 0);
  const end = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 4, 0);
  const data = payload({
    sleep: [{ id: "s", sleep_start: start.toISOString(), sleep_end: end.toISOString(), created_at: start.toISOString() }],
  });
  const pts = dailyTotals(data, "sleep_ms", NOW, 3);
  assert.equal(pts[pts.length - 1].value, 3 * HOUR);
});

// --- linearFit ---------------------------------------------------------------

const pts = (values: number[]): DailyPoint[] =>
  values.map((value, i) => ({ dayStart: NOW.getTime() - (values.length - i) * DAY, value }));

test("a rising series fits a positive slope", () => {
  const t = linearFit(pts([100, 200, 300, 400]))!;
  assert.equal(t.slope, 100);
  assert.equal(Math.round(t.from), 100);
  assert.equal(Math.round(t.to), 400);
});

test("a falling series fits a negative slope", () => {
  assert.ok(linearFit(pts([400, 300, 200, 100]))!.slope < 0);
});

test("a flat series has no slope", () => {
  const t = linearFit(pts([250, 250, 250, 250]))!;
  assert.equal(t.slope, 0);
});

test("noise around a rising line still reads as rising", () => {
  // The point of fitting rather than comparing the endpoints: the last day
  // here is lower than the one before it, and the trend is still up.
  const t = linearFit(pts([300, 340, 320, 400, 380, 460, 430]))!;
  assert.ok(t.slope > 0, `slope was ${t.slope}`);
});

test("two points state no trend, because two points are always a line", () => {
  assert.equal(linearFit(pts([100, 400])), null);
  assert.equal(linearFit(pts([100])), null);
  assert.equal(linearFit(pts([])), null);
});

test("the fitted endpoints bracket the fit, not the raw data", () => {
  // A single wild day shouldn't drag the drawn line out to meet it.
  const t = linearFit(pts([300, 300, 300, 900, 300, 300, 300]))!;
  assert.ok(t.from < 900 && t.to < 900);
});

// --- when a direction is worth claiming --------------------------------------

test("a clear climb is significant", () => {
  assert.equal(linearFit(pts([300, 340, 380, 420, 460, 500, 540]))!.significant, true);
});

test("scatter with no direction is not", () => {
  // The fit will have some slope — every fit does. It just isn't news.
  const t = linearFit(pts([4, 3, 1, 5, 1, 3, 3]))!;
  assert.notEqual(t.slope, 0, "the raw fit does tilt");
  assert.equal(t.significant, false, "but the tilt is smaller than the scatter");
});

test("a perfectly flat series claims nothing", () => {
  assert.equal(linearFit(pts([250, 250, 250, 250]))!.significant, false);
});

test("a small drift buried in big swings is not significant", () => {
  const t = linearFit(pts([579, 584, 592, 581, 575, 606, 549]))!;
  assert.equal(t.significant, false, `slope ${t.slope} vs the day-to-day swing`);
});

test("the same drift over enough days does become significant", () => {
  // Nothing about the daily change differs — there's just enough of it now to
  // outrun the scatter, which is exactly when it deserves to be reported.
  const rising = Array.from({ length: 40 }, (_, i) => 400 + i * 6);
  assert.equal(linearFit(pts(rising))!.significant, true);
});

test("significance doesn't depend on the unit", () => {
  // Milliseconds and millilitres get the same treatment: the test is the move
  // against the spread, both in the metric's own unit.
  const ml = linearFit(pts([300, 340, 380, 420, 460]))!;
  const ms = linearFit(pts([300, 340, 380, 420, 460].map((v) => v * 60_000)))!;
  assert.equal(ml.significant, ms.significant);
});
