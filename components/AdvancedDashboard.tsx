"use client";

import { useMemo } from "react";
import CumulativeChart from "@/components/CumulativeChart";
import { addDays, computeStats, cumulativeSeries, startOfDay } from "@/lib/daily";
import { useEvents } from "@/lib/api";
import { fmtDuration } from "@/lib/time";
import { useNow } from "@/lib/useNow";

/**
 * The longer view: where today's curve sits against yesterday's, and the
 * averages underneath. Everything here is derived client-side from one week of
 * events, because the day boundaries are the reader's, not the server's.
 */
export default function AdvancedDashboard() {
  const { data, error, isLoading } = useEvents("1w");
  const now = useNow(60_000);

  const view = useMemo(() => {
    if (!data) return null;
    const todayStart = startOfDay(now).getTime();
    const yesterdayStart = addDays(now, -1).getTime();
    const elapsedFraction = (now.getTime() - todayStart) / 86_400_000;

    const pair = (metric: Parameters<typeof cumulativeSeries>[2]) => ({
      today: cumulativeSeries(data, todayStart, metric),
      yesterday: cumulativeSeries(data, yesterdayStart, metric),
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
      stats: computeStats(data, now),
    };
  }, [data, now]);

  if (error) {
    return (
      <div className="px-5 pb-4">
        <p className="rounded-2xl bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          Couldn&apos;t load the numbers.
        </p>
      </div>
    );
  }
  if (!view || isLoading) {
    return (
      <div className="flex flex-col gap-3 px-5 pb-4">
        <div className="h-40 animate-pulse rounded-[20px] bg-sunk" />
        <div className="h-40 animate-pulse rounded-[20px] bg-sunk" />
      </div>
    );
  }

  const s = view.stats;
  const hrs = (ms: number | null) => (ms === null ? "—" : fmtDuration(ms));
  const num = (n: number | null, digits = 1) => (n === null ? "—" : n.toFixed(digits));

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <CumulativeChart
        title="Feeding · cumulative"
        color="var(--c-feed)"
        today={view.feed.today}
        yesterday={view.feed.yesterday}
        elapsedFraction={view.elapsedFraction}
        format={(v) => `${Math.round(v)}`}
        marks={view.spitUps}
        markLabel="spit up"
      />
      <CumulativeChart
        title="Sleep · cumulative"
        color="var(--c-sleep)"
        today={view.sleep.today}
        yesterday={view.sleep.yesterday}
        elapsedFraction={view.elapsedFraction}
        format={(v) => `${Math.round(v / 3_600_000)}h`}
        marks={view.fussies}
        markLabel="fussy"
      />
      <CumulativeChart
        title="Dirty diapers · cumulative"
        color="var(--c-diaper)"
        today={view.poop.today}
        yesterday={view.poop.yesterday}
        elapsedFraction={view.elapsedFraction}
        format={(v) => `${Math.round(v)}`}
      />

      <div className="panel rounded-[20px] p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Averages
          {s.days > 0 && (
            <span className="ml-1 normal-case tracking-normal">
              · {s.days} full day{s.days === 1 ? "" : "s"}
            </span>
          )}
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
            <Group color="var(--c-feed)" title="Feeding">
              <Row label="Milk a day" value={`${num(s.mlPerDay, 0)} mL`} />
              <Row label="Feeds a day" value={num(s.feedsPerDay)} />
              <Row label="Average feed" value={`${num(s.avgFeedMl, 0)} mL`} />
              <Row label="Typical gap between feeds" value={hrs(s.avgBetweenFeedsMs)} />
              <Row label="Night feeds (10pm–6am)" value={num(s.nightFeedsPerNight)} />
            </Group>
            <Group color="var(--c-sleep)" title="Sleep">
              <Row label="Asleep a day" value={hrs(s.sleepPerDayMs)} />
              <Row label="Awake a day" value={hrs(s.awakePerDayMs)} />
              <Row label="Naps a day" value={num(s.napsPerDay)} />
              <Row label="Average nap" value={hrs(s.avgNapMs)} />
              <Row label="Average awake stretch" value={hrs(s.avgAwakeStretchMs)} />
              <Row label="Longest sleep" value={hrs(s.longestSleepMs)} />
            </Group>
            <Group color="var(--c-diaper)" title="Diapers">
              <Row label="Diapers a day" value={num(s.diapersPerDay)} />
              <Row label="Dirty ones a day" value={num(s.poopsPerDay)} />
            </Group>
          </div>
        )}

        <p className="mt-3 border-t border-line pt-2 text-[11px] leading-snug text-muted">
          Whole days only — today is still in progress, and folding half a day
          into an average drags every figure down.
        </p>
      </div>
    </div>
  );
}

function Group({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color }}>
        {title}
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
