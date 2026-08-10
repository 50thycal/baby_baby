"use client";

import { useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import DeleteButton from "@/components/DeleteButton";
import Dial from "@/components/Dial";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { DiaperPicker } from "@/components/sheets/DiaperSheet";
import { send } from "@/lib/api";
import { fmtDuration } from "@/lib/time";
import {
  DIAPER_LABEL,
  MOMENT_ACCENT,
  MOMENT_EMOJI,
  MOMENT_LABEL,
  type DiaperType,
  type TimelineEvent,
} from "@/lib/types";

type Props = { event: TimelineEvent; onClose: () => void };

const ACCENT: Record<TimelineEvent["kind"], string> = {
  feeding: "var(--c-feed)",
  sleep: "var(--c-sleep)",
  diaper: "var(--c-diaper)",
  comment: "var(--c-ink)",
  // Filled in per row: a spit-up borrows the feed colour, fussiness the sleep one.
  moment: "var(--c-ink)",
};

const TITLE: Record<TimelineEvent["kind"], string> = {
  feeding: "Edit feeding",
  sleep: "Edit sleep",
  diaper: "Edit diaper",
  comment: "Edit note",
  moment: "Edit",
};

/** Everything on the timeline is a mistake waiting to be fixed. */
export default function EventDetailSheet({ event, onClose }: Props) {
  const accent = event.kind === "moment" ? MOMENT_ACCENT[event.data.kind] : ACCENT[event.kind];
  const title = event.kind === "moment" ? MOMENT_LABEL[event.data.kind] : TITLE[event.kind];
  return (
    <Sheet onClose={onClose} title={title} accent={accent}>
      {event.kind === "feeding" && <EditFeeding event={event.data} onClose={onClose} />}
      {event.kind === "sleep" && <EditSleep event={event.data} onClose={onClose} />}
      {event.kind === "diaper" && <EditDiaper event={event.data} onClose={onClose} />}
      {event.kind === "comment" && <EditComment event={event.data} onClose={onClose} />}
      {event.kind === "moment" && <EditMoment event={event.data} onClose={onClose} />}
    </Sheet>
  );
}

function EditFeeding({
  event,
  onClose,
}: {
  event: Extract<TimelineEvent, { kind: "feeding" }>["data"];
  onClose: () => void;
}) {
  const original = new Date(event.ts);
  const [amount, setAmount] = useState(event.amount_ml);
  const [ts, setTs] = useState(original);
  const notify = useToast();

  return (
    <div className="flex flex-col items-center gap-2">
      <Dial value={amount} onChange={setAmount} />
      <TimeField value={ts} onChange={setTs} base={original} accent="var(--c-feed)" />
      <ConfirmButton
        label="Save"
        accent="var(--c-feed)"
        onConfirm={async () => {
          await send("PATCH", `/api/feedings/${event.id}`, {
            amount_ml: amount,
            ts: ts.toISOString(),
          });
          notify("Feeding updated");
          onClose();
        }}
      />
      <DeleteButton
        onDelete={async () => {
          await send("DELETE", `/api/feedings/${event.id}`);
          notify("Feeding deleted");
          onClose();
        }}
      />
    </div>
  );
}

function EditSleep({
  event,
  onClose,
}: {
  event: Extract<TimelineEvent, { kind: "sleep" }>["data"];
  onClose: () => void;
}) {
  const originalStart = new Date(event.sleep_start);
  const originalEnd = event.sleep_end ? new Date(event.sleep_end) : null;
  const [start, setStart] = useState(originalStart);
  const [end, setEnd] = useState(originalEnd);
  const notify = useToast();

  const invalid = end !== null && end.getTime() <= start.getTime();

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="mb-1 text-4xl font-semibold tabular-nums tracking-[-0.01em] text-sleep">
        {end ? fmtDuration(Math.max(0, end.getTime() - start.getTime())) : "in progress"}
      </div>

      <TimeField
        value={start}
        onChange={setStart}
        base={originalStart}
        accent="var(--c-sleep)"
        label="Fell asleep"
      />

      {end && originalEnd ? (
        <TimeField
          value={end}
          onChange={setEnd}
          base={originalEnd}
          accent="var(--c-sleep)"
          label="Woke up"
        />
      ) : (
        <p className="mb-2 mt-1 text-center text-sm font-medium text-muted">
          Still asleep — end this from the Log screen.
        </p>
      )}

      <div className="mt-1 w-full">
        <ConfirmButton
          label="Save"
          accent="var(--c-sleep)"
          disabled={invalid}
          onConfirm={async () => {
            await send("PATCH", `/api/sleep/${event.id}`, {
              sleep_start: start.toISOString(),
              sleep_end: end ? end.toISOString() : null,
            });
            notify("Sleep updated");
            onClose();
          }}
        />
      </div>
      {invalid && (
        <p className="mt-1 text-center text-sm font-medium text-danger">
          Wake-up has to come after falling asleep.
        </p>
      )}
      <DeleteButton
        onDelete={async () => {
          await send("DELETE", `/api/sleep/${event.id}`);
          notify("Sleep deleted");
          onClose();
        }}
      />
    </div>
  );
}

