// =============================================================================
// zoningStyle.js — the ONE knob file for the Zoning zones map (permitStyle.js
// convention: every colour, zoom threshold and layer spec lives here).
//
// PALETTE SOURCE OF TRUTH: docs/design/zoning_family_fill_schematic_edmonton.svg
// — the hexes below are EXTRACTED from that SVG's source (fills + the two
// <pattern> defs), never retyped from prose (DESIGN_SYSTEM §1.4 polygon law).
// The zoom behaviour transcribes docs/design/zoning_zoom_ladder_three_states.svg:
//   overview z ≤ 11 — family masses, NO line layers;
//   district z 12–14 — block structure: white streets over the fill + the
//     dissolved FAMILY boundaries (backend emit — parcel edges would be noise);
//   parcel  z ≥ 15 — per-parcel hairlines, TINTED from each family's own fill
//     (never neutral grey; the SVG pins Residential #f0dfa8 → hairline #c0ac77,
//     and every family derives its tint by the same per-channel transform).
//
// The polygon law (DESIGN_SYSTEM §1.4): convention hues, emphasis by inverse
// area (Residential = palest ground), governance categories (Direct Control,
// Alternative Jurisdiction) as PATTERNS, never hues. QUALITATIVE_12 does not
// apply to area fills.
// =============================================================================

import { CITY_BOUNDS } from "../../config/cityBounds.js";
import {
  polygonFillLayer, polygonPatternLayer, patternImages, buildPolygonFillColour,
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
export const FILL_ID          = "zoning-fill";
export const SELECT_ID        = "zoning-select";
export const FAMILY_LINE_ID   = "zoning-family-lines";
export const HAIRLINE_ID      = "zoning-hairlines";

// ---- The ten family treatments (fills + patterns from the SVG <defs>) --------
// Off-city ground: clearly LIGHTER and lower-chroma than the palest fill
// (L98 C3 vs Residential L89 C23, ΔE 22) so the city reads as an island —
// figure-ground is a first-class concern, not cleanup (optical pass 3 §3).
export const ZONING_GROUND = "#fcfaf4";
// Streets: the reference layer, warmed toward the site cream so it sits in
// register rather than reading as pure UI white.
const ROAD_WHITE = "#fbf7ec";
const SELECT_COLOUR = "#8b5cf6";             // --pa-selection-outline (§1.3)

// Register-derived (optical pass 3, 2026-07-29): hue = zoning convention; chroma
// = the AREA TIER as a fraction of the measured site register (Apple-Classic
// C* 7–66 med 15 · Vivid10/GTA5 C* 45–90 med 78; area ceiling ≈ C*65). Ground
// tier (Ag 33% + Res 31% of area) lowest chroma; mid tier (Parks/Industrial/
// Civic) ≈ C*28–34; figure tier (Commercial/Mixed Use/Future) C*40–63.
// Direct Control is the tier exception: governance ⇒ near-zero chroma, presence
// via the hatch. `iso`/`isoPattern` = the family's FIGURE-TIER paint for
// isolate mode (§4) — a distinct paint state, not the atlas colour.
export const FAMILY_STYLE = {
  "Residential":               { colour: "#eedfb4", iso: "#d7c066" },  // L89 C23 h94 · ground
  "Parks and Open Space":      { colour: "#a3c98f", iso: "#76af5c" },  // L77 C34 h133 · mid
  "Civic and Public Service":  { colour: "#5996ca", iso: "#0083ca" },  // L60 C33 h262 · mid (darkened away from water)
  "Direct Control":            { pattern: { kind: "hatch", base: "#ccc9c2", ink: "#b1aea6", size: 12, weight: 0.6 },
                                 isoPattern: { kind: "hatch", base: "#b8b4ac", ink: "#8b877e", size: 12, weight: 0.7 } }, // governance · neutral C4
  "Industrial and Employment": { colour: "#b9a9db", iso: "#957dd4" },  // L72 C28 h304 · mid
  "Commercial":                { colour: "#d9614e", iso: "#d9614e" },  // L56 C57 h36 · figure (held)
  "Mixed Use":                 { colour: "#e8a33d", iso: "#e8a33d" },  // L72 C63 h75 · figure (held)
  "Agricultural and Rural":    { colour: "#c7cfa7", iso: "#9fb460" },  // L82 C21 h117 · ground
  "Future and Reserve":        { colour: "#48c1a6", iso: "#00ae8f" },  // L71 C40 h175 · figure (teal — new hue)
  "Alternative Jurisdiction":  { pattern: { kind: "dots", base: "#ded8ce", ink: "#a29a8b", size: 10, weight: 0.7 },
                                 isoPattern: { kind: "dots", base: "#cfc8ba", ink: "#7d766a", size: 10, weight: 0.8 } }, // governance · texture presence
};

// Texture zoom gates (optical pass §4): a pattern draws only where there are
// pixels to draw it in — flat base tone below its gate, fading in over 0.5z.
const PATTERN_GATES = { "Direct Control": 12, "Alternative Jurisdiction": 13 };
const patternLayerId = (key) => "zoning-pattern-" + key.toLowerCase().replace(/[^a-z0-9]+/g, "-");
// Static meta (id + family + gate) for the map component's isolate effect.
export const PATTERN_LAYERS = Object.entries(FAMILY_STYLE)
  .filter(([, s]) => s.pattern)
  .map(([key]) => ({ id: patternLayerId(key), key, gate: PATTERN_GATES[key] ?? 12 }));
export const patternGateOpacity = (gate) =>
  ["interpolate", ["linear"], ["zoom"], gate, 0, gate + 0.5, 1];

// Parcel-hairline tint: each family's hairline is its OWN fill darkened by a
// per-channel transform (never neutral grey). Deepened in the optical pass —
// the original SVG pin (×0.86) was imperceptible on its own fill at 0.7px; the
// ladder SVG now pins Residential #f0dfa8 → #c0ac77 (×[0.80, 0.77, 0.71]).
// Pattern families tint from their pattern BASE.
const TINT = [0.80, 0.77, 0.71];
export function hairlineTint(hex) {
  const ch = [1, 3, 5].map((i, k) =>
    Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * TINT[k]))));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---- Domain (legend + fill share it, ordered by count DESC from the manifest) ----
