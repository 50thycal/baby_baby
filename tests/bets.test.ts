import assert from "node:assert/strict";
import { test } from "node:test";
import {
  availability,
  BBP,
  betting,
  closesAt,
  currentDay,
  dayWindow,
  hintFor,
  isDayKey,
  isValidTimeZone,
  kindById,
  KINDS,
  lineFor,
  normaliseAnswer,
  openDay,
  outcome,
  pastWindows,
  pickKind,
  questionWindow,
  scoreDay,
  shiftDay,
  standings,
  zonedInstant,
  type Kind,
  type Prediction,
} from "../lib/bets";
import type { EventsPayload } from "../lib/types";

const TZ = "America/Toronto";
const MIN = 60_000;
const HOUR = 60 * MIN;

/** Wall-clock time in Toronto on 2026-10-`day`, as an instant. */
const at = (day: number, h: number, m = 0) =>
  new Date(zonedInstant(`2026-10-${String(day).padStart(2, "0")}`, 0, 0, TZ).getTime() + h * HOUR + m * MIN);
const iso = (d: Date) => d.toISOString();

const payload = (over: Partial<EventsPayload> = {}): EventsPayload => ({
  start: iso(at(1, 0)),
  end: iso(at(20, 0)),
  feedings: [],
  sleep: [],
  diapers: [],
  comments: [],
  moments: [],
  ...over,
});

let n = 0;
const feed = (ml: number, when: Date, by?: string) => ({
  id: `f${n++}`,
  amount_ml: ml,
  ts: iso(when),
  created_at: iso(when),
  logged_by: by ?? null,
});
const diaper = (type: "pee" | "poop" | "both" | "massive_blowout", when: Date) =>
  ({ id: `d${n++}`, type, ts: iso(when), created_at: iso(when) }) as EventsPayload["diapers"][number];
const nap = (from: Date, to: Date | null) => ({
  id: `s${n++}`,
  sleep_start: iso(from),
  sleep_end: to ? iso(to) : null,
  created_at: iso(from),
});

const K = (id: string) => kindById(id) as Kind;
const DAY = "2026-10-10";
const WIN = dayWindow(DAY, TZ);

const pred = (person: string, answer: string | null): Prediction => ({
  id: `p-${person}`,
  day: DAY,
  person_id: person,
  name: person,
  answer,
  note: null,
  created_at: "",
  updated_at: "",
});

// --- days and zones ----------------------------------------------------------

test("the open day is today on the wall clock — a 6pm bet is about that same day", () => {
  assert.equal(currentDay(at(10, 18), TZ), "2026-10-10");
  assert.equal(openDay(at(10, 18), TZ), "2026-10-10");
  assert.equal(openDay(at(10, 23, 59), TZ), "2026-10-10");
  assert.equal(openDay(at(11, 0, 1), TZ), "2026-10-11");
});

test("every question is either about today or about tonight", () => {
  const night = KINDS.filter((k) => k.period === "night").map((k) => k.id).sort();
  assert.deepEqual(night, ["longest_sleep", "six_hours"]);
  for (const k of KINDS) {
    assert.match(k.ask, k.period === "night" ? /tonight/ : /today/, `${k.id} says when it's about`);
  }
});

test("a day runs midnight to midnight in its own zone, DST included", () => {
  // Toronto falls back on 2026-11-01: that day is 25 hours long.
  const w = dayWindow("2026-11-01", TZ);
  assert.equal(w.to.getTime() - w.from.getTime(), 25 * HOUR);
  assert.equal(WIN.to.getTime() - WIN.from.getTime(), 24 * HOUR);
});

test("day keys and zones are validated", () => {
  assert.ok(isDayKey("2026-10-10"));
  assert.ok(!isDayKey("2026-02-31"));
  assert.ok(!isDayKey("tomorrow"));
  assert.ok(isValidTimeZone(TZ));
  assert.ok(!isValidTimeZone("Mars/Olympus"));
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
});

// --- which question ----------------------------------------------------------

test("every question comes round once per cycle, in a shuffled order", () => {
  const start = 20_000; // a day number at the start of a cycle
  const len = KINDS.length;
  const first = Math.ceil(start / len) * len;
  const key = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
  const ids = Array.from({ length: len }, (_, i) => pickKind(key(first + i), () => true).id);
  assert.equal(new Set(ids).size, len, "a question repeated within a cycle");
  assert.notDeepEqual(ids, KINDS.map((k) => k.id), "the deck wasn't shuffled");
});

test("the same day gets the same question everywhere", () => {
  assert.equal(pickKind(DAY, () => true).id, pickKind(DAY, () => true).id);
});

