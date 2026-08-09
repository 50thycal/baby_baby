"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { text: string; tone: "ok" | "bad" };

const ToastContext = createContext<(text: string, tone?: "ok" | "bad") => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    setToast({ text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), tone === "bad" ? 3600 : 1900);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div
          role="status"
          className="animate-pop pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-6"
          style={{ top: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          <div
            className="max-w-full truncate rounded-full px-5 py-3 text-sm font-medium shadow-lg"
            style={{
              background: toast.tone === "bad" ? "var(--c-danger)" : "var(--c-ink)",
              color: "var(--c-paper)",
            }}
          >
            {toast.text}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
