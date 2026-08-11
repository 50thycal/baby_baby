"use client";

import { useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";
import type { SnapshotRow } from "@/lib/snapshot";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const REASON_LABEL: Record<string, string> = {
  first: "first backup",
  auto: "automatic",
  manual: "taken by hand",
  "pre-restore": "before a restore",
};

/**
 * Restore points.
 *
 * Restoring is itself destructive, so it takes two taps and says plainly what
 * it will do. The counts are shown per backup because "8 feeds" versus "31
 * feeds" is how you spot the one from before someone deleted half the log.
 */
export default function BackupSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();

  const load = async () => {
    try {
      const res = await fetch("/api/snapshots");
      if (!res.ok) throw new Error("Couldn't load backups");
      setRows(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load backups");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const backUpNow = async () => {
    setBusy(true);
    try {
      await send("POST", "/api/snapshots");
      notify("Backup taken");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Backup failed", "bad");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    setBusy(true);
    try {
      const counts = (await send("POST", `/api/snapshots/${id}/restore`)) as {
        feedings: number;
      };
      notify(`Restored — ${counts.feedings} feeds back`);
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Restore failed", "bad");
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} title="Backups">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-snug text-muted">
          A copy is kept automatically about once an hour, whenever something has
          changed. Restoring puts everything back to that moment — and takes a
          backup of right now first, so it can be undone.
        </p>

        <button
          type="button"
          onClick={backUpNow}
          disabled={busy}
          className="panel press h-12 rounded-full text-[15px] font-medium disabled:opacity-60"
        >
          Back up now
        </button>

        {error && (
          <p className="rounded-2xl bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {!rows && !error && <div className="h-32 animate-pulse rounded-[18px] bg-sunk" />}
        {rows?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted">
            No backups yet — one is taken the first time anything is logged.
          </p>
        )}

        {rows?.map((row) => {
          const when = new Date(row.taken_at);
          const isConfirming = confirming === row.id;
          return (
            <div key={row.id} className="panel flex flex-col gap-2 rounded-[18px] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-medium">
                  {when.toLocaleString([], {
                    month: "numeric",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  {REASON_LABEL[row.reason] ?? row.reason}
                </span>
              </div>

              <div className="text-[13px] tabular-nums text-muted">
                {plural(row.counts.feedings, "feed")} · {plural(row.counts.sleep, "sleep")} ·{" "}
                {plural(row.counts.diapers, "diaper")} · {plural(row.counts.comments, "note")}
                {/* Backups taken before moments existed have no count for them;
                    printing "undefined marks" would be worse than saying nothing. */}
                {row.counts.moments > 0 && ` · ${plural(row.counts.moments, "mark")}`}
              </div>

              {isConfirming ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={busy}
                    className="press h-11 flex-1 rounded-full bg-sunk text-[15px] font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => restore(row.id)}
                    disabled={busy}
                    className="press h-11 flex-1 rounded-full bg-danger text-[15px] font-medium text-white disabled:opacity-60"
                  >
                    Replace everything
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <a
                    href={`/api/snapshots/${row.id}?download=1`}
                    className="press flex h-11 flex-1 items-center justify-center rounded-full bg-sunk text-[15px] font-medium text-muted"
                  >
                    Download
                  </a>
                  <button
                    type="button"
                    onClick={() => setConfirming(row.id)}
                    className="press h-11 flex-1 rounded-full bg-sunk text-[15px] font-medium"
                  >
                    Restore
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
