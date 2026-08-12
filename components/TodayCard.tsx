"use client";

import { compareToYesterday, type TodayComparison } from "@/lib/daily";
import { dayPace } from "@/lib/predict";
import { fmtDuration } from "@/lib/time";
import type { EventsPayload } from "@/lib/types";

/**
 * Today so far, against yesterday.
 *
 * The headline is the calendar day, not a rolling 24 hours: at 9am a rolling
 * window is still mostly yesterday, which is exactly when you want to know how
 * today is going.
 *
 * The delta compares against yesterday *at this same time*, not yesterday's
 * finished total — half a day will always look behind a whole one, and a number
 * that's alarming every morning is a number people stop reading. Yesterday's
 * full day is still shown underneath, quietly, as the thing to end up near.
 */
export default function TodayCard({ data, now }: { data: EventsPayload; now: Date }) {
  const c = compareToYesterday(data, now);
  // Against the usual shape of a day, rather than yesterday alone — one odd day
  // shouldn't set the bar. Null until a couple of complete days exist.
  const pace = dayPace(data, now);
  const paceColour =
    !pace || pace.deltaMl === 0
      ? "var(--c-muted)"
      : pace.deltaMl > 0
        ? "var(--c-feed)"
        : "var(--c-muted)";

  return (
    <div className="panel rounded-[10px] p-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="FEEDING"
          color="var(--c-feed)"
          value={`${c.today.feedingMl}`}
          unit="mL"
          delta={c.today.feedingMl - c.yesterdaySoFar.feedingMl}
          deltaUnit=" mL"
          yesterday={`${c.yesterdayFull.feedingMl} mL`}
        />
        <Stat
          label="SLEEP"
          color="var(--c-sleep)"
          value={fmtDuration(c.today.sleepMs)}
          delta={Math.round((c.today.sleepMs - c.yesterdaySoFar.sleepMs) / 60_000)}
          deltaUnit="m"
          yesterday={fmtDuration(c.yesterdayFull.sleepMs)}
        />
        <Stat
          label="DIAPERS"
          color="var(--c-diaper)"
          value={`${c.today.diaperCount}`}
          // On the value's own line rather than below it, so all three columns
          // keep the same number of rows and their baselines line up.
          unit={c.today.poopCount > 0 ? `· ${c.today.poopCount} dirty` : undefined}
          delta={c.today.diaperCount - c.yesterdaySoFar.diaperCount}
          deltaUnit=""
          yesterday={`${c.yesterdayFull.diaperCount}`}
        />
      </div>

      {pace && (
        <div className="mt-3 border-t border-line pt-2 text-[13px]">
          <span className="text-muted">Pace · </span>
          <span className="font-medium" style={{ color: paceColour }}>
            {pace.deltaMl === 0
              ? "right on the usual"
              : `${Math.abs(pace.deltaMl)} mL ${pace.deltaMl > 0 ? "ahead of" : "behind"} the usual`}
          </span>
          <span className="text-muted">
            {" "}
            by now. A whole day is typically {pace.typicalFullDayMl} mL.
          </span>
        </div>
      )}

      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-muted">
        Today since midnight. The arrow compares with yesterday at this time;
        the last line is all of yesterday.
      </p>
    </div>
  );
}

function Stat({
  label,
  color,
  value,
  unit,
  delta,
  deltaUnit,
  yesterday,
}: {
  label: string;
  color: string;
  value: string;
  unit?: string;
  delta: number;
  deltaUnit: string;
  yesterday: string;
}) {
  // Within a whisker of yesterday isn't worth an arrow; it just adds noise.
  const flat = delta === 0;
  const arrow = flat ? "·" : delta > 0 ? "▲" : "▼";
  const deltaColor = flat ? "var(--c-muted)" : color;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color }}>
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        {/* nowrap and a touch smaller: "13h 26m" wrapped onto two lines in a
            third of a phone's width, which knocked the columns out of line. */}
        <span className="whitespace-nowrap text-[20px] font-semibold leading-none tabular-nums">
          {value}
        </span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: deltaColor }}>
        {arrow} {flat ? "same" : `${Math.abs(delta)}${deltaUnit}`}
      </div>
      <div className="text-[11px] tabular-nums text-muted">yest. {yesterday}</div>
    </div>
  );
}

export type { TodayComparison };
