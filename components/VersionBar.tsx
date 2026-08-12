"use client";

import { useEffect, useState } from "react";
import { useVersion } from "@/lib/api";
import { tick } from "@/lib/haptics";
import { BUILD_ID, BUILT_AT, isStale, versionLabel } from "@/lib/version";

/**
 * A thin line above the tabs saying which build this is, and turning into a
 * refresh button when the server has moved on.
 *
 * It never reloads on its own. Someone could be halfway through logging a feed
 * at 4am, and having the page vanish under them to pick up a new build would be
 * a far worse bug than the stale build ever was.
 */
export default function VersionBar() {
  const { data } = useVersion();
  const stale = isStale(data?.build, BUILD_ID);

  // Formatted after mount, not during render: the server renders in UTC and the
  // phone renders in its own zone, and a date formatted in both is a hydration
  // mismatch waiting to happen.
  const [label, setLabel] = useState(BUILD_ID);
  useEffect(() => setLabel(versionLabel(BUILT_AT, BUILD_ID)), []);

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

  return (
    <p className="mb-2 h-4 text-center text-[10px] leading-4 tracking-[0.04em] text-muted">
      {label}
    </p>
  );
}
