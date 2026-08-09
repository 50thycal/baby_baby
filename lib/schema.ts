/**
 * The whole database. Four tables, no migrations framework.
 *
 * Every statement is idempotent, so this runs safely on every cold start
 * (see `lib/db.ts`) and via `npm run db:setup`.
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS pgcrypto`,

  `CREATE TABLE IF NOT EXISTS feedings (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     amount_ml  integer     NOT NULL CHECK (amount_ml >= 0 AND amount_ml <= 1000),
     ts         timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS sleep_sessions (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     sleep_start timestamptz NOT NULL,
     sleep_end   timestamptz,
     created_at  timestamptz NOT NULL DEFAULT now(),
     CONSTRAINT sleep_ends_after_start CHECK (sleep_end IS NULL OR sleep_end > sleep_start)
   )`,

  `CREATE TABLE IF NOT EXISTS diapers (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     type       text        NOT NULL CHECK (type IN ('pee', 'poop', 'both', 'massive_blowout')),
     ts         timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS comments (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     ts         timestamptz NOT NULL,
     text       text        NOT NULL CHECK (length(text) > 0 AND length(text) <= 280),
     reactions  jsonb       NOT NULL DEFAULT '{}'::jsonb,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  // The baby cannot be asleep twice. A partial unique index on a constant
  // expression allows at most one row where sleep_end IS NULL.
  `CREATE UNIQUE INDEX IF NOT EXISTS sleep_sessions_single_active
     ON sleep_sessions ((sleep_end IS NULL))
     WHERE sleep_end IS NULL`,

  `CREATE INDEX IF NOT EXISTS feedings_ts_idx ON feedings (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS diapers_ts_idx ON diapers (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS comments_ts_idx ON comments (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS sleep_start_idx ON sleep_sessions (sleep_start DESC)`,
];
