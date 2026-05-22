// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Composes the shared <MapView /> with the
// section's locked style tables from choroplethStyle.js, plus a <Legend />
// driven by the SAME tables.
//
// This file is intentionally short — all the visual decisions (stops, state
// colours, layer order) live in choroplethStyle.js, all the map plumbing
// lives in MapView.jsx. If you're reading this and wondering where a colour
// comes from, follow the import.
//
// RENDER ONLY for now: no hover, no pin, no search. Those will return in a
// later step (CLAUDE.md §8 step 5).
// =============================================================================

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import {
  BASEMAP_STYLE,
  GEOJSON_URL,
  MAP_VIEW,
  STOPS,
  STATE_STYLE,
  GREY_STATES,
  fmtCurrency,
  choroplethLayers,
  choroplethImages,
} from "./choroplethStyle.js";

export default function PropertyAssessmentMap() {
  return (
    <article className="content-map">
      <header className="content-map-head">
        <h1>Edmonton — median residential assessment, 2026</h1>
        <p className="content-map-sub">
          Layer 1a-cleaned (parking + R1 + R3), neighbourhood aggregates over
          365,406 properties. 402 polygons.
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
        />
        <Legend
          title="Median assessed value"
          stops={STOPS}
          format={fmtCurrency}
          greyTitle="Non-aggregated polygons"
          greyStates={GREY_STATES.map((k) => STATE_STYLE[k])}
        />
      </div>
    </article>
  );
}
