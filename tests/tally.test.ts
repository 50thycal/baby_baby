import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeTally,
  diaperComparison,
  milkComparison,
  SLEEPERS,
  sleeperFor,
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

// --- who else sleeps like that ----------------------------------------------

test("the animal is matched on her average day, not her lifetime total", () => {
  const c = sleepComparison(15 * HOUR)!;
  assert.match(c.headline, /sloth/);
  assert.match(c.detail, /15\.0 h a day/);
  assert.match(c.detail, /they get 15/);
});

test("she moves down the list as she needs less sleep", () => {
  const seen = [20, 18, 15, 12, 10, 8].map((h) => sleepComparison(h * HOUR)!.headline);
  assert.deepEqual(seen, [
    "Sleeps like a koala",
    "Sleeps like a hedgehog",
    "Sleeps like a sloth",
    "Sleeps like an owl",
    "Sleeps like a fox",
    "Sleeps like a rabbit",
  ]);
});

test("an in-between average lands on the nearest animal", () => {
  // 17.4 rounds toward the armadillo at 17, 17.6 toward the hedgehog at 18.
  assert.match(sleepComparison(17.4 * HOUR)!.headline, /armadillo/);
  assert.match(sleepComparison(17.6 * HOUR)!.headline, /hedgehog/);
});

test("every hour from eight to twenty has somebody on it", () => {
  for (let h = 8; h <= 20; h++) {
    assert.equal(sleeperFor(h).hours, h, `nobody sleeps ${h} hours`);
  }
  assert.equal(SLEEPERS.length, 13);
});

test("the ladder is ordered, sleepiest first", () => {
  const hours = SLEEPERS.map((x) => x.hours);
  assert.deepEqual(hours, [...hours].sort((a, b) => b - a));
  assert.equal(new Set(SLEEPERS.map((x) => x.name)).size, SLEEPERS.length, "no repeats");
});

test("off the ends of the ladder she clamps rather than falling off", () => {
  assert.match(sleepComparison(23 * HOUR)!.headline, /koala/);
  assert.match(sleepComparison(3 * HOUR)!.headline, /rabbit/);
});

test("no finished day yet means no animal, rather than the sleepless one", () => {
  // "She sleeps like a rabbit" from an empty divisor would be a claim about
  // her, not a gap in the data.
  assert.equal(sleepComparison(null), null);
  assert.equal(sleepComparison(0), null);
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
