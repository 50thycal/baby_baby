"use client";

import { memo, useLayoutEffect, useRef, useState } from "react";
import EntryContext from "@/components/EntryContext";
import { useEventWindow } from "@/lib/api";
import {
  ENTRY_COUNT,
  ENTRY_ITEM_WIDTH as ITEM_W,
  ENTRY_SPAN,
  ENTRY_STEP,
  entryAnchor,
  entryIndex,
  entryTime,
  shiftLocalDay,
} from "@/lib/entry-time";
import { tick } from "@/lib/haptics";
import { fmtAgo, fmtClock, fmtDayLabel, MINUTE, roundToStep } from "@/lib/time";

type Props = {
  value: Date;
  onChange: (next: Date) => void;
  base: Date;
  accent?: string;
  label?: string;
  initiallyOpen?: boolean;
};

/** A full day in either direction, with calendar-day jumps for older entries. */
export default function TimeField({
  value,
  onChange,
  base,
  accent,
  label,
  initiallyOpen = false,
}: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [anchor, setAnchor] = useState(() => entryAnchor(base));
  const [detail, setDetail] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(-1);
  const timestamp = value.getTime();
  const start = anchor - ENTRY_SPAN;
  const end = anchor + ENTRY_SPAN;
  const { data, error, isLoading } = useEventWindow(start, end, open);

  // Opening or moving an external cursor must not round an untouched timestamp.
  useLayoutEffect(() => {
    if (!open || !scroller.current) return;
    if (timestamp < anchor - ENTRY_SPAN || timestamp > anchor + ENTRY_SPAN) {
      setAnchor(entryAnchor(new Date(timestamp)));
      return;
    }
    const index = entryIndex(timestamp, anchor);
    lastIndex.current = index;
    if (Math.round(scroller.current.scrollLeft / ITEM_W) !== index) {
      scroller.current.scrollLeft = index * ITEM_W;
    }
  }, [open, anchor, timestamp]);

  const jumpTo = (next: Date) => {
    const rounded = roundToStep(next, ENTRY_STEP);
    const t = rounded.getTime();
    setDetail("");
    if (t < start || t > end) setAnchor(entryAnchor(rounded));
    else if (scroller.current) {
      const index = entryIndex(t, anchor);
      lastIndex.current = index;
      // Instant positioning avoids intermediate scroll events changing the time.
      scroller.current.scrollLeft = index * ITEM_W;
    }
    onChange(rounded);
    tick();
  };

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${label ?? "Event time"}: ${fmtDayLabel(value)} ${fmtClock(value)}`}
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
          <span className="text-3xl font-semibold tabular-nums">{fmtClock(value)}</span>
          <span aria-hidden style={{ color: accent ?? "var(--c-muted)" }}>
            {open ? "▾" : "▸"}
          </span>
        </span>
        <span className="mt-0.5 text-[13px] font-medium text-muted">
          {fmtDayLabel(value)} · {fmtAgo(value)}
        </span>
      </button>

      {open && (
        <div className="mt-1">
          <div className="mb-2 flex justify-center gap-4 text-[11px] font-semibold" aria-hidden>
            <span className="text-feed-ink">Feed</span>
            <span className="text-sleep-ink">Sleep</span>
            <span className="text-diaper-ink">Diaper</span>
          </div>
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-8 left-1/2 top-0 z-10 w-[2px] -translate-x-1/2 rounded"
              style={{ background: accent ?? "var(--c-ink)" }}
            />
            <div
              ref={scroller}
              role="group"
              aria-label="Time scale with feeding, sleep, and diaper history"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  jumpTo(
                    new Date(timestamp + (e.key === "ArrowLeft" ? -1 : 1) * ENTRY_STEP * MINUTE),
                  );
                }
              }}
              onScroll={() => {
                const el = scroller.current;
                if (!el) return;
                const index = Math.max(
                  0,
                  Math.min(ENTRY_COUNT - 1, Math.round(el.scrollLeft / ITEM_W)),
                );
                if (index === lastIndex.current) return;
                lastIndex.current = index;
                setDetail("");
                onChange(new Date(entryTime(index, anchor)));
                tick();
              }}
              className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-1"
            >
              <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
              <div className="shrink-0" style={{ width: ENTRY_COUNT * ITEM_W }}>
                {data ? (
                  <div className="px-3">
                    <EntryContext
                      data={data}
                      start={start}
                      end={end}
                      width={(ENTRY_COUNT - 1) * ITEM_W}
                      onInspect={setDetail}
                    />
                  </div>
                ) : (
                  <div className="h-[116px]" />
                )}
                <TimeTicks anchor={anchor} />
              </div>
              <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
            </div>
          </div>
          <p role="status" className="min-h-5 text-center text-[11px] text-muted">
            {error
              ? "History couldn’t load. You can still set the time."
              : isLoading
                ? "Loading nearby logs…"
                : detail || "Scroll to set the time · tap a log for details"}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Chip onClick={() => jumpTo(shiftLocalDay(value, -1))}>−1 day</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp - 60 * MINUTE))}>−1h</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp - 30 * MINUTE))}>−30m</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp - 5 * MINUTE))}>−5m</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp + 5 * MINUTE))}>+5m</Chip>
            <Chip onClick={() => jumpTo(shiftLocalDay(value, 1))}>+1 day</Chip>
            <Chip onClick={() => jumpTo(base)}>Reset</Chip>
          </div>
        </div>
      )}
    </div>
  );
}

const TimeTicks = memo(function TimeTicks({ anchor }: { anchor: number }) {
  return (
    <div className="flex" aria-hidden>
      {Array.from({ length: ENTRY_COUNT }, (_, i) => {
        const t = new Date(entryTime(i, anchor));
        const minutes = t.getMinutes();
        const isHour = minutes === 0;
        const midnight = isHour && t.getHours() === 0;
        return (
          <div
            key={i}
            className="flex shrink-0 snap-center flex-col items-center"
            style={{ width: ITEM_W }}
          >
            <div
              className="w-[2px] rounded bg-line"
              style={{ height: isHour ? 30 : minutes % 30 === 0 ? 22 : 14 }}
            />
            <div className="relative mt-1 h-7 w-full">
              {isHour && (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-center text-[10px] font-semibold text-muted">
                  {fmtClock(t)}
                  {midnight && <span className="block text-ink">{fmtDayLabel(t)}</span>}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

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
