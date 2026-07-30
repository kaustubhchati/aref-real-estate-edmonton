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
// family boundaries z12–14; family-tinted zone hairlines z15+) transcribes
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

export const SOURCE_ID        = "zoning-zones";
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
// Colour-concentration corrections (optical pass 7 §1–2, KC-directed): Parks
// deepened jade→emerald; Ag richer + hue-shifted greener away from Residential
// (the 63% Band-A edge: dE 21.0→33.4); Civic down from hot pink into Band B as
// deep rose; the warm-brown cluster broken (MU brighter orange · AJ near-black
// umber, semantically "outside jurisdiction" · DC holds copper); the two reds
// separated (FR maroon→plum, dE vs Commercial 65.7). Industrial HELD — KC's
// optional call declined: the ladder + polarity labels already tame it.
export const FAMILY_STYLE = {
  "Agricultural and Rural":    { colour: "#b8ea66", hover: "#ccfe79", iso: "#5e8b0c" },  // A · L87 C68 h122 · lime
  "Residential":               { colour: "#eacd59", hover: "#ffe16e", iso: "#907b03" },  // A · L83 C60 h93 · gold
  "Parks and Open Space":      { colour: "#0e9f68", hover: "#30b27a", iso: "#0b8455" },  // B · L58 C52 h158 · emerald
  "Industrial and Employment": { colour: "#b977fa", hover: "#c990fe", iso: "#a055ee" },  // B · L62 C75 h312 · violet (held)
  "Direct Control":            { colour: "#ca8748", hover: "#df9959", iso: "#b06c28" },  // B · L62 C48 h66 · copper (pass 8: min dE 34.6 vs gold/orange/umber, was 30.3 vs gold)
  "Civic and Public Service":  { colour: "#e76ca8", hover: "#fc7fbb", iso: "#cc3d85" },  // B · L62 C55 h350 · rose
  "Commercial":                { colour: "#ff2f56", hover: "#fe6571", iso: "#ff2f56" },  // C · L56 C82 h22 · crimson
  "Future and Reserve":        { colour: "#9b5394", hover: "#ae65a7", iso: "#9b5394" },  // C · L46 C46 h330 · plum
  "Alternative Jurisdiction":  { colour: "#674728", hover: "#795738", iso: "#674728" },  // C · L33 C26 h67 · umber (KC: below Band C by design)
  "Mixed Use":                 { colour: "#e56507", hover: "#fc7821", iso: "#e56507" },  // C · L58 C80 h55 · orange
};

// ---- Ground + the REFERENCE SYSTEM ---------------------------------------------
// GOVERNING PRINCIPLE (optical pass 6; also DESIGN_SYSTEM §5): this is a
// THEMATIC map — the base provides geographic context and must visibly recede;
// the zoning fill is the figure. No reference feature may compete with it.
//
// Off-city ground: outside the palette register entirely — highest lightness,
// lowest chroma on the map (L98 C3). The city reads as an island.
export const ZONING_GROUND = "#fcfaf4";

// Reference neutrals (all outside the family palette):
const ROAD_FILL     = "#ede7d7";   // warm near-neutral (L92 C7) — continuous, never white
const ROAD_CASE     = "#a19682";   // freeway/arterial casing: DARKER than the road (recession, not glow)
const RAIL_COLOUR   = "#b3a996";   // reference weight, single thin line
const LRT_COLOUR    = "#7a7264";   // LRT: darker end of the reference register — civic infrastructure
// BUILDINGS (pass 8): fill returns — outline-only was an over-correction; the
// fix was moving the fill OUT of the palette's hue space, not removing it. A
// single warm near-achromatic dark (charcoal-umber) at zoom-graded TRANSLUCENT
// opacity: the zone colour reading faintly through a building correctly says
// "this building sits in this zone". Height is a second channel (render_height
// is 100%-populated in our tiles): three tone steps, taller = darker. The
// no-greys rule governs data fills; buildings are reference (casing carve-out).
const BUILDING_TONES = ["#4a443c", "#3a342c", "#2b2620"];   // <15m · 15–40m · ≥40m
const BUILDING_OUTLINE = "rgba(28,23,18,0.55)";             // slightly darker than the fill
const BUILDING_SHADOW  = "#17130e";                          // the offset cast-shadow experiment
const LIMIT_COLOUR  = "#b3ab9c";   // the city-limit line
export const FAMILY_BOUNDARY_COLOUR = "#6f6555"; // dark warm neutral — the crisp zone edge

