"use client";

import { useState } from "react";
import { send, usePeople } from "@/lib/api";
import type { Person } from "@/lib/bets";
import { tick } from "@/lib/haptics";
import { setMe, useMe } from "@/lib/me";

/**
 * "Who's this?" — the whole of signing in. Everyone who has picked a name
 * before is a chip; anyone new types theirs once. No password: it's a
 * signature on a bet or a note, not a lock on anything.
 */
export default function WhoPicker({ onPicked }: { onPicked?: (person: Person) => void }) {
  const { data: people } = usePeople();
  const me = useMe();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choose = (person: Person) => {
    tick();
    setMe(person);
    onPicked?.(person);
  };

  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      choose(await send<Person>("POST", "/api/people", { name: name.trim() }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that name");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {people && people.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p)}
              className="press h-11 rounded-[8px] border px-4 text-[15px] font-medium"
              style={{
                background: me?.id === p.id ? "var(--c-ink)" : "var(--c-card)",
                color: me?.id === p.id ? "var(--c-paper)" : "var(--c-ink)",
                borderColor: me?.id === p.id ? "var(--c-ink)" : "var(--c-line)",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={people?.length ? "Someone new?" : "Your name"}
          maxLength={24}
          autoComplete="nickname"
          className="h-12 min-w-0 flex-1 rounded-[10px] bg-sunk px-4 text-[16px] font-medium outline-none placeholder:text-muted focus:ring-2 focus:ring-ink/20"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="press h-12 rounded-[8px] px-5 text-[15px] font-medium disabled:opacity-50"
          style={{ background: "var(--c-ink)", color: "var(--c-paper)" }}
        >
          {busy ? "…" : "That's me"}
        </button>
      </form>

      {error && (
        <p className="rounded-[10px] bg-danger-wash px-4 py-3 text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** "as Cal · switch" — who a note or bet will be signed by, and the way out. */
export function SignedAs({ onSwitch }: { onSwitch: () => void }) {
  const me = useMe();
  if (!me) return null;
  return (
    <p className="text-center text-[13px] text-muted">
      as <span className="font-semibold text-ink">{me.name}</span> ·{" "}
      <button type="button" onClick={onSwitch} className="press underline underline-offset-4">
        not you?
      </button>
    </p>
  );
}
