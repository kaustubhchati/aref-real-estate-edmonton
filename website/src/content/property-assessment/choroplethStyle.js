// =============================================================================
// choroplethStyle.js
//
// The visual contract for the Property Assessment choropleth.
// Ported VERBATIM from pipeline/yeg/property-assessment/scripts/09_build_choropleth.html:
// the same stops, the same five polygon states, the same outlines and patterns.
// If you need to tweak a colour or threshold, change it here in one place —
// Legend, MapView paint expressions, and any future popup all read from these
// tables (CLAUDE.md §6: data-driven, single source of truth).
//
// Colour-scale domain is PER-YEAR, derived from the manifest's
// colourScaleByYear (see stopsFromScale). The locked PHASE1_STATUS §5 (2026)
// domain is kept only as the fallback when a year has no usable scale.
// =============================================================================

import { fmtCurrency, fmtPct, fmtLogPts, fmtArea } from "../../utils/format.js";
import { polyOutline, rampFloor, RAMP_FLOOR, POLY_OUTLINE_WIDTH } from "../../components/choroplethTheme.js";
import { paintTransition, DUR_BASE } from "../../components/motion.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";

// ---- Map view defaults (Edmonton, matches 09_build_choropleth.html) --------
// (Data URL no longer lives here — single source of truth is dataSources.js,
// which the page resolves from the (city, year) controls.)
// Colour policy for LEVEL-metric ($ / lot / year) deltas vs city. ONE switch, read by
// both the console KPI cards (DataTable) and the detail float (InfoRail).
// AMENDED 2026-07-13 (KC ratified, DESIGN_SYSTEM §1.3): true — ALL signed deltas colour
// by sign (green/coral), retiring the old level/rate distinction. A signed delta reads
// by direction whether it compares a level or a rate; only the SIGN matters, not the
// unit. Zero stays neutral (signCls returns "" at 0). The +/− glyph is the colour-blind-
// safe redundant channel (§4). The city BASELINE stays --city blue (a reference datum,
// not a delta) — the sign-colour applies to the delta only.
export const COLOUR_LEVEL_DELTAS = true;

export const MAP_VIEW = {
  // center/zoom are only the CONSTRUCTION FALLBACK (the map must build with some
  // view before HOME_VIEW is applied). The real HOME view is the tuned pitched
  // HOME_VIEW preset below — applied on load + city switch; the data-derived
  // fitToFeatures handles only SELECTION framing (see HOME_VIEW + METHODOLOGY D6).
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid (pre-data placeholder)
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 17,
  // Pan limit (NOT the home view). Pinned to Edmonton at mount; per-city maxBounds
  // is a Calgary-campaign follow-up (Calgary has no map today — url is null there).
  maxBounds: CITY_BOUNDS.Edmonton,
};

// HOME_VIEW — the cinematic landing camera per city: a TUNED pitched preset, NOT a
// data-derived fit. Applied on load, on city-switch, and by the reset button when no
// selection is active (easeTo; reduced-motion / first-load → jumpTo). The flat
// data-derived fit (fitToFeatures) is kept for SELECTION framing + reset-with-a-
// selection — two distinct camera concepts. The Edmonton values were captured by
// framing the live map to the design reference (Home-View Pitch angle) and reading
// back getCenter/getZoom/getPitch/getBearing (bearing 0 = north-up; the tilt is
// pitch only). Per-city by design — Calgary needs its own preset when it arrives.
// This is the ONE deliberate departure from data-derived framing (see METHODOLOGY).
export const HOME_VIEW = {
  Edmonton: { center: [-113.485, 53.515], zoom: 10.5, pitch: 18, bearing: 0 },
};

// Basemap style is shared + base-resolved; re-exported so consumers here are unchanged.
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

// ---- Per-metric colour ramps -----------------------------------------------
// Each metric colours by its own 5-stop ramp (min→Q25→median→Q75→max). The
// per-year thresholds come from the manifest or the data; only the colours are
// fixed here. Each palette is perceptually ordered, colourblind-aware, and
// shifted to stay visible against the cream CARTO Voyager basemap.
//   key   = manifest colourScaleByYear field / quantile role
//   c     = fill colour at that stop
//   label = role in the IQR (shown in the legend)

// ── Assessed-value $ ramp (RAMP_ASSESSED) — 5-stop, INTERPOLATE over the per-year
// quantile stop VALUES (min/q25/median/q75/max), the same mechanism Business Counts
// uses. Breaks sit AT the quantile boundaries, so the colour space is CONTINUOUS (a
// fill-color-transition can tween it on a year swap — the old `step` path couldn't)
// while the mid-range still spans amber→orange→scarlet instead of a flat plateau
// (verified on the 2026 distribution: the middle 50% spans dozens of distinct
// colours). The low band uses the shared RAMP_FLOOR (#fbe3a0, via rampFloor) — the
// soft warm yellow matching Business Census. Replaces the earlier `step` path + IQR
// tail breaks (mid75/near), which existed ONLY because `step` needed manufactured
// thresholds up the long tail. RAMP_ASSESSED is the exposed tunable.
const RAMP_ASSESSED = [
  { key: "min",    c: rampFloor("#f5f0e8"), label: "min" }, // shared soft-yellow floor (#fbe3a0), matches Business Census
  { key: "q25",    c: "#f5a02e", label: "Q25"    }, // amber
  { key: "median", c: "#ec6f2e", label: "median" }, // orange-red
  { key: "q75",    c: "#e0381c", label: "Q75"    }, // scarlet
  { key: "max",    c: "#cc0000", label: "max"    }, // bright Ferrari
];