// THE LINE-WEIGHT LADDER (named constants; px at [z10, z13, z16]; widest→thinnest:
// freeway → arterial → family boundary → collector → local → zone → building).
// No two rungs share a weight at any zoom — equal weights read as mesh.
export const LADDER = {
  freeway:  { gate: 0,  w: { 10: 2.0,  13: 3.2,  16: 5.5 } },
  arterial: { gate: 11, w: { 10: 0,    13: 1.8,  16: 3.4 } },
  family:   { gate: 10, w: { 10: 1.0,  13: 1.5,  16: 2.2 } },
  lrt:      { gate: 12, w: { 10: 0,    13: 1.1,  16: 2.0 } },  // civic infrastructure (pass 7)
  collector:{ gate: 13, w: { 10: 0,    13: 0.7,  16: 1.8 } },
  local:    { gate: 15, w: { 10: 0,    13: 0,    16: 1.1 } },
  rail:     { gate: 13, w: { 10: 0,    13: 0.6,  16: 1.0 } },  // was 0.7@z13 = collector — equal rungs fixed
  zone:     { gate: 15, w: { 10: 0,    13: 0,    16: 0.8 } },
  // buildings: the style's 1px fill-outline — thinnest by construction, and
  // lowest-contrast by ink (BUILDING_INK alpha), below the zone rung.
};
const ladderWidth = (rung, extra = 0) => ["interpolate", ["linear"], ["zoom"],
  10, LADDER[rung].w[10] + extra,
  13, LADDER[rung].w[13] + extra,
  16, LADDER[rung].w[16] + extra];

// =============================================================================
// HIGHLIGHT REGISTER — the state × zoom matrix (optical pass 4 §3).
// With a vivid resting palette, highlight is a DIFFERENT CHANNEL, not more
// colour: fill takes a LIGHTNESS LIFT (hue + chroma held — the per-family
// `hover` hex), and a CASING outlines the zone. Ten vivid hues occupy most
// of the wheel, so casings are ACHROMATIC-EXTREME on the #141018 dot-casing
// precedent (DESIGN_SYSTEM: the no-greys rule governs data fills; casings and
// chrome are a separate register). Hover is a PREVIEW (near-white casing,
// lighter fill); selection is a COMMITMENT (near-black casing, resting fill,
// persists until cleared). Widths are zoom-interpolated: [cityZoom, zoneZoom].
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
// resting (or isolate) expression. In isolate mode a hovered zone previews
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
// Zone-hairline tint: each family's hairline is its OWN fill darkened by the
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

// FAMILY BOUNDARY (primary — the boundary answer, optical pass 6 §2): the
// backend dissolve (zoning_family_boundaries.geojson, one MULTILINESTRING per
// family — never derived client-side), drawn from z10 at ALL zooms in the dark
// warm neutral OUTSIDE the family palette. The only stroke at overview, and
// the one line that never gives way — where two Band-A families meet (the
// straw/gold edge), it alone carries the boundary.
export function familyLineLayer() {
  return {
    id: FAMILY_LINE_ID,
    type: "line",
    source: BOUNDS_SOURCE_ID,
    minzoom: 10,
    paint: {
      "line-color": FAMILY_BOUNDARY_COLOUR,
      "line-width": ladderWidth("family"),
      "line-opacity": 0.85,
    },
  };
}

// ZONE BOUNDARY (secondary, z ≥ 15 only): tinted from the fill it bounds,
// never neutral, visibly thinner than the family line — subdivision within a
// family, not a zone change. First to give way if downtown reads as noise.
export function hairlineLayer(domain) {
  return {
    id: HAIRLINE_ID,
    type: "line",
    minzoom: 15,
    paint: {
      "line-color": tintExpression(domain),
      "line-width": ladderWidth("zone"),
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.9],
    },
  };
}

