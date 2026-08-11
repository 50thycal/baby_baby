"use client";

import { useEffect, useMemo, useRef } from "react";
import { clipSleep } from "@/lib/summary";
import { fmtClock, fmtDuration, HOUR } from "@/lib/time";
import {
  DIAPER_EMOJI,
  DIAPER_LABEL,
  MOMENT_ACCENT,
  MOMENT_EMOJI,
  MOMENT_LABEL,
  type EventsPayload,
  type Moment,
  type RangeKey,
  type TimelineEvent,
} from "@/lib/types";

type Props = {
  data: EventsPayload;
  range: RangeKey;
  now: Date;
  commentMode: boolean;
  onSelect: (event: TimelineEvent) => void;
  onPickTime: (at: Date) => void;
};

/** Horizontal density and gridline spacing, tuned per range. */
const LAYOUT: Record<RangeKey, { pxPerHour: number; tickHours: number }> = {
  "24h": { pxPerHour: 56, tickHours: 3 },
  "2d": { pxPerHour: 32, tickHours: 6 },
  "3d": { pxPerHour: 23, tickHours: 6 },
  "1w": { pxPerHour: 12, tickHours: 12 },
};

const TRACKS = [
  { key: "feed", label: "Feed", height: 74 },
  { key: "sleep", label: "Sleep", height: 42 },
  { key: "diaper", label: "Diaper", height: 38 },
  { key: "notes", label: "Notes", height: 30 },
] as const;

const AXIS_HEIGHT = 22;
const GUTTER = 52;
/** Breathing room at both ends so a marker sitting on "now" isn't sliced in half. */
const PAD = 15;

export default function Timeline({
  data,
  range,
  now,
  commentMode,
  onSelect,
  onPickTime,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const start = new Date(data.start).getTime();
  const end = new Date(data.end).getTime();
  const { pxPerHour, tickHours } = LAYOUT[range];
  const span = ((end - start) / HOUR) * pxPerHour;
  const width = span + PAD * 2;

  const x = (t: number) => PAD + ((t - start) / HOUR) * pxPerHour;
  const ticks = useMemo(() => buildTicks(start, end, tickHours), [start, end, tickHours]);

  // "Now" is the right-hand edge, and that's what you want to see first.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [range, width]);

  const pickTimeAt = (clientX: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const offset = Math.min(span, Math.max(0, clientX - rect.left - PAD));
    onPickTime(new Date(start + (offset / pxPerHour) * HOUR));
  };

  const maxFeed = Math.max(100, ...data.feedings.map((f) => f.amount_ml));

  return (
    <div className="panel rounded-[20px] p-3">
      <div className="flex">
        <div className="shrink-0" style={{ width: GUTTER }}>
          {TRACKS.map((track) => (
            <div
              key={track.key}
              className="flex items-center text-[10px] font-medium uppercase tracking-[0.1em] text-muted"
              style={{ height: track.height, marginBottom: 6 }}
            >
              {track.label}
            </div>
          ))}
          <div style={{ height: AXIS_HEIGHT }} />
        </div>

        <div ref={scroller} className="no-scrollbar flex-1 overflow-x-auto">
          <div ref={canvas} className="relative" style={{ width }}>
            {/* ---- Feed: bars scaled by volume ---- */}
            <Track height={TRACKS[0].height}>
              <Grid ticks={ticks} x={x} />
              {data.feedings.map((f) => {
                const height = 12 + (f.amount_ml / maxFeed) * 44;
                return (
                  <button
                    key={f.id}
                    onClick={() => onSelect({ kind: "feeding", data: f })}
                    className="absolute bottom-1 flex flex-col items-center justify-end"
                    style={{ left: x(new Date(f.ts).getTime()) - 11, width: 22 }}
                    aria-label={`Feeding ${f.amount_ml} mL at ${fmtClock(f.ts)}`}
                  >
                    {pxPerHour >= 23 && (
                      <span className="mb-0.5 text-[10px] font-medium tabular-nums text-feed-ink">
                        {f.amount_ml}
                      </span>
                    )}
                    <span
                      className="w-2.5 rounded-full bg-feed"
                      style={{ height }}
                    />
                  </button>
                );
              })}
              {/* Spit-ups: a mark, not a measurement. Drawn over the bars at
                  full height so it's clear they sit between or during feeds
                  rather than being a feed of their own. */}
              {data.moments
                .filter((m) => m.kind === "spit_up")
                .map((m) => (
                  <MomentMark
                    key={m.id}
                    moment={m}
                    left={x(new Date(m.ts).getTime())}
                    onSelect={onSelect}
                  />
                ))}
            </Track>

            {/* ---- Sleep: blocks scaled by duration ---- */}
            <Track height={TRACKS[1].height}>
              <Grid ticks={ticks} x={x} />
              {data.sleep.map((s) => {
                const clipped = clipSleep(s, start, Math.min(end, now.getTime()));
                if (!clipped) return null;
                const left = x(clipped.from);
                const blockWidth = Math.max(4, x(clipped.to) - left);
                const active = s.sleep_end === null;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelect({ kind: "sleep", data: s })}
                    className={`absolute inset-y-1.5 flex items-center justify-center overflow-hidden rounded-xl bg-sleep px-1 ${
                      active ? "animate-breathe" : ""
                    }`}
                    style={{ left, width: blockWidth }}
                    aria-label={`Sleep from ${fmtClock(s.sleep_start)}`}
                  >
                    {blockWidth > 46 && (
                      <span className="truncate text-[10px] font-medium text-white">
                        {fmtDuration(clipped.to - clipped.from)}
                      </span>
                    )}
                  </button>
                );
              })}
              {data.moments
                .filter((m) => m.kind === "fussy")
                .map((m) => (
                  <MomentMark
                    key={m.id}
                    moment={m}
                    left={x(new Date(m.ts).getTime())}
                    onSelect={onSelect}
                  />
                ))}
            </Track>

            {/* ---- Diapers: icon markers ---- */}
            <Track height={TRACKS[2].height}>
              <Grid ticks={ticks} x={x} />
              {data.diapers.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onSelect({ kind: "diaper", data: d })}
                  className="absolute inset-y-0 flex items-center justify-center"
                  style={{ left: x(new Date(d.ts).getTime()) - 13, width: 26 }}
                  aria-label={`${DIAPER_LABEL[d.type]} at ${fmtClock(d.ts)}`}
                >
                  <span className={d.type === "both" ? "text-[11px]" : "text-[17px]"} aria-hidden>
                    {DIAPER_EMOJI[d.type]}
                  </span>
                </button>
              ))}
            </Track>

            {/* ---- Comments: tap a bubble to read it ---- */}
            <Track height={TRACKS[3].height}>
              <Grid ticks={ticks} x={x} />
              {data.comments.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onSelect({ kind: "comment", data: c })}
                  className="absolute inset-y-0 flex items-center justify-center"
                  style={{ left: x(new Date(c.ts).getTime()) - 12, width: 24 }}
                  aria-label={`Note: ${c.text}`}
                >
                  <span className="text-[15px]" aria-hidden>
                    💬
                  </span>
                </button>
              ))}
            </Track>

            {/* ---- Time axis ---- */}
            <div className="relative" style={{ height: AXIS_HEIGHT }}>
              {ticks.map((tick) => (
                <span
                  key={tick.t}
                  className={`absolute top-0.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums ${
                    tick.isDayStart ? "text-ink" : "text-muted"
                  }`}
                  style={{ left: x(tick.t) }}
                >
                  {tick.label}
                </span>
              ))}
            </div>

            {commentMode && (
              <button
                aria-label="Pick a moment to comment on"
                onClick={(e) => pickTimeAt(e.clientX)}
                className="absolute inset-x-0 top-0 rounded-2xl border-2 border-dashed border-sleep/70 bg-sleep/5"
                style={{ height: trackAreaHeight() }}
              />
            )}
          </div>
        </div>
      </div>

      {isEmpty(data) && (
        <p className="py-6 text-center text-sm font-medium text-muted">
          Nothing logged in this window yet.
        </p>
      )}
    </div>
  );
}

