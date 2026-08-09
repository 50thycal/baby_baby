import assert from "node:assert/strict";
import { test } from "node:test";
import { parseImport, summarise } from "../lib/import-parse";

/** Fixed "now" so year inference is deterministic. Local time, like the parser. */
const NOW = new Date(2026, 7, 9, 12, 0); // 9 Aug 2026

const parse = (text: string) => parseImport(text, NOW);

test("reads the basic date / time / amount shape", () => {
  const { entries, errors } = parse("8/6 2:00am 20");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 1);
  const [e] = entries;
  assert.equal(e.kind, "feeding");
  assert.equal(e.kind === "feeding" && e.amount_ml, 20);
  assert.equal(e.ts.getFullYear(), 2026);
  assert.equal(e.ts.getMonth(), 7);
  assert.equal(e.ts.getDate(), 6);
  assert.equal(e.ts.getHours(), 2);
  assert.equal(e.ts.getMinutes(), 0);
});

test("times land in local time, not UTC", () => {
  const [e] = parse("8/6 2:00am 20").entries;
  // Constructed the same way a human would read it off the page.
  assert.equal(e.ts.getTime(), new Date(2026, 7, 6, 2, 0).getTime());
});

test("accepts the spellings people actually write", () => {
  const variants = [
    "8/6 2:00am 20",
    "08/06 2:00 AM 20",
    "8-6 2:00am 20 mL",
    "8/6 2am 20",
    "8/6 02:00 20",
    "8/6/26 2:00am 20ml",
  ];
  for (const v of variants) {
    const { entries, errors } = parse(v);
    assert.equal(errors.length, 0, `errors for: ${v}`);
    assert.equal(entries.length, 1, `no entry for: ${v}`);
    assert.equal(entries[0].ts.getHours(), 2, `wrong hour for: ${v}`);
    assert.equal(entries[0].kind === "feeding" && entries[0].amount_ml, 20, `wrong ml for: ${v}`);
  }
});

test("pm and noon/midnight edges", () => {
  const at = (s: string) => parse(`8/6 ${s} 20`).entries[0].ts.getHours();
  assert.equal(at("12:00am"), 0);
  assert.equal(at("12:30am"), 0);
  assert.equal(at("12:00pm"), 12);
  assert.equal(at("1:00pm"), 13);
  assert.equal(at("11:40am"), 11);
  assert.equal(at("11:00pm"), 23);
});

test("a bare M/D never resolves into the future", () => {
  // NOW is 9 Aug 2026, so 12/28 must mean last December, not this one.
  const [dec] = parse("12/28 3:00pm 40").entries;
  assert.equal(dec.ts.getFullYear(), 2025);
  const [aug] = parse("8/6 3:00pm 40").entries;
  assert.equal(aug.ts.getFullYear(), 2026);
  // Today itself still counts as the current year.
  const [today] = parse("8/9 9:00am 40").entries;
  assert.equal(today.ts.getFullYear(), 2026);
});

test("diaper lines", () => {
  const { entries, errors } = parse(
    ["8/6 7:36am diaper pee", "8/6 9:00am diaper poop", "8/6 10:00am diaper blowout"].join("\n"),
  );
  assert.equal(errors.length, 0);
  assert.deepEqual(
    entries.map((e) => e.kind === "diaper" && e.type),
    ["pee", "poop", "massive_blowout"],
  );
});

test("blank lines and # notes are ignored", () => {
  const { entries, errors } = parse("# 8/6\n\n8/6 2:00am 20\n   \n8/6 5:00am 20  # heel prep");
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 2);
});

test("unreadable lines are reported, not guessed", () => {
  const { entries, errors } = parse(
    ["8/6 2:00am 20", "8/6 banana 20", "13/45 2:00am 20", "8/6 2:00am lots", "8/6"].join("\n"),
  );
  assert.equal(entries.length, 1);
  assert.deepEqual(
    errors.map((e) => e.line),
    [2, 3, 4, 5],
  );
  // The message should name the offending token so it can be found on the page.
  assert.match(errors[0].message, /banana/);
});

test("rejects amounts outside the column's range", () => {
  assert.equal(parse("8/6 2:00am 5000").errors.length, 1);
  assert.equal(parse("8/6 2:00am 0").errors.length, 0);
});

test("entries come back in chronological order", () => {
  const { entries } = parse(["8/7 1:00am 40", "8/6 2:00am 20", "8/6 11:00pm 30"].join("\n"));
  assert.deepEqual(
    entries.map((e) => e.ts.getTime()),
    [...entries.map((e) => e.ts.getTime())].sort((a, b) => a - b),
  );
});

test("summarise groups by local day", () => {
  const { entries } = parse(
    ["8/6 2:00am 20", "8/6 5:00am 30", "8/6 7:36am diaper pee", "8/7 1:00am 40"].join("\n"),
  );
  const days = summarise(entries);
  assert.equal(days.length, 2);
  assert.equal(days[0].feeds, 2);
  assert.equal(days[0].ml, 50);
  assert.equal(days[0].diapers, 1);
  assert.equal(days[1].feeds, 1);
  assert.equal(days[1].ml, 40);
});

test("a whole day off the paper log parses clean", () => {
  const block = `
# 8/8
8/8  3:50am  42
8/8  6:20am  40
8/8  9:20am  45
8/8  1:45pm  50
8/8  5:00pm  60
8/8  7:10pm  40
8/8  11:00pm 60
8/8  12:30am 45
`;
  const { entries, errors } = parse(block);
  assert.equal(errors.length, 0);
  assert.equal(entries.length, 8);
  const total = entries.reduce((s, e) => s + (e.kind === "feeding" ? e.amount_ml : 0), 0);
  assert.equal(total, 382);
});

test("impossible dates are rejected, not rolled forward", () => {
  // JS turns new Date(y, 1, 31) into 3 March; that must not slip through.
  const { entries, errors } = parse("2/31 2:00am 20");
  assert.equal(entries.length, 0);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /real date/);
});

test("a time later today still resolves to today", () => {
  // NOW is midday; 3pm today is in the future but is obviously not last year.
  const [e] = parse("8/9 3:00pm 40").entries;
  assert.equal(e.ts.getFullYear(), 2026);
  assert.equal(e.ts.getDate(), 9);
});
