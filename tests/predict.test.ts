import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dayPace,
  likelyAmount,
  nextFeedWindow,
  quantile,
  wakeWindow,
} from "../lib/predict";
import type { EventsPayload, Feeding, SleepSession } from "../lib/types";

const NOW = new Date(2026, 7, 10, 12, 0); // 10 Aug 2026, midday
const MIN = 60_000;
const HOUR = 3_600_000;

const feedAt = (ms: number, ml: number): Feeding => ({
  id: String(ms),
  amount_ml: ml,
  ts: new Date(ms).toISOString(),
  created_at: new Date(ms).toISOString(),
});

/** Feeds every `gapHours`, ending `endsAgoH` hours before NOW. */
function evenFeeds(count: number, gapHours: number, endsAgoH = 0, ml = 50): Feeding[] {
  const out: Feeding[] = [];
  for (let i = 0; i < count; i++) {
    out.push(feedAt(NOW.getTime() - endsAgoH * HOUR - (count - 1 - i) * gapHours * HOUR, ml));
  }
  return out;
}

const napAt = (startMs: number, durMs: number | null, id = String(startMs)): SleepSession => ({
  id,
  sleep_start: new Date(startMs).toISOString(),
  sleep_end: durMs === null ? null : new Date(startMs + durMs).toISOString(),
  created_at: new Date(startMs).toISOString(),
});

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: new Date(NOW.getTime() - 7 * 86_400_000).toISOString(),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  ...over,
});

// --- quantile ---------------------------------------------------------------

test("quantile interpolates and handles the ends", () => {
  const xs = [1, 2, 3, 4];
  assert.equal(quantile(xs, 0), 1);
  assert.equal(quantile(xs, 1), 4);
  assert.equal(quantile(xs, 0.5), 2.5);
  assert.equal(quantile([7], 0.5), 7);
});

// --- next feed --------------------------------------------------------------

test("refuses to predict a feed window without enough gaps", () => {
  assert.equal(nextFeedWindow(evenFeeds(3, 3), NOW), null);
});

test("evenly spaced feeds give a window centred on that spacing", () => {
  // Eight feeds three hours apart, the last one an hour ago.
  const w = nextFeedWindow(evenFeeds(8, 3, 1), NOW);
  assert.ok(w);
  assert.equal(w.samples, 7);
  // Perfectly even spacing would collapse the quartiles onto 3h exactly; the
  // floor keeps it a range centred there.
  assert.equal((w.lowMs + w.highMs) / 2, 3 * HOUR);
  assert.equal(w.highMs - w.lowMs, 40 * MIN);
  // Last feed was 1h ago, so the middle of the window is about 2h away.
  assert.equal((w.from.getTime() + w.to.getTime()) / 2, NOW.getTime() + 2 * HOUR);
  assert.equal(w.overdue, false);
});

test("the window widens when her spacing is irregular", () => {
  const base = NOW.getTime() - 20 * HOUR;
  const offsets = [0, 2, 5, 6, 9, 13, 14, 18].map((h) => h * HOUR);
  const feeds = offsets.map((o) => feedAt(base + o, 50));
  const w = nextFeedWindow(feeds, NOW);
  assert.ok(w);
  assert.ok(w.highMs > w.lowMs, "an irregular pattern should not give a zero-width window");
});

test("a long gap since the last feed reads as overdue", () => {
  // Regular three-hour spacing, but nothing for five hours.
  const w = nextFeedWindow(evenFeeds(8, 3, 5), NOW);
  assert.ok(w);
  assert.equal(w.overdue, true);
  assert.ok(w.to.getTime() < NOW.getTime());
});

test("feeds logged in the future are ignored", () => {
  const feeds = [...evenFeeds(8, 3, 1), feedAt(NOW.getTime() + 2 * HOUR, 99)];
  const w = nextFeedWindow(feeds, NOW);
  assert.ok(w);
  assert.equal(w.lastFeedAt.getTime(), NOW.getTime() - HOUR);
});

test("stale history beyond the lookback is dropped", () => {
  const old = evenFeeds(8, 3, 24 * 30); // a month ago
  assert.equal(nextFeedWindow(old, NOW), null);
});

// --- amount -----------------------------------------------------------------

test("refuses an amount hint on too few feeds", () => {
  assert.equal(likelyAmount(evenFeeds(4, 3), NOW), null);
});

test("a steady diet reads as steady", () => {
  const hint = likelyAmount(evenFeeds(10, 3, 0, 50), NOW);
  assert.ok(hint);
  assert.equal(hint.medianMl, 50);
  assert.equal(hint.trend, "steady");
});

test("a climbing diet is called out as trending up", () => {
  // 20 mL early in the window, 55 mL lately — her actual first week.
  const early = evenFeeds(6, 3, 30, 20);
  const late = evenFeeds(6, 3, 3, 55);
  const hint = likelyAmount([...early, ...late], NOW);
  assert.ok(hint);
  assert.equal(hint.trend, "up");
  assert.ok(hint.highMl > hint.lowMl);
});

test("a falling diet is called out as trending down", () => {
  const hint = likelyAmount([...evenFeeds(6, 3, 30, 60), ...evenFeeds(6, 3, 3, 30)], NOW);
  assert.ok(hint);
  assert.equal(hint.trend, "down");
});

test("one huge bottle doesn't move the quartiles much", () => {
  const normal = evenFeeds(11, 3, 0, 50);
  const withOutlier = [...normal.slice(0, -1), feedAt(NOW.getTime(), 400)];
  const a = likelyAmount(normal, NOW);
  const b = likelyAmount(withOutlier, NOW);
  assert.ok(a && b);
  assert.equal(a.medianMl, b.medianMl, "median should be unmoved by a single outlier");
});