// A family the manifest carries but this table doesn't know (a future ratified
// crosswalk family) falls to the generic fallback and is console-warned — loud,
// never silently invisible.
export function buildZoningDomain(entry) {
  const counts = entry.categoryCounts || {};
  const shares = entry.categoryAreaShare || {};
  return [...(entry.categories || [])]
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b))
    .map((key) => {
      const style = FAMILY_STYLE[key];
      if (!style) console.warn(`[zoning] family "${key}" has no ratified fill — rendering fallback.`);
      return { key, label: key, count: counts[key], share: shares[key],
               ...(style ?? { colour: "#c9c2b2" }) };
    });
}

// ---- Isolate mode (optical pass §6) -------------------------------------------
// Clicking a legend row ISOLATES its family: it keeps its own treatment, every
// other family drops to ONE quiet neutral — a filtering read instead of a
// ten-hue decoding read. Nothing is hidden (mass stays mass); colour carries it.
export const ISOLATE_NEUTRAL = "#e7e2d4";

export function zoningFillColour(domain, isolated = null) {
  if (!isolated) return buildPolygonFillColour("zone_family", domain);
  const it = domain.find((d) => d.key === isolated);
  const keep = it ? (it.pattern ? it.pattern.base : it.colour) : "#c9c2b2";
  return ["match", ["get", "zone_family"], isolated, keep, ISOLATE_NEUTRAL];
}

export function zoningLineTint(domain, isolated = null) {
  if (!isolated) return tintExpression(domain);
  const it = domain.find((d) => d.key === isolated);
  const keep = hairlineTint(it ? (it.pattern ? it.pattern.base : it.colour) : "#c9c2b2");
  return ["match", ["get", "zone_family"], isolated, keep, hairlineTint(ISOLATE_NEUTRAL)];
}

