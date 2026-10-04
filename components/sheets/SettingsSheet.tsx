"use client";

import Sheet from "@/components/Sheet";
import { VersionLabel } from "@/components/VersionBar";

type Errand = "import" | "backups" | "birth";

/**
 * The rare errands, in one place.
 *
 * Each row hands off to the sheet that already does the job rather than
 * duplicating it: this is a menu, not a second copy of the import or restore
 * flows. Picking one swaps this sheet for that one, so there's never a sheet
 * stacked on a sheet.
 */
export default function SettingsSheet({
  onClose,
  onPick,
  birthWeight,
}: {
  onClose: () => void;
  onPick: (errand: Errand) => void;
  /** Formatted, once it's on file — both a receipt and the way in to fix it. */
  birthWeight: string | null;
}) {
  return (
    <Sheet onClose={onClose} title="Settings">
      <div className="flex flex-col gap-2">
        <Row
          label="Import from a paper log"
          hint="Paste a written log and check it before it's saved"
          onClick={() => onPick("import")}
        />
        <Row
          label="Backups"
          hint="Restore points, and taking one now"
          onClick={() => onPick("backups")}
        />
        <Row
          label="Birth weight"
          hint={birthWeight ?? "Not on file yet"}
          onClick={() => onPick("birth")}
        />
      </div>

      <VersionLabel className="mt-5" />
    </Sheet>
  );
}

function Row({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full items-center justify-between gap-3 rounded-[10px] border-2 border-line bg-card px-4 py-3 text-left"
    >
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="truncate text-[12px] text-muted">{hint}</span>
      </span>
      <span aria-hidden className="text-muted">
        ›
      </span>
    </button>
  );
}
