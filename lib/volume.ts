/**
 * Millilitres are what's stored; ounces are what a lot of bottles are marked
 * in. US fluid ounces, the scale on bottles sold in North America — the UK
 * ounce is 4% smaller and would read wrong against them.
 */
export const ML_PER_FL_OZ = 29.5735;

/** 120 → "4.1 oz". One decimal always, so the figure doesn't jump in width. */
export function fmtOz(ml: number): string {
  return `${(ml / ML_PER_FL_OZ).toFixed(1)} oz`;
}