// --- wake -------------------------------------------------------------------

test("refuses a wake window without enough comparable sleeps", () => {
  const active = napAt(NOW.getTime() - HOUR, null, "active");
  const history = [napAt(NOW.getTime() - 30 * HOUR, HOUR)];
  assert.equal(wakeWindow([...history, active], active, NOW), null);
});

test("naps and night sleep are pooled separately", () => {
  const active = napAt(new Date(2026, 7, 10, 11, 0).getTime(), null, "active"); // 11am nap
  const naps = [
    napAt(new Date(2026, 7, 9, 10, 0).getTime(), 1 * HOUR),
    napAt(new Date(2026, 7, 9, 14, 0).getTime(), 1 * HOUR),
    napAt(new Date(2026, 7, 8, 11, 0).getTime(), 1 * HOUR),
  ];
  const nights = [
    napAt(new Date(2026, 7, 9, 22, 0).getTime(), 6 * HOUR),
    napAt(new Date(2026, 7, 8, 22, 0).getTime(), 6 * HOUR),
    napAt(new Date(2026, 7, 7, 22, 0).getTime(), 6 * HOUR),
  ];
  const w = wakeWindow([...naps, ...nights, active], active, NOW);
  assert.ok(w);
  assert.equal(w.kind, "nap");
  assert.equal((w.lowMs + w.highMs) / 2, HOUR, "six-hour nights must not inflate a nap estimate");
  assert.equal(w.samples, 3);
});

test("a night sleep is estimated from other nights", () => {
  const active = napAt(new Date(2026, 7, 9, 22, 0).getTime(), null, "active");
  const nights = [
    napAt(new Date(2026, 7, 8, 22, 0).getTime(), 5 * HOUR),
    napAt(new Date(2026, 7, 7, 21, 30).getTime(), 5 * HOUR),
    napAt(new Date(2026, 7, 6, 23, 0).getTime(), 5 * HOUR),
  ];
  const w = wakeWindow([...nights, active], active, NOW);
  assert.ok(w);
  assert.equal(w.kind, "night");
  assert.equal((w.lowMs + w.highMs) / 2, 5 * HOUR);
});

test("the active session never counts as its own history", () => {
  const active = napAt(NOW.getTime() - HOUR, null, "active");
  const naps = [
    napAt(new Date(2026, 7, 9, 10, 0).getTime(), 90 * MIN),
    napAt(new Date(2026, 7, 9, 14, 0).getTime(), 90 * MIN),
    napAt(new Date(2026, 7, 8, 11, 0).getTime(), 90 * MIN),
  ];
  const w = wakeWindow([...naps, active], active, NOW);
  assert.ok(w);
  assert.equal(w.samples, 3);
});

// --- day pace ---------------------------------------------------------------

test("refuses a pace without enough complete days", () => {
  const feeds = [feedAt(NOW.getTime() - 26 * HOUR, 100)];
  assert.equal(dayPace(payload({ feedings: feeds }), NOW), null);
});

test("pace compares with the same time of day, not the finished total", () => {
  const dayStart = new Date(2026, 7, 10).getTime();
  const feeds: Feeding[] = [];
  // Three previous days: 100 mL before midday, 300 mL by bedtime.
  for (let d = 1; d <= 3; d++) {
    feeds.push(feedAt(dayStart - d * 86_400_000 + 9 * HOUR, 100));
    feeds.push(feedAt(dayStart - d * 86_400_000 + 20 * HOUR, 200));
  }
  // Today: 150 mL so far — ahead of the usual 100 by this hour.
  feeds.push(feedAt(dayStart + 9 * HOUR, 150));

  const pace = dayPace(payload({ feedings: feeds }), NOW);
  assert.ok(pace);
  assert.equal(pace.todayMl, 150);
  assert.equal(pace.expectedByNowMl, 100, "must compare against this hour, not the whole day");
  assert.equal(pace.typicalFullDayMl, 300);
  assert.equal(pace.deltaMl, 50);
  assert.equal(pace.days, 3);
});

test("days with nothing logged are skipped rather than counted as zero", () => {
  const dayStart = new Date(2026, 7, 10).getTime();
  const feeds = [
    feedAt(dayStart - 86_400_000 + 9 * HOUR, 300),
    // Nothing at all two days ago — a gap in the record, not a fast.
    feedAt(dayStart - 3 * 86_400_000 + 9 * HOUR, 300),
  ];
  const pace = dayPace(payload({ feedings: feeds }), NOW);
  assert.ok(pace);
  assert.equal(pace.days, 2);
  assert.equal(pace.typicalFullDayMl, 300, "an empty day would have halved this");
});

test("a window is never narrower than the honesty floor", () => {
  // Metronomic feeding would otherwise render as "5:00 - 5:00".
  const w = nextFeedWindow(evenFeeds(10, 3), NOW);
  assert.ok(w);
  assert.ok(w.to.getTime() - w.from.getTime() >= 40 * MIN, "window collapsed to a point");
});

test("a genuinely wide spread is left alone, not squeezed to the floor", () => {
  const base = NOW.getTime() - 30 * HOUR;
  const feeds = [0, 2, 6, 7, 12, 18, 20, 28].map((h) => feedAt(base + h * HOUR, 50));
  const w = nextFeedWindow(feeds, NOW);
  assert.ok(w);
  assert.ok(w.highMs - w.lowMs > 40 * MIN, "real spread should survive");
});
