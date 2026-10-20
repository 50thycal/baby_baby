"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Dial from "@/components/Dial";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { DiaperPicker } from "@/components/sheets/DiaperSheet";
import { send, useEventWindow } from "@/lib/api";
import { catchUpTime, localDayWindow, shiftLocalDay } from "@/lib/entry-time";
import { fmtClock, fmtDayLabel, fmtDuration, HOUR, isSameLocalDay } from "@/lib/time";
import { DIAPER_LABEL, type DiaperType } from "@/lib/types";

type Kind = "feed" | "diaper" | "sleep";
const ACCENT = {
  feed: "var(--c-feed)",
  diaper: "var(--c-diaper)",
  sleep: "var(--c-sleep)",
};

/** A single cursor and one sheet survive every save and every event-type change. */
export default function CatchUpSheet({
  onClose,
  defaultAmount,
}: {
  onClose: () => void;
  defaultAmount: number;
}) {
  const initial = useRef(shiftLocalDay(new Date(), -1)).current;
  const [ts, setTs] = useState(initial);
  const [focus, setFocus] = useState(initial);
  const [end, setEnd] = useState(new Date(initial.getTime() + HOUR));
  const [kind, setKind] = useState<Kind>("feed");
  const [amount, setAmount] = useState(defaultAmount);
  const [diaper, setDiaper] = useState<DiaperType | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);
  const notify = useToast();
  const { start: dayStart, end: dayEnd } = localDayWindow(ts);
  const { data, error, isLoading } = useEventWindow(dayStart.getTime(), dayEnd.getTime());

  const moveCursor = (next: Date) => {
    // Preserve the proposed nap length when its start is moved.
    setEnd(new Date(next.getTime() + Math.max(5 * 60_000, end.getTime() - ts.getTime())));
    setTs(next);
  };
  const focusCursor = (next: Date) => {
    moveCursor(next);
    // Day navigation resets the wheel's center, not the form or saved entries.
    setFocus(next);
  };
  const moveDay = (days: number) => {
    focusCursor(catchUpTime(ts, days));
  };
  const today = isSameLocalDay(ts, new Date());
  const invalidTime = ts.getTime() > Date.now();
  const invalidSleep = end <= ts || end.getTime() > Date.now();

  const entries = data
    ? [
        ...data.feedings.map((f) => ({
          id: `f-${f.id}`,
          at: f.ts,
          text: `Feed · ${f.amount_ml} mL`,
        })),
        ...data.diapers.map((d) => ({
          id: `d-${d.id}`,
          at: d.ts,
          text: `Diaper · ${DIAPER_LABEL[d.type]}`,
        })),
        ...data.sleep.map((s) => ({
          id: `s-${s.id}`,
          at: s.sleep_start,
          text: `Sleep → ${s.sleep_end ? `${fmtDayLabel(s.sleep_end)} ${fmtClock(s.sleep_end)}` : "still asleep"}`,
        })),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    : [];

  return (
    <Sheet
      title="Catch up"
      onClose={onClose}
      accent={ACCENT[kind]}
      footer={
        <>
          <ConfirmButton
            key={kind}
            label={`Save ${kind} & add another`}
            accent={ACCENT[kind]}
            disabled={
              invalidTime || (kind === "diaper" && !diaper) || (kind === "sleep" && invalidSleep)
            }
            onConfirm={async () => {
              setSaving(true);
              try {
                if (kind === "feed")
                  await send("POST", "/api/feedings", {
                    amount_ml: amount,
                    ts: ts.toISOString(),
                  });
                else if (kind === "diaper")
                  await send("POST", "/api/diapers", {
                    type: diaper,
                    ts: ts.toISOString(),
                  });
                else
                  await send("POST", "/api/sleep", {
                    sleep_start: ts.toISOString(),
                    sleep_end: end.toISOString(),
                  });
                setSaved((n) => n + 1);
                notify(
                  `${kind === "sleep" ? "Sleep" : kind === "feed" ? "Feed" : "Diaper"} saved · ${fmtDayLabel(ts)} ${fmtClock(ts)}`,
                );
                if (kind === "sleep") {
                  setTs(end);
                  setEnd(new Date(end.getTime() + HOUR));
                }
                // Require a fresh diaper selection so another tap can't repeat it.
                if (kind === "diaper") setDiaper(null);
              } finally {
                setSaving(false);
              }
            }}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <p role="status" className=" text-center text-xs text-muted">
              {saved
                ? `${saved} ${saved === 1 ? "entry" : "entries"} added this session`
                : "Each entry saves immediately"}
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="press h-10 rounded-[8px] bg-sunk px-4 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </>
      }
    >
      <p className="catch-up-help mb-2 text-center text-xs text-muted">
        Fill in missed logs. Your place stays put after every save.
      </p>
      <fieldset disabled={saving} className="catch-up-fields min-w-0 space-y-2 disabled:opacity-70">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous day"
            className="press h-11 rounded bg-sunk px-4"
            onClick={() => moveDay(-1)}
          >
            ←
          </button>
          <div className="text-center">
            <p className="text-sm font-semibold">{fmtDayLabel(ts)}</p>
            <div className="flex justify-center gap-3 text-xs text-muted">
              <button
                type="button"
                className="press py-1 underline"
                onClick={() => {
                  const yesterday = shiftLocalDay(new Date(), -1);
                  yesterday.setHours(ts.getHours(), ts.getMinutes(), 0, 0);
                  focusCursor(yesterday);
                }}
              >
                Yesterday
              </button>
              <button
                type="button"
                className="press py-1 underline"
                onClick={() => {
                  const next = new Date();
                  next.setHours(ts.getHours(), ts.getMinutes(), 0, 0);
                  focusCursor(new Date(Math.min(next.getTime(), Date.now())));
                }}
              >
                Today
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Next day"
            disabled={today}
            className="press h-11 rounded bg-sunk px-4 disabled:opacity-30"
            onClick={() => moveDay(1)}
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2" aria-label="Entry type">
          {(["feed", "diaper", "sleep"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={kind === type}
              onClick={() => setKind(type)}
              className="press h-11 rounded-[8px] text-sm font-semibold capitalize"
              style={{
                background: kind === type ? ACCENT[type] : "var(--c-sunk)",
                color: kind === type ? "#fff" : "var(--c-ink)",
              }}
            >
              {type}
            </button>
          ))}
        </div>
        <TimeField
          key={focus.getTime()}
          value={ts}
          onChange={moveCursor}
          base={focus}
          accent={ACCENT[kind]}
          label={kind === "sleep" ? "Fell asleep" : "When"}
          initiallyOpen
        />
        {kind === "feed" && <Dial value={amount} onChange={setAmount} />}
        {kind === "diaper" && <DiaperPicker value={diaper} onChange={setDiaper} />}
        {kind === "sleep" && (
          <>
            <TimeField
              key={`wake-${focus.getTime()}`}
              value={end}
              onChange={setEnd}
              base={new Date(focus.getTime() + HOUR)}
              accent={ACCENT.sleep}
              label="Woke up"
            />
            <p className="text-center text-sm text-sleep">
              {fmtDuration(Math.max(0, end.getTime() - ts.getTime()))} · completed sleep
            </p>
          </>
        )}
        {(invalidTime || (kind === "sleep" && invalidSleep)) && (
          <p role="alert" className="text-center text-sm text-danger">
            {invalidTime
              ? "Choose a time no later than now."
              : "Wake-up must be after falling asleep and no later than now."}
          </p>
        )}
      </fieldset>

      <details className="catch-up-history mt-2 rounded-[10px] bg-sunk px-3 py-1">
        <summary className="cursor-pointer text-xs font-semibold">
          Already logged · {fmtDayLabel(ts)} ({entries.length})
        </summary>
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            Couldn’t load this day’s logs. Check your connection before adding more.
          </p>
        ) : isLoading ? (
          <p className="mt-2 text-xs text-muted">Loading logs…</p>
        ) : entries.length ? (
          <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto text-xs">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="shrink-0 tabular-nums text-muted">
                  {!isSameLocalDay(new Date(entry.at), ts) && `${fmtDayLabel(entry.at)} `}
                  {fmtClock(entry.at)}
                </span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">Nothing logged for this day yet.</p>
        )}
      </details>
    </Sheet>
  );
}
