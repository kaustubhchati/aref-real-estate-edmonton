// =============================================================================
// businessCensusGround.js
//
// The WARM ground treatment for the Business Census POINT views (View 1 + View 2).
// KC's closing ruling: ship the vibrant palettes on the WARM site with the dark-casing
// accessibility solution; DARK MODE is EXPLORED + DEFERRED (a possible future program,
// not this work) — DESIGN_SYSTEM.md §1.3. This module holds what ships:
//
//   • CLUSTER_CASING — the DARK local casing (#141018) that carries POINT-SYMBOL
//     accessibility (WCAG 1.4.11 Non-text Contrast, measured against the casing;
//     DESIGN_SYSTEM.md §4). It is independent of ground depth — the casing, not the
//     ground, is the contrast mechanism.
//   • applyDeepenedGround — a COSMETIC ~10% warm-deepening of the point-views' basemap
//     (parcels, buildings, zoning, roads), applied PER INSTANCE so it is contained to
//     THIS section's map; the choropleth and every other section keep their light ground.
//     Richness / grounding only, NOT the contrast mechanism.
//   • THEME — the warm overlay + KDE tokens the section reads (the point views stay
//     warm / academic).
// =============================================================================

// DARK point-symbol casing — the accessibility boundary (WCAG 1.4.11; see DESIGN_SYSTEM §4).
export const CLUSTER_CASING = "#141018";

// Warm overlay + KDE tokens (the point views stay warm/academic).
export const THEME = {
  surfaceOpacity: 0.9,
  nbhdLine: "#6b6049", nbhdInk: "#4a4234",
  districtLine: "#463f31", districtInk: "#3f382c",
  cityInk: "#2a2621", overlayHalo: "#f7f1df",
};

// COSMETIC ground-deepening — pull the warm basemap ~10% toward warm-dark, STAYING in the cream/warm
// family (NOT dark mode). A uniform per-channel scale keeps every hue, just richer + more grounded so
// the vivid dots sit on a less-bleaching field. Tunable 0.85–0.95 (5–15% deeper). Applied per instance
// to the BC point-views map only — the choropleth's light-ground sequential/diverging ramps are never
// touched. Labels + data/point layers are excluded (labels must stay readable; the dots are the data).
export const GROUND_DEEPEN = 0.90;
const DATA_LAYER = /^(nbhd|pnbhd|bcensus|permit|bc-)/;

function deepen(hex, f) {
  if (typeof hex !== "string" || hex[0] !== "#" || hex.length < 7) return null;
  const ch = [1, 3, 5].map((i) =>
    Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function applyDeepenedGround(map) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const id = layer.id, t = layer.type;
    if (DATA_LAYER.test(id) || /^poi/.test(id) || t === "symbol") continue;
    const prop = t === "fill" ? "fill-color"
      : t === "line" ? "line-color"
      : t === "background" ? "background-color" : null;
    if (!prop) continue;
    try {
      const d = deepen(map.getPaintProperty(id, prop), GROUND_DEEPEN);
      if (d) map.setPaintProperty(id, prop, d);
    } catch { /* layer gone / tearing down */ }
  }
}
