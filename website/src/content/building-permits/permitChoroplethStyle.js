// =========================================================
// permitChoroplethStyle.js
//
// Visual contract for the Dwelling Units choropleth (formerly "Permit
// Neighbourhoods"). Mirrors property-assessment/choroplethStyle.js for all map
// chrome (basemap, layers, states, outlines, hover). Dwelling-Units-specific:
// the FLAT metric list (one field per button), colour ramp, popup rows.
//
// GeoJSON fields (from 03_build_permit_aggregates.R): display_name, district,
// Neighbourhood ID, polygon_state, n_permits, total_construction_value,
// median_construction_value, units_added_gross, units_demolished.
// (yoy_pct_permits still ships in the data but is no longer surfaced — the % YoY
// of permit counts was dropped as not logical, 2026-07-16.)
//
// Metric system: FOUR flat metrics (METRICS), each resolving to ONE GeoJSON field,
// read generically via ["get", field] — retargeting/adding a metric is a table edit
// here; the component never hard-codes a field key. Every metric is sequential (the
// diverging %YoY path was removed with the YoY metric).
// =========================================================

import { fmtCurrency } from "../../utils/format.js";
import { polyOutline, rampFloor, POLY_OUTLINE_WIDTH } from "../../components/choroplethTheme.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";
import { paintTransition, DUR_BASE } from "../../components/motion.js";

// Basemap style is shared + base-resolved; re-exported so consumers here are unchanged.
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

export const MAP_VIEW = {
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid (centres default + constrained view)
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 17,
  maxBounds: CITY_BOUNDS.Edmonton,   // lock pan to the city extent (per-city config)
};

