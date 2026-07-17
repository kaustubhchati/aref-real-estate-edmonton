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

import { fmtCurrencyShort } from "../../utils/format.js";
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
    legendLabel: "Residential Permits", fmt: fmtInt,
    icon: "M14 3v4a1 1 0 0 0 1 1h4 M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z M9 13h6 M9 17h6" },
  { key: "construction_value", field: "total_construction_value", label: "Construction Value",
    legendLabel: "Residential Construction Value", fmt: fmtCurrencyShort,
    icon: "M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M4 15v-3a6 6 0 0 1 6-6 M14 6a6 6 0 0 1 6 6v3" },
  { key: "units_added", field: "units_added_gross", label: "Dwellings Added",
    legendLabel: "Dwelling Units Added", fmt: fmtInt,
    icon: "M13 22H5a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 .8-1.6l7-5.2a2 2 0 0 1 2.4 0l7 5.2a2 2 0 0 1 .8 1.6V11 M15 18h6 M18 15v6" },
  { key: "units_demolished", field: "units_demolished", label: "Dwellings Demolished",
    legendLabel: "Dwelling Units Demolished", fmt: fmtInt,
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

// ---- Colour interpolation along the ramp (for the quantile fill) -------
// The 5 RAMP_SEQ colours are anchors at even ramp fractions (0, ¼, ½, ¾, 1). rampColorAt(t)
// returns the ramp colour at ANY fraction t∈[0,1] — it lerps the two bracketing anchors in
// sRGB — so the quantile fill below can place a colour at every percentile, not only the 5
// anchors. (The 5-anchor legend gradient is unaffected: it samples the same ramp.)
function hexToRgb(h) {
  const s = h.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((c) => c + c).join("") : s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0");
function lerpHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return "#" + toHex(A[0] + (B[0] - A[0]) * t) + toHex(A[1] + (B[1] - A[1]) * t) + toHex(A[2] + (B[2] - A[2]) * t);
}
function rampColorAt(t) {
  const cols = RAMP_SEQ.map((r) => r.c);                 // 5 anchors, evenly spaced along the ramp
  const x = Math.min(1, Math.max(0, t)) * (cols.length - 1);
  const i = Math.floor(x);
  return i >= cols.length - 1 ? cols[cols.length - 1] : lerpHex(cols[i], cols[i + 1], x - i);
}

// ---- Quantile colour stops (construction value) -----------------------
// The map TWIN of the console's quantile slider. Construction value spans ~4 orders of
// magnitude ($0–$395M, median only $2.28M): the 5-anchor ramp interpolates LINEARLY IN VALUE
// between anchors, so the whole top quartile ($10M–$395M) reads as nearly one colour and a
// p90 neighbourhood is indistinguishable from a p76 one. This lays colour out by PERCENTILE
// instead — colour ∝ the value's rank in the PANEL-WIDE distribution — so equal colour steps
// hold equal shares of neighbourhoods (the choropleth analogue of the slider's "equal drag =
// equal share"). It samples the ramp at CV_STOP_N even percentiles between p2 and p98 (the
// SAME clamp as the slider: min $59k = cream, max $94.77M = red; values outside clamp to the
// end colours), so MapLibre's linear-in-value interpolation between adjacent (close) quantile
// values closely follows colour∝percentile. PANEL-WIDE (all years) ⇒ year-invariant
// (Principle 0): a colour means the same percentile every year and the map agrees with the
// slider. `years` selects the per-year <field>_<year> props from the combined file.
const CV_STOP_N = 24;                                     // ramp samples between p2 and p98
export function quantileColorStops(gj, field, years) {
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    for (const y of years) {
      if (p[`polygon_state_${y}`] !== "aggregated") continue;
      const v = Number(p[`${field}_${y}`]);
      if (Number.isFinite(v) && v > 0) vals.push(v);
    }
  }
  if (vals.length < 2) return SEQ_FALLBACK;
  vals.sort((a, b) => a - b);
  const raw = [];
  for (let k = 0; k <= CV_STOP_N; k++) {
    const t = k / CV_STOP_N;                              // 0..1 = position along the ramp
    const pct = 0.02 + t * 0.96;                          // the panel-wide percentile (p2 … p98)
    raw.push({ v: quantile(vals, pct), c: rampColorAt(t), label: `p${Math.round(pct * 100)}` });
  }
  // interpolate needs STRICTLY ascending inputs — collapse any tied quantiles (keeps the
  // lower-percentile colour at the tie; harmless for a continuous $-distribution).
  const stops = [];
  for (const s of raw) if (!stops.length || s.v > stops[stops.length - 1].v) stops.push(s);
  return stops.length >= 2 ? stops : SEQ_FALLBACK;
}

