/**
 * The whole database, no migrations framework.
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

  // Spit-ups and fussy spells: a time and nothing else. One table with a kind,
  // like diapers, so adding a third marker later is a one-line change.
  `CREATE TABLE IF NOT EXISTS moments (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     kind       text        NOT NULL CHECK (kind IN ('spit_up', 'fussy')),
     ts         timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  // Weigh-ins. Grams, because it's the unit a paediatrician writes down and it
  // stores as an integer; pounds and ounces are a presentation detail. The
  // ceiling is far above any baby — it's there to catch a slipped decimal, not
  // to express an opinion.
  `CREATE TABLE IF NOT EXISTS weights (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     weight_g   integer     NOT NULL CHECK (weight_g > 0 AND weight_g <= 50000),
     ts         timestamptz NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  // Point-in-time copies of the other tables. The app has no accounts and
  // anyone with the link can delete things, so this is the undo of last resort.
  // The whole dataset is a few hundred rows, so storing it as one JSON document
  // per snapshot is cheaper than any cleverer scheme.
  `CREATE TABLE IF NOT EXISTS snapshots (
     id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     taken_at timestamptz NOT NULL DEFAULT now(),
     reason   text        NOT NULL DEFAULT 'auto',
     counts   jsonb       NOT NULL,
     payload  jsonb       NOT NULL
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
  `CREATE INDEX IF NOT EXISTS moments_ts_idx ON moments (ts DESC)`,
  // Which row is the birth weight, rather than inferring it from being the
  // earliest. Inferring would be wrong the moment someone logs a weigh-in
  // before backfilling the birth weight — the app would offer to overwrite a
  // real reading. Additive and defaulted, so existing rows need nothing.
  `ALTER TABLE weights ADD COLUMN IF NOT EXISTS is_birth boolean NOT NULL DEFAULT false`,

  // At most one. A second birth weight isn't a correction, it's a mistake.
  `CREATE UNIQUE INDEX IF NOT EXISTS weights_single_birth ON weights ((is_birth)) WHERE is_birth`,

  `CREATE INDEX IF NOT EXISTS weights_ts_idx ON weights (ts DESC)`,
  `CREATE INDEX IF NOT EXISTS snapshots_taken_at_idx ON snapshots (taken_at DESC)`,

  // Names, not accounts: no password, nothing to sign in to. A table rather
  // than free text so "Cal", "cal" and "Cal " are one person with one record,
  // and so a second phone can offer the name as a chip instead of a text box.
  `CREATE TABLE IF NOT EXISTS people (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name       text        NOT NULL CHECK (length(name) > 0 AND length(name) <= 24),
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS people_name_idx ON people (lower(name))`,

  // Who logged what. The name as it was, in plain text, rather than a key into
  // people: these rows go through backups and restores, and a signature that
  // needs a join to read is one more thing a restore could leave dangling.
  // Nullable — everything from before names existed stays unsigned.
  `ALTER TABLE feedings       ADD COLUMN IF NOT EXISTS logged_by text`,
  `ALTER TABLE sleep_sessions ADD COLUMN IF NOT EXISTS logged_by text`,
  `ALTER TABLE diapers        ADD COLUMN IF NOT EXISTS logged_by text`,
  `ALTER TABLE comments       ADD COLUMN IF NOT EXISTS logged_by text`,
  `ALTER TABLE moments        ADD COLUMN IF NOT EXISTS logged_by text`,
  `ALTER TABLE weights        ADD COLUMN IF NOT EXISTS logged_by text`,

  // One row per night anyone bet on, carrying the time zone that "6pm" and
  // "8pm" mean for it — the server runs in UTC. The first bettor's zone wins.
  `CREATE TABLE IF NOT EXISTS bet_nights (
     night      date        PRIMARY KEY,
     tz         text        NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,

  // One call per person per night, changeable until betting closes. No result
  // column: the outcome is recomputed from sleep_sessions (see lib/bets.ts).
  `CREATE TABLE IF NOT EXISTS bets (
     id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     night      date        NOT NULL REFERENCES bet_nights (night),
     person_id  uuid        NOT NULL REFERENCES people (id),
     pick       text        NOT NULL CHECK (pick IN ('yes', 'no')),
     guess_min  integer     CHECK (guess_min IS NULL OR (guess_min >= 0 AND guess_min <= 1440)),
     note       text        CHECK (note IS NULL OR length(note) <= 280),
     created_at timestamptz NOT NULL DEFAULT now(),
     updated_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (night, person_id)
   )`,
];
