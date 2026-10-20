"use client";

import { memo } from "react";
import { DiaperIcon } from "@/components/icons";
import { fmtClock, fmtDayLabel } from "@/lib/time";
import { DIAPER_LABEL, type EventsPayload } from "@/lib/types";

type Props = {
  data: EventsPayload;
  start: number;
  end: number;
  width: number;
  onInspect: (description: string) => void;
};

/** All three tracks use exactly the wheel's coordinates, including clipped naps. */
export default memo(function EntryContext({ data, start, end, width, onInspect }: Props) {
  const x = (t: number) => ((t - start) / (end - start)) * width;
  const when = (t: string) => `${fmtDayLabel(t)} at ${fmtClock(t)}`;
  return (
    <div className="space-y-0.5 pb-1">
      <div aria-label="Feeding history" className="relative h-[18px] rounded bg-feed-wash">
        {data.feedings.map((f) => {
          const description = `Feed: ${f.amount_ml} mL · ${when(f.ts)}`;
          return (
            <button
              key={f.id}
              type="button"
              aria-label={description}
              title={description}
              onClick={() => onInspect(description)}
              className="absolute inset-y-0 -translate-x-1/2 whitespace-nowrap rounded bg-feed px-1 text-[10px] font-semibold text-white"
              style={{ left: x(new Date(f.ts).getTime()) }}
            >
              {f.amount_ml} mL
            </button>
          );
        })}
      </div>
      <div aria-label="Sleep history" className="relative h-[18px] rounded bg-sleep-wash">
        {data.sleep.map((s) => {
          const from = Math.max(start, new Date(s.sleep_start).getTime());
          const to = Math.min(end, s.sleep_end ? new Date(s.sleep_end).getTime() : Date.now());
          if (to <= from) return null;
          const description = `Sleep: ${when(s.sleep_start)} → ${s.sleep_end ? when(s.sleep_end) : "still asleep"}`;
          return (
            <button
              key={s.id}
              type="button"
              aria-label={description}
              title={description}
              onClick={() => onInspect(description)}
              className="absolute inset-y-0 overflow-hidden rounded bg-sleep px-1 text-[10px] font-semibold text-white"
              style={{ left: x(from), width: Math.max(2, x(to) - x(from)) }}
            >
              <span className="whitespace-nowrap">
                {fmtClock(s.sleep_start)}–{s.sleep_end ? fmtClock(s.sleep_end) : "now"}
              </span>
            </button>
          );
        })}
      </div>
      <div aria-label="Diaper history" className="relative h-[18px] rounded bg-diaper-wash">
        {data.diapers.map((d) => {
          const description = `Diaper: ${DIAPER_LABEL[d.type]} · ${when(d.ts)}`;
          return (
            <button
              key={d.id}
              type="button"
              aria-label={description}
              title={description}
              onClick={() => onInspect(description)}
              className="absolute inset-y-0 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded bg-diaper-wash px-1 text-[10px] font-semibold text-diaper-ink"
              style={{ left: x(new Date(d.ts).getTime()) }}
            >
              <DiaperIcon type={d.type} size={18} />
              {DIAPER_LABEL[d.type]}
            </button>
          );
        })}
      </div>
    </div>
  );
});
