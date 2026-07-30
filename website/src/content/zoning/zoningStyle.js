// =============================================================================
// zoningStyle.js — the ONE knob file for the Zoning zones map (permitStyle.js
// convention: every colour, zoom threshold and layer spec lives here).
//
// PALETTE (optical pass 4, 2026-07-29): ALGORITHMICALLY DERIVED — the Glasbey
// method (greedy farthest-point under a CVD-aware distance: min of normal /
// deuteranopia / protanopia CIE76), seeded with GTA-BRIGHT 5 so the wheel
// provably extends the site's vivid register. Derivation script (frozen):
// pipeline/yeg/zoning/_oneshot/derive_zoning_palette_20260729.py. Constraints:
// chroma floor C*>=46 everywhere (the seed's own minimum — "no greys, no dull
// shades" as a number), >=25° hue spacing (the generalised no-third-green
// rule), and THREE LIGHTNESS BANDS carrying AREA: A L*~85 (Ag 33% + Res 31%),
// B L*~67 (Parks/DC/Civic/Industrial), C L*~54 deep + saturated (Commercial/
// MU/FR/AJ — the figures). Quality score: min pairwise CVD-aware dE 12.4
// (normal-vision min 35.5). LBCS convention is RETIRED as the hue source —
// hue's job is discrimination; the legend and readout carry the meaning.
// Direct Control and Alternative Jurisdiction are REAL HUES (patterns retired
// — DESIGN_SYSTEM §1.4). The zoom ladder (no line layers below z12; dissolved
// family boundaries z12–14; family-tinted parcel hairlines z15+) transcribes
// docs/design/zoning_zoom_ladder_three_states.svg.
// =============================================================================

import { CITY_BOUNDS } from "../../config/cityBounds.js";
import {
  polygonFillLayer, buildPolygonFillColour,
} from "../../components/categoricalPolygon.js";

export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

// Shared pitched home camera frame (mapCamera.js HOME_VIEW.Edmonton).
export const MAP_VIEW = {
  center: [-113.4927, 53.4862],
  zoom: 10.3,
  minZoom: 7,
  maxZoom: 18,
  maxBounds: CITY_BOUNDS.Edmonton,
};

export const SOURCE_ID        = "zoning-parcels";
export const BOUNDS_SOURCE_ID = "zoning-bounds";
export const LIMIT_SOURCE_ID  = "zoning-citylimit";
export const FILL_ID          = "zoning-fill";
export const CASING_ID        = "zoning-casing";
export const FAMILY_LINE_ID   = "zoning-family-lines";
export const HAIRLINE_ID      = "zoning-hairlines";
export const LIMIT_LINE_ID    = "zoning-citylimit-line";

// ---- The ten families (fill / hover / iso from the frozen derivation) --------
// colour = resting band fill · hover = lightness LIFT, hue+chroma held ·
// iso = Band-C toning of the same hue (isolate is a figure state).
// SEMANTIC ASSIGNMENT (optical pass 5, _oneshot/assign_zoning_palette_20260729b.py
// — Lin et al. 2013: generation and assignment are separate operations).
// Absolute reservations: BLUE is water's (no family box); GREEN is Parks'
// alone. One family per hue region; the naming gate passed with one common
// name each: straw · gold · green · violet · brown · plum · red · rose ·
// bronze · orange. Lightness bands BIND (measured, non-overlapping:
// A 82.8–87.9 · B 62.0–70.1 · C 47.0–56.1). Stated chroma relaxations under
// the ratified C*46 floor: DC brown 55→ok, FR dusty rose C52, AJ bronze C46.
export const FAMILY_STYLE = {
  "Agricultural and Rural":    { colour: "#d4e673", hover: "#e8fa86", iso: "#6f8504" },  // A · L88 C58 h113 · straw
  "Residential":               { colour: "#eacd59", hover: "#ffe16e", iso: "#907b03" },  // A · L83 C60 h93 · gold
  "Parks and Open Space":      { colour: "#17c383", hover: "#3bd795", iso: "#098e5e" },  // B · L70 C59 h159 · green
  "Industrial and Employment": { colour: "#b977fa", hover: "#c990fe", iso: "#a055ee" },  // B · L62 C75 h312 · violet
  "Direct Control":            { colour: "#e19549", hover: "#f6a85b", iso: "#b76904" },  // B · L68 C55 h67 · brown
  "Civic and Public Service":  { colour: "#ff7dd9", hover: "#fea0e0", iso: "#e119b6" },  // B · L70 C65 h338 · plum
  "Commercial":                { colour: "#ff2f56", hover: "#fe6571", iso: "#ff2f56" },  // C · L56 C82 h22 · red
  "Future and Reserve":        { colour: "#b8467d", hover: "#cc598f", iso: "#b8467d" },  // C · L47 C52 h352 · rose
  "Alternative Jurisdiction":  { colour: "#976523", hover: "#ab7634", iso: "#976523" },  // C · L47 C46 h72 · bronze
  "Mixed Use":                 { colour: "#d25f06", hover: "#e8711f", iso: "#d25f06" },  // C · L54 C74 h56 · orange (pinned)
};

