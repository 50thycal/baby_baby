import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtOz } from "../lib/volume";

test("fmtOz: US fluid ounces, one decimal", () => {
  assert.equal(fmtOz(0), "0.0 oz");
  assert.equal(fmtOz(30), "1.0 oz");
  assert.equal(fmtOz(120), "4.1 oz");
  assert.equal(fmtOz(240), "8.1 oz");
  assert.equal(fmtOz(300), "10.1 oz");
});
