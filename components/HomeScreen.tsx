"use client";

import { useState } from "react";
import BackupSheet from "@/components/sheets/BackupSheet";
import DiaperSheet from "@/components/sheets/DiaperSheet";
import FeedSheet from "@/components/sheets/FeedSheet";
import ImportSheet from "@/components/sheets/ImportSheet";
import SleepSheet from "@/components/sheets/SleepSheet";
import { useHomeState } from "@/lib/api";
import { useNow } from "@/lib/useNow";
import { fmtAgo, fmtDuration } from "@/lib/time";
import { DIAPER_EMOJI, DIAPER_SHORT, type HomeState } from "@/lib/types";

type Which = "feed" | "sleep" | "diaper" | "import" | "backups" | null;

export default function HomeScreen() {
  const { data, error } = useHomeState();
  const [open, setOpen] = useState<Which>(null);
  const now = useNow(15_000);

  const asleep = data?.activeSleep ?? null;
  const close = () => setOpen(null);

  return (
    <div className="flex h-full flex-col gap-4 px-5 pb-4">
      <StatusStrip state={data} now={now} error={!!error} />

      <div className="flex flex-1 flex-col gap-3">
        <ActionTile
          label="FEED"
          emoji="🍼"
          accent="var(--c-feed)"
          wash="var(--c-feed-wash)"
          ink="var(--c-feed-ink)"
          detail={data?.lastFeeding ? `last ${data.lastFeeding.amount_ml} mL` : undefined}
          onClick={() => setOpen("feed")}
        />

        {asleep ? (
          <ActionTile
            label="SLEEPING"
            emoji="😴"
            accent="var(--c-sleep)"
            wash="var(--c-sleep)"
            ink="#fff"
            filled
            detail={`${fmtDuration(now.getTime() - new Date(asleep.sleep_start).getTime())} · tap when she's up`}
            onClick={() => setOpen("sleep")}
          />
        ) : (
          <ActionTile
            label="SLEEP"
            emoji="🌙"
            accent="var(--c-sleep)"
            wash="var(--c-sleep-wash)"
            ink="var(--c-sleep-ink)"
            detail={
              data?.lastSleep?.sleep_end
                ? `awake ${fmtDuration(now.getTime() - new Date(data.lastSleep.sleep_end).getTime())}`
                : undefined
            }
            onClick={() => setOpen("sleep")}
          />
        )}

        <ActionTile
          label="DIAPER"
          emoji="🧷"
          accent="var(--c-diaper)"
          wash="var(--c-diaper-wash)"
          ink="var(--c-diaper-ink)"
          detail={data?.lastDiaper ? `last ${DIAPER_SHORT[data.lastDiaper.type]}` : undefined}
          onClick={() => setOpen("diaper")}
        />
      </div>

      {/* Deliberately small and quiet: both are rare, deliberate errands and
          must never compete with the three things done at 3am. */}
      <div className="-mt-1 flex items-center justify-center gap-1 text-[13px] text-muted">
        <button
          type="button"
          onClick={() => setOpen("import")}
          className="press px-3 py-1 underline underline-offset-4"
        >
          Import from a paper log
        </button>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => setOpen("backups")}
          className="press px-3 py-1 underline underline-offset-4"
        >
          Backups
        </button>
      </div>

      {open === "feed" && (
        <FeedSheet onClose={close} defaultAmount={data?.lastFeeding?.amount_ml ?? 60} />
      )}
      {open === "sleep" && <SleepSheet onClose={close} active={asleep} />}
      {open === "diaper" && <DiaperSheet onClose={close} />}
      {open === "import" && <ImportSheet onClose={close} />}
      {open === "backups" && <BackupSheet onClose={close} />}
    </div>
  );
}

/** Three quiet lines of context. Never more than three. */
function StatusStrip({
  state,
  now,
  error,
}: {
  state: HomeState | undefined;
  now: Date;
  error: boolean;
}) {
  if (error) {
    return (
      <p className="rounded-2xl bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
        Can&apos;t reach the database right now.
      </p>
    );
  }
  if (!state) {
    return <div className="h-[76px] animate-pulse rounded-2xl bg-sunk" />;
  }

  const asleep = state.activeSleep;
  return (
    <div className="flex flex-col gap-1.5 text-[15px]">
      <StatusLine
        label="Last feeding"
        value={
          state.lastFeeding
            ? `${fmtAgo(state.lastFeeding.ts, now)} — ${state.lastFeeding.amount_ml} mL`
            : "nothing logged yet"
        }
      />
      <StatusLine
        label="Baby"
        value={
          asleep
            ? `Sleeping — ${fmtDuration(now.getTime() - new Date(asleep.sleep_start).getTime())}`
            : "Awake"
        }
        accent={asleep ? "var(--c-sleep)" : undefined}
      />
      <StatusLine
        label="Last diaper"
        value={
          state.lastDiaper
            ? `${fmtAgo(state.lastDiaper.ts, now)} — ${DIAPER_EMOJI[state.lastDiaper.type]} ${DIAPER_SHORT[state.lastDiaper.type]}`
            : "nothing logged yet"
        }
      />
    </div>
  );
}

function StatusLine({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span
        className="truncate text-right font-medium"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function ActionTile({
  label,
  emoji,
  accent,
  wash,
  ink,
  detail,
  filled,
  onClick,
}: {
  label: string;
  emoji: string;
  accent: string;
  wash: string;
  ink: string;
  detail?: string;
  filled?: boolean;
  onClick: () => void;
}) {
  // The accent lives in the hairline itself rather than a stripe down the edge:
  // the reference separates everything with a border, never a shadow or a bar.
  return (
    <button
      type="button"
      onClick={onClick}
      className="press relative flex min-h-[104px] flex-1 items-center gap-4 overflow-hidden rounded-[20px] border px-6 text-left"
      style={{ background: wash, color: ink, borderColor: accent }}
    >
      <span className={`text-4xl leading-none ${filled ? "animate-breathe" : ""}`} aria-hidden>
        {emoji}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-3xl font-semibold tracking-[-0.01em]">{label}</span>
        {detail && <span className="truncate text-[13px] font-normal opacity-75">{detail}</span>}
      </span>
    </button>
  );
}
