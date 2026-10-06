import { db } from "@/lib/db";
import { BadRequest, fail, ok, readJson, readMe } from "@/lib/http";
import {
  availability,
  dayWindow,
  isDayKey,
  isValidTimeZone,
  kindById,
  lineFor,
  normaliseAnswer,
  openDay,
  pastWindows,
  pickKind,
  shiftDay,
  type BetDay,
  type BetsPayload,
  type DayKey,
  type Person,
  type Prediction,
} from "@/lib/bets";
import type { EventsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY_COLUMNS = "to_char(day, 'YYYY-MM-DD') AS day, tz, kind, line";

/**
 * GET /api/bets?me=<person id>&tz=<zone> — every day's question and every
 * answer, in one trip. The log that settles them comes from /api/events, and
 * results and points are worked out on the phone (lib/bets.ts), so there's
 * nothing here to go stale.
 *
 * Asking also sets tomorrow's question if nobody has yet, in the asker's zone.
 * That's the moment it has to be frozen: the line comes from the past week,
 * and it must not move under people who have already called it.
 *
 * Answers are blind until the day starts: before then, everyone else's answer
 * and note come back empty, and only the fact that they've played shows.
 * Honour-system blind — it's in the request, not behind a login — but it's
 * there so nobody just copies Nana.
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const me = params.get("me");
    const tz = params.get("tz");
    const now = new Date();
    const sql = await db();

    const people = (await sql`SELECT id, name FROM people ORDER BY lower(name)`) as Person[];
    if (isValidTimeZone(tz)) await ensureDay(openDay(now, tz), tz, now, people.length);

    const [days, predictions] = (await Promise.all([
      sql.query(`SELECT ${DAY_COLUMNS} FROM bet_days ORDER BY day`),
      sql`SELECT p.id, to_char(p.day, 'YYYY-MM-DD') AS day, p.person_id, pe.name,
                 p.answer, p.note, p.created_at, p.updated_at
            FROM bet_predictions p JOIN people pe ON pe.id = p.person_id
           ORDER BY p.day, p.created_at`,
    ])) as [BetDay[], Prediction[]];

    const tzOf = new Map(days.map((d) => [d.day, d.tz]));
    const blinded = predictions.map((p) => {
      if (p.person_id === me) return p;
      const started = dayWindow(p.day, tzOf.get(p.day)!).from <= now;
      return started ? p : { ...p, answer: null, note: null };
    });

    const payload: BetsPayload = { now: now.toISOString(), people, days, predictions: blinded };
    return ok(payload);
  } catch (err) {
    return fail(err);
  }
}

/**
 * Sets a day's question if it isn't set: picks the card for the day from the
 * questions whose logs are in use, and draws the over/under line from the
 * week before it. A no-op when it's already there, so two phones asking at
 * once both land on the first one's question.
 */
async function ensureDay(key: DayKey, tz: string, now: Date, peopleCount: number) {
  const sql = await db();
  const exists = (await sql`SELECT 1 FROM bet_days WHERE day = ${key}`) as unknown[];
  if (exists.length) return;

  // The finished days before today. Today is still going, and a half day in
  // the average would set every line low.
  const windows = pastWindows(shiftDay(key, -1), tz);
  const since = new Date(Math.min(...windows.map((w) => w.from.getTime())));
  const sinceIso = since.toISOString();
  const [feedings, sleep, diapers, moments] = (await Promise.all([
    sql`SELECT * FROM feedings WHERE ts >= ${sinceIso}`,
    sql`SELECT * FROM sleep_sessions WHERE sleep_end IS NULL OR sleep_end >= ${sinceIso}`,
    sql`SELECT * FROM diapers WHERE ts >= ${sinceIso}`,
    sql`SELECT * FROM moments WHERE ts >= ${sinceIso}`,
  ])) as [
    EventsPayload["feedings"],
    EventsPayload["sleep"],
    EventsPayload["diapers"],
    EventsPayload["moments"],
  ];
  const data: EventsPayload = {
    start: sinceIso,
    end: now.toISOString(),
    feedings,
    sleep,
    diapers,
    moments,
    comments: [],
  };

  const kind = pickKind(key, availability(data, windows, peopleCount));
  const line = lineFor(kind, data, windows);
  await sql`
    INSERT INTO bet_days (day, tz, kind, line) VALUES (${key}, ${tz}, ${kind.id}, ${line})
    ON CONFLICT (day) DO NOTHING`;
}

/**
 * POST /api/bets — lock in your answer for tomorrow. Once, and for good: a
 * call can't be changed after it's in, so nobody can drift toward whatever
 * the rest of the evening seems to suggest. Only ever tomorrow's, and only
 * until its midnight — both checked here, in the day's own zone, because a
 * phone's clock and a phone's idea of "tomorrow" are exactly the things that
 * can't be trusted to close a bet.
 */
export async function POST(req: Request) {
  try {
    const me = readMe(req);
    if (!me) throw new BadRequest("Pick your name first");

    const body = await readJson(req);
    if (!isDayKey(body.day)) throw new BadRequest("day must be YYYY-MM-DD");
    const note = parseNote(body.note);

    const sql = await db();
    const people = (await sql`SELECT id, name FROM people ORDER BY lower(name)`) as Person[];
    if (!people.some((p) => p.id === me)) {
      throw new BadRequest("That name is gone — pick yours again");
    }

    const rows = (await sql.query(`SELECT ${DAY_COLUMNS} FROM bet_days WHERE day = $1`, [
      body.day,
    ])) as BetDay[];
    const day = rows[0];
    if (!day) throw new BadRequest("No question for that day yet");

    const now = new Date();
    if (day.day !== openDay(now, day.tz) || dayWindow(day.day, day.tz).from <= now) {
      throw new BadRequest("Too late — that day has started");
    }

    const kind = kindById(day.kind);
    if (!kind) throw new BadRequest("Unknown question");
    const answer = normaliseAnswer(kind, body.answer, people);
    if (answer === null) throw new BadRequest("That answer doesn't fit the question");

    const saved = (await sql`
      INSERT INTO bet_predictions (day, person_id, answer, note)
      VALUES (${day.day}, ${me}, ${answer}, ${note})
      ON CONFLICT (day, person_id) DO NOTHING
      RETURNING id, to_char(day, 'YYYY-MM-DD') AS day, person_id, answer, note,
                created_at, updated_at`) as Omit<Prediction, "name">[];

    // Nothing came back: there was already a call, and it stands. Decided by
    // the database's unique constraint rather than a read beforehand, so two
    // quick taps can't both get in.
    if (!saved[0]) throw new BadRequest("You've already locked in your call for tomorrow");

    return ok(saved[0], 201);
  } catch (err) {
    return fail(err);
  }
}

function parseNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new BadRequest("note must be text");
  const trimmed = value.trim();
  if (trimmed.length > 280) throw new BadRequest("Note is too long (280 characters max)");
  return trimmed || null;
}
