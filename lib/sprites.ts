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

/* --- The symbols: what the buttons wear. Items, not faces. ----------------- */

export const BOTTLE: Sprite = {
  palette: { o: O, t: "#d98aa4", c: "#c4708e", w: "#e9efe4", m: "#f4e9d0", k: "#c9bda1" },
  art: [
    "......oooo......",
    ".....otttto.....",
    ".....otttto.....",
    "....occcccco....",
    "....occcccco....",
    "...oooooooooo...",
    "...owwwwwwwwo...",
    "...owwwwwwwwo...",
    "...owmmmmmkwo...",
    "...owmmmmmmwo...",
    "...owmmmmmkwo...",
    "...owmmmmmmwo...",
    "...owmmmmmkwo...",
    "....owwwwwwo....",
    ".....oooooo.....",
    "................",
  ],
};

export const MOON: Sprite = {
  palette: { o: O, y: "#e8c14d", s: "#f2d78a" },
  art: [
    "................",
    ".....ooooo......",
    "...ooyyyyyo.....",
    "..oyyyyyyyo.....",
    "..oyyyyooo......",
    ".oyyyyo.....ss..",
    ".oyyyo.....ssss.",
    ".oyyyo......ss..",
    ".oyyyo..........",
    ".oyyyyo.........",
    "..oyyyyooo......",
    "..oyyyyyyyo.....",
    "...ooyyyyyo.....",
    ".....ooooo......",
    "................",
    "................",
  ],
};

/** The same moon with little Zs drifting off it — shown while she's asleep. */
export const MOON_ZZZ: Sprite = {
  palette: { o: O, y: "#e8c14d", z: "#f2d78a" },
  art: [
    "................",
    ".....ooooo......",
    "...ooyyyyyo.....",
    "..oyyyyyyyo.....",
    "..oyyyyooo.zzz..",
    ".oyyyyo.....z...",
    ".oyyyo.....zzz..",
    ".oyyyo..........",
    ".oyyyo.......zzz",
    ".oyyyyo.......z.",
    "..oyyyyooo...zzz",
    "..oyyyyyyyo.....",
    "...ooyyyyyo.....",
    ".....ooooo......",
    "................",
    "................",
  ],
};

export const NAPPY: Sprite = {
  palette: { o: O, w: "#f6f1e2", a: "#dfe6c8", p: "#7d9a4c" },
  art: [
    "................",
    "oo............oo",
    "oaooooooooooooao",
    "oaaaaaappaaaaaao",
    "oaaaaaappaaaaaao",
    "oooooooooooooooo",
    ".owwwwwwwwwwwwo.",
    ".oowwwwwwwwwwoo.",
    "..owwwwwwwwwwo..",
    "..oowwwwwwwwoo..",
    "...owwwwwwwwo...",
    "....owwwwwwo....",
    "....oowwwwoo....",
    ".....owwwwo.....",
    "......oooo......",
    "................",
  ],
};

export const SCALE: Sprite = {
  palette: { o: O, b: "#4a7561", w: "#f6f1e2", n: "#33261a" },
  art: [
    "................",
    "................",
    "..oooooooooooo..",
    "..obbbbbbbbbbo..",
    "..oooooooooooo..",
    ".....obbbbo.....",
    "....obbbbbbo....",
    "...obwwwwwwbo...",
    "...obwwnnwwbo...",
    "...obwwwwwwbo...",
    "..obbbbbbbbbbo..",
    "..oooooooooooo..",
    "................",
    "................",
    "................",
    "................",
  ],
};

/** A little arc of milk coming back up — the spit-up marker. */
export const SPIT: Sprite = {
  palette: { o: O, m: "#ecd9a6" },
  art: [
    "...........oo...",
    "..........ommo..",
    "..........ommo..",
    "...........oo...",
    "................",
    "....ooo.........",
    "...ommmo........",
    "...ommmo........",
    "....ooo.........",
    "................",
    "oo..............",
    "ommmmo..........",
    "ommmmo..........",
    "ommmmo..........",
    ".oooo...........",
    "................",
  ],
};