// The single red the LEVEL metrics (median/mean assessed value) paint their
// hottest band — RAMP_ASSESSED's top stop. The YoY most-positive class binds to
// THIS exact value (read from the ramp, never re-typed) so the two maps share
// one red: switch metric and the warm extreme is identical. Retuning the median
// palette's max carries to YoY automatically. (Today: "#cc0000".)
const MEDIAN_RED = RAMP_ASSESSED[RAMP_ASSESSED.length - 1].c;

// ── Amber-sienna (custom, YlOrBr family shifted)
// Pale amber → deep burnt sienna. For lot size (m²).
// Shifted min to #fedf9a — visible on cream land.
// Max #8b3a12 (burnt sienna-orange) clearly distinct
// from RAMP_VALUE max #5a1525 (wine-red) — different hue.
const RAMP_AREA = [
  { key: "min",    c: "#fedf9a", label: "min"    },
  { key: "q25",    c: "#fdb455", label: "Q25"    },
  { key: "median", c: "#e87520", label: "median" },
  { key: "q75",    c: "#c04a12", label: "Q75"    },
  { key: "max",    c: "#8b3a12", label: "max"    },
];

// ── OrRd reversed (ColorBrewer)
// Dark crimson → light cream. For median year built.
// REVERSED: oldest neighbourhoods (inner city) render
// darkest; newest suburbs render lightest. Intuitive
// temporal reading. Distinct from value/area palettes —
// runs in opposite luminance direction.
const RAMP_YEAR = [
  { key: "min",    c: "#7f0000", label: "oldest" },
  { key: "q25",    c: "#d7301f", label: "Q25"    },
  { key: "median", c: "#fc8d59", label: "median" },
  { key: "q75",    c: "#fdcc8a", label: "Q75"    },
  { key: "max",    c: "#fef0d9", label: "newest" },
];

// Map each metric key to its ramp.
// WHY a lookup table: metricStops() and stopsFromScale() both
// need to know which ramp to use. Single source of truth here.
const METRIC_RAMP = {
  median_assessvalue: RAMP_ASSESSED,
  avall_public:       RAMP_ASSESSED,
  avg_lotsize:        RAMP_AREA,
  median_yearbuilt:   RAMP_YEAR,   // kept (table 'Built' column) though no longer a MAP metric
  // %Condo reuses the WARM sequential ramp (A3 — DESIGN_SYSTEM §1.4; the D1 purple is
  // retired) so a share reads visually consistent with the level metrics; it is CLASSED by
  // the actual condo-share quantiles (condoStops) rather than an even 0–100 ramp that read flat.
  pct_with_unit:      RAMP_ASSESSED,
  // yoy_log_points is not a sequential ramp — it uses the continuous diverging scale
  // built by yoyDivergingStops (flat yellow plateau + potent blue/red), not this table.
};

// Default ramp for fallback (used when metric key is unknown).
const RAMP_DEFAULT = RAMP_ASSESSED;

// Turn a {min,q25,median,q75,max} scale into the [{ v, c, label }] stops the
// map and legend consume. Returns null if any value is missing, non-finite, or
// not strictly ascending — MapLibre's interpolate requires ascending inputs,
// so a bad scale must fall back rather than throw at render time.
function buildStops(scale, ramp = RAMP_DEFAULT) {
  // Every ramp now keys onto the plain {min,q25,median,q75,max} quantile scale; the
  // assessed ramp's old IQR tail breaks (mid75/near) went with the step path.
  const stops = ramp.map((r) => ({
    v: scale?.[r.key], c: r.c, label: r.label,
  }));
  const finite    = stops.every((s) => Number.isFinite(s.v));
  const ascending = stops.every(
    (s, i) => i === 0 || s.v > stops[i - 1].v
  );
  return finite && ascending ? stops : null;
}

// Locked fallback domain (PHASE1_STATUS §5, 2026 actuals). Used when a year has
// no usable scale in the manifest. Valid by construction, so always non-null.
export const STOPS = buildStops({
  min: 103500, q25: 352625, median: 425125, q75: 496188, max: 1226000,
}, RAMP_ASSESSED);

// %Condo stops (A3) — the WARM ramp CLASSIFIED by the actual condo-share quantiles, so the
// map reveals the real spatial pattern (an even 0–100 ramp reads flat). Reuses metricStops
// (the same quantile path the dollar/level metrics use) with a WARM even-0–100 fallback for
// a degenerate distribution — never the dollar STOPS. Legend shows the quantile break %s.
export function condoStops(gj) {
  return metricStops(gj, "pct_with_unit",
    buildStops({ min: 0, q25: 25, median: 50, q75: 75, max: 100 }, RAMP_ASSESSED));
}

// Per-year stops from a manifest colourScaleByYear[year] entry, falling back to
// the locked STOPS when that year's scale is missing or unusable.
export function stopsFromScale(scale, metricKey = "median_assessvalue") {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  return buildStops(scale, ramp) ?? STOPS;
}

