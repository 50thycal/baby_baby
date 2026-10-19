import assert from "node:assert/strict";
import { test } from "node:test";
import { neonConfig } from "@neondatabase/serverless";
import { POST } from "../app/api/sleep/route";

// Exercise the actual route and Neon query serialization, with only the HTTP
// database boundary replaced. No production database or credentials are used.
test("sleep creation keeps completed backfills separate from the live timer", async (t) => {
  const previousUrl = process.env.DATABASE_URL;
  const previousFetch = neonConfig.fetchFunction;
  process.env.DATABASE_URL = "postgresql://test:test@example.invalid/baby";
  const queries: { query: string; params: unknown[] }[] = [];
  let active = true;
  let overlap = false;
  neonConfig.fetchFunction = async (_url: unknown, init: { body: string }) => {
    const request = JSON.parse(init.body);
    queries.push(request);
    const inserted = request.query.includes("INSERT INTO sleep_sessions");
    const selectedActive = request.query.includes("SELECT * FROM sleep_sessions");
    const rows =
      inserted && !overlap
        ? [["backfill", "2026-10-17T23:00:00Z", "2026-10-18T01:00:00Z"]]
        : selectedActive && active
          ? [["live-timer", "2026-10-19T00:00:00Z", null]]
          : [];
    return new Response(
      JSON.stringify({
        fields: [
          { name: "id", dataTypeID: 25 },
          { name: "sleep_start", dataTypeID: 25 },
          { name: "sleep_end", dataTypeID: 25 },
        ],
        rows,
        rowCount: rows.length,
      }),
      { status: 200 },
    );
  };
  const request = (body: object) =>
    new Request("http://localhost/api/sleep", {
      method: "POST",
      body: JSON.stringify(body),
    });
  const past = {
    sleep_start: "2026-10-17T23:00:00Z",
    sleep_end: "2026-10-18T01:00:00Z",
  };
  try {
    await t.test(
      "cross-midnight backfill is one completed insert even while a live sleep exists",
      async () => {
        const response = await POST(request(past));
        assert.equal(response.status, 201);
        assert.equal((await response.json()).id, "backfill");
        const operations = queries.filter((q) => /^\s*(INSERT|SELECT|UPDATE)/.test(q.query));
        assert.equal(operations.length, 1);
        assert.match(
          operations[0].query,
          /INSERT INTO sleep_sessions \(sleep_start, sleep_end, logged_by\)/,
        );
        assert.ok(!queries.some((q) => /UPDATE sleep_sessions/.test(q.query)));
        assert.ok(operations[0].params.includes(new Date(past.sleep_end).toISOString()));
      },
    );
    await t.test(
      "inverted, equal, invalid, and future ends are rejected before querying",
      async () => {
        queries.length = 0;
        for (const end of [
          past.sleep_start,
          "2026-10-17T22:00:00Z",
          "invalid",
          "2099-10-18T01:00:00Z",
        ]) {
          assert.equal((await POST(request({ ...past, sleep_end: end }))).status, 400);
        }
        assert.equal(queries.length, 0);
      },
    );
    await t.test("overlapping naps return a recoverable conflict", async () => {
      overlap = true;
      assert.equal((await POST(request(past))).status, 409);
      overlap = false;
    });
    await t.test("ordinary start-sleep still refuses to replace an active timer", async () => {
      queries.length = 0;
      const response = await POST(request({ sleep_start: past.sleep_start }));
      assert.equal(response.status, 409);
      assert.equal((await response.json()).active.id, "live-timer");
      assert.ok(!queries.some((q) => /INSERT|UPDATE/.test(q.query)));
    });
    await t.test("ordinary start-sleep still starts an open session when awake", async () => {
      active = false;
      queries.length = 0;
      assert.equal((await POST(request({ sleep_start: past.sleep_start }))).status, 201);
      assert.match(queries.at(-1)!.query, /INSERT INTO sleep_sessions \(sleep_start, logged_by\)/);
    });
  } finally {
    neonConfig.fetchFunction = previousFetch;
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
