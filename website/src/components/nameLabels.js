// =============================================================================
// nameLabels.js  (shared — client-derived neighbourhood name-label system)
//
// The neighbourhood NAME labels every aggregate map shows (Property Assessment is the
// standard; Dwelling Units + Business Counts adopt it). Extracted from PA's
// choroplethStyle (the two layers) + PropertyAssessmentMap (buildCentroidPoints). PA
// still uses its own copies (byte-identical); the de-dup is a deferred follow-up.
//
// WHY a client-derived CENTROID point source (not a symbol layer on the polygons): a
// polygon symbol layer places the name at MapLibre's own centroid, which lands OUTSIDE
// concave / river-valley polygons; this places each name at the guaranteed-INTERIOR
// point (the same geometryCentroid box-select uses). Two layers on the source:
//   • base (nbhd-labels)        — zoom-graduated size + area-priority collision, so the
//                                 overview breathes and the major neighbourhoods win.
//   • focus (nbhd-labels-focus) — the hover/selected GUARANTEE: allow-overlap, so the
//                                 pointed-at neighbourhood ALWAYS names itself.
// Mounting (adjacent to the basemap symbols so they share ONE collision index), the
// per-section reportable FILTER, and the feature-state mirroring live in each section's
// component — the data predicate differs per section (PA/DU: polygon_state==aggregated;
// BC: census_state==data), so it is not baked in here.
// =============================================================================

import { geometryCentroid, ringArea } from "./geometry.js";

export const CENTROID_SOURCE = "nbhd-centroids";

// One interior Point per neighbourhood, carrying display_name + area + a zoom-density
// TIER (by area rank). `idKey` is the section's promoteId field ("Neighbourhood ID" for
// PA/DU, "neighbourhood_id" for BC) so the centroid source's feature ids match the
// polygon source's — the focus layer reads feature-state by that id. Returns a GeoJSON
// FeatureCollection ready for map.addSource.
export function buildCentroidPoints(gj, idKey = "Neighbourhood ID") {
  const pts = [];
  for (const f of gj.features) {
    const c = geometryCentroid(f.geometry);
    if (!c) continue;
    const g = f.geometry;
    const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    const area = polys.reduce((max, poly) => Math.max(max, ringArea(poly[0])), 0);
    pts.push({ c, area, id: f.properties[idKey], name: f.properties.display_name });
  }
  // Zoom-density TIER by area rank so the overview breathes: the largest neighbourhoods
  // (tier 1) label from the wide view, mid ones (tier 2) ~z11–12.5, the rest (tier 3) only
  // at neighbourhood zoom. The base layer's text-size step reads this tier.
  const byArea = [...pts].sort((a, b) => b.area - a.area);
  const n = byArea.length;
  const t1 = Math.round(n * 0.08);  // top ~8% = major
  const t2 = Math.round(n * 0.33);  // next ~25% = mid
  byArea.forEach((p, i) => { p.tier = i < t1 ? 1 : i < t2 ? 2 : 3; });
  return {
    type: "FeatureCollection",
    features: pts.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.c },
      properties: { [idKey]: p.id, display_name: p.name, area: p.area, tier: p.tier },
    })),
  };
}

// The BASE name-label layer. Zoom-graduated size + area-priority collision. Cream halo
// reads over the reddest fill. Yields to the focus layer where hover/pinned.
export function centroidNameLayer() {
  return {
    id: "nbhd-labels",
    type: "symbol",
    minzoom: 9,
    layout: {
      "text-field": ["get", "display_name"],
      // symbol-sort-key gives LOWER keys priority, so negate the (year-invariant) area →
      // largest area = lowest key = wins the collision.
      "symbol-sort-key": ["-", 0, ["get", "area"]],
      // Zoom-density tiers via a step on ZOOM; each step output is a per-feature `tier`
      // case, and text-size 0 hides a tier (0 size = no collision box). tier 1 (major)
      // from the overview, tier 2 (mid) from ~z11, tier 3 (all) from ~z12.5.
      "text-size": [
        "step", ["zoom"],
        ["case", ["==", ["get", "tier"], 1], 11, 0],       // < z11: major only
        11,   ["case", ["<=", ["get", "tier"], 2], 12, 0], // z11–12.5: major + mid
        12.5, 13,                                          // ≥ z12.5: ALL — collision packs
      ],
      "text-font": ["Noto Sans Regular"],
      "text-max-width": 8,
      // allow-overlap:false so this layer joins the basemap's ONE collision index (mounted
      // adjacent to the basemap symbols) — our names + the basemap labels never overprint.
      "text-allow-overlap": false,
      "text-variable-anchor": ["center", "top", "bottom", "left", "right"],
      "text-radial-offset": 0.6,
      "text-justify": "auto",
    },
    paint: {
      "text-color": "#2a2621",        // --label-ink (dark warm grey) — DESIGN_SYSTEM §5
      "text-halo-color": "#f7f1df",   // --map-cream — the halo IS the label's background
      "text-halo-width": 1.5,
      "text-halo-blur": 0.4,
      // Yield to the focus layer when hovered/selected (else the two draw the name offset).
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "pinned"], false], 0,
        ["boolean", ["feature-state", "hover"], false], 0,
        1,
      ],
    },
  };
}

// The hover/selected GUARANTEE. A second layer on the SAME source with allow-overlap, so
// the pointed-at / selected neighbourhood is NEVER collision-culled. Invisible (opacity 0)
// until its centroid carries the hover / pinned feature-state (mirrored by the component).
export function centroidFocusLayer() {
  return {
    id: "nbhd-labels-focus",
    type: "symbol",
    layout: {
      "text-field": ["get", "display_name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 12, 15, 17],
      "text-font": ["Noto Sans Regular"],
      "text-max-width": 8,
      "text-allow-overlap": true,      // never dropped — the guarantee
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#2a2621",
      "text-halo-color": "#f7f1df",
      "text-halo-width": 2.2,          // stronger so the focus label reads over the base
      "text-halo-blur": 0.3,
      "text-opacity": [
        "case",
        ["boolean", ["feature-state", "pinned"], false], 1,
        ["boolean", ["feature-state", "hover"], false], 1,
        0,
      ],
    },
  };
}
