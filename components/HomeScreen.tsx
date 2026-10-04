"use client";

import { useState } from "react";
import BackupSheet from "@/components/sheets/BackupSheet";
import DiaperSheet from "@/components/sheets/DiaperSheet";
import FeedSheet from "@/components/sheets/FeedSheet";
import ImportSheet from "@/components/sheets/ImportSheet";
import SettingsSheet from "@/components/sheets/SettingsSheet";
import SleepSheet from "@/components/sheets/SleepSheet";
import CritterStrip from "@/components/Critters";
import { BottleIcon, MoonIcon, NappyIcon, ScaleIcon } from "@/components/icons";
import BirthWeightSheet from "@/components/sheets/BirthWeightSheet";
import WeightSheet from "@/components/sheets/WeightSheet";
import { useEvents, useHomeState, useWeights } from "@/lib/api";
import { fmtWeight } from "@/lib/weight";
import { nextFeedWindow, wakeWindow } from "@/lib/predict";
import { useNow } from "@/lib/useNow";
import { fmtAgo, fmtClock, fmtDuration } from "@/lib/time";
import { DIAPER_SHORT } from "@/lib/types";

type Which =
  | "feed"
  | "sleep"
  | "diaper"
  | "weight"
  | "birth"
  | "import"
  | "backups"
  | "settings"
  | null;

export default function HomeScreen() {
  const { data, error } = useHomeState();
  // A week of history, for the forecasts. Cheap: SWR shares it with the
  // dashboards, and the tiles render without waiting for it.
  const { data: history } = useEvents("1w");
  const { data: weights } = useWeights();
  const [open, setOpen] = useState<Which>(null);
  const now = useNow(15_000);

  const lastWeight = weights?.length ? weights[weights.length - 1] : null;
  const birthWeight = weights?.find((w) => w.is_birth) ?? null;

  const asleep = data?.activeSleep ?? null;
  const close = () => setOpen(null);

  // Each tile carries its own status. There used to be a strip of four lines
  // above them saying the same things a second time — "last 113 mL" under a
  // line reading "1h 47m ago — 113 mL" — so the facts now live once, on the
  // button you'd press about them. Until the state loads the tiles show no
  // detail at all, which is quieter than a placeholder that flickers.
  const nothingYet = data ? "nothing logged yet" : undefined;

  // Both forecasts return null until there's enough history to mean anything,
  // in which case their line simply isn't drawn.
  const feedWindow = history ? nextFeedWindow(history.feedings, now) : null;
  const wake = history && asleep ? wakeWindow(history.sleep, asleep, now) : null;

  return (
    <div className="flex h-full flex-col gap-4 px-5 pb-4">
      {error && (
        <p className="rounded-[10px] bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          Can&apos;t reach the database right now.
        </p>
      )}

      <div className="flex flex-1 flex-col gap-3">
        <ActionTile
          label="FEED"
          icon={<BottleIcon size={44} />}
          accent="var(--c-feed)"
          wash="var(--c-feed-wash)"
          ink="var(--c-feed-ink)"
          detail={
            data?.lastFeeding
              ? `${fmtAgo(data.lastFeeding.ts, now)} · ${data.lastFeeding.amount_ml} mL`
              : nothingYet
          }
          sub={
            feedWindow
              ? feedWindow.overdue
                ? `overdue · usually by ${fmtClock(feedWindow.to)}`
                : `next ${fmtClock(feedWindow.from)} – ${fmtClock(feedWindow.to)}`
              : undefined
          }
          onClick={() => setOpen("feed")}
        />

        {asleep ? (
          <ActionTile
            label="SLEEPING"
            icon={<MoonIcon size={44} zzz />}
            accent="var(--c-sleep)"
            wash="var(--c-sleep)"
            ink="#fff"
            filled
            detail={`asleep ${fmtDuration(now.getTime() - new Date(asleep.sleep_start).getTime())}${
              wake
                ? wake.overdue
                  ? " · a long one"
                  : ` · up ~${fmtClock(wake.from)}–${fmtClock(wake.to)}`
                : ""
            }`}
            sub="tap when she's up"
            onClick={() => setOpen("sleep")}
          />
        ) : (
          <ActionTile
            label="SLEEP"
            icon={<MoonIcon size={44} />}
            accent="var(--c-sleep)"
            wash="var(--c-sleep-wash)"
            ink="var(--c-sleep-ink)"
            detail={
              data?.lastSleep?.sleep_end
                ? `awake ${fmtDuration(now.getTime() - new Date(data.lastSleep.sleep_end).getTime())}`
                : nothingYet
            }
            onClick={() => setOpen("sleep")}
          />
        )}

        <ActionTile
          label="DIAPER"
          icon={<NappyIcon size={44} />}
          accent="var(--c-diaper)"
          wash="var(--c-diaper-wash)"
          ink="var(--c-diaper-ink)"
          detail={
            data?.lastDiaper
              ? `${fmtAgo(data.lastDiaper.ts, now)} · ${DIAPER_SHORT[data.lastDiaper.type]}`
              : nothingYet
          }
          onClick={() => setOpen("diaper")}
        />
      </div>

      {/* Weighing happens every week or two, not every two hours. A fourth tile
          would take a quarter of the screen from the three things actually done
          at 3am, so it gets a full-width row instead — unmistakably a button,
          plainly the junior one. */}
      <button
        type="button"
        onClick={() => setOpen("weight")}
        className="chunk press flex h-14 shrink-0 items-center justify-center gap-3 rounded-[8px] text-[15px] font-medium"
        style={{
          background: "var(--c-weight-wash)",
          color: "var(--c-weight-ink)",
        }}
      >
        <ScaleIcon size={26} />
        <span className="font-semibold uppercase tracking-[0.08em]">Weight</span>
        {lastWeight && (
          <span className="opacity-75">· {fmtWeight(lastWeight.weight_g)}</span>
        )}
      </button>

      <CritterStrip />

      {/* Import, backups and the birth weight are rare, deliberate errands —
          set up once, visited when something's gone wrong. They sit behind
          one quiet link so the screen used at 3am shows only what's done at
          3am. */}
      <div className="-mt-1 flex justify-center text-[13px] text-muted">
        <button type="button" onClick={() => setOpen("settings")} className="press px-2 py-1">
          <span aria-hidden>⚙ </span>
          <span className="underline underline-offset-4">Settings &amp; backups</span>
        </button>
      </div>

      {open === "feed" && (
        <FeedSheet onClose={close} defaultAmount={data?.lastFeeding?.amount_ml ?? 60} />
      )}
      {open === "sleep" && <SleepSheet onClose={close} active={asleep} />}
      {open === "diaper" && <DiaperSheet onClose={close} />}
      {open === "weight" && <WeightSheet onClose={close} previous={lastWeight} />}
      {open === "birth" && <BirthWeightSheet onClose={close} existing={birthWeight} />}
      {open === "import" && <ImportSheet onClose={close} />}
      {open === "backups" && <BackupSheet onClose={close} />}
      {open === "settings" && (
        <SettingsSheet
          onClose={close}
          onPick={setOpen}
          birthWeight={birthWeight ? fmtWeight(birthWeight.weight_g) : null}
        />
      )}
    </div>
  );
}