// ---- Year-keyed field access (combined-file model) --------------------
// The choropleth loads ONE combined all-years file (02b) whose per-year values are
// flat <field>_<year> props; a YEAR change is a paint swap (applyPermitYearMetric),
// not a data reload. yget centralises the suffixing so the expressions read like the
// old bare-name ones. Identity fields (display_name, is_annexation_area) are NOT
// year-keyed. Mirrors PA's choroplethStyle.js.
const yget = (field, year) => ["get", `${field}_${year}`];

// ---- Fill colour expression -------------------------------------------
function sequentialFill(field, stops, year) {
  // A null / -999 sentinel value → no_data colour, caught BEFORE the ramp: an
  // aggregated polygon with no value for THIS metric is no_data, not the ramp min
  // (the bug PA's YOY-10 fixed — a null coerced to 0 painted as "the smallest").
  const MISSING = -999;
  const value = ["number", yget(field, year), MISSING];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);
  const aggregatedFill = ["case", ["==", value, MISSING], STATE_STYLE.no_data.fillColor, interp];

  const state = yget("polygon_state", year);
  return [
    "case",
    ["==", state, "aggregated"],       aggregatedFill,
    ["==", state, "suppressed_low_n"], STATE_STYLE.suppressed_low_n.fillColor,
    ["==", state, "no_data"],          STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

export function choroplethFillColor(metric, stops, year) {
  return sequentialFill(metric.field, stops, year);
}

// Per-feature fill opacity (aggregated bright, non-aggregated glass; hover/pin bump;
// box-select dim). year-keyed (reads polygon_state_<year>) — applyPermitYearMetric
// rebuilds it on a year change. The `dimmed` feature-state channel fades an aggregated
// polygon NOT in the current selection/facet set (box-select), mirroring PA's DIM.
const DIM_OPACITY = 0.12;
export function fillOpacityExpr(year) {
  const state = yget("polygon_state", year);
  // Per-state opacity at an aggregated-fade factor k. Only the AGGREGATED branch scales by
  // k; the glass / suppressed states (0.04–0.15) are already faint and NEVER fade — fading
  // them would erase their honesty encoding. hover/pinned/dimmed stay proportional.
  const stateCase = (k) => [
    "case",
    ["==", state, "aggregated"],
      [
        "case",
        // hover + pinned (selection) stay DOMINANT over the dim — checked first.
        ["boolean", ["feature-state", "hover"],  false], 0.88 * k,
        ["boolean", ["feature-state", "pinned"], false], 0.88 * k,
        ["boolean", ["feature-state", "dimmed"], false], DIM_OPACITY * k,
        0.74 * k,
      ],
    ["boolean", ["feature-state", "hover"],  false], 0.15,
    ["boolean", ["feature-state", "pinned"], false], 0.15,
    0.04,
  ];
  // High-zoom fade (PA F4): ZOOM must be the OUTERMOST expression (MapLibre forbids a nested
  // zoom), so interpolate between two pre-scaled state-cases — hold as-built to z14, ease the
  // aggregated fills to k=0.68 by z16.5 (0.74 → ≈0.50) so streets, buildings and the labels
  // read through at neighbourhood zoom.
  return [
    "interpolate", ["linear"], ["zoom"],
    14, stateCase(1),
    16.5, stateCase(0.68),
  ];
}

// The single fill layer id the component drives. Was a two-layer a/b opacity
// crossfade for metric switches — retired for the combined-file model, where year
// AND metric are both paint swaps on one layer (applyPermitYearMetric), matching PA.
export const FILL_LAYER_ID = "pnbhd-fill";

// ---- Layer stack — pnbhd-* ids (combined-file model) ------------------
// Source-agnostic (source filled in by MapView). ONE fill layer (was a two-layer
// a/b opacity crossfade); year + metric are both paint swaps via applyPermitYearMetric.
// The state outlines filter on polygon_state_<year>; the annexation outline + labels
// are year-invariant. Mirrors PA's choroplethLayers.
export function choroplethLayers(stops, metric, year) {
  return [
    // 1. Fill — the ramp for aggregated, glass for the other states. year-keyed.
    {
      id: "pnbhd-fill",
      type: "fill",
      paint: {
        "fill-color": choroplethFillColor(metric, stops, year),
        // Colour FLOWS old→new on a year/metric/stops change — the reduced-motion-
        // aware tween PA's nbhd-fill uses.
        "fill-color-transition": paintTransition(DUR_BASE),
        "fill-opacity": fillOpacityExpr(year),
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 2. Solid outline — aggregated (white). POLY_OUTLINE_WIDTH is ALREADY a zoom ramp
    //    (choroplethTheme) — used directly, NOT re-wrapped (a nested zoom is invalid).
    {
      id: "pnbhd-outline-solid",
      type: "line",
      filter: ["==", yget("polygon_state", year), "aggregated"],
      paint: {
        "line-color": STATE_STYLE.aggregated.outlineColor,
        "line-width": POLY_OUTLINE_WIDTH,
      },
    },
    // 3. Dashed outline — suppressed_low_n
    {
      id: "pnbhd-outline-suppressed",
      type: "line",
      filter: ["==", yget("polygon_state", year), "suppressed_low_n"],
      paint: {
        "line-color": STATE_STYLE.suppressed_low_n.outlineColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 13, STATE_STYLE.suppressed_low_n.outlineWidth],
        "line-dasharray": STATE_STYLE.suppressed_low_n.outlineDash,
      },
    },
    // 4. Dotted outline — no_data
    {
      id: "pnbhd-outline-nodata",
      type: "line",
      filter: ["==", yget("polygon_state", year), "no_data"],
      paint: {
        "line-color": STATE_STYLE.no_data.outlineColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 13, STATE_STYLE.no_data.outlineWidth],
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
    // 4b. Annexation-area outline (Tier 2 · sub-concern E) — ORTHOGONAL to polygon_state;
    //     flag-driven. Above the state outlines; width zoom-ramped like the siblings.
    {
      id: "pnbhd-outline-annexation",
      type: "line",
      filter: ["==", ["get", "is_annexation_area"], true],
      paint: {
        "line-color":     ANNEXATION_STYLE.outlineColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 13, ANNEXATION_STYLE.outlineWidth],
        "line-dasharray": ANNEXATION_STYLE.outlineDash,
      },
    },
    // 5. Selection CASING — a cream under-stroke BENEATH the violet highlight so a selected
    //    boundary stays legible over deep-red fills. Pinned only. This pair (casing +
    //    highlight) is lifted to the TOP of the stack by the component (moveLayer) — PA P4.
    {
      id: "pnbhd-highlight-casing",
      type: "line",
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "pinned"], false], "#f7f1df", "rgba(0,0,0,0)"],
        "line-width": ["case", ["boolean", ["feature-state", "pinned"], false], 4.4, 0],
      },
    },
    // 6. Highlight outline — hover darkens; selection turns VIOLET + thicker (mirrors PA's
    //    --pa-selection-outline). Violet is distinct from the ramp reds/oranges.
    {
      id: "pnbhd-highlight",
      type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], "#8b5cf6",
          ["boolean", ["feature-state", "hover"],  false], "#2a2a30",
          "rgba(0,0,0,0)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], 2.8,
          ["boolean", ["feature-state", "hover"],  false], 1.6,
          0,
        ],
      },
    },
    // (Neighbourhood NAME labels moved OUT of this array — they now render from a
    //  CLIENT-DERIVED centroid source, added ABOVE everything by the component:
    //  centroidNameLayer / centroidFocusLayer from components/nameLabels.js. This is
    //  why the label mount + reportable filter live in PermitChoroplethMap, not here.)
  ];
}

