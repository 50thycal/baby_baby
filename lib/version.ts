/**
 * Which build you're looking at.
 *
 * The app is one open URL shared around a family, on phones that keep tabs
 * alive for days. So "is what I'm looking at current?" is a real question, and
 * the answer can't come from the running code alone — it has to be checked
 * against the server. Hence two halves: a stamp baked into this bundle, and a
 * route that reports whatever the server is serving right now.
 */

/** Baked in at compile time by next.config.ts. `dev` when built locally. */
export const BUILD_ID = process.env.APP_BUILD_ID || "dev";
export const BUILT_AT = process.env.APP_BUILT_AT || "";

/** "Aug 11, 2:23 am" — short enough for a 10px line on a phone. */
export function formatBuiltAt(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  const time = d
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .replace(/\s?[AP]M/i, (m) => ` ${m.trim().toLowerCase()}`);

  return `${date}, ${time}`;
}

/** The whole line: when it was built, and exactly which build it is. */
export function versionLabel(builtAt: string, build: string): string {
  const stamp = formatBuiltAt(builtAt);
  return stamp ? `Updated ${stamp} · ${build}` : build;
}

/**
 * Has the server moved on without us?
 *
 * Deliberately silent when it can't tell. A failed check means the network
 * blipped, not that there's an update — and a banner that appears on every
 * flaky request is one people learn to ignore. Local builds are all stamped
 * `dev`, so they never nag either.
 */
export function isStale(serverBuild: string | undefined | null, localBuild: string): boolean {
  if (!serverBuild || !localBuild) return false;
  if (localBuild === "dev" || serverBuild === "dev") return false;
  return serverBuild !== localBuild;
}
