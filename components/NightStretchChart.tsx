"use client";

import Explain from "@/components/Explain";
import {
  fitNights,
  MILESTONES_MS,
  projectMilestone,
  THROUGH_THE_NIGHT_MS,
  type NightPoint,
} from "@/lib/nights";
import { fmtDuration } from "@/lib/time";

/**
 * Her longest stretch, night by night — the one line that answers "is she
 * getting closer to sleeping through?"
 *
 * Bars rather than a line: each night is its own event, and a line drawn
 * between two nights implies a night in between that never happened. The
 * milestone rules at four, five and six hours are what you read the bars
 * against; the dashed fit is what you read the direction from, and only when
 * it has earned a direction does the footer put a date on six hours.
 */

const W = 320;
// Taller than the other trend charts: the rungs at four, five and six hours
// are what the bars are read against, and at 150 they crowded together.
const H = 180;
const PAD_L = 8;
const PAD_R = 26;
const PAD_T = 10;
const PAD_B = 18;
const DAY = 86_400_000;
const HOUR = 3_600_000;

export default function NightStretchChart({ points }: { points: NightPoint[] }) {
  if (!points.length) {
    return (
      <div className="panel rounded-[10px] p-3">
        <Header />
        <p className="py-3 text-center text-[13px] text-muted">
          No finished nights yet — the first bar lands tomorrow morning.
        </p>
      </div>
    );
  }

  const trend = fitNights(points);
  const projection = projectMilestone(points, trend);

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const first = points[0].evening;
  const last = points[points.length - 1].evening;
  const spanDays = Math.max(1, Math.round((last - first) / DAY));
  // Room for the six-hour rule and a little headroom above it, always — the
  // goal should be on the chart even before she's anywhere near it.
  const peak = Math.max(7 * HOUR, ...points.map((p) => p.ms)) * 1.05;

  const slot = plotW / (spanDays + 1);
  const barW = Math.max(3, Math.min(16, slot * 0.7));
  const x = (evening: number) => PAD_L + slot / 2 + ((evening - first) / DAY) * slot;
  const y = (ms: number) => PAD_T + plotH - (ms / peak) * plotH;

  const dateLabel = (ms: number) =>
    new Date(ms).toLocaleDateString([], { month: "numeric", day: "numeric" });

  const best = points.reduce((a, b) => (b.ms > a.ms ? b : a));
  const recent = points.filter((p) => p.evening > last - 7 * DAY);
  const recentAvg = recent.reduce((s, p) => s + p.ms, 0) / recent.length;
  const goodNights = points.filter((p) => p.ms >= THROUGH_THE_NIGHT_MS).length;

  return (
    <div className="panel rounded-[10px] p-3">
      <Header />

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Longest stretch of sleep each night">
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--c-line)"
          strokeWidth={1}
        />

        {/* The rungs. Six hours is the one that matters, so it's the only one
            drawn in the series colour. */}
        {MILESTONES_MS.map((m) => {
          const goal = m === THROUGH_THE_NIGHT_MS;
          return (
            <g key={m}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y(m)}
                y2={y(m)}
                stroke={goal ? "var(--c-sleep-ink)" : "var(--c-line)"}
                strokeWidth={goal ? 1.25 : 1}
                strokeDasharray="3 3"
                opacity={goal ? 0.8 : 1}
              />
              <text
                x={W - PAD_R + 4}
                y={y(m) + 3}
                className="tabular-nums"
                style={{
                  fontSize: 8,
                  fontWeight: goal ? 700 : 400,
                  fill: goal ? "var(--c-sleep-ink)" : "var(--c-muted)",
                }}
              >
                {m / HOUR}h
              </text>
            </g>
          );
        })}

        {points.map((p) => {
          const good = p.ms >= THROUGH_THE_NIGHT_MS;
          return (
            <rect
              key={p.evening}
              x={x(p.evening) - barW / 2}
              y={y(p.ms)}
              width={barW}
              height={Math.max(1, y(0) - y(p.ms))}
              rx={2}
              fill={good ? "var(--c-sleep-ink)" : "var(--c-sleep)"}
              opacity={good ? 1 : 0.75}
            />
          );
        })}

        {/* The fit, over the bars so it can be read against them. */}
        {trend && (
          <line
            x1={x(first)}
            y1={y(trend.from)}
            x2={x(last)}
            y2={y(trend.to)}
            stroke="var(--c-ink)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={trend.significant ? 0.6 : 0.3}
          />
        )}

        <text x={PAD_L} y={H - 5} style={{ fontSize: 8, fill: "var(--c-muted)" }}>
          {dateLabel(first)}
        </text>
        {points.length > 1 && (
          <text x={W - PAD_R} y={H - 5} textAnchor="end" style={{ fontSize: 8, fill: "var(--c-muted)" }}>
            last night
          </text>
        )}
      </svg>

      <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2 text-[13px]">
        <Row label="Best night" value={`${fmtDuration(best.ms)} · ${dateLabel(best.evening)}`} />
        <Row label="Average, last 7 nights" value={fmtDuration(recentAvg)} />
        <Row label="Nights of 6h or more" value={`${goodNights} of ${points.length}`} />
        <p className="pt-1 text-[14px] font-medium" style={{ color: "var(--c-sleep-ink)" }}>
          {verdict(points.length, trend, projection)}
        </p>
      </div>

      <Explain className="mt-2">
        One bar per finished night: the longest sleep that started between 6pm
        and 6am, followed to its end however late that was. The dashed rules
        are four, five and six hours; six is the usual &quot;sleeping through
        the night&quot; mark. The dashed line is a fit across the nights shown,
        and a date is only put on six hours when that fit is climbing by more
        than the night-to-night scatter and gets there within three months —
        anything less would be a guess wearing a date. Nights with no sleep
        logged at all are left out rather than drawn as zero, and tonight
        appears tomorrow morning, once it&apos;s over.
      </Explain>
    </div>
  );
}

function verdict(
  n: number,
  trend: ReturnType<typeof fitNights>,
  projection: ReturnType<typeof projectMilestone>,
): string {
  if (n < 3 || !trend) return "A few more nights and there'll be a trend to read.";
  if (projection.kind === "there") return "The trend line is past six hours 🎉";
  if (projection.kind === "eta") {
    const when = new Date(projection.date).toLocaleDateString([], { month: "short", day: "numeric" });
    return `On this trend: six hours around ${when}`;
  }
  if (!trend.significant) return "Holding steady — no clear direction yet.";
  const perWeek = fmtDuration(Math.abs(trend.slopePerDay) * 7);
  return trend.slopePerDay > 0
    ? `Getting longer, about ${perWeek} a week`
    : `Shorter lately, about ${perWeek} a week`;
}

function Header() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span
        className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: "var(--c-sleep)" }}
      >
        Longest stretch each night
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="whitespace-nowrap font-medium tabular-nums">{value}</span>
    </div>
  );
}