function trackAreaHeight() {
  return TRACKS.reduce((total, t) => total + t.height + 6, 0);
}

function isEmpty(data: EventsPayload) {
  return (
    data.feedings.length === 0 &&
    data.sleep.length === 0 &&
    data.diapers.length === 0 &&
    data.comments.length === 0
  );
}

/**
 * A spit-up or a fussy spell: a full-height line with its emoji on top.
 *
 * Deliberately not scaled by anything — these have no size, only a time, and a
 * line is the honest way to say "around here". The tap target is wider than the
 * line so it can still be opened and corrected on a phone.
 */
function MomentMark({
  moment,
  left,
  onSelect,
}: {
  moment: Moment;
  left: number;
  onSelect: (event: TimelineEvent) => void;
}) {
  return (
    <button
      onClick={() => onSelect({ kind: "moment", data: moment })}
      className="absolute inset-y-0 flex w-6 flex-col items-center justify-start overflow-hidden"
      style={{ left: left - 12 }}
      aria-label={`${MOMENT_LABEL[moment.kind]} at ${fmtClock(moment.ts)}`}
    >
      <span
        className="absolute inset-y-0 w-[2px] rounded-full"
        style={{ background: MOMENT_ACCENT[moment.kind], opacity: 0.85 }}
      />
      {/* The halo keeps the emoji legible where the line crosses a sleep block,
          and `overflow-hidden` above stops it spilling into the track above. */}
      <span
        className="relative mt-[1px] flex h-[15px] w-[15px] items-center justify-center rounded-full text-[10px] leading-none"
        style={{ background: "var(--c-card)" }}
      >
        {MOMENT_EMOJI[moment.kind]}
      </span>
    </button>
  );
}

function Track({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[10px] bg-sunk"
      style={{ height, marginBottom: 6 }}
    >
      {children}
    </div>
  );
}

type Tick = { t: number; label: string; isDayStart: boolean };

function Grid({ ticks, x }: { ticks: Tick[]; x: (t: number) => number }) {
  return (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.t}
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{
            left: x(tick.t),
            background: "var(--c-line)",
            opacity: tick.isDayStart ? 1 : 0.6,
          }}
        />
      ))}
    </>
  );
}

/** Gridlines on local clock hours, with midnight promoted to a day label. */
function buildTicks(start: number, end: number, stepHours: number): Tick[] {
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  if (cursor.getTime() < start) cursor.setTime(cursor.getTime() + HOUR);
  while (cursor.getHours() % stepHours !== 0) {
    cursor.setTime(cursor.getTime() + HOUR);
    cursor.setMinutes(0, 0, 0);
  }

  const ticks: Tick[] = [];
  while (cursor.getTime() <= end && ticks.length < 200) {
    const isDayStart = cursor.getHours() === 0;
    ticks.push({
      t: cursor.getTime(),
      isDayStart,
      label: isDayStart
        ? cursor.toLocaleDateString([], { weekday: "short" })
        : cursor.toLocaleTimeString([], { hour: "numeric" }).replace(/\s?[AP]M/i, (m) =>
            m.trim().toLowerCase(),
          ),
    });
    cursor.setTime(cursor.getTime() + stepHours * HOUR);
    cursor.setMinutes(0, 0, 0);
  }
  return ticks;
}
