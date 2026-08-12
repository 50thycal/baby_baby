/**
 * The handful of palette values that have to exist outside CSS.
 *
 * The real palette lives in `app/globals.css` as custom properties, but three
 * consumers can't read those: the `theme-color` meta tags, the web manifest,
 * and the generated apple-touch icon all need literal hex at build time. They
 * used to hold their own copies, which silently went stale the first time the
 * palette was retuned — the page was warm paper while the iOS status bar was
 * still the old near-white. Keep the copies here, next to each other, so a
 * retune is one edit.
 *
 * `app/icon.svg` is a static file and can't import this; if you change PAPER,
 * INK or ACCENT, change it there too.
 */
export const PAPER = "#eff1e4";
export const PAPER_DARK = "#161a11";
export const INK = "#2f3a26";

/** Deep pine — the ground the app-icon fox sits on. */
export const ACCENT = "#4a7561";
