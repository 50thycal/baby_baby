"use client";

import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import { useToast } from "@/components/Toaster";
import WhoPicker, { SignedAs } from "@/components/WhoPicker";
import Sheet from "@/components/Sheet";
import { send, useBets } from "@/lib/api";
import {
  BBP,
  currentNight,
  GOOD_NIGHT_MS,
  lockTime,
  nightOutcome,
  nightWindow,
  scoreNight,
  shiftNight,
  standings,
  type Bet,
  type BetsPayload,
  type NightKey,
  type NightWindow,
  type Outcome,
  type Pick,
  type Score,
} from "@/lib/bets";
import { tick } from "@/lib/haptics";
import { useMe } from "@/lib/me";
import { useNow } from "@/lib/useNow";
import { fmtClock, fmtDayLabel, fmtDuration, MINUTE } from "@/lib/time";

const YES = "var(--c-sleep)";
const NO = "var(--c-awake)";

/** The phone's own zone — used for a night nobody has bet on yet. */
function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type NightView = {
  key: NightKey;
  win: NightWindow;
  lock: Date;
  locked: boolean;
  outcome: Outcome;
  bets: Bet[];
  scores: Score[];
};

function viewNight(data: BetsPayload, key: NightKey, fallbackTz: string, now: Date): NightView {
  const tz = data.nights.find((n) => n.night === key)?.tz ?? fallbackTz;
  const win = nightWindow(key, tz);
  const lock = lockTime(win, data.sleep);
  const outcome = nightOutcome(win, data.sleep, now);
  const bets = data.bets.filter((b) => b.night === key);
  return { key, win, lock, locked: lock <= now, outcome, bets, scores: scoreNight(bets, outcome) };
}

/**
 * Will she sleep six hours straight tonight? Everyone calls it before she goes
 * down, says why, and the sleep log settles it in the morning. Points are
 * baby baby points — worth exactly nothing, argued over endlessly.
 */
export default function BetsScreen() {
  const me = useMe();
  const { data, error } = useBets(me?.id ?? null);
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
  if (!data) {
    return (
      <div className="px-5">
        <div className="h-64 animate-pulse rounded-[10px] bg-sunk" />
      </div>
    );
  }

  const tz = localZone();
  const tonightKey = currentNight(now, tz);
  const tonight = viewNight(data, tonightKey, tz, now);
  const last = viewNight(data, shiftNight(tonightKey, -1), tz, now);

  const table = standings(
    data.people,
    data.nights.map((n) => {
      const v = viewNight(data, n.night, n.tz, now);
      return { key: v.key, bets: v.bets, outcome: v.outcome };
    }),
  );

  const older = data.nights
    .map((n) => n.night)
    .filter((k) => k < last.key)
    .reverse()
    .slice(0, 14)
    .map((k) => viewNight(data, k, tz, now));

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <TonightCard view={tonight} now={now} onChooseName={() => setChoosing(true)} />

      {last.bets.length > 0 && (
        <ResultCard view={last} title={`Last night · ${dayLabel(last.key)}`} />
      )}

      {table.length > 0 && <Leaderboard table={table} />}

      {older.length > 0 && <History nights={older} />}

      <Rules />

      {choosing && (
        <Sheet onClose={() => setChoosing(false)} title="Who's this?">
          <WhoPicker onPicked={() => setChoosing(false)} />
        </Sheet>
      )}
    </div>
  );
}

function dayLabel(key: NightKey) {
  const [y, m, d] = key.split("-").map(Number);
  return fmtDayLabel(new Date(y, m - 1, d));
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{children}</div>
  );
}

function TonightCard({
  view,
  now,
  onChooseName,
}: {
  view: NightView;
  now: Date;
  onChooseName: () => void;
}) {
  const me = useMe();
  const mine = me ? view.bets.find((b) => b.person_id === me.id) : undefined;

  return (
    <div className="panel rounded-[10px] p-4">
      <Label>Tonight · {dayLabel(view.key)}</Label>
      <h2 className="mt-1 font-pixel text-[22px] font-semibold leading-tight">
        6 hours straight?
      </h2>

      {view.locked ? (
        <div className="mt-3 flex flex-col gap-3">
          <Progress outcome={view.outcome} />
          <Calls bets={view.bets} scores={view.scores} />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[13px] text-muted">
            Closes when she goes down for the night, or {fmtClock(view.win.lockBy)} ·{" "}
            {closesIn(view.lock, now)}
          </p>

          {me ? (
            <>
              {/* Keyed on the call itself, so the form picks it up when it
                  arrives — including just after choosing a name, when the
                  previous response had this very call blanked out. */}
              <BetForm
                key={mine ? `${mine.updated_at}:${mine.pick}` : "new"}
                night={view.key}
                mine={mine}
              />
              <SignedAs onSwitch={onChooseName} />
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium">Pick your name to play.</p>
              <WhoPicker />
            </>
          )}

          <Hidden bets={view.bets.filter((b) => b.person_id !== me?.id)} />
        </div>
      )}
    </div>
  );
}

