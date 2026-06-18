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
// One feature property drives the look:
//   • job_group — "residential" | "commercial" → colour (amber / violet)
// Dot SIZE is uniform (zoom-scaled only) — construction_value no longer encodes
// radius; it survives only as a click-popup field.
//
// Scope: colour (the dots) + the heatmap density layer + the click-popup contract
// — see PERMIT_POPUP_ROWS / buildPermitPopupHtml at the bottom.
// =============================================================================

import { fmtCurrency } from "../../utils/format.js";

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
// Amber (residential) vs deep violet (commercial): ~200° of hue separation, both
// absent from CARTO Voyager's blue/green/yellow/beige basemap so dots never blend
// into the map. Amber reads human/housing warmth; violet reads the commercial
// minority and pops against the amber majority.
export const COLOURS = {
  residential: "#f5a623",  // warm amber — absent from Voyager, human/housing
  commercial:  "#7b2d8b",  // deep violet — absent from Voyager, ~200° from amber
  fallback:    "#9aa0a6",  // neutral grey
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

// ---- The circle layer spec -------------------------------------------------
// Returned WITHOUT `source` (PermitMapView fills that in), mirroring
// choroplethLayers(). One layer: colour by job_group, UNIFORM zoom-scaled size
// (no value encoding any more), with a thick white halo so dots stay distinct on
// the light Voyager basemap.
export function permitCircleLayer() {
  return {
    id: LAYER_ID,
    type: "circle",
    "source-layer": SOURCE_LAYER,
    // Below z11 the heatmap carries density; dots at z9 on 226k points are
    // unreadable regardless of colour, so we just don't draw them down there.
    minzoom: 11,
    layout: {
      // Draw commercial (the 16% minority) ON TOP of residential so the violet
      // signal isn't buried under the amber majority (key=1 sorts above key=0).
      "circle-sort-key": ["case",
        ["==", ["get", "job_group"], "commercial"], 1,
        0
      ],
    },
    paint: {
      // Uniform size — zoom-scaled only, no value encoding.
      // At z11 dots are small enough to show density pattern.
      // At z16+ they're large enough to click comfortably.
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        11,  3.5,
        13,  5.5,
        15,  8.0,
        18, 12.0,
      ],
      "circle-color": buildColourExpression(),
      // Opacity: lower at mid-zoom (many overlapping dots),
      // higher at street level (individual permit legibility).
      "circle-opacity": [
        "interpolate", ["linear"], ["zoom"],
        11, 0.70,
        14, 0.85,
        18, 0.92,
      ],
      // White halo stroke: separates dots from basemap and
      // from each other at all zoom levels. White works on
      // Voyager's light background; dark stroke does not.
      "circle-stroke-width": [
        "interpolate", ["linear"], ["zoom"],
        11, 1.0,
        14, 1.5,
        18, 2.0,
      ],
      "circle-stroke-color": "rgba(255,255,255,0.85)",
      "circle-stroke-opacity": 1.0,
    },
  };
}

// ---- The heatmap layer spec ------------------------------------------------
// A density CONTEXT layer at the city overview (maxzoom 12): equal weight per
// point so it shows where permit ACTIVITY concentrates (not where the money is),
// in a neutral lavender→deep-purple ramp that reads as background and doesn't
// compete with the amber/violet dots that fade in at z11+.
export function heatmapLayer() {
  return {
    id: HEATMAP_LAYER_ID,
    type: "heatmap",
    "source-layer": SOURCE_LAYER,
    maxzoom: 12,
    paint: {
      // Equal weight per point — density only, no value bias.
      // WHY: construction_value weighting made commercial
      // towers dominate the heatmap. Equal weight shows where
      // permit ACTIVITY is concentrated, not where money is.
      "heatmap-weight": 1,

      "heatmap-intensity": [
        "interpolate", ["linear"], ["zoom"],
        9, 0.4,
        12, 1.2,
      ],
      // Neutral lavender-purple ramp: absent from Voyager,
      // reads as "background density context" not foreground.
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0,    "rgba(0,0,0,0)",
        0.1,  "rgba(196,180,220,0.3)",
        0.3,  "rgba(160,130,200,0.55)",
        0.6,  "rgba(120,80,170,0.75)",
        0.85, "rgba(90,30,140,0.88)",
        1.0,  "rgba(50,0,100,0.95)",
      ],
      "heatmap-radius": [
        "interpolate", ["linear"], ["zoom"],
        9,  14,
        12, 22,
      ],
      // Full at z9, gone by z12 (dots take over at z11).
      "heatmap-opacity": [
        "interpolate", ["linear"], ["zoom"],
        9,  0.85,
        11, 0.55,
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

// Strip City internal code suffix from building_type.
// "Indoor Recreational Buildings (560)" → "Indoor Recreational Buildings"
const stripBuildingCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/\s*\(\d+\)\s*$/, "").trim();

// Strip City internal code prefix from work_type.
// "(03) Interior Alterations" → "Interior Alterations"
const stripWorkCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/^\(\d+\)\s*/, "").trim();

// The fourth tuple element is `headline`: true → the row gets the .pop-row
// headline class (bold value), mirroring choroplethStyle.js's POPUP_ROWS.
// job_description (now carried in the tile) leads as the headline — it's the
// human-readable "what is this permit" line; address follows for orientation.
// job_category is gone (the sidebar filters by job_group now), so job_group is
// the classification label. Year is absent — the sidebar already shows it.
export const PERMIT_POPUP_ROWS = [
  ["job_description",    "Description",        asText,            true ],
  ["address",            "Address",            asText,            false],
  ["job_group",          "Permit type",        asText,            false],
  ["building_type",      "Building type",      stripBuildingCode, false],
  ["work_type",          "Work type",          stripWorkCode,     false],
  ["construction_value", "Construction value", fmtCurrency,       false],
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
// constrained (exactly one year at a time). The group and month clauses are
// added only when they aren't the "all" sentinel — dropping a clause means "don't
// filter on that axis". group is the sidebar's "Permit type" ("All" /
// "Residential" / "Commercial"); the tile's job_group field is lower-case, so we
// lower-case the picked value to match. month 0 is the "All months" sentinel.
export function buildPermitFilter(year, group, month) {
  const clauses = [["==", ["get", "year"], year]];
  if (group !== "All") {
    clauses.push([
      "==",
      ["get", "job_group"],
      group.toLowerCase(),   // "Residential" → "residential"
    ]);
  }
  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }
  return ["all", ...clauses];
}

// The heatmap now respects the SAME group + month filter as the circle layer, so
// picking "Commercial" reshapes the heat signature to commercial-only (not just
// the dots). Identical clause logic to buildPermitFilter.
export function buildHeatmapFilter(year, group, month) {
  const clauses = [["==", ["get", "year"], year]];
  if (group !== "All") {
    clauses.push([
      "==",
      ["get", "job_group"],
      group.toLowerCase(),
    ]);
  }
  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }
  return ["all", ...clauses];
}
