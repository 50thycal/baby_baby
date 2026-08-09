/**
 * A very short buzz on each dial/wheel detent. iOS Safari ignores
 * `navigator.vibrate`, so the dial also gives visual feedback — this is a
 * bonus on Android, never the only signal.
 */
export function tick(ms = 6) {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(ms);
    } catch {
      // Some browsers throw when the page isn't visible. Never worth crashing over.
    }
  }
}

export function thud() {
  tick(18);
}