// ---- Polygon states — identical to assessment -------------------------
// suppressed_low_n: n_permits < 10 (pipeline gate).
// no_data: polygon has no permit aggregate row at all.
// (non_residential and manufactured_home_community not applicable to permit
//  data — every neighbourhood CAN have permits.)
export const STATE_STYLE = {
  aggregated: {
    label:        "Aggregated (N ≥ 10 permits)",
    fillColor:    null,
    pattern:      null,
    outlineColor: polyOutline("#ffffff"),
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

// ---- Annexation-area overlay (Tier 2 · sub-concern E) ------------------
// ORTHOGONAL to polygon_state, NOT a fourth state: a polygon can be an annexation
// area AND aggregate permits. It is a SECOND outline composed on top of the state
// outline, driven purely by the is_annexation_area flag — no hardcoded ids, so it
// clears itself when the City subdivides these tiles and the flag clears via the
// crosswalk. Same teal + long-dash treatment as BC and PA.
export const ANNEXATION_STYLE = {
  label:        "Annexation area (annexed, not yet subdivided)",
  fillColor:    "rgba(255,255,255,0.08)",   // glass → legend swatch is outline-only
  pattern:      null,
  outlineColor: "#12a8bd",
  outlineWidth: 1.8,
  outlineDash:  [4, 2],
};

// Categorical (non-ramp) legend rows, passed to <Legend greyStates>. The ramp
// represents "aggregated"; the block shows the suppressed + no_data states + the
// annexation overlay (also fixes finding 13f — these were absent from the legend).
export const LEGEND_STATES = [
  STATE_STYLE.suppressed_low_n,
  STATE_STYLE.no_data,
  ANNEXATION_STYLE,
];

const fmtInt = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

// ---- Metrics — FLAT, one field per button (standardized to PA, 2026-07-16) ----
// Each metric is one GeoJSON field + its label, legend label, value formatter, and
// glyph (icon `d` path, for the PA SegmentedControl chip). Every value reads via
// ["get", field], so retargeting a metric is a table edit here. Mirrors PA's METRICS
// shape {key, field, label, fmt, icon} + the DU legend label. The % YoY of permit
// counts was DROPPED (not logical) — with it went the only diverging ramp, so every
// metric is now sequential.
export const METRICS = [
  { key: "permit_count", field: "n_permits", label: "Permit Count",
    legendLabel: "Residential permits", fmt: fmtInt,
    icon: "M14 3v4a1 1 0 0 0 1 1h4 M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z M9 13h6 M9 17h6" },
  { key: "construction_value", field: "total_construction_value", label: "Construction Value",
    legendLabel: "Residential construction value", fmt: fmtCurrency,
    icon: "M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M4 15v-3a6 6 0 0 1 6-6 M14 6a6 6 0 0 1 6 6v3" },
  { key: "units_added", field: "units_added_gross", label: "Dwellings Added",
    legendLabel: "Dwelling units added", fmt: fmtInt,
    icon: "M13 22H5a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 .8-1.6l7-5.2a2 2 0 0 1 2.4 0l7 5.2a2 2 0 0 1 .8 1.6V11 M15 18h6 M18 15v6" },
  { key: "units_demolished", field: "units_demolished", label: "Dwellings Demolished",
    legendLabel: "Dwelling units demolished", fmt: fmtInt,
    icon: "M13 22H5a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 .8-1.6l7-5.2a2 2 0 0 1 2.4 0l7 5.2a2 2 0 0 1 .8 1.6V11 M15 18h6" },
];

// Default open metric: Dwellings Added (the housing-growth headline).
export const DEFAULT_METRIC = "units_added";

// ---- Colour ramps -----------------------------------------------------
// Sequential: cream → Ferrari red (shared $-value family, matches assessment).
const RAMP_SEQ = [
  { key: "min",    c: rampFloor("#f5f0e8"), label: "min"    },
  { key: "q25",    c: "#f5c4a0", label: "Q25"    },
  { key: "median", c: "#f07840", label: "median" },
  { key: "q75",    c: "#e03818", label: "Q75"    },
  { key: "max",    c: "#cc0000", label: "max"    },
];

// ---- Quantile helper (mirrors assessment) -----------------------------
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// Sequential fallback stops (permit count) when gj hasn't resolved yet.
export const SEQ_FALLBACK = (() => {
  const scale = { min: 1, q25: 20, median: 45, q75: 90, max: 300 };
  return RAMP_SEQ.map((r) => ({ v: scale[r.key], c: r.c, label: r.label }));
})();

// ---- Stops ------------------------------------------------------------
// Sequential: ramp stops from the aggregated polygons' positive-value quantiles.
function sequentialStops(gj, field) {
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.polygon_state !== "aggregated") continue;
    const v = Number(p[field]);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return SEQ_FALLBACK;
  vals.sort((a, b) => a - b);
  const ps  = [0, 0.25, 0.5, 0.75, 1];
  const raw = RAMP_SEQ.map((r, i) => ({
    v: quantile(vals, ps[i]), c: r.c, label: r.label,
  }));
  const stops = [];
  for (const s of raw) {
    if (stops.length === 0 || s.v > stops[stops.length - 1].v) stops.push(s);
  }
  return stops.length >= 2 ? stops : SEQ_FALLBACK;
}

// Every metric is sequential now (the diverging %YoY was dropped).
export function metricStops(gj, metric) {
  return sequentialStops(gj, metric.field);
}

// ---- Fill colour expression -------------------------------------------
function sequentialFill(field, stops) {
  const value = ["number", ["get", field], 0];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);
  return [
    "case",
    ["==", ["get", "polygon_state"], "aggregated"], interp,
    ["==", ["get", "polygon_state"], "suppressed_low_n"],
      STATE_STYLE.suppressed_low_n.fillColor,
    ["==", ["get", "polygon_state"], "no_data"],
      STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

export function choroplethFillColor(metric, stops) {
  return sequentialFill(metric.field, stops);
}

// Per-feature fill opacity (aggregated bright, non-aggregated glass; hover/pin
// bump). Exported because the two-layer crossfade (PermitChoroplethMap) toggles
// a fill layer between this expression (visible) and 0 (hidden).
export const FILL_OPACITY_EXPR = [
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
];

// Two stacked fill layers (a/b) for the dissolve. The IDs the component drives.
export const FILL_LAYER_IDS = ["pnbhd-fill-a", "pnbhd-fill-b"];

// ---- Layer stack — pnbhd-* ids (unchanged source; a/b fills added) -----
// Source-agnostic (source filled in by MapView via `source` prop). The two fill
// layers are identical except their fill-color expression and starting opacity:
// "a" starts visible (FILL_OPACITY_EXPR), "b" starts hidden (0). On a metric
// switch the component paints the new colour onto the hidden layer and
// crossfades opacity (see PermitChoroplethMap). 150ms transition = snappy hover;
// the component bumps it to 500ms only for the duration of a switch.
export function choroplethLayers(stops, metric) {
  const fillColor = choroplethFillColor(metric, stops);
  return [
    // 1a. Fill A — starts visible
    {
      id: "pnbhd-fill-a",
      type: "fill",
      paint: {
        "fill-color": fillColor,
        // Colour FLOWS old→new on a year swap (setData via the shared MapView seam)
        // and on a stops refine — the SAME reduced-motion-aware tween PA's nbhd-fill
        // uses (was relying on MapLibre's non-reduced-motion-aware 300ms default).
        "fill-color-transition": paintTransition(DUR_BASE),
        "fill-opacity": FILL_OPACITY_EXPR,
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 1b. Fill B — starts hidden (same colour; recoloured on first switch)
    {
      id: "pnbhd-fill-b",
      type: "fill",
      paint: {
        "fill-color": fillColor,
        "fill-color-transition": paintTransition(DUR_BASE), // same shared tween as fill-a
        "fill-opacity": 0,
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
        "line-width": POLY_OUTLINE_WIDTH,
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
    // 4b. Annexation-area outline (Tier 2 · sub-concern E) — ORTHOGONAL to
    //     polygon_state. Above the state outlines so the teal border wins where a
    //     polygon is both annexation-area AND aggregates permits. Flag-driven.
    {
      id: "pnbhd-outline-annexation",
      type: "line",
      filter: ["==", ["get", "is_annexation_area"], true],
      paint: {
        "line-color":     ANNEXATION_STYLE.outlineColor,
        "line-width":     ANNEXATION_STYLE.outlineWidth,
        "line-dasharray": ANNEXATION_STYLE.outlineDash,
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
        // Collision avoidance: centred first (keeps the current look), then nudge
        // to an offset anchor instead of dropping the label when crowded.
        "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
        "text-radial-offset": 0.6,
        "text-justify": "auto",
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

// Every resolvable field, for the Tier-3 pinned popup. [field, label, fmt].
export const POPUP_ROWS = [
  ["n_permits",                 "Residential permits",                  fmtInt],
  ["units_added_gross",         "Dwelling units added",                 fmtInt],
  ["units_demolished",          "Dwelling units demolished",            fmtInt],
  ["total_construction_value",  "Residential construction value",       fmtCurrency],
  ["median_construction_value", "Median residential construction value",fmtCurrency],
];

// `detail` selects the tier; `metric` is the active flat metric.
//   detail=false → Tier 2 (slim hover): name + district + active-metric headline
//                  + permit count.
//   detail=true  → Tier 3 (pinned click): name + district + year + state badge
//                  + every row + dismiss hint.
export function buildPopupHtml(p, detail, year, metric) {
  const state = p.polygon_state;
  const name  = p.display_name ?? "—";

  const parts = [`<div class="pop-name">${escapeHtml(name)}</div>`];
  if (p.district) {
    parts.push(`<div class="pop-district">${escapeHtml(p.district)} district</div>`);
  }

  // ---- Tier 2 — slim hover preview ----
  if (!detail) {
    if (state === "aggregated") {
      parts.push(
        `<div class="pop-row headline">` +
          `<span class="pop-k">${escapeHtml(metric.legendLabel)}</span>` +
          `<span class="pop-v">${metric.fmt(p[metric.field])}</span>` +
        `</div>`
      );
      // Always show permit count, unless it is already the headline.
      if (metric.field !== "n_permits") {
        parts.push(
          `<div class="pop-row">` +
            `<span class="pop-k">Residential permits</span>` +
            `<span class="pop-v">${fmtInt(p.n_permits)}</span>` +
          `</div>`
        );
      }
    } else {
      parts.push(`<div class="pop-reason">No permit data for this neighbourhood.</div>`);
    }
    return parts.join("");
  }

  // ---- Tier 3 — full pinned detail ----
  if (year != null) {
    parts.push(`<div class="pop-year">${escapeHtml(String(year))} Dwelling Units</div>`);
  }
  if (state === "aggregated") {
    parts.push(
      `<div class="pop-state aggregated">${escapeHtml(STATE_STYLE.aggregated.label)}</div>`
    );
    for (const [key, label, fmt] of POPUP_ROWS) {
      parts.push(
        `<div class="pop-row${key === metric.field ? " headline" : ""}">` +
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
        `<span class="pop-k">Residential permits</span>` +
        `<span class="pop-v">${fmtInt(p.n_permits)}</span>` +
      `</div>`,
      `<div class="pop-reason">Fewer than 10 permits — ` +
        `aggregate values suppressed.</div>`
    );
  } else {
    parts.push(
      `<div class="pop-state no_data">` +
        `${escapeHtml(STATE_STYLE.no_data.label)}</div>`,
      `<div class="pop-reason">No residential permits recorded ` +
        `for this neighbourhood in ${year ?? "this year"}.</div>`
    );
  }
  parts.push(`<div class="pop-pinned-hint">Click map to dismiss</div>`);
  return parts.join("");
}