// ---- Ground + reference layers ------------------------------------------------
// Off-city ground: outside the palette register entirely — highest lightness,
// lowest chroma on the map (L98 C3). The city reads as an island; the county
// reads as absence.
export const ZONING_GROUND = "#fcfaf4";
// Streets: the reference layer, warmed toward the site cream (in register).
const ROAD_WHITE = "#fbf7ec";
// The city-limit line: quiet warm ink, under the roads, over the fill.
const LIMIT_COLOUR = "#b3ab9c";

// =============================================================================
// HIGHLIGHT REGISTER — the state × zoom matrix (optical pass 4 §3).
// With a vivid resting palette, highlight is a DIFFERENT CHANNEL, not more
// colour: fill takes a LIGHTNESS LIFT (hue + chroma held — the per-family
// `hover` hex), and a CASING outlines the parcel. Ten vivid hues occupy most
// of the wheel, so casings are ACHROMATIC-EXTREME on the #141018 dot-casing
// precedent (DESIGN_SYSTEM: the no-greys rule governs data fills; casings and
// chrome are a separate register). Hover is a PREVIEW (near-white casing,
// lighter fill); selection is a COMMITMENT (near-black casing, resting fill,
// persists until cleared). Widths are zoom-interpolated: [cityZoom, parcelZoom].
// =============================================================================
export const HIGHLIGHT = {
  rest:     { casing: null,      width: { 10: 0,   15: 0   }, fill: "colour" },
  hover:    { casing: "#fdfcf7", width: { 10: 1.4, 15: 2.2 }, fill: "hover"  },
  selected: { casing: "#141018", width: { 10: 2.2, 15: 3.6 }, fill: "colour" },
};

const stateFlag = (name) => ["boolean", ["feature-state", name], false];
// MapLibre allows ONE zoom-based subexpression per expression, at the top level
// — so the zoom interpolate is OUTSIDE and the state-cases sit in its output
// stops (the BP cross-fade lesson, same rule).
const stateWidthAt = (z) => ["case",
  stateFlag("selected"), HIGHLIGHT.selected.width[z],
  stateFlag("hover"), HIGHLIGHT.hover.width[z],
  0];

// The casing layer: colour + width switch on feature-state (selection outranks
// hover), so highlighting never re-styles the whole layer — setFeatureState only.
export function casingLayer() {
  return {
    id: CASING_ID,
    type: "line",
    paint: {
      "line-color": ["case",
        stateFlag("selected"), HIGHLIGHT.selected.casing,
        HIGHLIGHT.hover.casing],
      "line-width": ["interpolate", ["linear"], ["zoom"],
        10, stateWidthAt(10),
        15, stateWidthAt(15)],
      "line-opacity": 0.95,
    },
  };
}

