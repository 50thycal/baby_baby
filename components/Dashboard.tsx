"use client";

import { useState } from "react";
import NotesList from "@/components/NotesList";
import TodayCard from "@/components/TodayCard";
import Timeline from "@/components/Timeline";
import WeightCard from "@/components/WeightCard";
import WeightHistorySheet from "@/components/sheets/WeightHistorySheet";
import CommentSheet from "@/components/sheets/CommentSheet";
import CopySheet from "@/components/sheets/CopySheet";
import EventDetailSheet from "@/components/sheets/EventDetailSheet";
import { useEvents, useWeights } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { useNow } from "@/lib/useNow";
import { RANGES, type RangeKey, type TimelineEvent } from "@/lib/types";

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>("24h");
  const [commentMode, setCommentMode] = useState(false);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);
  const [commentAt, setCommentAt] = useState<Date | null>(null);
  const [copying, setCopying] = useState(false);
  const [weighIns, setWeighIns] = useState(false);
  const { data, error, isLoading } = useEvents(range);
  // Weight is a state, not an event — it belongs to no range, so it's fetched
  // whole and sits above the timeline rather than on it.
  const { data: weights } = useWeights();
  // The summary is anchored to local midnight, so it needs its own window: at
  // 11pm, yesterday's midnight is already 47 hours back. A week rather than the
  // minimum three days, because the pace line averages several complete days —
  // and SWR shares this exact request with the Log screen's forecasts.
  const { data: recent } = useEvents("1w");
  const now = useNow(30_000);

  return (
    <div className="flex flex-col gap-3 px-5 pb-4">
      <div className="grid grid-cols-5 gap-2">
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
          {recent && <TodayCard data={recent} now={now} />}

          <WeightCard
            weights={weights}
            onOpen={() => {
              tick();
              setWeighIns(true);
            }}
          />

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
              onClick={() => {
                tick();
                setCopying(true);
              }}
              className="panel press h-14 flex-1 rounded-full text-[15px] font-medium"
            >
              Copy data
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
      {copying && <CopySheet onClose={() => setCopying(false)} />}
      {weighIns && (
        <WeightHistorySheet weights={weights ?? []} onClose={() => setWeighIns(false)} />
      )}
    </div>
  );
}
