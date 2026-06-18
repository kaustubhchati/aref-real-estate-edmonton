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

// ---- Map view defaults (Edmonton, matches 09_build_choropleth.html) --------
// (Data URL no longer lives here — single source of truth is dataSources.js,
// which the page resolves from the (city, year) controls.)
export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 17,
};

export const BASEMAP_STYLE = "/styles/custom-basemap.json";

// ---- Colour ramp: fixed colours + IQR roles, per-year $ thresholds ---------
// Only the dollar thresholds change between years; the five colours and their
// roles (min … max) are constant. RAMP holds the constant part; the per-year
// values come from the manifest via stopsFromScale().
//   key   = the field name in a manifest colourScaleByYear entry
//   c     = fill colour at that stop
//   label = role in the IQR (shown in the legend)
const RAMP = [
  { key: "min",    c: "#ffffcc", label: "min"    },
  { key: "q25",    c: "#fed976", label: "Q25"    },
  { key: "median", c: "#feb24c", label: "median" },
  { key: "q75",    c: "#fd8d3c", label: "Q75"    },
  { key: "max",    c: "#bd0026", label: "max"    },
];

// Turn a {min,q25,median,q75,max} scale into the [{ v, c, label }] stops the
// map and legend consume. Returns null if any value is missing, non-finite, or
// not strictly ascending — MapLibre's interpolate requires ascending inputs,
// so a bad scale must fall back rather than throw at render time.
function buildStops(scale) {
  const stops = RAMP.map((r) => ({ v: scale?.[r.key], c: r.c, label: r.label }));
  const finite = stops.every((s) => Number.isFinite(s.v));
  const ascending = stops.every((s, i) => i === 0 || s.v > stops[i - 1].v);
  return finite && ascending ? stops : null;
}

// Locked fallback domain (PHASE1_STATUS §5, 2026 actuals). Used when a year has
// no usable scale in the manifest. Valid by construction, so always non-null.
export const STOPS = buildStops({
  min: 103500, q25: 352625, median: 425125, q75: 496188, max: 1226000,
});

// Per-year stops from a manifest colourScaleByYear[year] entry, falling back to
// the locked STOPS when that year's scale is missing or unusable.
export function stopsFromScale(scale) {
  return buildStops(scale) ?? STOPS;
}

// Compute ramp stops for a metric straight from the loaded GeoJSON: the
// [min, Q25, median, Q75, max] of that metric across aggregated polygons,
// mapped onto RAMP's fixed colours. Used for the metrics the manifest has no
// scale for — i.e. everything except median_assessvalue, which keeps its locked
// manifest scale. Falls back to the locked STOPS when there's too little data,
// and drops any stop not strictly greater than the previous one so MapLibre's
// interpolate (which requires ascending inputs) never throws on ties.
export function metricStops(gj, metricKey) {
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.polygon_state !== "aggregated") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < 2) return STOPS;
  vals.sort((a, b) => a - b);

  const ps = [0, 0.25, 0.5, 0.75, 1]; // min, Q25, median, Q75, max — aligns to RAMP
  const raw = RAMP.map((r, i) => ({ v: quantile(vals, ps[i]), c: r.c, label: r.label }));

  const stops = [];
  for (const s of raw) {
    if (stops.length === 0 || s.v > stops[stops.length - 1].v) stops.push(s);
  }
  return stops.length >= 2 ? stops : STOPS;
}

// Linear-interpolated quantile of an ascending-sorted array (p in [0, 1]).
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- Year-over-year diverging scale ----------------------------------------
// Fixed blue→white→red diverging ramp for yoy_pct_change (a signed %, unlike
// the sequential $ metrics). NOT per-year and NOT data-derived: a stable scale
// centred on 0% so a colour means the same change in every year. Values are
// already on the 0-100 % scale (e.g. -5 = down 5%), matching fmtPct.
const YOY_STOPS = [
  { v: -15, c: "#2166ac", label: "-15%" },
  { v:  -5, c: "#92c5de", label: "-5%"  },
  { v:   0, c: "#f7f7f7", label: "0%"   },
  { v:   5, c: "#f4a582", label: "+5%"  },
  { v:  15, c: "#b2182b", label: "+15%" },
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
    outlineColor: "#ffffff",
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
export function buildPopupHtml(p, pinned, year) {
  const state = p.polygon_state;
  const meta = STATE_STYLE[state] || { label: state };

  const parts = [
    `<div class="pop-name">${escapeHtml(p.display_name)}</div>`,
  ];
  if (p.district) {
    parts.push(`<div class="pop-district">${escapeHtml(p.district)} district</div>`);
  }
  if (year != null) {
    parts.push(`<div class="pop-year">${escapeHtml(String(year))} Assessment</div>`);
  }
  parts.push(`<div class="pop-state ${state}">${escapeHtml(meta.label)}</div>`);

  if (state === "aggregated") {
    for (const [key, label, fmt, headline] of POPUP_ROWS) {
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

  if (pinned) {
    // Copy-stats button — wired up in interactions.js after the popup mounts
    // (inline onclick in MapLibre popup HTML is unreliable).
    parts.push(`<button class="pop-copy-btn" id="pop-copy-btn">Copy stats</button>`);
  } else {
    parts.push(`<div class="pop-pinned-hint">Click to pin · click polygon to zoom in.</div>`);
  }
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
  // yoy can be null on an aggregated polygon (new since the prior year). Coalesce
  // missing values to a sentinel OUTSIDE the YOY_STOPS range so we can detect
  // "no value" without relying on MapLibre null-comparison semantics. Non-yoy
  // metrics never miss on an aggregated polygon, so they keep the 0 fallback.
  const MISSING = -999;
  const value = ["number", ["get", metricKey], isYoy ? MISSING : 0];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);

  // For yoy, paint an aggregated-but-missing polygon as no_data grey (honest)
  // instead of letting the sentinel clamp to an extreme ramp colour. Only
  // aggregated polygons take this path, so suppressed / non-residential / etc.
  // keep their own state colours below.
  const aggregatedFill = isYoy
    ? ["case", ["==", value, MISSING], STATE_STYLE.no_data.fillColor, interp]
    : interp;

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
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          8,  ["match", ["get", "polygon_state"],
                "non_residential", 0.3,
                "manufactured_home_community", 0.4,
                0.2],
          13, ["match", ["get", "polygon_state"],
                "non_residential", 1.0,
                "manufactured_home_community", 1.2,
                0.8],
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