// ---- Domain (legend + fill share it; ordered by AREA SHARE descending) --------
// Display shares use largest-remainder rounding at 0.1% so the legend column
// sums to exactly 100.0 (the raw shares sum to ~100 but naive per-row rounding
// showed 101.2). A family the manifest carries but this table doesn't know
// falls to the fallback and is console-warned — loud, never silently invisible.
export function buildZoningDomain(entry) {
  const counts = entry.categoryCounts || {};
  const shares = entry.categoryAreaShare || {};
  const keys = [...(entry.categories || [])]
    .sort((a, b) => (shares[b] || 0) - (shares[a] || 0) || (counts[b] || 0) - (counts[a] || 0));
  // Largest-remainder at 0.1%: floor everything, hand out the leftover tenths
  // to the largest remainders.
  const floors = keys.map((k) => Math.floor((shares[k] || 0) * 10));
  let leftover = 1000 - floors.reduce((s, v) => s + v, 0);
  const order = keys.map((k, i) => [((shares[k] || 0) * 10) % 1, i]).sort((a, b) => b[0] - a[0]);
  const display = [...floors];
  for (const [, i] of order) {
    if (leftover <= 0) break;
    display[i] += 1; leftover -= 1;
  }
  return keys.map((key, i) => {
    const style = FAMILY_STYLE[key];
    if (!style) console.warn(`[zoning] family "${key}" has no derived fill — rendering fallback.`);
    return {
      // Display label uses "&" so the longest family name holds one legend
      // line (row-rhythm fix); the readout keeps the full data value.
      key, label: key.replace(" and ", " & "), count: counts[key],
      share: shares[key], shareDisplay: (display[i] / 10).toFixed(1),
      ...(style ?? { colour: "#c9c2b2", hover: "#d6cfc0", iso: "#8f887b" }),
    };
  });
}

// ---- Isolate mode --------------------------------------------------------------
// The isolated family paints at its Band-C `iso` (isolate is a figure state —
// a ground-tier family must not isolate as a whisper). The remainder keeps
// ORIENTATION: parks drop to a pale cast of their own hue so the river valley
// stays legible; everything else takes the common quiet neutral. Water and
// streets are basemap and stay.
export const ISOLATE_NEUTRAL = "#eae6dc";
export const ISOLATE_PARKS   = "#d9e7dc";   // pale cast of Parks' green — the valley stays legible

function restFillExpression(domain, isolated) {
  if (!isolated) return buildPolygonFillColour("zone_family", domain);
  const it = domain.find((d) => d.key === isolated);
  const arms = [isolated, it?.iso ?? "#8f887b"];
  if (isolated !== "Parks and Open Space") arms.push("Parks and Open Space", ISOLATE_PARKS);
  return ["match", ["get", "zone_family"], ...arms, ISOLATE_NEUTRAL];
}

// The COMPLETE fill paint: hover's lightness lift rides feature-state OVER the
// resting (or isolate) expression. In isolate mode a hovered parcel previews
// its true family colour — the hover channel composes, no special cases.
export function buildFillPaint(domain, isolated = null) {
  const hoverArms = [];
  for (const it of domain) hoverArms.push(it.key, it.hover);
  const hoverExpr = ["match", ["get", "zone_family"], ...hoverArms, "#d6cfc0"];
  return ["case", stateFlag("hover"), hoverExpr, restFillExpression(domain, isolated)];
}

export function zoningFillLayers(domain) {
  return [
    polygonFillLayer({ id: FILL_ID, classField: "zone_family", items: domain, opacity: 1 }),
    casingLayer(),
  ];
}

// ---- Zoom-ladder line rungs -----------------------------------------------------
// Parcel-hairline tint: each family's hairline is its OWN fill darkened by the
// per-channel transform the ladder SVG pins (never neutral grey).
const TINT = [0.80, 0.77, 0.71];
export function hairlineTint(hex) {
  const ch = [1, 3, 5].map((i, k) =>
    Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * TINT[k]))));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

function tintExpression(domain, isolated = null) {
  if (isolated) {
    const it = domain.find((d) => d.key === isolated);
    const arms = [isolated, hairlineTint(it?.iso ?? "#8f887b")];
    if (isolated !== "Parks and Open Space") arms.push("Parks and Open Space", hairlineTint(ISOLATE_PARKS));
    return ["match", ["get", "zone_family"], ...arms, hairlineTint(ISOLATE_NEUTRAL)];
  }
  const arms = [];
  for (const it of domain) arms.push(it.key, hairlineTint(it.colour));
  return ["match", ["get", "zone_family"], ...arms, hairlineTint("#c9c2b2")];
}
export const zoningLineTint = tintExpression;

