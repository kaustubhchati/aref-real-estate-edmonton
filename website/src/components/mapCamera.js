// =============================================================================
// mapCamera.js  (shared — THE tuned landing camera + camera-preset helper; single source)
//
// The pitched HOME view + the apply helper, shared by EVERY map that lands on the cinematic
// camera: Property Assessment (the standard — it re-exports HOME_VIEW from here), Dwelling
// Units, Business Counts, AND the Building Permits point map. All four land on the SAME camera
// from this ONE definition, so they can never drift.
//
// The Edmonton camera is KC's HAND-RATIFIED capture (not a data-derived fit): centre + pitch
// from the recipe (pan the city under the tuning bay, keep the tilt), zoom dialled visually to
// 10.3 against KC's ~900px window ("a bit more zoom") so the built-up city fills the frame with
// Downtown centred and Chappelle just above the tuning bay. Applied on load + on the reset
// button (no selection); never touched by the year slider. The flat data-derived fit
// (fitToFeatures / flyToFeature, pitch:0) handles SELECTION + focus framing — the two distinct
// camera concepts. NOT refresh-by-design (a literal camera won't track data-extent changes —
// re-dial to re-capture). Per-city by design (Calgary gets its own when it ships).
// =============================================================================

import { reduceMotion, DUR_SLOW } from "./motion.js";

export const HOME_VIEW = {
  Edmonton: { center: [-113.4927, 53.4862], zoom: 10.3, pitch: 18, bearing: 0 },
};

// Apply a tuned camera PRESET (center/zoom/pitch/bearing). easeTo for a gentle landing;
// jumpTo when reduced-motion is on or a snap is asked for (ease:false — e.g. the first
// load under the skeleton). Guarded against a mid-teardown map.
export function applyCameraPreset(map, preset, { ease = true } = {}) {
  if (!map || !preset) return;
  try {
    if (ease && !reduceMotion()) map.easeTo({ ...preset, duration: DUR_SLOW });
    else map.jumpTo(preset);
  } catch {
    /* map removed mid-flight — ignore */
  }
}
