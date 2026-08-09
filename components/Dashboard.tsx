"use client";

import { useState } from "react";
import NotesList from "@/components/NotesList";
import SummaryCard from "@/components/SummaryCard";
import Timeline from "@/components/Timeline";
import { useToast } from "@/components/Toaster";
import CommentSheet from "@/components/sheets/CommentSheet";
import EventDetailSheet from "@/components/sheets/EventDetailSheet";
import { useEvents } from "@/lib/api";
import { buildExport, copyText } from "@/lib/export";
import { tick } from "@/lib/haptics";
import { useNow } from "@/lib/useNow";
import { RANGES, type RangeKey, type TimelineEvent } from "@/lib/types";

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>("24h");
  const [commentMode, setCommentMode] = useState(false);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [commentAt, setCommentAt] = useState<Date | null>(null);
  const { data, error, isLoading } = useEvents(range);
  const now = useNow(30_000);
  const notify = useToast();

  const copyForAI = async () => {
    if (!data) return;
    try {
      await copyText(JSON.stringify(buildExport(data), null, 2));
      notify("Copied — paste it into any AI chat");
    } catch {
      notify("Couldn't reach the clipboard", "bad");
    }
  };

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <div className="grid grid-cols-4 gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => {
              tick();
              setRange(r.key);
            }}
            className="press h-11 whitespace-nowrap rounded-full border px-1 text-[12px] font-medium"
            style={{
              background: range === r.key ? "var(--c-ink)" : "var(--c-card)",
              color: range === r.key ? "var(--c-paper)" : "var(--c-muted)",
              borderColor: range === r.key ? "var(--c-ink)" : "var(--c-line)",
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-2xl bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          Couldn&apos;t load the timeline.
        </p>
      )}

      {!data && isLoading && <div className="h-64 animate-pulse panel rounded-[20px]" />}

      {data && (
        <>
          <SummaryCard data={data} />

          <Timeline
            data={data}
            range={range}
            now={now}
            commentMode={commentMode}
            onSelect={(event) => {
              if (commentMode) return;
              tick();
              setSelected(event);
            }}
            onPickTime={(at) => {
              tick();
              setCommentMode(false);
              setCommentAt(at);
            }}
          />

          <div className="flex gap-2">
            <button
              onClick={() => {
                tick();
                setCommentMode((v) => !v);
              }}
              aria-pressed={commentMode}
              className="press h-14 flex-1 rounded-full border text-[15px] font-medium"
              style={{
                background: commentMode ? "var(--c-sleep)" : "var(--c-card)",
                color: commentMode ? "#fff" : "var(--c-ink)",
                borderColor: commentMode ? "var(--c-sleep)" : "var(--c-line)",
              }}
            >
              {commentMode ? "Tap the timeline…" : "💬 Comment"}
            </button>
            <button
              onClick={copyForAI}
              className="panel press h-14 flex-1 rounded-full text-[15px] font-medium"
            >
              Copy for AI
            </button>
          </div>

          <NotesList
            comments={data.comments}
            onOpen={(comment) => setSelected({ kind: "comment", data: comment })}
          />
        </>
      )}

      {selected && <EventDetailSheet event={selected} onClose={() => setSelected(null)} />}
      {commentAt && <CommentSheet at={commentAt} onClose={() => setCommentAt(null)} />}
    </div>
  );
}