// ---- Layers ------------------------------------------------------------------
// Base fills + governance patterns come from the GENERIC standard; the ladder's
// line layers are zoning's own (they need the per-family tint + zoom gates).

export function zoningFillLayers(domain) {
  // One zoom-gated pattern layer PER governance family (the gates differ), each
  // built by the generic standard from just that family's item.
  const patternLayers = domain
    .filter((it) => it.pattern)
    .map((it) => {
      const gate = PATTERN_GATES[it.key] ?? 12;
      const spec = polygonPatternLayer({ id: patternLayerId(it.key), classField: "zone_family", items: [it] });
      return {
        ...spec,
        minzoom: gate,
        paint: {
          ...spec.paint,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], gate, 0, gate + 0.5, 1],
        },
      };
    });
  return [
    polygonFillLayer({ id: FILL_ID, classField: "zone_family", items: domain, opacity: 1 }),
    ...patternLayers,
    // Selection outline — violet ring analogue for a polygon; filter armed on pin.
    {
      id: SELECT_ID,
      type: "line",
      filter: ["==", ["id"], -1],
      paint: { "line-color": SELECT_COLOUR, "line-width": 2.5, "line-opacity": 0.95 },
    },
  ];
}

export function zoningPatternImages(domain) {
  return patternImages(domain);
}

// One ["match", zone_family, ...tints] expression shared by both line rungs.
function tintExpression(domain) {
  const arms = [];
  for (const it of domain) arms.push(it.key, hairlineTint(it.pattern ? it.pattern.base : it.colour));
  return ["match", ["get", "zone_family"], ...arms, hairlineTint("#c9c2b2")];
}

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
// Width 1.0 / full opacity past the fade — perceptible within a family without
// reading as a data channel (optical pass §5).
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

// ---- Per-instance ground treatment ------------------------------------------
// The applyDeepenedGround precedent (businessCensusGround.js): contained to THIS
// map's instance, run in onLoad AFTER applyAppleClassic. The zoning fill IS the
// figure, so the basemap must stop asserting land use underneath it:
//   • land-use / landcover / park fills → the neutral schematic ground,
//   • background lightened to the same ground,
//   • water + streets PROMOTED above the fill (the schematic draws the river and
//     a WHITE street grid over the families; streets recolour to white),
//   • labels stay on top (MapView keeps data layers below the first symbol).
const LANDUSE_FILLS = /^(landcover|landuse|park|wood|sand|wetland)/;
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
        // Building footprints OFF entirely for v1 — they occlude the data and
        // collide in value with two families (optical-pass ruling, 2026-07-29).
        map.setLayoutProperty(id, "visibility", "none");
      } else if (type === "fill" && LANDUSE_FILLS.test(id)) {
        map.setPaintProperty(id, "fill-color", ZONING_GROUND);
      } else if (type === "fill" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);            // river over the fill
      } else if (type === "line" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);
      } else if (type === "line" && RAIL_LINES.test(id)) {
        // Rail was the heaviest mark over the fill: the white cross-tie dashes
        // vanish, the base drops to a low-prominence hairline.
        if (/dash/.test(id)) map.setLayoutProperty(id, "visibility", "none");
        else {
          map.setPaintProperty(id, "line-color", "#8d8574");
          map.setPaintProperty(id, "line-opacity", 0.3);
          try { map.setPaintProperty(id, "line-width", 0.8); } catch { /* width may be zoom-expr */ }
        }
      } else if (type === "line" && ROAD_LINES.test(id)) {
        // The schematic's street grid: cream-white, promoted over the fill.
        map.setPaintProperty(id, "line-color", ROAD_WHITE);
        if (/mot|trunk|pri|sec/.test(id)) {
          // The arterial ring was the loudest mark at city zoom: fade it down
          // at overview, full presence from district zoom. Widths untouched —
          // district and parcel weights hold exactly as they were.
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
