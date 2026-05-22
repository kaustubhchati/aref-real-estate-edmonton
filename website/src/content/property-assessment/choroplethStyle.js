// =============================================================================
// choroplethStyle.js
//
// The visual contract for the Property Assessment choropleth.
// Ported VERBATIM from pipeline/property-assessment/scripts/09_build_choropleth.html:
// the same stops, the same five polygon states, the same outlines and patterns.
// If you need to tweak a colour or threshold, change it here in one place —
// Legend, MapView paint expressions, and any future popup all read from these
// tables (CLAUDE.md §6: data-driven, single source of truth).
//
// Locked colour-scale domain: PHASE1_STATUS.md §5 — DO NOT recompute per refresh.
// =============================================================================

// ---- Public path served by Vite from website/public/ -----------------------
export const GEOJSON_URL =
  "/data/property-assessment/neighbourhoods_2026_recovered.geojson";

// ---- Map view defaults (Edmonton, matches 09_build_choropleth.html) --------
export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 17,
};

export const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// ---- Locked colour-scale stops (PHASE1_STATUS §5) --------------------------
// v = $CAD threshold, c = fill colour at that stop, label = role in the IQR.
export const STOPS = [
  { v:  103500, c: "#ffffcc", label: "min"    },
  { v:  352625, c: "#fed976", label: "Q25"    },
  { v:  425125, c: "#feb24c", label: "median" },
  { v:  496188, c: "#fd8d3c", label: "Q75"    },
  { v: 1226000, c: "#bd0026", label: "max"    },
];

// ---- The five polygon states ----------------------------------------------
// Aggregated polygons get the colour ramp above. The other four each get a
// distinct grey + (optional) pattern + (optional) dashed outline so the legend
// is honest about WHY a neighbourhood isn't on the ramp.
export const STATE_STYLE = {
  aggregated: {
    label:        "Aggregated (N ≥ 100)",
    fillColor:    null,            // painted from the ramp, not a flat colour
    pattern:      null,
    outlineColor: "#ffffff",
    outlineWidth: 0.4,
    outlineDash:  null,
  },
  suppressed_low_n: {
    label:        "Suppressed (N < 100)",
    fillColor:    "#d8d4cc",
    pattern:      null,
    outlineColor: "#7a7468",
    outlineWidth: 0.7,
    outlineDash:  [2, 2],
  },
  non_residential: {
    label:        "No residential properties",
    fillColor:    "#c9c4ba",
    pattern:      "stripes",
    outlineColor: "#888173",
    outlineWidth: 0.5,
    outlineDash:  null,
  },
  manufactured_home_community: {
    label:        "Manufactured home community",
    fillColor:    "#b8b3a8",
    pattern:      "dots",
    outlineColor: "#7a7468",
    outlineWidth: 0.6,
    outlineDash:  null,
  },
  no_data: {
    label:        "No data (legitimately empty)",
    fillColor:    "#a8a39a",
    pattern:      null,
    outlineColor: "#5a554c",
    outlineWidth: 0.8,
    outlineDash:  [1, 2],
  },
};

// Ordered list of the non-aggregated states — what the legend's "greys" rows show.
export const GREY_STATES = [
  "suppressed_low_n",
  "non_residential",
  "manufactured_home_community",
  "no_data",
];

// ---- Currency formatter (legend labels + future popups) --------------------
export function fmtCurrency(v) {
  if (v == null || isNaN(+v)) return "—";
  return "$" + Math.round(+v).toLocaleString();
}

// ---- Pattern image factories ----------------------------------------------
// Both return ImageData (broad browser support, Safari included) so
// map.addImage can ingest them directly. Called once per map load.
export function makeStripePattern(size = 8, lineColor = "rgba(60,55,42,0.55)") {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let off = -size; off <= size * 2; off += 4) {
    ctx.moveTo(off, 0);
    ctx.lineTo(off + size, size);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

export function makeDotPattern(size = 10, dotColor = "rgba(60,55,42,0.55)") {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 1.5, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

// ---- Fill-colour expression -----------------------------------------------
// case: state == aggregated → linear interpolation over STOPS
// otherwise → that state's flat fillColor (or fallback grey).
function buildFillColourExpression() {
  const interp = ["interpolate", ["linear"], ["number", ["get", "median_assessvalue"], 0]];
  for (const s of STOPS) interp.push(s.v, s.c);

  return [
    "case",
    ["==", ["get", "polygon_state"], "aggregated"],                  interp,
    ["==", ["get", "polygon_state"], "suppressed_low_n"],            STATE_STYLE.suppressed_low_n.fillColor,
    ["==", ["get", "polygon_state"], "non_residential"],             STATE_STYLE.non_residential.fillColor,
    ["==", ["get", "polygon_state"], "manufactured_home_community"], STATE_STYLE.manufactured_home_community.fillColor,
    ["==", ["get", "polygon_state"], "no_data"],                     STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

// ---- Layer specs handed to MapView ----------------------------------------
// One function so the consumer file is short. Layers are in z-order
// (first = bottom). MapView inserts them all below the basemap's labels.
export function choroplethLayers() {
  return [
    // 1. Fill colour for every polygon.
    {
      id: "nbhd-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(),
        "fill-opacity": 0.74,
      },
    },
    // 2. Stripes / dots overlay, restricted to the two pattern states.
    {
      id: "nbhd-pattern",
      type: "fill",
      filter: [
        "in",
        ["get", "polygon_state"],
        ["literal", ["non_residential", "manufactured_home_community"]],
      ],
      paint: {
        "fill-pattern": [
          "match", ["get", "polygon_state"],
          "non_residential",             "stripes",
          "manufactured_home_community", "dots",
          "stripes",
        ],
        "fill-opacity": 0.7,
      },
    },
    // 3. Solid outline for aggregated + structurally-grey states.
    {
      id: "nbhd-outline-solid",
      type: "line",
      filter: [
        "in",
        ["get", "polygon_state"],
        ["literal", ["aggregated", "non_residential", "manufactured_home_community"]],
      ],
      paint: {
        "line-color": [
          "match", ["get", "polygon_state"],
          "non_residential",             STATE_STYLE.non_residential.outlineColor,
          "manufactured_home_community", STATE_STYLE.manufactured_home_community.outlineColor,
          STATE_STYLE.aggregated.outlineColor,
        ],
        "line-width": [
          "match", ["get", "polygon_state"],
          "non_residential",             STATE_STYLE.non_residential.outlineWidth,
          "manufactured_home_community", STATE_STYLE.manufactured_home_community.outlineWidth,
          STATE_STYLE.aggregated.outlineWidth,
        ],
      },
    },
    // 4. Dashed outline for suppressed_low_n.
    {
      id: "nbhd-outline-suppressed",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "suppressed_low_n"],
      paint: {
        "line-color":     STATE_STYLE.suppressed_low_n.outlineColor,
        "line-width":     STATE_STYLE.suppressed_low_n.outlineWidth,
        "line-dasharray": STATE_STYLE.suppressed_low_n.outlineDash,
      },
    },
    // 5. Dotted outline for no_data.
    {
      id: "nbhd-outline-nodata",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "no_data"],
      paint: {
        "line-color":     STATE_STYLE.no_data.outlineColor,
        "line-width":     STATE_STYLE.no_data.outlineWidth,
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
  ];
}

// Pattern images for MapView to register on load (before any layer that
// references them via `fill-pattern`).
export function choroplethImages() {
  return [
    { id: "stripes", make: () => makeStripePattern() },
    { id: "dots",    make: () => makeDotPattern() },
  ];
}
