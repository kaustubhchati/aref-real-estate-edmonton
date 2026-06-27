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

import { fmtCurrency, fmtNumber, fmtPct, fmtYear, fmtArea } from "../../utils/format.js";
import { polyOutline, rampFloor, POLY_OUTLINE_WIDTH } from "../../components/choroplethTheme.js";
import { paintTransition, DUR_BASE } from "../../components/motion.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";

// ---- Map view defaults (Edmonton, matches 09_build_choropleth.html) --------
// (Data URL no longer lives here — single source of truth is dataSources.js,
// which the page resolves from the (city, year) controls.)
export const MAP_VIEW = {
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid (centres default + constrained view)
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 17,
  maxBounds: CITY_BOUNDS.Edmonton,   // lock pan to the city extent (per-city config)
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
  median_yearbuilt:   RAMP_YEAR,
  // yoy_pct_change uses the discrete yoyBands / YOY_BAND_COLOURS scale — not this table.
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
export function metricStops(gj, metricKey) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.polygon_state !== "aggregated") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 2) return STOPS;
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
  return buildStops(q, ramp) ?? STOPS;
}

// Linear-interpolated quantile of an ascending-sorted array (p in [0, 1]).
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- Year-over-year diverging scale (DISCRETE classes) ---------------------
// yoy_pct_change is a signed % (unlike the sequential $ metrics), painted on a
// DISCRETE diverging scale: similar neighbourhoods share an EXACT colour, so the
// map reads as patches, not per-polygon confetti (continuous shading over 400+
// polygons is noise). Six classes on a zero-centred symmetric structure: 0 is
// the central break, the arms clamp at ±E where E = p98(|yoy|) across ALL
// neighbourhood-years (data-derived, no year literal — refresh-by-design). Inner
// breaks at ±E/3. blue = decline, warm = growth.
//
// COLOURS — ColorBrewer RdBu family (diverging, colourblind-safe), lightness-
// ordered cool→warm, with the inner two nudged to RdBu-5 tones so the pale
// near-zero bands still read on the cream basemap. The MOST-POSITIVE band binds
// to MEDIAN_RED (the level metrics' hottest red) — a coherence requirement: the
// YoY top class is the SAME red the median map uses, read from RAMP_ASSESSED so
// it can never drift. Only the warm extreme is shared; the rest of the ramp is
// built colourblind-safe and balanced around it.
// The COOL extreme is deepened to ColorBrewer Blues #08519c (higher chroma than
// RdBu's #2166ac) to chroma-balance the high-chroma MEDIAN_RED warm arm — so
// equal-magnitude decline reads about as emphatic as equal-magnitude growth
// (KC's call: raise the cool side, never desaturate the bound red).
const YOY_BAND_COLOURS = [
  "#08519c", // ≤ -E      deep blue      (strong decline) — chroma-matched to #cc0000
  "#4393c3", // [-E,-E/3) medium blue
  "#92c5de", // [-E/3,0)  light blue     (mild decline)
  "#f4a582", // [0,+E/3)  light salmon   (mild growth)
  "#d6604d", // [+E/3,+E) medium red
  MEDIAN_RED, // ≥ +E     median red      (strong growth) — bound, not re-typed
];

// Build the six YoY classes for a clamp endpoint E. Each class is a band:
//   from / to — its value range (±Infinity at the clamped ends)
//   c         — its colour      label — its range, shown in the legend
// The fill expression turns the band edges into a MapLibre `step`; the Legend
// renders one swatch per band. Breaks: -E, -E/3, 0, +E/3, +E (0 central).
function yoyBands(E) {
  const r = (x) => Math.round(x);
  const pct = (x) => `${x > 0 ? "+" : ""}${r(x)}%`; // signed, rounded label
  return [
    { from: -Infinity, to: -E,       c: YOY_BAND_COLOURS[0], label: `≤ ${pct(-E)}` },
    { from: -E,        to: -E / 3,   c: YOY_BAND_COLOURS[1], label: `${pct(-E)} to ${pct(-E / 3)}` },
    { from: -E / 3,    to: 0,        c: YOY_BAND_COLOURS[2], label: `${pct(-E / 3)} to 0%` },
    { from: 0,         to: E / 3,    c: YOY_BAND_COLOURS[3], label: `0% to ${pct(E / 3)}` },
    { from: E / 3,     to: E,        c: YOY_BAND_COLOURS[4], label: `${pct(E / 3)} to ${pct(E)}` },
    { from: E,         to: Infinity, c: YOY_BAND_COLOURS[5], label: `≥ ${pct(E)}` },
  ];
}

