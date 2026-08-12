/**
 * The woodland cast, drawn in 16×16.
 *
 * Each sprite is rows of characters: `.` is transparent, everything else looks
 * its colour up in the sprite's palette. Hand-placed pixels rather than any
 * cleverer format, because pixel art lives or dies by individual pixels and a
 * string grid is the only representation you can proofread.
 *
 * Sprites keep natural fur colours on purpose. The UI around them is soft
 * green and pink; if the critters were tinted to match they'd stop reading as
 * critters and start reading as blobs. An emoji was never theme-coloured
 * either — these take the emoji's job, so they take its rules.
 */

export type Sprite = {
  art: string[];
  palette: Record<string, string>;
};

/** Shared outline — dark bark brown, softer than black, visible on both themes. */
const O = "#463527";

export const FOX: Sprite = {
  palette: { o: O, r: "#cd7342", w: "#f6ead2", b: "#33261a" },
  art: [
    "..oo........oo..",
    ".oro........oro.",
    ".orro......orro.",
    ".orrro....orrro.",
    ".orrrroooorrrro.",
    ".orrrrrrrrrrrro.",
    "orrbbrrrrrrbbrro",
    "orrbwrrrrrrbwrro",
    "orrrrrrrrrrrrrro",
    "owrrrrrrrrrrrrwo",
    "owwrrrwwwwrrrwwo",
    ".orrwwwwwwwwrro.",
    ".orrwwwbbwwwrro.",
    "..orwwwwwwwwro..",
    "...owwwwwwwwo...",
    "....oooooooo....",
  ],
};

export const OWL: Sprite = {
  palette: {
    o: O,
    h: "#9a7a52",
    s: "#7c603e",
    w: "#f6ead2",
    b: "#33261a",
    y: "#d9a441",
    v: "#b59a72",
  },
  art: [
    ".oo..........oo.",
    ".oho........oho.",
    "..oho......oho..",
    "..ohhoooooohho..",
    ".ohhhhhhhhhhhho.",
    "ohhwwwhhhhwwwhho",
    "ohwwwwwhhwwwwwho",
    "ohwwbwwhhwwbwwho",
    "ohwwwwwyywwwwwho",
    "oshwwwhyyhwwwhso",
    "osshhhhhhhhhhsso",
    "osshvhvhvhvhvsso",
    ".oshvhvhvhvhvso.",
    ".oshhhhhhhhhhso.",
    "..ohhhhhhhhhho..",
    "....oyyo..oyyo..",
  ],
};

/** Same owl, eyes shut — the tile swaps to this while she's asleep. */
export const OWL_ASLEEP: Sprite = {
  palette: OWL.palette,
  art: OWL.art.map((row, i) =>
    i === 7 ? "ohwbbbwhhwbbbwho" : row,
  ),
};

export const RABBIT: Sprite = {
  palette: { o: O, g: "#bcaa93", p: "#e4a7b7", w: "#f6ead2", b: "#33261a", n: "#d2708d" },
  art: [
    "...oo.....oo....",
    "..ogpo...ogpo...",
    "..ogpo...ogpo...",
    "..ogpo...ogpo...",
    "..oggooooooggo..",
    ".oggggggggggggo.",
    "oggggggggggggggo",
    "oggbbggggggbbggo",
    "oggggggnnggggggo",
    "ogggggwwwwgggggo",
    ".ogggwwwwwwgggo.",
    ".oggggwwwwggggo.",
    "..oggggggggggo..",
    "...oggggggggo...",
    "....oooooooo....",
    "................",
  ],
};

export const HEDGEHOG: Sprite = {
  palette: { o: O, s: "#6b4f33", d: "#8b6a45", t: "#e0c297", b: "#33261a", n: "#b05a6e" },
  art: [
    "................",
    "......oooo......",
    "....oossssoo....",
    "...osdsdsdsso...",
    "..osdsdsdsdsso..",
    ".osdsdsdsdsdso..",
    ".osdsdsdsdsdsoo.",
    "osdsdsdsdsdsotto",
    "osdsdsdsdsdsotbo",
    "osdsdsdsdsdsotto",
    ".osssssssssottno",
    ".otttttttttttto.",
    "..oo.oo...oo.oo.",
    "................",
    "................",
    "................",
  ],
};

