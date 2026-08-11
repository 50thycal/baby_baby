"use client";

import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import DeleteButton from "@/components/DeleteButton";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import WeightField from "@/components/WeightField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { fmtDayLabel } from "@/lib/time";
import {
  changeOunces,
  fmtKg,
  fmtOunceChange,
  fmtWeight,
  gramsFromOunces,
  ouncesFromGrams,
} from "@/lib/weight";
import type { Weight } from "@/lib/types";

const ACCENT = "var(--c-weight)";

/**
 * Every weigh-in, newest first, each one tappable.
 *
 * Weights don't sit on the timeline — they'd be a track that's empty six days
 * in seven — so this is the only route to fixing one. It has to exist: a weight
 * is typed by hand and read out loud later, which is exactly the sort of number
 * that gets a digit wrong.
 */
export default function WeightHistorySheet({ weights, onClose }: { weights: Weight[]; onClose: () => void }) {
  const [editing, setEditing] = useState<Weight | null>(null);

  // Newest first for reading; the change is against the entry before it in time.
  const rows = [...weights].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <Sheet onClose={onClose} title="Weigh-ins" accent={ACCENT}>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            Nothing weighed yet.
          </p>
        )}

        {rows.map((row, i) => {
          // rows are newest-first, so the earlier reading is the next one along.
          const earlier = rows[i + 1];
          const delta = earlier ? changeOunces(earlier.weight_g, row.weight_g) : null;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setEditing(row)}
              className="panel press flex items-baseline justify-between gap-3 rounded-[18px] px-4 py-3 text-left"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-[17px] font-semibold tabular-nums">
                  {fmtWeight(row.weight_g)}
                </span>
                <span className="text-[12px] text-muted">
                  {fmtDayLabel(new Date(row.ts))} · {fmtKg(row.weight_g)}
                </span>
              </span>
              {delta !== null && (
                <span
                  className="shrink-0 text-[13px] font-medium tabular-nums"
                  style={{ color: delta === 0 ? "var(--c-muted)" : ACCENT }}
                >
                  {fmtOunceChange(delta)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {editing && <EditWeight row={editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}

function EditWeight({ row, onClose }: { row: Weight; onClose: () => void }) {
  const original = new Date(row.ts);
  const [ounces, setOunces] = useState(ouncesFromGrams(row.weight_g));
  const [ts, setTs] = useState(original);
  const notify = useToast();

  return (
    <Sheet onClose={onClose} title="Edit weigh-in" accent={ACCENT}>
      <div className="flex flex-col items-center gap-2">
        <WeightField value={ounces} onChange={setOunces} accent={ACCENT} />
        <p className="text-[13px] text-muted">{fmtKg(gramsFromOunces(ounces))}</p>

        <TimeField value={ts} onChange={setTs} base={original} accent={ACCENT} label="Weighed" />

        <ConfirmButton
          label="Save"
          accent={ACCENT}
          onConfirm={async () => {
            await send("PATCH", `/api/weights/${row.id}`, {
              weight_g: gramsFromOunces(ounces),
              ts: ts.toISOString(),
            });
            notify("Weight updated");
            onClose();
          }}
        />
        <DeleteButton
          onDelete={async () => {
            await send("DELETE", `/api/weights/${row.id}`);
            notify("Weigh-in deleted");
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}
