// =============================================================================
// permitChoroplethStyle.js
//
// The visual contract for the Building Permits NEIGHBOURHOOD CHOROPLETH — the
// per-neighbourhood aggregate map (distinct from the point map in
// permitStyle.js). Mirrors property-assessment/choroplethStyle.js: one file owns
// every visual constant (view, basemap, metrics + colour stops, the three
// polygon states, the fill expression, the layer specs, the popup), so a colour
// or threshold tweak is a one-file edit (CLAUDE.md §6).
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<year>.geojson
// (407 polygons; produced by pipeline/building-permits/scripts/03_build_permit_aggregates.R).
//
// Simpler than assessment: TWO metrics (toggled live via setPaintProperty) and
// THREE polygon states (aggregated / suppressed_low_n / no_data), vs assessment's
// five. Colour domains are FIXED across years so the scale is comparable
// year-over-year.
// =============================================================================

import { fmtCurrency, fmtNumber } from "../../utils/format.js";

export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 14,
};

export const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// Two metrics the user can toggle between.
// key = GeoJSON property name, label = sidebar display name,
// format = formatter function.
export const METRICS = [
  {
    key:    "n_permits",
    label:  "Permit count",
    format: fmtNumber,
    // Colour stops — fixed domain across all years so the
    // scale is comparable year-over-year.
    // Domain: 0 permits (white) → ~500+ permits (deep red).
    stops: [
      { v:   0, c: "#ffffcc" },
      { v:  25, c: "#fed976" },
      { v:  75, c: "#feb24c" },
      { v: 150, c: "#fd8d3c" },
      { v: 300, c: "#f03b20" },
      { v: 500, c: "#bd0026" },
    ],
  },
  {
    key:    "total_construction_value",
    label:  "Total construction value",
    format: fmtCurrency,
    // Domain: $0 → ~$500M+ (largest neighbourhoods).
    stops: [
      { v:           0, c: "#ffffcc" },
      { v:   5_000_000, c: "#fed976" },
      { v:  25_000_000, c: "#feb24c" },
      { v:  75_000_000, c: "#fd8d3c" },
      { v: 200_000_000, c: "#f03b20" },
      { v: 500_000_000, c: "#bd0026" },
    ],
  },
];
export const DEFAULT_METRIC = METRICS[0];

// Three polygon states — simpler than assessment's 5.
export const STATE_STYLE = {
  aggregated: {
    label:        "Aggregated (N ≥ 10)",
    fillColor:    null,   // colour ramp
    outlineColor: "#ffffff",
    outlineWidth: 0.4,
  },
  suppressed_low_n: {
    label:        "Suppressed (N < 10)",
    fillColor:    "#d8d4cc",
    outlineColor: "#7a7468",
    outlineWidth: 0.7,
    outlineDash:  [2, 2],
  },
  no_data: {
    label:        "No permits",
    fillColor:    "#a8a39a",
    outlineColor: "#5a554c",
    outlineWidth: 0.8,
    outlineDash:  [1, 2],
  },
};
export const GREY_STATES = ["suppressed_low_n", "no_data"];

// Build the fill-color MapLibre expression for one metric.
export function buildFillExpression(metric) {
  const stops = metric.stops;
  const ramp = [
    "interpolate", ["linear"],
    ["number", ["get", metric.key], 0],
  ];
  for (const s of stops) ramp.push(s.v, s.c);

  return [
    "case",
    ["==", ["get", "polygon_state"], "aggregated"], ramp,
    ["==", ["get", "polygon_state"], "suppressed_low_n"],
      STATE_STYLE.suppressed_low_n.fillColor,
    STATE_STYLE.no_data.fillColor,
  ];
}

// Layers — same 3-layer pattern as choroplethStyle.js
// (fill + solid outline + dashed outline).
// Returned without `source`; caller fills it in.
export function permitChoroplethLayers(metric) {
  return [
    {
      id: "permit-nbhd-fill",
      type: "fill",
      paint: {
        "fill-color":   buildFillExpression(metric),
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"],  false], 0.88,
          ["boolean", ["feature-state", "pinned"], false], 0.88,
          0.74,
        ],
      },
    },
    {
      id: "permit-nbhd-outline-solid",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "aggregated"],
      paint: {
        "line-color": STATE_STYLE.aggregated.outlineColor,
        "line-width": STATE_STYLE.aggregated.outlineWidth,
      },
    },
    {
      id: "permit-nbhd-outline-other",
      type: "line",
      filter: ["in", ["get", "polygon_state"],
               ["literal", ["suppressed_low_n", "no_data"]]],
      paint: {
        "line-color": [
          "match", ["get", "polygon_state"],
          "suppressed_low_n", STATE_STYLE.suppressed_low_n.outlineColor,
          STATE_STYLE.no_data.outlineColor,
        ],
        "line-width": [
          "match", ["get", "polygon_state"],
          "suppressed_low_n", STATE_STYLE.suppressed_low_n.outlineWidth,
          STATE_STYLE.no_data.outlineWidth,
        ],
        "line-dasharray": [2, 2],
      },
    },
  ];
}

// Popup for one clicked polygon.
export function buildPermitChoroplethPopupHtml(p, metric) {
  const escHtml = (s) => s == null ? "" :
    String(s).replace(/[&<>"']/g, c =>
      ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

  const state = p.polygon_state;
  const parts = [
    `<div class="pop-name">${escHtml(p.display_name)}</div>`,
  ];
  if (p.district) {
    parts.push(
      `<div class="pop-district">${escHtml(p.district)} district</div>`
    );
  }
  parts.push(
    `<div class="pop-state ${state}">
      ${escHtml(STATE_STYLE[state]?.label ?? state)}
    </div>`
  );

  if (state === "aggregated") {
    const rows = [
      ["n_permits",                 "Permits",            fmtNumber  ],
      ["total_construction_value",  "Total value",        fmtCurrency],
      ["median_construction_value", "Median value",       fmtCurrency],
      ["units_added_total",         "Units added",        fmtNumber  ],
    ];
    for (const [key, label, fmt] of rows) {
      const isHeadline = key === metric.key;
      parts.push(
        `<div class="pop-row${isHeadline ? " headline" : ""}">` +
          `<span class="pop-k">${label}</span>` +
          `<span class="pop-v">${fmt(p[key])}</span>` +
        `</div>`
      );
    }
  } else if (state === "suppressed_low_n") {
    parts.push(
      `<div class="pop-row">` +
        `<span class="pop-k">Permits</span>` +
        `<span class="pop-v pop-v-muted">suppressed (N < 10)</span>` +
      `</div>`,
      `<div class="pop-reason">Fewer than 10 permits — values suppressed.</div>`
    );
  } else {
    parts.push(
      `<div class="pop-reason">No permits recorded in this neighbourhood for the selected year.</div>`
    );
  }
  return parts.join("");
}
