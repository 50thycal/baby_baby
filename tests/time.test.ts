import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtClockRange } from "../lib/time";

// ICU spaces these with thin or narrow no-break spaces depending on version;
// the assertions are about the words, not the whitespace.
const plain = (s: string) => s.replace(/[   ]/g, " ");

test("a window within one half of the day says PM once", () => {
  const out = plain(fmtClockRange(new Date(2026, 9, 4, 21, 21), new Date(2026, 9, 4, 22, 49), "en-US"));
  assert.equal(out.match(/PM/g)?.length, 1, out);
  assert.match(out, /9:21/);
  assert.match(out, /10:49/);
});

test("a window across midnight keeps both meridiems", () => {
  const out = plain(fmtClockRange(new Date(2026, 9, 4, 22, 14), new Date(2026, 9, 5, 1, 38), "en-US"));
  assert.match(out, /10:14 PM/);
  assert.match(out, /1:38 AM/);
});
