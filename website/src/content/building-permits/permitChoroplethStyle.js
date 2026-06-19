// =========================================================
// permitChoroplethStyle.js
//
// Visual contract for the Permit Neighbourhoods choropleth.
// Mirrors property-assessment/choroplethStyle.js exactly for
// all map chrome (basemap, layers, states, outlines, hover).
// Permit-specific: metrics, colour ramps, popup rows.
//
// GeoJSON fields (from 03_build_permit_aggregates.R): display_name,
// district, Neighbourhood ID, polygon_state, n_permits,
// total_construction_value, median_construction_value, units_added_total.
// =========================================================

import { fmtCurrency } from "../../utils/format.js";

export const BASEMAP_STYLE = "/styles/custom-basemap.json";

export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 17,
};

// ---- Polygon states — identical to assessment -------------------------
// suppressed_low_n: n_permits < 10 (pipeline gate).
// no_data: polygon has no permit aggregate row at all.
// (non_residential and manufactured_home_community not applicable
//  to permit data — every neighbourhood CAN have permits.)
export const STATE_STYLE = {
  aggregated: {
    label:        "Aggregated (N ≥ 10 permits)",
    fillColor:    null,
    pattern:      null,
    outlineColor: "#ffffff",
    outlineWidth: 0.4,
    outlineDash:  null,
  },
  suppressed_low_n: {
    label:        "Suppressed (N < 10 permits)",
    fillColor:    "rgba(255,255,255,0.08)",
    pattern:      null,
    outlineColor: "#7a7468",
    outlineWidth: 0.7,
    outlineDash:  [2, 2],
  },
  no_data: {
    label:        "No permit data",
    fillColor:    "rgba(255,255,255,0.08)",
    pattern:      null,
    outlineColor: "#5a554c",
    outlineWidth: 0.8,
    outlineDash:  [1, 2],
  },
};

// ---- Metrics ----------------------------------------------------------
const fmtInt = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

export const PERMIT_CHOROPLETH_METRICS = [
  { key: "n_permits",                  label: "Permit count",              fmt: fmtInt      },
  { key: "total_construction_value",   label: "Total construction value",  fmt: fmtCurrency },
  { key: "median_construction_value",  label: "Median construction value", fmt: fmtCurrency },
  { key: "units_added_total",          label: "Units added",               fmt: fmtInt      },
];

// ---- Colour ramps — one per metric (same architecture as assessment) --
// Permit count: YlOrBr amber (earth tones, distinct from assessment)
const RAMP_COUNT = [
  { key: "min",    c: "#fedf9a", label: "min"    },
  { key: "q25",    c: "#fdb455", label: "Q25"    },
  { key: "median", c: "#e87520", label: "median" },
  { key: "q75",    c: "#c04a12", label: "Q75"    },
  { key: "max",    c: "#8b3a12", label: "max"    },
];

// Construction value (total + median): Lajolla warm arc
const RAMP_VALUE = [
  { key: "min",    c: "#f0c97a", label: "min"    },
  { key: "q25",    c: "#d4823a", label: "Q25"    },
  { key: "median", c: "#b03a28", label: "median" },
  { key: "q75",    c: "#872020", label: "Q75"    },
  { key: "max",    c: "#5c0a0a", label: "max"    },
];

// Units added: Purples (distinct from both)
const RAMP_UNITS = [
  { key: "min",    c: "#e0d4f0", label: "min"    },
  { key: "q25",    c: "#b998e0", label: "Q25"    },
  { key: "median", c: "#8a4fcf", label: "median" },
  { key: "q75",    c: "#5c1fa8", label: "Q75"    },
  { key: "max",    c: "#3d0075", label: "max"    },
];

const METRIC_RAMP = {
  n_permits:                 RAMP_COUNT,
  total_construction_value:  RAMP_VALUE,
  median_construction_value: RAMP_VALUE,
  units_added_total:         RAMP_UNITS,
};
const RAMP_DEFAULT = RAMP_COUNT;

// ---- Quantile helper (mirrors assessment) -----------------------------
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- buildStops (mirrors assessment) ---------------------------------
function buildStops(scale, ramp = RAMP_DEFAULT) {
  const stops = ramp.map((r) => ({
    v: scale?.[r.key], c: r.c, label: r.label,
  }));
  const finite    = stops.every((s) => Number.isFinite(s.v));
  const ascending = stops.every(
    (s, i) => i === 0 || s.v > stops[i - 1].v
  );
  return finite && ascending ? stops : null;
}

// Fallback stops for permit count
export const PERMIT_STOPS = buildStops(
  { min: 1, q25: 20, median: 45, q75: 90, max: 300 },
  RAMP_COUNT
);

// Compute ramp stops from loaded GeoJSON quantiles
export function permitMetricStops(gj, metricKey) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.polygon_state !== "aggregated") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return PERMIT_STOPS;
  vals.sort((a, b) => a - b);
  const ps  = [0, 0.25, 0.5, 0.75, 1];
  const raw = ramp.map((r, i) => ({
    v: quantile(vals, ps[i]), c: r.c, label: r.label,
  }));
  const stops = [];
  for (const s of raw) {
    if (stops.length === 0 || s.v > stops[stops.length - 1].v)
      stops.push(s);
  }
  return stops.length >= 2 ? stops : PERMIT_STOPS;
}

