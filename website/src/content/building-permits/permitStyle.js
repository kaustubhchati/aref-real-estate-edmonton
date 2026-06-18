// =============================================================================
// permitStyle.js
//
// The visual contract for the Building Permits point map (the section's own
// equivalent of property-assessment/choroplethStyle.js). Everything about how a
// permit dot LOOKS lives here: basemap + view defaults, the two job-group
// colours, the value→radius ramp, and the single circle layer spec that consumes
// them. PermitMapView reads from this file and nothing else for styling, so a
// colour or size tweak is a one-file edit (CLAUDE.md §6: data-driven tables, one
// source of truth).
//
// Two feature properties drive the look:
//   • job_group         — "residential" | "commercial"  → colour
//   • construction_value — raw $CAD, NULL for no-value rows → radius
//
// Scope: colour + size (step 3), plus the click-popup contract (step 4b) — see
// PERMIT_POPUP_ROWS / buildPermitPopupHtml at the bottom.
// =============================================================================

import { fmtCurrency } from "../../utils/format.js";
import { ALL_CATEGORIES } from "./dataSources.js";

// ---- Map view defaults (Edmonton, matches the choropleth) ------------------
// Moved here from PermitMapView so the basemap/view live beside the layer paint,
// exactly like choroplethStyle.js. Single source of truth for the section.
export const BASEMAP_STYLE = "/styles/custom-basemap.json";

export const MAP_VIEW = {
  center: [-113.4938, 53.5461], // Edmonton
  zoom: 9.6,
  minZoom: 7,
  // z18 is the MapLibre/Carto tile ceiling. Street names + building outlines are
  // readable by z16-17, which is where permit-level work is actionable; z14 was
  // still tile-blurry for that.
  maxZoom: 18,
};

// The tippecanoe layer name baked into permits.pmtiles. The circle layer's
// "source-layer" MUST equal this or the source loads but renders nothing.
export const SOURCE_LAYER = "permits";

// The id of the circle layer we add to the map. Exported so the page can target
// it with map.setFilter(LAYER_ID, …) without restating the string.
export const LAYER_ID = "permits-circles";

// The id of the heatmap layer (shown at low zoom, fades out as the circles take
// over around z10–12). Exported for the same reason — the page filters it by id.
export const HEATMAP_LAYER_ID = "permits-heat";

// ---- Colour by job_group ---------------------------------------------------
// The mix is ~84% residential / 16% commercial. If both were the same hot
// colour the map would read as a single mass; if commercial were the muted one
// it would vanish under the residential majority. So residential is the quiet
// BASE (muted slate-blue) and commercial is the SIGNAL (hot orange) — the 16%
// has to pop against the 84%.
export const COLOURS = {
  residential: "#6b8cae", // muted slate-blue — the base
  commercial:  "#e8590c", // hot orange — the signal
  fallback:    "#9aa0a6", // any unexpected/missing job_group → neutral grey
};

// ["match", job_group, ...] → fill colour. Built from COLOURS so the table above
// is the only place to edit a hue.
function buildColourExpression() {
  return [
    "match", ["get", "job_group"],
    "residential", COLOURS.residential,
    "commercial",  COLOURS.commercial,
    COLOURS.fallback,
  ];
}

