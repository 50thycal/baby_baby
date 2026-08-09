"use client";

import { useState } from "react";
import { thud } from "@/lib/haptics";

type Props = {
  label: string;
  accent: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
};

/** The single large commit control every sheet ends with. */
export default function ConfirmButton({ label, accent, onConfirm, disabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    thud();
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      {error && (
        <p className="mb-2 rounded-2xl bg-danger-wash px-4 py-3 text-center text-sm font-semibold text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="press h-16 w-full rounded-3xl text-xl font-bold tracking-wide disabled:opacity-60"
        style={{ background: accent, color: "#fff" }}
      >
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}
