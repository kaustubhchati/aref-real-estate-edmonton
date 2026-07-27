// =============================================================================
// amenityDensityStyle.js
//
// Family D — a DENSE amenity point layer (bus stops, 6,673). ONE source, TWO stages across zoom,
// native MapLibre (Supercluster ships inside the library):
//   • OVERVIEW → CLUSTERS from the home camera down (`cluster:true` supplies `point_count`). A
//     `step` sizes the disc by count; a cream count label rides on it. (The old heatmap stage was
//     dropped — D1 2026-07-27: it read as empty smudges at home and carried no number.)
//   • STREET   → the individual stops (above the cluster max-zoom).
//
// Both the cluster discs AND the individual stops are coloured by regional OPERATOR (zone_id / the
// clustered zone_idx accumulators — §D2, colour expressions passed in by the page), on the SAME
// disc-plus-casing grammar as every other amenity symbol (the shared POINT_CASING #141018).
// =============================================================================

import { POINT_CASING, SINGLE_SYMBOL_COLOUR } from "./amenityPointStyle.js";

export const D_SOURCE_ID        = "amenity-density";
export const D_CLUSTER_ID       = "amenity-cluster";
export const D_CLUSTER_COUNT_ID = "amenity-cluster-count";
export const D_POINT_ID         = "amenity-density-point";
export const D_SELECT_ID        = "amenity-density-select";
export const D_GLYPH_ID         = "amenity-density-glyph";

// TWO stages (D1 2026-07-27 — the heatmap was dropped; it read as empty smudges at home and carried
// no number). Clusters render from the HOME overview down (~z10.3–13), each with its count; the
// individual stops render above z13. clusterRadius tuned so home reads as a DISTRIBUTION, not a swarm.
export const D_CLUSTER_MAXZOOM = 13;
export const D_CLUSTER_RADIUS  = 70;   // ~N discs at the z10.3 home camera (reported at build time)
// CLUSTER FLOOR: a disc labelled "2" (or 4, or 6) is not a cluster — a few individual stops carry
// more information. clusterMinPoints=7 makes Supercluster keep groups of <7 as INDIVIDUAL points
// (2–6-stop clusters never form). This ONLY works because the stop layer below now fades in with
// the clusters (~z11.3), not at z12.5 — otherwise those small groups would be invisible in the
// z11.3–12.5 band (worse than a "2" disc). The two changes are one fix; keep them in sync.
export const D_CLUSTER_MIN_POINTS = 7;
export const D_SOURCE_OPTIONS  = {
  cluster: true, clusterMaxZoom: D_CLUSTER_MAXZOOM, clusterRadius: D_CLUSTER_RADIUS,
  clusterMinPoints: D_CLUSTER_MIN_POINTS,
  // D2 — two accumulators carry the operator through aggregation (feature props don't survive
  // clustering). Zones are geographically disjoint, so a cluster is almost always homogeneous
  // (zmin == zmax); a cluster that SPANS operators has zmin != zmax and renders neutral.
  clusterProperties: {
    zmin: ["min", ["get", "zone_idx"]],
    zmax: ["max", ["get", "zone_idx"]],
  },
};

// A cream count label needs a fontstack the basemap actually serves (same stack the BC overlay
// uses, proven against this style).
const COUNT_FONT = ["Open Sans Bold", "Noto Sans Regular"];

// The cluster discs (from the home overview down): the shared disc + dark casing, sized by
// point_count (step), coloured by OPERATOR (colour expression passed in — busClusterColour; a
// cluster spanning operators renders neutral). Casing stays #141018 at every colour (§D2).
export function clusterLayer(colour = SINGLE_SYMBOL_COLOUR) {
  return {
    id: D_CLUSTER_ID, type: "circle", source: D_SOURCE_ID, filter: ["has", "point_count"],
    paint: {
      "circle-color": colour,
      "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 400, 28],
      "circle-opacity": 0.95,
      "circle-stroke-color": POINT_CASING,   // the shared casing (§4) — every colour
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 1,
    },
  };
}

// The count label on the cluster disc (cream). Visible from the home overview (no minzoom gate now).
export function clusterCountLayer() {
  return {
    id: D_CLUSTER_COUNT_ID, type: "symbol", source: D_SOURCE_ID, filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": COUNT_FONT,
      "text-size": ["step", ["get", "point_count"], 11, 100, 13, 400, 15],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#f7f1df",
      "text-opacity": 1,
    },
  };
}

// The selection ring on a pinned stop — a violet ring (§1.3 map selection). Keyed on the
// MapLibre feature id (the source promotes the layer's unique id field, e.g. stop_id); base
// filter matches nothing until the page pins one.
export function densitySelectLayer() {
  return {
    id: D_SELECT_ID, type: "circle", source: D_SOURCE_ID,
    filter: ["==", ["id"], -1],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 12.5, 6, 15, 9, 17, 12],
      "circle-color": "#8b5cf6", "circle-opacity": 0,
      "circle-stroke-color": "#8b5cf6", "circle-stroke-width": 3,
    },
  };
}

// The individual stops (unclustered features). Two populations now render here: at STREET zoom,
// every stop; at MID zoom, the small groups the cluster floor (clusterMinPoints) left unclustered.
// So the fade-in was pulled from z12.5 back to ~z11.3 to meet the clusters — a sparse fringe shows
// 2–4 real stops instead of a "2" disc or a gap (small at mid zoom, growing to the street radius).
export function densityPointLayer(colour = SINGLE_SYMBOL_COLOUR) {
  return {
    id: D_POINT_ID, type: "circle", source: D_SOURCE_ID, filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": colour,   // single hue, or a per-zone match (bus regional operators, §2)
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.5, 12.5, 3, 15, 5, 17, 7],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 11.4, 0.92],
      "circle-stroke-color": POINT_CASING,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 13, 1.2, 17, 2],
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 11.4, 1],
    },
  };
}

// The cream bus glyph on the individual STOP (never on a cluster disc — that carries a count). STREET
// zoom only (§4): where stops are big enough and few enough in view to hold a glyph; at mid zoom the
// cluster discs + count carry the read. Non-SDF PNG, allow-overlap so a stop never draws bare.
export function densityGlyphLayer() {
  return {
    id: D_GLYPH_ID, type: "symbol", source: D_SOURCE_ID, filter: ["!", ["has", "point_count"]], minzoom: 14,
    layout: {
      "icon-image": "bus",
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.32, 17, 0.55],
    },
  };
}