export const FROG: Sprite = {
  palette: { o: O, g: "#7aa653", w: "#f6ead2", b: "#33261a", l: "#e4a7b7" },
  art: [
    "................",
    "................",
    "................",
    "..ooo......ooo..",
    ".ogwbo....obwgo.",
    "oogggoooooogggoo",
    "oggggggggggggggo",
    "oggggggggggggggo",
    "ogllggggggggllgo",
    "ogggggbbbbgggggo",
    ".oggggggggggggo.",
    "..oooooooooooo..",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** Cross little squirrel — the fussy marker. */
export const SQUIRREL: Sprite = {
  palette: { o: O, q: "#9d6a48", Q: "#c08d62", w: "#f6ead2", b: "#33261a" },
  art: [
    "................",
    "..ooo......ooo..",
    ".oqqqo....oqqqo.",
    ".oqqqooooooqqqo.",
    "oqqqqqqqqqqqqqqo",
    "oqqbqqqqqqqqbqqo",
    "oqqqbqqqqqqbqqqo",
    "oqqbbqqqqqqbbqqo",
    "oQqqqqwwwwqqqqQo",
    "oQqqqwwbbwwqqqQo",
    ".oqqqwwwwwwqqqo.",
    ".oqqqqwbbwqqqqo.",
    "..oqqqqqqqqqqo..",
    "...oqqqqqqqqo...",
    "....oooooooo....",
    "................",
  ],
};

export const DROPLET: Sprite = {
  palette: { o: O, b: "#7fb3d1", w: "#dcedf5" },
  art: [
    "................",
    ".......o........",
    "......obo.......",
    "......obo.......",
    ".....obbbo......",
    "....obbbbbo.....",
    "....obbbbbo.....",
    "...obbbbbbbo....",
    "...obwbbbbbo....",
    "...obwbbbbbo....",
    "....obbbbbo.....",
    ".....ooooo......",
    "................",
    "................",
    "................",
    "................",
  ],
};

export const POOP: Sprite = {
  palette: { o: O, b: "#9c6b3f", w: "#f6ead2" },
  art: [
    "................",
    "................",
    ".......oo.......",
    "......obbo......",
    "......obbo......",
    ".....obbbbo.....",
    "....obbbbbbo....",
    "...obbbbbbbbo...",
    "..obbbbbbbbbbo..",
    "..obwbbbbbbwbo..",
    "..obbbbbbbbbbo..",
    "...oooooooooo...",
    "................",
    "................",
    "................",
    "................",
  ],
};

export const BURST: Sprite = {
  palette: { o: O, y: "#e8c14d", n: "#d97b3f" },
  art: [
    "................",
    ".......oo.......",
    "...o..oyyo..o...",
    "....o.oyyo.o....",
    ".....oyynyo.....",
    "..oooyynnyyooo..",
    ".oyyynnnnnnyyyo.",
    "..oooyynnyyooo..",
    ".....oyynyo.....",
    "....o.oyyo.o....",
    "...o..oyyo..o...",
    ".......oo.......",
    "................",
    "................",
    "................",
    "................",
  ],
};

export const BUBBLE: Sprite = {
  palette: { o: O, w: "#f8f6ec", b: "#5a5244" },
  art: [
    "................",
    "..oooooooooooo..",
    ".owwwwwwwwwwwwo.",
    ".owwwwwwwwwwwwo.",
    ".owwwbwwbwwbwwo.",
    ".owwwwwwwwwwwwo.",
    "..oooooooooooo..",
    "....owwo........",
    "....owo.........",
    "....oo..........",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};