// Compute ramp stops for a metric straight from the loaded GeoJSON: the
// [min, Q25, median, Q75, max] of that metric across aggregated polygons,
// mapped onto that metric's ramp colours (METRIC_RAMP). Used for the metrics the
// manifest has no scale for — i.e. everything except median_assessvalue, which
// keeps its locked manifest scale. Falls back to the locked STOPS when there's
// too little data,
// and drops any stop not strictly greater than the previous one so MapLibre's
// interpolate (which requires ascending inputs) never throws on ties.
export function metricStops(gj, metricKey, fallback = STOPS) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.polygon_state !== "aggregated") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 2) return fallback;
  vals.sort((a, b) => a - b);

  // Build a {min,q25,median,q75,max} scale from the data quantiles, then run it
  // through the SAME buildStops path as the manifest scale — so the assessed ramp
  // gets its IQR tail breaks + strict-ascending guard identically to PATH 1, and
  // other ramps stay 5-break. Falls back to the locked STOPS on a degenerate
  // (non-ascending / tied) scale.
  const q = {
    min:    quantile(vals, 0),
    q25:    quantile(vals, 0.25),
    median: quantile(vals, 0.5),
    q75:    quantile(vals, 0.75),
    max:    quantile(vals, 1),
  };
  return buildStops(q, ramp) ?? fallback;
}

// Linear-interpolated quantile of an ascending-sorted array (p in [0, 1]).
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- Year-over-year DIVERGING ramp (continuous, flat yellow plateau) --------
// yoy_log_points is a signed LOG CHANGE (not a percent — METHODOLOGY.md D7) painted
// on a CONTINUOUS diverging ramp (D6): a FLAT
// YELLOW PLATEAU at the neutral centre [-1%, +1%] with potent outer shades. Yellow =
// "no real change / base canvas"; movement is highlighted as it grows — deepening to
// potent BLUE below -1% and potent RED above +1%. The washed near-zero shades of the
// old discrete scale (light-salmon #f4a582 / whitish-blue #92c5de) are REMOVED: the
// neutral zone collapses to the single held yellow; the outer stops carry the signal.
//
// SCALE (preserved strategy, restructured only as the plateau requires): the outer
// clamp E = p98(|yoy|) over all neighbourhood-years stays (data-derived, refresh-by-
// design). The plateau is pinned at ±1% (KC's neutral band); the intermediate
// deepening stop sits at the ARM MIDPOINT (E+1)/2 — always between the plateau edge
// and E, so a small-E refresh can't collide with the fixed plateau (option A). blue =
// decline, red = growth; the top red binds to MEDIAN_RED so it can never drift from
// the level maps' hottest red. The plateau yellow reuses RAMP_FLOOR (the sequential
// ramps' shared soft-yellow floor) — no new hex.
const YOY_YELLOW    = RAMP_FLOOR;   // #fbe3a0 — the held plateau (base canvas)
// Negative (decline) arm DEEPENED — intentionally overrides the old §1.4 "diverging ramp
// UNTOUCHED" note (see DESIGN_SYSTEM §1.4, updated in the same commit). The old blues read
// too weakly below the plateau, and the mid (#4393c3, L≈51) sat close to --city #60a5fa in
// lightness. Both now go DARKER in lightness AND hue-shift toward INDIGO, so sub--1% declines
// read strongly and the decline colour can never be mistaken for the --city azure baseline on
// the map. The ±1% plateau and the red (growth) arm are untouched.
const YOY_DEEP_BLUE = "#0d1f6b";    // decline EXTREME — deep indigo (L≈24, hue≈229; far from --city L68/hue213). Was #08519c.
const YOY_MED_BLUE  = "#2166ac";    // mid decline — potent medium blue (darker than the weak #4393c3)
const YOY_MED_RED   = "#d6604d";    // mid growth (untouched)
// (removed: "#92c5de" light blue + "#f4a582" light salmon — the washed near-zero shades.)

// Build the CONTINUOUS diverging stops for a clamp endpoint E (> 1). Each stop is
//   v — its value       c — its colour
// The fill INTERPOLATES over v; the Legend's horizontal diverging bar positions the
// same stops by v (so the plateau shows at its true narrow width) and derives its end
// labels from format(±E) + a fixed ±1% plateau tag — the stops carry no label. The two
// yellow stops at ±1 hold the plateau FLAT between them. Ascending v (-E < -(E+1)/2 <
// -1 < 1 < (E+1)/2 < E for E>1) — required by MapLibre interpolate.
function yoyDivergingStops(E) {
  const mid = (E + 1) / 2;   // arm midpoint (option A) — always between 1 and E for E>1
  return [
    { v: -E,   c: YOY_DEEP_BLUE },
    { v: -mid, c: YOY_MED_BLUE  },
    { v: -1,   c: YOY_YELLOW    },
    { v:  1,   c: YOY_YELLOW    },
    { v:  mid, c: YOY_MED_RED   },
    { v:  E,   c: MEDIAN_RED    },
  ];
}

// Locked fallback E (the 2026 actual p98|yoy|≈15.5), used until enough data has
// loaded to derive E. Keeps the ramp valid on first paint.
const YOY_FALLBACK_E = 15.5;

// Data-derived diverging YoY stops (refresh-by-design — no baked endpoint). E = p98
// of |yoy| across every neighbourhood-year passed in; the arms clamp at ±E. Sentinel/
// NA are excluded upstream (Number.isFinite). Falls back to YOY_FALLBACK_E until ≥20
// values have loaded OR when p98 ≤ 1 (a near-flat distribution where the ±1 plateau
// would swallow the whole range / the stops would go non-ascending — the plateau
// needs E > 1, the analogue of the old strictly-ascending guard).
export function yoyStopsFromValues(values) {
  const mags = (values ?? [])
    .filter((v) => Number.isFinite(v))
    .map(Math.abs)
    .sort((a, b) => a - b);
  const p98 = quantile(mags, 0.98);
  const E = mags.length < 20 || !(p98 > 1) ? YOY_FALLBACK_E : p98;
  return yoyDivergingStops(E);
}

