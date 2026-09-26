import { db } from "@/lib/db";
import { fail, ok, parsePersonName, readJson } from "@/lib/http";
import type { Person } from "@/lib/bets";

export const dynamic = "force-dynamic";

/** Every name anyone has picked, for the "who's this?" chips. */
export async function GET() {
  try {
    const sql = await db();
    const rows = (await sql`SELECT id, name FROM people ORDER BY lower(name)`) as Person[];
    return ok(rows);
  } catch (err) {
    return fail(err);
  }
}

/**
 * Picks a name. Typing one that already exists — in any capitalisation — hands
 * back that person rather than making a second, so a new phone rejoins its old
 * record without anyone needing to know it has one.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const name = parsePersonName(body.name);

    const sql = await db();
    const rows = (await sql`
      WITH made AS (
        INSERT INTO people (name) VALUES (${name})
        ON CONFLICT ((lower(name))) DO NOTHING
        RETURNING id, name
      )
      SELECT id, name FROM made
      UNION ALL
      SELECT id, name FROM people WHERE lower(name) = lower(${name})
      LIMIT 1`) as Person[];

    return ok(rows[0], 201);
  } catch (err) {
    return fail(err);
  }
}
