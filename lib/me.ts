"use client";

import { useSyncExternalStore } from "react";
import type { Person } from "./bets";

/**
 * Who's holding this phone. A name picked once and kept in localStorage — no
 * password, no account, nothing to sign in to. Clearing the browser just means
 * tapping your name chip again; the record lives in the `people` table.
 */
const KEY = "bb.me";
const listeners = new Set<() => void>();

let cached: Person | null | undefined;

function read(): Person | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cached = parsed && typeof parsed.id === "string" && typeof parsed.name === "string" ? parsed : null;
  } catch {
    cached = null;
  }
  return cached ?? null;
}

export function getMe(): Person | null {
  return typeof window === "undefined" ? null : read();
}

export function setMe(person: Person | null) {
  cached = person;
  try {
    if (person) localStorage.setItem(KEY, JSON.stringify(person));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or storage blocked: the name lasts as long as the tab does.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = undefined;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMe(): Person | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
