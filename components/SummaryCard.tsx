"use client";

import { summarise } from "@/lib/summary";
import { fmtDuration } from "@/lib/time";
import { DIAPER_EMOJI, DIAPER_TYPES, type EventsPayload } from "@/lib/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Three headline numbers, then the detail in small print. Everything that
 * would wrap awkwardly in a narrow column lives on the detail lines instead.
 */
export default function SummaryCard({ data }: { data: EventsPayload }) {
  const s = summarise(data);

  const feedingDetail = [
    plural(s.feedingCount, "feed"),
    s.avgFeedingMl === null ? null : `${Math.round(s.avgFeedingMl)} mL avg`,
    s.avgBetweenFeedingsMs === null ? null : `every ${fmtDuration(s.avgBetweenFeedingsMs)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const sleepDetail = s.sleepCount
    ? `${plural(s.sleepCount, "nap")} · longest ${fmtDuration(s.longestSleepMs)}`
    : null;

  const diaperDetail = s.diaperCount
    ? DIAPER_TYPES.filter((t) => s.diaperBreakdown[t] > 0)
        .map((t) => `${DIAPER_EMOJI[t]} ${s.diaperBreakdown[t]}`)
        .join("   ")
    : null;

  const details = [feedingDetail, sleepDetail, diaperDetail].filter(Boolean) as string[];

  return (
    <div className="panel rounded-[20px] p-4">
      {/* Content-sized rather than an even grid: "37h 45m" needs far more room
          than "24", and equal columns make the long one collide with its neighbour. */}
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-3">
        <Stat label="Feeding" value={`${s.totalFeedingMl}`} unit="mL" color="var(--c-feed)" />
        <Stat label="Sleep" value={fmtDuration(s.totalSleepMs)} color="var(--c-sleep)" />
        <Stat label="Diapers" value={`${s.diaperCount}`} color="var(--c-diaper)" />
      </div>

      {details.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          {details.map((line) => (
            <p key={line} className="text-[12.5px] font-medium leading-snug text-muted">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color }}>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-0.5 whitespace-nowrap">
        <span className="text-[22px] font-semibold leading-none tabular-nums">{value}</span>
        {unit && <span className="text-xs font-medium text-muted">{unit}</span>}
      </div>
    </div>
  );
}
