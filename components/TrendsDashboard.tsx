"use client";

import { useMemo, useState } from "react";
import CritterStrip from "@/components/Critters";
import CumulativeChart from "@/components/CumulativeChart";
import Explain from "@/components/Explain";
import GrandTally from "@/components/GrandTally";
import SleepClock from "@/components/SleepClock";
import TrendChart from "@/components/TrendChart";
import WeightChart from "@/components/WeightChart";
import {
  AVERAGE_DAYS,
  addDays,
  awakeTotals,
  computeStats,
  cumulativeSeries,
  dailyTotals,
  feedRecords,
  previousWeekStats,
  projectToday,
  sleepClock,
  startOfDay,
  type DayProjection,
} from "@/lib/daily";
import { useEvents, useWeights } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { fmtDuration } from "@/lib/time";
import { useNow } from "@/lib/useNow";

/**
 * The longer view, in two halves.
 *
 * The cumulative charts answer "how is today going" by laying it over the days
 * before it. The trend charts underneath answer the slower question — "which
 * way is this heading" — from one finished day's total per point. Both are
 * derived client-side, because the day boundaries are the reader's and not the
 * server's.
 */

/** How many finished days to lay under today. One control, all three charts. */
const OVERLAYS = [
  { key: 1, label: "1 day" },
  { key: 2, label: "2 days" },
  { key: 3, label: "3 days" },
  { key: 7, label: "1 week" },
] as const;

/** How many days the sleep clock averages over. */
const CLOCK_SPANS = [
  { key: 1, label: "1d" },
  { key: 2, label: "2d" },
  { key: 3, label: "3d" },
  { key: 7, label: "1w" },
  { key: "all", label: "All" },
] as const;

type ClockSpan = (typeof CLOCK_SPANS)[number]["key"];

/** How far back the daily-totals charts reach. */
const SPANS = [
  { key: 7, label: "1 week" },
  { key: 14, label: "2 weeks" },
  { key: "all", label: "All" },
] as const;

type Span = (typeof SPANS)[number]["key"];

/**
 * Where each jump chip lands. The screen is several phones tall, and the
 * averages — the part most often wanted — are at the bottom of it.
 */
const SECTIONS = [
  { id: "trends-today", label: "Today" },
  { id: "trends-clock", label: "Clock" },
  { id: "trends-daily", label: "Daily" },
  { id: "trends-weight", label: "Weight" },
  { id: "trends-averages", label: "Averages" },
] as const;

