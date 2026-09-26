import { db } from "@/lib/db";
import { BadRequest, fail, ok, readJson, readMe } from "@/lib/http";
import {
  currentNight,
  isValidTimeZone,
  lockTime,
  nightWindow,
  type Bet,
  type BetsPayload,
  type Night,
  type Person,
  type Pick,
} from "@/lib/bets";
import type { SleepSession } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/**
 * GET /api/bets?me=<person id> — every night, every call, and the sleep that
 * settles them, in one trip. Results and points are worked out on the phone
 * from these rows (lib/bets.ts), so there's nothing here to go stale.
 *
 * Calls are blind until betting closes: before then, everyone else's pick,
 * guess and note come back empty, and only the fact that they've called it
 * shows. Honour-system blind — it's in the request, not behind a login — but
 * it's there so nobody just copies Nana.
 */
export async function GET(req: Request) {
  try {
    const me = new URL(req.url).searchParams.get("me");
    const now = new Date();
    const sql = await db();

    const [people, nights, bets] = (await Promise.all([
      sql`SELECT id, name FROM people ORDER BY lower(name)`,
      sql`SELECT to_char(night, 'YYYY-MM-DD') AS night, tz FROM bet_nights ORDER BY night`,
      sql`SELECT b.id, to_char(b.night, 'YYYY-MM-DD') AS night, b.person_id, p.name,
                 b.pick, b.guess_min, b.note, b.created_at, b.updated_at
            FROM bets b JOIN people p ON p.id = b.person_id
           ORDER BY b.night, b.created_at`,
    ])) as [Person[], Night[], Bet[]];

    // Enough sleep to settle the oldest night and draw the live one. Two days
    // back covers tonight's card when nobody has bet yet.
    const earliest = nights.length
      ? Math.min(nightWindow(nights[0].night, nights[0].tz).from.getTime(), now.getTime() - 2 * DAY)
      : now.getTime() - 2 * DAY;
    const sleep = (await sql`
      SELECT * FROM sleep_sessions
       WHERE sleep_start >= ${new Date(earliest).toISOString()}
       ORDER BY sleep_start`) as SleepSession[];

    const tzOf = new Map(nights.map((n) => [n.night, n.tz]));
    const blinded = bets.map((b) => {
      if (b.person_id === me) return b;
      const locked = lockTime(nightWindow(b.night, tzOf.get(b.night)!), sleep) <= now;
      return locked ? b : { ...b, pick: null, guess_min: null, note: null };
    });

    const payload: BetsPayload = {
      now: now.toISOString(),
      people,
      nights,
      bets: blinded,
      sleep,
    };
    return ok(payload);
  } catch (err) {
    return fail(err);
  }
}

/**
 * POST /api/bets — make or change tonight's call. Only ever tonight's, and only
 * until she goes down (or 8pm). Both are checked here, against the database's
 * own sleep rows, because a phone's clock and a phone's idea of "tonight" are
 * exactly the things that can't be trusted to close a bet.
 */
export async function POST(req: Request) {
  try {
    const me = readMe(req);
    if (!me) throw new BadRequest("Pick your name first");

    const body = await readJson(req);
    const pick = parsePick(body.pick);
    const guess = parseGuess(body.guess_min);
    const note = parseNote(body.note);
    if (!isValidTimeZone(body.tz)) throw new BadRequest("Unknown time zone");

    const sql = await db();
    const person = (await sql`SELECT id FROM people WHERE id = ${me}`) as Person[];
    if (!person[0]) throw new BadRequest("That name is gone — pick yours again");

    const now = new Date();
    const key = currentNight(now, body.tz);
    if (body.night !== undefined && body.night !== key) {
      throw new BadRequest("Betting on that night has closed");
    }

    // First bettor sets the zone; everyone after is judged by the same clock.
    await sql`
      INSERT INTO bet_nights (night, tz) VALUES (${key}, ${body.tz})
      ON CONFLICT (night) DO NOTHING`;
    const [{ tz }] = (await sql`
      SELECT tz FROM bet_nights WHERE night = ${key}`) as { tz: string }[];

    const win = nightWindow(key, tz);
    const sleep = (await sql`
      SELECT * FROM sleep_sessions
       WHERE sleep_start >= ${win.from.toISOString()} AND sleep_start < ${win.to.toISOString()}`) as SleepSession[];
    if (lockTime(win, sleep) <= now) {
      throw new BadRequest("Too late — betting closed when she went down");
    }

    const rows = (await sql`
      INSERT INTO bets (night, person_id, pick, guess_min, note)
      VALUES (${key}, ${me}, ${pick}, ${guess}, ${note})
      ON CONFLICT (night, person_id) DO UPDATE
         SET pick = EXCLUDED.pick,
             guess_min = EXCLUDED.guess_min,
             note = EXCLUDED.note,
             updated_at = now()
      RETURNING id, to_char(night, 'YYYY-MM-DD') AS night, person_id, pick, guess_min, note,
                created_at, updated_at`) as Omit<Bet, "name">[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}

function parsePick(value: unknown): Pick {
  if (value !== "yes" && value !== "no") throw new BadRequest("pick must be yes or no");
  return value;
}

function parseGuess(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new BadRequest("guess_min must be a number");
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 24 * 60) throw new BadRequest("guess_min must be within a day");
  return rounded;
}

function parseNote(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new BadRequest("note must be text");
  const trimmed = value.trim();
  if (trimmed.length > 280) throw new BadRequest("Note is too long (280 characters max)");
  return trimmed || null;
}
