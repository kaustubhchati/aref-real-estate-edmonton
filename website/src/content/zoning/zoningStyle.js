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
//     (never neutral grey; the SVG pins Residential #f0dfa8 → hairline #d4bf87,
//     and every family derives its tint by the same per-channel transform).
//
// The polygon law (DESIGN_SYSTEM §1.4): convention hues, emphasis by inverse
// area (Residential = palest ground), governance categories (Direct Control,
// Alternative Jurisdiction) as PATTERNS, never hues. QUALITATIVE_12 does not
// apply to area fills.
// =============================================================================

import { CITY_BOUNDS } from "../../config/cityBounds.js";
import {
  polygonFillLayer, polygonPatternLayer, patternImages,
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
export const PATTERN_ID       = "zoning-pattern";
export const SELECT_ID        = "zoning-select";
export const FAMILY_LINE_ID   = "zoning-family-lines";
export const HAIRLINE_ID      = "zoning-hairlines";

// ---- The ten family treatments (fills + patterns from the SVG <defs>) --------
export const ZONING_GROUND = "#faf7ef";      // the schematic's page ground
const SELECT_COLOUR = "#8b5cf6";             // --pa-selection-outline (§1.3)

export const FAMILY_STYLE = {
  "Residential":               { colour: "#f0dfa8" },  // palest — the carpet
  "Parks and Open Space":      { colour: "#a9c99a" },
  "Civic and Public Service":  { colour: "#7fa8cc" },
  "Direct Control":            { pattern: { kind: "hatch", base: "#cfc9bd", ink: "#7d7669" } },
  "Industrial and Employment": { colour: "#a58bbf" },
  "Commercial":                { colour: "#d9614e" },
  "Mixed Use":                 { colour: "#e8a33d" },
  "Agricultural and Rural":    { colour: "#cdd0a0" },
  "Future and Reserve":        { colour: "#e4dfd6" },
  "Alternative Jurisdiction":  { pattern: { kind: "dots", base: "#e2dcd2", ink: "#9a9287" } },
};

// Parcel-hairline tint: each family's hairline is its OWN fill darkened by the
// per-channel transform the SVG pins (#f0dfa8 → #d4bf87 ⇒ ×[0.883, 0.856, 0.804]).
// Pattern families tint from their pattern BASE. Never neutral grey.
const TINT = [0.883, 0.856, 0.804];
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
  return [...(entry.categories || [])]
    .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b))
    .map((key) => {
      const style = FAMILY_STYLE[key];
      if (!style) console.warn(`[zoning] family "${key}" has no ratified fill — rendering fallback.`);
      return { key, label: key, count: counts[key], ...(style ?? { colour: "#c9c2b2" }) };
    });
}

// ---- Layers ------------------------------------------------------------------
// Base fills + governance patterns come from the GENERIC standard; the ladder's
// line layers are zoning's own (they need the per-family tint + zoom gates).

export function zoningFillLayers(domain) {
  const pattern = polygonPatternLayer({ id: PATTERN_ID, classField: "zone_family", items: domain });
  return [
    polygonFillLayer({ id: FILL_ID, classField: "zone_family", items: domain, opacity: 1 }),
    ...(pattern ? [pattern] : []),
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
export function hairlineLayer(domain) {
  return {
    id: HAIRLINE_ID,
    type: "line",
    minzoom: 15,
    paint: {
      "line-color": tintExpression(domain),
      "line-width": 0.7,
      "line-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 15.5, 0.9],
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

export function applyZoningGround(map, firstSymbolId) {
  for (const layer of map.getStyle()?.layers ?? []) {
    const { id, type } = layer;
    if (/^(zoning-|catpoly-)/.test(id)) continue;   // never our own layers
    try {
      if (type === "background") {
        map.setPaintProperty(id, "background-color", ZONING_GROUND);
      } else if (type === "fill" && LANDUSE_FILLS.test(id)) {
        map.setPaintProperty(id, "fill-color", ZONING_GROUND);
      } else if (type === "fill" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);            // river over the fill
      } else if (type === "line" && WATER_LAYERS.test(id)) {
        map.moveLayer(id, firstSymbolId);
      } else if (type === "line" && ROAD_LINES.test(id)) {
        // The schematic's white street grid: casings + fills all white, promoted.
        map.setPaintProperty(id, "line-color", "#ffffff");
        map.setPaintProperty(id, "line-opacity", /mot|trunk|pri|sec/.test(id) ? 0.95 : 0.9);
        map.moveLayer(id, firstSymbolId);
      }
    } catch { /* layer gone / tearing down */ }
  }
}