// Locked fallback E (the 2026 actual p98|yoy|≈15.5), used until enough data has
// loaded to derive E. Keeps the discrete scheme valid on first paint.
const YOY_FALLBACK_E = 15.5;

// Data-derived discrete YoY classes (refresh-by-design — no baked endpoint). E =
// p98 of |yoy| across every neighbourhood-year passed in; the long tail clamps
// at ±E. 0 stays the central break, NOT recentred off the +2% median (most
// neighbourhoods genuinely rose — that warm lean is real signal). Sentinel/NA
// are excluded upstream (Number.isFinite). Falls back to YOY_FALLBACK_E until
// ≥20 values have loaded.
export function yoyStopsFromValues(values) {
  const mags = (values ?? [])
    .filter((v) => Number.isFinite(v))
    .map(Math.abs)
    .sort((a, b) => a - b);
  // E must be > 0 or the band breaks (±E, ±E/3) collapse to a single value and
  // MapLibre's `step` throws on non-ascending inputs. Too few values, or a
  // degenerate all-near-zero distribution (p98 == 0), fall back to the locked
  // endpoint — the YoY analogue of the sequential ramps' strictly-ascending guard.
  const p98 = quantile(mags, 0.98);
  const E = mags.length < 20 || !(p98 > 0) ? YOY_FALLBACK_E : p98;
  return yoyBands(E);
}