function EditDiaper({
  event,
  onClose,
}: {
  event: Extract<TimelineEvent, { kind: "diaper" }>["data"];
  onClose: () => void;
}) {
  const original = new Date(event.ts);
  const [type, setType] = useState<DiaperType>(event.type);
  const [ts, setTs] = useState(original);
  const notify = useToast();

  return (
    <div className="flex flex-col gap-2">
      <DiaperPicker value={type} onChange={setType} />
      <TimeField value={ts} onChange={setTs} base={original} accent="var(--c-diaper)" />
      <ConfirmButton
        label="Save"
        accent="var(--c-diaper)"
        onConfirm={async () => {
          await send("PATCH", `/api/diapers/${event.id}`, { type, ts: ts.toISOString() });
          notify(`Updated to ${DIAPER_LABEL[type]}`);
          onClose();
        }}
      />
      <DeleteButton
        onDelete={async () => {
          await send("DELETE", `/api/diapers/${event.id}`);
          notify("Diaper deleted");
          onClose();
        }}
      />
    </div>
  );
}

function EditComment({
  event,
  onClose,
}: {
  event: Extract<TimelineEvent, { kind: "comment" }>["data"];
  onClose: () => void;
}) {
  const original = new Date(event.ts);
  const [text, setText] = useState(event.text);
  const [ts, setTs] = useState(original);
  const notify = useToast();

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={280}
        rows={3}
        className="w-full resize-none rounded-[18px] bg-sunk p-4 text-lg font-medium outline-none focus:ring-2 focus:ring-ink/20"
      />
      <TimeField value={ts} onChange={setTs} base={original} />
      <ConfirmButton
        label="Save"
        accent="var(--c-ink)"
        disabled={!text.trim()}
        onConfirm={async () => {
          await send("PATCH", `/api/comments/${event.id}`, {
            text: text.trim(),
            ts: ts.toISOString(),
          });
          notify("Note updated");
          onClose();
        }}
      />
      <DeleteButton
        onDelete={async () => {
          await send("DELETE", `/api/comments/${event.id}`);
          notify("Note deleted");
          onClose();
        }}
      />
    </div>
  );
}

/** A spit-up or fussy spell: only the time is editable, because that's all there is. */
function EditMoment({
  event,
  onClose,
}: {
  event: Extract<TimelineEvent, { kind: "moment" }>["data"];
  onClose: () => void;
}) {
  const original = new Date(event.ts);
  const [ts, setTs] = useState(original);
  const notify = useToast();
  const accent = MOMENT_ACCENT[event.kind];

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-5xl" aria-hidden>
        {MOMENT_EMOJI[event.kind]}
      </div>
      <TimeField value={ts} onChange={setTs} base={original} accent={accent} label="When" />
      <ConfirmButton
        label="Save"
        accent={accent}
        onConfirm={async () => {
          await send("PATCH", `/api/moments/${event.id}`, { ts: ts.toISOString() });
          notify("Updated");
          onClose();
        }}
      />
      <DeleteButton
        onDelete={async () => {
          await send("DELETE", `/api/moments/${event.id}`);
          notify("Deleted");
          onClose();
        }}
      />
    </div>
  );
}