// District rung (z12–14, fades over 12→13): the dissolved family-boundary lines.
export function familyLineLayer(domain) {
  return {
    id: FAMILY_LINE_ID,
    type: "line",
    source: BOUNDS_SOURCE_ID,
    minzoom: 12,
    maxzoom: 15,
    paint: {
      "line-color": tintExpression(domain),
      "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 14.5, 1.4],
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 0.85],
    },
  };
}

// Parcel rung (z ≥ 15, fades in 15→15.5): per-parcel hairlines, family-tinted.
export function hairlineLayer(domain) {
  return {
    id: HAIRLINE_ID,
    type: "line",
    minzoom: 15,
    paint: {
      "line-color": tintExpression(domain),
      "line-width": 1.0,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 1],
    },
  };
}

// The city-limit line (carried defect: the island needs its edge named) —
// quiet warm ink over the fill, under the roads and labels.
export function cityLimitLayer() {
  return {
    id: LIMIT_LINE_ID,
    type: "line",
    source: LIMIT_SOURCE_ID,
    paint: {
      "line-color": LIMIT_COLOUR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.8, 14, 1.6],
      "line-opacity": 0.8,
    },
  };
}

// ---- Per-instance ground treatment ------------------------------------------
// The applyDeepenedGround precedent: contained to THIS map's instance, run in
// onLoad AFTER applyAppleClassic. Ten vivid fills mean the reference layer
// recedes: land-use/landcover/park/AERODROME fills mute to the off-city ground,
// buildings stay OFF, rail stays a low-prominence hairline, water + cream
// streets promote over the fill (arterials fade at city zoom; widths held).
const LANDUSE_FILLS = /^(landcover|landuse|park|wood|sand|wetland|aeroway)/;
const ROAD_LINES    = /^(road|tunnel|bridge)_(mot|trunk|pri|sec|minor|service|path)/;
const WATER_LAYERS  = /^(water$|water_shadow$|waterway)/;
const BUILDING_FILLS = /^building/;
const RAIL_LINES     = /rail/;

export function applyZoningGround(map, firstSymbolId) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const { id, type } = layer;
    if (/^(zoning-|catpoly-)/.test(id)) continue;   // never our own layers
    try {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", ZONING_GROUND);
      } else if (type === "fill" && BUILDING_FILLS.test(id)) {
        // Building footprints OFF entirely for v1 (optical-pass ruling).
        map.setLayoutProperty(id, "visibility", "none");
      } else if (type === "fill" && LANDUSE_FILLS.test(id)) {
        map.setPaintProperty(id, "fill-color", ZONING_GROUND);
      } else if (type === "fill" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);            // river over the fill
      } else if (type === "line" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);
      } else if (type === "line" && RAIL_LINES.test(id)) {
        // Rail: cross-tie dashes off; base drops to a low-prominence hairline.
        if (/dash/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else {
          map.setPaintProperty(id, "line-color", "#8d8574");
          map.setPaintProperty(id, "line-opacity", 0.3);
          try { map.setPaintProperty(id, "line-width", 0.8); } catch { /* width may be zoom-expr */ }
        }
      } else if (type === "line" && ROAD_LINES.test(id)) {
        // Cream street grid, promoted; arterials fade at city zoom (widths held).
        map.setPaintProperty(id, "line-color", ROAD_WHITE);
        if (/mot|trunk|pri|sec/.test(id)) {
          map.setPaintProperty(id, "line-opacity",
            ["interpolate", ["linear"], ["zoom"], 10, 0.5, 11.8, 0.95]);
        } else {
          map.setPaintProperty(id, "line-opacity", 0.9);
        }
        map.moveLayer(id, firstSymbolId);
      }
    } catch { /* layer gone / tearing down */ }
  }
}
