"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tick } from "@/lib/haptics";
import { fmtAgo, fmtClock, fmtDayLabel, isSameLocalDay, MINUTE, roundToStep } from "@/lib/time";

type Props = {
  /** The timestamp being edited. */
  value: Date;
  onChange: (next: Date) => void;
  /** Where the wheel is centred — normally "now", or the event's own time when editing. */
  base: Date;
  accent?: string;
  label?: string;
};

const STEP_MIN = 5;
const SPAN_MIN = 8 * 60; // reachable by scrolling; the chips cover bigger jumps
const ITEM_W = 24;
const COUNT = (SPAN_MIN * 2) / STEP_MIN + 1;

/**
 * Tap the time, scrub the wheel. Nobody types a date into this app.
 *
 * The wheel snaps to tidy 5-minute detents around `base`, but an untouched
 * field keeps the exact timestamp it was given.
 */
export default function TimeField({ value, onChange, base, accent, label }: Props) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastIndex = useRef<number>(-1);

  // Detents are anchored to a rounded base so tick labels land on :00 and :30.
  const anchor = useMemo(() => roundToStep(base, STEP_MIN).getTime(), [base]);
  const indexFor = (t: number) =>
    Math.min(COUNT - 1, Math.max(0, Math.round((t - anchor) / (STEP_MIN * MINUTE)) + SPAN_MIN / STEP_MIN));
  const timeFor = (index: number) => anchor + (index - SPAN_MIN / STEP_MIN) * STEP_MIN * MINUTE;

  // Centre the wheel on the current value whenever it is opened.
  useEffect(() => {
    if (!open) return;
    const el = scroller.current;
    if (!el) return;
    const index = indexFor(value.getTime());
    lastIndex.current = index;
    el.scrollLeft = index * ITEM_W;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const index = Math.min(COUNT - 1, Math.max(0, Math.round(el.scrollLeft / ITEM_W)));
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    tick();
    onChange(new Date(timeFor(index)));
  };

  const jumpTo = (next: Date) => {
    const el = scroller.current;
    const index = indexFor(next.getTime());
    lastIndex.current = index;
    onChange(new Date(timeFor(index)));
    if (el) el.scrollTo({ left: index * ITEM_W, behavior: "smooth" });
    tick();
  };

  const shift = (minutes: number) => jumpTo(new Date(value.getTime() + minutes * MINUTE));

  const now = new Date();
  const sameDay = isSameLocalDay(value, now);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          tick();
        }}
        className="press mx-auto flex w-full flex-col items-center rounded-[10px] px-4 py-3"
        style={{ background: open ? "var(--c-sunk)" : "transparent" }}
      >
        {label && (
          <span className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            {label}
          </span>
        )}
        <span className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums tracking-[-0.01em]">{fmtClock(value)}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: accent ?? "var(--c-muted)" }}
            aria-hidden
          >
            {open ? "▾" : "▸"}
          </span>
        </span>
        <span className="mt-0.5 text-[13px] font-medium text-muted">
          {sameDay ? fmtAgo(value, now) : `${fmtDayLabel(value)} · ${fmtAgo(value, now)}`}
        </span>
      </button>

      {open && (
        <div className="mt-1">
          <div className="relative">
            {/* Centre indicator */}
            <div
              className="pointer-events-none absolute left-1/2 top-1 z-10 h-9 w-[3px] -translate-x-1/2 rounded-[8px]"
              style={{ background: accent ?? "var(--c-ink)" }}
            />
            <div
              ref={scroller}
              onScroll={onScroll}
              className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-1"
              style={{ scrollSnapType: "x mandatory" }}
            >
              <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
              {Array.from({ length: COUNT }, (_, i) => {
                const t = new Date(timeFor(i));
                const minutes = t.getMinutes();
                const isHour = minutes === 0;
                const isHalf = minutes % 30 === 0;
                return (
                  <div
                    key={i}
                    className="flex shrink-0 snap-center flex-col items-center"
                    style={{ width: ITEM_W }}
                  >
                    <div
                      className="w-[2px] rounded-[8px] bg-line"
                      style={{ height: isHour ? 30 : isHalf ? 22 : 14 }}
                    />
                    {/* Absolute so an hour label can overhang its 24px detent. */}
                    <div className="relative mt-1 h-4 w-full">
                      {isHour && (
                        <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-muted">
                          {t.toLocaleTimeString([], { hour: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
            </div>
          </div>

          <div className="mt-2 flex justify-center gap-2">
            <Chip onClick={() => shift(-60)}>−1h</Chip>
            <Chip onClick={() => shift(-30)}>−30m</Chip>
            <Chip onClick={() => shift(-5)}>−5m</Chip>
            <Chip onClick={() => shift(5)}>+5m</Chip>
            <Chip onClick={() => jumpTo(base)}>⟲</Chip>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press h-10 min-w-12 rounded-[8px] bg-sunk px-3 text-sm font-medium text-muted"
    >
      {children}
    </button>
  );
}
