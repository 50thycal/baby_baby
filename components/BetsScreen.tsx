"use client";

import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { useToast } from "@/components/Toaster";
import WhoPicker, { SignedAs } from "@/components/WhoPicker";
import Sheet from "@/components/Sheet";
import { send, useBets, useEvents } from "@/lib/api";
import {
  BBP,
  currentDay,
  dayWindow,
  hintFor,
  kindById,
  openDay,
  outcome,
  pastWindows,
  scoreDay,
  shiftDay,
  standings,
  type BetDay,
  type DayKey,
  type Hint,
  type Kind,
  type Outcome,
  type Person,
  type Prediction,
  type Score,
} from "@/lib/bets";
import { projectToday, type Metric } from "@/lib/daily";
import { tick } from "@/lib/haptics";
import { useMe } from "@/lib/me";
import { useNow } from "@/lib/useNow";
import { fmtClock, fmtDayLabel, fmtDuration, MINUTE } from "@/lib/time";
import type { EventsPayload } from "@/lib/types";

/** The two sides of a yes/no or an over/under. */
const YES = "var(--c-sleep)";
const NO = "var(--c-awake)";

/** The phone's own zone — sent along so tomorrow means the family's tomorrow. */
function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type DayView = {
  key: DayKey;
  kind: Kind;
  line: number | null;
  preds: Prediction[];
  result: Outcome;
  scores: Score[];
};

function viewDay(row: BetDay, data: EventsPayload, preds: Prediction[], now: Date): DayView | null {
  const kind = kindById(row.kind);
  if (!kind) return null;
  const result = outcome(kind, row.line, data, dayWindow(row.day, row.tz), now);
  const mine = preds.filter((p) => p.day === row.day);
  return { key: row.day, kind, line: row.line, preds: mine, result, scores: scoreDay(kind, mine, result) };
}

/**
 * One question a day, always about tomorrow. Anyone can call it at any hour;
 * it locks at midnight, plays out live through the day, and the log settles
 * it. Points are baby baby points — worth exactly nothing, argued over
 * endlessly.
 */
