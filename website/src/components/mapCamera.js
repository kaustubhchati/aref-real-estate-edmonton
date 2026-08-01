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
// 10.3 against KC's ~900px window, then set to 10.1 — the STANDARD home zoom for every map
// (KC 2026-07-31). Applied on load + on the reset
// button (no selection); never touched by the year slider. The flat data-derived fit
// (fitToFeatures / flyToFeature, pitch:0) handles SELECTION + focus framing — the two distinct
// camera concepts. NOT refresh-by-design (a literal camera won't track data-extent changes —
// re-dial to re-capture). Per-city by design (Calgary gets its own when it ships).
// =============================================================================

import { reduceMotion, DUR_SLOW } from "./motion.js";

export const HOME_VIEW = {
  Edmonton: { center: [-113.4927, 53.4862], zoom: 10.1, pitch: 18, bearing: 0 },
};

// The ZONING section's home camera (pass 11 §1 — KC's ratified frame): the
// whole city with the annexed boundary inside the VISIBLE frame and
// St. Albert, Sherwood Park and Big Lake in view for orientation; the scale
// control reads 3 km. First solved against KC's screenshot's label anchors
// (z10.275 @53.535), then widened one notch in the §4 re-check so the
// southern annexation clears the always-on bottom console the same pass
// added. KEPT as-was (KC 2026-07-31) when the shared HOME_VIEW was standardized
// to 10.1 — zoning holds its OWN ratified frame (its wider periphery IS data, the
// agricultural families). A documented deviation from the shared HOME_VIEW; same
// capture rules: a design constant, re-dial to re-capture, never data-derived.
export const ZONING_HOME_VIEW = {
  Edmonton: { center: [-113.500, 53.522], zoom: 10.1, pitch: 18, bearing: 0 },
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
