"use client";

import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { fmtKg, gramsFromOunces, OUNCES_PER_POUND, ouncesFromGrams, splitOunces } from "@/lib/weight";
import type { Weight } from "@/lib/types";

const ACCENT = "var(--c-weight)";

/**
 * The one weigh-in that happened before the app existed.
 *
 * Everything else in this app is entered one-handed in the dark, which is why
 * the weight wheel is a wheel. This isn't that: it's a number being copied off
 * a hospital band, weeks after the fact, sitting down. So it takes typed
 * fields, and a typed date rather than the ±hours time wheel — the wheel can't
 * reach back three weeks, and a date picker would be silly for a date you
 * already know by heart.
 *
 * It's stored as an ordinary weight. A birth weight *is* a weigh-in, it just
 * happens to be the first one, and filing it as one means the weight chart
 * starts its arc where the baby did.
 */
export default function BirthWeightSheet({
  onClose,
  existing,
}: {
  onClose: () => void;
  /** The row flagged as the birth weight, if one has been entered. */
  existing: Weight | null;
}) {
  const start = existing ? splitOunces(ouncesFromGrams(existing.weight_g)) : null;

  const [date, setDate] = useState(existing ? isoDay(new Date(existing.ts)) : "");
  const [lb, setLb] = useState(start ? String(start.lb) : "");
  const [oz, setOz] = useState(start ? String(start.oz) : "");
  const notify = useToast();

  const pounds = Number(lb || 0);
  const ounces = Number(oz || 0);
  const totalOunces = pounds * OUNCES_PER_POUND + ounces;
  const grams = gramsFromOunces(totalOunces);

  const today = isoDay(new Date());
  const dateOk = date !== "" && date <= today;
  const weightOk = totalOunces > 0 && ounces < OUNCES_PER_POUND;
  const ready = dateOk && weightOk;

  return (
    <Sheet onClose={onClose} title="Birth weight" accent={ACCENT}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Day she was born
          </span>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value)}
            className="h-14 w-full rounded-[8px] border-2 border-line bg-card px-3 text-[17px] tabular-nums"
            style={{ color: "var(--c-ink)" }}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            What she weighed
          </span>
          <div className="flex items-center gap-2">
            <NumberField value={lb} onChange={setLb} unit="lb" max={40} />
            <NumberField value={oz} onChange={setOz} unit="oz" max={15} />
          </div>
        </div>

        <p className="min-h-5 text-center text-[13px] text-muted">
          {totalOunces > 0 && weightOk ? fmtKg(grams) : " "}
        </p>

        <ConfirmButton
          label={existing ? "Update birth weight" : "Save birth weight"}
          accent={ACCENT}
          disabled={!ready}
          onConfirm={async () => {
            // Noon, not midnight: a date entered as a plain day becomes a
            // timestamp, and midnight is the one moment where an hour of drift
            // lands it on the day before.
            const ts = new Date(`${date}T12:00:00`);
            if (existing) {
              await send("PATCH", `/api/weights/${existing.id}`, {
                weight_g: grams,
                ts: ts.toISOString(),
              });
            } else {
              await send("POST", "/api/weights", {
                weight_g: grams,
                ts: ts.toISOString(),
                is_birth: true,
              });
            }
            notify(existing ? "Birth weight updated" : "Birth weight logged");
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}

/** yyyy-mm-dd in local time — what `<input type="date">` speaks. */
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function NumberField({
  value,
  onChange,
  unit,
  max,
}: {
  value: string;
  onChange: (next: string) => void;
  unit: string;
  max: number;
}) {
  return (
    <span className="flex flex-1 items-baseline gap-2 rounded-[8px] border-2 border-line bg-card px-3">
      <input
        // `inputMode` rather than `type="number"`: a numeric keypad without the
        // spinner arrows, which are useless at this size and steal the tap.
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder="0"
        aria-label={unit === "lb" ? "Pounds" : "Ounces"}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          if (digits === "" || Number(digits) <= max) onChange(digits);
        }}
        className="h-14 w-full min-w-0 bg-transparent text-[26px] font-semibold tabular-nums outline-none"
      />
      <span className="text-[13px] font-medium text-muted">{unit}</span>
    </span>
  );
}