test("a question whose log isn't in use is skipped", () => {
  const kind = pickKind(DAY, (k) => k.source === "feedings");
  assert.equal(kind.source, "feedings");
});

test("availability: spit-ups need a spit-up on record, a person question needs two people", () => {
  const windows = pastWindows(DAY, TZ);
  const data = payload({ feedings: [feed(100, at(9, 9))] });
  const can = availability(data, windows, 1);
  assert.ok(can(K("milk_total")));
  assert.ok(!can(K("spit_up")));
  assert.ok(!can(K("top_logger")));
  assert.ok(!can(K("blowout")), "no diapers logged");
  assert.ok(availability(data, windows, 2)(K("top_logger")));
});

// --- lines and hints ---------------------------------------------------------

test("an over/under line is the past week's average, off the whole numbers", () => {
  const feedings = [9, 8, 7].flatMap((d) =>
    Array.from({ length: d === 9 ? 7 : 6 }, (_, i) => feed(90, at(d, 1 + i * 3))),
  );
  // 7, 6, 6 feeds → average 6.33 → line 6.5.
  assert.equal(lineFor(K("feeds_count"), payload({ feedings }), pastWindows(DAY, TZ)), 6.5);
});

test("a sleep line is set to the quarter hour", () => {
  const sleep = [nap(at(9, 1), at(9, 8, 10)), nap(at(8, 1), at(8, 8, 10))];
  assert.equal(lineFor(K("sleep_total"), payload({ sleep }), pastWindows(DAY, TZ)), 7 * 60 + 15);
});

test("no week behind it, no line", () => {
  assert.equal(lineFor(K("feeds_count"), payload(), pastWindows(DAY, TZ)), null);
  assert.equal(lineFor(K("milk_total"), payload(), pastWindows(DAY, TZ)), null, "not an over/under");
});

test("the hint counts how many past days a yes/no happened on", () => {
  const diapers = [diaper("massive_blowout", at(9, 10)), diaper("pee", at(8, 10)), diaper("pee", at(7, 10))];
  const h = hintFor(K("blowout"), payload({ diapers }), pastWindows(DAY, TZ));
  assert.deepEqual({ happened: h.happenedDays, days: h.days }, { happened: 1, days: 3 });
});

// --- watching it play out ----------------------------------------------------

test("before midnight the question is open; through the day it's live", () => {
  const data = payload({ feedings: [feed(100, at(10, 2))] });
  assert.equal(outcome(K("milk_total"), null, data, WIN, at(9, 22)).phase, "open");
  const live = outcome(K("milk_total"), null, data, WIN, at(10, 12));
  assert.equal(live.phase, "live");
  assert.equal(live.obs.value, 100);
  assert.equal(live.settled, false);
});

test("a closest-guess question settles at midnight with the day's figure", () => {
  const data = payload({ feedings: [feed(100, at(10, 2)), feed(120, at(10, 14)), feed(90, at(11, 1))] });
  const r = outcome(K("milk_total"), null, data, WIN, at(11, 9));
  assert.equal(r.phase, "final");
  assert.ok(r.settled);
  assert.equal(r.obs.value, 220, "the next day's feed leaked in");
});

test("a yes settles the moment it happens; a no waits for midnight", () => {
  const data = payload({ diapers: [diaper("pee", at(10, 3)), diaper("massive_blowout", at(10, 11))] });
  const early = outcome(K("blowout"), null, data, WIN, at(10, 12));
  assert.deepEqual([early.phase, early.settled, early.winning], ["live", true, "yes"]);

  const quiet = payload({ diapers: [diaper("pee", at(10, 3))] });
  assert.equal(outcome(K("blowout"), null, quiet, WIN, at(10, 23)).settled, false);
  assert.equal(outcome(K("blowout"), null, quiet, WIN, at(11, 0, 1)).winning, "no");
});

test("over settles as soon as the line is passed; under waits", () => {
  const feedings = Array.from({ length: 7 }, (_, i) => feed(90, at(10, 1 + i)));
  const r = outcome(K("feeds_count"), 6.5, payload({ feedings }), WIN, at(10, 9));
  assert.deepEqual([r.settled, r.winning], [true, "over"]);

  const few = payload({ feedings: feedings.slice(0, 4) });
  assert.equal(outcome(K("feeds_count"), 6.5, few, WIN, at(10, 22)).settled, false);
  assert.equal(outcome(K("feeds_count"), 6.5, few, WIN, at(11, 1)).winning, "under");
});

