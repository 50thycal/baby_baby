"use client";

/**
 * Today's running total laid over the days before it.
 *
 * Every line starts at midnight, so the vertical gap between today and any
 * past day is "how far ahead or behind she is versus that point in that day" —
 * the same question the summary card answers with one number, but you can see
 * where in the day the difference opened up.
 *
 * Past days are drawn as complete curves; today stops at the current time.
 * Continuing today's line flat to the right edge would read as "she stopped",
 * which isn't what a partial day means.
 *
 * With several past days the older ones fade, so the eye reads the stack as
 * recency rather than as a set of equal peers. They also share one legend key
 * rather than getting one each: seven keys would take more room than the chart.
 */

/**
 * How visible a past day is, by age. The newest keeps the weight yesterday
 * always had; the oldest stays above 0.2 so a week's worth is still a legible
 * band rather than a smudge fading into the gridlines.
 */
function fade(age: number, total: number): number {
  if (total <= 1) return 0.8;
  return 0.8 - (age / (total - 1)) * 0.55;
}

const W = 320;
const H = 132;
const PAD_L = 30;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 18;

/** A legend key that mirrors the actual stroke: same colour, same dashes. */
function Swatch({
  color,
  dash,
  opacity = 1,
  vertical = false,
}: {
  color: string;
  dash?: string;
  opacity?: number;
  vertical?: boolean;
}) {
  return vertical ? (
    <svg width="7" height="11" aria-hidden>
      <line
        x1="3.5"
        y1="0"
        x2="3.5"
        y2="11"
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={dash}
        opacity={opacity}
      />
    </svg>
  ) : (
    <svg width="14" height="4" aria-hidden>
      <line
        x1="0"
        y1="2"
        x2="14"
        y2="2"
        stroke={color}
        strokeWidth={2}
        strokeDasharray={dash}
        opacity={opacity}
      />
    </svg>
  );
}

export default function CumulativeChart({
  today,
  previous,
  elapsedFraction,
  color,
  format,
  title,
  marks = [],
  markLabel,
}: {
  today: number[];
  /** Finished days, most recent first. */
  previous: number[][];
  /** How far through the day we are, 0–1. Today's line stops here. */
  elapsedFraction: number;
  color: string;
  format: (value: number) => string;
  title: string;
  /** Moments today, as fractions of the day. Drawn as bare vertical lines. */
  marks?: number[];
  markLabel?: string;
}) {
  const peak = Math.max(1, ...today, ...previous.flat());
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (i: number, n: number) => PAD_L + (i / Math.max(1, n - 1)) * plotW;
  const y = (v: number) => PAD_T + plotH - (v / peak) * plotH;

  const path = (series: number[], limit = series.length) =>
    series
      .slice(0, Math.max(2, limit))
      .map((v, i) => `${i === 0 ? "M" : "L"}${x(i, series.length).toFixed(1)} ${y(v).toFixed(1)}`)
      .join(" ");

  const todayCutoff = Math.max(2, Math.round(elapsedFraction * (today.length - 1)) + 1);
  const lastX = x(todayCutoff - 1, today.length);
  const lastY = y(today[todayCutoff - 1] ?? 0);

  return (
    <div className="panel rounded-[10px] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
          style={{ color }}
        >
          {title}
        </span>
        {/* A third legend item pushed the header onto two lines; nowrap on both
            sides keeps it a single row. */}
        {/* Swatches are drawn as SVG so they can carry the same dash pattern as
            the strokes they stand for — a solid bar next to a dashed line reads
            as a different series, not the same one. */}
        <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <Swatch color={color} />
            today
          </span>
          {previous.length > 0 && (
            <span className="flex items-center gap-1">
              <Swatch color="var(--c-muted)" dash="3 3" opacity={0.8} />
              {previous.length === 1 ? "yesterday" : `past ${previous.length} days`}
            </span>
          )}
          {markLabel && marks.length > 0 && (
            <span className="flex items-center gap-1">
              <Swatch color={color} dash="2 2" opacity={0.55} vertical />
              {markLabel}
            </span>
          )}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title}>
        {/* Horizontal guides at 0, half, peak. */}
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

        {/* Moment markers sit behind the lines: they say "around here", and
            should never be mistaken for part of the curve. */}
        {marks.map((f, i) => (
          <line
            key={i}
            x1={PAD_L + f * plotW}
            x2={PAD_L + f * plotW}
            y1={PAD_T}
            y2={PAD_T + plotH}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="2 2"
            opacity={0.55}
          />
        ))}

        {/* Oldest first, so the most recent past day is drawn last and sits on
            top of the fainter ones. */}
        {previous
          .map((series, i) => ({ series, age: i }))
          .reverse()
          .map(({ series, age }) => (
            <path
              key={age}
              d={path(series)}
              fill="none"
              stroke="var(--c-muted)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              opacity={fade(age, previous.length)}
              strokeLinejoin="round"
            />
          ))}
        <path
          d={path(today, todayCutoff)}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={lastX} cy={lastY} r={3.5} fill={color} />

        {/* Six-hourly ticks; a newborn's day has no other natural landmarks. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text
            key={f}
            x={PAD_L + f * plotW}
            y={H - 5}
            textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
            className="tabular-nums"
            style={{ fontSize: 8, fill: "var(--c-muted)" }}
          >
            {f === 1 ? "24h" : `${Math.round(f * 24)}:00`}
          </text>
        ))}
      </svg>
    </div>
  );
}
