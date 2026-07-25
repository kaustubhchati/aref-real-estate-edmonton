// =============================================================================
// amenityPointStyle.js
//
// The visual contract for the Amenity POINT layers (Family 1). ONE style module
// for every amenity point layer — the layer's file, category field and category
// domain all come from the amenities manifest at runtime, so this file holds NO
// per-layer data (refresh-by-design).
//
// FORKED from the Business Census / Industry Specializations point maps (the site's
// one visual language). Inherited EXACTLY, not re-derived (directive §5):
//   • FILL + DARK CASING. The dot is a vivid fill with a DARK casing (#141018) — the
//     casing carries point-symbol accessibility (WCAG 1.4.11 non-text contrast at 3:1,
//     measured against the casing, DESIGN_SYSTEM §4), because a saturated hue cannot
//     clear the 4.5:1 text floor on the warm ground. Applied as a circle-STROKE (the
//     IS significant-dot method, §5.1), so one circle layer per amenity layer.
//   • Radius / stroke = the IS significant-dot spec (PROM_RADIUS / PROM_STROKE_W) — amenity
//     layers are SPARSE (10–659 pts) like significant clusters (KC 2026-07-25). bus_stops
//     (dense) is the §7.2 exception, handled separately.
//   • FLAT symbols — no gradient, no glow (glow failed on IS at city zoom).
//   • Instant paint transitions (duration:0) — no fade on filter/hover.
//   • Hiding = layer FILTER (never opacity:0); a filtered-out category leaves the render
//     AND the hit-test set.
//   • Violet selection ring (--pa-selection-outline) OUTSIDE the dot.
//   • PALETTES: Vivid 10 for ≥6 categories, GTA-bright 5 for ≤5 (directive §5). These are
//     the design-law palettes (DESIGN_SYSTEM §1.4) — the SAME hexes the BC/IS point maps
//     use; mirrored here (not a new palette) so amenities carry no cross-section import to
//     economy's churning internals. Keep in sync with DESIGN_SYSTEM §1.4.
// =============================================================================

import { CITY_BOUNDS } from "../../config/cityBounds.js";
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

// Shared pitched home camera — one camera, every map (mapCamera.js). Re-export the frame
// so the page imports the map framing from one place, like the BC point map.
export const MAP_VIEW = {
  center: [-113.4927, 53.4862],   // matches HOME_VIEW.Edmonton centre (mapCamera.js)
  zoom: 10.3,
  minZoom: 7,
  maxZoom: 18,
  maxBounds: CITY_BOUNDS.Edmonton,
};

// Turn a snake_case field/property key into a readable label, preserving known acronyms
// ("ev_network" -> "EV Network", "lrt_stop_number" -> "LRT Stop Number"; DESIGN_SYSTEM §2
// keeps acronyms upper). Shared by the legend title and the detail rail rows.
const ACRONYMS = new Set(["ev", "lrt", "id", "epsb", "naics"]);
export function amenityLabel(key) {
  return String(key).split("_")
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export const SOURCE_ID       = "amenity-points";
export const DOT_LAYER_ID    = "amenity-dots";
export const SELECT_LAYER_ID = "amenity-select";

// ---- Design-law palettes (DESIGN_SYSTEM §1.4; mirror of the BC/IS point maps) ----
export const POINT_CASING = "#141018";               // shared dark point-symbol casing (§4)
export const VIVID_10 = [                             // ≥6 categories
  "#ff3d6e", "#ffa300", "#e6d800", "#8bd642", "#2fe38b",
  "#00c9a7", "#22c1ff", "#5b7cff", "#b061ff", "#ff45cf",
];
export const GTA_BRIGHT_5 = [                          // ≤5 categories
  "#4d7cff", "#00c9b5", "#ff3d9e", "#00d95a", "#ff7a1a",
];
export const SINGLE_SYMBOL_COLOUR = "#4d7cff";        // no category axis → one hue (GTA blue)
export const UNCATEGORIZED_COLOUR = "#8b98a7";        // match fallback (a category value not in the domain)
const SELECT_COLOUR = "#8b5cf6";                      // --pa-selection-outline (§1.3); MapLibre can't read CSS vars

export const OTHER_KEY = "__other__";  // the synthetic top-N + Other collapse bucket key
export const RESIDUAL_COLOUR = UNCATEGORIZED_COLOUR;   // grey (D5) — null/unknown/residual + Other
const DISPLAY_CAP = 12;   // the most distinct hues one image should carry (D7 ~12-hue ceiling)

// PROVISIONAL palette generator for 11–12 real categories — an even hue rotation so the
// classes are maximally separated for that count (better than extending Vivid-10 into a 4th
// adjacent green, D7). FLAGGED: this is the interim past 10; the ratified categorical palette
// law lands in DESIGN_SYSTEM §1.4 at B4 and replaces this.
function generateHues(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`hsl(${Math.round((360 * i) / n)}, 72%, 56%)`);
  return out;
}
// The palette for N REAL (non-residual) categories: GTA-bright-5 (≤5), Vivid-10 (≤10, the
// ratified BC/IS hexes, unchanged), an even-rotation generation (11–12, provisional, B4).
export function paletteForN(n) {
  if (n <= GTA_BRIGHT_5.length) return GTA_BRIGHT_5;
  if (n <= VIVID_10.length) return VIVID_10;
  return generateHues(n);
}

