// =============================================================================
// geometry.js  (shared — polygon centroid + hit-test helpers)
//
// Domain-free geometry used by box-select (a representative INTERIOR point per polygon,
// projected to screen + tested against the drag box) and fit-to-selection. Extracted
// verbatim from property-assessment/PropertyAssessmentMap.jsx so Dwelling Units (and
// later Business Counts) box-select through the SAME tested math (concave / multipart
// river-valley polygons need the point-on-surface fallback, not a naive vertex mean).
//
//   geometryCentroid — the one to call: shoelace centre if it lands inside, else the
//                      polylabel point-on-surface, else a degenerate fallback.
// =============================================================================

import polylabel from "polylabel";

// The representative INTERIOR point: area-weighted centroid if it lands inside the
// polygon, else the guaranteed-interior point-on-surface, else a last-ditch fallback.
export function geometryCentroid(geom) {
  const c = shoelaceCentroid(geom);
  if (c && pointInGeom(c, geom)) return c;
  return pointOnSurface(geom) ?? c ?? meanOfVertices(geom);
}

// Area-weighted (shoelace) centroid — the polygon's centre of mass. Each ring's
// signed-area centroid; MultiPolygon parts combined as the AREA-WEIGHTED average of
// their part centroids (not a naive mean).
function shoelaceCentroid(geom) {
  const rings = geom.type === "MultiPolygon"
    ? geom.coordinates.map((poly) => poly[0])
    : [geom.coordinates[0]];

  let areaSum = 0, cx = 0, cy = 0;
  for (const ring of rings) {
    let A = 0, sx = 0, sy = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n]; // ring is closed; the wrap edge is zero-length
      const cross = x0 * y1 - x1 * y0;
      A  += cross;
      sx += (x0 + x1) * cross;
      sy += (y0 + y1) * cross;
    }
    A *= 0.5;
    if (A === 0) continue;                // collinear / empty ring contributes nothing
    const w = Math.abs(A);                // weight each part by its area magnitude
    cx += (sx / (6 * A)) * w;
    cy += (sy / (6 * A)) * w;
    areaSum += w;
  }
  return areaSum > 0 ? [cx / areaSum, cy / areaSum] : null;
}

// Mean of every vertex — kept ONLY as the last-ditch degenerate fallback.
function meanOfVertices(geom) {
  let sx = 0, sy = 0, n = 0;
  (function walk(c) {
    if (typeof c[0] === "number") { sx += c[0]; sy += c[1]; n += 1; }
    else for (const inner of c) walk(inner);
  })(geom.coordinates);
  return n ? [sx / n, sy / n] : null;
}

// |signed area| of a ring — to pick a MultiPolygon's LARGEST part for polylabel.
function ringArea(ring) {
  let A = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    A += x0 * y1 - x1 * y0;
  }
  return Math.abs(A / 2);
}

// Guaranteed-interior point via polylabel (point of inaccessibility). polylabel takes
// ONE polygon (ring array); for a MultiPolygon we run it on the LARGEST part.
function pointOnSurface(geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const a = ringArea(poly[0]);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  if (!best) return null;
  const p = polylabel(best, 0.0005); // ~50 m precision (degrees) — ample for hit-testing
  return p ? [p[0], p[1]] : null;
}

// Ray-casting point-in-(Multi)Polygon, holes-aware — detects the rare case where the
// shoelace centroid lands outside its own polygon.
function pointInGeom(pt, geom) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) &&
          (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  const inPoly = (poly) => inRing(poly[0]) && !poly.slice(1).some(inRing);
  return geom.type === "MultiPolygon"
    ? geom.coordinates.some(inPoly)
    : inPoly(geom.coordinates);
}
