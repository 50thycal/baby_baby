/**
 * Weights.
 *
 * Stored in grams: it's the unit the paediatrician writes down, and it's an
 * integer, so nothing floating-point ever reaches the database. Shown in pounds
 * and ounces, which is what everyone in this family actually says out loud.
 *
 * The conversion has to survive a round trip — enter "8 lb 4 oz", store 3742,
 * read it back, and get "8 lb 4 oz" again. `tests/weight.test.ts` walks every
 * ounce from zero to forty pounds rather than trusting that the arithmetic
 * happens to work out.
 */
export const GRAMS_PER_OUNCE = 28.349523125;
export const OUNCES_PER_POUND = 16;

/** The wheel's range: nought to forty pounds, in ounce detents. */
export const MAX_OUNCES = 40 * OUNCES_PER_POUND;

/** A sensible place to open the wheel when nothing has been logged yet. */
export const DEFAULT_OUNCES = 8 * OUNCES_PER_POUND;

export function gramsFromOunces(ounces: number): number {
  return Math.round(ounces * GRAMS_PER_OUNCE);
}

export function ouncesFromGrams(grams: number): number {
  return Math.round(grams / GRAMS_PER_OUNCE);
}

export function splitOunces(total: number): { lb: number; oz: number } {
  const lb = Math.floor(total / OUNCES_PER_POUND);
  return { lb, oz: total - lb * OUNCES_PER_POUND };
}

/** "8 lb 4 oz". The ounces stay even at zero — "8 lb" alone reads as a rounding. */
export function fmtWeight(grams: number): string {
  const { lb, oz } = splitOunces(ouncesFromGrams(grams));
  return `${lb} lb ${oz} oz`;
}

/** "3.74 kg", for the appointment where they ask in metric. */
export function fmtKg(grams: number): string {
  return `${(grams / 1000).toFixed(2)} kg`;
}

/**
 * "8.3 lb" — one decimal, for a chart axis where "8 lb 4 oz" is too wide to fit
 * in the gutter. Exact figures are always given in pounds and ounces elsewhere.
 */
export function fmtPounds(grams: number): string {
  const lb = grams / GRAMS_PER_OUNCE / OUNCES_PER_POUND;
  return `${lb.toFixed(1)} lb`;
}

/**
 * The gain between two weigh-ins.
 *
 * Taken in ounces rather than grams, because both readings were entered in
 * ounces and rounded on the way in — differencing the grams can land half an
 * ounce out and report a change that never happened.
 */
export function changeOunces(fromGrams: number, toGrams: number): number {
  return ouncesFromGrams(toGrams) - ouncesFromGrams(fromGrams);
}

/** "+6 oz", "−3 oz", "+1 lb 2 oz". Sign first: gaining is the whole point. */
export function fmtOunceChange(ounces: number): string {
  if (ounces === 0) return "no change";
  const { lb, oz } = splitOunces(Math.abs(ounces));
  const body = lb ? (oz ? `${lb} lb ${oz} oz` : `${lb} lb`) : `${oz} oz`;
  return `${ounces > 0 ? "+" : "−"}${body}`;
}

export type WeightPoint = { grams: number; at: number };

export type WeightTrend = {
  latest: WeightPoint;
  previous: WeightPoint | null;
  /** Since the previous reading. Null when there isn't one. */
  changeOz: number | null;
  /** Ounces a week, averaged across the whole series. Null with one reading. */
  perWeekOz: number | null;
  /** Since the very first reading. */
  totalOz: number;
  spanDays: number;
};

/**
 * What the weight has been doing.
 *
 * Both the per-week rate and the total run from the first reading to the last,
 * not from the last two: weigh-ins land whenever someone remembers, and two
 * that happen to be a day apart would otherwise imply a wildly overstated rate.
 */
export function weightTrend(points: WeightPoint[]): WeightTrend | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.at - b.at);
  const latest = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const first = sorted[0];

  const totalOz = changeOunces(first.grams, latest.grams);
  const spanMs = latest.at - first.at;
  const spanDays = spanMs / 86_400_000;

  return {
    latest,
    previous,
    changeOz: previous ? changeOunces(previous.grams, latest.grams) : null,
    // A span under a day can't support a weekly rate — it would divide a few
    // ounces by a fraction and claim pounds.
    perWeekOz: spanDays >= 1 ? (totalOz / spanDays) * 7 : null,
    totalOz,
    spanDays,
  };
}

/** "gaining 6.5 oz a week" — one decimal, because the number is an average. */
export function fmtRate(perWeekOz: number): string {
  const rounded = Math.round(perWeekOz * 10) / 10;
  if (rounded === 0) return "holding steady";
  const verb = rounded > 0 ? "gaining" : "losing";
  return `${verb} ${Math.abs(rounded)} oz a week`;
}
