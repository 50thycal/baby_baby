"use client";

import { useEffect, useRef } from "react";
import { typicalSleepWindow, type SleepClock as Clock } from "@/lib/daily";
import { fmtClock } from "@/lib/time";

/**
 * When in the day she sleeps, folded onto one midnight-to-midnight axis.
 *
 * Every other chart on this page answers *how much*. This one answers *when* —
 * the thing you actually want at 9pm — by asking, for each slice of the clock,
 * what share of recent days she was asleep at that time. A tall bar at 03:00
 * means she is nearly always down then; a short one means sometimes.
 *
 * It's the one chart drawn wider than the screen and scrolled sideways. A day
 * squeezed into 320px gives each fifteen minutes about three pixels, which is
 * too fine to read and far too fine to point at; at 48px an hour the bands are
 * obvious and the hour labels all fit.
 */

const PX_PER_HOUR = 48;
const H = 150;
const PAD_T = 10;
const PAD_B = 22;
const AXIS_W = 30;

/** Anything from 7pm to 7am reads as night, and gets a darker ground. */
const NIGHT_FROM = 19;
const NIGHT_TO = 7;

export default function SleepClock({ clock }: { clock: Clock }) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = 24 * PX_PER_HOUR;
  const plotH = H - PAD_T - PAD_B;

  const window = typicalSleepWindow(clock.slots);
  const slotsPerHour = 60 / clock.slotMinutes;

  // Open on the evening rather than at midnight: the interesting band is the
  // night, and it sits at both ends of a midnight-to-midnight axis. Starting at
  // 18:00 puts bedtime on screen with the small hours one flick away.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = 17 * PX_PER_HOUR;
  }, []);

  // The same clock format the rest of the app writes times in. The axis below
  // uses the terse "3am" form, but that belongs to an axis, not to a sentence.
  const label = (slot: number) => {
    const mins = slot * clock.slotMinutes;
    return fmtClock(new Date(2000, 0, 1, Math.floor(mins / 60), mins % 60));
  };

  return (
    <div className="panel rounded-[10px] p-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span
          className="truncate text-[11px] font-medium uppercase tracking-[0.12em]"
          style={{ color: "var(--c-sleep)" }}
        >
          When she sleeps
        </span>
        <span className="shrink-0 whitespace-nowrap text-[10px] text-muted">
          {clock.dayCount === 0
            ? "no finished days"
            : `${clock.dayCount} day${clock.dayCount === 1 ? "" : "s"} · scroll →`}
        </span>
      </div>

      {clock.dayCount === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted">
          No finished days yet — this fills in from tomorrow.
        </p>
      ) : (
        <div className="flex">
          {/* The axis is pinned outside the scroller so the scale stays readable
              however far along the day you've scrolled. */}
          <svg width={AXIS_W} height={H} className="shrink-0" aria-hidden>
            {[0, 0.5, 1].map((f) => (
              <text
                key={f}
                x={AXIS_W - 4}
                y={PAD_T + plotH - f * plotH + 3}
                textAnchor="end"
                style={{ fontSize: 8, fill: "var(--c-muted)" }}
              >
                {Math.round(f * 100)}%
              </text>
            ))}
          </svg>

          <div ref={scroller} className="no-scrollbar flex-1 overflow-x-auto">
            <svg
              width={width}
              height={H}
              className="block"
              role="img"
              aria-label={`Share of the last ${clock.dayCount} days asleep, by time of day`}
            >
              {/* Night ground, drawn first so everything sits on top of it. */}
              <rect x={0} y={PAD_T} width={NIGHT_TO * PX_PER_HOUR} height={plotH} fill="var(--c-sleep-wash)" />
              <rect
                x={NIGHT_FROM * PX_PER_HOUR}
                y={PAD_T}
                width={(24 - NIGHT_FROM) * PX_PER_HOUR}
                height={plotH}
                fill="var(--c-sleep-wash)"
              />

              {[0, 0.5, 1].map((f) => (
                <line
                  key={f}
                  x1={0}
                  x2={width}
                  y1={PAD_T + plotH - f * plotH}
                  y2={PAD_T + plotH - f * plotH}
                  stroke="var(--c-line)"
                  strokeWidth={1}
                />
              ))}

              {clock.slots.map((f, i) => {
                const w = PX_PER_HOUR / slotsPerHour;
                const h = f * plotH;
                if (h <= 0) return null;
                return (
                  <rect
                    key={i}
                    x={i * w}
                    y={PAD_T + plotH - h}
                    width={w + 0.5 /* hairline overlap, so bands read as solid */}
                    height={h}
                    fill="var(--c-sleep)"
                    opacity={0.85}
                  />
                );
              })}

              {/* Hour ticks; midnight and noon get a full-height rule. */}
              {Array.from({ length: 25 }, (_, h) => (
                <g key={h}>
                  <line
                    x1={h * PX_PER_HOUR}
                    x2={h * PX_PER_HOUR}
                    y1={PAD_T}
                    y2={PAD_T + plotH}
                    stroke="var(--c-line)"
                    strokeWidth={h % 12 === 0 ? 1.5 : 1}
                    opacity={h % 3 === 0 ? 1 : 0.35}
                  />
                  {h % 3 === 0 && h < 24 && (
                    <text
                      x={h * PX_PER_HOUR + 3}
                      y={H - 7}
                      textAnchor="start"
                      className="tabular-nums"
                      style={{ fontSize: 9, fill: "var(--c-muted)" }}
                    >
                      {h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}

      {clock.dayCount > 0 && (
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-line pt-2 text-[13px]">
          <span className="text-muted">Usually asleep</span>
          <span className="whitespace-nowrap font-medium" style={{ color: "var(--c-sleep)" }}>
            {window
              ? window.slotCount === clock.slots.length
                ? "all day and night"
                : `${label(window.fromSlot)} – ${label(window.toSlot)}`
              : "no settled pattern yet"}
          </span>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-snug text-muted">
        Each bar is the share of the last {clock.dayCount || 0} finished day
        {clock.dayCount === 1 ? "" : "s"} she was asleep at that time. &quot;Usually
        asleep&quot; is the longest stretch above half, counted across midnight.
      </p>
    </div>
  );
}
