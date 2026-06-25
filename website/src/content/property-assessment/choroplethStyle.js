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

export const BASEMAP_STYLE = "/styles/custom-basemap.json";

// ---- Per-metric colour ramps -----------------------------------------------
// Each metric colours by its own 5-stop ramp (min→Q25→median→Q75→max). The
// per-year thresholds come from the manifest or the data; only the colours are
// fixed here. Each palette is perceptually ordered, colourblind-aware, and
// shifted to stay visible against the cream CARTO Voyager basemap.
//   key   = manifest colourScaleByYear field / quantile role
//   c     = fill colour at that stop
//   label = role in the IQR (shown in the legend)

// ── Assessed-value $ ramp (RAMP_ASSESSED) — QUANTILE-CLASSED (step), 6 bands.
// The map paints DISCRETE quantile bands (see buildFillColourExpression's step
// path), so each band holds ~equal NUMBERS of neighbourhoods — fixing the orange
// mid-plateau an interpolate-by-raw-value ramp produced (the central quartiles
// are squeezed into a narrow $ range, so the median band barely changed colour
// while all contrast dumped into the sparse tail). The low band uses the shared
// RAMP_FLOOR (#fbe3a0, via rampFloor) — the same soft warm yellow as the Business
// Census floor — so it reads as DATA on the cream basemap. Stops are keyed onto the per-year/metric
// break scale ENRICHED with two IQR-derived tail breaks (see withTailBreaks):
// mid75 = q75 + ½·IQR, near = q75 + IQR. The top band [near, ∞) = bright Ferrari
// #cc0000 — because the high-value tail is long (~5·IQR every year), `near` sits
// only ~20% up it, so that band is a VISIBLE ~top-12-15% region, not the single
// max polygon. `max` is a legend boundary only, NEVER a step threshold (that
// would strand #cc0000 on one polygon). RAMP_ASSESSED is the exposed tunable.
const RAMP_ASSESSED = [
  { key: "min",    c: rampFloor("#f5f0e8"), label: "min" }, // step BASE (value < q25) — shared soft-yellow floor (#fbe3a0), matches Business Census
  { key: "q25",    c: "#f5a02e", label: "Q25"      }, // amber
  { key: "median", c: "#ec6f2e", label: "median"   }, // orange-red — true phase-midpoint
  { key: "q75",    c: "#e0381c", label: "Q75"      }, // scarlet
  { key: "mid75",  c: "#c01410", label: "Q75+½IQR" }, // deep red
  { key: "near",   c: "#cc0000", label: "Q75+IQR"  }, // bright Ferrari — [near, ∞)
];

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
  // yoy_pct_change uses YOY_STOPS (diverging) — not this table.
};

// Default ramp for fallback (used when metric key is unknown).
const RAMP_DEFAULT = RAMP_ASSESSED;

// Turn a {min,q25,median,q75,max} scale into the [{ v, c, label }] stops the
// map and legend consume. Returns null if any value is missing, non-finite, or
// not strictly ascending — MapLibre's interpolate requires ascending inputs,
// so a bad scale must fall back rather than throw at render time.
// Enrich a {min,q25,median,q75,max} scale with two IQR-derived TAIL breaks so the
// long high-value tail splits into visible step bands: mid75 = q75 + ½·IQR, near
// = q75 + IQR. Pure + data-driven per year/metric (no literal $). Only the
// assessed ramp (which declares the mid75/near keys) consumes these.
function withTailBreaks(scale) {
  if (!scale) return scale;
  const iqr = scale.q75 - scale.q25;
  return { ...scale, mid75: scale.q75 + iqr / 2, near: scale.q75 + iqr };
}

