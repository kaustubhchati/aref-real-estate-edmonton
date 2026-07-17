// =========================================================
// businessCensusStyle.js
//
// Visual contract for the Business Counts choropleth (Economy).
// Mirrors building-permits/permitChoroplethStyle.js exactly for
// all map chrome (basemap, layer stack, outlines, hover).
// Economy-specific: two metrics, OrRd ramp, popup rows, and the
// two-state model ("data" / "no_data" — there is no low-N
// suppression in the business census product).
//
// GeoJSON fields (from the economy business-census aggregation):
//   neighbourhood_id, display_name, civic_ward, planning_district,
//   census_state, n_businesses_2025, n_employees_2025,
//   n_businesses_2024, n_employees_2024, yoy_businesses_change,
//   yoy_employees_change, yoy_businesses_pct, yoy_employees_pct
//
// NOTE: the state field is `census_state` (values "data" / "no_data"),
// NOT `polygon_state` — the expressions below read `census_state`.
// =========================================================

import { polyOutline, rampFloor, POLY_OUTLINE_WIDTH } from "../../components/choroplethTheme.js";
import { paintTransition, DUR_BASE } from "../../components/motion.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";

// Basemap style is shared + base-resolved; re-exported so consumers here are unchanged.
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

export const MAP_VIEW = {
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid (centres default + constrained view)
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 17,
  maxBounds: CITY_BOUNDS.Edmonton,   // lock pan to the city extent (per-city config)
};

// ---- Polygon states — two-state model --------------------------------
// data:    neighbourhood has a business-census aggregate row.
// no_data: neighbourhood has no row (rural/undeveloped fringe, etc.).
// (No suppressed_low_n / non_residential / manufactured_home states —
//  the census product does not suppress, it is present or absent.)
export const STATE_STYLE = {
  data: {
    label:        "Business census data",
    fillColor:    null,
    pattern:      null,
    outlineColor: polyOutline("#ffffff"),
    outlineWidth: 0.4,
    outlineDash:  null,
  },
  no_data: {
    label:        "No business census data",
    fillColor:    "rgba(255,255,255,0.08)",
    pattern:      null,
    outlineColor: "#5a554c",
    outlineWidth: 0.8,
    outlineDash:  [1, 2],
  },
};

// ---- Annexation-area overlay (Tier 2 · sub-concern E) ------------------
// ORTHOGONAL to census_state, NOT a third state: a polygon can be an annexation
// area AND carry data (a data polygon keeps its business-count fill AND gains this border).
// So it is a SECOND outline composed on top of the state outline, driven purely
// by the is_annexation_area flag — no hardcoded ids, so it clears itself when the
// City subdivides these tiles and the flag clears via the crosswalk.
// Teal + long-dash: distinct from the data (white solid) and no_data (grey dotted)
// outlines, legible on the light BC/BP themes and the dark PA column.
export const ANNEXATION_STYLE = {
  label:        "Annexation area (annexed, not yet subdivided)",
  fillColor:    "rgba(255,255,255,0.08)",   // glass → legend swatch is outline-only (composes, not a fill state)
  pattern:      null,
  outlineColor: "#12a8bd",
  outlineWidth: 1.8,
  outlineDash:  [4, 2],
};

// Categorical (non-ramp) legend rows, passed to <Legend greyStates>. The colour
// ramp above already represents the "data" state, so the categorical block shows
// the no_data state + the annexation overlay (this also fixes finding 13f — no_data
// was previously absent from the legend, reachable only via the popup).
export const LEGEND_STATES = [
  STATE_STYLE.no_data,
  ANNEXATION_STYLE,
];

// ---- Metrics ----------------------------------------------------------
const fmtInt = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

