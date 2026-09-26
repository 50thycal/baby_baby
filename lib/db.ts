import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { SCHEMA_STATEMENTS } from "./schema";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * Vercel injects a different variable name depending on how the database was
 * attached — the Neon marketplace integration sets DATABASE_URL, while the
 * older Vercel Postgres path sets POSTGRES_URL. Accept either, and fall back to
 * the direct (unpooled) URLs so the app still comes up if only those are
 * present. Pooled first: these are serverless functions, and a pool is the
 * whole point.
 */
const URL_VARS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
] as const;

function connect() {
  if (client) return client;
  const name = URL_VARS.find((key) => process.env[key]);
  if (!name) {
    throw new Error(
      "No database URL is set. Add a Postgres database to the project " +
        "(Vercel → Storage → Create Database → Neon), then redeploy so the " +
        "connection string reaches this deployment. Locally, copy " +
        ".env.example to .env.local. Looked for: " +
        URL_VARS.join(", ") +
        ".",
    );
  }
  client = neon(process.env[name]!);
  return client;
}

let ready: Promise<void> | null = null;

/**
 * Did this statement fail only because another instance created the same
 * thing a moment earlier?
 *
 * `IF NOT EXISTS` checks and then creates without a lock, so after a deploy
 * that adds a table, two cold starts running this at once can both see it
 * missing — and the slower one trips over a system catalog's unique index
 * (`pg_type_typname_nsp_index` for a table). The object exists either way,
 * which is all the statement wanted. A 23505 against one of our own tables
 * (a unique index over duplicate rows) is a real problem and still throws.
 */
export function isConcurrentCreate(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, constraint } = err as { code?: string; constraint?: string };
  if (code === "23505") return typeof constraint === "string" && constraint.startsWith("pg_");
  // duplicate_table (a table or index), duplicate_object, duplicate_column
  return code === "42P07" || code === "42710" || code === "42701";
}

/**
 * Creates the schema if it isn't there yet. Runs at most once per warm
 * instance; every statement is `IF NOT EXISTS`, so repeats are free.
 */
function ensureSchema() {
  if (!ready) {
    const c = connect();
    ready = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        try {
          await c.query(statement);
        } catch (err) {
          if (!isConcurrentCreate(err)) throw err;
        }
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
