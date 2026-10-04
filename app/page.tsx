"use client";

import { useState } from "react";
import BetsScreen from "@/components/BetsScreen";
import Dashboard from "@/components/Dashboard";
import HomeScreen from "@/components/HomeScreen";
import { Toaster } from "@/components/Toaster";
import TrendsDashboard from "@/components/TrendsDashboard";
import VersionBar from "@/components/VersionBar";
import { tick } from "@/lib/haptics";

/**
 * Named for what each screen shows, not how complicated it is: "Today" is how
 * the day is going, "Trends" is which way the weeks are heading. "Basic" and
 * "Advanced" described the reader rather than the content, and "ADVANCED" was
 * too wide for its quarter of the bar in the pixel font.
 */
type Tab = "log" | "today" | "trends" | "bets";

export default function Page() {
  const [tab, setTab] = useState<Tab>("log");

  return (
    <Toaster>
      <main className="mx-auto flex h-[100dvh] w-full max-w-[520px] flex-col">
        <header
          className="shrink-0 px-5 pb-3"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 14px)" }}
        >
          <VersionBar />

          <div className="panel flex rounded-[8px] p-1">
            <Tab id="log" active={tab} onSelect={setTab}>
              Log
            </Tab>
            <Tab id="today" active={tab} onSelect={setTab}>
              Today
            </Tab>
            <Tab id="trends" active={tab} onSelect={setTab}>
              Trends
            </Tab>
            <Tab id="bets" active={tab} onSelect={setTab}>
              Bets
            </Tab>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "log" && <HomeScreen />}
          {tab === "today" && <Dashboard />}
          {tab === "trends" && <TrendsDashboard />}
          {tab === "bets" && <BetsScreen />}
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
      className="press h-11 flex-1 rounded-[8px] font-pixel text-[13px] font-medium"
      style={{
        background: selected ? "var(--c-ink)" : "transparent",
        color: selected ? "var(--c-paper)" : "var(--c-muted)",
      }}
    >
      {children}
    </button>
  );
}
