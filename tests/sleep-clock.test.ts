import assert from "node:assert/strict";
import { test } from "node:test";
import { oddsAsleepAt, sleepClock, slotAt, typicalSleepWindow } from "../lib/daily";
import type { EventsPayload } from "../lib/types";

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

/** A sleep on the day `daysAgo` back, from `fromH` to `toH` local. */
const nap = (daysAgo: number, fromH: number, toH: number, id = `${daysAgo}-${fromH}`) => {
  const d = (h: number) =>
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, 0, 0).getTime() +
    h * 3_600_000;
  return {
    id,
    sleep_start: new Date(d(fromH)).toISOString(),
    sleep_end: new Date(d(toH)).toISOString(),
    created_at: new Date(d(fromH)).toISOString(),
  };
};

/** Which hour a slot index falls in, for a given slot size. */
const hourOf = (slot: number, slotMinutes: number) => (slot * slotMinutes) / 60;

// --- sleepClock ---------------------------------------------------------------

test("a single night shows up exactly where it happened", () => {
  const data = payload({ sleep: [nap(1, 2, 4)] });
  const clock = sleepClock(data, NOW, 1);

  assert.equal(clock.dayCount, 1);
  for (const [i, f] of clock.slots.entries()) {
    const h = hourOf(i, clock.slotMinutes);
    const expected = h >= 2 && h < 4 ? 1 : 0;
    assert.equal(f, expected, `slot at ${h}:00 was ${f}, expected ${expected}`);
  }
});

test("the axis runs midnight to midnight", () => {
  const clock = sleepClock(payload({ sleep: [nap(1, 0, 1)] }), NOW, 1);
  assert.equal(clock.slots.length, (24 * 60) / clock.slotMinutes);
  assert.equal(clock.slots[0], 1, "the first slot is midnight");
});

test("two days average rather than add up", () => {
  // Asleep 2–4 on one day, 2–4 on the other: still 1, not 2.
  const both = sleepClock(payload({ sleep: [nap(1, 2, 4), nap(2, 2, 4, "b")] }), NOW, 2);
  const at3 = both.slots[Math.round((3 * 60) / both.slotMinutes)];
  assert.equal(at3, 1);
});

test("a quiet day in the middle still counts as a day", () => {
  // Sleep logged three days back and one day back, nothing in between. The
  // quiet day is a day nobody wrote a nap down, not a day that never happened,
  // so it stays in the divisor: two days of three, not two of two.
  const data = payload({ sleep: [nap(3, 2, 4, "a"), nap(1, 2, 4, "b")] });
  const clock = sleepClock(data, NOW, "all");
  assert.equal(clock.dayCount, 3);
  assert.equal(clock.slots[Math.round((3 * 60) / clock.slotMinutes)], 2 / 3);
});

test("days from before sleep was ever logged are not counted", () => {
  // Feeds go back a fortnight, sleep only started being written down two days
  // ago. Those twelve earlier days aren't days she was awake — they're days
  // with no data, and averaging them in would flatten every band to nothing.
  const feedAt = (daysAgo: number, h: number) => {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysAgo, h, 0);
    return { id: `f${daysAgo}`, amount_ml: 60, ts: d.toISOString(), created_at: d.toISOString() };
  };
  const data = payload({
    sleep: [nap(2, 1, 4, "a"), nap(1, 2, 4, "b")],
    feedings: Array.from({ length: 14 }, (_, i) => feedAt(i, 9)),
  });
  const clock = sleepClock(data, NOW, "all");
  assert.equal(clock.dayCount, 2);
  assert.equal(clock.slots[Math.round((3 * 60) / clock.slotMinutes)], 1, "asleep at 3am both days");
});

test("a slot she is asleep for only part of counts only that part", () => {
  // 02:00–02:30 with 15-minute slots: the 02:00 and 02:15 slots are full, the
  // 02:30 slot is empty.
  const clock = sleepClock(payload({ sleep: [nap(1, 2, 2.5)] }), NOW, 1, 15);
  const slot = (h: number) => clock.slots[Math.round((h * 60) / 15)];
  assert.equal(slot(2), 1);
  assert.equal(slot(2.25), 1);
  assert.equal(slot(2.5), 0);
});

test("a nap across midnight lands on both days, in the right places", () => {
  // 23:00 to 01:00 on the night between two days back and one day back. The
  // early nap on the older day is what makes it a counted day at all: a day
  // whose first sleep is at 11pm reads as one where logging began at 11pm.
  const start = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 2, 23, 0);
  const end = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 1, 0);
  const data = payload({
    sleep: [
      nap(2, 3, 3.5, "early"),
      { id: "x", sleep_start: start.toISOString(), sleep_end: end.toISOString(), created_at: start.toISOString() },
    ],
  });
  const clock = sleepClock(data, NOW, 2);
  const slot = (h: number) => clock.slots[Math.round((h * 60) / clock.slotMinutes)];
  assert.equal(slot(23), 0.5, "the 23:00 hour, on one of two days");
  assert.equal(slot(0), 0.5, "and the midnight hour, on the other");
  assert.equal(slot(12), 0, "nothing at noon");
});

test("today is left out, so a partial day can't flatten the afternoon", () => {
  const data = payload({ sleep: [nap(0, 1, 5)] });
  const clock = sleepClock(data, NOW, 1);
  assert.equal(clock.dayCount, 0);
  assert.ok(clock.slots.every((f) => f === 0));
});

test("the day count is capped by what exists", () => {
  const data = payload({ sleep: [nap(1, 2, 4), nap(2, 2, 4, "b")] });
  assert.equal(sleepClock(data, NOW, 30).dayCount, 2);
  assert.equal(sleepClock(data, NOW, "all").dayCount, 2);
});

