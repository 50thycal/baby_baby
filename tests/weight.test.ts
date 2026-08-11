import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changeOunces,
  fmtOunceChange,
  fmtRate,
  fmtWeight,
  gramsFromOunces,
  MAX_OUNCES,
  ouncesFromGrams,
  splitOunces,
  weightTrend,
} from "../lib/weight";

const DAY = 86_400_000;

// --- the conversion ----------------------------------------------------------

test("every weight the wheel can produce survives the round trip", () => {
  // The whole reason grams are stored rather than ounces. If any value came
  // back a single ounce out, someone would type 8 lb 4 oz and later read
  // 8 lb 3 oz, which is exactly the kind of thing nobody notices for weeks.
  const broken: string[] = [];
  for (let oz = 0; oz <= MAX_OUNCES; oz++) {
    const back = ouncesFromGrams(gramsFromOunces(oz));
    if (back !== oz) broken.push(`${oz} oz -> ${back} oz`);
  }
  assert.deepEqual(broken, [], `${broken.length} weights failed to round-trip`);
});

test("grams are whole numbers, so nothing floating-point reaches the database", () => {
  for (let oz = 0; oz <= MAX_OUNCES; oz += 7) {
    assert.ok(Number.isInteger(gramsFromOunces(oz)), `${oz} oz produced a fraction`);
  }
});

test("a known weight converts to the number a hospital would write down", () => {
  // 8 lb 4 oz is 132 oz, or 3742 g.
  assert.equal(gramsFromOunces(132), 3742);
  assert.equal(fmtWeight(3742), "8 lb 4 oz");
});

test("pounds and ounces split the way they're spoken", () => {
  assert.deepEqual(splitOunces(132), { lb: 8, oz: 4 });
  assert.deepEqual(splitOunces(16), { lb: 1, oz: 0 });
  assert.deepEqual(splitOunces(15), { lb: 0, oz: 15 });
  assert.deepEqual(splitOunces(0), { lb: 0, oz: 0 });
});

test("a whole number of pounds still shows its ounces", () => {
  // "8 lb" on its own reads as an approximation; "8 lb 0 oz" reads as a reading.
  assert.equal(fmtWeight(gramsFromOunces(128)), "8 lb 0 oz");
});

// --- the change --------------------------------------------------------------

test("a gain is measured in ounces, not by differencing the grams", () => {
  // Both readings were rounded on the way in. Differencing the stored grams and
  // converting back can land half an ounce out; going via ounces cannot.
  const a = gramsFromOunces(130);
  const b = gramsFromOunces(136);
  assert.equal(changeOunces(a, b), 6);
});

test("no two adjacent weights ever report a phantom change", () => {
  for (let oz = 0; oz < MAX_OUNCES; oz++) {
    assert.equal(changeOunces(gramsFromOunces(oz), gramsFromOunces(oz)), 0);
    assert.equal(changeOunces(gramsFromOunces(oz), gramsFromOunces(oz + 1)), 1);
  }
});

test("changes read with a sign, and roll up into pounds", () => {
  assert.equal(fmtOunceChange(6), "+6 oz");
  assert.equal(fmtOunceChange(-3), "−3 oz");
  assert.equal(fmtOunceChange(18), "+1 lb 2 oz");
  assert.equal(fmtOunceChange(32), "+2 lb");
  assert.equal(fmtOunceChange(0), "no change");
});

// --- the trend ---------------------------------------------------------------

const NOW = new Date(2026, 7, 11, 12, 0).getTime();
const pt = (lbs: number, oz: number, daysAgo: number) => ({
  grams: gramsFromOunces(lbs * 16 + oz),
  at: NOW - daysAgo * DAY,
});

test("nothing logged has no trend", () => {
  assert.equal(weightTrend([]), null);
});

test("one reading has a latest but no comparison", () => {
  const t = weightTrend([pt(8, 4, 0)])!;
  assert.equal(t.previous, null);
  assert.equal(t.changeOz, null);
  assert.equal(t.perWeekOz, null, "a rate needs two points");
  assert.equal(t.totalOz, 0);
});

test("the latest reading wins regardless of the order they arrive in", () => {
  const t = weightTrend([pt(8, 4, 0), pt(7, 8, 14), pt(7, 14, 7)])!;
  assert.equal(fmtWeight(t.latest.grams), "8 lb 4 oz");
  assert.equal(fmtWeight(t.previous!.grams), "7 lb 14 oz", "previous is by time, not by order");
});

test("the change is against the previous reading", () => {
  const t = weightTrend([pt(7, 14, 7), pt(8, 4, 0)])!;
  assert.equal(t.changeOz, 6);
});

test("the rate is taken across the whole series, not the last two", () => {
  // Two readings a day apart would imply a preposterous weekly rate; the run
  // from first to last is the honest number.
  const t = weightTrend([pt(7, 0, 14), pt(8, 0, 1), pt(8, 1, 0)])!;
  // 17 oz over 14 days is 8.5 oz a week.
  assert.equal(Math.round(t.perWeekOz! * 10) / 10, 8.5);
  assert.equal(t.totalOz, 17);
});

test("readings less than a day apart refuse to state a weekly rate", () => {
  const t = weightTrend([
    { grams: gramsFromOunces(128), at: NOW - 3_600_000 },
    { grams: gramsFromOunces(130), at: NOW },
  ])!;
  assert.equal(t.perWeekOz, null);
  assert.equal(t.changeOz, 2, "the change itself is still worth showing");
});

test("a rate reads as a sentence, and losing is said plainly", () => {
  assert.match(fmtRate(8.5), /gaining 8.5 oz a week/);
  assert.match(fmtRate(-2), /losing 2 oz a week/);
  assert.equal(fmtRate(0.02), "holding steady");
});
