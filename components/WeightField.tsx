"use client";

import { useEffect, useRef } from "react";
import { tick } from "@/lib/haptics";
import { MAX_OUNCES, OUNCES_PER_POUND, splitOunces } from "@/lib/weight";

type Props = {
  /** Total ounces. The only unit this component thinks in. */
  value: number;
  onChange: (next: number) => void;
  accent?: string;
};

const ITEM_W = 20;
const COUNT = MAX_OUNCES + 1;

/**
 * Scrub the wheel to a weight, exactly the way you scrub the time wheel.
 *
 * One wheel in ounce detents rather than separate pounds and ounces controls:
 * a weigh-in moves by a few ounces at a time, so the useful gesture is a nudge,
 * and two fields would mean choosing which one to nudge. The pound boundaries
 * are labelled so the scale is still readable at a glance, and the chips cover
 * the bigger jumps the way they do for time.
 *
 * The range is absolute — nought to forty pounds — rather than a window around
 * the current value. A window would be shorter to scroll but could put a
 * premature 3 lb, or a toddler, out of reach entirely.
 */
export default function WeightField({ value, onChange, accent }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const lastIndex = useRef(-1);
  /**
   * A programmatic smooth scroll fires a burst of scroll events on its way to
   * the target. Letting those through would walk the value through every
   * position in between, so a second chip tap mid-animation would start from
   * whatever the animation happened to be passing at the time — tap "+1 oz"
   * twice quickly and get one ounce.
   */
  const gliding = useRef(false);
  const glideTo = useRef(0);
  const glideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { lb, oz } = splitOunces(value);

  useEffect(() => () => { if (glideTimer.current) clearTimeout(glideTimer.current); }, []);

  // Centre on the current value once, on mount. Re-centring on every change
  // would fight the finger that's mid-scroll.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    lastIndex.current = value;
    el.scrollLeft = value * ITEM_W;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (gliding.current) {
      // Arrived — hand control back to the finger.
      if (Math.abs(el.scrollLeft - glideTo.current * ITEM_W) < 1) gliding.current = false;
      return;
    }
    const index = Math.min(COUNT - 1, Math.max(0, Math.round(el.scrollLeft / ITEM_W)));
    if (index === lastIndex.current) return;
    lastIndex.current = index;
    tick();
    onChange(index);
  };

  const jumpTo = (next: number) => {
    const index = Math.min(MAX_OUNCES, Math.max(0, next));
    lastIndex.current = index;
    glideTo.current = index;
    gliding.current = true;
    // A backstop, in case the target is already the scroll position and no
    // scroll event ever arrives to clear the flag.
    if (glideTimer.current) clearTimeout(glideTimer.current);
    glideTimer.current = setTimeout(() => { gliding.current = false; }, 600);
    onChange(index);
    scroller.current?.scrollTo({ left: index * ITEM_W, behavior: "smooth" });
    tick();
  };

  /**
   * Chips step from the wheel's own position rather than the `value` prop, so
   * two quick taps compound even though React hasn't re-rendered between them.
   */
  const step = (by: number) => jumpTo((lastIndex.current < 0 ? value : lastIndex.current) + by);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="text-5xl font-semibold tabular-nums tracking-[-0.02em]">{lb}</span>
        <span className="text-lg font-medium text-muted">lb</span>
        <span className="ml-2 text-5xl font-semibold tabular-nums tracking-[-0.02em]">{oz}</span>
        <span className="text-lg font-medium text-muted">oz</span>
      </div>

      <div className="relative mt-2">
        <div
          className="pointer-events-none absolute left-1/2 top-1 z-10 h-9 w-[3px] -translate-x-1/2 rounded-full"
          style={{ background: accent ?? "var(--c-ink)" }}
        />
        <div
          ref={scroller}
          onScroll={onScroll}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain pb-1"
          style={{ scrollSnapType: "x mandatory" }}
          role="group"
          aria-label={`Weight, ${lb} pounds ${oz} ounces`}
        >
          <div className="shrink-0" style={{ width: `calc(50% - ${ITEM_W / 2}px)` }} />
          {Array.from({ length: COUNT }, (_, i) => {
            const isPound = i % OUNCES_PER_POUND === 0;
            const isHalf = i % (OUNCES_PER_POUND / 2) === 0;
            return (
              <div
                key={i}
                className="flex shrink-0 snap-center flex-col items-center"
                style={{ width: ITEM_W }}
              >
                <div
                  className="w-[2px] rounded-full bg-line"
                  style={{ height: isPound ? 30 : isHalf ? 22 : 14 }}
                />
                {/* Absolute so a label can overhang its 20px detent. */}
                <div className="relative mt-1 h-4 w-full">
                  {isPound && (
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-muted">
                      {i / OUNCES_PER_POUND}
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
        <Chip onClick={() => step(-OUNCES_PER_POUND)}>−1 lb</Chip>
        <Chip onClick={() => step(-1)}>−1 oz</Chip>
        <Chip onClick={() => step(1)}>+1 oz</Chip>
        <Chip onClick={() => step(OUNCES_PER_POUND)}>+1 lb</Chip>
      </div>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press h-10 min-w-14 rounded-full bg-sunk px-3 text-sm font-medium text-muted"
    >
      {children}
    </button>
  );
}
