"use client";

import { linearFit, type DailyPoint } from "@/lib/daily";

/**
 * One finished day's total per point, with a fitted line through them.
 *
 * The cumulative charts above answer "how is today going". This answers the
 * slower question — "is she trending up" — which a single day can't, and which
 * a pair of days answers badly: any two days differ, and reading direction off
 * the last two is how you convince yourself something is happening every time
 * she has one quiet afternoon.
 *
 * The trend is an ordinary least-squares fit over the whole selected window,
 * so one wild day nudges it rather than defining it.
 */

const W = 320;
const H = 118;
const PAD_L = 34;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 18;

export default function TrendChart({
  title,
  color,
  points,
  format,
  /** Slope is per day, in the metric's own unit; this renders it as a sentence. */
  describeSlope,
}: {
  title: string;
  color: string;
  points: DailyPoint[];
  format: (value: number) => string;
  describeSlope: (perDay: number) => string;
}) {
  const trend = linearFit(points);

  if (points.length < 2) {
    return (
      <div className="panel rounded-[10px] p-3">
        <Header title={title} color={color} />
        <p className="py-3 text-center text-[13px] text-muted">
          {points.length === 0
            ? "No finished days yet — this fills in from tomorrow."
            : "One finished day so far. A second one starts the line."}
        </p>
      </div>
    );
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const values = points.map((p) => p.value);
  const rawMax = Math.max(...values, trend?.from ?? 0, trend?.to ?? 0);
  // Always anchored at zero: these are daily totals, and a zoomed baseline
  // would turn a 5% wobble into a mountain range.
  const peak = rawMax > 0 ? rawMax : 1;

  const x = (i: number) => PAD_L + (i / Math.max(1, points.length - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - (Math.max(0, v) / peak) * plotH;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");

  const dayLabel = (ms: number) =>
    new Date(ms).toLocaleDateString([], { month: "numeric", day: "numeric" });

  // Enough dots to read at a week, not so many they merge over a year.
  const showDots = points.length <= 21;

  return (
    <div className="panel rounded-[10px] p-3">
      <Header title={title} color={color} />

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(peak * f)}
              y2={y(peak * f)}
              stroke="var(--c-line)"
              strokeWidth={1}
            />
            <text
              x={PAD_L - 4}
              y={y(peak * f) + 3}
              textAnchor="end"
              className="tabular-nums"
              style={{ fontSize: 8, fill: "var(--c-muted)" }}
            >
              {format(peak * f)}
            </text>
          </g>
        ))}

        {/* The fit, behind the data it describes. */}
        {trend && (
          <line
            x1={x(0)}
            y1={y(trend.from)}
            x2={x(points.length - 1)}
            y2={y(trend.to)}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={trend.significant ? 0.55 : 0.28}
          />
        )}

        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {showDots &&
          points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r={2.2} fill={color} />)}

        <text x={PAD_L} y={H - 5} textAnchor="start" style={{ fontSize: 8, fill: "var(--c-muted)" }}>
          {dayLabel(points[0].dayStart)}
        </text>
        <text
          x={W - PAD_R}
          y={H - 5}
          textAnchor="end"
          style={{ fontSize: 8, fill: "var(--c-muted)" }}
        >
          {dayLabel(points[points.length - 1].dayStart)}
        </text>
      </svg>

      <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-[13px]">
        <span className="text-muted">
          {points.length} day{points.length === 1 ? "" : "s"}
        </span>
        <span
          className="whitespace-nowrap font-medium"
          style={{ color: trend?.significant ? color : "var(--c-muted)" }}
        >
          {!trend
            ? "not enough days to call it"
            : trend.significant
              ? describeSlope(trend.slope)
              : "holding steady"}
        </span>
      </div>
    </div>
  );
}

function Header({ title, color }: { title: string; color: string }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span
        className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color }}
      >
        {title}
      </span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-muted">
        <svg width="14" height="4" aria-hidden>
          <line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.55} />
        </svg>
        trend
      </span>
    </div>
  );
}
