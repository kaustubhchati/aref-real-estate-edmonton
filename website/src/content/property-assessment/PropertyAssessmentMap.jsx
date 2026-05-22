// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Three pieces:
//   1. <MapView /> — section-agnostic MapLibre canvas (components/MapView.jsx)
//   2. <SearchInput /> — name-driven fly-to (components/SearchInput.jsx)
//   3. <Legend /> — data-driven from the same tables the map paints from
//
// Wiring:
//   • We fetch the GeoJSON ourselves once so we can index it for search and
//     pull geometry for fitBounds. MapView still loads it via URL into its
//     own source — modern browsers serve the second fetch from cache, so the
//     duplicate is cheap and lets MapView stay narrow.
//   • MapView calls onLoad(map) once layers are installed; we drop the map
//     instance into state. When BOTH map and gj are ready, the
//     useChoroplethInteractions hook attaches handlers (and cleans them up
//     on unmount or re-load).
// =============================================================================

import { useEffect, useMemo, useState } from "react";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import SearchInput from "../../components/SearchInput.jsx";
import {
  BASEMAP_STYLE,
  GEOJSON_URL,
  MAP_VIEW,
  STOPS,
  STATE_STYLE,
  GREY_STATES,
  choroplethLayers,
  choroplethImages,
} from "./choroplethStyle.js";
import { fmtCurrency } from "../../utils/format.js";
import {
  useChoroplethInteractions,
  indexNamesForSearch,
} from "./interactions.js";

export default function PropertyAssessmentMap() {
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Fetch the GeoJSON once for our own indexing. Cancellation guard avoids a
  // late setState if the user navigates away mid-fetch.
  useEffect(() => {
    let cancelled = false;
    fetch(GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const names = useMemo(() => (gj ? indexNamesForSearch(gj) : []), [gj]);
  const flyAndPinByName = useChoroplethInteractions(map, gj);

  return (
    <article className="content-map">
      <header className="content-map-head">
        <h1>Edmonton — median residential assessment, 2026</h1>
        <p className="content-map-sub">
          Layer 1a-cleaned (parking + R1 + R3), neighbourhood aggregates over
          365,406 properties. 402 polygons. Hover any polygon for detail; click to pin.
        </p>
      </header>

      <div className="content-map-row">
        <MapView
          className="content-map-canvas"
          basemapStyle={BASEMAP_STYLE}
          geojsonUrl={GEOJSON_URL}
          view={MAP_VIEW}
          sourceId="nbhd"
          promoteId="Neighbourhood ID"
          layers={choroplethLayers()}
          images={choroplethImages()}
          onLoad={setMap}
        />

        <div className="content-map-side">
          <SearchInput
            label="Search neighbourhood"
            placeholder="Type a name…"
            hint={
              fetchError
                ? `Search unavailable: ${fetchError}`
                : gj
                  ? "Press Enter to fly to it."
                  : "Loading…"
            }
            names={names}
            onSelect={flyAndPinByName}
          />
          <Legend
            title="Median assessed value"
            stops={STOPS}
            format={fmtCurrency}
            greyTitle="Non-aggregated polygons"
            greyStates={GREY_STATES.map((k) => STATE_STYLE[k])}
          />
        </div>
      </div>
    </article>
  );
}
