// =============================================================================
// BusinessCensusMap.jsx
//
// The Business Counts choropleth route ("/economy/business-counts").
// Mirrors building-permits/PermitChoroplethMap.jsx for all map chrome:
// shared MapView + custom basemap, the same fill/outline/highlight/label layer
// stack (bcensus-* ids, no collision with assessment's nbhd-* or permit's
// pnbhd-*), the 300ms-delay hover popup, click-to-pin, cursor and feature-state.
//
// Differences from the permit choropleth: a SINGLE GeoJSON (survey year 2025,
// no year selector), a two-metric selector, and the two-state model
// ("data" / "no_data"). No search.
//
// Data: /data/economy/business_census_2025.geojson
//   fields: neighbourhood_id, display_name, civic_ward, planning_district,
//   census_state, n_businesses_2025, n_employees_2025, n_businesses_2024,
//   n_employees_2024, yoy_businesses_change, yoy_employees_change,
//   yoy_businesses_pct, yoy_employees_pct
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  METRICS,
  bcensusMetricStops,
  bcensusFillColor,
  bcensusLayers,
  buildBusinessCensusPopupHtml,
} from "./businessCensusStyle.js";

// Single committed GeoJSON — survey year 2025, no year axis.
const DATA_URL = "/data/economy/business_census_2025.geojson";

const SOURCE_ID = "bcensus";
const FILL_LAYER_ID = "bcensus-fill";

// Match the .sb collapse transition (index.css) so we resize the map only after
// the sidebar has finished its width transition.
const SIDEBAR_TRANSITION_MS = 220;

