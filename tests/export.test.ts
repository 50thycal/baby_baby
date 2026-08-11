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
