"use client";

import {
  computeTally,
  diaperComparison,
  milkComparison,
  sleepComparison,
  WALK_MPH,
} from "@/lib/tally";
import { fmtDuration } from "@/lib/time";
import type { EventsPayload } from "@/lib/types";

/**
 * Everything since day one, with something to measure it against.
 *
 * Sits at the very bottom of Advanced on purpose: it's the fun one, not the
 * useful one, and it shouldn't be in the way of the numbers you check at 3am.
 */
export default function GrandTally({ data, now }: { data: EventsPayload; now: Date }) {
  const t = computeTally(data, now);
  const milk = milkComparison(t.milkMl);
  const walk = sleepComparison(t.sleepMs);
  const stack = diaperComparison(t.diapers);
  const hours = Math.round(t.sleepMs / 3_600_000);

  if (t.feeds + t.diapers + t.naps === 0) return null;

  return (
    <div className="panel rounded-[20px] p-4">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        The Grand Tally
      </div>
      <p className="mb-3 text-[11px] text-muted">
        Everything, since the very first entry · {t.days} day{t.days === 1 ? "" : "s"}
      </p>

      <div className="flex flex-col gap-3">
        <Big
          color="var(--c-feed)"
          label="Milk drunk"
          value={`${t.milkMl.toLocaleString()} mL`}
          sub={`over ${t.feeds.toLocaleString()} feed${t.feeds === 1 ? "" : "s"}`}
          comparison={milk}
        />
        <Big
          color="var(--c-sleep)"
          label="Time asleep"
          value={fmtDuration(t.sleepMs)}
          sub={`${t.naps.toLocaleString()} sleep${t.naps === 1 ? "" : "s"} · ${hours.toLocaleString()} hours`}
          comparison={
            walk && {
              headline: walk.headline,
              detail: `${walk.detail} · at a ${WALK_MPH} mph amble`,
            }
          }
        />
        <Big
          color="var(--c-diaper)"
          label="Diapers changed"
          value={t.diapers.toLocaleString()}
          sub={`${t.dirtyDiapers.toLocaleString()} of them dirty`}
          comparison={stack && { headline: stack.headline, detail: `${stack.detail} · stacked up` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2 text-[13px] text-muted">
        <span>
          🤢 {t.spitUps.toLocaleString()} spit up{t.spitUps === 1 ? "" : "s"}
        </span>
        <span>
          😠 {t.fussies.toLocaleString()} fussy spell{t.fussies === 1 ? "" : "s"}
        </span>
        <span>
          💬 {t.notes.toLocaleString()} note{t.notes === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function Big({
  color,
  label,
  value,
  sub,
  comparison,
}: {
  color: string;
  label: string;
  value: string;
  sub: string;
  comparison: { headline: string; detail: string } | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.12em]" style={{ color }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="whitespace-nowrap text-[26px] font-semibold leading-none tabular-nums">
          {value}
        </span>
        <span className="text-[12px] text-muted">{sub}</span>
      </div>
      {comparison && (
        <div className="mt-0.5 text-[13px]">
          <span className="font-medium" style={{ color }}>
            {comparison.headline}
          </span>
          <span className="text-muted"> · {comparison.detail}</span>
        </div>
      )}
    </div>
  );
}
