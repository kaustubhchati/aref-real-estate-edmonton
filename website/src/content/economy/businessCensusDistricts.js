// =============================================================================
// businessCensusDistricts.js — derive DISTRICT geometry from the neighbourhood
// partition, with NO geometry library and NO backend dissolve.
//
// Edmonton's 407 neighbourhoods tile the city as a clean planar partition:
// measured, EVERY interior edge appears in exactly two neighbourhood polygons with
// IDENTICAL coordinates (0 edges appear >2×). That lets us recover the 15 districts
// by EDGE CANCELLATION instead of a polygon union:
//   • an edge shared by two neighbourhoods of the SAME district is INTERNAL → drop it
//   • every other edge — the outer-city edges (appear once) and the district-vs-
//     district edges (appear twice, two different districts) — is a district
//     BOUNDARY → keep it
// The kept edges ARE the district outlines. Both functions read the same loaded
// neighbourhood GeoJSON, so the district layer can never drift out of sync with the
// neighbourhood layer (they are the same geometry, grouped).
// =============================================================================

// snap coords to 1e-7 so shared vertices match exactly (they already do — this only
// guards against float formatting drift).
const round = (v) => Math.round(v * 1e7) / 1e7;
const ptKey = (p) => `${round(p[0])},${round(p[1])}`;
const edgeKey = (a, b) => {
  const A = ptKey(a), B = ptKey(b);
  return A < B ? `${A}|${B}` : `${B}|${A}`;   // undirected
};

// Walk every ring segment of a feature's Polygon / MultiPolygon geometry.
function forEachSegment(geometry, fn) {
  const rings =
    geometry.type === "Polygon" ? geometry.coordinates
    : geometry.type === "MultiPolygon" ? geometry.coordinates.flat()
    : [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) fn(ring[i], ring[i + 1]);
  }
}

// District boundary LINES — one MultiLineString of every kept (non-internal) edge.
// Returns a FeatureCollection (single feature) ready to drop into a GeoJSON source.
export function deriveDistrictBoundaries(nbhdGj) {
  const edges = new Map();   // edgeKey -> { a, b, count, districts:Set }
  for (const f of nbhdGj.features) {
    const d = f.properties?.district ?? "(none)";
    forEachSegment(f.geometry, (a, b) => {
      const k = edgeKey(a, b);
      let e = edges.get(k);
      if (!e) { e = { a, b, count: 0, districts: new Set() }; edges.set(k, e); }
      e.count++; e.districts.add(d);
    });
  }
  const kept = [];
  for (const e of edges.values()) {
    const internal = e.count === 2 && e.districts.size === 1;   // both sides same district
    if (!internal) kept.push([e.a, e.b]);
  }
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: kept } }],
  };
}

// District LABEL points — one Point per district at the vertex-mean of its member
// neighbourhoods (≈ an area-weighted centroid: denser polygons pull it toward the
// district's bulk). Adequate for placing 15 large-area names.
export function deriveDistrictLabels(nbhdGj) {
  const acc = new Map();   // district -> { sx, sy, n }
  for (const f of nbhdGj.features) {
    const d = f.properties?.district ?? "(none)";
    if (d === "(none)") continue;
    let a = acc.get(d);
    if (!a) { a = { sx: 0, sy: 0, n: 0 }; acc.set(d, a); }
    forEachSegment(f.geometry, (p) => { a.sx += p[0]; a.sy += p[1]; a.n++; });
  }
  return {
    type: "FeatureCollection",
    features: [...acc.entries()].map(([district, a]) => ({
      type: "Feature",
      properties: { district },
      geometry: { type: "Point", coordinates: [a.sx / a.n, a.sy / a.n] },
    })),
  };
}
