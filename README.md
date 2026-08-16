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

No joins (`lib/schema.ts`):

```
feedings         id, amount_ml, ts, created_at
sleep_sessions   id, sleep_start, sleep_end (nullable), created_at
diapers          id, type, ts, created_at
comments         id, ts, text, reactions (jsonb), created_at
moments          id, kind, ts, created_at
weights          id, weight_g, ts, created_at
snapshots        id, taken_at, reason, counts (jsonb), payload (jsonb)
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

**Weights are the one thing that isn't an event.** Every other table answers
"what happened, and when"; a weight answers "what is she", and the answer
doesn't stop being true when it falls out of the window you're looking at. So
`weights` is deliberately *not* part of `EventsPayload` — range-filtering it
would blank the figure out on a 24h view any time she was last weighed on
Tuesday. It gets `GET /api/weights`, which always returns the lot, and can
afford to because there are only ever a handful.

## Screens

**Log** — status in three lines, then three large tiles.

- **Feed** opens a 270° drag dial (0–100 mL, snaps to 5, with `−5`/`+5` for
  precision). It defaults to the last feed's amount, since the next one usually
  matches. The gap at the bottom of the gauge is deliberate: you can't drag past
  100 and wrap around to 0.
- **Sleep** starts a session; once running, the tile becomes a live timer and
  the same tile ends it with **Baby's Awake**.
- **Diaper** is four big buttons, then confirm.

Below the three tiles is a **Weight** row — a full-width button rather than a
fourth tile. Weighing happens every week or two, not every two hours, and a
fourth tile would take a quarter of the screen away from the three things
actually done at 3am. It carries the last recorded weight so you can read it
without opening anything.

Every timestamp defaults to now and is adjustable by tapping it — a horizontal
scroll-snap wheel with 5-minute detents, plus `−1h / −30m / −5m / +5m / reset`
chips. No date pickers anywhere.

**Basic** — three time-aligned tracks sharing one horizontal axis: feeding bars
scaled by volume, sleep blocks scaled by duration, diaper icons. Ranges are
24h / 2d / 3d / 1w / All; it opens scrolled to now. Tapping any mark opens edit
and delete (delete is two-step). **Comment** mode turns the timeline into a
target — tap a moment, write a note, and it lands at that timestamp with emoji
reactions.

**Copy data** puts a compact text log for the chosen span on the clipboard —
see [Copying the data out](#copying-the-data-out).

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

**Advanced** is two questions stacked.

*How is today going* — today's cumulative curve laid over the days before it,
for feeding, sleep and dirty diapers, so you can see **where** in the day a
difference opened up rather than just its size. One **Compare with** toggle at
the top drives all three charts: yesterday, two days, three days, or the past
week. Older days fade, so the stack reads as recency rather than as a set of
equal peers, and they share one legend key — seven keys would take more room
than the chart. Past days are drawn complete; today stops at the current time,
because running it flat to the right edge would read as "she stopped".

*When does she sleep* — **When she sleeps**, every finished day folded onto one
midnight-to-midnight axis, asking of each fifteen minutes: on what share of
those days was she asleep then? Averaged over one day, two, three, a week or
everything. It's the only chart drawn wider than the screen and scrolled
sideways — a whole day squeezed into 320px gives each slot about three pixels,
too fine to read — and it opens with **now** on screen, a third from the left.
The percentage axis is pinned outside the scroller so the scale stays readable
however far along you've scrolled.

The grid reads at two weights: a solid labelled rule every two hours, and a
lighter dashed one on the hours between, so you can place a band without
counting pixels. Both sit *behind* the bars — a rule drawn over a band looks
like a gap in it.

A dark red line marks the current time, labelled rather than left to colour
alone, and the panel says how often she was asleep at this hour across the days
on screen. That figure is a base rate and says so: it answers "is this usually
a sleeping time", not "is she asleep". Whether she's actually down right now is
a fact, and the Log screen answers it from one.

Underneath it names the longest stretch above half. That scan is **circular**:
the answer is nearly always a night, and a scan that stopped at the end of the
array would report 22:00–05:00 as two short runs and pick the wrong one as the
longest.

*Which way is this heading* — **Day by day**, one finished day's total per
point over a week, a fortnight or everything, with a least-squares line fitted
through it. Today is left out, the same rule the averages follow: it's partial
by definition, and a trend drawn through it would report a dip every morning.

The sleep chart carries **both halves of the day** — asleep in pine, awake in
ochre. Awake isn't measured, because nothing logs it: it's the day minus what
was slept, taking day length from the calendar so the weekend the clocks change
doesn't invent an hour. That makes the two lines mirror images that cross at the
half-day mark, which is the point — it shows at a glance which side of half she
is on, and when that flipped. Only asleep gets a fitted line: the other one's
slope is the same number negated, and two mirrored dashes say one thing twice.
The footer names which line it means for the same reason.

The direction is only stated once it has earned it. A fitted line always has
*some* slope, so without a test every chart announces a trend and an ordinary
run of days reads as a decline. The rule is that the whole fitted move has to be
at least as big as the standard deviation of the days it was drawn through —
which scales with the metric, so there's no per-chart threshold to tune, and a
noisy count is held to a higher bar than a steady one. Below that it says
"holding steady", because that's what it is. In practice this is the difference
between the diaper chart claiming "down 0.1 a day" from pure scatter and
saying nothing at all.

Underneath are averages over **whole days only**. Today is partial by
definition, and folding half a day into a per-day mean drags every figure down.

Weight appears on both, differently. **Basic** gets two numbers and the gap
between them — what she is now, what she was before, and the change — because
that's the whole of what you want at a glance. **Advanced** gets the line.

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

## Weight

**Stored in grams, entered and shown in pounds and ounces.** Grams because it's
what a paediatrician writes down and because it stores as an integer, so nothing
floating-point ever reaches the database; pounds and ounces because that's what
this family says out loud.

That conversion is the one place a silent bug could live — enter 8 lb 4 oz, get
8 lb 3 oz back a fortnight later, and nobody would notice for months. So
`tests/weight.test.ts` walks **every ounce from zero to forty pounds** and
checks each one survives the round trip, rather than trusting that the
arithmetic happens to work out. Comparisons between weigh-ins are taken in
ounces too, not by differencing the stored grams: both readings were rounded on
the way in, and differencing them can land half an ounce out and report a change
that never happened.

**One wheel, in ounce detents.** The same gesture as the time field, because a
weigh-in moves by a few ounces and the useful action is a nudge — two separate
pounds-and-ounces controls would just mean choosing which one to nudge first.
Its range is absolute, nought to forty pounds, rather than a window around the
current value: a window would be shorter to scroll but could put a premature
3 lb, or a toddler, out of reach entirely.

The chips step from the wheel's own position rather than from React state.
A smooth scroll fires a burst of scroll events on its way to the target, and
letting those set the value would walk it through every position in between — so
a second tap mid-animation started from wherever the animation happened to be.
Tapping "+1 oz" twice quickly gave you one ounce. Caught by a browser test, not
by reading the code.

Weigh-ins aren't on the timeline — they'd be a track that's empty six days in
seven — so the Basic card is tappable and opens the list, where any one of them
can be corrected or deleted.

## Knowing which build you're on

One URL, shared around a family, on phones that keep tabs alive for days. So
"am I looking at the current version?" is a real question, and the running code
can't answer it alone — a tab opened last Tuesday will happily keep serving
last Tuesday's bundle.

A thin line above the tabs says which build it is (`Updated Aug 11, 2:47 am ·
0d081c4`), and when the server has moved on it becomes a tappable
**New version ready — tap to refresh**.

The two halves have to come from different places, and that's the whole design:

- `next.config.ts` stamps the commit and build time into the bundle at **compile
  time**, via the `env` key so the compiler substitutes them into the server and
  client output alike. Reading them at request time would defeat the point —
  the value has to be frozen to the bundle it shipped in.
- `GET /api/version` reports whatever the **currently deployed** server is. On
  Vercel the alias points at the newest deployment, so an old tab asking this
  question gets the new answer.

Two deliberate refusals:

- **It never reloads on its own.** Someone could be halfway through logging a
  feed at 4am, and having the page vanish under them would be a worse bug than
  the stale bundle ever was.
- **A failed check says nothing.** No answer means the network blipped, not that
  there's an update, and a banner that flickers on every wobble is one people
  learn to ignore. Local builds are all stamped `dev`, so they never nag either.

The check runs every five minutes and on refocus — a deploy isn't urgent news,
but coming back to a tab is exactly when you want to know. It's deliberately
excluded from the post-write refresh, or it would fire on every feed, nappy and
nap logged.

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

Woodland critters in soft green and pink, drawn like an 8-bit game — the
Stardew Valley *style*, not its theme. It shows up in four places:

**The symbols** (`lib/sprites.ts`, `components/icons.tsx`). Every icon is a
hand-placed 16×16 pixel sprite of the *thing itself*: a bottle for feeding, a
crescent moon for sleep (Zs drift off it while she's asleep), an actual diaper
for diapers, a scale for weight, an arc of milk for spit-ups, a little storm
cloud for fussy spells, droplet/poop/burst for the diaper types. Items rather
than faces — a bottle says "feed" the way no animal can. Sprites are stored as
string grids — pixel art lives or dies by individual pixels, and a string grid
is the only representation you can proofread — and rendered as SVG rects
(`components/PixelIcon.tsx`), so they scale crisply to any size with no binary
assets in the repo. `tests/sprites.test.ts` checks every grid is exactly
16×16, ASCII only, and names no colour its palette doesn't define — a Cyrillic
**о** posing as a Latin **o** renders as a magenta missing-colour pixel, and
that class of bug is invisible in source (it caught exactly this, twice).

**The critters** (`components/Critters.tsx`). The woodland lives on the forest
floor, not on the buttons: a grass strip at the bottom of the Log screen and
below the Grand Tally where a fox trots one way, a rabbit hops the other, a
hedgehog trundles along behind, a butterfly wanders overhead, and an owl sits
at the edge and blinks. All of it is CSS keyframes — two sprite frames
hard-swapped with `steps(1)`, the way an 8-bit game animates, drifting across
the strip with negative delays so everyone is mid-stroll when the screen
opens. Nothing re-renders, nothing ticks, and `prefers-reduced-motion` parks
everyone where they stand. The critters keep natural fur colours on purpose:
tinted to the palette they'd stop reading as critters.

**The palette** (`app/globals.css`, one token block). The two modes are tuned
independently rather than one being an inversion of the other, because they're
used at different times of day for different reasons. Light is the one that
gets looked at: a pale, clean green — closer to new leaves than to sage — with
pink carrying the accents. Dark is a proper night forest, deeper and richer,
where the accents have to glow a little to stay legible at 3am with the lights
off. Four accents, two per family so no two ever blur together: feed rose pink,
sleep the cooler soft pine, diaper the warmer fresh leaf, weight the deeper
dusty mauve.

Every foreground/background pair that actually occurs in the UI is checked
against a real WCAG contrast ratio rather than by eye — the harness renders
both palettes as swatches with computed ratios and fails loudly on anything
under target. It has caught two values that looked perfectly fine: `--c-muted`
at 3:1 against the paper (secondary text wants 4.5), and the dark mode outline
at 2.6:1.

**The chrome.** Chunky 2px outlines, hard offset shadows with no blur (a
blurred shadow is the one thing pixel art can never have), and tight radii.
Pressing something translates it into its own shadow, the way an 8-bit button
goes down a pixel.

**The type.** Labels, headers and tabs are set in Silkscreen (bundled via
`@fontsource`, no runtime fetch), hung off the one class every micro-label
already shares. Numbers and body text stay system sans — pixel type at reading
sizes is a novelty that wears off by the second 3am feed.

The app icon is the fox on deep pine, generated from the same sprite data —
`app/icon.svg` and `app/apple-icon.tsx` both draw from `lib/sprites.ts`.

## Notes

- Installable to the iPhone home screen — `display: standalone`, safe-area
  padding, generated apple-touch-icon.
- Dark mode follows the phone's setting, which matters at 3am.
- `maximum-scale=1` stops iOS double-tap zoom during fast repeated taps.
- Haptics fire on dial and wheel detents where the browser supports it; the
  visuals never depend on it.
