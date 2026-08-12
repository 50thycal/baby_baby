import assert from "node:assert/strict";
import { test } from "node:test";
import * as sprites from "../lib/sprites";
import type { Sprite } from "../lib/sprites";

const ALL = Object.entries(sprites).filter(
  (e): e is [string, Sprite] =>
    typeof e[1] === "object" && e[1] !== null && Array.isArray((e[1] as Sprite).art),
);

test("there is a cast at all", () => {
  assert.ok(ALL.length >= 10, `only ${ALL.length} sprites`);
});

for (const [name, sprite] of ALL) {
  test(`${name} is a perfect 16×16 grid`, () => {
    assert.equal(sprite.art.length, 16, `${name} has ${sprite.art.length} rows`);
    sprite.art.forEach((row, i) => {
      assert.equal(row.length, 16, `${name} row ${i} is ${row.length} wide: "${row}"`);
    });
  });

  test(`${name} uses only ASCII and only colours it defines`, () => {
    // A lookalike glyph (Cyrillic о for Latin o) would render as a magenta
    // missing-colour pixel — the classic invisible sprite bug.
    for (const row of sprite.art) {
      assert.match(row, /^[\x20-\x7e]+$/, `${name} contains non-ASCII: "${row}"`);
      for (const ch of row) {
        if (ch === ".") continue;
        assert.ok(sprite.palette[ch], `${name} uses '${ch}' with no palette entry`);
      }
    }
  });

  test(`${name} has an outline and isn't empty`, () => {
    const inked = sprite.art.join("").replace(/\./g, "").length;
    assert.ok(inked > 30, `${name} has only ${inked} pixels`);
  });
}

test("the sleeping owl differs from the waking one only by its eyes", () => {
  const diff = sprites.OWL.art.filter((row, i) => row !== sprites.OWL_ASLEEP.art[i]);
  assert.equal(diff.length, 1, "exactly one row should change");
});
