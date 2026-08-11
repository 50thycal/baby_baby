import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALL_MAX_WIDTH_PX,
  ALL_MIN_PX_PER_HOUR,
  firstStamp,
  scaleFor,
  timelineWindow,
} from "../lib/timeline-scale";
import type { EventsPayload } from "../lib/types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date(2026, 7, 11, 12, 0);
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: "2000-01-01T00:00:00.000Z",
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

const feed = (msAgo: number) => ({
  id: `f${msAgo}`,
  amount_ml: 60,
  ts: at(msAgo),
  created_at: at(msAgo),
});

// --- fixed ranges ------------------------------------------------------------

test("the fixed ranges keep their hand-tuned density", () => {
  assert.deepEqual(scaleFor("24h", 24), { pxPerHour: 56, tickHours: 3 });
  assert.deepEqual(scaleFor("1w", 168), { pxPerHour: 12, tickHours: 12 });
});

test("a fixed range ignores the span it's handed", () => {
  // Its span is known in advance; only `all` has to work it out.
  assert.deepEqual(scaleFor("3d", 9_999), scaleFor("3d", 1));
});

test("a fixed range draws exactly the window the server returned", () => {
  const data = payload({ start: at(3 * DAY), feedings: [feed(2 * DAY)] });
  const w = timelineWindow(data, "3d");
  assert.equal(w.start, new Date(data.start).getTime());
  assert.equal(w.end, NOW.getTime());
});

// --- all: the window ---------------------------------------------------------

test("all starts at the first entry, not at the server's floor", () => {
  // The floor is the year 2000. Drawing from there would be a canvas of empty
  // decades with everything crushed against the right-hand edge.
  const data = payload({ feedings: [feed(5 * DAY), feed(2 * DAY)] });
  const w = timelineWindow(data, "all");
  assert.equal(w.start, NOW.getTime() - 5 * DAY);
});

test("all considers every kind of entry when finding the first one", () => {
  const data = payload({
    feedings: [feed(2 * DAY)],
    diapers: [{ id: "d", type: "pee", ts: at(9 * DAY), created_at: at(9 * DAY) }],
    comments: [
      { id: "c", ts: at(4 * DAY), text: "hi", reactions: {}, created_at: at(4 * DAY) },
    ],
  });
  assert.equal(timelineWindow(data, "all").start, NOW.getTime() - 9 * DAY);
});

test("a sleep that started before anything else still anchors the window", () => {
  const data = payload({
    feedings: [feed(1 * DAY)],
    sleep: [{ id: "s", sleep_start: at(6 * DAY), sleep_end: at(5 * DAY), created_at: at(6 * DAY) }],
  });
  assert.equal(timelineWindow(data, "all").start, NOW.getTime() - 6 * DAY);
});

test("all on an empty database falls back to a day, not to the year 2000", () => {
  const w = timelineWindow(payload(), "all");
  assert.equal(w.end - w.start, DAY);
});

test("firstStamp is null when nothing has been logged", () => {
  assert.equal(firstStamp(payload()), null);
});

// --- all: the scale ----------------------------------------------------------

test("all never draws denser than the week view", () => {
  // A couple of days of data would otherwise fit at 87 px/hour, which would
  // make `All` blockier than `24h` — the opposite of what it's for.
  assert.ok(scaleFor("all", 48).pxPerHour <= 12);
});

test("all keeps the whole canvas within a scrollable width", () => {
  // Holds for any history this app will realistically hold — see below for
  // where it deliberately stops holding.
  for (const days of [3, 30, 120, 365, 365 * 2]) {
    const spanHours = days * 24;
    const { pxPerHour } = scaleFor("all", spanHours);
    assert.ok(
      spanHours * pxPerHour <= ALL_MAX_WIDTH_PX + 1,
      `${days} days wanted ${Math.round(spanHours * pxPerHour)}px`,
    );
  }
});

test("past a few years the canvas grows rather than squashing to nothing", () => {
  // The width budget and the readability floor disagree eventually, and the
  // floor is the one that wins: a long scroll beats an untappable smear.
  const spanHours = 365 * 8 * 24;
  const { pxPerHour } = scaleFor("all", spanHours);
  assert.equal(pxPerHour, ALL_MIN_PX_PER_HOUR);
  assert.ok(spanHours * pxPerHour > ALL_MAX_WIDTH_PX);
});

test("all gets sparser as the history grows", () => {
  const week = scaleFor("all", 7 * 24).pxPerHour;
  const year = scaleFor("all", 365 * 24).pxPerHour;
  assert.ok(year < week, "a year of history should be scaled down, not drawn at week density");
});

test("gridlines stay far enough apart to be readable at every span", () => {
  for (const days of [1, 5, 64, 365, 365 * 5]) {
    const { pxPerHour, tickHours } = scaleFor("all", days * 24);
    assert.ok(
      tickHours * pxPerHour >= 56,
      `${days} days spaced gridlines ${Math.round(tickHours * pxPerHour)}px apart`,
    );
  }
});

test("gridline steps coarsen with the span rather than jumping about", () => {
  const steps = [5, 64, 365, 365 * 4].map((d) => scaleFor("all", d * 24).tickHours);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] >= steps[i - 1], `step went backwards: ${steps.join(", ")}`);
  }
});

test("a span of nearly nothing doesn't divide by zero", () => {
  const s = scaleFor("all", 0);
  assert.ok(Number.isFinite(s.pxPerHour) && s.pxPerHour > 0);
  assert.ok(Number.isFinite(s.tickHours) && s.tickHours > 0);
});

test("one stray old entry compresses the view instead of breaking it", () => {
  // The real case this was built for: a feed mistyped as 6/8 rather than 8/6,
  // sitting two months before everything else. It has to be reachable.
  const data = payload({ feedings: [feed(64 * DAY), feed(2 * HOUR), feed(5 * HOUR)] });
  const { start, end } = timelineWindow(data, "all");
  const { pxPerHour } = scaleFor("all", (end - start) / HOUR);
  const width = ((end - start) / HOUR) * pxPerHour;

  assert.equal(start, NOW.getTime() - 64 * DAY, "the stray entry is the left-hand edge");
  assert.ok(width <= ALL_MAX_WIDTH_PX + 1, `canvas was ${Math.round(width)}px`);
  assert.ok(width > 500, "and not so squashed that nothing is tappable");
});
