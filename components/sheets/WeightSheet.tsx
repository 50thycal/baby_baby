"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import WeightField from "@/components/WeightField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import {
  DEFAULT_OUNCES,
  fmtKg,
  fmtOunceChange,
  gramsFromOunces,
  ouncesFromGrams,
} from "@/lib/weight";
import type { Weight } from "@/lib/types";

const ACCENT = "var(--c-weight)";

/**
 * Logging a weigh-in.
 *
 * Opens on the last recorded weight rather than on nothing: babies are weighed
 * every week or two and move by ounces, so the previous figure is nearly always
 * within a nudge of the new one.
 */
export default function WeightSheet({
  onClose,
  previous,
}: {
  onClose: () => void;
  previous: Weight | null;
}) {
  const base = useRef(new Date()).current;
  const [ounces, setOunces] = useState(
    previous ? ouncesFromGrams(previous.weight_g) : DEFAULT_OUNCES,
  );
  const [ts, setTs] = useState(base);
  const notify = useToast();

  const grams = gramsFromOunces(ounces);
  const change = previous ? ounces - ouncesFromGrams(previous.weight_g) : null;

  return (
    <Sheet onClose={onClose} title="Weight" accent={ACCENT}>
      <div className="flex flex-col items-center gap-2">
        <WeightField value={ounces} onChange={setOunces} accent={ACCENT} />

        <p className="text-[13px] text-muted">
          {fmtKg(grams)}
          {change !== null && change !== 0 && (
            <> · {fmtOunceChange(change)} since last time</>
          )}
        </p>

        <TimeField value={ts} onChange={setTs} base={base} accent={ACCENT} label="Weighed" />

        <div className="mt-1 w-full">
          <ConfirmButton
            label="Save weight"
            accent={ACCENT}
            onConfirm={async () => {
              await send("POST", "/api/weights", {
                weight_g: grams,
                ts: ts.toISOString(),
              });
              notify("Weight logged");
              onClose();
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