/** A small storm — the fussy marker. */
export const STORM: Sprite = {
  palette: { o: O, g: "#a7aa9b", y: "#e8c14d" },
  art: [
    "................",
    "................",
    "....oooo........",
    "...oggggoo......",
    "..oggggggoo.....",
    ".oggggggggggo...",
    ".oggggggggggo...",
    "..oooooooooo....",
    "......oyyo......",
    ".....oyyo.......",
    "......oyyo......",
    ".......oyo......",
    "........o.......",
    "................",
    "................",
    "................",
  ],
};

/* --- The walkers: critters that live on the forest floor. ------------------ */

export const FOX_WALK_A: Sprite = {
  palette: { o: O, r: "#cd7342", w: "#f6ead2", b: "#33261a" },
  art: [
    "................",
    "................",
    "..........oo....",
    "..........oroo..",
    ".........orrrro.",
    "oo.......orrbro.",
    "owoo....oorrrrro",
    "owwrooorrrrrrwbo",
    ".owrrrrrrrrrwwoo",
    "..oorrrrrrrrroo.",
    "...orrrrrrrrro..",
    "...orro..orro...",
    "...orro..orro...",
    "...oo.o..oo.o...",
    "................",
    "................",
  ],
};

export const FOX_WALK_B: Sprite = {
  palette: FOX_WALK_A.palette,
  art: [
    "................",
    "................",
    "..........oo....",
    "..........oroo..",
    ".........orrrro.",
    "oo.......orrbro.",
    "owoo....oorrrrro",
    "owwrooorrrrrrwbo",
    ".owrrrrrrrrrwwoo",
    "..oorrrrrrrrroo.",
    "...orrrrrrrrro..",
    "....orro.orro...",
    "....orro.orro...",
    "....oo...oo.....",
    "................",
    "................",
  ],
};

export const RABBIT_HOP_A: Sprite = {
  palette: { o: O, g: "#bcaa93", p: "#e4a7b7", w: "#f6ead2", b: "#33261a" },
  art: [
    "................",
    "...oo...oo......",
    "..ogpo.ogpo.....",
    "..ogpo.ogpo.....",
    "..oggogoggo.....",
    "..oggggggggo....",
    "..ogggggbggo....",
    "..oggggggggoo...",
    ".ogggggggggggo..",
    "owoggggggggggo..",
    "owoggggggggggo..",
    ".oggggggggggo...",
    "..oggo.oggo.....",
    "...oo...oo......",
    "................",
    "................",
  ],
};

/** Mid-hop: legs tucked. The bounce itself is CSS. */
export const RABBIT_HOP_B: Sprite = {
  palette: RABBIT_HOP_A.palette,
  art: RABBIT_HOP_A.art.map((row, i) =>
    i === 12 ? "..oggggggggo...." : i === 13 ? "...oooooooo....." : row,
  ),
};

/** The hedgehog's other stride — HEDGEHOG itself is frame A. */
export const HEDGEHOG_B: Sprite = {
  palette: HEDGEHOG.palette,
  art: HEDGEHOG.art.map((row, i) => (i === 12 ? ".oo.oo...oo.oo.." : row)),
};

export const BUTTERFLY_A: Sprite = {
  palette: { o: O, p: "#d98aa4", b: "#33261a" },
  art: [
    "................",
    "................",
    "................",
    "................",
    ".opo......opo...",
    "opppo....opppo..",
    "oppppo..oppppo..",
    ".opppobbopppo...",
    "..opobbbbopo....",
    "....obbo........",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};

export const BUTTERFLY_B: Sprite = {
  palette: BUTTERFLY_A.palette,
  art: [
    "................",
    "................",
    "................",
    "................",
    "................",
    "..opo....opo....",
    "..oppo..oppo....",
    "...opobbopo.....",
    "....obbbbo......",
    "....obbo........",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
  ],
};
