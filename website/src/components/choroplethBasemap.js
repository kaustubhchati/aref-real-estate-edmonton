// =============================================================================
// choroplethBasemap.js  (shared — basemap harmony for choropleth maps)
//
// Post-load basemap tuning every neighbourhood CHOROPLETH wants (Property Assessment is
// the standard; Dwelling Units + Business Counts adopt it). Runs AFTER applyAppleClassic
// (MapView) — it adjusts what that theme sets. Extracted from PA's two effects; PA still
// runs its own copies (byte-identical), the de-dup deferred. NOT applied in MapView
// itself, because the permit POINT map shares MapView and does not want either change.
// =============================================================================

// Buildings → neutral warm grey + translucent so the choropleth ramp reads THROUGH as
// lightness (Carto's building tan, set by applyAppleClassic, clashes hue-vs-hue with the
// ramp at parcel zoom — MapLibre has no per-layer blend, so this approximates a luminosity
// blend). And hide the basemap's OWN neighbourhood labels (place_hamlet class=neighbourhood
// / place_suburbs class=suburb, which label Edmonton neighbourhoods from ~z12) so they do
// not DOUBLE our authoritative centroid labels. Colour/opacity/visibility only; guarded so
// a basemap missing these layers is a no-op.
export function applyChoroplethBasemapHarmony(map) {
  if (!map) return;
  try {
    if (map.getLayer("building")) {
      map.setPaintProperty("building", "fill-color", "#d9d6cf");   // neutral warm grey
      map.setPaintProperty("building", "fill-opacity", 0.6);       // ramp reads through
    }
    if (map.getLayer("building-top")) {
      map.setPaintProperty("building-top", "fill-color", "#e7e3db"); // lighter neutral top
    }
    for (const id of ["place_hamlet", "place_suburbs"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
  } catch {
    /* map mid-teardown — the next mounted map re-applies via the caller's effect */
  }
}
