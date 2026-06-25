// =============================================================================
// cityBounds.js
//
// Per-city camera pan bounds for MapLibre's `maxBounds`, as [[west, south],
// [east, north]] in LngLat. setMaxBounds stops the camera running away to empty
// basemap (panning is free until a far edge) WITHOUT cropping the city: the box
// is a GENEROUS envelope, not a tight crop. At the city-viewing zoom the whole
// city fits with slack on BOTH axes (pan free in every direction), and you can
// still zoom out to see the city + a wide fringe.
//
// NOTE: an earlier tight box (data extent + 6 km) over-constrained this — it
// forced the zoom floor too deep (city cut off at the edges), clamped panning to
// one axis at max zoom-out (the "only up/down" bug), and sat off-centre. This
// envelope fixes all three: same root cause (box smaller than the viewport),
// same fix (make the box generous).
//
// Keyed by the city name the manifest uses, so this is the single per-city home
// for the value: the section's MAP_VIEW references CITY_BOUNDS[city] rather than
// hardcoding a box. Edmonton is the only city today; Calgary is a one-line add
// here when its pipeline lands (CLAUDE.md §10 — city wraps section, per-city
// config).
//
// Edmonton envelope = centred on the city centroid (~[-113.50, 53.54]) and
// extended ~0.9–1.0 deg (~60–110 km) past the 407-neighbourhood extent on every
// side — generous enough that the whole city + surroundings frames with slack at
// max zoom-out, tight enough to stop runaway panning across Alberta.
// =============================================================================

export const CITY_BOUNDS = {
  Edmonton: [[-114.60, 52.54], [-112.40, 54.54]],
  // Calgary: [[...], [...]],  // add with the Calgary-introduction campaign
};
