"use client";

import { memo, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import EntryContext from "@/components/EntryContext";
import { SheetTimeContext } from "@/components/Sheet";
import { useEventWindow } from "@/lib/api";
import {
  ENTRY_COUNT,
  ENTRY_ITEM_WIDTH as ITEM_W,
  ENTRY_SPAN,
  ENTRY_STEP,
  entryAnchor,
  entryIndex,
  entryTime,
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

/** A full day in either direction, with the original fine-adjustment chips. */
export default function TimeField({
  value,
  onChange,
  base,
  accent,
  label,
  initiallyOpen = false,
}: Props) {
  const [localOpen, setLocalOpen] = useState(initiallyOpen);
  const group = useContext(SheetTimeContext);
  const id = useId();
  const setActive = group?.setActive;
  const open = group ? group.active === id : localOpen;
  useLayoutEffect(() => {
    if (initiallyOpen) setActive?.(id);
  }, [initiallyOpen, setActive, id]);
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
    <div className="time-field w-full min-w-0" data-time-open={open}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${label ?? "Event time"}: ${fmtDayLabel(value)} ${fmtClock(value)}`}
        onClick={() => {
          if (group) group.setActive(open ? null : id);
          else setLocalOpen((v) => !v);
          tick();
        }}
        className="time-header press mx-auto flex w-full flex-col items-center rounded-[10px] px-4 py-2"
        style={{ background: open ? "var(--c-sunk)" : "transparent" }}
      >
        {label && (
          <span className="time-label text-[10px] leading-3 font-medium uppercase tracking-[0.16em] text-muted">
            {label}
          </span>
        )}
        <span className="time-clock flex items-baseline gap-2">
          <span className="time-value text-xl font-semibold tabular-nums">{fmtClock(value)}</span>
          <span aria-hidden style={{ color: accent ?? "var(--c-muted)" }}>
            {open ? "▾" : "▸"}
          </span>
        </span>
        <span className="time-date text-[11px] font-medium leading-4 text-muted">
          {fmtDayLabel(value)} · {fmtAgo(value)}
        </span>
      </button>

      {open && (
        <div className="mt-1">
          <div className="mb-1 flex justify-center gap-4 text-[10px] font-semibold" aria-hidden>
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
                  <div className="h-[62px]" />
                )}
                <TimeTicks anchor={anchor} />
              </div>
              <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
            </div>
          </div>
          <p
            role="status"
            className="time-detail min-h-4 text-center text-[10px] leading-3 text-muted"
          >
            {error
              ? "History couldn’t load. You can still set the time."
              : isLoading
                ? "Loading nearby logs…"
                : detail || "Scroll to set the time · tap a log for details"}
          </p>
          <div className="mt-1 grid grid-cols-5 gap-1">
            <Chip onClick={() => jumpTo(new Date(timestamp - 60 * MINUTE))}>−1h</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp - 30 * MINUTE))}>−30m</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp - 5 * MINUTE))}>−5m</Chip>
            <Chip onClick={() => jumpTo(new Date(timestamp + 5 * MINUTE))}>+5m</Chip>
            <Chip onClick={() => jumpTo(base)}>⟲</Chip>
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
              style={{ height: isHour ? 16 : minutes % 30 === 0 ? 12 : 8 }}
            />
            <div className="relative mt-0.5 h-5 w-full">
              {isHour && (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-center text-[10px] leading-[10px] font-semibold text-muted">
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
      aria-label={children === "⟲" ? "Reset time" : undefined}
      className="press h-10 min-w-0 rounded-[8px] bg-sunk px-1 text-sm font-medium text-muted"
    >
      {children}
    </button>
  );
}
