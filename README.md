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

## Spit-ups and fussy spells

Two markers that have a time and nothing else — you only want to know roughly
when, not how much.

- **Big spit up** is logged from the feed sheet and marks the **feeding** track.
- **Fussy fussy** is logged from the sleep sheet and marks the **sleep** track.

Both sit in one `moments` table with a `kind`, the way diapers carry a type, so
a third marker later is a one-line change. Each is its own event with its own
time: a spit-up usually gets noticed while you're logging a feed, but it might
have happened between two, so it isn't attached to one.

On the Basic timeline they draw as a thin line with the emoji in a reserved lane
along the top of the track — no scaling, because there's nothing to scale. They
**do not respond to a short tap**: they share a track with the feed bars, and a
tap target over a bar stole the tap, so you'd go to check how big a feed was and
get the spit-up instead. The bars are what you actually need to open.

To correct one, **press and hold the emoji** for half a second. Only the emoji
reacts — never the line — and it sits in a lane above the bars so the two never
compete. The hold is cancelled by movement, because the timeline scrolls
sideways and a drag that happens to start on the emoji is a scroll, not a hold.

On the Advanced charts they're dashed verticals behind the curves, so they read
as "around here" and can't be mistaken for part of the line.

They're carried in backups, restores and the Copy data export. Backups taken
before the feature existed have no count for them, so the list omits the figure
rather than printing `undefined`.

## The Grand Tally

At the very bottom of Advanced, deliberately last: it's the fun one, not the
useful one. Lifetime totals for milk, sleep and diapers, plus spit-ups, fussy
spells and notes.

Raw lifetime figures stop meaning much quickly — nobody has intuition for
"38,400 mL" — so each is paired with a comparison that grows with her:

- **Milk** climbs a ladder of containers: a can of Coke, a litre bottle, a
  gallon of milk, a 12-pack, a car's fuel tank, a bathtub, eventually an Olympic
  pool. The largest rung she's passed is the one shown, and the next one is
  named so there's something to aim at.
- **Sleep** becomes walking distance from Kansas City at a 2 mph amble: Lenexa,
  Lawrence, Topeka, Columbia, Omaha, St. Louis, Denver, Mount Rushmore, and on
  to the coasts.
- **Diapers** get stacked into a tower. A stacked diaper is close enough to an
  inch that the count and the height in inches are the same number, which keeps
  the arithmetic honest: a car, a house, a three-story block, an eight-story
  complex, the Statue of Liberty, One Kansas City Place, the Eiffel Tower, the
  Empire State Building, One World Trade Center, the Burj Khalifa.

Both ladders live at the top of `lib/tally.ts` and are just ordered lists — add
a rung and it slots in.

## Forecasts

Four short-range predictions, each shown where the decision is made rather than
collected into a panel of their own.

| Forecast | Where | Reads like |
|---|---|---|
| Next feed window | Log, status strip | `Next feed  3:57 AM – 4:38 AM` |
| Likely amount | Feed sheet, under the dial | `lately 40–55 mL · trending up` |
| Wake window | Log, while she's asleep | `Sleeping 40m — up ~6:26–7:16 AM` |
| Day pace | Basic, under the totals | `9 mL ahead of the usual by now` |

Three rules run through `lib/predict.ts`:

- **Ranges, never points.** "3:15pm" claims a precision that isn't there.
  A window is the same information told honestly, and it stays true on the days
  she's unpredictable rather than being quietly wrong.
- **Quartiles, not means.** A cluster-feeding evening or one missed log would
  drag an average around badly. The 25th–75th percentile is the middle half of
  what she actually does and shrugs off both.
- **Refuse rather than guess.** Every function returns `null` below a minimum
  sample, and the line simply isn't drawn. Nothing older than five days counts
  either — at this age, a fortnight ago is a different baby.

Two details worth knowing. No window is allowed to be narrower than 40 minutes:
a very regular stretch collapses the quartiles onto one value, which would
render as `5:00 – 5:00` — a point estimate wearing a range's clothes. And naps
and night sleep are pooled separately for the wake window, since an hour-long
afternoon nap and a five-hour night averaged together describe neither.