// ---- YoY range-control geometry (the fixed core) ---------------------------
// The YoY range slider's track is PIECEWISE: a fixed core that never moves, plus a
// compressed overflow beyond it. These two constants are the whole geometry; the
// scale itself is built in DataTable (its only consumer).
//
// YOY_CORE — the boundary between price change and buildout, in log points.
// DERIVATION (approved by KC 2026-07-15 — recorded because a bare magic number in the
// design law is exactly what D7's lesson warns against): the core must contain EVERY
// price-change observation we have ever seen, so it spans the full observed range of
// MATURE neighbourhoods (Built ≤ 1990; n = 2,213; min −15.04, max +15.52) rounded out
// to a round number. It is a CONTAINMENT guarantee, not a percentile — ±12 (the mature
// p1/p99) and ±15 were both rejected because each pushes real mature price change into
// the overflow, which would make the detent mean two different things. Everything past
// it is greenfield buildout, not price change (docs/recon/YOY_TAIL_MECHANISM_20260715.md).
// It is deliberately a CONSTANT, not runtime-derived: it is the control's fixed frame
// (DESIGN_SYSTEM Principle 0), and a frame that re-fits itself on every refresh is not
// a frame. Re-derive it by hand if the mature range ever outgrows it.
export const YOY_CORE = 16;
// The overflow's share of the track's pixels. One linear track would hand the core just
// 18% of the width to hold 98% of the data; at 20% the core keeps 4/5 of the track
// (≈0.40 log pts per %) and the tail stays wide enough to land a thumb in (≈7.2 per %).
export const YOY_OVERFLOW_SHARE = 20;