export default function TrendsDashboard() {
  const [overlay, setOverlay] = useState<number>(1);
  const [span, setSpan] = useState<Span>(7);
  const [clockSpan, setClockSpan] = useState<ClockSpan>(7);

  // One all-time fetch feeds everything here: a week's overlay needs eight days,
  // and "All" on the trends needs the lot. SWR shares this key with the tally.
  const { data, error, isLoading } = useEvents("all");
  const { data: weights } = useWeights();
  const now = useNow(60_000);

  const view = useMemo(() => {
    if (!data) return null;
    const todayStart = startOfDay(now).getTime();
    const elapsedFraction = (now.getTime() - todayStart) / 86_400_000;

    const pair = (metric: Parameters<typeof cumulativeSeries>[2]) => ({
      today: cumulativeSeries(data, todayStart, metric),
      // Most recent first — the chart fades them by that order.
      previous: Array.from({ length: overlay }, (_, i) =>
        cumulativeSeries(data, addDays(now, -(i + 1)).getTime(), metric),
      ),
    });

    const sleepDays = dailyTotals(data, "sleep_ms", now, span);

    // Where each of today's totals is heading. Always a week's worth, whatever
    // the toggles say — see `projectToday`.
    const projFeed = projectToday(data, now, "feed_ml");
    const projSleep = projectToday(data, now, "sleep_ms");
    const projDiapers = projectToday(data, now, "diaper_count");
    const projDirty = projectToday(data, now, "poop_count");
    // Awake is the remainder of the day, so today's awake is too: the time
    // gone minus what was slept, heading for the whole day minus what's
    // expected to be slept by midnight.
    const dayMs = addDays(new Date(todayStart), 1).getTime() - todayStart;
    const projAwake = projSleep && {
      soFar: Math.max(0, now.getTime() - todayStart - projSleep.soFar),
      expected: Math.max(0, dayMs - projSleep.expected),
    };

    // Today's moments as fractions of the day, for the vertical marks.
    const marksFor = (kind: "spit_up" | "fussy") =>
      data.moments
        .filter((m) => m.kind === kind)
        .map((m) => (new Date(m.ts).getTime() - todayStart) / 86_400_000)
        .filter((f) => f >= 0 && f <= 1);

    return {
      elapsedFraction,
      spitUps: marksFor("spit_up"),
      fussies: marksFor("fussy"),
      projFeed,
      projSleep,
      projDiapers,
      projDirty,
      projAwake,
      records: feedRecords(data),
      feed: pair("feed_ml"),
      sleep: pair("sleep_ms"),
      // Every diaper, not just the dirty ones: a wet one is a change, a
      // laundry run and a nappy off the shelf just the same, and counting only
      // the poopy ones drew a chart of about half her actual days.
      diapers: pair("diaper_count"),
      trendFeed: dailyTotals(data, "feed_ml", now, span),
      trendSleep: sleepDays,
      // Derived from the very points sleep is drawn from, so the two lines can
      // never disagree about which days exist.
      trendAwake: awakeTotals(sleepDays),
      trendDiapers: dailyTotals(data, "diaper_count", now, span),
      trendDirty: dailyTotals(data, "poop_count", now, span),
      clock: sleepClock(data, now, clockSpan),
      stats: computeStats(data, now),
      previous: previousWeekStats(data, now),
    };
  }, [data, now, overlay, span, clockSpan]);

  if (error) {
    return (
      <div className="px-5 pb-4">
        <p className="rounded-[10px] bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          Couldn&apos;t load the numbers.
        </p>
      </div>
    );
  }
  if (!view || isLoading) {
    return (
      <div className="flex flex-col gap-3 px-5 pb-4">
        <div className="h-40 animate-pulse rounded-[10px] bg-sunk" />
        <div className="h-40 animate-pulse rounded-[10px] bg-sunk" />
      </div>
    );
  }

  const s = view.stats;
  const p = view.previous;
  const hrs = (ms: number | null) => (ms === null ? "—" : fmtDuration(ms));
  const num = (n: number | null, digits = 1) => (n === null ? "—" : n.toFixed(digits));
  const ml = (v: number | null) => `${num(v, 0)} mL`;
  const r = view.records;

  /**
   * Last week's figure, or nothing to compare with.
   *
   * `days` is that group's own previous window and is passed along so a short
   * one can say so: three days of nappies is a fair comparison but it isn't a
   * week, and the row shouldn't imply it was.
   */
  const was = (value: number | null, days: number) =>
    value === null || days < 1 ? null : { value, days };

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <JumpChips />

      <div id="trends-today" className="flex scroll-mt-3 flex-col gap-3">
        <Toggle
          label="Compare with"
          options={OVERLAYS}
          value={overlay}
          onChange={(v) => setOverlay(v as number)}
        />

        <CumulativeChart
          title="Feeding"
          color="var(--c-feed)"
          today={view.feed.today}
          previous={view.feed.previous}
          elapsedFraction={view.elapsedFraction}
          format={(v) => `${Math.round(v)}`}
          formatExact={ml}
          marks={view.spitUps}
          markLabel="spit up"
          projection={view.projFeed}
        />
        <CumulativeChart
          title="Sleep"
          color="var(--c-sleep)"
          today={view.sleep.today}
          previous={view.sleep.previous}
          elapsedFraction={view.elapsedFraction}
          format={(v) => `${Math.round(v / 3_600_000)}h`}
          formatExact={fmtDuration}
          marks={view.fussies}
          markLabel="fussy"
          projection={view.projSleep}
        />
        <CumulativeChart
          title="Diapers"
          color="var(--c-diaper)"
          today={view.diapers.today}
          previous={view.diapers.previous}
          elapsedFraction={view.elapsedFraction}
          format={(v) => `${Math.round(v)}`}
          projection={view.projDiapers}
        />
      </div>

      <div id="trends-clock" className="mt-1 flex scroll-mt-3 flex-col gap-3">
        <Toggle
          label="When she sleeps · average of"
          options={CLOCK_SPANS}
          value={clockSpan}
          onChange={(v) => setClockSpan(v as ClockSpan)}
        />
        <SleepClock clock={view.clock} now={now} />
      </div>

      <div id="trends-daily" className="mt-1 flex scroll-mt-3 flex-col gap-3">
        <Toggle
          label="Day by day"
          options={SPANS}
          value={span}
          onChange={(v) => setSpan(v as Span)}
        />

        <TrendChart
          title="Milk a day"
          color="var(--c-feed)"
          points={view.trendFeed}
          today={mark(view.projFeed)}
          format={(v) => `${Math.round(v)}`}
          formatExact={ml}
          describeSlope={(perDay) => rate(perDay, `${Math.abs(Math.round(perDay))} mL`)}
        />
        <TrendChart
          title="Asleep and awake a day"
          color="var(--c-sleep)"
          points={view.trendSleep}
          companion={{
            points: view.trendAwake,
            color: "var(--c-awake)",
            label: "awake",
            today: view.projAwake,
          }}
          seriesLabel="asleep"
          today={mark(view.projSleep)}
          format={(v) => `${Math.round(v / 3_600_000)}h`}
          formatExact={fmtDuration}
          describeSlope={(perDay) => rate(perDay, fmtDuration(Math.abs(perDay)))}
        />
        <TrendChart
          title="Diapers a day"
          color="var(--c-diaper)"
          points={view.trendDiapers}
          companion={{
            points: view.trendDirty,
            color: "var(--c-dirty)",
            label: "dirty",
            today: mark(view.projDirty),
          }}
          seriesLabel="diapers"
          today={mark(view.projDiapers)}
          format={(v) => `${Math.round(v)}`}
          describeSlope={(perDay) => rate(perDay, Math.abs(perDay).toFixed(1))}
        />

        <Explain className="-mt-1">
          One point per finished day. Today is left out — it&apos;s partial by
          definition, and a trend drawn through it would report a dip every
          morning. Each chart starts the day its own log started, which is why
          they can cover different stretches: days from before anyone was
          writing sleep down aren&apos;t quiet days, they&apos;re days with no
          data. The dashed line is a least-squares fit across the whole window,
          so one unusual day nudges it rather than defining it. A direction is
          only named once the whole fitted move is bigger than the day-to-day
          scatter; below that it says steady, because it is. The column marked
          today is a phantom, never a point: the filled dot is where she is so
          far, and the dotted line runs to where the day is expected to land —
          today so far plus what the past week usually added from this hour to
          midnight. The fit never sees it.
        </Explain>

        {/* Weight belongs with the long-arc charts rather than the daily ones,
            but it keeps its own window: weigh-ins are their own series and have
            nothing to do with how many days of totals you asked for. */}
        {weights && (
          <div id="trends-weight" className="scroll-mt-3">
            <WeightChart weights={weights} now={now} />
          </div>
        )}
      </div>

      <div id="trends-averages" className="panel scroll-mt-3 rounded-[10px] p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Averages · past week
        </div>

        {s.days === 0 ? (
          <p className="py-3 text-center text-sm text-muted">
            Averages need at least one complete day. Check back tomorrow.
          </p>
        ) : (
          // One column, grouped. Two columns squeezed labels like "Between
          // feeds" onto two lines, which reads as a wrapping bug rather than a
          // layout choice.
          <div className="flex flex-col gap-3">
            <Group color="var(--c-feed)" title="Feeding" days={s.feedDays}>
              <Row
                label="Milk a day"
                value={s.mlPerDay}
                was={was(p.mlPerDay, p.feedDays)}
                format={ml}
              />
              <Row
                label="Feeds a day"
                value={s.feedsPerDay}
                was={was(p.feedsPerDay, p.feedDays)}
                format={num}
              />
              <Row
                label="Average feed"
                value={s.avgFeedMl}
                was={was(p.avgFeedMl, p.feedDays)}
                format={ml}
              />
              <Row
                label="Typical gap between feeds"
                value={s.avgBetweenFeedsMs}
                was={was(p.avgBetweenFeedsMs, p.feedDays)}
                format={hrs}
              />
              <Row
                label="Night feeds (10pm–6am)"
                value={s.nightFeedsPerNight}
                was={was(p.nightFeedsPerNight, p.feedDays)}
                format={num}
              />
            </Group>
            {/* All-time rather than past-week, and labelled so: a record is
                the one figure here that is meant to outlive the baby she was
                when she set it. */}
            {(r.biggestDay || r.biggestFeed) && (
              <Group color="var(--c-feed)" title="Feeding records" note="all time">
                {r.biggestDay && (
                  <Record
                    label="Most milk in one day"
                    value={ml(r.biggestDay.ml)}
                    when={
                      r.biggestDay.dayStart === startOfDay(now).getTime()
                        ? "today, and counting"
                        : shortDate(r.biggestDay.dayStart)
                    }
                  />
                )}
                {r.biggestFeed && (
                  <Record
                    label="Biggest single feed"
                    value={ml(r.biggestFeed.ml)}
                    when={
                      r.biggestFeed.at >= startOfDay(now).getTime()
                        ? `today, ${shortTime(r.biggestFeed.at)}`
                        : `${shortDate(r.biggestFeed.at)}, ${shortTime(r.biggestFeed.at)}`
                    }
                  />
                )}
              </Group>
            )}
            <Group color="var(--c-sleep)" title="Sleep" days={s.sleepDays}>
              <Row
                label="Asleep a day"
                value={s.sleepPerDayMs}
                was={was(p.sleepPerDayMs, p.sleepDays)}
                format={hrs}
              />
              <Row
                label="Awake a day"
                value={s.awakePerDayMs}
                was={was(p.awakePerDayMs, p.sleepDays)}
                format={hrs}
              />
              <Row
                label="Naps a day"
                value={s.napsPerDay}
                was={was(p.napsPerDay, p.sleepDays)}
                format={num}
              />
              <Row
                label="Average nap"
                value={s.avgNapMs}
                was={was(p.avgNapMs, p.sleepDays)}
                format={hrs}
              />
              <Row
                label="Average awake stretch"
                value={s.avgAwakeStretchMs}
                was={was(p.avgAwakeStretchMs, p.sleepDays)}
                format={hrs}
              />
              <Row
                label="Longest sleep"
                value={s.longestSleepMs}
                was={was(p.longestSleepMs, p.sleepDays)}
                format={hrs}
              />
            </Group>
            <Group color="var(--c-diaper)" title="Diapers" days={s.diaperDays}>
              <Row
                label="Diapers a day"
                value={s.diapersPerDay}
                was={was(p.diapersPerDay, p.diaperDays)}
                format={num}
              />
              <Row
                label="Dirty ones a day"
                value={s.poopsPerDay}
                was={was(p.poopsPerDay, p.diaperDays)}
                format={num}
              />
            </Group>
          </div>
        )}

        <Explain className="mt-3 border-t border-line pt-2">
          The past week, whole days only — today is still in progress, and
          folding half a day into an average drags every figure down. A lifetime
          average would be the wrong number for a baby who is growing: it keeps
          reporting a figure she has already outgrown. Underneath each figure is
          the week before it, with a day count when that week is a short one.
          The arrows point, they don&apos;t judge: more time awake, or a longer
          gap between feeds, is neither good news nor bad. Each group stops at
          the day its own log started, which is why the day counts can differ
          and why some rows have nothing to compare with yet. The records are
          the exception: they cover every day she has, today included — a day
          in progress can only fall short of its total, so if it has already
          passed the old best, the record is real.
        </Explain>
      </div>

      {data && <GrandTally data={data} now={now} />}

      <CritterStrip />
    </div>
  );
}

