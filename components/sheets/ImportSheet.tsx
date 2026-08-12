"use client";

import { useMemo, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import { parseImport, summarise } from "@/lib/import-parse";

const PLACEHOLDER = `8/6  2:00am  20
8/6  5:00am  20
8/6  7:36am  diaper pee`;

/**
 * Types up a paper log in one go.
 *
 * Nothing is written until the parse is shown back: how many feeds, how much
 * milk, split by day. Transcribing handwriting is error-prone enough that a
 * silent import of forty rows is worse than no import at all — the preview is
 * the point, not decoration.
 */
export default function ImportSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const notify = useToast();

  // Re-parsed on every keystroke; the input is small and this keeps the preview
  // honest while errors are being fixed.
  const { entries, errors } = useMemo(() => parseImport(text), [text]);
  const days = useMemo(() => summarise(entries), [entries]);

  const feedings = entries.filter((e) => e.kind === "feeding");
  const diapers = entries.filter((e) => e.kind === "diaper");
  const totalMl = feedings.reduce((sum, e) => sum + (e.kind === "feeding" ? e.amount_ml : 0), 0);

  return (
    <Sheet onClose={onClose} title="Import">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-muted">
          One entry per line: <span className="text-ink">date, time, amount</span>. Times are read in
          this phone&apos;s timezone. Re-importing the same rows won&apos;t duplicate them.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          autoFocus
          spellCheck={false}
          className="w-full resize-y rounded-[10px] bg-sunk p-4 font-mono text-[15px] leading-relaxed outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/20"
        />

        {text.trim() && (
          <div className="flex flex-col gap-2 rounded-[10px] border border-line p-3">
            <div className="flex items-baseline justify-between text-[15px]">
              <span className="font-medium">
                {feedings.length} feed{feedings.length === 1 ? "" : "s"}
                {diapers.length > 0 && ` · ${diapers.length} diaper${diapers.length === 1 ? "" : "s"}`}
              </span>
              <span className="tabular-nums text-muted">{totalMl} mL</span>
            </div>

            {days.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {days.map((d) => (
                  <div
                    key={d.label}
                    className="flex justify-between text-[13px] tabular-nums text-muted"
                  >
                    <span>{d.label}</span>
                    <span>
                      {d.feeds > 0 && `${d.feeds} feed${d.feeds === 1 ? "" : "s"} · ${d.ml} mL`}
                      {d.feeds > 0 && d.diapers > 0 && " · "}
                      {d.diapers > 0 && `${d.diapers} diaper${d.diapers === 1 ? "" : "s"}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {errors.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-line pt-2">
                {errors.map((e) => (
                  <div key={e.line} className="text-[13px] leading-snug text-danger">
                    <span className="tabular-nums opacity-70">line {e.line}</span> — {e.message}
                    <span className="block truncate font-mono text-[12px] opacity-60">{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ConfirmButton
          label={
            errors.length > 0
              ? `Fix ${errors.length} line${errors.length === 1 ? "" : "s"} first`
              : `Import ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`
          }
          accent="var(--c-feed)"
          disabled={entries.length === 0 || errors.length > 0}
          onConfirm={async () => {
            const result = (await send("POST", "/api/import", {
              feedings: feedings.map((e) => ({
                amount_ml: e.kind === "feeding" ? e.amount_ml : 0,
                ts: e.ts.toISOString(),
              })),
              diapers: diapers.map((e) => ({
                type: e.kind === "diaper" ? e.type : "pee",
                ts: e.ts.toISOString(),
              })),
            })) as { feedings: number; diapers: number; skipped: number };

            const added = result.feedings + result.diapers;
            notify(
              result.skipped > 0
                ? `Imported ${added} · ${result.skipped} already there`
                : `Imported ${added}`,
            );
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}