function buildStops(scale, ramp = RAMP_DEFAULT) {
  // Assessed ramp keys onto the IQR-enriched scale (min,q25,median,q75,mid75,near);
  // other ramps key onto the plain 5-break scale (min,q25,median,q75,max).
  const sc = ramp === RAMP_ASSESSED ? withTailBreaks(scale) : scale;
  const stops = ramp.map((r) => ({
    v: sc?.[r.key], c: r.c, label: r.label,
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

// ---- Year-over-year diverging scale ----------------------------------------
// Fixed blue→white→red diverging ramp (ColorBrewer RdBu reversed) for
// yoy_pct_change (a signed %, unlike the sequential $ metrics). NOT per-year and
// NOT data-derived: a stable scale centred on 0% so a colour means the same
// change in every year. Values are already on the 0-100 % scale (e.g. -5 = down
// 5%), matching fmtPct. blue = decline, warm = growth — accentuated arms (navy
// decline, solid orange growth, strong red at the top) so the diverging signal
// reads clearly against the basemap.
const YOY_STOPS = [
  { v: -15, c: "#1040a0", label: "-15%" },
  { v:  -5, c: "#4393c3", label: "-5%"  },
  { v:   0, c: "#f5f5f5", label: "0%"   },
  { v:   5, c: "#f4782a", label: "+5%"  },
  { v:  15, c: "#b83020", label: "+15%" },
];
export { YOY_STOPS };

// ---- Choropleth metrics ----------------------------------------------------
// The columns the user can colour the map by. key = GeoJSON property,
// label = control + legend text, fmt = value formatter for legend/popup.
const METRICS = [
  { key: "median_assessvalue", label: "Median assessed value",   fmt: fmtCurrency },
  { key: "avall_public",       label: "Mean assessed value",     fmt: fmtCurrency },
  { key: "avg_lotsize",        label: "Mean lot size",           fmt: fmtArea     },
  { key: "median_yearbuilt",   label: "Median year built",       fmt: fmtYear     },
  { key: "yoy_pct_change",     label: "Year-over-year change %", fmt: fmtPct      },
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

// HTML-escape a string for safe interpolation into a setHTML() call.
// Tiny on purpose — popup content is the only place we hand-build HTML.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Build the popup body for one feature. `pinned=true` suppresses the
// "click to pin" footnote (the popup is already pinned). `year` is the
// displayed assessment year, shown in the header so the numbers below are
// never read out of context.
//
// This lives in the section's style file — not in interactions.js — because
// the row table + state labels are the section's visual contract. Changing
// a label or adding a row is a one-file edit here.
// `detail` selects the tier:
//   detail=false → Tier 2 (slim hover): name + district + headline + N props.
//   detail=true  → Tier 3 (pinned click): name + district + year + state badge
//                  + every row + copy button + dismiss hint.
export function buildPopupHtml(p, detail, year) {
  const state = p.polygon_state;
  const meta = STATE_STYLE[state] || { label: state };

  const parts = [
    `<div class="pop-name">${escapeHtml(p.display_name)}</div>`,
  ];
  if (p.district) {
    parts.push(`<div class="pop-district">${escapeHtml(p.district)} district</div>`);
  }
  // Year label + state badge are Tier 3 only — the slim hover stays terse.
  if (detail && year != null) {
    parts.push(`<div class="pop-year">${escapeHtml(String(year))} Assessment</div>`);
  }
  if (detail) {
    parts.push(`<div class="pop-state ${state}">${escapeHtml(meta.label)}</div>`);
  }

  if (state === "aggregated") {
    // Tier 2 (detail=false) is a slim preview: the headline metric + N
    // properties only. Tier 3 (detail=true) keeps every row.
    const rows = detail
      ? POPUP_ROWS
      : POPUP_ROWS.filter(([key, , , headline]) => headline || key === "n_properties");
    for (const [key, label, fmt, headline] of rows) {
      parts.push(
        `<div class="pop-row${headline ? " headline" : ""}">` +
          `<span class="pop-k">${label}</span>` +
          `<span class="pop-v">${fmt(p[key])}</span>` +
        `</div>`
      );
    }
  } else if (state === "suppressed_low_n") {
    // Count is informative; value itself is suppressed per the aggregation rule.
    parts.push(
      `<div class="pop-row">` +
        `<span class="pop-k">N properties</span>` +
        `<span class="pop-v">${fmtNumber(p.n_properties)}</span>` +
      `</div>`,
      `<div class="pop-row">` +
        `<span class="pop-k">Median assessed</span>` +
        `<span class="pop-v pop-v-muted">suppressed</span>` +
      `</div>`,
      `<div class="pop-reason">Fewer than 100 properties — aggregate values suppressed to protect privacy.</div>`
    );
  } else if (state === "non_residential") {
    parts.push(`<div class="pop-reason">No residential properties in this area. May include river valley, industrial zones, parks, or commercial-only land.</div>`);
  } else if (state === "manufactured_home_community") {
    parts.push(`<div class="pop-reason">Manufactured home community. Lot sizes are not recorded for leased-land properties.</div>`);
  } else if (state === "no_data") {
    parts.push(`<div class="pop-reason">No assessment data for this boundary. Area may be unregistered, recently annexed, or a planning placeholder.</div>`);
  }

  if (detail) {
    // Copy-stats button — wired up in interactions.js after the popup mounts
    // (inline onclick in MapLibre popup HTML is unreliable).
    parts.push(`<button class="pop-copy-btn" id="pop-copy-btn">Copy stats</button>`);
    parts.push(`<div class="pop-pinned-hint">Click map to dismiss</div>`);
  }
  // Tier 2 hover has no hint — it's a quick preview, not an action prompt.
  return parts.join("");
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
// case: state == aggregated → linear interpolation over the given stops,
//       reading the chosen metric column
// otherwise → that state's flat fillColor (or fallback grey).
function buildFillColourExpression(metricKey, stops) {
  const isYoy = metricKey === "yoy_pct_change";
  // Assessed-value $ metrics are QUANTILE-CLASSED: a `step` over the value with
  // the quantile breaks as thresholds, so each band holds ~equal NUMBERS of
  // neighbourhoods (no interpolate-by-raw-value mid plateau). Every other
  // sequential metric + yoy keep the continuous interpolate below — unchanged.
  const useStep = METRIC_RAMP[metricKey] === RAMP_ASSESSED;

  let aggregatedFill;
  if (useStep) {
    const value = ["number", ["get", metricKey], 0];
    // Defensive: MapLibre `step` THROWS on non-ascending thresholds — drop any
    // tied stop (buildStops already guarantees ascending; this is insurance).
    const asc = [];
    for (const s of stops) {
      if (asc.length === 0 || s.v > asc[asc.length - 1].v) asc.push(s);
    }
    // asc[0].c is the BASE (value < asc[1].v = q25); asc[1..] are (threshold,colour).
    const step = ["step", value, asc[0].c];
    for (let i = 1; i < asc.length; i++) step.push(asc[i].v, asc[i].c);
    aggregatedFill = step;
  } else {
    // yoy can be null on an aggregated polygon (new since the prior year).
    // Coalesce missing to a sentinel OUTSIDE YOY_STOPS so we detect "no value"
    // without relying on MapLibre null-comparison semantics. Non-yoy interpolate
    // metrics never miss on an aggregated polygon, so they keep the 0 fallback.
    const MISSING = -999;
    const value = ["number", ["get", metricKey], isYoy ? MISSING : 0];
    const interp = ["interpolate", ["linear"], value];
    for (const s of stops) interp.push(s.v, s.c);
    // For yoy, an aggregated-but-missing polygon is painted no_data grey (honest)
    // instead of clamping the sentinel to an extreme ramp colour.
    aggregatedFill = isYoy
      ? ["case", ["==", value, MISSING], STATE_STYLE.no_data.fillColor, interp]
      : interp;
  }

  return [
    "case",
    ["==", ["get", "polygon_state"], "aggregated"],                  aggregatedFill,
    ["==", ["get", "polygon_state"], "suppressed_low_n"],            STATE_STYLE.suppressed_low_n.fillColor,
    ["==", ["get", "polygon_state"], "non_residential"],             STATE_STYLE.non_residential.fillColor,
    ["==", ["get", "polygon_state"], "manufactured_home_community"], STATE_STYLE.manufactured_home_community.fillColor,
    ["==", ["get", "polygon_state"], "no_data"],                     STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

// Public fill-colour expression for the chosen metric + stops. The page uses
// this with map.setPaintProperty to repaint on a metric/scale change without
// remounting the map (see MapView's note on live updates).
export function choroplethFillColor(metricKey = "median_assessvalue", stops = STOPS) {
  return buildFillColourExpression(metricKey, stops);
}

// ---- Layer specs handed to MapView ----------------------------------------
// One function so the consumer file is short. Layers are in z-order
// (first = bottom). MapView inserts them all below the basemap's labels.
// `stops` selects the colour ramp and `metricKey` the column to colour by;
// both default to the locked median scale when a caller doesn't pass them.
export function choroplethLayers(stops = STOPS, metricKey = "median_assessvalue") {
  return [
    // 1. Fill colour for every polygon. Aggregated polygons get the solid ramp
    //    (lifting on hover/pin); non-aggregated polygons are near-transparent
    //    "glass" so the basemap shows through, with a faint white wash on hover
    //    to confirm the interaction. The outline (below) carries the state.
    {
      id: "nbhd-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(metricKey, stops),
        // Tween the colour on a metric/scale change instead of snapping.
        "fill-color-transition": paintTransition(DUR_BASE),
        "fill-opacity": [
          "case",
          ["==", ["get", "polygon_state"], "aggregated"],
            [
              "case",
              ["boolean", ["feature-state", "hover"], false], 0.88,
              ["boolean", ["feature-state", "pinned"], false], 0.88,
              0.74,
            ],
          ["boolean", ["feature-state", "hover"], false], 0.15,
          ["boolean", ["feature-state", "pinned"], false], 0.15,
          0.04,
        ],
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
      filter: ["==", ["get", "polygon_state"], "suppressed_low_n"],
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
      filter: ["==", ["get", "polygon_state"], "no_data"],
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
        "text-anchor": "center",
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
      filter: ["==", ["get", "polygon_state"], "suppressed_low_n"],
      minzoom: 11,
      layout: {
        "text-field": ["concat", "N=", ["to-string", ["get", "n_properties"]]],
        "text-size": 9,
        "text-font": ["Noto Sans Regular"],
        "text-anchor": "center",
      },
      paint: {
        "text-color": "#7a7468",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
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
