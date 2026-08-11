import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeTally,
  diaperComparison,
  milkComparison,
  sleepComparison,
} from "../lib/tally";
import type { EventsPayload } from "../lib/types";

const NOW = new Date(2026, 7, 11, 12, 0);
const HOUR = 3_600_000;
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: at(30 * 24 * HOUR),
  end: NOW.toISOString(),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

test("totals add up across every kind", () => {
  const t = computeTally(
    payload({
      feedings: [
        { id: "1", amount_ml: 60, ts: at(2 * HOUR), created_at: at(2 * HOUR) },
        { id: "2", amount_ml: 40, ts: at(5 * HOUR), created_at: at(5 * HOUR) },
      ],
      sleep: [
        {
          id: "s1",
          sleep_start: at(10 * HOUR),
          sleep_end: at(8 * HOUR),
          created_at: at(10 * HOUR),
        },
      ],
      diapers: [
        { id: "d1", type: "pee", ts: at(3 * HOUR), created_at: at(3 * HOUR) },
        { id: "d2", type: "both", ts: at(4 * HOUR), created_at: at(4 * HOUR) },
        { id: "d3", type: "massive_blowout", ts: at(6 * HOUR), created_at: at(6 * HOUR) },
      ],
      moments: [
        { id: "m1", kind: "spit_up", ts: at(1 * HOUR), created_at: at(1 * HOUR) },
        { id: "m2", kind: "fussy", ts: at(2 * HOUR), created_at: at(2 * HOUR) },
        { id: "m3", kind: "fussy", ts: at(3 * HOUR), created_at: at(3 * HOUR) },
      ],
    }),
    NOW,
  );
  assert.equal(t.milkMl, 100);
  assert.equal(t.feeds, 2);
  assert.equal(t.sleepMs, 2 * HOUR);
  assert.equal(t.naps, 1);
  assert.equal(t.diapers, 3);
  assert.equal(t.dirtyDiapers, 2, "a plain pee is not a dirty one");
  assert.equal(t.spitUps, 1);
  assert.equal(t.fussies, 2);
});

test("a sleep still running is counted only up to now", () => {
  const t = computeTally(
    payload({
      sleep: [{ id: "s", sleep_start: at(3 * HOUR), sleep_end: null, created_at: at(3 * HOUR) }],
    }),
    NOW,
  );
  assert.equal(t.sleepMs, 3 * HOUR);
});

test("nothing logged doesn't throw or divide by zero", () => {
  const t = computeTally(payload(), NOW);
  assert.equal(t.milkMl, 0);
  assert.equal(t.days, 1, "days is at least one");
});

// --- the ladders ------------------------------------------------------------

test("milk climbs the ladder as she grows", () => {
  // Under a can: told as a fraction rather than nothing at all.
  assert.match(milkComparison(200)!.headline, /% of a can of Coke/);
  // One can.
  assert.match(milkComparison(400)!.headline, /can of Coke/);
  // A 12-pack's worth.
  assert.match(milkComparison(4_500)!.headline, /12-pack/);
  // A tankful.
  assert.match(milkComparison(60_000)!.headline, /fuel tank/);
  // Absurd but valid.
  assert.match(milkComparison(3_000_000_000)!.headline, /Olympic/);
});

test("milk comparison names what comes next", () => {
  const c = milkComparison(4_500)!;
  assert.match(c.detail, /next up:/);
  assert.ok(!c.detail.includes("12-pack"), "the next rung shouldn't be the current one");
});

test("a multiple is shown once it's worth showing", () => {
  // Just over one can — a bare "1.0×" would be noise.
  assert.ok(!milkComparison(400)!.headline.includes("×"));
  // Several cans in — but still short of the next rung — the multiple is the
  // interesting part. (1,200 mL would land ON the litre rung at 1.2×, which is
  // correctly not worth showing.)
  assert.match(milkComparison(900)!.headline, /×/);
});

test("no milk at all has nothing to compare", () => {
  assert.equal(milkComparison(0), null);
});

test("sleep turns into walking distance from Kansas City", () => {
  // 10 hours at 2 mph is 20 miles — past Lenexa, not yet Lawrence.
  const c = sleepComparison(10 * HOUR)!;
  assert.match(c.headline, /Lenexa/);
  assert.match(c.detail, /Lawrence/);
  assert.match(c.detail, /\d+ more miles/);
});

test("a long sleep total reaches further down the list", () => {
  // 300 hours at 2 mph is 600 miles.
  assert.match(sleepComparison(300 * HOUR)!.headline, /Denver/);
});

test("before the first landmark it still says something useful", () => {
  // 2 hours is 4 miles — short of Lenexa.
  const c = sleepComparison(2 * HOUR)!;
  assert.match(c.headline, /miles out of Kansas City/);
});

test("barely any sleep has nothing to compare", () => {
  assert.equal(sleepComparison(60_000), null);
});

test("the ladders are ordered, or the wrong rung would be picked", () => {
  const climbing = [355, 1_000, 4_260, 50_000, 150_000].map((v) => milkComparison(v)!.headline);
  assert.equal(new Set(climbing).size, climbing.length, "each step should read differently");
});

// --- the diaper stack -------------------------------------------------------

test("a small stack is given in feet and inches", () => {
  const c = diaperComparison(13)!;
  assert.match(c.headline, /1 ft 1 in tall/);
  assert.match(c.detail, /47 more to reach a car/);
});

test("the stack climbs from a car to the Burj Khalifa", () => {
  assert.match(diaperComparison(60)!.headline, /as tall as a car/);
  assert.match(diaperComparison(130)!.headline, /single-story house/);
  assert.match(diaperComparison(400)!.headline, /three-story apartment/);
  assert.match(diaperComparison(4_000)!.headline, /Statue of Liberty/);
  assert.match(diaperComparison(8_000)!.headline, /One Kansas City Place/);
  assert.match(diaperComparison(33_000)!.headline, /Burj Khalifa/);
});

test("the stack names how many more to the next rung", () => {
  const c = diaperComparison(130)!;
  assert.match(c.detail, /more to reach a three-story apartment block/);
  assert.ok(!c.detail.includes("single-story"), "the next rung shouldn't be the current one");
});

test("the top of the stack ladder says so instead of naming a next rung", () => {
  assert.match(diaperComparison(40_000)!.detail, /nothing left to climb/);
});

test("no diapers has nothing to compare", () => {
  assert.equal(diaperComparison(0), null);
});

test("stack rungs each read differently", () => {
  const climbing = [60, 120, 396, 1_020, 3_660].map((v) => diaperComparison(v)!.headline);
  assert.equal(new Set(climbing).size, climbing.length);
});