/**
 * One row of chips that scroll the screen to a section. Plain buttons rather
 * than anchors, so the URL doesn't pick up a fragment and the browser's back
 * button keeps meaning "back", not "up the page".
 */
function JumpChips() {
  return (
    <nav aria-label="Jump to" className="flex gap-1.5">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => {
            tick();
            document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="press flex h-7 flex-1 items-center justify-center whitespace-nowrap rounded-full border-2 border-line bg-card px-1 text-muted"
        >
          {/* Sized on the span: globals.css gives buttons an unlayered
              `font: inherit`, which beats a text size on the button itself. */}
          <span className="text-[11px] font-medium">{s.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Just the two figures a today-column needs, or nothing. */
function mark(p: DayProjection | null) {
  return p && { soFar: p.soFar, expected: p.expected };
}

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString([], { month: "short", day: "numeric" });
const shortTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * "up 12 mL a day". Only ever called for a trend that has already earned the
 * claim — see `significant` in lib/daily.ts.
 */
function rate(perDay: number, amount: string): string {
  return `${perDay > 0 ? "up" : "down"} ${amount} a day`;
}

function Toggle<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  // Grouped and named: there are now two toggles on the page that both offer
  // "All", and without this a screen reader announces two identical buttons.
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <div className="flex gap-1.5">
        {options.map((o) => {
          const selected = o.key === value;
          return (
            <button
              key={String(o.key)}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                if (!selected) tick();
                onChange(o.key);
              }}
              className="press flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[8px] border-2"
              style={{
                background: selected ? "var(--c-ink)" : "var(--c-card)",
                color: selected ? "var(--c-paper)" : "var(--c-muted)",
                borderColor: selected ? "var(--c-ink)" : "var(--c-line)",
              }}
            >
              {/* Sized on the span: globals.css gives buttons an unlayered
                  `font: inherit`, which beats a text size on the button. */}
              <span className="text-[12px] font-medium">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Each group carries its own day count, because each is divided by a different
 * one — the three logs began weeks apart. Printing them per group is the honest
 * version: a single figure at the top of the panel would be right for one group
 * and quietly wrong for the other two.
 */
function Group({
  title,
  color,
  days,
  note,
  children,
}: {
  title: string;
  color: string;
  days?: number;
  /** In place of the day count, for a group that isn't a window of days. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-baseline justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.12em]"
        style={{ color }}
      >
        <span>{title}</span>
        <span className="whitespace-nowrap normal-case tracking-normal text-muted">
          {note ?? (days === 0 ? "not logged yet" : `${days} day${days === 1 ? "" : "s"}`)}
        </span>
      </div>
      {children}
    </div>
  );
}

/** A record and when it was set, laid out like a Row so the column lines up. */
function Record({ label, value, when }: { label: string; value: string; when: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="text-muted">{label}</span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="whitespace-nowrap font-medium tabular-nums">{value}</span>
        <span className="-mt-0.5 whitespace-nowrap text-[11px] leading-tight text-muted tabular-nums">
          {when}
        </span>
      </span>
    </div>
  );
}

/** An arrow, and the word behind it for anyone not looking at the screen. */
const MOVES = {
  up: { glyph: "↑", said: "up" },
  down: { glyph: "↓", said: "down" },
  level: { glyph: "↔", said: "unchanged" },
} as const;

/**
 * One figure, with last week's beneath it when there is one.
 *
 * The direction is decided on the printed strings rather than the raw numbers.
 * 720.4 and 720.1 mL both print as 720, and an arrow claiming a rise over two
 * identical figures reads as a bug — which, from the reader's side of the
 * screen, it is.
 *
 * Nothing here is coloured. Up is not good news and down is not bad news for
 * most of these rows: more time awake, a longer gap between feeds, fewer
 * nappies. Green and red would be the app editorialising about a baby doing
 * entirely ordinary things.
 */
function Row({
  label,
  value,
  was,
  format,
}: {
  label: string;
  value: number | null;
  was?: { value: number; days: number } | null;
  format: (v: number | null) => string;
}) {
  const text = format(value);
  // Both figures or neither: a missing one is nothing to compare with, not a
  // fall to zero.
  const against =
    value !== null && was
      ? { text: format(was.value), days: was.days, up: value > was.value }
      : null;
  const move =
    against === null ? null : against.text === text ? "level" : against.up ? "up" : "down";

  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="text-muted">{label}</span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="whitespace-nowrap font-medium tabular-nums">{text}</span>
        {against && move && (
          // Pulled up a little so it sits closer to the figure it belongs to
          // than to the row beneath it, which is the only thing keeping the
          // pairing readable down a long list.
          <span className="-mt-0.5 whitespace-nowrap text-[11px] leading-tight text-muted tabular-nums">
            <span aria-hidden="true">{MOVES[move].glyph}</span>
            <span className="sr-only">{MOVES[move].said}</span> from {against.text}
            {/* A short window is still a fair comparison, but it isn't a week
                and shouldn't pretend to be. */}
            {against.days < AVERAGE_DAYS && ` · ${against.days}d`}
          </span>
        )}
      </span>
    </div>
  );
}
