import assert from "node:assert/strict";
import { test } from "node:test";
import { isConcurrentCreate } from "../lib/db";

test("isConcurrentCreate: the catalog race two cold starts hit on a new table", () => {
  // Verbatim shape of the production error after the bets deploy.
  assert.ok(
    isConcurrentCreate({
      code: "23505",
      constraint: "pg_type_typname_nsp_index",
      detail: "Key (typname, typnamespace)=(people, 2200) already exists.",
    }),
  );
  assert.ok(isConcurrentCreate({ code: "23505", constraint: "pg_class_relname_nsp_index" }));
});

test("isConcurrentCreate: duplicate table, object and column", () => {
  assert.ok(isConcurrentCreate({ code: "42P07" }));
  assert.ok(isConcurrentCreate({ code: "42710" }));
  assert.ok(isConcurrentCreate({ code: "42701" }));
});

test("isConcurrentCreate: real failures still throw", () => {
  // A unique index over duplicate rows in one of our own tables.
  assert.ok(!isConcurrentCreate({ code: "23505", constraint: "people_name_idx" }));
  assert.ok(!isConcurrentCreate({ code: "23505" }));
  assert.ok(!isConcurrentCreate({ code: "42601" })); // syntax error
  assert.ok(!isConcurrentCreate(new Error("fetch failed")));
  assert.ok(!isConcurrentCreate(null));
});