function ActionTile({
  label,
  icon,
  accent,
  wash,
  ink,
  detail,
  sub,
  filled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  accent: string;
  wash: string;
  ink: string;
  detail?: string;
  /** A second, quieter line — the forecast, or what to do next. */
  sub?: string;
  filled?: boolean;
  onClick: () => void;
}) {
  // The icon sits in its own outlined slot, the way an item sits in an
  // inventory square. It gives the symbol somewhere to be — without it the
  // sprite floated in the wash with the label a long way off to the right.
  return (
    <button
      type="button"
      onClick={onClick}
      className="chunk press relative flex min-h-[100px] flex-1 items-center gap-4 overflow-hidden rounded-[10px] px-5 text-left"
      style={{ background: wash, color: ink, borderColor: accent }}
    >
      <span
        className={`flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-[8px] ${
          filled ? "animate-breathe" : ""
        }`}
        style={{
          background: "color-mix(in srgb, var(--c-card) 62%, transparent)",
          border: `2px solid color-mix(in srgb, ${accent} 40%, transparent)`,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-pixel text-2xl font-semibold">{label}</span>
        {detail && <span className="truncate text-[14px] font-medium opacity-90">{detail}</span>}
        {sub && <span className="truncate text-[13px] font-normal opacity-70">{sub}</span>}
      </span>
    </button>
  );
}