// Each metric = one GeoJSON field + label + value formatter + glyph (icon `d` path for
// the PA SegmentedControl chip, mirroring PA/DU's METRICS shape {key,label,fmt,icon}).
// The "(2025)" stays in the label — it is the survey year and BC has no year axis to
// carry it (single-survey-year product; the year is a parked literal, bc-parity-parked).
export const METRICS = [
  { key: "n_businesses_2025", label: "Businesses (2025)", fmt: fmtInt,
    icon: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4" },
  { key: "n_employees_2025",  label: "Employees (2025)",  fmt: fmtInt,
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 0 0 0-8 4 4 0 0 0 0 8Z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75" },
];

// ---- Colour ramp — soft-yellow floor → Ferrari red (shared $-value family) --------
// The SAME anchors as property-assessment's RAMP_ASSESSED so $-and-count choropleths read the
// same across the site: warm cream → AMBER → orange-red → scarlet → Ferrari red. The low band
// is amber (#f5a02e), NOT a pale peach — a pale low band merged into the cream floor at lower
// values once the quantile ramp spread the bulk across the low percentiles. Keep in sync with
// PA's RAMP_ASSESSED. Both metrics use this same ramp; values are heavily right-skewed
// (businesses max ~1950, employees max ~89016) so the stop VALUES come from quantiles.
//
// label is "" on every stop on purpose: these are quantile descriptors
// (min/Q25/…), not meaningful category names, and the shared Legend would
// otherwise print the descriptor as a second line bleeding behind the
// numeric stop value. Empty label → Legend renders only the formatted
// number. `key` still drives the buildStops scale lookup.
const RAMP_ORRD = [
  { key: "min",    c: rampFloor("#f5f0e8"), label: "" }, // shared floor #fbe3a0
  { key: "q25",    c: "#f5a02e", label: "" }, // amber
  { key: "median", c: "#ec6f2e", label: "" }, // orange-red
  { key: "q75",    c: "#e0381c", label: "" }, // scarlet
  { key: "max",    c: "#cc0000", label: "" }, // Ferrari
];

const METRIC_RAMP = {
  n_businesses_2025: RAMP_ORRD,
  n_employees_2025:  RAMP_ORRD,
};
const RAMP_DEFAULT = RAMP_ORRD;

// ---- Quantile helper (mirrors permit/assessment) ----------------------
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- buildStops (mirrors permit/assessment) ---------------------------
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

// Fallback stops (businesses) used until the GeoJSON resolves.
export const BCENSUS_STOPS = buildStops(
  { min: 1, q25: 15, median: 40, q75: 110, max: 1950 },
  RAMP_ORRD
);

// Compute ramp stops from loaded GeoJSON quantiles — only "data" polygons,
// [0%, 25%, 50%, 75%, 100%]. Same pattern as permitMetricStops.
export function bcensusMetricStops(gj, metricKey) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.census_state !== "data") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return BCENSUS_STOPS;
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
  return stops.length >= 2 ? stops : BCENSUS_STOPS;
}

// ---- Colour interpolation along the ramp (for the quantile fill) -------
// The 5 RAMP_ORRD colours are anchors at even ramp fractions (0, ¼, ½, ¾, 1). rampColorAt
// returns the ramp colour at ANY fraction t∈[0,1] — it lerps the two bracketing anchors in
// sRGB — so the quantile fill below can place a colour at every percentile, not only the 5
// anchors. (Mirrors the permit map; a shared home for these helpers is a deferred de-dup.)
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
function rampColorAt(ramp, t) {
  const cols = ramp.map((r) => r.c);                      // 5 anchors, evenly spaced along the ramp
  const x = Math.min(1, Math.max(0, t)) * (cols.length - 1);
  const i = Math.floor(x);
  return i >= cols.length - 1 ? cols[cols.length - 1] : lerpHex(cols[i], cols[i + 1], x - i);
}

// ---- Quantile colour stops (colour ∝ percentile) ----------------------
// The live map's ramp — the same treatment as the permit map's construction value, and it
// SUPERSEDES bcensusMetricStops (the 5-anchor version above, kept for reference). Both BC
// metrics are heavily right-skewed (businesses median 28 / max ~1,900; employees median 421 /
// max ~89,000 — the median sits at ~1% of a linear [min,max] track), so the 5-anchor ramp,
// which interpolates LINEARLY IN VALUE between anchors, paints the whole top quartile as
// nearly one colour. This lays colour out by PERCENTILE instead — sampling the ramp at
// BC_STOP_N even percentiles between p2 and p98 — so equal colour steps hold equal shares of
// neighbourhoods (a downtown at p99 looks distinctly darker than a p80). Single survey year,
// so there is no panel/year axis: the quantile is over the one year's "data" polygons. Ends
// clamp to p2/p98 (robust); values outside clamp to the end colours.
const BC_STOP_N = 24;                                     // ramp samples between p2 and p98
export function bcensusQuantileColorStops(gj, metricKey) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.census_state !== "data") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return BCENSUS_STOPS;
  vals.sort((a, b) => a - b);
  const raw = [];
  for (let k = 0; k <= BC_STOP_N; k++) {
    const t = k / BC_STOP_N;                              // 0..1 = position along the ramp
    const pct = 0.02 + t * 0.96;                          // the percentile (p2 … p98)
    raw.push({ v: quantile(vals, pct), c: rampColorAt(ramp, t), label: "" });
  }
  // interpolate needs STRICTLY ascending inputs — collapse tied quantiles (integer counts tie
  // more than $-values do; keeping the lower-percentile colour at a tie is harmless).
  const stops = [];
  for (const s of raw) if (!stops.length || s.v > stops[stops.length - 1].v) stops.push(s);
  return stops.length >= 2 ? stops : BCENSUS_STOPS;
}

