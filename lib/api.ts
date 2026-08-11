"use client";

import useSWR, { mutate } from "swr";
import type { EventsPayload, HomeState, RangeKey, Weight } from "./types";

async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

/** Poll gently — this is a family utility, not a trading terminal. */
const SHARED_OPTS = {
  refreshInterval: 20_000,
  revalidateOnFocus: true,
  keepPreviousData: true,
};

export function useHomeState() {
  return useSWR<HomeState>("/api/state", fetcher, SHARED_OPTS);
}

export function useEvents(range: RangeKey) {
  return useSWR<EventsPayload>(`/api/events?range=${range}`, fetcher, SHARED_OPTS);
}

/**
 * Every weigh-in, always the lot. Weight is a state rather than an event — the
 * current figure has to survive whichever range the timeline is showing — and
 * there are few enough of them that no window is worth the complication.
 */
export function useWeights() {
  return useSWR<Weight[]>("/api/weights", fetcher, SHARED_OPTS);
}

/**
 * Which build the server is serving right now, so a stale tab can notice.
 * Checked rarely — a deploy is not urgent news — but always on refocus, which
 * is when someone has come back to a tab they left open.
 */
export function useVersion() {
  return useSWR<{ build: string; builtAt: string }>(VERSION_KEY, fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
}

const VERSION_KEY = "/api/version";

/**
 * After any write, pull both views back in sync — but not the version check,
 * which has nothing to do with the data and would otherwise fire on every
 * single feed, nappy and nap logged.
 */
export function refreshAll() {
  return mutate(
    (key) => typeof key === "string" && key.startsWith("/api/") && key !== VERSION_KEY,
    undefined,
    { revalidate: true },
  );
}

type Method = "POST" | "PATCH" | "DELETE";

export async function send<T>(method: Method, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(payload?.error ?? `Request failed (${res.status})`) as Error & {
      status?: number;
      payload?: unknown;
    };
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  await refreshAll();
  return payload as T;
}