function closesIn(lock: Date, now: Date) {
  const ms = lock.getTime() - now.getTime();
  return ms < 60 * MINUTE ? `${fmtDuration(ms)} left` : `${fmtDuration(ms)} to go`;
}

/** Who else has called it, without saying what. */
function Hidden({ bets }: { bets: Bet[] }) {
  if (!bets.length) return null;
  return (
    <p className="text-[13px] text-muted">
      🔒 Called it: <span className="font-medium text-ink">{bets.map((b) => b.name).join(", ")}</span>{" "}
      — revealed when she goes down
    </p>
  );
}

function BetForm({ night, mine }: { night: NightKey; mine: Bet | undefined }) {
  const [pick, setPick] = useState<Pick | null>(mine?.pick ?? null);
  const [guess, setGuess] = useState<number | null>(mine?.guess_min ?? null);
  const [note, setNote] = useState(mine?.note ?? "");
  const notify = useToast();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <PickButton
          label="YES"
          sub="6h+ stretch"
          color={YES}
          on={pick === "yes"}
          onClick={() => setPick("yes")}
        />
        <PickButton
          label="NO"
          sub="not tonight"
          color={NO}
          on={pick === "no"}
          onClick={() => setPick("no")}
        />
      </div>

      <GuessStepper value={guess} onChange={setGuess} />

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
        accent={pick === "no" ? NO : YES}
        disabled={!pick}
        onConfirm={async () => {
          await send("POST", "/api/bets", {
            night,
            tz: localZone(),
            pick,
            guess_min: guess,
            note: note.trim() || null,
          });
          notify(mine ? "Call updated" : "You're in 🎲");
        }}
      />
    </div>
  );
}

function PickButton({
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

const GUESS_STEP = 15;
const GUESS_MIN = 30;
const GUESS_MAX = 12 * 60;

/** The optional side bet: how long will the longest stretch be? */
function GuessStepper({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  if (value === null) {
    return (
      <button
        type="button"
        onClick={() => {
          tick();
          onChange(6 * 60);
        }}
        className="press h-11 rounded-[8px] border border-dashed border-line text-[13px] font-medium text-muted"
      >
        + Guess her longest stretch · closest +{BBP.closest} BBP
      </button>
    );
  }
  const step = (d: number) => {
    tick();
    onChange(Math.min(GUESS_MAX, Math.max(GUESS_MIN, value + d)));
  };
  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-[13px] text-muted">Longest stretch guess</span>
      <StepButton onClick={() => step(-GUESS_STEP)} label="−" />
      <span className="w-[76px] text-center text-[17px] font-semibold tabular-nums">
        {fmtDuration(value * MINUTE)}
      </span>
      <StepButton onClick={() => step(GUESS_STEP)} label="+" />
      <button
        type="button"
        aria-label="No guess"
        onClick={() => onChange(null)}
        className="press h-10 w-8 text-[15px] text-muted"
      >
        ×
      </button>
    </div>
  );
}

function StepButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press h-10 w-10 rounded-[8px] bg-sunk text-[20px] font-semibold"
    >
      {label}
    </button>
  );
}