test("landing exactly on a sleep line is no contest", () => {
  const sleep = [nap(at(10, 1), at(10, 8))];
  const r = outcome(K("sleep_total"), 7 * 60, payload({ sleep }), WIN, at(11, 1));
  assert.deepEqual([r.settled, r.void], [true, true]);
});

const NIGHT = questionWindow(K("six_hours"), DAY, TZ);

test("tonight runs from 6pm to 6am, in the day's own zone", () => {
  assert.equal(NIGHT.from.getTime(), at(10, 18).getTime());
  assert.equal(NIGHT.to.getTime(), at(11, 6).getTime());
  assert.equal(questionWindow(K("milk_total"), DAY, TZ).from.getTime(), WIN.from.getTime());
});

test("a 6pm bet on 6 hours straight is settled by that night's sleep", () => {
  // Down at 10pm, up at 5am: a seven-hour stretch, followed past midnight.
  const data = payload({ sleep: [nap(at(10, 22), at(11, 5))] });
  const running = outcome(K("six_hours"), null, payload({ sleep: [nap(at(10, 22), null)] }), NIGHT, at(11, 1));
  assert.deepEqual([running.phase, running.settled], ["live", false], "settled before she woke");
  const r = outcome(K("six_hours"), null, data, NIGHT, at(11, 9));
  assert.deepEqual([r.phase, r.winning, r.obs.value], ["final", "yes", 7 * 60]);
});

test("last night's sleep doesn't count towards tonight", () => {
  // The 1am–8am stretch belongs to the night of the 9th, not the 10th.
  const data = payload({ sleep: [nap(at(10, 1), at(10, 8)), nap(at(10, 21), at(11, 1))] });
  const r = outcome(K("six_hours"), null, data, NIGHT, at(11, 9));
  assert.deepEqual([r.winning, r.obs.value], ["no", 4 * 60]);
});

test("a stretch that starts before 6am is still tonight's, and can win after it", () => {
  const data = payload({ sleep: [nap(at(11, 5), null)] });
  const early = outcome(K("six_hours"), null, data, NIGHT, at(11, 7));
  assert.equal(early.settled, false);
  assert.equal(outcome(K("six_hours"), null, data, NIGHT, at(11, 11, 1)).winning, "yes");
});

test("a day question closes at noon", () => {
  assert.equal(closesAt(K("milk_total"), DAY, TZ, payload()).getTime(), at(10, 12).getTime());
  assert.equal(betting(K("milk_total"), null, payload(), DAY, TZ, at(10, 11, 59)).open, true);
  assert.equal(betting(K("milk_total"), null, payload(), DAY, TZ, at(10, 12)).open, false);
});

test("a night question closes when she goes down after 6pm, or 8pm at the latest", () => {
  // A 5pm nap doesn't count as going down for the night.
  const down = payload({ sleep: [nap(at(10, 17), at(10, 17, 40)), nap(at(10, 19, 15), null)] });
  assert.equal(closesAt(K("six_hours"), DAY, TZ, down).getTime(), at(10, 19, 15).getTime());
  assert.equal(closesAt(K("six_hours"), DAY, TZ, payload()).getTime(), at(10, 20).getTime());
  // So at 6pm, before she's down, tonight is still open.
  assert.equal(betting(K("six_hours"), null, down, DAY, TZ, at(10, 18)).open, true);
  assert.equal(betting(K("six_hours"), null, down, DAY, TZ, at(10, 19, 20)).open, false);
});

test("betting closes early once the log has decided it", () => {
  const data = payload({ diapers: [diaper("poop", at(10, 7, 30))] });
  const before = betting(K("first_poop"), null, data, DAY, TZ, at(10, 7));
  const after = betting(K("first_poop"), null, data, DAY, TZ, at(10, 8));
  assert.deepEqual([before.open, after.open, after.decided], [true, false, true]);
});

test("the first poop settles when it happens, as minutes after midnight", () => {
  const data = payload({ diapers: [diaper("pee", at(10, 2)), diaper("both", at(10, 7, 30))] });
  const r = outcome(K("first_poop"), null, data, WIN, at(10, 8));
  assert.deepEqual([r.settled, r.obs.value], [true, 7 * 60 + 30]);
});

test("a day with nothing logged is no contest, not a zero", () => {
  const r = outcome(K("milk_total"), null, payload(), WIN, at(11, 9));
  assert.deepEqual([r.settled, r.void], [true, true]);
});

