"use client";

import useSWR, { mutate } from "swr";
import type { EventsPayload, HomeState, RangeKey } from "./types";

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

/** After any write, pull both views back in sync. */
export function refreshAll() {
  return mutate((key) => typeof key === "string" && key.startsWith("/api/"), undefined, {
    revalidate: true,
  });
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