/** How the night is going, against the six-hour mark. */
function Progress({ outcome }: { outcome: Outcome }) {
  const share = Math.min(1, outcome.longestMs / GOOD_NIGHT_MS);
  return (
    <div className="flex flex-col gap-1.5">
      <Verdict outcome={outcome} />
      {!outcome.void && (
        <>
          <div className="h-3 overflow-hidden rounded-[4px] bg-sunk">
            <div
              className="h-full rounded-[4px]"
              style={{ width: `${share * 100}%`, background: outcome.good === false ? NO : YES }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-muted tabular-nums">
            <span>
              Longest {fmtDuration(outcome.longestMs)}
              {outcome.running ? " · still asleep" : ""}
            </span>
            <span>6h</span>
          </div>
        </>
      )}
    </div>
  );
}

function Verdict({ outcome }: { outcome: Outcome }) {
  let text: string;
  let color = "var(--c-ink)";
  if (outcome.void) {
    text = "No sleep logged — no contest";
    color = "var(--c-muted)";
  } else if (outcome.good) {
    text = outcome.phase === "final" ? "She did it! YES wins 🎉" : "6 hours! YES wins 🎉";
    color = YES;
  } else if (outcome.good === false) {
    text = "Not this time — NO wins";
    color = NO;
  } else if (outcome.phase === "upcoming") {
    text = "Bets are in. Waiting on bedtime…";
  } else {
    text = outcome.running ? "She's down. Fingers crossed…" : "Night in progress…";
  }
  return (
    <p className="text-[17px] font-semibold" style={{ color }}>
      {text}
    </p>
  );
}

/** Everyone's call, why they made it, and — once it's settled — what it earned. */
function Calls({ bets, scores }: { bets: Bet[]; scores: Score[] }) {
  if (!bets.length) {
    return <p className="text-[13px] text-muted">Nobody called this one.</p>;
  }
  const byPerson = new Map(scores.map((s) => [s.person_id, s]));
  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => {
        const s = byPerson.get(b.person_id);
        return (
          <li key={b.id} className="flex flex-col gap-0.5 py-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{b.name}</span>
              {b.pick && (
                <span
                  className="rounded-[4px] px-1.5 py-0.5 font-pixel text-[11px] text-white"
                  style={{ background: b.pick === "yes" ? YES : NO }}
                >
                  {b.pick.toUpperCase()}
                </span>
              )}
              {b.guess_min !== null && (
                <span className="text-[12px] text-muted">
                  guessed {fmtDuration(b.guess_min * MINUTE)}
                </span>
              )}
              {s && (
                <span
                  className="ml-auto text-[14px] font-semibold tabular-nums"
                  style={{ color: s.points ? YES : "var(--c-muted)" }}
                >
                  {s.points ? `+${s.points}` : "0"} BBP
                </span>
              )}
            </div>
            {s && (s.correct || s.closest) && (
              <div className="text-[12px] text-muted">
                {[
                  s.correct && "✓ called it",
                  s.underdog && `underdog +${BBP.underdog}`,
                  s.closest && `closest guess +${BBP.closest}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {b.note && <p className="text-[14px] italic leading-snug">“{b.note}”</p>}
          </li>
        );
      })}
    </ul>
  );
}

function ResultCard({ view, title }: { view: NightView; title: string }) {
  return (
    <div className="panel rounded-[10px] p-4">
      <Label>{title}</Label>
      <div className="mt-2 flex flex-col gap-3">
        <Progress outcome={view.outcome} />
        <Calls bets={view.bets} scores={view.scores} />
      </div>
    </div>
  );
}

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

function History({ nights }: { nights: NightView[] }) {
  return (
    <div className="panel rounded-[10px] p-4">
      <Label>Earlier nights</Label>
      <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
        {nights.map((n) => {
          const o = n.outcome;
          const top = [...n.scores].sort((a, b) => b.points - a.points)[0];
          const winner = top?.points ? n.bets.find((b) => b.person_id === top.person_id)?.name : null;
          return (
            <li key={n.key} className="flex items-baseline gap-2">
              <span className="w-[88px] shrink-0 text-muted">{dayLabel(n.key)}</span>
              <span
                className="w-9 font-pixel text-[12px]"
                style={{ color: o.good ? YES : o.good === false ? NO : "var(--c-muted)" }}
              >
                {o.void ? "—" : o.good ? "YES" : o.good === false ? "NO" : "…"}
              </span>
              <span className="tabular-nums">{o.void ? "no data" : fmtDuration(o.longestMs)}</span>
              {winner && <span className="ml-auto truncate text-muted">👑 {winner}</span>}
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
          A good night is one unbroken sleep of 6 hours or more, starting between 6pm and 6am.
          Two 4-hour stretches don&apos;t add up.
        </li>
        <li>
          Call it any time from 6am. Betting closes the moment she goes down for the night (the first
          sleep logged after 6pm), or 8pm at the latest. Calls stay hidden until then.
        </li>
        <li>
          YES is settled the minute she hits 6 hours. NO is settled once the night&apos;s over.
          Nothing logged all night means no contest.
        </li>
        <li>
          +{BBP.correct} BBP for calling it · +{BBP.underdog} more if most of the family got it wrong
          · +{BBP.closest} for the closest guess at her longest stretch (two or more guesses).
        </li>
      </ul>
    </details>
  );
}
