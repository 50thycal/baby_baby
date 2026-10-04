"use client";

import { useEffect, useState } from "react";
import { useVersion } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { BUILD_ID, BUILT_AT, isStale, versionLabel } from "@/lib/version";

/**
 * A refresh button above the tabs when the server has moved on, and nothing at
 * all otherwise. Which build this is lives in Settings (`VersionLabel`): it's
 * worth being able to find, but not worth a row of every screen.
 *
 * It never reloads on its own. Someone could be halfway through logging a feed
 * at 4am, and having the page vanish under them to pick up a new build would be
 * a far worse bug than the stale build ever was.
 */
export default function VersionBar() {
  const { data } = useVersion();
  const stale = isStale(data?.build, BUILD_ID);

  if (stale) {
    return (
      <button
        type="button"
        onClick={() => {
          tick();
          window.location.reload();
        }}
        className="press mb-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-medium"
        // Inline, not `text-white`: globals.css has an unlayered
        // `button { color: inherit }`, and unlayered rules beat Tailwind's
        // layered utilities however specific those are.
        style={{ background: "var(--c-sleep)", color: "#fff" }}
      >
        <span aria-hidden>⟳</span>
        New version ready — tap to refresh
      </button>
    );
  }

  return null;
}

/** "Updated Oct 4, 2:22 am · dev" — which build is running. */
export function VersionLabel({ className = "" }: { className?: string }) {
  // Formatted after mount, not during render: the server renders in UTC and the
  // phone renders in its own zone, and a date formatted in both is a hydration
  // mismatch waiting to happen.
  const [label, setLabel] = useState(BUILD_ID);
  useEffect(() => setLabel(versionLabel(BUILT_AT, BUILD_ID)), []);

  return (
    <p className={`text-center text-[11px] tracking-[0.04em] text-muted ${className}`}>{label}</p>
  );
}
