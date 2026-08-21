import assert from "node:assert/strict";
import { test } from "node:test";
import { buildExport } from "../lib/export";
import type { EventsPayload } from "../lib/types";

const iso = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const base: EventsPayload = {
  start: iso(2026, 8, 6, 0),
  end: iso(2026, 8, 8, 0),
  feedings: [
    { id: "1", amount_ml: 20, ts: iso(2026, 8, 6, 2, 0), created_at: iso(2026, 8, 6, 2, 0) },
    { id: "2", amount_ml: 30, ts: iso(2026, 8, 6, 5, 0), created_at: iso(2026, 8, 6, 5, 0) },
    { id: "3", amount_ml: 45, ts: iso(2026, 8, 7, 14, 37), created_at: iso(2026, 8, 7, 14, 37) },
  ],
  sleep: [
    {
      id: "s1",
      sleep_start: iso(2026, 8, 6, 13, 20),
      sleep_end: iso(2026, 8, 6, 14, 50),
      created_at: iso(2026, 8, 6, 13, 20),
    },
  ],
  diapers: [
    { id: "d1", type: "pee", ts: iso(2026, 8, 6, 7, 36), created_at: iso(2026, 8, 6, 7, 36) },
    {
      id: "d2",
      type: "massive_blowout",
      ts: iso(2026, 8, 6, 9, 5),
      created_at: iso(2026, 8, 6, 9, 5),
    },
  ],
  moments: [],
  comments: [
    {
      id: "c1",
      ts: iso(2026, 8, 6, 10, 0),
      text: "Lil Pj loves her new App!!",
      reactions: { "❤️": 4 },
      created_at: iso(2026, 8, 6, 10, 0),
    },
  ],
};

test("comments are left out entirely", () => {
  const out = buildExport(base);
  assert.ok(!out.includes("Lil Pj"), "comment text leaked into the export");
  assert.ok(!out.includes("❤️"), "reactions leaked into the export");
  assert.ok(!/note/i.test(out), "notes referenced in the export");
});

test("one line per day, 24h clock, no am/pm", () => {
  const out = buildExport(base);
  assert.match(out, /8\/6\s+feeds 2 \/ 50 mL\s+20@02:00 30@05:00/);
  assert.match(out, /8\/7\s+feeds 1 \/ 45 mL\s+45@14:37/);
  assert.ok(!/\d\s*[ap]m/i.test(out), "am/pm crept into the times");
});

test("sleep and diapers file under the day they start", () => {
  const out = buildExport(base);
  assert.match(out, /sleep 13:20-14:50 \(1h30\)/);
  assert.match(out, /diaper pee@07:36  blowout@09:05/);
});

test("massive_blowout is written the way a person says it", () => {
  assert.ok(!buildExport(base).includes("massive_blowout"));
});

test("carries a header with the timezone and a totals line", () => {
  const out = buildExport(base);
  assert.match(out.split("\n")[0], /Baby log · .+ · local time \(.+\), 24h clock/);
  assert.match(out, /TOTALS .*3 feeds · 95 mL/);
});

test("an in-progress nap is marked rather than dropped", () => {
  const out = buildExport({
    ...base,
    sleep: [
      {
        id: "s2",
        sleep_start: iso(2026, 8, 6, 21, 0),
        sleep_end: null,
        created_at: iso(2026, 8, 6, 21, 0),
      },
    ],
  });
  assert.match(out, /21:00- \(ongoing\)/);
});

test("a day with no feeds still appears if something else happened", () => {
  const out = buildExport({
    ...base,
    feedings: [],
    diapers: [{ id: "d3", type: "poop", ts: iso(2026, 8, 6, 9, 0), created_at: iso(2026, 8, 6, 9, 0) }],
  });
  assert.match(out, /8\/6\s+no feeds/);
  assert.match(out, /diaper poop@09:00/);
});

test("an empty period says so instead of returning a bare header", () => {
  const out = buildExport({ ...base, feedings: [], sleep: [], diapers: [], comments: [] });
  assert.match(out, /nothing logged in this period/);
});

test("is dramatically smaller than the JSON it replaced", () => {
  // The old format emitted an ISO timestamp and a localised string per row.
  const oldish = JSON.stringify(
    {
      feedings: base.feedings.map((f) => ({
        timestamp: new Date(f.ts).toISOString(),
        local_time: new Date(f.ts).toLocaleString(),
        amount_ml: f.amount_ml,
      })),
    },
    null,
    2,
  );
  assert.ok(
    buildExport(base).length < oldish.length,
    `expected the text export to be shorter than the old JSON rows alone`,
  );
});

test("the period describes the data, not the all-time query floor", () => {
  // `range=all` asks from a fixed early date; that must not head the export.
  const out = buildExport({ ...base, start: new Date("2000-01-01T00:00:00.000Z").toISOString() });
  assert.ok(!out.includes("2000"), "the query floor leaked into the header");
  assert.match(out, /Aug \d+, 2026/);
  assert.ok(!/TOTALS \d{4,} days/.test(out), "day count came from the query floor");
});

test("an empty period still falls back to the requested window", () => {
  const out = buildExport({ ...base, feedings: [], sleep: [], diapers: [], comments: [] });
  assert.match(out, /Baby log · /);
  assert.match(out, /nothing logged/);
});

