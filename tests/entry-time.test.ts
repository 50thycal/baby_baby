import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ENTRY_COUNT,
  ENTRY_SPAN,
  catchUpTime,
  entryAnchor,
  entryIndex,
  entryTime,
  localDayWindow,
  shiftLocalDay,
} from "../lib/entry-time";
import { eventWindow } from "../lib/event-window";
import { HOUR } from "../lib/time";

test("entry wheel reaches a full 24 hours back with reversible five-minute detents", () => {
  const anchor = entryAnchor(new Date("2026-10-19T00:49:44Z"));
  assert.equal(entryTime(0, anchor), anchor - 24 * HOUR);
  assert.equal(entryTime(ENTRY_COUNT - 1, anchor), anchor + ENTRY_SPAN);
  for (let i = 0; i < ENTRY_COUNT; i++) assert.equal(entryIndex(entryTime(i, anchor), anchor), i);
  assert.equal(entryIndex(anchor - 99 * HOUR, anchor), 0);
});

test("calendar jumps and day queries keep local time through both DST transitions", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Chicago";
  try {
    for (const [month, day, hours] of [
      [2, 8, 23],
      [10, 1, 25],
    ]) {
      const noon = new Date(2026, month, day, 12, 15);
      const { start, end } = localDayWindow(noon);
      assert.equal((end.getTime() - start.getTime()) / HOUR, hours);
      assert.equal(shiftLocalDay(noon, -1).getHours(), 12);
      assert.equal(shiftLocalDay(noon, 1).getMinutes(), 15);
    }
    const acrossMidnight = shiftLocalDay(new Date(2026, 9, 19, 0, 10), -1);
    assert.equal(acrossMidnight.getDate(), 18);
    assert.equal(acrossMidnight.getHours(), 0);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("advancing a catch-up day clamps to now instead of entering future logs", () => {
  const now = new Date("2026-10-19T15:00:00Z");
  const yesterdayEvening = new Date("2026-10-18T23:00:00Z");
  assert.equal(catchUpTime(yesterdayEvening, 1, now).getTime(), now.getTime());
});

test("bounded event queries support old days and reject partial, inverted, or huge windows", () => {
  const start = "2026-08-06T05:00:00.000Z";
  const end = "2026-08-07T05:00:00.000Z";
  const window = eventWindow(new URLSearchParams({ start, end }));
  assert.equal(window.start.toISOString(), start);
  assert.equal(window.end.toISOString(), end);
  const invalid: Record<string, string>[] = [
    { start },
    { end },
    { start, end: start },
    { start: end, end: start },
    { start, end: "2026-08-10T05:00:00Z" },
  ];
  for (const params of invalid) {
    assert.throws(
      () => eventWindow(new URLSearchParams(params)),
      /required|valid date|time window/,
    );
  }
});

test("existing range queries retain their behavior", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.equal(
    eventWindow(new URLSearchParams({ range: "2d" }), now).start.getTime(),
    now.getTime() - 48 * HOUR,
  );
  assert.equal(
    eventWindow(new URLSearchParams({ range: "nonsense" }), now).start.getTime(),
    now.getTime() - 24 * HOUR,
  );
  assert.equal(
    eventWindow(new URLSearchParams({ range: "all" }), now).start.getUTCFullYear(),
    2000,
  );
});
