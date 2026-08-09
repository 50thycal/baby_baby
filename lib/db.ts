import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SCHEMA_STATEMENTS } from "./schema";

let client: NeonQueryFunction<false, false> | null = null;

function connect() {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add a Postgres database to the project " +
        "(Vercel → Storage → Neon) or copy .env.example to .env.local.",
    );
  }
  client = neon(url);
  return client;
}

let ready: Promise<void> | null = null;

/**
 * Creates the schema if it isn't there yet. Runs at most once per warm
 * instance; every statement is `IF NOT EXISTS`, so repeats are free.
 */
function ensureSchema() {
  if (!ready) {
    const c = connect();
    ready = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await c.query(statement);
      }
    })().catch((err) => {
      ready = null; // let the next request retry
      throw err;
    });
  }
  return ready;
}

/**
 * `sql` tagged template, with the schema guaranteed to exist.
 *
 *   const rows = await db()`SELECT * FROM feedings WHERE ts > ${since}`;
 */
export async function db() {
  const c = connect();
  await ensureSchema();
  return c;
}

export { SCHEMA_STATEMENTS };
