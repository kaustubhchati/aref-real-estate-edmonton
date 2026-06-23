// =============================================================================
// motion.js
//
// Single source of truth for site-wide motion timing. The CSS mirror of these
// lives in :root (--ease / --dur-fast / --dur-base / --dur-slow); this file is
// the JS side MapLibre needs (its paint *-transition takes a raw ms number, not
// a CSS var). Keep the two in sync — same numbers, two consumers.
//
// Everything animated uses these tokens — no ad-hoc durations anywhere.
// =============================================================================

// Master flag — flip to false to compare against no-motion (snap) behaviour.
export const MOTION_PASS = true;

export const EASE = "cubic-bezier(.4,0,.2,1)";
export const DUR_FAST = 150; // hover lifts, popups
export const DUR_BASE = 250; // metric/paint tweens, appear/disappear
export const DUR_SLOW = 400; // source/metric crossfades

// prefers-reduced-motion is mandatory: when the OS asks for reduced motion we
// curtail to instant. Read once at module load (matches the CSS @media guard).
const REDUCE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// MapLibre paint `<prop>-transition` object, gated by the flag + reduced-motion.
// Use on every tweenable paint property (fill-color, fill-opacity, circle-*).
//   paint: { "fill-color-transition": paintTransition(DUR_BASE) }
export function paintTransition(ms = DUR_BASE) {
  return { duration: MOTION_PASS && !REDUCE ? ms : 0, delay: 0 };
}
