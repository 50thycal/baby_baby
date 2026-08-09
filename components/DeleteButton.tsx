"use client";

import { useState } from "react";
import { thud } from "@/lib/haptics";

/**
 * Two-step delete. A stray thumb can reach the first tap; it can't reach the
 * second one, which appears somewhere else entirely.
 */
export default function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => {
          thud();
          setArmed(true);
        }}
        className="press h-12 w-full rounded-2xl text-base font-bold text-danger"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-danger-wash p-3">
      <p className="mb-2 text-center text-sm font-semibold text-danger">
        {error ?? "Delete this for good?"}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="press h-12 flex-1 rounded-2xl bg-card text-base font-bold"
        >
          Keep it
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onDelete();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't delete that");
              setBusy(false);
            }
          }}
          className="press h-12 flex-1 rounded-2xl bg-danger text-base font-bold text-white disabled:opacity-60"
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