test("no sleep logged is all zeros, not a divide by zero", () => {
  const clock = sleepClock(payload(), NOW, 7);
  assert.equal(clock.dayCount, 0);
  assert.ok(clock.slots.every((f) => f === 0));
});

test("no fraction can exceed one", () => {
  // Two overlapping sessions on the same night — possible if someone edited one
  // across another. The bar must not draw outside the chart.
  const data = payload({ sleep: [nap(1, 2, 6), nap(1, 3, 5, "overlap")] });
  const clock = sleepClock(data, NOW, 1);
  assert.ok(clock.slots.every((f) => f <= 1), `max was ${Math.max(...clock.slots)}`);
});

// --- the odds right now -------------------------------------------------------

test("the odds read the slot the moment falls in", () => {
  // Asleep 2–4 on both of the last two days, so 3am is a certainty and 3pm is
  // never.
  const data = payload({ sleep: [nap(1, 2, 4), nap(2, 2, 4, "b")] });
  const clock = sleepClock(data, NOW, 2);
  const at = (h: number, m = 0) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h, m);

  assert.equal(oddsAsleepAt(clock, at(3)), 1);
  assert.equal(oddsAsleepAt(clock, at(15)), 0);
});

test("a half-kept habit reads as a half", () => {
  // Down at 3am on one of the two days. The older day's early nap is what makes
  // it a counted day at all — a day whose first sleep is at 8am reads as one
  // where logging began at 8am.
  const data = payload({ sleep: [nap(1, 2, 4), nap(2, 1, 1.5, "b")] });
  const clock = sleepClock(data, NOW, 2);
  const at3 = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 3, 0);
  assert.equal(oddsAsleepAt(clock, at3), 0.5);
});

test("no finished days has no odds, rather than odds of zero", () => {
  // "Never asleep at this hour" is a claim about her; no data isn't.
  const clock = sleepClock(payload(), NOW, 7);
  assert.equal(oddsAsleepAt(clock, NOW), null);
});

test("the slot is the one the clock time falls inside, not the nearest", () => {
  const clock = sleepClock(payload({ sleep: [nap(1, 2, 4)] }), NOW, 1, 15);
  const at = (h: number, m: number) =>
    new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), h, m);

  assert.equal(slotAt(clock, at(0, 0)), 0);
  assert.equal(slotAt(clock, at(0, 14)), 0, "still inside the first quarter hour");
  assert.equal(slotAt(clock, at(0, 15)), 1);
  assert.equal(slotAt(clock, at(23, 59)), 95, "the last slot of the day, not off the end");
});

// --- typicalSleepWindow -------------------------------------------------------

/** A 24-slot (hourly) clock with the given hours asleep. */
const clockOf = (hours: number[]) =>
  Array.from({ length: 24 }, (_, h) => (hours.includes(h) ? 1 : 0));

test("the usual stretch is the longest run above the threshold", () => {
  const w = typicalSleepWindow(clockOf([1, 2, 3, 4, 13, 14]))!;
  assert.equal(w.fromSlot, 1);
  assert.equal(w.toSlot, 5);
  assert.equal(w.slotCount, 4);
});

test("a stretch across midnight is one stretch, not two", () => {
  // 22:00–03:00. A scan that stopped at the end of the array would call this a
  // 2-hour run and a 3-hour run, and pick the wrong one as longest.
  const w = typicalSleepWindow(clockOf([22, 23, 0, 1, 2]))!;
  assert.equal(w.slotCount, 5);
  assert.equal(w.fromSlot, 22);
  assert.equal(w.toSlot, 3);
});

test("the wrapping stretch wins when it is genuinely the longest", () => {
  const w = typicalSleepWindow(clockOf([21, 22, 23, 0, 1, 2, 10, 11]))!;
  assert.equal(w.slotCount, 6);
  assert.equal(w.fromSlot, 21);
});

test("slots below the threshold are not part of a stretch", () => {
  const fractions = clockOf([1, 2, 3]).map((f, h) => (h === 2 ? 0.3 : f));
  const w = typicalSleepWindow(fractions)!;
  assert.equal(w.slotCount, 1, "the dip splits it");
});

test("the threshold is what counts as usually", () => {
  const fractions = Array.from({ length: 24 }, (_, h) => (h >= 1 && h < 5 ? 0.6 : 0));
  assert.equal(typicalSleepWindow(fractions, 0.5)!.slotCount, 4);
  assert.equal(typicalSleepWindow(fractions, 0.7), null, "0.6 is under a 0.7 bar");
});

test("never usually asleep has no window", () => {
  assert.equal(typicalSleepWindow(clockOf([])), null);
  assert.equal(typicalSleepWindow([]), null);
});

test("always asleep is the whole day", () => {
  const w = typicalSleepWindow(new Array(24).fill(1))!;
  assert.equal(w.slotCount, 24);
  assert.equal(w.fromSlot, 0);
  assert.equal(w.toSlot, 24);
});

test("the window reads off a real clock", () => {
  // End to end: asleep 22:00–05:00 across three days, at 15-minute resolution.
  const sleep = [0, 1, 2].map((d) => {
    const start = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - d - 2, 22, 0);
    const end = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - d - 1, 5, 0);
    return { id: `n${d}`, sleep_start: start.toISOString(), sleep_end: end.toISOString(), created_at: start.toISOString() };
  });
  const clock = sleepClock(payload({ sleep }), NOW, "all", 15);
  const w = typicalSleepWindow(clock.slots)!;
  assert.equal(hourOf(w.fromSlot, clock.slotMinutes), 22);
  assert.equal(hourOf(w.toSlot, clock.slotMinutes), 5);
});
