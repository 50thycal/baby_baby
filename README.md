# Baby Baby

A very small, mobile-first web app for tracking feeding, sleep and diapers.
One shared URL, one shared database — whoever logs something, everyone sees it.

The whole design goal is that logging an event takes two or three taps, one
handed, in the dark, while holding a baby.

---

## Stack

| Piece    | Choice                                   | Why |
| -------- | ---------------------------------------- | --- |
| Framework| Next.js 15 (App Router) + React 19 + TS   | One deployable, API routes and UI in the same repo |
| Styling  | Tailwind CSS v4                           | No config file; design tokens live in `app/globals.css` |
| Data     | Postgres via `@neondatabase/serverless`   | Real SQL over HTTP, no connection pool to babysit in serverless |
| Fetching | SWR                                       | Revalidates on window focus, so opening the app shows current state |
| Host     | Vercel                                    | — |

No auth. It's a private-by-obscurity family URL, exactly as specced.

## Which database, and why

**Use Neon Postgres, added through the Vercel Marketplace.** From the project
in Vercel: **Storage → Create Database → Neon → Connect**. That injects
`DATABASE_URL` into the project's environment automatically, and the app
creates its own tables on first request. There is no migration step to run.

Why Neon over the alternatives:

- **It's the native Postgres on Vercel.** "Vercel Postgres" *is* Neon now, so
  it's a two-click install with zero credential handling on your side.
- **The serverless driver talks over HTTP,** not a TCP pool. Serverless
  functions spin up and die constantly; a normal Postgres driver burns
  connections doing that. This one doesn't.
- **The free tier is far more than a family needs.** A few thousand rows a year.
- **Real SQL.** The dashboard is fundamentally "give me everything between two
  timestamps" — that's a `WHERE ts BETWEEN`, not a document scan.

Alternatives considered: **Supabase** (also Postgres, and fine — but you'd be
adopting its auth/realtime/storage stack to use one table set); **Upstash
Redis** (wrong shape — no range queries over a time axis); **Turso/SQLite**
(good, but not a first-class Vercel integration).

Nothing in the code is Neon-specific beyond the driver import. `DATABASE_URL`
is a plain Postgres connection string, so Supabase or any other Postgres works
by swapping that one variable.

`vercel.json` pins `"framework": "nextjs"`. Settings in that file take
precedence over the dashboard's Framework Preset, which matters if the Vercel
project was linked to this repo before the app existed — it would have been
auto-detected as "Other", skipped `next build`, and failed looking for a
`public/` directory.

### Local development

```bash
npm install
cp .env.example .env.local     # paste a Neon connection string
npm run dev
```

`npm run db:setup` applies the schema explicitly if you want to verify a new
database before pointing the app at it — otherwise it happens on first request.

## Data model

Four tables, no joins (`lib/schema.ts`):

```
feedings         id, amount_ml, ts, created_at
sleep_sessions   id, sleep_start, sleep_end (nullable), created_at
diapers          id, type, ts, created_at
comments         id, ts, text, reactions (jsonb), created_at
```

`sleep_end IS NULL` means the baby is asleep *right now*. That state has to be
correct across phones, so it's enforced in the database rather than in the UI:

```sql
CREATE UNIQUE INDEX sleep_sessions_single_active
  ON sleep_sessions ((sleep_end IS NULL)) WHERE sleep_end IS NULL;
```

A partial unique index on a constant expression permits at most one open
session. If two people put the baby down in the same minute, the second request
gets a 409 carrying the existing session, and their app just adopts it.

Diaper types are constrained to `pee | poop | both | massive_blowout`.
Everything is stored as `timestamptz` (UTC) and rendered in each viewer's own
timezone.

## Screens

**Log** — status in three lines, then three large tiles.

- **Feed** opens a 270° drag dial (0–100 mL, snaps to 5, with `−5`/`+5` for
  precision). It defaults to the last feed's amount, since the next one usually
  matches. The gap at the bottom of the gauge is deliberate: you can't drag past
  100 and wrap around to 0.
- **Sleep** starts a session; once running, the tile becomes a live timer and
  the same tile ends it with **Baby's Awake**.
- **Diaper** is four big buttons, then confirm.

Every timestamp defaults to now and is adjustable by tapping it — a horizontal
scroll-snap wheel with 5-minute detents, plus `−1h / −30m / −5m / +5m / reset`
chips. No date pickers anywhere.

