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
import { fmtNumber } from "../../utils/format.js";

// Single committed GeoJSON — survey year 2025, no year axis.
const DATA_URL = "/data/economy/business_census_2025.geojson";

const SOURCE_ID = "bcensus";
const FILL_LAYER_ID = "bcensus-fill";

// ---- Fly-to helpers (double-click). promoteId is "neighbourhood_id". --------
function findFeatureById(gj, id) {
  for (const f of gj?.features ?? []) {
    if (String(f.properties?.neighbourhood_id) === String(id)) return f;
  }
  return null;
}
// [[minLng,minLat],[maxLng,maxLat]] for fitBounds — walks nested coord arrays.
function bboxOfGeom(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function walk(c) {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else for (const inner of c) walk(inner);
  }
  walk(geom.coordinates);
  return [[minX, minY], [maxX, maxY]];
}
function flyToFeature(map, feat) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    padding: { top: 80, bottom: 80, left: 60, right: 60 },
    duration: 900, maxZoom: 14,
  });
}

export default function BusinessCensusMap() {
  const [metric, setMetric] = useState(METRICS[0].key);
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // Live hover stat panel (Pattern B): the neighbourhood's properties while the
  // cursor is over it, null otherwise. Set from the map interaction handler.
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const selectedMetric =
    METRICS.find((m) => m.key === metric) ?? METRICS[0];

  // The interaction handler is installed once (deps:[map]); a ref lets it call
  // the latest setHoveredFeature without re-registering on every render.
  const setHoveredFeatureRef = useRef(setHoveredFeature);
  useEffect(() => { setHoveredFeatureRef.current = setHoveredFeature; }, [setHoveredFeature]);
  // gj read via ref so the once-installed dblclick handler sees the loaded data.
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);

  // Ramp stops computed from the loaded polygons' quantiles for the chosen
  // metric (falls back to BCENSUS_STOPS until gj resolves). Memoised so the
  // Legend and repaint effect share a stable identity.
  const stops = useMemo(
    () => bcensusMetricStops(gj, metric),
    [gj, metric]
  );

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    document.title = "Business Counts · Edmonton 2025";
    return () => { document.title = "Open Data Centre"; };
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
      className: "popup-hover",        // Tier 2 — slim styling (see index.css)
      closeButton: false, closeOnClick: false,
      offset: 8, maxWidth: "220px",
    });
    const pinnedPopup = new maplibregl.Popup({
      closeButton: true, closeOnClick: false,
      offset: 8, maxWidth: "320px",
    });

    // Fly-to is double-click only; disable the default double-click zoom so it
    // doesn't fight our handler (must be done before the default fires).
    map.doubleClickZoom.disable();

    let hoveredId = null;
    let pinnedId = null;
    let hoverTimer = null;      // Tier 2 popup dwell (900ms)
    let sidebarTimer = null;    // Tier 1 sidebar debounce (450ms)
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
      if (pinnedId !== null) {
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
        // Tier 1 sidebar panel — debounce 450ms (separate from the 900ms popup).
        clearTimeout(sidebarTimer);
        sidebarTimer = setTimeout(
          () => setHoveredFeatureRef.current(f.properties), 200
        );
        // Tier 2 popup — show after 900ms dwell.
        hoverTimer = setTimeout(() => {
          if (hoveredId === f.id) {
            hoverPopup
              .setLngLat(e.lngLat)
              .setHTML(buildBusinessCensusPopupHtml(f.properties, false))
              .addTo(map);
          }
        }, 900);
      }
    }

    function onLeave() {
      clearTimeout(sidebarTimer);
      clearHover();
      // Tier 1: clear the sidebar panel when the cursor leaves the fill.
      setHoveredFeatureRef.current(null);
    }

    // Tier 3 — single click opens the full pinned popup. Does NOT fly.
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

    // Fly-to — double click only. Does not open or close any popup.
    function onDblClick(e) {
      e.preventDefault();
      if (!e.features?.length) return;
      const fullFeat = findFeatureById(gjRef.current, e.features[0].id);
      if (fullFeat) flyToFeature(map, fullFeat);
    }

    function onMapClick(e) {
      // Click on empty basemap (not a polygon) clears the pin.
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
      if (!hits.length) clearPinned();
    }

    map.on("mousemove", FILL_LAYER_ID, onMove);
    map.on("mouseleave", FILL_LAYER_ID, onLeave);
    map.on("click", FILL_LAYER_ID, onFillClick);
    map.on("dblclick", FILL_LAYER_ID, onDblClick);
    map.on("click", onMapClick);

    return () => {
      map.off("mousemove", FILL_LAYER_ID, onMove);
      map.off("mouseleave", FILL_LAYER_ID, onLeave);
      map.off("click", FILL_LAYER_ID, onFillClick);
      map.off("dblclick", FILL_LAYER_ID, onDblClick);
      map.off("click", onMapClick);
      clearTimeout(hoverTimer);
      clearTimeout(sidebarTimer);
      hoverPopup.remove();
      pinnedPopup.remove();
    };
  }, [map]);

  return (
    <article className="content-map">
      <aside className="sb" aria-label="Map sidebar">
        {/* Fixed-width holder so content never reflows as .sb animates its width — see .sb-inner in index.css. */}
        <div className="sb-inner">
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

        {/* Pattern B — live hover stat panel. Selected metric leads, then the
            other metric, then year-over-year business change (coloured). */}
        {!hoveredFeature ? (
          <section className="sb-section sb-hover-panel sb-hover-empty">
            <p className="sb-hover-hint">Hover a neighbourhood to see its stats</p>
          </section>
        ) : hoveredFeature.census_state === "data" ? (
          <section className="sb-section sb-hover-panel">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <div className="sb-hover-rows">
              <div className="sb-hover-row">
                <span className="sb-hover-k">Businesses (2025)</span>
                <span className="sb-hover-v">{fmtNumber(hoveredFeature.n_businesses_2025)}</span>
              </div>
              <div className="sb-hover-row">
                <span className="sb-hover-k">Employees (2025)</span>
                <span className="sb-hover-v">{fmtNumber(hoveredFeature.n_employees_2025)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="sb-section sb-hover-panel sb-hover-muted">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <p className="sb-hover-district sb-hover-state">No data</p>
          </section>
        )}

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
        </div>{/* /sb-inner */}
      </aside>

      <div className="canvas-wrap">
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
