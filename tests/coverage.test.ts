import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeStats,
  coverageStart,
  dailyTotals,
  metricKind,
  startOfDay,
} from "../lib/daily";
import type { EventsPayload } from "../lib/types";

/**
 * Where each series begins.
 *
 * The three logs didn't start together — feeds were written down from birth,
 * sleep and nappies weeks later. Days from before a log existed look identical
 * to days of nothing, and counted as zeroes they invent a climb that never
 * happened: the trend line sweeps up out of a fortnight of false zeroes, the
 * sleep clock flattens every band, and the averages panel reports half the
 * sleep the chart above it just drew.
 *
 * So each series starts where its own log starts. Only the leading edge is
 * trimmed — a gap in the middle is a day someone forgot, which is real.
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

/** `daysAgo` back at `hour` (fractional hours allowed), in local time. */
const at = (daysAgo: number, hour: number) =>
  new Date(
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 0, 0).getTime() +
      hour * HOUR,
  );

const feed = (daysAgo: number, hour: number, ml = 60) => ({
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

const diaper = (daysAgo: number, hour: number) => ({
  id: `d${daysAgo}-${hour}`,
  type: "poop" as const,
  ts: at(daysAgo, hour).toISOString(),
  created_at: at(daysAgo, hour).toISOString(),
});

const dayStart = (daysAgo: number) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo).getTime();

// --- metricKind ---------------------------------------------------------------

test("every metric names the log it is drawn from", () => {
  assert.equal(metricKind("feed_ml"), "feedings");
  assert.equal(metricKind("feed_count"), "feedings");
  assert.equal(metricKind("sleep_ms"), "sleep");
  assert.equal(metricKind("diaper_count"), "diapers");
  assert.equal(metricKind("poop_count"), "diapers");
});

// --- coverageStart ------------------------------------------------------------

test("a log that was never written to has no start", () => {
  assert.equal(coverageStart(payload(), "sleep", NOW), null);
});

test("a first day watched from midnight counts from that day", () => {
  // 01:30 is inside the first four hours, so someone was already logging when
  // the day began.
  const data = payload({ feedings: [feed(5, 1.5), feed(5, 12), feed(1, 9)] });
  assert.equal(coverageStart(data, "feedings", NOW), dayStart(5));
});

test("a first day that only starts at lunchtime is dropped", () => {
  // A newborn feeds through the small hours. Nothing before 14:00 doesn't mean
  // she went without — it means nobody was writing it down yet.
  const data = payload({ feedings: [feed(5, 14), feed(4, 2), feed(1, 9)] });
  assert.equal(coverageStart(data, "feedings", NOW), dayStart(4));
});

test("each log answers for itself", () => {
  const data = payload({
    feedings: [feed(20, 1), feed(1, 9)],
    sleep: [nap(3, 1, 5)],
    diapers: [diaper(9, 2), diaper(1, 8)],
  });
  assert.equal(coverageStart(data, "feedings", NOW), dayStart(20));
  assert.equal(coverageStart(data, "sleep", NOW), dayStart(3));
  assert.equal(coverageStart(data, "diapers", NOW), dayStart(9));
});

test("an evening bedtime is a late start for its own day, but covers the next", () => {
  // First session ever recorded runs 22:00 to 06:00. Its own day saw eight
  // hours of unrecorded daylight before it, so that day goes; the day it runs
  // into is watched from midnight and is where the clock starts.
  const data = payload({
    sleep: [{ ...nap(4, 22, 24), sleep_end: at(3, 6).toISOString() }, nap(3, 13, 14)],
  });
  assert.equal(coverageStart(data, "sleep", NOW), dayStart(3));
});

test("logged only today, so there is nothing finished to start from", () => {
  assert.equal(coverageStart(payload({ feedings: [feed(0, 1)] }), "feedings", NOW), null);
});

test("a first day with an entry that lands only on the next day still moves on", () => {
  const data = payload({ feedings: [feed(3, 23.5), feed(2, 1)] });
  assert.equal(coverageStart(data, "feedings", NOW), dayStart(2));
});

// --- what it changes ----------------------------------------------------------

test("the trend line starts where its own log starts, not where the app does", () => {
  // Feeds for a fortnight; nappies only for the last three days. Before this
  // rule the nappy chart drew eleven zeroes and then a jump, and the fit read
  // that as a steep and entirely fictional climb.
  const data = payload({
    feedings: Array.from({ length: 14 }, (_, i) => feed(i, 1)),
    diapers: [diaper(3, 1), diaper(2, 2), diaper(1, 3)],
  });

  assert.equal(dailyTotals(data, "feed_ml", NOW, "all").length, 13, "feeds go back a fortnight");

  const poops = dailyTotals(data, "poop_count", NOW, "all");
  assert.equal(poops.length, 3, "nappies only go back three days");
  assert.deepEqual(poops.map((p) => p.value), [1, 1, 1], "and none of them is a false zero");
});

test("a day in the middle with nothing logged is still a zero", () => {
  // The trim is one-ended on purpose. This day is a day someone forgot, which
  // is a real thing that happened and belongs on the chart.
  const data = payload({ diapers: [diaper(3, 1), diaper(1, 3)] });
  assert.deepEqual(
    dailyTotals(data, "poop_count", NOW, "all").map((p) => p.value),
    [1, 0, 1],
  );
});

test("each average is divided by its own days, not by the oldest log's", () => {
  // Feeds for a fortnight, sleep for the last two days at twelve hours a day.
  // Divided by fourteen that reads as under two hours a night; divided by the
  // two days sleep was actually logged it reads as twelve, which is the truth
  // and is also what the chart directly above it draws.
  const data = payload({
    feedings: Array.from({ length: 14 }, (_, i) => feed(i, 1, 100)),
    sleep: [nap(2, 1, 13), nap(1, 1, 13)],
  });
  const s = computeStats(data, NOW);

  assert.equal(s.feedDays, 13, "thirteen finished days of feeds");
  assert.equal(s.sleepDays, 2);
  assert.equal(s.diaperDays, 0, "nappies were never logged");
  assert.equal(s.days, 13, "the panel's widest window");

  assert.equal(s.mlPerDay, 100);
  assert.equal(s.sleepPerDayMs, 12 * HOUR);
  assert.equal(s.awakePerDayMs, 12 * HOUR);
});

test("a log with nothing in it reports no rate rather than zero", () => {
  // Zero nappies a day is a claim about her. "Not logged yet" is the truth.
  const data = payload({ feedings: [feed(3, 1), feed(1, 2)] });
  const s = computeStats(data, NOW);
  assert.equal(s.diapersPerDay, null);
  assert.equal(s.poopsPerDay, null);
  assert.equal(s.sleepPerDayMs, null);
  assert.equal(s.awakePerDayMs, null, "awake is derived from sleep, so it is unknown too");
  assert.equal(s.longestSleepMs, 0);
});

test("the day counts are whole days, ending at last midnight", () => {
  const data = payload({ feedings: [feed(6, 1), feed(0, 9)] });
  const s = computeStats(data, NOW);
  assert.equal(s.feedDays, 6);
  assert.equal(
    startOfDay(NOW).getTime() - dayStart(6),
    6 * 24 * HOUR,
    "six days between the first covered midnight and today's",
  );
});