// ---- Choropleth metrics ----------------------------------------------------
// The columns the user can colour the map by. ONE source of truth (the metric
// control, the legend, the default, and the URL all read this):
//   key   = GeoJSON property to colour by
//   label = control + legend text
//   fmt   = value formatter for legend / rail
//   icon  = a single SVG <path d="…"> (Lucide-style, stroke-based, 24×24 viewBox)
//           drawn by the segmented metric control (SegmentedControl.jsx). Adding
//           a metric stays a ONE-PLACE change — add its row here, icon included.
// ORDER (ratified 2026-07-13): value → change → composition → structural. LABELS are
// full Title Case + a trailing (unit) where one exists — the one place they live (§6);
// every consumer (rail chips, legend title) reads label/order FROM HERE. Each icon is
// keyed WITH its metric object, so reordering keeps glyph↔metric in sync.
const METRICS = [
  { key: "median_assessvalue", label: "Median Assessed Value",     fmt: fmtCurrency,
    icon: "M12 2v20 M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },             // dollar
  { key: "avall_public",       label: "Mean Assessed Value",       fmt: fmtCurrency,
    icon: "M3 3v18h18 M8 17V9 M13 17V5 M18 17v-7" },                                  // distribution / mean
  // LOG POINTS, not percent — the backend emits log(median_now/median_prior)*100
  // (04_aggregate_historical.R:274). See METHODOLOGY.md D7. The legend title reads
  // this label, so the unit is stated here once for both.
  // "YoY" not "Year over Year": with the unit appended, the full phrase ran 217px in a
  // 207px chip and clipped its own closing bracket. YoY is an established acronym and §2
  // keeps acronyms upper, so the short form is the label — the unit is what earns the room.
  { key: "yoy_log_points",     label: "YoY Change (Log Pts)",      fmt: fmtLogPts,
    icon: "M3 17l6-6 4 4 8-8 M21 7v6 M21 7h-6" },                                     // trending up
  // %Condo (D1) — promoted to a MAP metric (varies spatially) on its own 0–100 share
  // ramp (Year built demoted from the metric row but KEPT as a table column). = share
  // of individually-titled condominium parcels (Plan/Unit); never "% apartments".
  { key: "pct_with_unit",      label: "Condominium (%)",           fmt: fmtPct,
    icon: "M3 21h18 M5 21V7l7-4 7 4v14 M9 9h.01 M9 13h.01 M9 17h.01 M15 9h.01 M15 13h.01 M15 17h.01" }, // building / units
  { key: "avg_lotsize",        label: "Mean Lot Size (m²)",        fmt: fmtArea,
    icon: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7" },                              // area / extent
];
export { METRICS };

// ---- The five polygon states ----------------------------------------------
// Aggregated polygons get the colour ramp above. The other four each get a
// distinct grey + (optional) pattern + (optional) dashed outline so the legend
// is honest about WHY a neighbourhood isn't on the ramp.
export const STATE_STYLE = {
  aggregated: {
    label:        "Aggregated (N ≥ 100)",
    fillColor:    null,            // painted from the ramp, not a flat colour
    pattern:      null,
    outlineColor: polyOutline("#ffffff"),
    outlineWidth: 0.4,
    outlineDash:  null,
  },
  suppressed_low_n: {
    label:        "Suppressed (N < 100)",
    fillColor:    "rgba(255,255,255,0.08)",   // glass — basemap shows through; outline carries the state
    pattern:      null,
    outlineColor: "#7a7468",
    outlineWidth: 0.7,
    outlineDash:  [2, 2],
  },
  non_residential: {
    label:        "No residential properties",
    fillColor:    "rgba(255,255,255,0.08)",   // glass — basemap shows through; outline carries the state
    pattern:      "stripes",
    outlineColor: "#888173",
    outlineWidth: 0.5,
    outlineDash:  null,
  },
  manufactured_home_community: {
    label:        "Manufactured home community",
    fillColor:    "rgba(255,255,255,0.08)",   // glass — basemap shows through; outline carries the state
    pattern:      "dots",
    outlineColor: "#7a7468",
    outlineWidth: 0.6,
    outlineDash:  null,
  },
  no_data: {
    label:        "No data (legitimately empty)",
    fillColor:    "rgba(255,255,255,0.08)",   // glass — basemap shows through; outline carries the state
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

// ---- Annexation-area overlay (Tier 2 · sub-concern E) ----------------------
// ORTHOGONAL to polygon_state, NOT a sixth state: a polygon can be an annexation
// area AND aggregated (such a polygon keeps its ramp fill AND gains this border). It is a
// SECOND outline composed on top of the state outline, driven purely by the
// is_annexation_area flag (a flat, non-year-keyed boolean) — no hardcoded ids, so
// it clears itself when the City subdivides these tiles and the flag clears via the
// crosswalk. Teal + long-dash: distinct from every state outline above and from the
// violet selection highlight; legible on the dark PA column.
export const ANNEXATION_STYLE = {
  label:        "Annexation area (annexed, not yet subdivided)",
  fillColor:    "rgba(255,255,255,0.08)",   // glass → legend swatch is outline-only
  pattern:      null,
  outlineColor: "#12a8bd",
  outlineWidth: 1.8,
  outlineDash:  [4, 2],
};

// Rows for <Legend greyStates>: the four non-aggregated states (from GREY_STATES,
// resolved to their style objects) + the annexation overlay. PA computes GREY_STATES
// but had never passed it to the legend (finding 13f) — wiring it here also surfaces
// the four grey states for the first time.
export const LEGEND_STATES = [
  ...GREY_STATES.map((k) => STATE_STYLE[k]),
  ANNEXATION_STYLE,
];

// ---- Popup rows ------------------------------------------------------------
// NOTE: the per-feature DETAIL view (name, year, state badge, aggregate rows,
// suppression / no-data notes) used to be hand-built HTML here (buildPopupHtml +
// escapeHtml) for a MapLibre popup. It now renders as React in the right info rail
// — see InfoRail.jsx, which consumes STATE_STYLE above (and owns the per-state note
// copy plus its own aggregate-row set). The HTML builders were removed with the
// popup; the old POPUP_ROWS table went with the InfoRail move (2026-07-16 cleanup).

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

// ---- Year-keyed property reads (combined all-years file) -------------------
// The map source is the ONE combined GeoJSON (07b): geometry once, every year's
// values as flat <field>_<year> properties. So every paint/filter/layout
// expression that reads a per-year field reads `<field>_<year>` for the selected
// year — and a YEAR change is a paint swap (applyYearMetric below), not a data
// reload. Identity fields (display_name) are NOT year-keyed. yget centralises
// the suffixing so the expression builders read like the old bare-name ones.
const yget = (field, year) => ["get", `${field}_${year}`];

// ---- Fill-colour expression -----------------------------------------------
// case: state == aggregated → linear interpolation over the given stops,
//       reading the chosen metric column (for `year`)
// otherwise → that state's flat fillColor (or fallback grey).
function buildFillColourExpression(metricKey, year, stops) {
  // A null / absent value becomes the MISSING sentinel. -999 sits below every
  // metric's real range (dollars, m², years, percentages, and the diverging ±E),
  // so it can never be mistaken for data — and it is caught BEFORE the ramp, for
  // EVERY metric.
  //
  // yoy always worked this way. The sequential metrics used to coerce a null to 0
  // instead, and `interpolate` clamps below its first stop — so six aggregated
  // polygons with no lot data painted as the ramp's MINIMUM colour, reading as
  // "the smallest lots in the city", while the table honestly showed "—". A
  // polygon we have no value for is no_data, whatever the metric is.
  // See docs/recon/YOY_RECON_20260715.md YOY-10.
  const MISSING = -999;
  const value = ["number", yget(metricKey, year), MISSING];

  // Aggregated polygons INTERPOLATE over their stops' VALUES — a CONTINUOUS colour
  // space, so the colour can tween on a year swap via fill-color-transition.
  // Sequential metrics anchor their breaks at the per-year quantile boundaries
  // (min/q25/median/q75/max), with no raw-value mid-plateau; yoy holds a flat
  // plateau near zero and deepens to potent blue/red at ±E. applyYearMetric zeroes
  // the tween for yoy, so a year change SNAPS rather than sweeping through the ramp.
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);
  const aggregatedFill = ["case", ["==", value, MISSING], STATE_STYLE.no_data.fillColor, interp];

  const state = yget("polygon_state", year);
  return [
    "case",
    ["==", state, "aggregated"],                  aggregatedFill,
    ["==", state, "suppressed_low_n"],            STATE_STYLE.suppressed_low_n.fillColor,
    ["==", state, "non_residential"],             STATE_STYLE.non_residential.fillColor,
    ["==", state, "manufactured_home_community"], STATE_STYLE.manufactured_home_community.fillColor,
    ["==", state, "no_data"],                     STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

// ---- The other year-keyed expressions ---------------------------------------
// fill-opacity (lifts aggregated polygons, dims glass states) and the per-state
// FILTERS / colour matches / count label — all read polygon_state (or
// n_properties) for `year`. Factored out so choroplethLayers (initial mount) and
// applyYearMetric (year/metric change) build them from ONE source of truth.
// Brushed-OUT fill opacity for an aggregated polygon (D7): faded so the in-filter
// polygons read as the live set. Feature-state-driven, so MapLibre applies it
// instantly (no transition) — the dim snaps, honouring reduced-motion by construction.
const DIM_OPACITY = 0.12;
function fillOpacityExpr(year) {
  const state = yget("polygon_state", year);
  // The per-state opacity at a given aggregated-fade factor k. Only the AGGREGATED branch
  // scales by k (KC: existing_state_opacity × zoom_factor); the glass / suppressed states
  // (0.04–0.15) are already faint and NEVER fade — fading them would erase their honesty
  // encoding. hover/pinned/dimmed stay proportional (all inside the scaled branch).
  const stateCase = (k) => [
    "case",
    ["==", state, "aggregated"],
      [
        "case",
        // Hover + pinned (selection) stay DOMINANT over the dim — checked first.
        ["boolean", ["feature-state", "hover"], false], 0.88 * k,
        ["boolean", ["feature-state", "pinned"], false], 0.88 * k,
        // Third channel: dimmed = not in the current table-filter brush set (D7).
        ["boolean", ["feature-state", "dimmed"], false], DIM_OPACITY * k,
        0.74 * k,
      ],
    ["boolean", ["feature-state", "hover"], false], 0.15,
    ["boolean", ["feature-state", "pinned"], false], 0.15,
    0.04,
  ];
  // F4 — high-zoom fade. ZOOM must be the OUTERMOST expression (MapLibre forbids a nested
  // zoom), so interpolate between two pre-scaled state-cases: hold as-built to z14, ease
  // the aggregated fills to k=0.68 by z16.5 (0.74 base → ≈0.50) so streets, buildings, and
  // the labels read through at parcel scale.
  return [
    "interpolate", ["linear"], ["zoom"],
    14, stateCase(1),
    16.5, stateCase(0.68),
  ];
}
const stateEqFilter = (year, state) => ["==", yget("polygon_state", year), state];
const patternFilter = (year) => [
  "in", yget("polygon_state", year),
  ["literal", ["non_residential", "manufactured_home_community"]],
];
const patternMatch = (year) => [
  "match", yget("polygon_state", year),
  "non_residential",             "stripes",
  "manufactured_home_community", "dots",
  "stripes",
];
const solidOutlineFilter = (year) => [
  "in", yget("polygon_state", year),
  ["literal", ["aggregated", "non_residential", "manufactured_home_community"]],
];
const solidOutlineColor = (year) => [
  "match", yget("polygon_state", year),
  "non_residential",             STATE_STYLE.non_residential.outlineColor,
  "manufactured_home_community", STATE_STYLE.manufactured_home_community.outlineColor,
  STATE_STYLE.aggregated.outlineColor,
];

// ---- Layer specs handed to MapView ----------------------------------------
// One function so the consumer file is short. Layers are in z-order
// (first = bottom).
//
// LAYER-ORDER CONTRACT (D-P2 F1) — two deliberate anchors:
//   • These choropleth layers (fill / outline / pattern) are
//     inserted by MapView BELOW the basemap's first symbol layer (findFirstSymbolLayerId
//     + beforeId), so ALL basemap labels — streets, places — render ABOVE our fills.
//   • The neighbourhood NAME labels are NOT here: they mount ABOVE everything (basemap
//     symbols included) from a client-derived centroid source, added by the page after
//     MapView's batch — see centroidNameLayer() / centroidFocusLayer() below.
//
// `stops` selects the colour ramp and `metricKey` the column to colour by;
// both default to the locked median scale when a caller doesn't pass them.
export function choroplethLayers(stops = STOPS, metricKey = "median_assessvalue", year) {
  return [
    // 1. Fill colour for every polygon. Aggregated polygons get the solid ramp
    //    (lifting on hover/pin); non-aggregated polygons are near-transparent
    //    "glass" so the basemap shows through, with a faint white wash on hover
    //    to confirm the interaction. The outline (below) carries the state.
    {
      id: "nbhd-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(metricKey, year, stops),
        // Tween the colour on a metric/year/scale change instead of snapping.
        "fill-color-transition": paintTransition(DUR_BASE),
        "fill-opacity": fillOpacityExpr(year),
        // Spec-compliant paint-level transition. Note: MapLibre does not
        // animate feature-state-driven changes (hover/pinned) through this —
        // it applies to data/zoom-driven opacity updates only.
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 2. Stripes / dots overlay, restricted to the two pattern states.
    {
      id: "nbhd-pattern",
      type: "fill",
      filter: patternFilter(year),
      paint: {
        "fill-pattern": patternMatch(year),
        // Hidden: stripes/dots on a glass polygon look wrong — the outline
        // alone signals the state now. Layer kept so re-enabling is one value.
        "fill-opacity": 0.0,
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 3. Solid outline for aggregated + structurally-grey states.
    {
      id: "nbhd-outline-solid",
      type: "line",
      filter: solidOutlineFilter(year),
      paint: {
        "line-color": solidOutlineColor(year),
        // Thin at city-wide zoom, fuller as you zoom into a neighbourhood, so
        // outlines don't visually crowd the choropleth when zoomed out.
        // Shared ~0.5px→1px discriminating stroke (choroplethTheme); replaces
        // the old near-invisible 0.2px aggregated outline that blanked on cream.
        "line-width": POLY_OUTLINE_WIDTH,
      },
    },
    // 4. Dashed outline for suppressed_low_n.
    {
      id: "nbhd-outline-suppressed",
      type: "line",
      filter: stateEqFilter(year, "suppressed_low_n"),
      paint: {
        "line-color":     STATE_STYLE.suppressed_low_n.outlineColor,
        // Same zoom ramp as the solid outline: thin out, full in.
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          8,  0.2,
          13, STATE_STYLE.suppressed_low_n.outlineWidth,
        ],
        "line-dasharray": STATE_STYLE.suppressed_low_n.outlineDash,
      },
    },
    // 5. Dotted outline for no_data.
    {
      id: "nbhd-outline-nodata",
      type: "line",
      filter: stateEqFilter(year, "no_data"),
      paint: {
        "line-color":     STATE_STYLE.no_data.outlineColor,
        // Same zoom ramp as the solid outline: thin out, full in.
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          8,  0.2,
          13, STATE_STYLE.no_data.outlineWidth,
        ],
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
    // 5a. Annexation-area outline (Tier 2 · sub-concern E) — ORTHOGONAL to
    //     polygon_state, so its filter is the flat is_annexation_area flag (NOT
    //     year-keyed). Above the state outlines so the teal border wins where a
    //     polygon is both annexation-area AND aggregated (that polygon keeps its ramp fill
    //     + gains this border); below the selection casing so a pin still reads on
    //     top. Flag-driven — no hardcoded ids.
    {
      id: "nbhd-outline-annexation",
      type: "line",
      filter: ["==", ["get", "is_annexation_area"], true],
      paint: {
        "line-color": ANNEXATION_STYLE.outlineColor,
        // Same zoom ramp shape as the sibling outlines: thin out, full in.
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          8,  0.5,
          13, ANNEXATION_STYLE.outlineWidth,
        ],
        "line-dasharray": ANNEXATION_STYLE.outlineDash,
      },
    },
    // 5b. Selection CASING — a light cream under-stroke drawn BENEATH the violet
    //     highlight (this layer precedes nbhd-highlight, so it renders below it),
    //     so the selected boundary stays legible over deep-red / plateau-yellow
    //     fills. Pinned only; transparent otherwise. Both this and nbhd-highlight
    //     are lifted to the TOP of the stack by the page (moveLayer, P4).
    {
      id: "nbhd-highlight-casing",
      type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], "#f7f1df",  /* mirrors --map-cream */
          "rgba(0,0,0,0)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], 4.4,
          0,
        ],
      },
    },
    // 6. Highlight outline — invisible by default, darkens on hover, and turns the
    //    selection VIOLET (mirrors --pa-selection-outline; P4) + thicker when pinned.
    //    Violet is distinct from the ramp reds/oranges the old coral collided with. The
    //    page lifts this pair to the TOP of the stack (moveLayer) so it is never occluded
    //    by an adjacent polygon or basemap hairline.
    {
      id: "nbhd-highlight",
      type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], "#8b5cf6",  /* mirrors --pa-selection-outline (violet) */
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
    // 7. (Neighbourhood NAME labels moved OUT of this array — D-P2 F1/F2.) They now
    //    live on a dedicated client-derived CENTROID point source (one point per
    //    neighbourhood, so no per-tile duplicates) and are added ABOVE everything by
    //    the page (centroidNameLayer / centroidFocusLayer, mounted in
    //    PropertyAssessmentMap's label effect — NOT via MapView's beforeId batch). See
    //    the layer-order note in the header comment above.
    // 8. (Suppressed N-count map label REMOVED — D-P3 A2 / DESIGN_SYSTEM §3,§5: internal
    //    parcel counts are not cartographic text. The count still lives in the table +
    //    detail float. The suppressed state stays legible on the map via its dashed grey
    //    outline (nbhd-outline-suppressed) + the state legend.)
  ];
}

// ---- Neighbourhood NAME labels (D-P2 F1/F2) -------------------------------
// The name labels render from a dedicated CLIENT-DERIVED centroid point source
// (buildCentroidPoints in PropertyAssessmentMap): ONE point per neighbourhood, so
// MapLibre never places the per-tile duplicates a polygon source produced. The page
// anchors the base name layer ADJACENT to the basemap symbols (B2 — shared collision
// index), and the focus layer ABOVE everything. The source is year-invariant (geometry
// only) — applyYearMetric never touches it.
export const CENTROID_SOURCE = "nbhd-centroids";

// F2 — the base name-label layer. Zoom-graduated size + area-priority collision so the
// major neighbourhoods win when labels crowd; cream halo reads over the reddest fill.
export function centroidNameLayer() {
  return {
    id: "nbhd-labels",
    type: "symbol",
    minzoom: 9,
    layout: {
      "text-field": ["get", "display_name"],
      // Priority: bigger neighbourhoods win placement. symbol-sort-key gives LOWER keys
      // priority, so negate the (year-invariant) area → largest area = lowest key.
      "symbol-sort-key": ["-", 0, ["get", "area"]],
      // B3 — zoom-density tiers via a step on ZOOM (the only valid place for [zoom]); each
      // step output is a per-feature `tier` case, and text-size 0 hides a tier (0 size = no
      // collision box, so it also frees space). tier 1 (major) labels from the overview,
      // tier 2 (mid) from ~z12.5, tier 3 (all) from ~z14. The overview breathes.
      // B2 — with the layer filtered to REPORTABLE polygons only (B1 frees collision
      // budget), fill in earlier: major only at the overview, then EVERY reportable label
      // eligible from ~z12.5, where the collision engine packs greedily by area sort-key so
      // any coloured polygon with room on screen gets named.
      "text-size": [
        "step", ["zoom"],
        ["case", ["==", ["get", "tier"], 1], 11, 0],       // < z11: major only (overview breathes)
        11,   ["case", ["<=", ["get", "tier"], 2], 12, 0], // z11–12.5: major + mid
        12.5, 13,                                          // ≥ z12.5: ALL reportable — collision packs
      ],
      "text-font": ["Noto Sans Regular"],
      "text-max-width": 8,
      // B2 — allow-overlap:false so this layer joins the basemap's ONE collision index
      // (the page inserts it adjacent to the basemap symbols); our names and the basemap
      // labels mutually collide-test and never overprint. Try centred first, then nudge to
      // an offset anchor instead of DROPPING a label outright.
      "text-allow-overlap": false,
      "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
      "text-radial-offset": 0.6,
      "text-justify": "auto",
    },
    paint: {
      "text-color": "#2a2621",        // mirrors --label-ink (dark warm grey, ~13:1 on cream) — DESIGN_SYSTEM §5
      "text-halo-color": "#f7f1df",   // mirrors --map-cream — the halo IS the label's effective background
      "text-halo-width": 1.5,         // as narrow as stays legible ("effective but invisible")
      "text-halo-blur": 0.4,
      // Yield to the focus layer (F3): when a neighbourhood is hovered/selected its name
      // is drawn by centroidFocusLayer instead, so hide the base copy here — otherwise the
      // two (base collision-placed, focus centred) draw the same name slightly offset.
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "pinned"], false], 0,
        ["boolean", ["feature-state", "hover"], false], 0,
        1,
      ],
    },
  };
}

// F3 — the hover/selected GUARANTEE. A second layer on the SAME centroid source with
// text-allow-overlap, so the pointed-at / selected neighbourhood is NEVER collision-
// culled — it always names itself. Visible only where the centroid source carries the
// `hover` or `pinned` feature-state (the page mirrors those from the polygon channels);
// text-opacity is 0 everywhere else, so this layer is invisible until you point/select.
export function centroidFocusLayer() {
  return {
    id: "nbhd-labels-focus",
    type: "symbol",
    layout: {
      "text-field": ["get", "display_name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 15, 17], // a touch larger than base
      "text-font": ["Noto Sans Regular"],
      "text-max-width": 8,
      "text-allow-overlap": true,      // never dropped — the guarantee
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#2a2621",         // mirrors --label-ink — same ink as the base label (DESIGN_SYSTEM §5)
      "text-halo-color": "#f7f1df",    // mirrors --map-cream
      "text-halo-width": 2.2,          // stronger halo so the focus label reads on top of the base label
      "text-halo-blur": 0.3,
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "pinned"], false], 1,
        ["boolean", ["feature-state", "hover"], false], 1,
        0,
      ],
    },
  };
}

