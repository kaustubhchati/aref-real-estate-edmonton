// =============================================================================
// permitStyle.js
//
// The visual contract for the Building Permits POINT map (the section's own
// equivalent of property-assessment/choroplethStyle.js). Everything about how a
// permit dot looks lives here: basemap + view defaults, the two job-group
// colours, the construction-value → radius ramp, the single circle-layer spec,
// the popups, and the client-side filter. PermitMapView reads this file and
// nothing else for styling, so a colour/size/threshold tweak is a one-file edit
// (CLAUDE.md §6: data-driven tables, one source of truth).
//
//   • job_group         — "residential" | "commercial" → colour (orange / blue)
//   • construction_value — raw $CAD (NULL → 0)          → radius tier
// =============================================================================

import { fmtCurrency } from "../../utils/format.js";
import { VALUE_BUCKETS, ALL_BUCKET_IDS } from "./dataSources.js";

// ---- Map view defaults (Edmonton) ------------------------------------------
export const BASEMAP_STYLE = "/styles/custom-basemap.json";
// The self-hosted style (same one PropertyAssessmentMap uses). The CDN Voyager
// URL was a temporary workaround while the map rendered blank — the real cause
// was an invalid nested-zoom circle-radius expression, since fixed.

export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 18,
};

// The tippecanoe layer name baked into permits.pmtiles. The circle layer's
// "source-layer" MUST equal this or the source loads but renders nothing.
export const SOURCE_LAYER = "permits";

// The id of the circle layer. Exported so the page can target it with
// map.setFilter(LAYER_ID, …) without restating the string.
export const LAYER_ID = "permits-circles";

// ---- Colour by job_group ---------------------------------------------------
// Orange (residential) vs blue (commercial) — the classic colourblind-safe
// complementary pair, both saturated enough to stand off Voyager's pale palette.
export const COLOURS = {
  residential: "#f57c00",  // deep orange
  commercial:  "#1565c0",  // deep blue
  fallback:    "#9aa0a6",
};

// ["match", job_group, …] → fill colour, built from COLOURS so the table above
// is the only place to edit a hue.
function buildColourExpression() {
  return [
    "match", ["get", "job_group"],
    "residential", COLOURS.residential,
    "commercial",  COLOURS.commercial,
    COLOURS.fallback,
  ];
}

// ---- Size by construction-value TIER ---------------------------------------
// Final radius = zoomBase(zoom) × tierMultiplier(construction_value).
//
// MapLibre rule: a "zoom" expression may only be the input to ONE, TOP-LEVEL
// "step"/"interpolate". So the zoom curve must be the OUTERMOST expression, with
// the value-tier multiplier (a data-driven `case`, not zoom-based) INSIDE each
// stop output. The two patterns MapLibre rejects (both verified against its
// expression validator):
//   • nesting a zoom interpolate inside every output of a construction_value
//     `step` → "Only one zoom-based subexpression may be used" (the old bug);
//   • ["*", ["interpolate", ["zoom"], …], case] → "zoom may only be input to a
//     top-level step/interpolate" (zoom interp isn't outermost).
// This form computes the identical base×tier value but is valid.
function buildRadiusExpression() {
  const v = ["number", ["get", "construction_value"], 0];
  // Data-driven tier multiplier (1.0 = micro floor). Thresholds match the
  // VALUE_BUCKETS boundaries. NOT zoom-based, so it nests freely.
  const tier = [
    "case",
    ["<", v,    10_000], 1.0,
    ["<", v,   100_000], 1.6,
    ["<", v,   500_000], 2.5,
    ["<", v, 2_000_000], 3.8,
    5.5,  // > $2M
  ];

  // The single, top-level zoom curve. Each stop multiplies a zoom base by the
  // tier so dots grow toward street level while keeping value-tier proportions.
  return [
    "interpolate", ["linear"], ["zoom"],
    9,  ["*", 1.8, tier],
    11, ["*", 2.8, tier],
    13, ["*", 4.0, tier],
    16, ["*", 6.0, tier],
    18, ["*", 8.0, tier],
  ];
}

