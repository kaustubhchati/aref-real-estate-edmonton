// =============================================================================
// cityBounds.js
//
// Per-city camera pan bounds for MapLibre's `maxBounds`, as [[west, south],
// [east, north]] in LngLat. setMaxBounds locks the map to a city's extent so a
// user can't pan off into empty basemap. (Side effect: it also caps zoom-OUT at
// roughly city-fit — you can't zoom out past where the bounds fill the viewport.
// That is intended for a single-city map; widen the box if more zoom-out room is
// wanted.)
//
// Keyed by the city name the manifest uses, so this is the single per-city home
// for the value: the section's MAP_VIEW references CITY_BOUNDS[city] rather than
// hardcoding a box. Edmonton is the only city today; Calgary is a one-line add
// here when its pipeline lands (CLAUDE.md §10 — city wraps section, per-city
// config).
//
// Edmonton box = the 407-neighbourhood data extent (lng -113.71..-113.27,
// lat 53.34..53.72) padded ~0.06 deg (~6 km) so edge neighbourhoods can be framed.
// =============================================================================

export const CITY_BOUNDS = {
  Edmonton: [[-113.77, 53.28], [-113.21, 53.78]],
  // Calgary: [[...], [...]],  // add with the Calgary-introduction campaign
};