// Resolve the manifest's category domain into DISPLAY ITEMS the map + legend both read (so
// they can never drift). Each item = { key, label, colour, members[], residual? }.
//   • RESIDUAL classes (manifest residualCategories — Unknown / Non-Networked / …) render GREY
//     and sort LAST (D5).
//   • DISPLAY LABELS come from the manifest categoryLabels (D9 — no raw DB value in the legend).
//   • REAL classes take palette hues. The TOP-N + Other collapse fires ONLY when the tail is
//     worth collapsing — more than DISPLAY_CAP real classes AND a tail of ≥ 3 (D6). A tail of
//     1–2 (e.g. recreation's 11) shows in FULL.
export function resolveDisplayDomain(categories, categoryCounts, categoryLabels = {}, residualCategories = []) {
  if (!categories?.length) return { items: [], hasOther: false, otherCount: 0, note: null };
  const residualSet = new Set(residualCategories);
  const label = (c) => categoryLabels?.[c] || c;
  const real     = categories.filter((c) => !residualSet.has(c));
  const residual = categories.filter((c) => residualSet.has(c));

  let hueItems, hasOther = false, otherCount = 0, note = null;
  if (real.length <= DISPLAY_CAP || real.length - DISPLAY_CAP < 3) {
    const pal = paletteForN(real.length);
    hueItems = real.map((c, i) => ({ key: c, label: label(c), colour: pal[i % pal.length], members: [c] }));
  } else {
    const counts = categoryCounts || {};
    const topSet = new Set([...real].sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).slice(0, DISPLAY_CAP));
    const top  = real.filter((c) => topSet.has(c));   // keep alphabetical for a stable legend/palette
    const rest = real.filter((c) => !topSet.has(c));
    const pal  = paletteForN(DISPLAY_CAP);
    hueItems = top.map((c, i) => ({ key: c, label: label(c), colour: pal[i], members: [c] }));
    hueItems.push({ key: OTHER_KEY, label: "Other", colour: RESIDUAL_COLOUR, members: rest });
    hasOther = true; otherCount = rest.length;
    note = `Top ${DISPLAY_CAP} of ${real.length} by count`;
  }
  // Residuals: grey, appended LAST (D5).
  const residItems = residual.map((c) => ({ key: c, label: label(c), colour: RESIDUAL_COLOUR, members: [c], residual: true }));
  return { items: [...hueItems, ...residItems], hasOther, otherCount, note };
}

// Category → colour, from the resolved domain (the map paint). A single-symbol layer (no
// category field / empty domain) is ONE colour, no match. The "Other" collapse rides the
// match FALLBACK: only the top items are armed, so a collapsed category falls through to
// UNCATEGORIZED_COLOUR (= Other grey).
export function buildColourExpression(categoryField, domain) {
  if (!categoryField || !domain.items.length) return SINGLE_SYMBOL_COLOUR;
  const arms = [];
  for (const it of domain.items) {
    if (it.key === OTHER_KEY) continue;   // Other = the fallback, below
    arms.push(it.members[0], it.colour);  // a top item has exactly one member (the category)
  }
  return ["match", ["get", categoryField], ...arms, UNCATEGORIZED_COLOUR];
}

// Show/hide filter driven by the legend. null = show everything (all items active, or a
// single-symbol layer). Otherwise keep only the active items' MEMBERS (Other's members are
// the collapsed categories) — removed points leave the render AND the hit-test set
// (directive §6, never opacity:0).
export function categoryFilter(categoryField, activeKeys, domain) {
  if (!categoryField) return null;
  if (activeKeys.size === domain.items.length) return null;
  const members = [];
  for (const it of domain.items) if (activeKeys.has(it.key)) members.push(...it.members);
  return ["in", ["get", categoryField], ["literal", members]];
}

// ---- Radius / stroke (the IS significant-dot spec, inherited exactly) -------
const RADIUS   = ["interpolate", ["linear"], ["zoom"], 10, 6, 13, 9, 17, 14];
const STROKE_W = ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 2.0, 16, 2.8];
const RING     = ["interpolate", ["linear"], ["zoom"], 10, 9, 13, 12, 17, 17];   // RADIUS + ~3
const OPACITY  = 0.92;   // near-solid vivid fill; the dark casing + size carry the read

// The dot: vivid fill + DARK casing stroke. Returned WITHOUT `source` (MapView fills it in);
// the page lifts it to the top of the stack in onLoad.
export function dotLayer(colourExpression) {
  return {
    id: DOT_LAYER_ID,
    type: "circle",
    paint: {
      "circle-color": colourExpression,
      "circle-radius": RADIUS,
      "circle-opacity": OPACITY,
      "circle-stroke-color": POINT_CASING,   // the accessibility casing (§4)
      "circle-stroke-width": STROKE_W,
      "circle-opacity-transition":      { duration: 0 },   // instant — no fade on filter/hover (§5)
      "circle-radius-transition":       { duration: 0 },
      "circle-stroke-width-transition": { duration: 0 },
    },
  };
}

// The selection ring — a violet ring OUTSIDE the dot marking the pinned point. Keyed on the
// MapLibre feature id (the source is added with generateId, since amenity layers carry no
// uniform id property); base filter matches nothing until the page sets the pinned id.
export function selectLayer() {
  return {
    id: SELECT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["id"], -1],
    paint: {
      "circle-radius": RING,
      "circle-color": SELECT_COLOUR,
      "circle-opacity": 0,                    // ring only, no fill
      "circle-stroke-color": SELECT_COLOUR,
      "circle-stroke-width": 3,
      "circle-opacity-transition":        { duration: 0 },
      "circle-stroke-opacity-transition": { duration: 0 },
    },
  };
}
