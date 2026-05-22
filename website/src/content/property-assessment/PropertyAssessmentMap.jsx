// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Layout mirrors
// pipeline/property-assessment/scripts/09_build_choropleth.html (09).
//
//   ┌──── .content-map (flex row, full-bleed within shell-main) ────┐
//   │ ┌─ .sb (300px) ─┐ ┌────── .canvas-wrap (flex 1) ──────────┐ │
//   │ │  Title       │ │  ≡  (toggle, overlays top-left)         │ │
//   │ │  Subtitle    │ │                                          │ │
//   │ │  ░ City      │ │   MapView (when url resolves)            │ │
//   │ │  ░ Year      │ │      OR                                   │ │
//   │ │  ░ Search    │ │   EmptyState (when url is null)          │ │
//   │ │  ░ Legend    │ │                                          │ │
//   │ │  Ref note    │ │                                          │ │
//   │ └──────────────┘ └──────────────────────────────────────────┘ │
//   └────────────────────────────────────────────────────────────────┘
//
// Data source seam: city + year drive a single URL via dataSources.js.
// Today only (Edmonton, 2026) resolves; (Calgary, *) and (*, 2025) etc
// resolve to null → EmptyState. Adding a real dataset later is one row
// in DATA_SOURCES.
// =============================================================================

import { useEffect, useMemo, useState } from "react";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import SearchInput from "../../components/SearchInput.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  STOPS,
  STATE_STYLE,
  GREY_STATES,
  choroplethLayers,
  choroplethImages,
} from "./choroplethStyle.js";
import {
  CITIES,
  YEARS,
  DEFAULT_CITY,
  DEFAULT_YEAR,
  resolveDataUrl,
  describeEmpty,
} from "./dataSources.js";
import {
  useChoroplethInteractions,
  indexNamesForSearch,
} from "./interactions.js";
import { fmtCurrency } from "../../utils/format.js";

const SIDEBAR_TRANSITION_MS = 260;

export default function PropertyAssessmentMap() {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const url = resolveDataUrl(city, year);

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  // Single effect on [url]: reset all derived state, then fetch if there's a
  // real URL. When url is null we leave gj/map null and the JSX renders
  // EmptyState instead of MapView — no fetch attempted, no errors logged.
  // setMap(null) is safe even mid-flight: MapView is keyed by url, so it
  // unmounts cleanly and map.remove() inside its useEffect cleanup destroys
  // the old MapLibre instance.
  useEffect(() => {
    setMap(null);
    setGj(null);
    setFetchError(null);
    if (!url) return undefined;

    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [url]);

  const names = useMemo(() => (gj ? indexNamesForSearch(gj) : []), [gj]);
  const flyAndPinByName = useChoroplethInteractions(map, gj);

  function toggleSidebar() {
    setCollapsed((v) => !v);
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  const empty = url ? null : describeEmpty(city, year);

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
          <OptionToggle
            label="City"
            options={CITIES}
            value={city}
            onChange={setCity}
          />
          <OptionToggle
            label="Year"
            options={YEARS}
            value={year}
            onChange={setYear}
          />
        </section>

        <section className="sb-section">
          <SearchInput
            label="Search neighbourhood"
            placeholder="Type a name…"
            hint={
              fetchError
                ? `Search unavailable: ${fetchError}`
                : !url
                  ? "Search will return when data lands."
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
        {url ? (
          // key={url} forces a clean MapView remount when the data URL
          // changes (e.g. switching cities, or future year switches that
          // hit different files). MapLibre destroys the old map in its
          // cleanup; the new instance fires onLoad and useChoroplethInteractions
          // reattaches handlers to it.
          <MapView
            key={url}
            className="canvas"
            basemapStyle={BASEMAP_STYLE}
            geojsonUrl={url}
            view={MAP_VIEW}
            sourceId="nbhd"
            promoteId="Neighbourhood ID"
            layers={choroplethLayers()}
            images={choroplethImages()}
            onLoad={setMap}
          />
        ) : (
          <EmptyState title={empty.title} body={empty.body} />
        )}
      </div>
    </article>
  );
}