// ---- Fill colour expression (mirrors assessment exactly) --------------
function buildFillColourExpression(metricKey, stops) {
  const value = ["number", ["get", metricKey], 0];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);

  return [
    "case",
    ["==", ["get", "polygon_state"], "aggregated"],     interp,
    ["==", ["get", "polygon_state"], "suppressed_low_n"],
      STATE_STYLE.suppressed_low_n.fillColor,
    ["==", ["get", "polygon_state"], "no_data"],
      STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

export function permitChoroplethFillColor(metricKey, stops) {
  return buildFillColourExpression(metricKey, stops);
}

// ---- Layer stack — IDENTICAL to assessment layer IDs/logic -----------
// Source-agnostic (source filled in by MapView via `source` prop).
export function permitChoroplethLayers(stops, metricKey = "n_permits") {
  return [
    // 1. Fill — aggregated: ramp colour; non-aggregated: glass
    {
      id: "pnbhd-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(metricKey, stops),
        "fill-opacity": [
          "case",
          ["==", ["get", "polygon_state"], "aggregated"],
            [
              "case",
              ["boolean", ["feature-state", "hover"],   false], 0.88,
              ["boolean", ["feature-state", "pinned"],  false], 0.88,
              0.74,
            ],
          ["boolean", ["feature-state", "hover"],  false], 0.15,
          ["boolean", ["feature-state", "pinned"], false], 0.15,
          0.04,
        ],
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 2. Solid outline — aggregated (white)
    {
      id: "pnbhd-outline-solid",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "aggregated"],
      paint: {
        "line-color": STATE_STYLE.aggregated.outlineColor,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          7, 0.2, 10, 0.4, 13, 0.8,
        ],
      },
    },
    // 3. Dashed outline — suppressed_low_n
    {
      id: "pnbhd-outline-suppressed",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "suppressed_low_n"],
      paint: {
        "line-color": STATE_STYLE.suppressed_low_n.outlineColor,
        "line-width": STATE_STYLE.suppressed_low_n.outlineWidth,
        "line-dasharray": STATE_STYLE.suppressed_low_n.outlineDash,
      },
    },
    // 4. Dotted outline — no_data
    {
      id: "pnbhd-outline-nodata",
      type: "line",
      filter: ["==", ["get", "polygon_state"], "no_data"],
      paint: {
        "line-color": STATE_STYLE.no_data.outlineColor,
        "line-width": STATE_STYLE.no_data.outlineWidth,
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
    // 5. Hover / pinned highlight outline
    {
      id: "pnbhd-highlight",
      type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], "#0f0f12",
          ["boolean", ["feature-state", "hover"],  false], "#2a2a30",
          "rgba(0,0,0,0)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], 2.4,
          ["boolean", ["feature-state", "hover"],  false], 1.6,
          0,
        ],
      },
    },
    // 6. Neighbourhood name labels (zoom ≥ 11)
    {
      id: "pnbhd-labels",
      type: "symbol",
      minzoom: 11,
      layout: {
        "text-field": ["get", "display_name"],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-anchor": "center",
      },
      paint: {
        "text-color": "#3c3728",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    },
  ];
}

// ---- Popup HTML -------------------------------------------------------
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export const PERMIT_CHOROPLETH_POPUP_ROWS = [
  ["n_permits",                 "Permit count",              fmtInt,      true  ],
  ["total_construction_value",  "Total construction value",  fmtCurrency, false ],
  ["median_construction_value", "Median construction value", fmtCurrency, false ],
  ["units_added_total",         "Units added",               fmtInt,      false ],
];

export function buildPermitChoroplethPopupHtml(p, pinned, year) {
  const state = p.polygon_state;
  const name  = p.display_name ?? "—";

  const parts = [
    `<div class="pop-name">${escapeHtml(name)}</div>`,
  ];
  if (year != null) {
    parts.push(
      `<div class="pop-year">${escapeHtml(String(year))} Permits</div>`
    );
  }

  if (state === "aggregated") {
    const stateLabel = STATE_STYLE.aggregated.label;
    parts.push(
      `<div class="pop-state aggregated">${escapeHtml(stateLabel)}</div>`
    );
    for (const [key, label, fmt, headline] of
         PERMIT_CHOROPLETH_POPUP_ROWS) {
      parts.push(
        `<div class="pop-row${headline ? " headline" : ""}">` +
          `<span class="pop-k">${label}</span>` +
          `<span class="pop-v">${fmt(p[key])}</span>` +
        `</div>`
      );
    }
  } else if (state === "suppressed_low_n") {
    parts.push(
      `<div class="pop-state suppressed_low_n">` +
        `${escapeHtml(STATE_STYLE.suppressed_low_n.label)}</div>`,
      `<div class="pop-row">` +
        `<span class="pop-k">Permit count</span>` +
        `<span class="pop-v">${fmtInt(p.n_permits)}</span>` +
      `</div>`,
      `<div class="pop-reason">Fewer than 10 permits — ` +
        `aggregate values suppressed.</div>`
    );
  } else {
    parts.push(
      `<div class="pop-state no_data">` +
        `${escapeHtml(STATE_STYLE.no_data.label)}</div>`,
      `<div class="pop-reason">No building permits recorded ` +
        `for this neighbourhood in ${year ?? "this year"}.</div>`
    );
  }

  if (pinned) {
    parts.push(
      `<div class="pop-pinned-hint">Click map to dismiss</div>`
    );
  }
  return parts.join("");
}
