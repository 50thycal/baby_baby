"use client";

import { fmtDayLabel } from "@/lib/time";
import { fmtKg, fmtOunceChange, fmtWeight, weightTrend } from "@/lib/weight";
import type { Weight } from "@/lib/types";

const ACCENT = "var(--c-weight)";

/**
 * Where she's at, and what she was before.
 *
 * No chart here on purpose — two numbers and the gap between them is the whole
 * of what you want at a glance. The shape of the climb lives on Advanced.
 */
export default function WeightCard({
  weights,
  onOpen,
}: {
  weights: Weight[] | undefined;
  onOpen: () => void;
}) {
  if (!weights) return <div className="h-[92px] animate-pulse rounded-[20px] bg-sunk" />;

  const trend = weightTrend(weights.map((w) => ({ grams: w.weight_g, at: new Date(w.ts).getTime() })));

  return (
    <button
      type="button"
      onClick={onOpen}
      className="panel press rounded-[20px] p-4 text-left"
      // Describes what tapping does — it opens the list of weigh-ins to correct
      // one. It does not log a new weight; that's the button on the Log screen.
      aria-label={
        trend
          ? `Weight ${fmtWeight(trend.latest.grams)} — tap to edit`
          : "Weigh-ins — nothing recorded yet"
      }
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.12em]"
          style={{ color: ACCENT }}
        >
          Weight
        </span>
        <span className="text-[11px] text-muted">
          {trend ? fmtDayLabel(new Date(trend.latest.at)) : ""}
        </span>
      </div>

      {!trend ? (
        <p className="py-1 text-[15px] text-muted">
          Nothing weighed yet — tap Weight on the Log screen.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="whitespace-nowrap text-[28px] font-semibold leading-none tabular-nums">
              {fmtWeight(trend.latest.grams)}
            </span>
            <span className="text-[12px] text-muted">{fmtKg(trend.latest.grams)}</span>
          </div>

          <div className="mt-1.5 flex items-baseline gap-2 text-[13px]">
            {trend.previous ? (
              <>
                <span className="font-medium" style={{ color: ACCENT }}>
                  {fmtOunceChange(trend.changeOz!)}
                </span>
                <span className="text-muted">
                  from {fmtWeight(trend.previous.grams)} on{" "}
                  {fmtDayLabel(new Date(trend.previous.at))}
                </span>
              </>
            ) : (
              <span className="text-muted">First weigh-in — no comparison yet.</span>
            )}
          </div>
        </>
      )}
    </button>
  );
}