**History** — three time-aligned tracks sharing one horizontal axis: feeding
bars scaled by volume, sleep blocks scaled by duration, diaper icons. Ranges are
24h / 2d / 3d / 1 week; it opens scrolled to now. Tapping any mark opens edit
and delete (delete is two-step). **Comment** mode turns the timeline into a
target — tap a moment, write a note, and it lands at that timestamp with emoji
reactions.

**Copy for AI** puts readable JSON for the selected range on the clipboard:
period, summary, and every feeding, sleep, diaper and comment. Paste it into any
chat and ask about patterns.

## Layout

```
app/
  page.tsx              Log | History shell
  globals.css           design tokens (light + dark)
  manifest.ts           PWA
  api/                  feedings, sleep, diapers, comments, events, state
components/
  HomeScreen, Dashboard, Timeline, SummaryCard, NotesList
  Dial, TimeField, Sheet, ConfirmButton, DeleteButton, Toaster
  sheets/               Feed, Sleep, Diaper, Comment, EventDetail
lib/
  db, schema, types, time, summary, export, api, haptics, useNow
```

`GET /api/state` answers "what's happening now" for the Log screen;
`GET /api/events?range=24h` returns everything the dashboard draws in one trip.

## Importing a paper log

A quiet link under the three tiles on the Log screen opens a paste box for
typing up a paper feeding log in one go. One entry per line:

```
8/6  2:00am  20
8/6  5:00am  20 mL
8/6  7:36am  diaper pee
# blank lines and hash comments are ignored
```

Dates accept `8/6`, `08/06` or `8/6/26`; a bare `M/D` resolves to the most
recent one that isn't in the future. Times accept `2:00am`, `2am` or `02:00`.
Diaper lines take `pee`, `poop`, `both` or `blowout`.

Two decisions worth keeping:

- **Parsing happens in the browser**, not the API. The times on a paper log are
  local times, and building them client-side resolves them in the reader's own
  zone — no offset to ask for or hardcode.
- **Nothing is written until the parse is shown back** — counts, millilitres and
  a per-day split, with unreadable lines listed by line number. Transcribing
  handwriting is error-prone enough that a silent import is worse than none.

`POST /api/import` validates the whole batch before writing, so one bad row
doesn't leave a partial import behind, and skips rows that exactly match
existing ones, so re-pasting after a half-failure adds only what's missing.

## Backups

The app has no accounts on purpose — anyone with the link can log a feed, and
anyone with the link can delete one. The safety net sits behind that rather than
in front of it. A **Backups** link next to Import lists restore points, each
showing its row counts so you can spot the one from before something went wrong.

Copies are triggered by activity, not a clock. Every `/api/state` read calls
`maybeSnapshot()`, throttled twice over: an in-process timer keeps all but one
request in five minutes from touching the database, and a count-plus-timestamp
fingerprint means an idle week doesn't store the same data over and over. No
cron job, so no scheduling limits and nothing to notice when it stops running.

Deletes are treated separately. `snapshotBeforeDelete()` runs before any row is
removed and forces a copy if the newest is more than two minutes old — without
it, deleting something 50 minutes into the hour would cost 50 minutes of
legitimate entries to undo. Back-to-back deletes reuse the copy just taken.

Restoring takes a copy of the current state first, so restoring to the wrong
point is itself undoable. Any restore point can also be downloaded as JSON to
keep a copy somewhere that isn't this database.

Neither path is allowed to fail a request: a backup problem is logged and
dropped rather than blocking the person trying to log a feed.

## Tests

```sh
npm test     # parser unit tests (node:test)
```

The API and browser suites run against a real Postgres rather than a mock;
they're driven from the harness rather than checked in.

## Visual direction

The palette, typography and control language come from the **MBT Awareness
Loop** app (`50thycal/mbt-app-pilot`): warm paper instead of white, low-contrast
warm greys, cards barely lighter than the background with a hairline border
doing the separating, plain system sans at light weights, uppercase eyebrow
labels, and a 0.985 press dip. Radii and spacing follow it too.

The deliberate divergence is colour. The reference is monochrome because it has
a single action; this app has three that need telling apart at a glance in the
dark, so FEED / SLEEP / DIAPER each carry an accent — desaturated into the same
earthy family so they sit inside that world rather than shouting over it. The
emoji supply the personality the spec asked for; the type doesn't have to.

Every token is in one block at the top of `app/globals.css`.

## Notes

- Installable to the iPhone home screen — `display: standalone`, safe-area
  padding, generated apple-touch-icon.
- Dark mode follows the phone's setting, which matters at 3am.
- `maximum-scale=1` stops iOS double-tap zoom during fast repeated taps.
- Haptics fire on dial and wheel detents where the browser supports it; the
  visuals never depend on it.
