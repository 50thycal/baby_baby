/**
 * Parser for the bulk-import box.
 *
 * The input is whatever someone types while copying off a paper feeding log, so
 * this is deliberately forgiving: `8/6 2:00am 20`, `08/06  2:00 AM  20 mL` and
 * `8/6 02:00 20` all mean the same thing. What it will NOT do is guess — an
 * unreadable line comes back as an error with its line number so it can be
 * fixed before anything is written.
 *
 * Runs in the browser on purpose. Times on a paper log are local times, and
 * `new Date(y, m, d, h, min)` resolves them in the reader's own zone, so we
 * never have to ask what that zone is or hardcode an offset.
 */
import { DIAPER_TYPES, type DiaperType } from "./types";

export type ParsedEntry =
  | { kind: "feeding"; ts: Date; amount_ml: number; line: number }
  | { kind: "diaper"; ts: Date; type: DiaperType; line: number };

export type ParseError = { line: number; text: string; message: string };

export type ParseResult = {
  entries: ParsedEntry[];
  errors: ParseError[];
};

/** Accepts the spellings people actually write for a diaper. */
const DIAPER_WORDS: Record<string, DiaperType> = {
  pee: "pee",
  wet: "pee",
  poop: "poop",
  poo: "poop",
  dirty: "poop",
  both: "both",
  blowout: "massive_blowout",
  massive: "massive_blowout",
  massive_blowout: "massive_blowout",
};

/**
 * `8/6` has no year on it. Pick the most recent one that isn't in the future —
 * a log being typed up in January can still refer to last December.
 *
 * Compare against the START of the candidate day, not the end. Using end-of-day
 * makes today itself look like it's in the future for most of the day, which
 * silently sends every entry logged today back a full year.
 */
function resolveYear(month: number, day: number, now: Date): number {
  const thisYear = now.getFullYear();
  const dayStart = new Date(thisYear, month - 1, day);
  return dayStart.getTime() > now.getTime() ? thisYear - 1 : thisYear;
}

function parseDate(token: string, now: Date): { month: number; day: number; year: number } | null {
  const m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/.exec(token);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let year: number;
  if (m[3]) {
    const raw = Number(m[3]);
    year = raw < 100 ? 2000 + raw : raw;
  } else {
    year = resolveYear(month, day, now);
  }
  return { month, day, year };
}

/** Returns minutes since midnight, or null. Handles `2:00am`, `2am`, `14:30`. */
function parseClock(token: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(token);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === "pm") hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

/**
 * Splits a line into date / time / rest. The time may be written as one token
 * (`2:00am`) or two (`2:00 am`), so this peeks at the next token before giving
 * up on the merge.
 */
function tokenize(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

export function parseImport(text: string, now = new Date()): ParseResult {
  const entries: ParsedEntry[] = [];
  const errors: ParseError[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    // Allow blank lines and `#` notes so a pasted block can carry headings.
    const line = raw.split("#")[0].trim();
    if (!line) return;

    const push = (message: string) => errors.push({ line: lineNumber, text: raw.trim(), message });

    const tokens = tokenize(line);
    if (tokens.length < 3) return push("Expected: date, time, then amount");

    const date = parseDate(tokens[0], now);
    if (!date) return push(`Couldn't read "${tokens[0]}" as a date`);

    // `2:00 am` arrives as two tokens; try the merge before the single token.
    let minutes = /^(am|pm)$/i.test(tokens[2] ?? "")
      ? parseClock(`${tokens[1]}${tokens[2]}`)
      : null;
    const rest = minutes === null ? tokens.slice(2) : tokens.slice(3);
    if (minutes === null) minutes = parseClock(tokens[1]);
    if (minutes === null) return push(`Couldn't read "${tokens[1]}" as a time`);

    const ts = new Date(date.year, date.month - 1, date.day, 0, minutes);
    if (Number.isNaN(ts.getTime())) return push("That date and time don't exist");
    // JS rolls impossible dates forward (31 Feb becomes 3 March) rather than
    // failing. Round-trip the day to catch that instead of importing it wrong.
    if (ts.getMonth() !== date.month - 1 || ts.getDate() !== date.day) {
      return push(`${tokens[0]} isn't a real date`);
    }

    const rem = rest.join(" ").trim();
    if (!rem) return push("Expected: date, time, then amount");

    // Diaper lines: "8/6 7:36am diaper pee". The word `diaper` is optional if a
    // recognised type is given on its own.
    const words = rem.toLowerCase().replace(/[,]/g, " ").split(/\s+/).filter(Boolean);
    const isDiaper = words[0] === "diaper";
    const typeWord = words.find((w) => w in DIAPER_WORDS);
    if (isDiaper || (typeWord && !/\d/.test(rem))) {
      const type = typeWord ? DIAPER_WORDS[typeWord] : "pee";
      if (!DIAPER_TYPES.includes(type)) return push(`Unknown diaper type "${typeWord}"`);
      entries.push({ kind: "diaper", ts, type, line: lineNumber });
      return;
    }

    const amountMatch = /^(\d+(?:\.\d+)?)\s*(?:ml|mls)?$/i.exec(rem);
    if (!amountMatch) return push(`Couldn't read "${rem}" as an amount in mL`);
    const amount = Math.round(Number(amountMatch[1]));
    if (amount < 0 || amount > 1000) return push(`${amount} mL is outside the allowed range`);

    entries.push({ kind: "feeding", ts, amount_ml: amount, line: lineNumber });
  });

  entries.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  return { entries, errors };
}

/** Groups parsed feedings by local day, for the confirmation summary. */
export function summarise(entries: ParsedEntry[]) {
  const byDay = new Map<string, { label: string; feeds: number; ml: number; diapers: number }>();
  for (const e of entries) {
    const key = `${e.ts.getFullYear()}-${e.ts.getMonth()}-${e.ts.getDate()}`;
    const bucket = byDay.get(key) ?? {
      label: e.ts.toLocaleDateString([], { month: "numeric", day: "numeric" }),
      feeds: 0,
      ml: 0,
      diapers: 0,
    };
    if (e.kind === "feeding") {
      bucket.feeds += 1;
      bucket.ml += e.amount_ml;
    } else {
      bucket.diapers += 1;
    }
    byDay.set(key, bucket);
  }
  return [...byDay.values()];
}