The wake window is the softest of the four by some distance; newborn sleep
varies enormously and the range is wide by construction.

## The two dashboards

**Basic** is the day-to-day view: today's totals at the top, then the range
buttons — 24h, 2d, 3d, 1w, All — and the timeline.

**All** is the odd one out, and worth explaining. The other four have a span
known in advance, so their pixels-per-hour are tuned by hand; All is a few days
now and will be a few years eventually, so it works its scale out from the data
each time (`lib/timeline-scale.ts`):

- It **anchors on the first entry**, not on the server's floor. `range=all`
  queries from a fixed date in 2000 so the query stays bounded, and drawing from
  there would be a canvas of empty decades with everything crushed against the
  right edge.
- It **fits the whole history into about 4,200px** — a dozen or so phone-widths
  — never denser than the week view, so All can't out-zoom `24h`.
- Below roughly 3.5px to the day it **stops shrinking and lets the canvas grow
  instead**. The two limits disagree past about three years of history and this
  one wins: a long scroll beats a smear you can't tap. Three years is well past
  what a newborn tracker is for, so in practice the width budget holds.
- Gridlines pick their own spacing so labels never collide, and past a day apart
  they switch from weekday names to dates — "Tue" stops meaning anything once
  there are nine of them.

The view no longer snaps back to "now" on every poll, either. The canvas widens
by a sliver every twenty seconds as time passes, and re-pinning on that would
yank you back mid-scroll — which matters most on All, where you may be two
months from the right edge looking for something to correct.

The headline used to be a rolling 24 hours, which can't answer "how is she doing
today" — at 9am a rolling window is still mostly yesterday. It is now anchored to
**local midnight**, with two comparisons:

- The **arrow** compares against *yesterday at this same time*. Comparing half a
  day to a whole one would show "behind" every morning, and a number that's
  alarming by construction is a number people stop reading.
- The line underneath is **all of yesterday** — the figure to end up near.

**Advanced** overlays today's cumulative curve on yesterday's for feeding, sleep
and dirty diapers, so you can see *where* in the day a difference opened up
rather than just its size. Yesterday is drawn complete; today stops at the
current time, because running it flat to the right edge would read as "she
stopped".

Underneath are averages over **whole days only**. Today is partial by
definition, and folding half a day into a per-day mean drags every figure down.

All of it is computed client-side from one week of events, because the day
boundaries belong to the reader's timezone, not the server's.

## Copying the data out

**Copy data** on the Basic screen opens a span picker — 24 hours, 3 days, a
week, or everything — and puts a compact text log on the clipboard. A shorter
list than the timeline's range chips, and worded as sentences rather than
chips: you pick this once, deliberately, rather than flicking between them.

```
Baby log · Jul 20, 2026 – Aug 9, 2026 · local time (America/New_York), 24h clock
TOTALS 20 days · 32 feeds · 1205 mL · avg 38 mL/feed · every 2h55
       sleep 12h28 over 9 naps (longest 2h41) · 7 diapers: 3 pee, 2 poop, 2 blowout

8/6  feeds 9 / 180 mL  20@02:00 20@05:00 20@07:40 10@11:10 20@12:37
     sleep 13:20-14:50 (1h30)
     diaper pee@07:36
```

Three decisions:

- **One line per day, 24-hour clock.** The old JSON carried an ISO timestamp
  *and* a localised string on every row, spending most of its length repeating
  the date. This is roughly a tenth of the size, which is the difference between
  a week fitting in a message and not. A 24-hour clock is unambiguous without
  am/pm and always five characters.
- **Comments are excluded.** They're jokes and reactions between family, not
  data worth analysing.
- **The header describes the data, not the query.** `range=all` starts at a
  fixed floor, so using it verbatim would head the export
  `Jan 1 2000 – Aug 9 2026 · 9718 days` — wrong, and useless for a per-day rate.

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