// ---- The circle layer spec -------------------------------------------------
// Returned WITHOUT `source` (PermitMapView fills that in). Colour by job_group,
// size by construction-value tier, white halo so dots stay distinct on the light
// Voyager basemap.
export function permitCircleLayer() {
  return {
    id: LAYER_ID,
    type: "circle",
    "source-layer": SOURCE_LAYER,
    minzoom: 9,
    layout: {
      // Draw commercial (the ~16% minority) ON TOP so it isn't buried under the
      // residential majority (key 1 sorts above key 0).
      "circle-sort-key": ["case",
        ["==", ["get", "job_group"], "commercial"], 1, 0],
    },
    paint: {
      "circle-color":  buildColourExpression(),
      "circle-radius": buildRadiusExpression(),
      "circle-opacity": [
        "interpolate", ["linear"], ["zoom"],
        9, 0.55, 13, 0.75, 18, 0.88,
      ],
      "circle-stroke-width": [
        "interpolate", ["linear"], ["zoom"],
        9, 0.8, 14, 1.5, 18, 2.0,
      ],
      "circle-stroke-color": "rgba(255,255,255,0.9)",
    },
  };
}

// ---- Popups ----------------------------------------------------------------
// `asText` is the section's null convention: null / undefined / "" → em-dash.
const asText = (v) => (v == null || v === "" ? "—" : String(v));

// Strip the City's internal code suffix from building_type.
// "Indoor Recreational Buildings (560)" → "Indoor Recreational Buildings"
const stripBuildingCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/\s*\(\d+\)\s*$/, "").trim();

// Strip the City's internal code prefix from work_type.
// "(03) Interior Alterations" → "Interior Alterations"
const stripWorkCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/^\(\d+\)\s*/, "").trim();

// HTML-escape before interpolating into setHTML() — popup content is the only
// place we hand-build HTML.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// One row per field for the click popup, IN DISPLAY ORDER.
// Tuple: [propertyKey, displayLabel, formatter, isHeadline]. job_description
// leads as the bold headline; job_group is the classification label.
export const PERMIT_POPUP_ROWS = [
  ["job_description",    "Description",        asText,           true ],
  ["address",            "Address",            asText,           false],
  ["job_group",          "Permit type",        asText,           false],
  ["building_type",      "Building type",      stripBuildingCode,false],
  ["work_type",          "Work type",          stripWorkCode,    false],
  ["construction_value", "Construction value", fmtCurrency,      false],
];

export function buildPermitPopupHtml(p) {
  return PERMIT_POPUP_ROWS.map(([key, label, fmt, headline]) => (
    `<div class="pop-row${headline ? " headline" : ""}">` +
      `<span class="pop-k">${label}</span>` +
      `<span class="pop-v">${escapeHtml(fmt(p[key]))}</span>` +
    `</div>`
  )).join("");
}

// Hover popup: a slim two-row preview (address + permit type) shown while the
// pointer is over a dot, distinct from the full click popup.
export function buildPermitHoverHtml(p) {
  return [
    ["address",   "Address",     asText],
    ["job_group", "Permit type", asText],
  ].map(([key, label, fmt]) => (
    `<div class="pop-row">` +
      `<span class="pop-k">${label}</span>` +
      `<span class="pop-v">${escapeHtml(fmt(p[key]))}</span>` +
    `</div>`
  )).join("");
}

// ---- Client-side filter ----------------------------------------------------
// The sidebar controls are MapLibre filters on the already-loaded tile, not data
// swaps. group is the "Permit type" pick ("All" / "Residential" / "Commercial");
// the tile's job_group is lower-case, so we lower-case the picked value. month 0
// is the "All months" sentinel. activeBucketIds is the Set of active value tiers.
export function buildPermitFilter(year, group, month, activeBucketIds) {
  const clauses = [["==", ["get", "year"], year]];

  if (group !== "All") {
    clauses.push(["==", ["get", "job_group"], group.toLowerCase()]);
  }

  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }

  // Bucket filter: independent AND with type + month. A permit shows if it falls
  // in ANY active bucket. All tiers active → no clause (show everything); none
  // active → an impossible clause (show nothing). Infinity max → no upper bound.
  if (activeBucketIds && activeBucketIds.size < ALL_BUCKET_IDS.length) {
    const active = VALUE_BUCKETS.filter((b) => activeBucketIds.has(b.id));
    if (active.length === 0) {
      clauses.push(["==", ["get", "year"], -1]); // show nothing
    } else {
      const bucketClauses = active.map((b) => {
        const val = ["number", ["get", "construction_value"], 0];
        const above = [">=", val, b.min];
        if (b.max === Infinity) return above;
        return ["all", above, ["<", val, b.max]];
      });
      clauses.push(
        bucketClauses.length === 1
          ? bucketClauses[0]
          : ["any", ...bucketClauses]
      );
    }
  }

  return ["all", ...clauses];
}

// Re-export the bucket symbols so BuildingPermitsMap only needs one import
// source (these live in dataSources.js, the option-list seam).
export { VALUE_BUCKETS, ALL_BUCKET_IDS } from "./dataSources.js";
export { DEFAULT_ACTIVE_BUCKETS } from "./dataSources.js";
