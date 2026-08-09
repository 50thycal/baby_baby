"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import HomeScreen from "@/components/HomeScreen";
import { Toaster } from "@/components/Toaster";
import { tick } from "@/lib/haptics";

type Tab = "log" | "history";

export default function Page() {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <Toaster>
      <main className="mx-auto flex h-[100dvh] w-full max-w-md flex-col">
        <header
          className="shrink-0 px-5 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          <div className="flex rounded-full bg-card p-1">
            <Tab id="log" active={tab} onSelect={setTab}>
              Log
            </Tab>
            <Tab id="history" active={tab} onSelect={setTab}>
              History
            </Tab>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "log" ? <HomeScreen /> : <Dashboard />}
        </div>
      </main>
    </Toaster>
  );
}

function Tab({
  id,
  active,
  onSelect,
  children,
}: {
  id: Tab;
  active: Tab;
  onSelect: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        if (!selected) tick();
        onSelect(id);
      }}
      className="press h-11 flex-1 rounded-full text-[15px] font-bold transition-colors"
      style={{
        background: selected ? "var(--c-ink)" : "transparent",
        color: selected ? "var(--c-paper)" : "var(--c-muted)",
      }}
    >
      {children}
    </button>
  );
}
