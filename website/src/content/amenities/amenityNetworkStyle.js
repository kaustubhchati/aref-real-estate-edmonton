// =============================================================================
// amenityNetworkStyle.js
//
// Family N — a NETWORK amenity (LRT). Two sources on one map: the ROUTE LINES (lrt_lines,
// coloured per line from the feed-joined crosswalk) and the STATION NODES (lrt_stops). This
// makes LRT read as a network — lines carry the line identity, nodes sit on them — instead of
// 54 undifferentiated dots (D3).
//
// A data limitation, stated: the station records carry NO line field (just a name like
// "Churchill Stop"), so nodes CANNOT be coloured by line from the data. The LINE colour carries
// the identity; nodes are a NEUTRAL white disc + the shared dark casing, reading on any line.
// A spatial line-assignment would be inference (new scope, D3) and is not done. The INTERCHANGE
// (Churchill — where Capital, Metro and Valley meet) gets a distinct larger symbol.
// =============================================================================

import { POINT_CASING } from "./amenityPointStyle.js";
import { GLYPH_CONFIG } from "./amenityGlyphs.js";

export const N_LINES_SRC       = "lrt-lines";
export const N_LINE_CASING_ID  = "lrt-line-casing";
export const N_LINE_ID         = "lrt-line";
export const N_STATIONS_SRC    = "lrt-stations";
export const N_NODE_ID         = "lrt-node";
export const N_INTERCHANGE_ID  = "lrt-interchange";
export const N_GLYPH_ID        = "lrt-node-glyph";
export const N_SELECT_ID       = "lrt-select";

// The station node fill = LRT's identity hue (petrol). Was a neutral white disc; a cream rail-light
// glyph needs a DARK disc to read, and this gives the stations LRT's identity colour on the map (the
// LINES still carry the per-line identity). Kept clear of the line hues (green/blue/gold).
const NODE_COLOUR = GLYPH_CONFIG.lrt_stops.identityHue;

export const INTERCHANGE_NAME  = "Churchill Stop";   // the one interchange in the network

// A white casing UNDER the coloured line — separates the line from the warm ground (a line's
// figure-ground fix, the linear counterpart of the point casing).
export function lineCasingLayer() {
  return {
    id: N_LINE_CASING_ID, type: "line", source: N_LINES_SRC,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#f7f1df",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 13, 8, 16, 12],
      "line-opacity": 0.9,
    },
  };
}
// The coloured route line (colour joined from the system-map crosswalk).
export function lineLayer() {
  return {
    id: N_LINE_ID, type: "line", source: N_LINES_SRC,
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": ["get", "colour"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 13, 4.5, 16, 7],
    },
  };
}

// Station nodes — a NEUTRAL white disc + the shared dark casing (the line under it carries the
// line identity). Radius zoom-interpolated. Excludes the interchange (drawn larger below).
export function nodeLayer() {
  return {
    id: N_NODE_ID, type: "circle", source: N_STATIONS_SRC,
    filter: ["!=", ["get", "lrt_stop_description"], INTERCHANGE_NAME],
    paint: {
      "circle-color": NODE_COLOUR,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 13, 5.5, 17, 8],
      "circle-stroke-color": POINT_CASING,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1.4, 13, 2, 17, 2.8],
    },
  };
}
// The INTERCHANGE (Churchill) — larger, with a thicker dark ring, so the single most important
// structural node (three incompatible lines meet) reads distinctly.
export function interchangeLayer() {
  return {
    id: N_INTERCHANGE_ID, type: "circle", source: N_STATIONS_SRC,
    filter: ["==", ["get", "lrt_stop_description"], INTERCHANGE_NAME],
    paint: {
      "circle-color": NODE_COLOUR,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 13, 9, 17, 13],
      "circle-stroke-color": POINT_CASING,
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 2.6, 13, 3.4, 17, 4.2],
    },
  };
}
// The cream rail-light glyph on the station node (§1 — the glyph identifies the layer). Non-SDF PNG
// (public/icons/rail-light.png), allow-overlap so a node never draws bare. From mid zoom, where the
// node is big enough to hold it (below that the petrol node + line context reads).
export function nodeGlyphLayer() {
  return {
    id: N_GLYPH_ID, type: "symbol", source: N_STATIONS_SRC, minzoom: 12,
    layout: {
      "icon-image": "rail-light",
      "icon-allow-overlap": true, "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.45, 14, 0.6, 17, 0.85],
    },
  };
}

// The selection ring on a pinned station (violet, §1.3). Keyed on the promoted feature id.
export function nodeSelectLayer() {
  return {
    id: N_SELECT_ID, type: "circle", source: N_STATIONS_SRC,
    filter: ["==", ["id"], -1],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 13, 11, 17, 15],
      "circle-color": "#8b5cf6", "circle-opacity": 0,
      "circle-stroke-color": "#8b5cf6", "circle-stroke-width": 3,
    },
  };
}

// The line legend (the three lines + their colours). Read from the loaded lines features so it
// can't drift from the map.
export function deriveLineLegend(linesGeojson) {
  const seen = new Map();
  for (const f of linesGeojson?.features || []) {
    const line = f.properties?.line, colour = f.properties?.colour;
    if (line && !seen.has(line)) seen.set(line, colour);
  }
  return [...seen.entries()].map(([line, colour]) => ({ line, colour }));
}
