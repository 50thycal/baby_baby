import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  compareToYesterday,
  computeStats,
  cumulativeSeries,
  startOfDay,
  totalsBetween,
} from "../lib/daily";
import type { EventsPayload } from "../lib/types";

const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const feed = (id: string, ml: number, ts: string) => ({
  id,
  amount_ml: ml,
  ts,
  created_at: ts,
});
const diaper = (id: string, type: string, ts: string) =>
  ({ id, type, ts, created_at: ts }) as EventsPayload["diapers"][number];
const nap = (id: string, from: string, to: string | null) => ({
  id,
  sleep_start: from,
  sleep_end: to,
  created_at: from,
});

const NOW = new Date(2026, 7, 10, 12, 0); // 10 Aug 2026, midday

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: at(2026, 8, 7, 0),
  end: at(2026, 8, 10, 12),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

test("startOfDay and addDays work in local time", () => {
  const s = startOfDay(NOW);
  assert.equal(s.getHours(), 0);
  assert.equal(s.getDate(), 10);
  assert.equal(addDays(NOW, -1).getDate(), 9);
});

test("totals only count what falls inside the window", () => {
  const data = payload({
    feedings: [
      feed("a", 20, at(2026, 8, 10, 2)),
      feed("b", 30, at(2026, 8, 10, 11)),
      feed("c", 99, at(2026, 8, 9, 23)), // yesterday
    ],
  });
  const t = totalsBetween(data, startOfDay(NOW).getTime(), NOW.getTime());
  assert.equal(t.feedingMl, 50);
  assert.equal(t.feedCount, 2);
});

test("only dirty diapers count toward poops", () => {
  const data = payload({
    diapers: [
      diaper("1", "pee", at(2026, 8, 10, 1)),
      diaper("2", "poop", at(2026, 8, 10, 2)),
      diaper("3", "both", at(2026, 8, 10, 3)),
      diaper("4", "massive_blowout", at(2026, 8, 10, 4)),
    ],
  });
  const t = totalsBetween(data, startOfDay(NOW).getTime(), NOW.getTime());
  assert.equal(t.diaperCount, 4);
  assert.equal(t.poopCount, 3);
});

test("sleep across midnight is split between the two days", () => {
  const data = payload({ sleep: [nap("s", at(2026, 8, 9, 23), at(2026, 8, 10, 1))] });
  const todayStart = startOfDay(NOW).getTime();
  const today = totalsBetween(data, todayStart, NOW.getTime());
  const yesterday = totalsBetween(data, addDays(NOW, -1).getTime(), todayStart);
  assert.equal(today.sleepMs, 3600_000, "1h should land on today");
  assert.equal(yesterday.sleepMs, 3600_000, "1h should land on yesterday");
});

test("the comparison is against yesterday at the same time, not the whole day", () => {
  const data = payload({
    feedings: [
      feed("t1", 100, at(2026, 8, 10, 9)), // today, before noon
      feed("y1", 60, at(2026, 8, 9, 9)), // yesterday morning
      feed("y2", 240, at(2026, 8, 9, 20)), // yesterday evening — after "now"
    ],
  });
  const c = compareToYesterday(data, NOW);
  assert.equal(c.today.feedingMl, 100);
  assert.equal(c.yesterdaySoFar.feedingMl, 60, "must exclude yesterday's evening feed");
  assert.equal(c.yesterdayFull.feedingMl, 300, "full day still reported for context");
  // The point of the whole exercise: ahead by 40, not behind by 200.
  assert.ok(c.today.feedingMl > c.yesterdaySoFar.feedingMl);
});

test("elapsed is measured from local midnight", () => {
  const c = compareToYesterday(payload(), NOW);
  assert.equal(c.elapsedMs, 12 * 3600_000);
});

test("cumulative series is monotonic and ends at the day's total", () => {
  const data = payload({
    feedings: [
      feed("a", 20, at(2026, 8, 10, 2)),
      feed("b", 30, at(2026, 8, 10, 8)),
      feed("c", 50, at(2026, 8, 10, 20)),
    ],
  });
  const series = cumulativeSeries(data, startOfDay(NOW).getTime(), "feed_ml");
  for (let i = 1; i < series.length; i++) {
    assert.ok(series[i] >= series[i - 1], `series dipped at ${i}`);
  }
  assert.equal(series[0], 0);
  assert.equal(series[series.length - 1], 100);
});

test("both days' series have the same length so they can be overlaid", () => {
  const data = payload();
  const a = cumulativeSeries(data, startOfDay(NOW).getTime(), "feed_ml");
  const b = cumulativeSeries(data, addDays(NOW, -1).getTime(), "feed_ml");
  assert.equal(a.length, b.length);
});

test("averages exclude today, which is only half over", () => {
  const data = payload({
    feedings: [
      // Two complete days: 8th and 9th, 100 mL each. The 8th's feed is in the
      // small hours so the day reads as watched from midnight — a first day
      // whose earliest entry is late morning is dropped as one where logging
      // only started at that point.
      feed("a", 100, at(2026, 8, 8, 1)),
      feed("b", 100, at(2026, 8, 9, 10)),
      // Today — must not drag the average down.
      feed("c", 10, at(2026, 8, 10, 9)),
    ],
  });
  const s = computeStats(data, NOW);
  assert.equal(s.days, 2);
  assert.equal(s.mlPerDay, 100, "today's partial 10 mL leaked into the average");
  assert.equal(s.feedsPerDay, 1);
});

test("stats are empty rather than wrong before a full day exists", () => {
  const data = payload({ feedings: [feed("a", 20, at(2026, 8, 10, 9))] });
  const s = computeStats(data, NOW);
  assert.equal(s.days, 0);
  assert.equal(s.mlPerDay, null);
});

test("no data at all doesn't throw", () => {
  const s = computeStats(payload(), NOW);
  assert.equal(s.days, 0);
  assert.equal(s.longestSleepMs, 0);
});

test("night feeds count the 10pm–6am window across midnight", () => {
  const data = payload({
    feedings: [
      feed("n0", 10, at(2026, 8, 8, 2)), // night — and the day's earliest entry
      feed("d2", 10, at(2026, 8, 8, 6)), // day (boundary: 6am is morning)
      feed("n1", 10, at(2026, 8, 8, 23)), // night
      feed("n2", 10, at(2026, 8, 9, 3)), // night
      feed("d1", 10, at(2026, 8, 9, 13)), // day
      feed("n3", 10, at(2026, 8, 9, 22)), // night (boundary: 10pm is night)
    ],
  });
  const s = computeStats(data, NOW);
  assert.equal(s.days, 2);
  assert.equal(s.nightFeedsPerNight, 2, "4 night feeds over 2 days");
});

test("awake stretches are the gaps between naps, not the naps", () => {
  const data = payload({
    sleep: [
      nap("s1", at(2026, 8, 9, 1), at(2026, 8, 9, 2)), // 1h nap
      nap("s2", at(2026, 8, 9, 4), at(2026, 8, 9, 5)), // 1h nap, 2h after
    ],
  });
  const s = computeStats(data, NOW);
  assert.equal(s.avgNapMs, 3600_000);
  assert.equal(s.avgAwakeStretchMs, 2 * 3600_000);
});

test("an unfinished nap is clipped to the window, not treated as endless", () => {
  const data = payload({ sleep: [nap("s", at(2026, 8, 10, 11), null)] });
  const todayStart = startOfDay(NOW).getTime();
  const t = totalsBetween(data, todayStart, NOW.getTime());
  assert.equal(t.sleepMs, 3600_000, "should be the hour so far, not more");
});