test("top logger counts every kind of entry, by name, ignoring case", () => {
  const data = payload({
    feedings: [feed(90, at(10, 1), "Cal"), feed(90, at(10, 4), "sam"), feed(90, at(10, 7), "Sam")],
    sleep: [{ ...nap(at(10, 9), at(10, 10)), logged_by: "Cal" }],
    diapers: [{ ...diaper("pee", at(10, 11)), logged_by: "Sam" }],
  });
  const r = outcome(K("top_logger"), null, data, WIN, at(11, 1));
  assert.deepEqual([r.obs.value, r.obs.leaders.map((x) => x.toLowerCase())], [3, ["sam"]]);
});

// --- answers -----------------------------------------------------------------

test("answers are checked against the question", () => {
  const people = [{ id: "1", name: "Cal" }];
  assert.equal(normaliseAnswer(K("milk_total"), "820.4", people), "820");
  assert.equal(normaliseAnswer(K("milk_total"), "9999", people), null);
  assert.equal(normaliseAnswer(K("feeds_count"), "over", people), "over");
  assert.equal(normaliseAnswer(K("feeds_count"), "yes", people), null);
  assert.equal(normaliseAnswer(K("blowout"), "no", people), "no");
  assert.equal(normaliseAnswer(K("top_logger"), "cal", people), "Cal");
  assert.equal(normaliseAnswer(K("top_logger"), "Nana", people), null);
});

// --- points ------------------------------------------------------------------

const settledMilk = (ml: number) =>
  outcome(K("milk_total"), null, payload({ feedings: [feed(ml, at(10, 9))] }), WIN, at(11, 1));

test("closest: nearest takes 10, runner-up 5 with three or more, bullseye on top", () => {
  const scores = scoreDay(
    K("milk_total"),
    [pred("a", "810"), pred("b", "700"), pred("c", "1000")],
    settledMilk(800),
  );
  const pts = Object.fromEntries(scores.map((s) => [s.person_id, s.points]));
  assert.deepEqual(pts, { a: BBP.nearest + BBP.bullseye, b: BBP.runnerUp, c: 0 });
});

test("closest: a lone guesser can't be nearest, but can still hit the bullseye", () => {
  assert.equal(scoreDay(K("milk_total"), [pred("a", "500")], settledMilk(800))[0].points, 0);
  assert.equal(scoreDay(K("milk_total"), [pred("a", "790")], settledMilk(800))[0].points, BBP.bullseye);
});

test("closest: a tie for nearest pays both", () => {
  const scores = scoreDay(K("milk_total"), [pred("a", "750"), pred("b", "850")], settledMilk(800));
  assert.deepEqual(scores.map((s) => s.points), [BBP.nearest, BBP.nearest]);
});

test("yes/no: right pays 10, and the underdog bonus goes to a minority that was right", () => {
  const r = outcome(K("blowout"), null, payload({ diapers: [diaper("massive_blowout", at(10, 9))] }), WIN, at(11, 1));
  const scores = scoreDay(K("blowout"), [pred("a", "yes"), pred("b", "no"), pred("c", "no")], r);
  const pts = Object.fromEntries(scores.map((s) => [s.person_id, s.points]));
  assert.deepEqual(pts, { a: BBP.correct + BBP.underdog, b: 0, c: 0 });
});

test("nothing is scored until it settles, or when it's void", () => {
  const live = outcome(K("milk_total"), null, payload({ feedings: [feed(90, at(10, 1))] }), WIN, at(10, 9));
  assert.deepEqual(scoreDay(K("milk_total"), [pred("a", "800"), pred("b", "700")], live), []);
  const empty = outcome(K("milk_total"), null, payload(), WIN, at(11, 1));
  assert.deepEqual(scoreDay(K("milk_total"), [pred("a", "800"), pred("b", "700")], empty), []);
});

test("standings add up points and track the current streak", () => {
  const yes = outcome(K("blowout"), null, payload({ diapers: [diaper("massive_blowout", at(10, 9))] }), WIN, at(11, 1));
  const days = ["2026-10-10", "2026-10-11"].map((key) => ({
    key,
    kind: K("blowout"),
    preds: [pred("a", "yes"), pred("b", key === "2026-10-11" ? "yes" : "no")],
    result: yes,
  }));
  const table = standings([{ id: "a", name: "Cal" }, { id: "b", name: "Sam" }], days);
  assert.deepEqual(
    table.map((r) => [r.name, r.bbp, r.wins, r.losses, r.streak]),
    [
      // A one-against-one split is no underdog: that needs a strict minority.
      ["Cal", 2 * BBP.correct, 2, 0, 2],
      ["Sam", BBP.correct, 1, 1, 1],
    ],
  );
});
