// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Layout mirrors
// pipeline/property-assessment/scripts/09_build_choropleth.html:
//
//   ┌──── .content-map (flex row, full-bleed within shell-main) ────┐
//   │ ┌─ .sb (300px) ─┐ ┌────── .canvas-wrap (flex 1) ──────────┐ │
//   │ │  Title       │ │  ≡  (toggle, overlays top-left)         │ │
//   │ │  Subtitle    │ │                                          │ │
//   │ │  ░ Search    │ │            MapView fills inset:0         │ │
//   │ │  ░ Legend    │ │                                          │ │
//   │ │  Ref note    │ │                                          │ │
//   │ └──────────────┘ └──────────────────────────────────────────┘ │
//   └────────────────────────────────────────────────────────────────┘
//
// Sidebar collapses via `.collapsed` (margin-left: -300px). After the CSS
// transition, we call map.resize() so MapLibre reflows its canvas — same
// pattern as 09's setTimeout(map.resize, 260).
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
import {
  useChoroplethInteractions,
  indexNamesForSearch,
} from "./interactions.js";
import { fmtCurrency } from "../../utils/format.js";

const SIDEBAR_TRANSITION_MS = 260;

export default function PropertyAssessmentMap() {
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

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

  function toggleSidebar() {
    setCollapsed((v) => !v);
    // Wait for the CSS transition so the new container width is settled
    // before MapLibre re-measures (otherwise the canvas letterboxes).
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  return (
    <article className="content-map">
      <aside className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <h1 className="sb-title">Edmonton — median residential assessment, 2026</h1>
        <p className="sb-sub">
          Layer 1a-cleaned (parking + R1 + R3), neighbourhood aggregates over
          365,406 properties. 402 polygons. Hover any polygon for detail;
          click to pin.
        </p>

        <section className="sb-section">
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
        </section>

        <section className="sb-section">
          <Legend
            title="Median assessed value"
            stops={STOPS}
            format={fmtCurrency}
            greyTitle="Non-aggregated polygons"
            greyStates={GREY_STATES.map((k) => STATE_STYLE[k])}
          />
        </section>

        <p className="sb-ref">
          Colour scale locked to <code>PHASE1_STATUS.md §5</code>:
          min&nbsp;$103,500 · Q25&nbsp;$352,625 · median&nbsp;$425,125 ·
          Q75&nbsp;$496,188 · max&nbsp;$1,226,000. ~10× spread, tight IQR,
          long tail.
        </p>
      </aside>

      <div className="canvas-wrap">
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title="Toggle sidebar"
        >
          ≡
        </button>
        <MapView
          className="canvas"
          basemapStyle={BASEMAP_STYLE}
          geojsonUrl={GEOJSON_URL}
          view={MAP_VIEW}
          sourceId="nbhd"
          promoteId="Neighbourhood ID"
          layers={choroplethLayers()}
          images={choroplethImages()}
          onLoad={setMap}
        />
      </div>
    </article>
  );
}
