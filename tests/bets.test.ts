import assert from "node:assert/strict";
import { test } from "node:test";
import {
  currentNight,
  isNightKey,
  isValidTimeZone,
  lockTime,
  nightOutcome,
  nightWindow,
  scoreNight,
  shiftNight,
  standings,
  zonedInstant,
  type Bet,
  type Outcome,
} from "../lib/bets";
import type { SleepSession } from "../lib/types";

const TZ = "America/Toronto";
const HOUR = 3_600_000;
const MIN = 60_000;

const iso = (s: string) => new Date(s);

const sleep = (start: string, end: string | null, id = start): SleepSession => ({
  id,
  sleep_start: iso(start).toISOString(),
  sleep_end: end === null ? null : iso(end).toISOString(),
  created_at: iso(start).toISOString(),
});

const bet = (person: string, pick: "yes" | "no" | null, guess_min: number | null = null): Bet => ({
  id: person,
  night: "2026-09-26",
  person_id: person,
  name: person.toUpperCase(),
  pick,
  guess_min,
  note: null,
  created_at: "2026-09-26T12:00:00Z",
  updated_at: "2026-09-26T12:00:00Z",
});

const final = (good: boolean | null, longestMs: number, isVoid = false): Outcome => ({
  phase: "final",
  good,
  void: isVoid,
  longestMs,
  running: false,
});

test("zonedInstant: plain evening in Toronto (EDT, UTC-4)", () => {
  assert.equal(zonedInstant("2026-09-26", 0, 18, TZ).toISOString(), "2026-09-26T22:00:00.000Z");
  assert.equal(zonedInstant("2026-09-26", 1, 6, TZ).toISOString(), "2026-09-27T10:00:00.000Z");
});

test("zonedInstant: the night the clocks spring forward", () => {
  // 6pm is still EST (UTC-5); by 6am it's EDT (UTC-4). The night is 11 hours.
  const w = nightWindow("2026-03-07", TZ);
  assert.equal(w.from.toISOString(), "2026-03-07T23:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-03-08T10:00:00.000Z");
});

test("zonedInstant: the night the clocks fall back", () => {
  const w = nightWindow("2026-10-31", TZ);
  assert.equal(w.from.toISOString(), "2026-10-31T22:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-11-01T11:00:00.000Z");
});

test("currentNight: before 6am it's still last night", () => {
  assert.equal(currentNight(iso("2026-09-27T07:00:00Z"), TZ), "2026-09-26"); // 3am local
  assert.equal(currentNight(iso("2026-09-27T10:00:00Z"), TZ), "2026-09-27"); // 6am local
  assert.equal(currentNight(iso("2026-09-26T23:30:00Z"), TZ), "2026-09-26"); // 7:30pm local
});

test("currentNight: rolls back across a month boundary", () => {
  assert.equal(currentNight(iso("2026-10-01T06:00:00Z"), TZ), "2026-09-30"); // 2am, Oct 1
});

test("night keys and time zones validate", () => {
  assert.ok(isNightKey("2026-09-26"));
  assert.ok(!isNightKey("2026-02-31"));
  assert.ok(!isNightKey("26-09-2026"));
  assert.ok(isValidTimeZone("Europe/London"));
  assert.ok(!isValidTimeZone("Mars/Olympus"));
  assert.equal(shiftNight("2026-12-31", 1), "2027-01-01");
});

const WIN = nightWindow("2026-09-26", TZ); // 6pm = 22:00Z, 8pm = 00:00Z, 6am = 10:00Z

test("lockTime: 8pm if she isn't down yet", () => {
  assert.equal(lockTime(WIN, []).toISOString(), "2026-09-27T00:00:00.000Z");
});

test("lockTime: the moment she goes down, if that's earlier", () => {
  const s = [sleep("2026-09-26T21:00:00Z", "2026-09-26T21:40:00Z"), sleep("2026-09-26T23:15:00Z", null)];
  // The 5pm nap doesn't count — only sleeps starting from 6pm.
  assert.equal(lockTime(WIN, s).toISOString(), "2026-09-26T23:15:00.000Z");
});

test("nightOutcome: six hours called early, while she's still asleep", () => {
  const s = [sleep("2026-09-27T01:00:00Z", null)];
  const o = nightOutcome(WIN, s, iso("2026-09-27T07:05:00Z"));
  assert.equal(o.phase, "live");
  assert.equal(o.good, true);
  assert.equal(o.running, true);
  assert.equal(o.longestMs, 6 * HOUR + 5 * MIN);
});

