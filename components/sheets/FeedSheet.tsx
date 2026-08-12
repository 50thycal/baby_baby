"use client";

import { useRef, useState } from "react";
import ConfirmButton from "@/components/ConfirmButton";
import Dial from "@/components/Dial";
import MomentSheet from "@/components/sheets/MomentSheet";
import { MomentIcon } from "@/components/icons";
import Sheet from "@/components/Sheet";
import TimeField from "@/components/TimeField";
import { useToast } from "@/components/Toaster";
import { send, useEvents } from "@/lib/api";
import { likelyAmount } from "@/lib/predict";

type Props = {
  onClose: () => void;
  /** Last feed's amount — the next one is usually about the same. */
  defaultAmount: number;
};

export default function FeedSheet({ onClose, defaultAmount }: Props) {
  const base = useRef(new Date()).current;
  const [amount, setAmount] = useState(defaultAmount);
  const [ts, setTs] = useState(base);
  const notify = useToast();
  // The hint sits under the dial rather than moving it: the default stays the
  // last amount, which is the better guess for the very next bottle. This just
  // says what the recent range has been, so an unusual reading looks unusual.
  const { data: history } = useEvents("1w");
  const [spitUp, setSpitUp] = useState(false);
  const hint = history ? likelyAmount(history.feedings, new Date()) : null;

  return (
    <Sheet onClose={onClose} title="Feed" accent="var(--c-feed)">
      <div className="flex flex-col items-center gap-1">
        <Dial value={amount} onChange={setAmount} />
        {hint && (
          <p className="-mt-1 text-[13px] text-muted">
            lately {hint.lowMl}–{hint.highMl} mL
            {hint.trend === "up" && " · trending up"}
            {hint.trend === "down" && " · trending down"}
          </p>
        )}
        <TimeField value={ts} onChange={setTs} base={base} accent="var(--c-feed)" />
        <div className="mt-2 w-full">
          <ConfirmButton
            label="Confirm"
            accent="var(--c-feed)"
            onConfirm={async () => {
              await send("POST", "/api/feedings", { amount_ml: amount, ts: ts.toISOString() });
              notify(`Logged ${amount} mL`);
              onClose();
            }}
          />
        </div>

        {/* A spit-up usually gets noticed while you're logging the feed, so it
            hangs off this sheet — but it's its own event with its own time,
            since it might have happened between feeds. */}
        <button
          type="button"
          onClick={() => setSpitUp(true)}
          className="press mt-1 px-3 py-1 text-[13px] text-muted underline underline-offset-4"
        >
          <span className="flex items-center justify-center gap-2">
            <MomentIcon kind="spit_up" size={18} /> Log a big spit up
          </span>
        </button>
      </div>

      {spitUp && <MomentSheet kind="spit_up" onClose={() => setSpitUp(false)} />}
    </Sheet>
  );
}
