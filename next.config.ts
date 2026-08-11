import type { NextConfig } from "next";

/**
 * Stamp the build into the bundle.
 *
 * These have to be inlined at build time rather than read at request time: the
 * whole point is that a tab left open for a week still reports the build it was
 * *loaded from*, so it can notice the server has moved on without it. Values in
 * `env` are substituted into both the server and client bundles by the
 * compiler, so neither side can drift.
 */
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    APP_BUILD_ID: commit ? commit.slice(0, 7) : "dev",
    APP_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