test("nightOutcome: short stretches, still undecided mid-night", () => {
  const s = [
    sleep("2026-09-27T00:00:00Z", "2026-09-27T03:00:00Z"),
    sleep("2026-09-27T03:30:00Z", "2026-09-27T07:00:00Z"),
  ];
  const o = nightOutcome(WIN, s, iso("2026-09-27T08:00:00Z"));
  assert.equal(o.phase, "live");
  assert.equal(o.good, null);
  assert.equal(o.longestMs, 3.5 * HOUR);
});

test("nightOutcome: two long stretches don't add up — no is final after 6am", () => {
  const s = [
    sleep("2026-09-27T00:00:00Z", "2026-09-27T05:00:00Z"),
    sleep("2026-09-27T05:10:00Z", "2026-09-27T10:30:00Z"),
  ];
  const o = nightOutcome(WIN, s, iso("2026-09-27T11:00:00Z"));
  assert.equal(o.phase, "final");
  assert.equal(o.good, false);
  assert.equal(o.longestMs, 5 * HOUR + 20 * MIN);
});

test("nightOutcome: a stretch started before 6am can still win after it", () => {
  const s = [sleep("2026-09-27T08:00:00Z", null)]; // 4am local, still going
  const early = nightOutcome(WIN, s, iso("2026-09-27T11:00:00Z"));
  assert.equal(early.phase, "live");
  assert.equal(early.good, null);
  const later = nightOutcome(WIN, s, iso("2026-09-27T14:00:00Z"));
  assert.equal(later.good, true);
});

test("nightOutcome: nothing logged all night is void", () => {
  const o = nightOutcome(WIN, [], iso("2026-09-27T12:00:00Z"));
  assert.equal(o.void, true);
  assert.equal(o.good, null);
  assert.deepEqual(scoreNight([bet("a", "yes")], o), []);
});

test("nightOutcome: upcoming before 6pm", () => {
  assert.equal(nightOutcome(WIN, [], iso("2026-09-26T16:00:00Z")).phase, "upcoming");
});

test("scoreNight: nothing until the night is final", () => {
  const live: Outcome = { phase: "live", good: true, void: false, longestMs: 7 * HOUR, running: true };
  assert.deepEqual(scoreNight([bet("a", "yes")], live), []);
});

test("scoreNight: correct calls earn 10, the lone right one gets the underdog 5", () => {
  const scores = scoreNight([bet("a", "yes"), bet("b", "no"), bet("c", "no")], final(true, 6.5 * HOUR));
  const by = Object.fromEntries(scores.map((s) => [s.person_id, s]));
  assert.equal(by.a.points, 15);
  assert.equal(by.a.underdog, true);
  assert.equal(by.b.points, 0);
  assert.equal(by.c.correct, false);
});

test("scoreNight: no underdog bonus when the room agreed, or split evenly", () => {
  const all = scoreNight([bet("a", "no"), bet("b", "no")], final(false, 4 * HOUR));
  assert.deepEqual(all.map((s) => s.points), [10, 10]);
  const split = scoreNight([bet("a", "no"), bet("b", "yes")], final(false, 4 * HOUR));
  assert.deepEqual(split.map((s) => s.points), [10, 0]);
});

test("scoreNight: closest guess gets 5 even on a wrong call; ties share it", () => {
  const scores = scoreNight(
    [bet("a", "yes", 300), bet("b", "no", 200), bet("c", "no", 280)],
    final(false, 290 * MIN),
  );
  const by = Object.fromEntries(scores.map((s) => [s.person_id, s]));
  assert.equal(by.a.closest, true); // 10 off
  assert.equal(by.c.closest, true); // 10 off
  assert.equal(by.a.points, 5);
  assert.equal(by.b.points, 10);
  assert.equal(by.c.points, 15);
});

test("scoreNight: a lone guesser can't win closest", () => {
  const scores = scoreNight([bet("a", "no", 240), bet("b", "no")], final(false, 240 * MIN));
  assert.ok(scores.every((s) => !s.closest));
});

test("standings: totals, record, and a streak that resets on a miss", () => {
  const people = [
    { id: "a", name: "Ann" },
    { id: "b", name: "Bo" },
  ];
  const nights = [
    { key: "2026-09-24", bets: [bet("a", "no"), bet("b", "yes")], outcome: final(false, 4 * HOUR) },
    { key: "2026-09-25", bets: [bet("a", "no"), bet("b", "no")], outcome: final(true, 6 * HOUR) },
    { key: "2026-09-26", bets: [bet("a", "yes"), bet("b", "yes")], outcome: final(true, 7 * HOUR) },
  ];
  const [first, second] = standings(people, nights);
  assert.equal(first.name, "Ann");
  assert.equal(first.bbp, 20);
  assert.deepEqual([first.wins, first.losses, first.streak], [2, 1, 1]);
  assert.equal(second.bbp, 10);
  assert.deepEqual([second.wins, second.losses, second.streak], [1, 2, 1]);
});