// LRT — a DISTINCT reference line, z ≥ 12 (optical pass 7 §6): it structures
// Edmonton and reads as civic infrastructure. Data is the published amenities
// route-line emit (cross-section read of website/public data, no re-fetch);
// one dark reference colour, NOT the ETS route colours (that identity belongs
// to the amenity map). Sits between family boundary and collector in the ladder.
export const LRT_SOURCE_ID = "zoning-lrt";
export const LRT_LINE_ID   = "zoning-lrt-line";
export function lrtLayer() {
  return {
    id: LRT_LINE_ID,
    type: "line",
    source: LRT_SOURCE_ID,
    minzoom: 12,
    paint: {
      "line-color": LRT_COLOUR,
      "line-width": ladderWidth("lrt"),
      "line-opacity": 0.75,
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

// ---- Per-instance ground treatment (the reference system, optical pass 6) ----
// The applyDeepenedGround precedent: contained to THIS map's instance, run in
// onLoad AFTER applyAppleClassic. Roads disclose progressively by tier; rail
// and buildings are reinstated at reference weight; labels take polarity;
// land-use/landcover/park/AERODROME fills mute to the off-city ground,
// buildings stay OFF, rail stays a low-prominence hairline, water + cream
// streets promote over the fill (arterials fade at city zoom; widths held).
const LANDUSE_FILLS = /^(landcover|landuse|park|wood|sand|wetland|aeroway)/;
const WATER_LAYERS  = /^(water$|water_shadow$|waterway)/;
const BUILDING_FILLS = /^building/;
const RAIL_LINES     = /rail/;
// Four road tiers with PROGRESSIVE DISCLOSURE (locals never render at district
// zoom). The tile schema exposes exactly four line classes (mot|trunk ·
// pri|sec · minor · service|path) — they map 1:1 onto the tiers. Casing only
// on freeway/arterial, darker than the road (recession, never glow).
const ROAD_TIERS = [
  { rung: "freeway",   re: /^(road|tunnel|bridge)_(mot|trunk)_/, cased: true  },
  { rung: "arterial",  re: /^(road|tunnel|bridge)_(pri|sec)_/,   cased: true  },
  { rung: "collector", re: /^(road|tunnel|bridge)_minor_/,       cased: false },
  { rung: "local",     re: /^(road|tunnel|bridge)_service/,      cased: false },
];
// The dashed high-zoom lines were the *_path layers ([2,2] dash from z15) —
// footpaths/alleys competing with zone boundaries and buildings. Removed on
// this instance (pass 8 §4); `service` remains the local tier.
const PATH_LINES = /^(road|tunnel|bridge)_path/;
// Labels get POLARITY, not blending: dark warm text on a light halo, per class
// (halo ≤ ¼ font size; a light blur so the halo reads as soft ground).
const LABEL_INK  = "#2a2621";
const LABEL_HALO = "#faf6ec";
const HALO_BY_CLASS = [
  [/^place_/, 2.4, 0.8],               // neighbourhood/place caps (~12–16px)
  [/^roadname|^housenumber/, 1.4, 0.6],
  [/^water/, 2.0, 0.7],
];

export function applyZoningGround(map, firstSymbolId) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const { id, type } = layer;
    if (/^(zoning-|catpoly-)/.test(id)) continue;   // never our own layers
    try {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", ZONING_GROUND);
      } else if (type === "symbol") {
        // Polarity for every label class; layout (tracked caps etc.) untouched.
        map.setPaintProperty(id, "text-color", LABEL_INK);
        map.setPaintProperty(id, "text-halo-color", LABEL_HALO);
        const [, w, blur] = HALO_BY_CLASS.find(([re]) => re.test(id)) ?? [null, 1.6, 0.6];
        map.setPaintProperty(id, "text-halo-width", w);
        map.setPaintProperty(id, "text-halo-blur", blur);
        // Label classes by zoom (§6): neighbourhood names z≥11; PARK NAMES z≥13
        // (poi_park is re-shown — Apple Classic hides all POI; parks earn their
        // name on a zoning map); street names z≥15; water names throughout.
        // Declutter (pass 8): house numbers to z18 (dominant noise, zero zoning
        // value); street-name repeats spaced out (76 Avenue NW printed 4× in
        // one frame — symbol-spacing 250 → 420).
        if (/^place_(suburbs|hamlet|villages)/.test(id)) map.setLayerZoomRange(id, 11, 24);
        else if (id === "poi_park") {
          map.setLayoutProperty(id, "visibility", "visible");
          map.setLayerZoomRange(id, 13, 24);
        } else if (id === "housenumber") map.setLayerZoomRange(id, 18, 24);
        else if (/^roadname/.test(id)) {
          map.setLayerZoomRange(id, 15, 24);
          map.setLayoutProperty(id, "symbol-spacing", 420);
        }
      } else if (type === "fill" && BUILDING_FILLS.test(id)) {
        if (id === "building") {
          // Buildings with FILL again, z≥14 (pass 8): warm charcoal-umber,
          // height-stepped (taller darker), zoom-graded translucency — texture
          // at the bottom of the ramp, objects at the top. Minzoom 14 is the
          // typology mechanism: large footprints survive, small ones go
          // sub-pixel and vanish on their own (no size filter).
          map.setLayoutProperty(id, "visibility", "visible");
          map.setLayerZoomRange(id, 14, 24);
          map.setPaintProperty(id, "fill-color",
            ["step", ["coalesce", ["get", "render_height"], 0],
              BUILDING_TONES[0], 15, BUILDING_TONES[1], 40, BUILDING_TONES[2]]);
          map.setPaintProperty(id, "fill-opacity",
            ["interpolate", ["linear"], ["zoom"], 14, 0.10, 15, 0.16, 16, 0.26, 17, 0.36]);
          map.setPaintProperty(id, "fill-outline-color", BUILDING_OUTLINE);
          // Cast-shadow experiment: a duplicate fill 1.5px SE in a darker tone,
          // beneath the main fill — physical presence without 3D/blend/glow.
          if (!map.getLayer("zoning-building-shadow")) {
            map.addLayer({
              id: "zoning-building-shadow",
              type: "fill",
              source: layer.source,
              "source-layer": layer["source-layer"],
              minzoom: 15,
              paint: {
                "fill-color": BUILDING_SHADOW,
                "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0.06, 17, 0.16],
                "fill-translate": [1.5, 1.5],
                "fill-translate-anchor": "viewport",
              },
            }, id);
          }
        } else {
          map.setLayoutProperty(id, "visibility", "none");   // building-top stays off
        }
      } else if (type === "fill" && LANDUSE_FILLS.test(id)) {
        map.setPaintProperty(id, "fill-color", ZONING_GROUND);
      } else if ((type === "fill" || type === "line") && WATER_LAYERS.test(id)) {
        // Water goes DEEPER (optical pass 7 §1): it is basemap, not zoning, so
        // it carries no area-effect budget — a proper river blue. Still the
        // map's only blue; the valley system is Edmonton's signature form.
        map.setPaintProperty(id, type === "fill" ? "fill-color" : "line-color",
          id === "water_shadow" ? "#157fad" : "#318fbd");
        map.moveLayer(id, firstSymbolId);            // the river over the fill
      } else if (type === "line" && RAIL_LINES.test(id)) {
        if (/dash/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else {
          // Rail reinstated at reference weight: one thin neutral line z≥13,
          // no tie marks, below the family boundary in the ladder.
          map.setLayoutProperty(id, "visibility", "visible");
          map.setLayerZoomRange(id, LADDER.rail.gate, 24);
          map.setPaintProperty(id, "line-color", RAIL_COLOUR);
          map.setPaintProperty(id, "line-opacity", 0.7);
          map.setPaintProperty(id, "line-width", ladderWidth("rail"));
        }
      } else if (type === "line" && PATH_LINES.test(id)) {
        map.setLayoutProperty(id, "visibility", "none");   // dashed footpaths off
      } else if (type === "line") {
        const tier = ROAD_TIERS.find((t) => t.re.test(id));
        if (tier) {
          const isCase = /_case/.test(id);
          if (isCase && !tier.cased) {
            map.setLayoutProperty(id, "visibility", "none");
          } else {
            map.setLayerZoomRange(id, LADDER[tier.rung].gate, 24);
            map.setPaintProperty(id, "line-color", isCase ? ROAD_CASE : ROAD_FILL);
            // (casing width = fill width + 1.2, baked into the interpolate stops
            // — arithmetic AROUND a zoom interpolate is illegal in MapLibre)
            map.setPaintProperty(id, "line-width", ladderWidth(tier.rung, isCase ? 1.2 : 0));
            map.setPaintProperty(id, "line-opacity", isCase ? 0.6 : 0.95);
            map.moveLayer(id, firstSymbolId);
          }
        }
      }
    } catch { /* layer gone / tearing down */ }
  }
}
