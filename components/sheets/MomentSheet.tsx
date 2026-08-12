"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { MomentIcon } from "@/components/icons";
import { MOMENT_ACCENT, MOMENT_LABEL, type MomentKind } from "@/lib/types";

/**
 * Logging a thing that just happened, with no size to it.
 *
 * Deliberately the same shape as every other sheet — a big obvious control,
 * the time wheel, one confirm — because the only question worth asking is
 * "roughly when", and asking it the familiar way means nobody has to learn
 * anything new at 3am.
 */
export default function MomentSheet({
  kind,
  onClose,
}: {
  kind: MomentKind;
  onClose: () => void;
}) {
  const base = useRef(new Date()).current;
  const [ts, setTs] = useState(base);
  const notify = useToast();
  const accent = MOMENT_ACCENT[kind];

  return (
    <Sheet onClose={onClose} title={MOMENT_LABEL[kind]} accent={accent}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-[8px]"
          style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)` }}
          aria-hidden
        >
          <MomentIcon kind={kind} size={64} />
        </div>
        <p className="text-center text-[13px] text-muted">
          Just the time — no amount to record.
        </p>

        <TimeField value={ts} onChange={setTs} base={base} accent={accent} label="When" />

        <div className="mt-1 w-full">
          <ConfirmButton
            label={`Log ${MOMENT_LABEL[kind].toLowerCase()}`}
            accent={accent}
            onConfirm={async () => {
              await send("POST", "/api/moments", { kind, ts: ts.toISOString() });
              notify(`${MOMENT_LABEL[kind]} logged`);
              onClose();
            }}
          />
        </div>
      </div>
    </Sheet>
  );
}
