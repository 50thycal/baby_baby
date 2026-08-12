"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import MomentSheet from "@/components/sheets/MomentSheet";
import { MomentIcon, MoonIcon } from "@/components/icons";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { fmtClock, fmtDuration } from "@/lib/time";
import type { SleepSession } from "@/lib/types";

type Props = {
  onClose: () => void;
  /** The session in progress, if the baby is already down. */
  active: SleepSession | null;
};

export default function SleepSheet({ onClose, active }: Props) {
  const base = useRef(new Date()).current;
  const [ts, setTs] = useState(base);
  const [fussy, setFussy] = useState(false);
  const notify = useToast();

  const start = active ? new Date(active.sleep_start) : null;
  const wouldBeNegative = start !== null && ts.getTime() <= start.getTime();

  return (
    <Sheet onClose={onClose} title={active ? "Wake up" : "Sleep"} accent="var(--c-sleep)">
      <div className="flex flex-col items-center gap-2">
        {active && start ? (
          <div className="mb-1 flex flex-col items-center">
            <div className="text-5xl font-semibold tabular-nums tracking-[-0.01em] text-sleep">
              {fmtDuration(Math.max(0, ts.getTime() - start.getTime()))}
            </div>
            <div className="mt-1 text-sm font-medium text-muted">
              asleep since {fmtClock(start)}
            </div>
          </div>
        ) : (
          <div className="mb-1" aria-hidden>
            <MoonIcon size={64} />
          </div>
        )}

        <TimeField
          value={ts}
          onChange={setTs}
          base={base}
          accent="var(--c-sleep)"
          label={active ? "Woke up" : "Fell asleep"}
        />

        <div className="mt-2 w-full">
          <ConfirmButton
            label={active ? "Baby's Awake" : "Start Sleep"}
            accent="var(--c-sleep)"
            disabled={wouldBeNegative}
            onConfirm={async () => {
              if (active) {
                await send("PATCH", `/api/sleep/${active.id}`, { sleep_end: ts.toISOString() });
                notify(`Slept ${fmtDuration(ts.getTime() - new Date(active.sleep_start).getTime())}`);
              } else {
                await send("POST", "/api/sleep", { sleep_start: ts.toISOString() });
                notify("Sleep started");
              }
              onClose();
            }}
          />
          {wouldBeNegative && (
            <p className="mt-2 text-center text-sm font-medium text-danger">
              Wake-up time has to be after {fmtClock(start!)}
            </p>
          )}
        </div>

        {/* Fussiness belongs to the sleep story rather than the feeding one, so
            it hangs off this sheet — its own event, with its own time. */}
        <button
          type="button"
          onClick={() => setFussy(true)}
          className="press mt-1 px-3 py-1 text-[13px] text-muted underline underline-offset-4"
        >
          <span className="flex items-center justify-center gap-2">
            <MomentIcon kind="fussy" size={18} /> Log fussy fussy
          </span>
        </button>
      </div>

      {fussy && <MomentSheet kind="fussy" onClose={() => setFussy(false)} />}
    </Sheet>
  );
}
