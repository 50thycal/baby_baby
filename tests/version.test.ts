import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBuiltAt, isStale, versionLabel } from "../lib/version";

// --- the stamp ---------------------------------------------------------------

test("a build stamp reads as a date and a time", () => {
  const iso = new Date(2026, 7, 11, 14, 23).toISOString();
  const out = formatBuiltAt(iso);
  // Asserted against a Date rather than a literal, so this holds in any zone.
  assert.match(out, /^Aug 11, /);
  assert.match(out, /\d{1,2}:\d{2}/);
});

test("am and pm are lowercase, like the rest of the app", () => {
  const out = formatBuiltAt(new Date(2026, 7, 11, 9, 5).toISOString());
  assert.ok(!/[AP]M/.test(out), `got "${out}"`);
  assert.match(out, /9:05\s?(am)?/);
});

test("a missing or unparseable stamp is left out rather than shown broken", () => {
  assert.equal(formatBuiltAt(""), "");
  assert.equal(formatBuiltAt("not a date"), "");
});

test("the label falls back to the build id alone when there's no stamp", () => {
  assert.equal(versionLabel("", "0d081c4"), "0d081c4");
});

test("the label names both when there is a stamp", () => {
  const label = versionLabel(new Date(2026, 7, 11, 14, 23).toISOString(), "0d081c4");
  assert.match(label, /^Updated Aug 11, /);
  assert.match(label, /· 0d081c4$/);
});

// --- the check ---------------------------------------------------------------

test("a different build on the server means we're behind", () => {
  assert.equal(isStale("def4567", "abc1234"), true);
});

test("the same build is not stale", () => {
  assert.equal(isStale("abc1234", "abc1234"), false);
});

test("an unanswered check says nothing rather than crying update", () => {
  // A dropped request is a network blip, not a deploy. A banner that appears
  // every time the signal wobbles is one people stop reading.
  assert.equal(isStale(undefined, "abc1234"), false);
  assert.equal(isStale(null, "abc1234"), false);
  assert.equal(isStale("", "abc1234"), false);
});

test("local builds never nag", () => {
  // Everything built outside Vercel is stamped `dev`, so a developer running
  // against a deployed API doesn't get a permanent banner.
  assert.equal(isStale("abc1234", "dev"), false);
  assert.equal(isStale("dev", "abc1234"), false);
  assert.equal(isStale("dev", "dev"), false);
});