// ---- Fill colour expression (mirrors permit/assessment) ---------------
function buildFillColourExpression(metricKey, stops) {
  const value = ["number", ["get", metricKey], 0];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);

  return [
    "case",
    ["==", ["get", "census_state"], "data"],    interp,
    ["==", ["get", "census_state"], "no_data"],
      STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

export function bcensusFillColor(metricKey, stops) {
  return buildFillColourExpression(metricKey, stops);
}

// Per-state fill opacity at an aggregated-fade factor k. Only the `data` branch scales by k;
// the glass no_data states (0.04–0.15) never fade — that faintness is their honesty encoding.
// Two pre-scaled copies drive the high-zoom fade in the fill layer below.
const dataFillOpacity = (k) => [
  "case",
  ["==", ["get", "census_state"], "data"],
    [
      "case",
      ["boolean", ["feature-state", "hover"],  false], 0.88 * k,
      ["boolean", ["feature-state", "pinned"], false], 0.88 * k,
      0.74 * k,
    ],
  ["boolean", ["feature-state", "hover"],  false], 0.15,
  ["boolean", ["feature-state", "pinned"], false], 0.15,
  0.04,
];

// ---- Layer stack — bcensus-* ids (no collision with nbhd-* / pnbhd-*) -
// Source-agnostic (source filled in by MapView via `source` prop).
export function bcensusLayers(stops, metricKey = "n_businesses_2025") {
  return [
    // 1. Fill — data: ramp colour; no_data: glass
    {
      id: "bcensus-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(metricKey, stops),
        // Tween the colour on a metric change instead of snapping.
        "fill-color-transition": paintTransition(DUR_BASE),
        // High-zoom fade (PA F4): data fills ease 0.74→~0.50 between z14 and z16.5 so
        // streets/buildings/labels read through at neighbourhood zoom.
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          14, dataFillOpacity(1),
          16.5, dataFillOpacity(0.68),
        ],
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 2. Solid outline — data (white)
    {
      id: "bcensus-outline",
      type: "line",
      filter: ["==", ["get", "census_state"], "data"],
      paint: {
        "line-color": STATE_STYLE.data.outlineColor,
        "line-width": POLY_OUTLINE_WIDTH,
      },
    },
    // 3. Dotted outline — no_data (same treatment as permit no_data)
    {
      id: "bcensus-outline-nodata",
      type: "line",
      filter: ["==", ["get", "census_state"], "no_data"],
      paint: {
        "line-color": STATE_STYLE.no_data.outlineColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.2, 13, STATE_STYLE.no_data.outlineWidth],
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
    // 3b. Annexation-area outline (Tier 2 · sub-concern E) — ORTHOGONAL to
    //     census_state. Drawn ABOVE the data/no_data outlines so the teal border
    //     wins where a polygon is both annexation-area AND has data (that polygon keeps its
    //     ramp fill + gains this border). Flag-driven — no hardcoded ids.
    {
      id: "bcensus-outline-annexation",
      type: "line",
      filter: ["==", ["get", "is_annexation_area"], true],
      paint: {
        "line-color":     ANNEXATION_STYLE.outlineColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 13, ANNEXATION_STYLE.outlineWidth],
        "line-dasharray": ANNEXATION_STYLE.outlineDash,
      },
    },
    // 4. Selection CASING — a cream under-stroke beneath the violet highlight so a selected
    //    boundary stays legible over the ramp (PA P4). Pinned only. Lifted to the top with
    //    the highlight by the component (moveLayer).
    {
      id: "bcensus-highlight-casing",
      type: "line",
      paint: {
        "line-color": ["case", ["boolean", ["feature-state", "pinned"], false], "#f7f1df", "rgba(0,0,0,0)"],
        "line-width": ["case", ["boolean", ["feature-state", "pinned"], false], 4.4, 0],
      },
    },
    // 5. Highlight outline — hover darkens; selection turns VIOLET + thicker (mirrors PA's
    //    --pa-selection-outline).
    {
      id: "bcensus-highlight",
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
    // (Neighbourhood NAME labels moved OUT — now the CLIENT-DERIVED centroid system, added
    //  ABOVE everything by the component: centroidNameLayer / centroidFocusLayer from
    //  components/nameLabels.js. The mount + data filter live in BusinessCensusMap.)
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

// Signed percent for the YoY row: "+50%" green, "−12.4%" red.
// Returns null when the value is missing so the row is dropped entirely.
// Exported so the DetailPanel (single-select float) can reuse it for its YoY row.
export function fmtSignedPct(v) {
  if (v == null || !Number.isFinite(+v)) return null;
  const n = +v;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";       // U+2212 minus
  const a = Math.abs(n);
  const num = a % 1 === 0 ? String(a) : a.toFixed(1);
  return `${sign}${num}%`;
}
function pctColor(v) {
  const n = +v;
  return n > 0 ? "#1a7a3a" : n < 0 ? "#c0392b" : "var(--text)";
}

const fmtIntPopup = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

const PROVENANCE =
  "Source: Edmonton Business Census. Geography changed from StatCan " +
  "Census Tracts; figures not comparable to prior dashboard.";

// `detail` selects the tier:
//   detail=false → Tier 2 (slim hover): name + district + businesses + employees.
//   detail=true  → Tier 3 (pinned click): name + district + state badge +
//                  businesses + employees + 2024 + YoY + provenance.
export function buildBusinessCensusPopupHtml(p, detail) {
  const name     = p.display_name ?? "—";
  // planning_district is the primary geography label; fall back to civic_ward.
  const district = p.planning_district ?? p.civic_ward ?? null;

  const parts = [
    `<div class="pop-name">${escapeHtml(name)}</div>`,
  ];
  if (district) {
    parts.push(`<div class="pop-district">${escapeHtml(district)}</div>`);
  }

  // ---- Tier 2 — slim hover preview ----
  if (!detail) {
    if (p.census_state === "data") {
      parts.push(
        `<div class="pop-row headline">` +
          `<span class="pop-k">Businesses (2025)</span>` +
          `<span class="pop-v">${fmtIntPopup(p.n_businesses_2025)}</span>` +
        `</div>`,
        `<div class="pop-row">` +
          `<span class="pop-k">Employees (2025)</span>` +
          `<span class="pop-v">${fmtIntPopup(p.n_employees_2025)}</span>` +
        `</div>`
      );
    } else {
      parts.push(`<div class="pop-reason">No business census data recorded for this neighbourhood.</div>`);
    }
    return parts.join("");
  }

  // ---- Tier 3 — full pinned detail ----
  const meta = STATE_STYLE[p.census_state] || { label: p.census_state };
  parts.push(`<div class="pop-state ${p.census_state}">${escapeHtml(meta.label)}</div>`);

  // Annexation-area note — orthogonal to the state badge (the polygon can be
  // annexation-area AND carry data). Agrees with the legend's teal outline row.
  if (p.is_annexation_area) {
    parts.push(
      `<div class="pop-reason">Annexation area — annexed but not yet subdivided ` +
        `into neighbourhoods; shown with its own outline. Any business counts it ` +
        `carries are real and included.</div>`
    );
  }

  if (p.census_state === "data") {
    parts.push(
      `<div class="pop-row headline">` +
        `<span class="pop-k">Businesses (2025)</span>` +
        `<span class="pop-v">${fmtIntPopup(p.n_businesses_2025)}</span>` +
      `</div>`,
      `<div class="pop-row">` +
        `<span class="pop-k">Employees (2025)</span>` +
        `<span class="pop-v">${fmtIntPopup(p.n_employees_2025)}</span>` +
      `</div>`
    );
    if (p.n_businesses_2024 != null) {
      parts.push(
        `<div class="pop-row">` +
          `<span class="pop-k">Businesses 2024</span>` +
          `<span class="pop-v">${fmtIntPopup(p.n_businesses_2024)}</span>` +
        `</div>`
      );
    }
    const yoy = fmtSignedPct(p.yoy_businesses_pct);
    if (yoy != null) {
      parts.push(
        `<div class="pop-row">` +
          `<span class="pop-k">Year-over-year</span>` +
          `<span class="pop-v" style="color:${pctColor(p.yoy_businesses_pct)}">` +
            `${yoy}</span>` +
        `</div>`
      );
    }
  } else {
    parts.push(
      `<div class="pop-reason">No business census data recorded for ` +
        `this neighbourhood.</div>`
    );
  }

  // Provenance note — Tier 3 only.
  parts.push(`<div class="pop-reason">${escapeHtml(PROVENANCE)}</div>`);
  return parts.join("");
}
