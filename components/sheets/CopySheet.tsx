"use client";

import { useState } from "react";
import Sheet from "@/components/Sheet";
import { useToast } from "@/components/Toaster";
import { buildExport, copyText } from "@/lib/export";
import type { EventsPayload, Weight } from "@/lib/types";

/**
 * How much history to copy. A shorter list than the timeline's range buttons,
 * and worded as sentences rather than chips — you pick this once, deliberately,
 * rather than flicking between them.
 */
const SPANS = [
  { key: "24h", label: "Last 24 hours" },
  { key: "3d", label: "Last 3 days" },
  { key: "1w", label: "Last week" },
  { key: "all", label: "Everything" },
] as const;

export default function CopySheet({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const notify = useToast();

  const copy = async (span: string) => {
    setBusy(span);
    try {
      // Weights come from their own endpoint — they belong to no range, so
      // they'd be missing from a 24h export exactly when they matter most.
      const [res, weightRes] = await Promise.all([
        fetch(`/api/events?range=${span}`),
        fetch("/api/weights"),
      ]);
      if (!res.ok) throw new Error("Couldn't load the data");
      const data = (await res.json()) as EventsPayload;
      const weights = weightRes.ok ? ((await weightRes.json()) as Weight[]) : [];

      const text = buildExport(data, weights);
      await copyText(text);

      const feeds = data.feedings.length;
      notify(feeds ? `Copied ${feeds} feeds` : "Copied — nothing in that period");
      onClose();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't copy", "bad");
      setBusy(null);
    }
  };

  return (
    <Sheet onClose={onClose} title="Copy data">
      <div className="flex flex-col gap-2">
        <p className="mb-1 text-[13px] leading-snug text-muted">
          Copies a compact text log — feeds, sleep and diapers by day. Notes are
          left out. Paste it anywhere you want to look at the numbers.
        </p>

        {SPANS.map((span) => (
          <button
            key={span.key}
            type="button"
            onClick={() => copy(span.key)}
            disabled={busy !== null}
            className="panel press h-14 rounded-full text-[15px] font-medium disabled:opacity-60"
          >
            {busy === span.key ? "Copying…" : span.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
