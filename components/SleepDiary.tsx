"use client";

import Explain from "@/components/Explain";
import { THROUGH_THE_NIGHT_MS, type DiaryRow } from "@/lib/nights";
import { fmtDuration } from "@/lib/time";

/**
 * The sleep diary: one strip per day, every sleep where it actually fell.
 *
 * The other sleep charts average or total, which is what makes them steady —
 * and also what hides the one thing you want to see: the stretches. Here
 * nothing is folded together. Each night's longest stretch is drawn darker,
 * feeds sit underneath as ticks, and reading down the rows is reading the
 * nights getting longer (or not).
 *
 * Rows run noon to noon so a night is one bar in the middle of its row rather
 * than two halves on two rows. Newest at the top, because that's the night you
 * opened the app to look at.
 */

const W = 320;
const LABEL_W = 36;
const RIGHT_W = 34;
const AXIS_H = 14;
const ROW_H = 17;
const BAR_H = 9;
const PLOT_W = W - LABEL_W - RIGHT_W;

/** Hour marks across a noon-to-noon row. */
const TICKS = [
  { f: 0, label: "12p" },
  { f: 0.25, label: "6p" },
  { f: 0.5, label: "12a" },
  { f: 0.75, label: "6a" },
  { f: 1, label: "12p" },
];

export default function SleepDiary({ rows }: { rows: DiaryRow[] }) {
  if (!rows.length) {
    return (
      <div className="panel rounded-[10px] p-3">
        <Header />
        <p className="py-3 text-center text-[13px] text-muted">
          No sleep logged yet — the diary fills in as you log.
        </p>
      </div>
    );
  }

  const H = AXIS_H + rows.length * ROW_H + 4;
  const x = (f: number) => LABEL_W + f * PLOT_W;
  // Built by hand: some locales put the day number first ("7 Wed"), and down a
  // column the weekday is what the eye scans for.
  const dayLabel = (ms: number) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString([], { weekday: "short" })} ${d.getDate()}`;
  };

  return (
    <div className="panel rounded-[10px] p-3">
      <Header />

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sleep diary, one row per day">
        {/* Night, 6pm to 6am, as a ground under every row: the middle half of
            each strip is where the stretch you're hoping for should land. */}
        <rect
          x={x(0.25)}
          y={AXIS_H}
          width={x(0.75) - x(0.25)}
          height={rows.length * ROW_H}
          fill="var(--c-sleep-wash)"
        />

        {TICKS.map((t) => (
          <g key={t.f}>
            <line
              x1={x(t.f)}
              x2={x(t.f)}
              y1={AXIS_H - 2}
              y2={AXIS_H + rows.length * ROW_H}
              stroke="var(--c-line)"
              strokeWidth={1}
            />
            <text
              x={x(t.f)}
              y={AXIS_H - 5}
              textAnchor={t.f === 0 ? "start" : t.f === 1 ? "end" : "middle"}
              style={{ fontSize: 8, fill: "var(--c-muted)" }}
            >
              {t.label}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const top = AXIS_H + i * ROW_H;
          const barY = top + (ROW_H - BAR_H) / 2 - 1;
          const good = r.longestMs !== null && r.longestMs >= THROUGH_THE_NIGHT_MS;
          return (
            <g key={r.start}>
              <text
                x={LABEL_W - 4}
                y={barY + BAR_H - 1}
                textAnchor="end"
                style={{ fontSize: 8, fill: "var(--c-muted)" }}
              >
                {dayLabel(r.start)}
              </text>

              {r.segments.map((s, j) => (
                <rect
                  key={j}
                  x={x(s.from)}
                  y={barY}
                  width={Math.max(1.5, x(s.to) - x(s.from))}
                  height={BAR_H}
                  rx={2}
                  fill={s.longest ? "var(--c-sleep-ink)" : "var(--c-sleep)"}
                  opacity={s.longest ? 1 : 0.55}
                />
              ))}

              {/* Feeds hang just under the bar: a wake-up with a feed tick
                  right after it is usually the answer to "why did she wake". */}
              {r.feeds.map((f, j) => (
                <rect
                  key={`f${j}`}
                  x={x(f) - 0.6}
                  y={barY + BAR_H + 1}
                  width={1.2}
                  height={3}
                  fill="var(--c-feed)"
                />
              ))}

              {r.now !== null && (
                <line
                  x1={x(r.now)}
                  x2={x(r.now)}
                  y1={top + 1}
                  y2={top + ROW_H - 1}
                  stroke="var(--c-now)"
                  strokeWidth={1.5}
                />
              )}

              {r.longestMs !== null && (
                <text
                  x={W - 2}
                  y={barY + BAR_H - 1}
                  textAnchor="end"
                  className="tabular-nums"
                  style={{
                    fontSize: 8,
                    fontWeight: good ? 700 : 400,
                    fill: good ? "var(--c-sleep-ink)" : "var(--c-muted)",
                  }}
                >
                  {fmtDuration(r.longestMs)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted">
        <Key color="var(--c-sleep)" opacity={0.55} label="sleep" />
        <Key color="var(--c-sleep-ink)" label="night's longest stretch" />
        <span className="flex items-center gap-1">
          <svg width="6" height="8" aria-hidden>
            <rect x="2.4" y="2" width="1.2" height="5" fill="var(--c-feed)" />
          </svg>
          feed
        </span>
      </div>

      <Explain className="mt-2">
        One row per day, newest at the top, running noon to noon so each night
        sits whole in the middle of its row instead of being cut in two at
        midnight. The shaded middle is 6pm to 6am. The darker bar is that
        night&apos;s longest stretch — the longest sleep that started between
        6pm and 6am, followed to its end — and its length is printed at the end
        of the row, in bold once it reaches six hours. Pink ticks under the bars
        are feeds. The red mark on the top row is now.
      </Explain>
    </div>
  );
}

function Header() {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span
        className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
        style={{ color: "var(--c-sleep)" }}
      >
        Sleep diary
      </span>
      <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">last 2 weeks</span>
    </div>
  );
}

function Key({ color, label, opacity = 1 }: { color: string; label: string; opacity?: number }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <svg width="14" height="8" aria-hidden>
        <rect x="0" y="1" width="14" height="6" rx="2" fill={color} opacity={opacity} />
      </svg>
      {label}
    </span>
  );
}