export default function BusinessCensusMap() {
  const [metric, setMetric] = useState(METRICS[0].key);
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const selectedMetric =
    METRICS.find((m) => m.key === metric) ?? METRICS[0];

  // Ramp stops computed from the loaded polygons' quantiles for the chosen
  // metric (falls back to BCENSUS_STOPS until gj resolves). Memoised so the
  // Legend and repaint effect share a stable identity.
  const stops = useMemo(
    () => bcensusMetricStops(gj, metric),
    [gj, metric]
  );

  // Hide/show the sidebar; resize the map once the width transition completes.
  function toggleSidebar() {
    setCollapsed((v) => !v);
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    document.title = "Business Counts · Edmonton 2025 | AREF";
    return () => { document.title = "AREF Open Data Centre"; };
  }, []);

  // Fetch the GeoJSON (MapView loads the same URL into the source; the fetched
  // object is kept for the quantile stops). One file, fetched once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(null);
    setGj(null);
    setFetchError(null);

    let cancelled = false;
    fetch(DATA_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Repaint the fill when the metric (or its stops) changes, WITHOUT remounting.
  useEffect(() => {
    if (!map) return;
    try {
      // getLayer on a removed map throws — ignore it, the next mount repaints
      // via onLoad.
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(
          FILL_LAYER_ID,
          "fill-color",
          bcensusFillColor(metric, stops)
        );
      }
    } catch {
      /* map removed; no-op */
    }
  }, [map, metric, stops]);

  // Hover (300ms delay + jitter fix) + click-to-pin interactions on the fill
  // layer. Installed once per map.
  useEffect(() => {
    if (!map) return undefined;

    const hoverPopup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false,
      offset: 8, maxWidth: "300px",
    });
    const pinnedPopup = new maplibregl.Popup({
      closeButton: true, closeOnClick: false,
      offset: 8, maxWidth: "320px",
    });

    let hoveredId = null;
    let pinnedId = null;
    let hoverTimer = null;
    let lastHoveredId = null;

    function setHover(id, on) {
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: on });
    }
    function setPinned(id, on) {
      map.setFeatureState({ source: SOURCE_ID, id }, { pinned: on });
    }
    function clearHover() {
      clearTimeout(hoverTimer);
      lastHoveredId = null;
      if (hoveredId !== null) { setHover(hoveredId, false); hoveredId = null; }
      hoverPopup.remove();
      map.getCanvas().style.cursor = "";
    }
    function clearPinned() {
      if (pinnedId !== null) { setPinned(pinnedId, false); pinnedId = null; }
      pinnedPopup.remove();
    }

    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];

      // Suppress hover popup when it would just duplicate the pinned popup.
      if (pinnedId !== null && pinnedId === f.id) {
        hoverPopup.remove();
        clearTimeout(hoverTimer);
        return;
      }
      // Reposition every frame so the open popup tracks the cursor without jitter.
      if (hoverPopup.isOpen()) hoverPopup.setLngLat(e.lngLat);

      // Feature changed — reset hover state + restart the dwell timer.
      if (f.id !== lastHoveredId) {
        clearTimeout(hoverTimer);
        if (hoveredId !== null && hoveredId !== f.id) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(hoveredId, true);
        hoverPopup.remove();
        lastHoveredId = f.id;
        // Show only after 300ms dwell — no flash on cursor sweep.
        hoverTimer = setTimeout(() => {
          if (hoveredId === f.id) {
            hoverPopup
              .setLngLat(e.lngLat)
              .setHTML(buildBusinessCensusPopupHtml(f.properties, false))
              .addTo(map);
          }
        }, 300);
      }
    }

    function onLeave() {
      clearHover();
    }

    function onFillClick(e) {
      if (!e.features?.length) return;
      const f = e.features[0];
      clearHover();
      clearPinned();
      pinnedId = f.id;
      setPinned(pinnedId, true);
      pinnedPopup
        .setLngLat(e.lngLat)
        .setHTML(buildBusinessCensusPopupHtml(f.properties, true))
        .addTo(map);
      pinnedPopup.once("close", () => {
        if (pinnedId !== null) { setPinned(pinnedId, false); pinnedId = null; }
      });
    }

    function onMapClick(e) {
      // Click on empty basemap (not a polygon) clears the pin.
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
      if (!hits.length) clearPinned();
    }

    map.on("mousemove", FILL_LAYER_ID, onMove);
    map.on("mouseleave", FILL_LAYER_ID, onLeave);
    map.on("click", FILL_LAYER_ID, onFillClick);
    map.on("click", onMapClick);

    return () => {
      map.off("mousemove", FILL_LAYER_ID, onMove);
      map.off("mouseleave", FILL_LAYER_ID, onLeave);
      map.off("click", FILL_LAYER_ID, onFillClick);
      map.off("click", onMapClick);
      clearTimeout(hoverTimer);
      hoverPopup.remove();
      pinnedPopup.remove();
    };
  }, [map]);

  return (
    <article className="content-map">
      <aside className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <div className="sb-header">
          <p className="eyebrow">Economy</p>
          <h1 className="sb-title">Business Counts — Edmonton 2025</h1>
          <p className="sb-sub">
            Edmonton Business Census aggregated to 407 neighbourhoods.
            364 neighbourhoods with data. Hover for detail; click to pin.
          </p>
        </div>

        <section className="sb-section">
          <div className="sb-select-field">
            <span className="sb-select-label">Metric</span>
            <select
              className="sb-select"
              aria-label="Metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="sb-section">
          <Legend
            title={selectedMetric.label}
            stops={stops}
            format={selectedMetric.fmt}
          />
        </section>

        <div className="sb-ref">
          <p>
            Source: City of Edmonton Open Data — Edmonton Business Census
            Neighbourhood Aggregation (wh44-4bkz), survey year 2025.
          </p>
          <p>
            NOTE: Source and geography changed from the prior dashboard
            (StatCan Business Register, Census Tract level). Figures are
            not comparable.
          </p>
        </div>
      </aside>

      <div className="canvas-wrap">
        {/* Sidebar collapse control — overlays the map's top-left. */}
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title="Toggle sidebar"
        >
          ≡
        </button>

        {fetchError ? (
          <EmptyState
            title="Could not load data"
            body="The business census data failed to load. Try refreshing the page."
          />
        ) : (
          <>
            {!gj && <MapSkeleton />}
            <MapErrorBoundary>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={DATA_URL}
                view={MAP_VIEW}
                sourceId={SOURCE_ID}
                promoteId="neighbourhood_id"
                layers={bcensusLayers(stops, metric)}
                images={[]}
                onLoad={setMap}
              />
            </MapErrorBoundary>
          </>
        )}
      </div>
    </article>
  );
}
