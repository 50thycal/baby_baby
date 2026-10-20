"use client";

import { createContext, useEffect, useMemo, useState } from "react";

/** Only one time scale needs to be expanded inside a sheet. */
export const SheetTimeContext = createContext<{
  active: string | null;
  setActive: (id: string | null) => void;
} | null>(null);

type Props = {
  onClose: () => void;
  title?: string;
  accent?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/**
 * One bottom sheet for every flow in the app. Full-width, thumb-reachable,
 * closes on backdrop tap or Escape. Parents mount it conditionally, so each
 * open starts from fresh state.
 */
export default function Sheet({ onClose, title, accent, children, footer }: Props) {
  const [active, setActive] = useState<string | null>(null);
  const timeGroup = useMemo(() => ({ active, setActive }), [active]);
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
        className={`sheet-dialog animate-sheet relative flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[24px] border-t border-line bg-card px-5 pt-3 ${footer ? "entry-sheet" : ""}`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="sheet-handle mx-auto mb-4 h-1 w-10 shrink-0 rounded-[8px] bg-line" />
        {title && (
          <h2
            className="sheet-title mb-4 shrink-0 text-center text-[13px] font-medium uppercase tracking-[0.12em]"
            style={{ color: accent ?? "var(--c-muted)" }}
          >
            {title}
          </h2>
        )}
        <SheetTimeContext.Provider value={timeGroup}>
          <div className="sheet-body min-h-0 overflow-y-auto">{children}</div>
          {footer && (
            <div className="sheet-footer shrink-0 border-t border-line bg-card pt-2">{footer}</div>
          )}
        </SheetTimeContext.Provider>
      </div>
    </div>
  );
}
