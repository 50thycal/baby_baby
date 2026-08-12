"use client";

import { useState } from "react";
import AdvancedDashboard from "@/components/AdvancedDashboard";
import Dashboard from "@/components/Dashboard";
import HomeScreen from "@/components/HomeScreen";
import { Toaster } from "@/components/Toaster";
import VersionBar from "@/components/VersionBar";
import { tick } from "@/lib/haptics";

type Tab = "log" | "basic" | "advanced";

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
            <Tab id="basic" active={tab} onSelect={setTab}>
              Basic
            </Tab>
            <Tab id="advanced" active={tab} onSelect={setTab}>
              Advanced
            </Tab>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "log" && <HomeScreen />}
          {tab === "basic" && <Dashboard />}
          {tab === "advanced" && <AdvancedDashboard />}
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