test("an empty all-time export doesn't print the query floor", () => {
  const out = buildExport({
    ...base,
    start: new Date("2000-01-01T00:00:00.000Z").toISOString(),
    feedings: [],
    sleep: [],
    diapers: [],
    comments: [],
  });
  assert.ok(!out.includes("2000"), "query floor shown for an empty export");
  assert.ok(!/\d{4,} days/.test(out), "absurd day count for an empty export");
  assert.match(out, /nothing logged/);
});

test("spit-ups and fussy spells appear on their day", () => {
  const out = buildExport({
    ...base,
    moments: [
      { id: "m1", kind: "spit_up", ts: iso(2026, 8, 6, 8, 15), created_at: iso(2026, 8, 6, 8, 15) },
      { id: "m2", kind: "fussy", ts: iso(2026, 8, 6, 19, 40), created_at: iso(2026, 8, 6, 19, 40) },
    ],
  });
  assert.match(out, /also spit-up@08:15  fussy@19:40/);
  // The raw enum name should never surface.
  assert.ok(!out.includes("spit_up"));
});

test("an export with only moments still describes its own span", () => {
  const out = buildExport({
    ...base,
    feedings: [],
    sleep: [],
    diapers: [],
    comments: [],
    moments: [
      { id: "m1", kind: "spit_up", ts: iso(2026, 8, 6, 8, 15), created_at: iso(2026, 8, 6, 8, 15) },
    ],
  });
  assert.ok(!/nothing logged/.test(out), "a moment on its own is still data");
  assert.match(out, /also spit-up@08:15/);
});

// --- weights ------------------------------------------------------------------
//
// Weights ride along with every export regardless of the range asked for: they
// aren't events, and "what does she weigh" doesn't stop being true because you
// were looking at the last 24 hours.

const w = (id: string, grams: number, ts: string, is_birth = false) => ({
  id,
  weight_g: grams,
  ts,
  is_birth,
  created_at: ts,
});

const BIRTH = w("b", 3289, iso(2026, 7, 26, 12, 0), true); // 7 lb 4 oz
const LATER = w("l", 3742, iso(2026, 8, 7, 9, 0)); // 8 lb 4 oz

test("the birth weight is named as such, not left as the first row", () => {
  const text = buildExport(base, [BIRTH, LATER]);
  assert.match(text, /7 lb 4 oz \(birth\)/);
});

test("the gain since birth is stated, because that's the figure people ask for", () => {
  // Three readings, so "since the previous one" and "since birth" are genuinely
  // different numbers.
  const mid = w("m", 3515, iso(2026, 8, 1, 9, 0)); // 7 lb 12 oz
  const text = buildExport(base, [BIRTH, mid, LATER]);
  assert.match(text, /\+8 oz since 8\/1/, "the step from the previous weigh-in");
  assert.match(text, /\+1 lb since birth/, "and the whole climb");
});

test("with only a birth weight behind it, the climb is not stated twice", () => {
  // "+1 lb since 7/26" and "+1 lb since birth" would be one sentence repeated.
  const text = buildExport(base, [BIRTH, LATER]);
  assert.match(text, /\+1 lb since 7\/26/);
  assert.doesNotMatch(text, /since birth/);
});

test("every weigh-in is listed, not just the latest", () => {
  const text = buildExport(base, [BIRTH, LATER]);
  const line = text.split("\n").find((l) => l.includes("weigh-ins"))!;
  assert.match(line, /7\/26 7 lb 4 oz \(birth\)/);
  assert.match(line, /8\/7 8 lb 4 oz/);
});

test("the weekly rate says what it is measured across", () => {
  // Unlabelled it reads as the current rate, and once a birth weight is on
  // file the series starts there — a newborn's first-week dip is inside it.
  assert.match(buildExport(base, [BIRTH, LATER]), /\/wk since 7\/26/);
});

test("a lone birth weight is still reported, and marked", () => {
  const text = buildExport(base, [BIRTH]);
  assert.match(text, /weight 7 lb 4 oz \(birth\)/);
  // Nothing to compare it against, so no deltas invented.
  assert.doesNotMatch(text, /since birth/);
  assert.doesNotMatch(text, /weigh-ins/, "one reading needs no list of itself");
});

test("weigh-ins are listed oldest first however they arrive", () => {
  const line = buildExport(base, [LATER, BIRTH])
    .split("\n")
    .find((l) => l.includes("weigh-ins"))!;
  assert.ok(line.indexOf("7/26") < line.indexOf("8/7"), line);
});

test("ordinary weigh-ins carry no birth tag", () => {
  const text = buildExport(base, [w("a", 3600, iso(2026, 8, 1, 9, 0)), LATER]);
  assert.doesNotMatch(text, /\(birth\)/);
  assert.doesNotMatch(text, /since birth/);
  assert.match(text, /weight 8 lb 4 oz/);
});

test("no weights at all leaves the export alone", () => {
  const text = buildExport(base, []);
  assert.doesNotMatch(text, /weight/);
  assert.doesNotMatch(text, /weigh-ins/);
});

test("a birth weight alone still heads a real export, not an empty one", () => {
  // Nothing timed in the window, but she was weighed — "nothing logged" would
  // be a lie, and the birth weight is exactly the thing worth keeping.
  const empty: EventsPayload = { ...base, feedings: [], sleep: [], diapers: [], comments: [], moments: [] };
  const text = buildExport(empty, [BIRTH]);
  assert.match(text, /7 lb 4 oz \(birth\)/);
  assert.match(text, /nothing else logged/);
});