// ---- Year/metric paint swap (combined-file model) ---------------------
// A year OR metric change with the combined file resident: repaint the ONE fill layer
// + re-filter the state outlines for the new year, in place (no data reload). Mirrors
// PA's applyYearMetric. Guards getLayer so a call mid-teardown is a no-op.
export function applyPermitYearMetric(map, metric, year, stops) {
  if (!map || !map.getLayer(FILL_LAYER_ID)) return;
  map.setPaintProperty(FILL_LAYER_ID, "fill-color", choroplethFillColor(metric, stops, year));
  map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", fillOpacityExpr(year));
  map.setFilter("pnbhd-outline-solid",      ["==", yget("polygon_state", year), "aggregated"]);
  map.setFilter("pnbhd-outline-suppressed", ["==", yget("polygon_state", year), "suppressed_low_n"]);
  map.setFilter("pnbhd-outline-nodata",     ["==", yget("polygon_state", year), "no_data"]);
  // annexation outline + labels are year-invariant — untouched.
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
  ["n_permits",                 "Residential Permits",                  fmtInt],
  ["units_added_gross",         "Dwelling Units Added",                 fmtInt],
  ["units_demolished",          "Dwelling Units Demolished",            fmtInt],
  ["total_construction_value",  "Residential Construction Value",       fmtCurrencyShort],
  ["median_construction_value", "Median Residential Construction Value",fmtCurrencyShort],
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
    parts.push(`<div class="pop-district">${escapeHtml(p.district)} District</div>`);
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
            `<span class="pop-k">Residential Permits</span>` +
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
        `<span class="pop-k">Residential Permits</span>` +
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
