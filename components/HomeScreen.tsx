"use client";

import { useState } from "react";
import BackupSheet from "@/components/sheets/BackupSheet";
import DiaperSheet from "@/components/sheets/DiaperSheet";
import FeedSheet from "@/components/sheets/FeedSheet";
import ImportSheet from "@/components/sheets/ImportSheet";
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
import { DIAPER_SHORT, type EventsPayload, type HomeState } from "@/lib/types";

type Which = "feed" | "sleep" | "diaper" | "weight" | "birth" | "import" | "backups" | null;

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

  return (
    <div className="flex h-full flex-col gap-4 px-5 pb-4">
      <StatusStrip state={data} now={now} error={!!error} history={history} />

      <div className="flex flex-1 flex-col gap-3">
        <ActionTile
          label="FEED"
          icon={<BottleIcon size={44} />}
          accent="var(--c-feed)"
          wash="var(--c-feed-wash)"
          ink="var(--c-feed-ink)"
          detail={data?.lastFeeding ? `last ${data.lastFeeding.amount_ml} mL` : undefined}
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
            detail={`${fmtDuration(now.getTime() - new Date(asleep.sleep_start).getTime())} · tap when she's up`}
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
                : undefined
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
          detail={data?.lastDiaper ? `last ${DIAPER_SHORT[data.lastDiaper.type]}` : undefined}
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

      {/* Deliberately small and quiet: all three are rare, deliberate errands
          and must never compete with the things done at 3am. Spaced rather
          than separated by dots — there are enough of them now to wrap on a
          narrow phone, and a dot separator strands itself at the end of a
          line when it does. */}
      <div className="-mt-1 flex flex-wrap items-center justify-center gap-x-2 text-[13px] text-muted">
        <Errand onClick={() => setOpen("import")}>Import from a paper log</Errand>
        <Errand onClick={() => setOpen("backups")}>Backups</Errand>
        {/* A one-off backfill, so it belongs with the other errands rather than
            beside the weight row. Once it's on file it carries the figure —
            both a receipt and the way back in to fix a typo. */}
        <Errand
          onClick={() => setOpen("birth")}
          after={birthWeight ? fmtWeight(birthWeight.weight_g) : undefined}
        >
          Birth weight
        </Errand>
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
    </div>
  );
}

/**
 * One of the quiet errands under the tiles.
 *
 * The underline sits on an inner span rather than the button, because
 * text-decoration draws through descendants and a child can't switch it off —
 * `no-underline` on the value would have no effect with the rule on the parent.
 */
function Errand({
  onClick,
  after,
  children,
}: {
  onClick: () => void;
  after?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="press px-2 py-1">
      <span className="underline underline-offset-4">{children}</span>
      {after && <span className="ml-1">· {after}</span>}
    </button>
  );
}

/**
 * Four quiet lines of context.
 *
 * The forecasts live here rather than in a panel of their own: "when is she
 * next due" belongs beside "when did she last eat", and the three tiles below
 * must stay the loudest thing on the screen.
 */
function StatusStrip({
  state,
  now,
  error,
  history,
}: {
  state: HomeState | undefined;
  now: Date;
  error: boolean;
  history: EventsPayload | undefined;
}) {
  if (error) {
    return (
      <p className="rounded-[10px] bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
        Can&apos;t reach the database right now.
      </p>
    );
  }
  if (!state) {
    return <div className="h-[76px] animate-pulse rounded-[10px] bg-sunk" />;
  }

  const asleep = state.activeSleep;

  // Both forecasts return null until there's enough history to mean anything,
  // in which case the line simply isn't drawn.
  const feedWindow = history ? nextFeedWindow(history.feedings, now) : null;
  const wake = history && asleep ? wakeWindow(history.sleep, asleep, now) : null;

  const sleepingFor = asleep
    ? fmtDuration(now.getTime() - new Date(asleep.sleep_start).getTime())
    : null;

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
      {feedWindow && (
        <StatusLine
          label="Next feed"
          value={
            feedWindow.overdue
              ? `overdue — usually by ${fmtClock(feedWindow.to)}`
              : `${fmtClock(feedWindow.from)} – ${fmtClock(feedWindow.to)}`
          }
          accent={feedWindow.overdue ? "var(--c-feed)" : undefined}
        />
      )}
      <StatusLine
        label="Baby"
        value={
          asleep
            ? wake
              ? `Sleeping ${sleepingFor} — ${
                  wake.overdue
                    ? "a long one"
                    : `up ~${fmtClock(wake.from)}–${fmtClock(wake.to)}`
                }`
              : `Sleeping — ${sleepingFor}`
            : "Awake"
        }
        accent={asleep ? "var(--c-sleep)" : undefined}
      />
      <StatusLine
        label="Last diaper"
        value={
          state.lastDiaper
            ? `${fmtAgo(state.lastDiaper.ts, now)} — ${DIAPER_SHORT[state.lastDiaper.type]}`
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
  icon,
  accent,
  wash,
  ink,
  detail,
  filled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  accent: string;
  wash: string;
  ink: string;
  detail?: string;
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
        {detail && <span className="truncate text-[13px] font-normal opacity-80">{detail}</span>}
      </span>
    </button>
  );
}
