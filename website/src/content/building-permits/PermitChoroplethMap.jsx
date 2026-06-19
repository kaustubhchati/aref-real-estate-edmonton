// =============================================================================
// PermitChoroplethMap.jsx
//
// The Permit Neighbourhoods choropleth route ("/building/permit-neighbourhoods").
// Mirrors property-assessment/PropertyAssessmentMap.jsx for all map chrome:
// shared MapView + custom basemap, the same fill/outline/highlight/label layer
// stack (pnbhd-* ids, no collision with assessment's nbhd-*), the same polygon
// states, the 300ms-delay hover popup, click-to-pin, cursor and feature-state.
//
// Differences: Edmonton-only (no city toggle), no search, four permit metrics,
// per-year committed GeoJSONs (no manifest), interactions wired inline.
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<year>.geojson
//   fields: display_name, district, Neighbourhood ID, polygon_state, n_permits,
//   total_construction_value, median_construction_value, units_added_total
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
  PERMIT_CHOROPLETH_METRICS,
  permitMetricStops,
  permitChoroplethFillColor,
  permitChoroplethLayers,
  buildPermitChoroplethPopupHtml,
} from "./permitChoroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";

// Years with a committed GeoJSON (public/data/building-permits/permit-neighbourhoods/).
// Newest-first so the <select> opens on recent years; 2026 is the default.
const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
  2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009,
];
const DEFAULT_YEAR = 2026;

const SOURCE_ID = "pnbhd";
const FILL_LAYER_ID = "pnbhd-fill";

// One file per year at a stable path; year is the only thing that varies.
function dataUrl(year) {
  return `/data/building-permits/permit-neighbourhoods/permit_neighbourhoods_${year}.geojson`;
}

// ---- Fly-to helpers (double-click). promoteId is "Neighbourhood ID". --------
function findFeatureById(gj, id) {
  for (const f of gj?.features ?? []) {
    if (String(f.properties?.["Neighbourhood ID"]) === String(id)) return f;
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

export default function PermitChoroplethMap() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [metric, setMetric] = useState(PERMIT_CHOROPLETH_METRICS[0].key);
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // Live hover stat panel (Pattern B): the neighbourhood's properties while the
  // cursor is over it, null otherwise. Set from the map interaction handler.
  const [hoveredFeature, setHoveredFeature] = useState(null);

  const url = dataUrl(year);
  const selectedMetric =
    PERMIT_CHOROPLETH_METRICS.find((m) => m.key === metric) ??
    PERMIT_CHOROPLETH_METRICS[0];

  // Ramp stops computed from the loaded polygons' quantiles for the chosen
  // metric (falls back to PERMIT_STOPS until gj resolves). Memoised so the Legend
  // and repaint effect share a stable identity.
  const stops = useMemo(
    () => permitMetricStops(gj, metric),
    [gj, metric]
  );

  // The map popup handlers (installed once per map) read the year from a ref so
  // they always see the current selection without being re-registered.
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; }, [year]);

  // The interaction handler is installed once (deps:[map]); refs let it read the
  // latest setter / metric / gj without re-registering on every render.
  const setHoveredFeatureRef = useRef(setHoveredFeature);
  useEffect(() => { setHoveredFeatureRef.current = setHoveredFeature; }, [setHoveredFeature]);
  const metricRef = useRef(metric);
  useEffect(() => { metricRef.current = metric; }, [metric]);
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    document.title = `Permit Neighbourhoods · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Fetch the year's GeoJSON (MapView loads the same URL into the source; the
  // fetched object is kept for any future search/geometry use). Resets on year
  // change. setMap(null) is safe mid-flight — MapView is keyed by url, so it
  // unmounts cleanly and map.remove() destroys the old instance.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(null);
    setGj(null);
    setFetchError(null);

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

  // Repaint the fill when the metric (or its stops) changes, WITHOUT remounting.
  useEffect(() => {
    if (!map) return;
    try {
      // The map can be mid-teardown (year switch unmounts MapView); getLayer on
      // a removed map throws — ignore it, the next mount repaints via onLoad.
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(
          FILL_LAYER_ID,
          "fill-color",
          permitChoroplethFillColor(metric, stops)
        );
      }
    } catch {
      /* map removed; no-op */
    }
  }, [map, metric, stops]);

  // Hover (300ms delay + jitter fix) + click-to-pin interactions on the fill
  // layer. Installed once per map; the handlers read yearRef so they stay current
  // across year changes (and the map remounts on a year change anyway).
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
        // Tier 2 popup — show after 900ms dwell, with the selected metric.
        hoverTimer = setTimeout(() => {
          if (hoveredId === f.id) {
            hoverPopup
              .setLngLat(e.lngLat)
              .setHTML(buildPermitChoroplethPopupHtml(
                f.properties, false, yearRef.current, metricRef.current))
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
        .setHTML(buildPermitChoroplethPopupHtml(
          f.properties, true, yearRef.current, metricRef.current))
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
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year}</h1>
          <p className="sb-sub">
            Building permit aggregates by neighbourhood, {year}.
            Hover for detail; click to pin.
          </p>
        </div>

        <section className="sb-section">
          <div className="sb-select-field">
            <span className="sb-select-label">Year</span>
            <select
              className="sb-select"
              aria-label="Year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="sb-select-field">
            <span className="sb-select-label">Metric</span>
            <select
              className="sb-select"
              aria-label="Metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {PERMIT_CHOROPLETH_METRICS.map((m) => (
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

        {/* Pattern B — live hover stat panel. Updates as the cursor moves over a
            neighbourhood; the selected metric leads, then the other metrics. */}
        {!hoveredFeature ? (
          <section className="sb-section sb-hover-panel sb-hover-empty">
            <p className="sb-hover-hint">Hover a neighbourhood to see its stats</p>
          </section>
        ) : hoveredFeature.polygon_state === "aggregated" ? (
          <section className="sb-section sb-hover-panel">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <div className="sb-hover-rows">
              <div className="sb-hover-row">
                <span className="sb-hover-k">{selectedMetric.label}</span>
                <span className="sb-hover-v">{selectedMetric.fmt(hoveredFeature[metric])}</span>
              </div>
              <div className="sb-hover-row">
                <span className="sb-hover-k">N permits</span>
                <span className="sb-hover-v">{fmtNumber(hoveredFeature.n_permits)}</span>
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
            Source: City of Edmonton Open Data (24uj-dj8v).
            Building permit aggregates by neighbourhood, {year}.
          </p>
        </div>
        </div>{/* /sb-inner */}
      </aside>

      <div className="canvas-wrap">
        {fetchError ? (
          <EmptyState
            title="Could not load data"
            body={`The ${year} permit aggregates failed to load. Try refreshing or selecting a different year.`}
          />
        ) : (
          // key={url} remounts MapView on a year change: MapLibre destroys the
          // old map in cleanup, the new instance fires onLoad, and the repaint +
          // interaction effects reattach. The boundary keeps a WebGL/MapLibre
          // failure from blanking the page.
          <>
            {!gj && <MapSkeleton />}
            <MapErrorBoundary key={url}>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={url}
                view={MAP_VIEW}
                sourceId="pnbhd"
                promoteId="Neighbourhood ID"
                layers={permitChoroplethLayers(stops, metric)}
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