// ---- Choropleth metrics ----------------------------------------------------
// The columns the user can colour the map by. ONE source of truth (the metric
// control, the legend, the default, and the URL all read this):
//   key   = GeoJSON property to colour by
//   label = control + legend text
//   fmt   = value formatter for legend / rail
//   icon  = a single SVG <path d="…"> (Lucide-style, stroke-based, 24×24 viewBox)
//           drawn by the segmented metric control (SegmentedControl.jsx). Adding
//           a metric stays a ONE-PLACE change — add its row here, icon included.
const METRICS = [
  { key: "median_assessvalue", label: "Median assessed value",   fmt: fmtCurrency,
    icon: "M12 2v20 M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },             // dollar
  { key: "avall_public",       label: "Mean assessed value",     fmt: fmtCurrency,
    icon: "M3 3v18h18 M8 17V9 M13 17V5 M18 17v-7" },                                  // distribution / mean
  { key: "avg_lotsize",        label: "Mean lot size",           fmt: fmtArea,
    icon: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7" },                              // area / extent
  { key: "median_yearbuilt",   label: "Median year built",       fmt: fmtYear,
    icon: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" }, // calendar
  { key: "yoy_pct_change",     label: "Year-over-year change %", fmt: fmtPct,
    icon: "M3 17l6-6 4 4 8-8 M21 7v6 M21 7h-6" },                                     // trending up
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

// ---- Popup rows ------------------------------------------------------------
// One row per aggregate column shown for an `aggregated` polygon. The first
// entry is the headline (border-emphasised) and matches the choropleth
// variable. Suppressed_low_n polygons show only n_properties + a "suppressed"
// note; the other three states show only their label badge.
//
// Tuple format: [propertyKey, displayLabel, formatter, isHeadline]
export const POPUP_ROWS = [
  ["median_assessvalue",           "Median assessed",          fmtCurrency, true ],
  ["n_properties",                 "N properties",             fmtNumber,   false],
  ["avall_public",                 "Mean assessed (all)",      fmtCurrency, false],
  ["sd_assessedvalue",             "SD assessed",              fmtCurrency, false],
  ["median_yearbuilt",             "Median year built",        fmtYear,     false],
  ["pct_with_unit",                "% with unit (condo)",      fmtPct,      false],
  ["avg_assessvalue_without_unit", "Mean assessed (non-unit)", fmtCurrency, false],
  ["avg_lotsize",                  "Mean lot size",            fmtArea,     false],
];

// NOTE: the per-feature DETAIL view (name, year, state badge, the POPUP_ROWS
// table, suppression / no-data notes) used to be hand-built HTML here
// (buildPopupHtml + escapeHtml) for a MapLibre popup. It now renders as React in
// the right info rail — see InfoRail.jsx, which consumes POPUP_ROWS + STATE_STYLE
// above (and owns the per-state note copy). POPUP_ROWS / STATE_STYLE stay here as
// the section's visual contract; the HTML builders were removed with the popup.

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
  const isYoy = metricKey === "yoy_pct_change";
  const MISSING = -999;
  const value = ["number", yget(metricKey, year), isYoy ? MISSING : 0];

  let aggregatedFill;
  if (isYoy) {
    // yoy paints DISCRETE classes: a `step` over the band edges (stops = yoyBands)
    // so same-band neighbourhoods share an exact colour (patches, not confetti).
    // stops[0].c is the colour BELOW the first break (the ≤ -E clamp); each later
    // band starts at its `from`. A missing prior-year value (MISSING sentinel,
    // which sorts below -E) is caught FIRST and painted no_data grey — never the
    // clamp blue. Hard-edged across polygons within a year; year-changes SNAP
    // class→class (applyYearMetric zeroes the tween for yoy) so a polygon never
    // shows an off-class blended colour.
    const step = ["step", value, stops[0].c];
    for (let i = 1; i < stops.length; i++) step.push(stops[i].from, stops[i].c);
    aggregatedFill = ["case", ["==", value, MISSING], STATE_STYLE.no_data.fillColor, step];
  } else {
    // Every aggregated sequential metric INTERPOLATES over its per-year quantile
    // stop VALUES (min/q25/median/q75/max) — a CONTINUOUS colour space (so the
    // colour can tween on a year swap via fill-color-transition) with breaks still
    // anchored at the quantile boundaries (no raw-value mid-plateau).
    const interp = ["interpolate", ["linear"], value];
    for (const s of stops) interp.push(s.v, s.c);
    aggregatedFill = interp;
  }

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

// Public fill-colour expression for the chosen metric + year + stops. The page
// uses this (via applyYearMetric) with map.setPaintProperty to repaint on a
// metric/year/scale change without remounting the map.
export function choroplethFillColor(metricKey = "median_assessvalue", year, stops = STOPS) {
  return buildFillColourExpression(metricKey, year, stops);
}

// ---- The other year-keyed expressions ---------------------------------------
// fill-opacity (lifts aggregated polygons, dims glass states) and the per-state
// FILTERS / colour matches / count label — all read polygon_state (or
// n_properties) for `year`. Factored out so choroplethLayers (initial mount) and
// applyYearMetric (year/metric change) build them from ONE source of truth.
function fillOpacityExpr(year) {
  const state = yget("polygon_state", year);
  return [
    "case",
    ["==", state, "aggregated"],
      [
        "case",
        ["boolean", ["feature-state", "hover"], false], 0.88,
        ["boolean", ["feature-state", "pinned"], false], 0.88,
        0.74,
      ],
    ["boolean", ["feature-state", "hover"], false], 0.15,
    ["boolean", ["feature-state", "pinned"], false], 0.15,
    0.04,
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
const suppressedCountText = (year) => [
  "concat", "N=", ["to-string", yget("n_properties", year)],
];

// ---- Layer specs handed to MapView ----------------------------------------
// One function so the consumer file is short. Layers are in z-order
// (first = bottom). MapView inserts them all below the basemap's labels.
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
    // 6. Highlight outline — invisible by default, darkens on hover, darker
    //    + thicker when pinned. Sits below the basemap labels via beforeId.
    {
      id: "nbhd-highlight",
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
    // 7. Neighbourhood name labels. Last in the array so they render above the
    //    fills and outlines. Only from zoom 11 in, so the city-wide view stays
    //    uncluttered and labels appear as the user zooms to a neighbourhood.
    {
      id: "nbhd-labels",
      type: "symbol",
      minzoom: 11,
      layout: {
        "text-field": ["get", "display_name"],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        // Collision avoidance: try centred first (keeps the current on-centroid
        // look), then nudge to an offset anchor instead of DROPPING the label
        // when labels crowd at zoom 11+.
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
    // 8. N-count label on suppressed (N < 100) polygons. These carry no value
    //    on the ramp, so showing the count makes the suppression legible rather
    //    than just grey. Zoom 11+ like the name labels, to keep the wide view
    //    uncluttered.
    {
      id: "nbhd-suppressed-count",
      type: "symbol",
      filter: stateEqFilter(year, "suppressed_low_n"),
      minzoom: 11,
      layout: {
        "text-field": suppressedCountText(year),
        "text-size": 9,
        "text-font": ["Noto Sans Regular"],
        // Collision avoidance: try centred first (keeps the current on-centroid
        // look), then nudge to an offset anchor instead of DROPPING the label
        // when labels crowd at zoom 11+.
        "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
        "text-radial-offset": 0.6,
        "text-justify": "auto",
      },
      paint: {
        "text-color": "#7a7468",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
      },
    },
  ];
}

// Reapply every YEAR/METRIC-dependent map expression on a persistent map — the
// paint-swap that replaces the old per-year setData. Called by the page on a
// year OR metric change; the source (combined all-years file) is never reloaded,
// so geometry stays put and nbhd-fill's fill-color-transition tweens the colour.
// Mirrors choroplethLayers exactly (same builders), updating only the layers
// whose expressions read a per-year field — nbhd-highlight (feature-state only)
// and nbhd-labels (display_name) are year-invariant and untouched. Guarded:
// the map can be mid-teardown (getLayer throws on a removed map).
export function applyYearMetric(map, metricKey, year, stops) {
  if (!map || !map.getLayer("nbhd-fill")) return;
  // Discrete YoY classes SNAP on a year/metric change (duration 0) — a classed
  // map never animates through off-class colours; the continuous $ metrics keep
  // their reduced-motion-aware cross-fade. Set the transition BEFORE the colour so
  // the colour change honours the new duration.
  map.setPaintProperty(
    "nbhd-fill", "fill-color-transition",
    metricKey === "yoy_pct_change" ? { duration: 0, delay: 0 } : paintTransition(DUR_BASE)
  );
  map.setPaintProperty("nbhd-fill", "fill-color", buildFillColourExpression(metricKey, year, stops));
  map.setPaintProperty("nbhd-fill", "fill-opacity", fillOpacityExpr(year));
  map.setFilter("nbhd-pattern", patternFilter(year));
  map.setPaintProperty("nbhd-pattern", "fill-pattern", patternMatch(year));
  map.setFilter("nbhd-outline-solid", solidOutlineFilter(year));
  map.setPaintProperty("nbhd-outline-solid", "line-color", solidOutlineColor(year));
  map.setFilter("nbhd-outline-suppressed", stateEqFilter(year, "suppressed_low_n"));
  map.setFilter("nbhd-outline-nodata", stateEqFilter(year, "no_data"));
  map.setFilter("nbhd-suppressed-count", stateEqFilter(year, "suppressed_low_n"));
  map.setLayoutProperty("nbhd-suppressed-count", "text-field", suppressedCountText(year));
}

// Pattern images for MapView to register on load (before any layer that
// references them via `fill-pattern`).
export function choroplethImages() {
  return [
    { id: "stripes", make: () => makeStripePattern() },
    { id: "dots",    make: () => makeDotPattern() },
  ];
}
