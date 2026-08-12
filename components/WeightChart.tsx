"use client";

import { fmtOunceChange, fmtPounds, fmtRate, fmtWeight, weightTrend } from "@/lib/weight";
import type { Weight } from "@/lib/types";

/**
 * The climb.
 *
 * Plotted against real elapsed time rather than one point per weigh-in, because
 * weigh-ins happen whenever somebody remembers: a fortnight's gap and a day's
 * gap drawn the same width would make the line say something it doesn't. The
 * dots are where the readings actually are; the gaps between them are real.
 *
 * The y-axis starts at the lowest reading rather than zero. Zero-based would be
 * more honest for a bar chart, but a newborn's whole range is a couple of
 * pounds inside a fifteen-pound axis, and the line would be flat and useless.
 * The axis labels say plainly what the range is.
 */

const W = 320;
const H = 150;
const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 20;

const ACCENT = "var(--c-weight)";

export default function WeightChart({ weights }: { weights: Weight[] }) {
  const points = weights
    .map((w) => ({ grams: w.weight_g, at: new Date(w.ts).getTime() }))
    .sort((a, b) => a.at - b.at);
  const trend = weightTrend(points);

  if (!trend) {
    return (
      <div className="panel rounded-[10px] p-4">
        <Header />
        <p className="py-4 text-center text-sm text-muted">
          Nothing weighed yet. Log one from the Log screen and the line starts here.
        </p>
      </div>
    );
  }

  if (points.length === 1) {
    return (
      <div className="panel rounded-[10px] p-4">
        <Header />
        <div className="py-2 text-center">
          <div className="text-[26px] font-semibold tabular-nums">
            {fmtWeight(points[0].grams)}
          </div>
          <p className="mt-1 text-[13px] text-muted">
            One reading so far — a second one draws the line.
          </p>
        </div>
      </div>
    );
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const lowG = Math.min(...points.map((p) => p.grams));
  const highG = Math.max(...points.map((p) => p.grams));
  // A flat series would divide by zero; give it a nominal band so the line sits
  // in the middle rather than on an edge.
  const span = Math.max(1, highG - lowG);
  const padG = span * 0.15;
  const lo = lowG - padG;
  const hi = highG + padG;

  const first = points[0].at;
  const last = points[points.length - 1].at;
  const timeSpan = Math.max(1, last - first);

  const x = (at: number) => PAD_L + ((at - first) / timeSpan) * plotW;
  const y = (g: number) => PAD_T + plotH - ((g - lo) / (hi - lo)) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.at).toFixed(1)} ${y(p.grams).toFixed(1)}`).join(" ");

  const dayLabel = (t: number) =>
    new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div className="panel rounded-[10px] p-3">
      <Header />

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight over time">
        {/* Guides at the bottom, middle and top of the plotted band, labelled in
            pounds and ounces so the axis is readable in the unit people use. */}
        {[0, 0.5, 1].map((f) => {
          const g = lo + (hi - lo) * f;
          return (
            <g key={f}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(g)}
                y2={y(g)}
                stroke="var(--c-line)"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 4}
                y={y(g) + 3}
                textAnchor="end"
                className="tabular-nums"
                style={{ fontSize: 8, fill: "var(--c-muted)" }}
              >
                {fmtPounds(g)}
              </text>
            </g>
          );
        })}

        <path
          d={path}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(p.at)}
            cy={y(p.grams)}
            r={i === points.length - 1 ? 4 : 2.5}
            fill={ACCENT}
          />
        ))}

        <text
          x={PAD_L}
          y={H - 5}
          textAnchor="start"
          style={{ fontSize: 8, fill: "var(--c-muted)" }}
        >
          {dayLabel(first)}
        </text>
        <text
          x={W - PAD_R}
          y={H - 5}
          textAnchor="end"
          style={{ fontSize: 8, fill: "var(--c-muted)" }}
        >
          {dayLabel(last)}
        </text>
      </svg>

      <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
        <Row label="Now" value={fmtWeight(trend.latest.grams)} strong />
        <Row
          label={`Gained over ${Math.round(trend.spanDays)} day${Math.round(trend.spanDays) === 1 ? "" : "s"}`}
          value={fmtOunceChange(trend.totalOz)}
        />
        {trend.perWeekOz !== null && <Row label="Pace" value={fmtRate(trend.perWeekOz)} />}
        <Row
          label="Readings"
          value={`${points.length} · low ${fmtWeight(lowG)}`}
        />
      </div>

      <p className="mt-2 text-[11px] leading-snug text-muted">
        Plotted against real time, so the gaps between weigh-ins are to scale. The
        axis is zoomed to the readings — it does not start at zero.
      </p>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span
        className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: ACCENT }}
      >
        Weight · over time
      </span>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={`whitespace-nowrap tabular-nums ${strong ? "font-semibold" : "font-medium"}`}
        style={strong ? { color: ACCENT } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