// Reapply every YEAR/METRIC-dependent map expression on a persistent map — the
// paint-swap that replaces the old per-year setData. Called by the page on a
// year OR metric change; the source (combined all-years file) is never reloaded,
// so geometry stays put and nbhd-fill's fill-color-transition tweens the colour.
// Mirrors choroplethLayers exactly (same builders), updating only the layers
// whose expressions read a per-year field — nbhd-highlight (feature-state only)
// and the centroid NAME labels (display_name, a separate year-invariant source)
// are untouched. Guarded:
// the map can be mid-teardown (getLayer throws on a removed map).
export function applyYearMetric(map, metricKey, year, stops) {
  if (!map || !map.getLayer("nbhd-fill")) return;
  // YoY SNAPs on a year/metric change (duration 0) — even now that it's a continuous
  // diverging ramp (D6), a year change jumps straight to the new colour rather than
  // sweeping the ramp; the sequential $ metrics keep their reduced-motion-aware
  // cross-fade. Set the transition BEFORE the colour so it honours the new duration.
  map.setPaintProperty(
    "nbhd-fill", "fill-color-transition",
    metricKey === "yoy_log_points" ? { duration: 0, delay: 0 } : paintTransition(DUR_BASE)
  );
  map.setPaintProperty("nbhd-fill", "fill-color", buildFillColourExpression(metricKey, year, stops));
  map.setPaintProperty("nbhd-fill", "fill-opacity", fillOpacityExpr(year));
  map.setFilter("nbhd-pattern", patternFilter(year));
  map.setPaintProperty("nbhd-pattern", "fill-pattern", patternMatch(year));
  map.setFilter("nbhd-outline-solid", solidOutlineFilter(year));
  map.setPaintProperty("nbhd-outline-solid", "line-color", solidOutlineColor(year));
  map.setFilter("nbhd-outline-suppressed", stateEqFilter(year, "suppressed_low_n"));
  map.setFilter("nbhd-outline-nodata", stateEqFilter(year, "no_data"));
}

// Pattern images for MapView to register on load (before any layer that
// references them via `fill-pattern`).
export function choroplethImages() {
  return [
    { id: "stripes", make: () => makeStripePattern() },
    { id: "dots",    make: () => makeDotPattern() },
  ];
}
