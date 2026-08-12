"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { send } from "@/lib/api";

const QUICK = ["BIG EAT", "She was OUT 😂", "Finally slept!", "Massive blowout lol"];

export default function CommentSheet({ at, onClose }: { at: Date; onClose: () => void }) {
  const base = useRef(at).current;
  const [text, setText] = useState("");
  const [ts, setTs] = useState(at);
  const notify = useToast();

  return (
    <Sheet onClose={onClose} title="Add a note">
      <div className="flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened?"
          maxLength={280}
          rows={2}
          autoFocus
          className="w-full resize-none rounded-[10px] bg-sunk p-4 text-lg font-medium outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/20"
        />

        <div className="flex flex-wrap gap-2">
          {QUICK.map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => setText(phrase)}
              className="press rounded-[8px] bg-sunk px-4 py-2.5 text-sm font-medium text-muted"
            >
              {phrase}
            </button>
          ))}
        </div>

        <TimeField value={ts} onChange={setTs} base={base} label="At" />

        <ConfirmButton
          label="Save note"
          accent="var(--c-ink)"
          disabled={!text.trim()}
          onConfirm={async () => {
            await send("POST", "/api/comments", { text: text.trim(), ts: ts.toISOString() });
            notify("Note added");
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}
