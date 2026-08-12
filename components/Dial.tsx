"use client";

import { useCallback, useRef } from "react";
import { tick } from "@/lib/haptics";

type Props = {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
};

// A 270° gauge rather than a full circle: the gap at the bottom means you can
// never drag past 100 and wrap around to 0 by accident.
const SWEEP = 270;
const START = 135; // degrees clockwise from 3 o'clock
const SIZE = 260;
const R = 106;
const CENTER = SIZE / 2;

export default function Dial({ value, onChange, max = 100, step = 5 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lastValue = useRef(value);

  const frac = Math.min(1, Math.max(0, value / max));
  const knobAngle = ((START + SWEEP * frac) * Math.PI) / 180;
  const knobX = CENTER + R * Math.cos(knobAngle);
  const knobY = CENTER + R * Math.sin(knobAngle);

  const setFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * SIZE - CENTER;
      const y = ((clientY - rect.top) / rect.height) * SIZE - CENTER;

      const degrees = (Math.atan2(y, x) * 180) / Math.PI;
      const fromStart = (degrees - START + 720) % 360;

      let nextFrac: number;
      if (fromStart <= SWEEP) {
        nextFrac = fromStart / SWEEP;
      } else {
        // In the dead zone below the dial — clamp to whichever end is nearer.
        nextFrac = fromStart < SWEEP + (360 - SWEEP) / 2 ? 1 : 0;
      }

      const next = Math.round((nextFrac * max) / step) * step;
      if (next !== lastValue.current) {
        lastValue.current = next;
        tick();
        onChange(next);
      }
    },
    [max, step, onChange],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setFromPoint(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.buttons === 0 && e.pointerType === "mouse") return;
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setFromPoint(e.clientX, e.clientY);
  };

  const nudge = (delta: number) => {
    const next = Math.min(max, Math.max(0, value + delta));
    if (next === value) return;
    lastValue.current = next;
    tick();
    onChange(next);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="h-[260px] w-[260px] touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          role="slider"
          aria-label="Amount in millilitres"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
        >
          {/* Track */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke="var(--c-line)"
            strokeWidth={26}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="0.75 0.25"
            transform={`rotate(${START} ${CENTER} ${CENTER})`}
          />
          {/* Filled portion */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke="var(--c-feed)"
            strokeWidth={26}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${0.75 * frac} 1`}
            transform={`rotate(${START} ${CENTER} ${CENTER})`}
            style={{ transition: "stroke-dasharray 90ms linear" }}
          />
          {/* Detent marks every 10 mL */}
          {Array.from({ length: max / 10 + 1 }, (_, i) => {
            const a = ((START + (SWEEP * i) / (max / 10)) * Math.PI) / 180;
            const inner = R - 4;
            const outer = R + 4;
            return (
              <line
                key={i}
                x1={CENTER + inner * Math.cos(a)}
                y1={CENTER + inner * Math.sin(a)}
                x2={CENTER + outer * Math.cos(a)}
                y2={CENTER + outer * Math.sin(a)}
                stroke="var(--c-card)"
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.55}
              />
            );
          })}
          {/* Knob */}
          <circle
            cx={knobX}
            cy={knobY}
            r={17}
            fill="var(--c-card)"
            stroke="var(--c-feed)"
            strokeWidth={5}
            style={{ transition: "cx 90ms linear, cy 90ms linear" }}
          />
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[68px] font-semibold leading-none tabular-nums tracking-tight">
            {value}
          </div>
          <div className="mt-1 text-lg font-semibold text-muted">mL</div>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-3">
        <NudgeButton label="−5" onClick={() => nudge(-step)} disabled={value <= 0} />
        <NudgeButton label="+5" onClick={() => nudge(step)} disabled={value >= max} />
      </div>
    </div>
  );
}

function NudgeButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press h-12 w-20 rounded-[10px] bg-feed-wash text-lg font-medium text-feed-ink disabled:opacity-35"
    >
      {label}
    </button>
  );
}
