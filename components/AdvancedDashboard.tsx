"use client";

import { useMemo, useState } from "react";
import CritterStrip from "@/components/Critters";
import CumulativeChart from "@/components/CumulativeChart";
import GrandTally from "@/components/GrandTally";
import SleepClock from "@/components/SleepClock";
import TrendChart from "@/components/TrendChart";
import WeightChart from "@/components/WeightChart";
import {
  addDays,
  computeStats,
  cumulativeSeries,
  dailyTotals,
  sleepClock,
  startOfDay,
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

export default function AdvancedDashboard() {
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
      feed: pair("feed_ml"),
      sleep: pair("sleep_ms"),
      poop: pair("poop_count"),
      trendFeed: dailyTotals(data, "feed_ml", now, span),
      trendSleep: dailyTotals(data, "sleep_ms", now, span),
      trendPoop: dailyTotals(data, "poop_count", now, span),
      clock: sleepClock(data, now, clockSpan),
      stats: computeStats(data, now),
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
  const hrs = (ms: number | null) => (ms === null ? "—" : fmtDuration(ms));
  const num = (n: number | null, digits = 1) => (n === null ? "—" : n.toFixed(digits));

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
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
        marks={view.spitUps}
        markLabel="spit up"
      />
      <CumulativeChart
        title="Sleep"
        color="var(--c-sleep)"
        today={view.sleep.today}
        previous={view.sleep.previous}
        elapsedFraction={view.elapsedFraction}
        format={(v) => `${Math.round(v / 3_600_000)}h`}
        marks={view.fussies}
        markLabel="fussy"
      />
      <CumulativeChart
        title="Dirty diapers"
        color="var(--c-diaper)"
        today={view.poop.today}
        previous={view.poop.previous}
        elapsedFraction={view.elapsedFraction}
        format={(v) => `${Math.round(v)}`}
      />

      <div className="mt-1 flex flex-col gap-3">
        <Toggle
          label="When she sleeps · average of"
          options={CLOCK_SPANS}
          value={clockSpan}
          onChange={(v) => setClockSpan(v as ClockSpan)}
        />
        <SleepClock clock={view.clock} />
      </div>

      <div className="mt-1 flex flex-col gap-3">
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
          format={(v) => `${Math.round(v)}`}
          describeSlope={(perDay) => rate(perDay, `${Math.abs(Math.round(perDay))} mL`)}
        />
        <TrendChart
          title="Sleep a day"
          color="var(--c-sleep)"
          points={view.trendSleep}
          format={(v) => `${Math.round(v / 3_600_000)}h`}
          describeSlope={(perDay) => rate(perDay, fmtDuration(Math.abs(perDay)))}
        />
        <TrendChart
          title="Dirty diapers a day"
          color="var(--c-diaper)"
          points={view.trendPoop}
          format={(v) => `${Math.round(v)}`}
          describeSlope={(perDay) => rate(perDay, Math.abs(perDay).toFixed(1))}
        />

        <p className="-mt-1 text-[11px] leading-snug text-muted">
          One point per finished day. Today is left out — it&apos;s partial by
          definition, and a trend drawn through it would report a dip every
          morning. Each chart starts the day its own log started, which is why
          they can cover different stretches: days from before anyone was
          writing sleep down aren&apos;t quiet days, they&apos;re days with no
          data. The dashed line is a least-squares fit across the whole window,
          so one unusual day nudges it rather than defining it. A direction is
          only named once the whole fitted move is bigger than the day-to-day
          scatter; below that it says steady, because it is.
        </p>

        {/* Weight belongs with the long-arc charts rather than the daily ones,
            but it keeps its own window: weigh-ins are their own series and have
            nothing to do with how many days of totals you asked for. */}
        {weights && <WeightChart weights={weights} />}
      </div>

      <div className="panel rounded-[10px] p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Averages
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
              <Row label="Milk a day" value={`${num(s.mlPerDay, 0)} mL`} />
              <Row label="Feeds a day" value={num(s.feedsPerDay)} />
              <Row label="Average feed" value={`${num(s.avgFeedMl, 0)} mL`} />
              <Row label="Typical gap between feeds" value={hrs(s.avgBetweenFeedsMs)} />
              <Row label="Night feeds (10pm–6am)" value={num(s.nightFeedsPerNight)} />
            </Group>
            <Group color="var(--c-sleep)" title="Sleep" days={s.sleepDays}>
              <Row label="Asleep a day" value={hrs(s.sleepPerDayMs)} />
              <Row label="Awake a day" value={hrs(s.awakePerDayMs)} />
              <Row label="Naps a day" value={num(s.napsPerDay)} />
              <Row label="Average nap" value={hrs(s.avgNapMs)} />
              <Row label="Average awake stretch" value={hrs(s.avgAwakeStretchMs)} />
              <Row label="Longest sleep" value={hrs(s.longestSleepMs)} />
            </Group>
            <Group color="var(--c-diaper)" title="Diapers" days={s.diaperDays}>
              <Row label="Diapers a day" value={num(s.diapersPerDay)} />
              <Row label="Dirty ones a day" value={num(s.poopsPerDay)} />
            </Group>
          </div>
        )}

        <p className="mt-3 border-t border-line pt-2 text-[11px] leading-snug text-muted">
          Whole days only — today is still in progress, and folding half a day
          into an average drags every figure down. Each group counts from the day
          its own log started, which is why the day counts differ.
        </p>
      </div>

      {data && <GrandTally data={data} now={now} />}

      <CritterStrip />
    </div>
  );
}

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
              className="press h-9 flex-1 whitespace-nowrap rounded-[8px] border-2 text-[12px] font-medium"
              style={{
                background: selected ? "var(--c-ink)" : "var(--c-card)",
                color: selected ? "var(--c-paper)" : "var(--c-muted)",
                borderColor: selected ? "var(--c-ink)" : "var(--c-line)",
              }}
            >
              {o.label}
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
  children,
}: {
  title: string;
  color: string;
  days: number;
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
          {days === 0 ? "not logged yet" : `${days} day${days === 1 ? "" : "s"}`}
        </span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[14px]">
      <span className="text-muted">{label}</span>
      <span className="whitespace-nowrap font-medium tabular-nums">{value}</span>
    </div>
  );
}