// ---- Size by construction_value --------------------------------------------
// The spread is brutal: median ~$67k, max ~$480M — roughly four orders of
// magnitude. A LINEAR radius ramp is unusable: scale so the $480M tower is a
// readable dot and every sub-million permit collapses to a single invisible
// pixel; scale so the small ones show and the tower becomes a blob that swallows
// the map. So we TAME the domain with a square root before interpolating —
// sqrt($480M) ≈ 21,900 vs sqrt($67k) ≈ 259, an ~85× span instead of ~7,000×,
// which fits a legible 2–22px radius band. (sqrt, not log: construction_value
// can be 0/NULL, and log(0) is -Infinity. sqrt(0) is a clean 0.)
//
// The value→radius stops are written inline in the zoom-aware expression below,
// in RAW dollars with sqrt applied to each boundary. NULL construction_value
// coalesces to 0 (via ["number", …, 0]) and lands on the first stop → the floor,
// so no-value permits are small but NEVER invisible.
//
// Radius is ALSO zoom-aware: a fixed-pixel ramp is the same size at z7 as z14,
// so low zoom collapses into an unreadable mass and high zoom makes small permits
// invisible. So we interpolate on TWO axes — outer = zoom, inner = sqrt(value):
// dots stay small at the city overview (density reads from overlap) and grow at
// street level (individual permits become legible).
function buildRadiusExpression() {
  // Two-axis interpolation: outer = zoom, inner = construction_value (sqrt-tamed).
  // At z7 (city overview) dots are small — density reads from overlap, not size.
  // At z14 (street level) dots grow — individual permits are legible.
  // The inner sqrt ramp is identical to before; only the scale factor changes.
  const sqrtVal = ["sqrt", ["number", ["get", "construction_value"], 0]];
  return [
    "interpolate", ["linear"], ["zoom"],
    7,  ["interpolate", ["linear"], sqrtVal,
          0,           1.5,
          Math.sqrt(    50_000),  2.5,
          Math.sqrt(   500_000),  4,
          Math.sqrt( 5_000_000),  6,
          Math.sqrt(50_000_000),  9,
          Math.sqrt(480_000_000), 13],
    11, ["interpolate", ["linear"], sqrtVal,
          0,           2.5,
          Math.sqrt(    50_000),  4,
          Math.sqrt(   500_000),  7,
          Math.sqrt( 5_000_000), 11,
          Math.sqrt(50_000_000), 16,
          Math.sqrt(480_000_000), 22],
    14, ["interpolate", ["linear"], sqrtVal,
          0,           3.5,
          Math.sqrt(    50_000),  6,
          Math.sqrt(   500_000), 10,
          Math.sqrt( 5_000_000), 16,
          Math.sqrt(50_000_000), 22,
          Math.sqrt(480_000_000), 30],
  ];
}

// ---- The circle layer spec -------------------------------------------------
// Returned WITHOUT `source` (PermitMapView fills that in), mirroring
// choroplethLayers(). One layer: colour by job_group, size by construction_value,
// semi-transparent so overlapping dots read as density, with a thin dark stroke
// so individual dots stay distinct where they pile up.
export function permitCircleLayer() {
  return {
    id: LAYER_ID,
    type: "circle",
    "source-layer": SOURCE_LAYER,
    // Circles only appear from z10 up, where the heatmap is fading out. Without
    // this floor they'd render UNDER nothing at low zoom (the heatmap owns z9–10)
    // and the two layers would overlap with no clean crossover.
    minzoom: 10,
    paint: {
      "circle-color":  buildColourExpression(),
      "circle-radius": buildRadiusExpression(),
      // Opacity rises with zoom: at low zoom dots pile up, so lower opacity lets
      // density read through the overlap; at street level full(er) opacity makes
      // each dot readable.
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.45, 11, 0.60, 14, 0.75],
      // Stroke widens with zoom in step with the larger dots — a hairline at the
      // overview, a clear outline up close so piled dots stay distinct.
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 0.3, 11, 0.5, 14, 1.0],
      "circle-stroke-color": "rgba(40,40,45,0.5)",
    },
  };
}

// ---- The heatmap layer spec ------------------------------------------------
// Shown at the city overview (maxzoom 12) where 226k individual dots would be an
// unreadable mass. Weight is the sqrt-tamed construction_value (same domain as
// the circle radius), so the heat reads "where the high-value work is", not just
// raw point density. Opacity ramps to 0 by z12 so it hands off cleanly to the
// circle layer (which floors at z10) — a z10–12 crossover where both are partly
// visible, then circles alone above z12.
export function heatmapLayer() {
  return {
    id: HEATMAP_LAYER_ID,
    type: "heatmap",
    "source-layer": SOURCE_LAYER,
    maxzoom: 12,
    paint: {
      "heatmap-weight": [
        "interpolate", ["linear"],
        ["sqrt", ["number", ["get", "construction_value"], 0]],
        0,                        0.1,
        Math.sqrt(   500_000),    0.4,
        Math.sqrt( 5_000_000),    0.7,
        Math.sqrt(50_000_000),    1.0,
      ],
      "heatmap-intensity": [
        "interpolate", ["linear"], ["zoom"],
        9, 0.6,
        12, 1.8,
      ],
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0,   "rgba(0,0,0,0)",
        0.2, "#2166ac",
        0.4, "#74add1",
        0.6, "#fee090",
        0.8, "#f46d43",
        1.0, "#a50026",
      ],
      "heatmap-radius": [
        "interpolate", ["linear"], ["zoom"],
        9, 12,
        12, 20,
      ],
      "heatmap-opacity": [
        "interpolate", ["linear"], ["zoom"],
        10, 1.0,
        12, 0.0,
      ],
    },
  };
}

