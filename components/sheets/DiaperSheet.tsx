"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { DIAPER_EMOJI, DIAPER_LABEL, DIAPER_TYPES, type DiaperType } from "@/lib/types";

export default function DiaperSheet({ onClose }: { onClose: () => void }) {
  const base = useRef(new Date()).current;
  const [type, setType] = useState<DiaperType | null>(null);
  const [ts, setTs] = useState(base);
  const notify = useToast();

  return (
    <Sheet onClose={onClose} title="Diaper" accent="var(--c-diaper)">
      <DiaperPicker
        value={type}
        onChange={(next) => {
          tick();
          setType(next);
        }}
      />

      {type && (
        <div className="animate-pop mt-3 flex flex-col items-center gap-2">
          <TimeField value={ts} onChange={setTs} base={base} accent="var(--c-diaper)" />
          <div className="mt-1 w-full">
            <ConfirmButton
              label="Confirm"
              accent="var(--c-diaper)"
              onConfirm={async () => {
                await send("POST", "/api/diapers", { type, ts: ts.toISOString() });
                notify(`Logged ${DIAPER_LABEL[type]}`);
                onClose();
              }}
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function DiaperPicker({
  value,
  onChange,
}: {
  value: DiaperType | null;
  onChange: (next: DiaperType) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {DIAPER_TYPES.map((t) => {
        const selected = value === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            aria-pressed={selected}
            className="press flex h-28 flex-col items-center justify-center gap-1.5 rounded-[18px] border transition-colors"
            style={{
              background: selected ? "var(--c-diaper)" : "var(--c-diaper-wash)",
              borderColor: selected ? "var(--c-diaper)" : "transparent",
              color: selected ? "#fff" : "var(--c-diaper-ink)",
            }}
          >
            <span className="text-3xl leading-none" aria-hidden>
              {DIAPER_EMOJI[t]}
            </span>
            <span className="px-2 text-center text-[15px] font-medium leading-tight">
              {DIAPER_LABEL[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
