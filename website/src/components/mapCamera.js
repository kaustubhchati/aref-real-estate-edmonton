// =============================================================================
// mapCamera.js  (shared — the tuned landing camera + camera-preset helper)
//
// The pitched HOME view + the apply helper, shared by every neighbourhood-aggregate map
// (Property Assessment is the standard; Dwelling Units + Business Counts adopt it) so all
// three land + recentre on the SAME cinematic camera. Extracted from PA's choroplethStyle
// (HOME_VIEW) + interactions.js (applyCameraPreset). PA still uses its own copies (byte-
// identical); the de-dup is a deferred follow-up.
//
// HOME is a TUNED pitched preset, NOT a data-derived fit — applied on load, on the reset
// button (when no selection is active), and never touched by the year slider. The flat
// data-derived fit (fitToFeatures / flyToFeature, pitch:0) handles SELECTION + focus
// framing — the two distinct camera concepts. Per-city by design (Calgary gets its own
// when it ships); Edmonton values captured from the design reference.
// =============================================================================

import { reduceMotion, DUR_SLOW } from "./motion.js";

export const HOME_VIEW = {
  Edmonton: { center: [-113.485, 53.515], zoom: 10.5, pitch: 18, bearing: 0 },
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