export default function BetsScreen() {
  const me = useMe();
  const tz = localZone();
  const { data, error } = useBets(me?.id ?? null, tz);
  const { data: events } = useEvents("all");
  const now = useNow(30_000);
  const [choosing, setChoosing] = useState(false);

  if (error) {
    return (
      <div className="px-5">
        <p className="rounded-[10px] bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          Couldn&apos;t load the bets.
        </p>
      </div>
    );
  }
  if (!data || !events) {
    return (
      <div className="px-5">
        <div className="h-64 animate-pulse rounded-[10px] bg-sunk" />
      </div>
    );
  }

  const views = data.days
    .map((row) => viewDay(row, events, data.predictions, now))
    .filter((v): v is DayView => v !== null);
  const byKey = new Map(views.map((v) => [v.key, v]));

  const todayKey = currentDay(now, tz);
  const tomorrow = byKey.get(openDay(now, tz));
  const today = byKey.get(todayKey);
  const yesterday = byKey.get(shiftDay(todayKey, -1));

  const table = standings(
    data.people,
    views.map((v) => ({ key: v.key, kind: v.kind, preds: v.preds, result: v.result })),
  );
  const older = views
    .filter((v) => v.key < shiftDay(todayKey, -1) && v.preds.length > 0)
    .reverse()
    .slice(0, 14);

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      {tomorrow ? (
        <OpenCard
          view={tomorrow}
          hint={hintFor(tomorrow.kind, events, pastWindows(todayKey, tz))}
          people={data.people}
          onChooseName={() => setChoosing(true)}
        />
      ) : (
        <div className="h-48 animate-pulse rounded-[10px] bg-sunk" />
      )}

      {today && (
        <LiveCard view={today} events={events} now={now} title={`Today · ${dayLabel(today.key)}`} />
      )}

      {yesterday && yesterday.preds.length > 0 && (
        <LiveCard
          view={yesterday}
          events={events}
          now={now}
          title={`Yesterday · ${dayLabel(yesterday.key)}`}
        />
      )}

      {table.length > 0 && <Leaderboard table={table} />}

      {older.length > 0 && <History days={older} />}

      <Rules />

      {choosing && (
        <Sheet onClose={() => setChoosing(false)} title="Who's this?">
          <WhoPicker onPicked={() => setChoosing(false)} />
        </Sheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Words and figures.

function dayLabel(key: DayKey) {
  const [y, m, d] = key.split("-").map(Number);
  return fmtDayLabel(new Date(y, m - 1, d));
}

/** A figure in its own unit: "820 mL", "7", "2h 15m", "7:30 AM". */
function fmtValue(kind: Kind, v: number): string {
  switch (kind.unit) {
    case "ml":
      return `${Math.round(v)} mL`;
    case "count":
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    case "duration":
      return fmtDuration(Math.round(v) * MINUTE);
    case "clock":
      return fmtClock(new Date(2000, 0, 1, 0, Math.round(v)));
  }
}

function question(kind: Kind, line: number | null): string {
  return kind.ask.replace("{line}", line === null ? "?" : fmtValue(kind, line));
}

/** How an answer reads on a call: a figure, a side, or a name. */
function fmtAnswer(kind: Kind, answer: string): string {
  return kind.format === "closest" ? fmtValue(kind, Number(answer)) : answer.toUpperCase();
}

function sideColor(answer: string) {
  return answer === "yes" || answer === "over" ? YES : NO;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{children}</div>
  );
}

function Question({ kind, line }: { kind: Kind; line: number | null }) {
  return (
    <h2 className="mt-1 font-pixel text-[20px] font-semibold leading-tight">{question(kind, line)}</h2>
  );
}

// ---------------------------------------------------------------------------
// Tomorrow: the open question.

function OpenCard({
  view,
  hint,
  people,
  onChooseName,
}: {
  view: DayView;
  hint: Hint;
  people: Person[];
  onChooseName: () => void;
}) {
  const me = useMe();
  const mine = me ? view.preds.find((p) => p.person_id === me.id) : undefined;
  const others = view.preds.filter((p) => p.person_id !== me?.id);

  return (
    <div className="panel rounded-[10px] p-4">
      <Label>Tomorrow · {dayLabel(view.key)}</Label>
      <Question kind={view.kind} line={view.line} />
      <HintLine kind={view.kind} hint={hint} />

      <div className="mt-3 flex flex-col gap-3">
        {me ? (
          <>
            {/* Keyed on the answer itself, so the form picks it up when it
                arrives — including just after choosing a name, when the
                previous response had it blanked out. */}
            <AnswerForm
              key={mine ? `${mine.updated_at}:${mine.answer}` : "new"}
              view={view}
              mine={mine}
              hint={hint}
              people={people}
            />
            <SignedAs onSwitch={onChooseName} />
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium">Pick your name to play.</p>
            <WhoPicker />
          </>
        )}

        {others.length > 0 && (
          <p className="text-[13px] text-muted">
            🔒 In:{" "}
            <span className="font-medium text-ink">{others.map((p) => p.name).join(", ")}</span> —
            revealed at midnight
          </p>
        )}
      </div>
    </div>
  );
}

/** What her past week says, so a guess has something to go on. */
function HintLine({ kind, hint }: { kind: Kind; hint: Hint }) {
  if (!hint.days) return null;
  let text: string | null = null;
  if (kind.format === "yesno") {
    text = `Happened on ${hint.happenedDays} of the last ${hint.days} days`;
  } else if (kind.format !== "person" && hint.typical !== null) {
    text = `${kind.unit === "clock" ? "Usually around" : "Her average lately:"} ${fmtValue(kind, hint.typical)}`;
  }
  return text ? <p className="mt-1 text-[13px] text-muted">{text}</p> : null;
}

/** A sensible place for the stepper to start, snapped to its step. */
function startingFigure(kind: Kind, hint: Hint): number {
  const [small] = kind.steps!;
  const [lo, hi] = kind.range!;
  const fallback = { ml: 600, count: 8, duration: 180, clock: 8 * 60 }[kind.unit];
  const raw = hint.typical ?? fallback;
  return Math.min(hi, Math.max(lo, Math.round(raw / small) * small));
}

function AnswerForm({
  view,
  mine,
  hint,
  people,
}: {
  view: DayView;
  mine: Prediction | undefined;
  hint: Hint;
  people: Person[];
}) {
  const { kind } = view;
  const [answer, setAnswer] = useState<string | null>(
    mine?.answer ?? (kind.format === "closest" ? String(startingFigure(kind, hint)) : null),
  );
  const [note, setNote] = useState(mine?.note ?? "");
  const notify = useToast();

  return (
    <div className="flex flex-col gap-3">
      {kind.format === "closest" && (
        <FigureStepper kind={kind} value={Number(answer)} onChange={(v) => setAnswer(String(v))} />
      )}
      {(kind.format === "yesno" || kind.format === "overunder") && (
        <div className="grid grid-cols-2 gap-2">
          {(kind.format === "yesno" ? ["yes", "no"] : ["over", "under"]).map((side) => (
            <SideButton
              key={side}
              label={side.toUpperCase()}
              sub={
                kind.format === "overunder" && view.line !== null
                  ? `${side === "over" ? "more than" : "less than"} ${fmtValue(kind, view.line)}`
                  : side === "yes"
                    ? "it'll happen"
                    : "not tomorrow"
              }
              color={sideColor(side)}
              on={answer === side}
              onClick={() => setAnswer(side)}
            />
          ))}
        </div>
      )}
      {kind.format === "person" && (
        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const on = answer === p.name;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  tick();
                  setAnswer(p.name);
                }}
                className="press h-11 rounded-full border-2 px-4"
                style={{
                  background: on ? "var(--c-ink)" : "var(--c-card)",
                  color: on ? "var(--c-paper)" : "var(--c-ink)",
                  borderColor: on ? "var(--c-ink)" : "var(--c-line)",
                }}
              >
                <span className="text-[15px] font-semibold">{p.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why? (she cluster-fed all afternoon…)"
        maxLength={280}
        rows={2}
        className="w-full resize-none rounded-[10px] bg-sunk p-3 text-[15px] font-medium outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/20"
      />

      <ConfirmButton
        label={mine ? "Update my call" : "Lock in my call"}
        accent={answer === "no" || answer === "under" ? NO : YES}
        disabled={answer === null}
        onConfirm={async () => {
          await send("POST", "/api/bets", {
            day: view.key,
            answer,
            note: note.trim() || null,
          });
          notify(mine ? "Call updated" : "You're in 🎲");
        }}
      />
    </div>
  );
}

function SideButton({
  label,
  sub,
  color,
  on,
  onClick,
}: {
  label: string;
  sub: string;
  color: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        tick();
        onClick();
      }}
      className="chunk press flex h-20 flex-col items-center justify-center rounded-[10px]"
      style={{
        background: on ? color : "var(--c-card)",
        color: on ? "#fff" : color,
        borderColor: color,
      }}
    >
      <span className="font-pixel text-2xl font-semibold">{label}</span>
      <span className="text-[12px] opacity-85">{sub}</span>
    </button>
  );
}

/** A figure, nudged in the question's own steps. Times of day wrap round midnight. */
function FigureStepper({
  kind,
  value,
  onChange,
}: {
  kind: Kind;
  value: number;
  onChange: (v: number) => void;
}) {
  const [small, big] = kind.steps!;
  const [lo, hi] = kind.range!;
  const step = (d: number) => {
    tick();
    if (kind.unit === "clock") onChange((((value + d) % 1440) + 1440) % 1440);
    else onChange(Math.min(hi, Math.max(lo, value + d)));
  };
  const bigLabel = kind.unit === "duration" || kind.unit === "clock" ? "1h" : String(big);
  return (
    <div className="flex items-center gap-1.5">
      <StepButton onClick={() => step(-big)} label={`−${bigLabel}`} wide />
      <StepButton onClick={() => step(-small)} label="−" />
      <span className="flex-1 text-center text-[22px] font-semibold tabular-nums">
        {fmtValue(kind, value)}
      </span>
      <StepButton onClick={() => step(small)} label="+" />
      <StepButton onClick={() => step(big)} label={`+${bigLabel}`} wide />
    </div>
  );
}

function StepButton({ onClick, label, wide }: { onClick: () => void; label: string; wide?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`press flex h-11 items-center justify-center rounded-[8px] bg-sunk ${wide ? "w-12" : "w-11"}`}
    >
      <span className={wide ? "text-[13px] font-semibold" : "text-[20px] font-semibold"}>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Today and yesterday: playing out, and played.

/** The metric `projectToday` knows for a kind, where there is one. */
const PACE: Partial<Record<string, Metric>> = {
  milk_total: "feed_ml",
  feeds_count: "feed_count",
  diapers_count: "diaper_count",
  dirty_count: "poop_count",
  sleep_total: "sleep_ms",
};

/**
 * Where a running total is heading by midnight, in the kind's unit. Only for
 * today, and only for totals — the same projection as the Trends charts.
 */
function paceFor(view: DayView, events: EventsPayload, now: Date): number | null {
  const metric = PACE[view.kind.id];
  if (!metric || view.result.phase !== "live" || view.result.settled) return null;
  const p = projectToday(events, now, metric);
  if (!p) return null;
  return metric === "sleep_ms" ? p.expected / MINUTE : p.expected;
}

function LiveCard({
  view,
  events,
  now,
  title,
}: {
  view: DayView;
  events: EventsPayload;
  now: Date;
  title: string;
}) {
  const pace = paceFor(view, events, now);
  return (
    <div className="panel rounded-[10px] p-4">
      <Label>{title}</Label>
      <Question kind={view.kind} line={view.line} />
      <div className="mt-2 flex flex-col gap-3">
        <Verdict view={view} pace={pace} />
        <Calls view={view} pace={pace} />
      </div>
    </div>
  );
}

/** How it stands, in one line: who won, or what the log says so far. */
function Verdict({ view, pace }: { view: DayView; pace: number | null }) {
  const { kind, result, line } = view;
  const { obs } = result;
  let text: string;
  let sub: string | null = null;
  let color = "var(--c-ink)";

  if (result.void) {
    text =
      kind.format === "overunder" && !obs.empty
        ? `Landed right on the line — no contest`
        : "Nothing logged — no contest";
    color = "var(--c-muted)";
  } else if (result.settled) {
    if (kind.format === "closest") {
      text = kind.id === "first_poop" ? `First poop: ${fmtValue(kind, obs.value!)}` : `It was ${fmtValue(kind, obs.value!)}`;
    } else if (kind.format === "person") {
      text = `${obs.leaders.join(" & ")} logged the most (${obs.value})`;
    } else {
      text = `${result.winning!.toUpperCase()} wins${result.winning === "yes" || result.winning === "over" ? " 🎉" : ""}`;
      color = sideColor(result.winning!);
      if (kind.format === "overunder") sub = `${fmtValue(kind, obs.value ?? 0)} against a line of ${fmtValue(kind, line!)}`;
      if (kind.id === "six_hours") sub = `Longest stretch ${fmtValue(kind, obs.value ?? 0)}`;
    }
  } else if (result.phase === "open") {
    text = "Starts at midnight";
  } else {
    // Live and undecided: what's happened so far.
    switch (kind.format) {
      case "yesno":
        text =
          kind.id === "six_hours"
            ? `Longest so far ${fmtValue(kind, obs.value ?? 0)}${obs.running ? " · still asleep" : ""}`
            : "Not yet…";
        break;
      case "person":
        text = obs.leaders.length
          ? `${obs.leaders.join(" & ")} ${obs.leaders.length > 1 ? "lead" : "leads"} with ${obs.value}`
          : "Nobody's logged anything yet";
        break;
      default:
        text =
          kind.id === "first_poop"
            ? "No poop yet…"
            : kind.id === "longest_sleep"
              ? `Longest so far ${fmtValue(kind, obs.value ?? 0)}${obs.running ? " · still asleep" : ""}`
              : `${fmtValue(kind, obs.value ?? 0)} so far`;
    }
    if (pace !== null) sub = `on pace for ~${fmtValue(kind, pace)}`;
  }

  return (
    <div>
      <p className="text-[17px] font-semibold leading-snug" style={{ color }}>
        {text}
      </p>
      {sub && <p className="text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

/**
 * Everyone's call, why they made it, and what it earned. While a closest-guess
 * day is still running, whoever is nearest the pace is marked as leading — a
 * reason to open the tab at lunchtime.
 */
function Calls({ view, pace }: { view: DayView; pace: number | null }) {
  const { kind, preds, scores } = view;
  if (!preds.length) return <p className="text-[13px] text-muted">Nobody called this one.</p>;

  const byPerson = new Map(scores.map((s) => [s.person_id, s]));
  const leading =
    kind.format === "closest" && pace !== null && preds.length >= 2
      ? Math.min(...preds.map((p) => Math.abs(Number(p.answer) - pace)))
      : null;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {preds.map((p) => {
        const s = byPerson.get(p.person_id);
        const isLeading = leading !== null && Math.abs(Number(p.answer) - pace!) === leading;
        return (
          <li key={p.id} className="flex flex-col gap-0.5 py-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{p.name}</span>
              {p.answer !== null && (
                <span
                  className={
                    kind.format === "closest" || kind.format === "person"
                      ? "rounded-[4px] bg-sunk px-1.5 py-0.5 text-[13px] font-medium tabular-nums"
                      : "rounded-[4px] px-1.5 py-0.5 font-pixel text-[11px] text-white"
                  }
                  style={
                    kind.format === "yesno" || kind.format === "overunder"
                      ? { background: sideColor(p.answer) }
                      : undefined
                  }
                >
                  {fmtAnswer(kind, p.answer)}
                </span>
              )}
              {isLeading && !s && <span className="text-[12px] text-muted">🏁 leading</span>}
              {s && (
                <span
                  className="ml-auto text-[14px] font-semibold tabular-nums"
                  style={{ color: s.points ? YES : "var(--c-muted)" }}
                >
                  {s.points ? `+${s.points}` : "0"} BBP
                </span>
              )}
            </div>
            {s && s.reasons.length > 0 && (
              <div className="text-[12px] text-muted">{s.reasons.join(" · ")}</div>
            )}
            {p.note && <p className="text-[14px] italic leading-snug">“{p.note}”</p>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The long game.

function Leaderboard({ table }: { table: ReturnType<typeof standings> }) {
  return (
    <div className="panel rounded-[10px] p-4">
      <Label>Baby baby points</Label>
      <ol className="mt-2 flex flex-col gap-1.5">
        {table.map((r, i) => (
          <li key={r.person_id} className="flex items-baseline gap-3">
            <span className="w-6 text-[13px] text-muted tabular-nums">
              {i === 0 && r.bbp > 0 ? "👑" : `${i + 1}.`}
            </span>
            <span className="flex-1 truncate text-[16px] font-semibold">{r.name}</span>
            <span className="text-[12px] text-muted tabular-nums">
              {r.wins}–{r.losses}
              {r.streak >= 2 ? ` · 🔥${r.streak}` : ""}
            </span>
            <span className="w-[72px] text-right text-[18px] font-semibold tabular-nums">
              {r.bbp} <span className="text-[11px] font-medium text-muted">BBP</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function History({ days }: { days: DayView[] }) {
  return (
    <div className="panel rounded-[10px] p-4">
      <Label>Earlier days</Label>
      <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
        {days.map((d) => {
          const r = d.result;
          const top = [...d.scores].sort((a, b) => b.points - a.points)[0];
          const winner = top?.points ? d.preds.find((p) => p.person_id === top.person_id)?.name : null;
          const result = r.void
            ? "no contest"
            : !r.settled
              ? "…"
              : d.kind.format === "closest"
                ? fmtValue(d.kind, r.obs.value!)
                : d.kind.format === "person"
                  ? r.obs.leaders.join(" & ")
                  : r.winning!.toUpperCase();
          return (
            <li key={d.key} className="flex items-baseline gap-2">
              <span className="w-[84px] shrink-0 text-muted">{dayLabel(d.key)}</span>
              <span className="min-w-0 flex-1 truncate">{d.kind.short}</span>
              <span className="shrink-0 font-medium tabular-nums">{result}</span>
              {winner && <span className="max-w-[30%] shrink-0 truncate text-muted">👑 {winner}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Rules() {
  return (
    <details className="px-1 text-[13px] text-muted">
      <summary className="press cursor-pointer py-1">How it works</summary>
      <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
        <li>
          One question a day, always about tomorrow, and a different kind most days: a number to
          guess, an over/under, a yes/no, or one of the family.
        </li>
        <li>
          Call it any time before midnight and change your mind as often as you like. Calls stay
          hidden until tomorrow starts.
        </li>
        <li>
          The log settles it. Some things settle early — a blowout has happened, the line has been
          passed, the first poop has been — and the rest at midnight. A sleep that starts that day
          counts in full, even when she wakes the next morning. Nothing logged at all is no contest.
        </li>
        <li>
          Over/under lines come from her past week, so they&apos;re close to a coin flip.
        </li>
        <li>
          Right on a yes/no, over/under or person: +{BBP.correct} BBP, and +{BBP.underdog} more if
          most of the family got it wrong. Number guesses: +{BBP.nearest} for the nearest (two or more
          guessers), +{BBP.runnerUp} for second (three or more), and +{BBP.bullseye} for a bullseye
          whoever else played.
        </li>
      </ul>
    </details>
  );
}