// ---- Click-popup contract (step 4b) ----------------------------------------
// One row per field shown when a permit dot is clicked, IN DISPLAY ORDER.
// Tuple: [propertyKey, displayLabel, formatter]. Mirrors choroplethStyle.js's
// POPUP_ROWS so both sections' popups read and edit the same way — adding or
// reordering a field is a one-line edit here, consumed by the loop below.
//
// `asText` is the section's null convention: null / undefined / "" render as the
// project em-dash "—" (the same placeholder fmtCurrency already returns), so the
// loop never has to special-case missing values.
const asText = (v) => (v == null || v === "" ? "—" : String(v));

// The fourth tuple element is `headline`: true → the row gets the .pop-row
// headline class (bold value), mirroring choroplethStyle.js's POPUP_ROWS.
// job_description (now carried in the tile) leads as the headline — it's the
// human-readable "what is this permit" line; address follows for orientation.
// Year is intentionally absent — the sidebar already shows the selected year.
export const PERMIT_POPUP_ROWS = [
  ["job_description",    "Description",        asText,      true ],
  ["address",            "Address",            asText,      false],
  ["job_category",       "Job category",       asText,      false],
  ["job_group",          "Permit type",        asText,      false],
  ["building_type",      "Building type",      asText,      false],
  ["work_type",          "Work type",          asText,      false],
  ["construction_value", "Construction value", fmtCurrency, false],
];

// HTML-escape before interpolating into setHTML() — popup content is the only
// place we hand-build HTML. (Same tiny helper as choroplethStyle.js; the two
// sections don't yet share enough popup code to justify extracting it.)
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Build the popup body for one clicked permit feature, row by row from the
// table above. Reuses the global .pop-row / .pop-k / .pop-v CSS (no new styles).
export function buildPermitPopupHtml(p) {
  return PERMIT_POPUP_ROWS.map(([key, label, fmt, headline]) => (
    `<div class="pop-row${headline ? " headline" : ""}">` +
      `<span class="pop-k">${label}</span>` +
      `<span class="pop-v">${escapeHtml(fmt(p[key]))}</span>` +
    `</div>`
  )).join("");
}

// Hover popup: a slim two-row preview (address + category) shown while the
// pointer is over a dot, distinct from the full click-popup above. Same row
// markup and escaping, just a shorter inline field list.
export function buildPermitHoverHtml(p) {
  return [
    ["address",      "Address",      asText],
    ["job_category", "Job category", asText],
  ].map(([key, label, fmt]) => (
    `<div class="pop-row">` +
      `<span class="pop-k">${label}</span>` +
      `<span class="pop-v">${escapeHtml(fmt(p[key]))}</span>` +
    `</div>`
  )).join("");
}

// ---- Client-side filters ---------------------------------------------------
// Both layers read the SAME tile; the sidebar controls are MapLibre filters, not
// data swaps. Lives here (beside the layer specs it filters) so the page just
// picks values and calls setFilter.
//
// WHY ["all", …]: each clause is independent and ALL must hold. Year is always
// constrained (exactly one year at a time). The category and month clauses are
// added only when they aren't the "all" sentinel — dropping a clause means "don't
// filter on that axis" rather than trying to match a non-existent value. month 0
// is the "All months" sentinel (see dataSources MONTHS).
export function buildPermitFilter(year, category, month) {
  const clauses = [["==", ["get", "year"], year]];
  if (category !== ALL_CATEGORIES) {
    clauses.push(["==", ["get", "job_category"], category]);
  }
  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }
  return ["all", ...clauses];
}

// The heatmap reads year + month only — NO category clause. WHY: the heatmap is
// the city-overview "where is the high-value work" view; narrowing it to one of
// 12 categories would gut the density it exists to show. Category filtering is a
// circle-layer (street-level) concern.
export function buildHeatmapFilter(year, month) {
  const clauses = [["==", ["get", "year"], year]];
  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }
  return ["all", ...clauses];
}
