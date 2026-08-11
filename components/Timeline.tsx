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

/**
 * A strip along the top of the feed and sleep tracks that belongs to the
 * spit-up / fussy emoji alone. Bars and blocks stop below it, so a marker can
 * never sit on top of something you need to tap.
 */
const MOMENT_LANE = 15;

const TRACKS = [
  { key: "feed", label: "Feed", height: 88 },
  { key: "sleep", label: "Sleep", height: 54 },
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
              {/* Spit-ups: a mark, not a measurement — see MomentMark. */}
              {data.moments
                .filter((m) => m.kind === "spit_up")
                .map((m) => (
                  <MomentMark
                    key={m.id}
                    moment={m}
                    left={x(new Date(m.ts).getTime())}
                    onLongPress={(data) => onSelect({ kind: "moment", data })}
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
                    className={`absolute flex items-center justify-center overflow-hidden rounded-xl bg-sleep px-1 ${
                      active ? "animate-breathe" : ""
                    }`}
                    style={{ left, width: blockWidth, top: MOMENT_LANE + 2, bottom: 6 }}
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
                    onLongPress={(data) => onSelect({ kind: "moment", data })}
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
 * A spit-up or a fussy spell.
 *
 * A short tap does nothing: these share a track with the feed bars, and a tap
 * target over a bar stole the tap — you'd go to check how big a feed was and
 * get the spit-up instead. Only the emoji reacts, only to a long press, and the
 * emoji sits in a reserved lane above the bars so the two never compete.
 *
 * The press is cancelled by movement, because the timeline scrolls sideways and
 * a drag that happens to start on the emoji is a scroll, not a hold.
 */
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 8;

function MomentMark({
  moment,
  left,
  onLongPress,
}: {
  moment: Moment;
  left: number;
  onLongPress: (moment: Moment) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  return (
    <span
      className="pointer-events-none absolute inset-y-0"
      style={{ left: left - 8, width: 16 }}
    >
      <span
        className="absolute left-1/2 w-px -translate-x-1/2 rounded-full"
        style={{
          top: MOMENT_LANE,
          bottom: 0,
          background: MOMENT_ACCENT[moment.kind],
          opacity: 0.45,
        }}
        aria-hidden
      />
      <button
        type="button"
        aria-label={`${MOMENT_LABEL[moment.kind]} at ${fmtClock(moment.ts)} — press and hold to edit`}
        className="pointer-events-auto absolute inset-x-0 top-0 touch-none select-none text-center text-[11px] leading-none"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          origin.current = { x: e.clientX, y: e.clientY };
          timer.current = setTimeout(() => onLongPress(moment), LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          const from = origin.current;
          if (!from) return;
          if (
            Math.abs(e.clientX - from.x) > MOVE_TOLERANCE_PX ||
            Math.abs(e.clientY - from.y) > MOVE_TOLERANCE_PX
          ) {
            cancel();
          }
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onPointerLeave={cancel}
      >
        <span aria-hidden>{MOMENT_EMOJI[moment.kind]}</span>
      </button>
    </span>
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
