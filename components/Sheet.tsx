"use client";

import { useEffect } from "react";

type Props = {
  onClose: () => void;
  title?: string;
  accent?: string;
  children: React.ReactNode;
};

/**
 * One bottom sheet for every flow in the app. Full-width, thumb-reachable,
 * closes on backdrop tap or Escape. Parents mount it conditionally, so each
 * open starts from fresh state.
 */
export default function Sheet({ onClose, title, accent, children }: Props) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Close"
        onClick={onClose}
        className="animate-veil absolute inset-0 bg-veil backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet relative max-h-[92vh] overflow-y-auto rounded-t-[32px] bg-card px-5 pt-3 shadow-[0_-8px_40px_rgb(0_0_0/0.18)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 22px)" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-line" />
        {title && (
          <h2
            className="mb-4 text-center text-[13px] font-bold uppercase tracking-[0.16em]"
            style={{ color: accent ?? "var(--c-muted)" }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
