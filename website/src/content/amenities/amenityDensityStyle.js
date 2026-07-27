// =============================================================================
// amenityDensityStyle.js
//
// Family D — a DENSE amenity point layer (bus stops, 6,882). ONE source, THREE stages across
// zoom, all native MapLibre (no dependency — Supercluster ships inside the library):
//   • OVERVIEW → a `heatmap` layer. 6,882 constant dots read as a solid mass and destroy the
//     basemap (D2); a heatmap reads honestly as SERVICE COVERAGE at that scale.
//   • MID      → CLUSTERS (`cluster:true` on the source supplies `point_count`). A `step`
//     expression sizes the disc by count; a cream count label rides on it.
//   • STREET   → the individual stops, the shared single-symbol disc.
//
// The cluster discs + the individual stops use the SAME disc-plus-casing grammar as every other
// amenity symbol (the shared POINT_CASING #141018), so the density treatment reads as the SAME
// system, not a different map (directive A5). Radius is always zoom-interpolated.
//
// This also answers the open Business Census View-2 overview-density question: one answer
// (heatmap→cluster→point), ruled here, to be applied there.
// =============================================================================

import { POINT_CASING, SINGLE_SYMBOL_COLOUR } from "./amenityPointStyle.js";

export const D_SOURCE_ID        = "amenity-density";
export const D_HEAT_ID          = "amenity-heat";
export const D_CLUSTER_ID       = "amenity-cluster";
export const D_CLUSTER_COUNT_ID = "amenity-cluster-count";
export const D_POINT_ID         = "amenity-density-point";
export const D_SELECT_ID        = "amenity-density-select";
export const D_GLYPH_ID         = "amenity-density-glyph";

// The source clusters BELOW this zoom; at/above it the individual stops render. Chosen so the
// three stages hand off cleanly: heatmap (≤~11) → clusters (~11–13) → stops (>13).
export const D_CLUSTER_MAXZOOM = 13;
export const D_CLUSTER_RADIUS  = 46;
// CLUSTER FLOOR (directive §6): a disc labelled "2" is not a cluster — two individual stops carry
// more information. clusterMinPoints=5 makes Supercluster keep groups of <5 as INDIVIDUAL points
// (2–4-stop clusters never form). This ONLY works because the stop layer below now fades in with
// the clusters (~z11.3), not at z12.5 — otherwise those small groups would be invisible in the
// z11.3–12.5 band (worse than a "2" disc). The two changes are one fix; keep them in sync.
export const D_CLUSTER_MIN_POINTS = 7;
export const D_SOURCE_OPTIONS  = {
  cluster: true, clusterMaxZoom: D_CLUSTER_MAXZOOM, clusterRadius: D_CLUSTER_RADIUS,
  clusterMinPoints: D_CLUSTER_MIN_POINTS,
};

// A cream count label needs a fontstack the basemap actually serves (same stack the BC overlay
// uses, proven against this style).
const COUNT_FONT = ["Open Sans Bold", "Noto Sans Regular"];

// OVERVIEW — the coverage heatmap. Blue (the bus single-symbol hue) so the layer reads as the
// same system; transparent→blue→deep-blue by density. Fades OUT by ~z13 as clusters take over.
export function heatLayer() {
  return {
    id: D_HEAT_ID, type: "heatmap", source: D_SOURCE_ID, maxzoom: 13.5,
    paint: {
      "heatmap-weight": 1,
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 12, 1.1],
      "heatmap-radius":    ["interpolate", ["linear"], ["zoom"], 8, 10, 11, 18, 13, 26],
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
        0,   "rgba(0,0,0,0)",
        0.2, "rgba(91,124,255,0.35)",
        0.45,"rgba(91,124,255,0.65)",
        0.75,"#3b5bdb",
        1,   "#1e3a8a"],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 12, 0.55, 13, 0],
    },
  };
}

// MID — cluster discs: the shared disc + dark casing, sized by point_count (step), fading in as
// the heatmap fades out. Blue like the stops.
export function clusterLayer() {
  return {
    id: D_CLUSTER_ID, type: "circle", source: D_SOURCE_ID, filter: ["has", "point_count"],
    paint: {
      "circle-color": SINGLE_SYMBOL_COLOUR,
      "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22, 400, 28],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10.3, 0, 11.3, 0.95],
      "circle-stroke-color": POINT_CASING,   // the shared casing (§4)
      "circle-stroke-width": 2,
      "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 10.3, 0, 11.3, 1],
    },
  };
}

// The count label on the cluster disc (cream, like the deferred glyph ink).
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
      "text-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0, 11.3, 1],
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
export function densityPointLayer() {
  return {
    id: D_POINT_ID, type: "circle", source: D_SOURCE_ID, filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": SINGLE_SYMBOL_COLOUR,
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
