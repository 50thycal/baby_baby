"use client";

import { useState } from "react";
import { send } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { fmtClock, fmtDayLabel, isSameLocalDay } from "@/lib/time";
import type { Comment } from "@/lib/types";

const REACTIONS = ["❤️", "😂", "🎉", "😮"];

type Props = {
  comments: Comment[];
  onOpen: (comment: Comment) => void;
};

/** Comments are readable here; the timeline just shows where they landed. */
export default function NotesList({ comments, onOpen }: Props) {
  if (comments.length === 0) return null;
  const now = new Date();

  return (
    <div className="flex flex-col gap-2">
      {comments
        .slice()
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
        .map((comment) => {
          const at = new Date(comment.ts);
          return (
            <div key={comment.id} className="panel rounded-[10px] p-4">
              <button
                onClick={() => onOpen(comment)}
                className="press block w-full text-left"
                aria-label={`Edit note: ${comment.text}`}
              >
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                  {isSameLocalDay(at, now)
                    ? fmtClock(at)
                    : `${fmtDayLabel(at)} · ${fmtClock(at)}`}
                </div>
                <p className="mt-1 text-[17px] font-semibold leading-snug">{comment.text}</p>
              </button>
              <Reactions comment={comment} />
            </div>
          );
        })}
    </div>
  );
}

function Reactions({ comment }: { comment: Comment }) {
  const [pending, setPending] = useState<string | null>(null);
  const counts = comment.reactions ?? {};

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {REACTIONS.map((emoji) => {
        const count = counts[emoji] ?? 0;
        return (
          <button
            key={emoji}
            type="button"
            disabled={pending !== null}
            onClick={async () => {
              tick();
              setPending(emoji);
              try {
                await send("PATCH", `/api/comments/${comment.id}`, { react: emoji });
              } finally {
                setPending(null);
              }
            }}
            className="press flex h-9 items-center gap-1 rounded-[8px] px-3 text-sm font-medium disabled:opacity-60"
            style={{
              background: count > 0 ? "var(--c-paper)" : "transparent",
              opacity: count > 0 ? 1 : 0.45,
            }}
            aria-label={`React with ${emoji}`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="tabular-nums text-muted">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
