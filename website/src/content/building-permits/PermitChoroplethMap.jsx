// =============================================================================
// PermitChoroplethMap.jsx
//
// The Dwelling Units choropleth route ("/activity/dwelling-units"). Mirrors
// property-assessment/PropertyAssessmentMap.jsx for all map chrome (shared
// MapView + custom basemap, the same fill/outline/highlight/label layer stack —
// pnbhd-* ids, unchanged internal names), the five polygon states, the 900ms
// hover popup, click-to-pin, cursor and feature-state.
//
// Metric UI: three top-level metrics, each with a 2-option sub-switch that
// resolves to one GeoJSON field (see DWELLING_METRICS in the style file). The
// component stores {metricKey, subKey}; resolveSub() yields the active field,
// label, formatter, and ramp. Toggling re-colours the map via setPaintProperty
// (part 1 = correctness + structure; the crossfade/PA-switcher polish is part 2).
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<year>.geojson
//   fields: display_name, district, Neighbourhood ID, polygon_state, n_permits,
//   total_construction_value, median_construction_value, units_added_gross,
//   units_demolished, yoy_pct_permits
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  DWELLING_METRICS,
  DEFAULT_METRIC,
  DEFAULT_SUB,
  resolveSub,
  metricStops,
  choroplethFillColor,
  choroplethLayers,
  buildPopupHtml,
} from "./permitChoroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";

// The year list + default come from the published BP manifest (one source of
// truth, refreshed by the pipeline), NOT a hardcoded array. Flat, section-scoped
// shape { years, defaultYear } per the manifest-shape rule (CLAUDE.md §2). Loaded
// once on mount; errors surface to the gate (no hardcoded fallback — it would
// drift stale).
async function loadPermitManifest() {
  const res = await fetch("/data/building-permits/manifest.json");
  if (!res.ok) {
    throw new Error(`Could not load the year catalogue (HTTP ${res.status})`);
  }
  return res.json();
}

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
  // Year list + default come from the manifest (loaded on mount), never hardcoded.
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);

  // Metric system: primary metric + its sub-state. Default = Dwellings / Added.
  const [metricKey, setMetricKey] = useState(DEFAULT_METRIC);
  const [subKey, setSubKey] = useState(DEFAULT_SUB);

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // Live hover stat panel (Pattern B): the neighbourhood's properties while the
  // cursor is over it, null otherwise.
  const [hoveredFeature, setHoveredFeature] = useState(null);

  // Resolve the active metric definition + sub-state (the field key everything
  // paints/labels from). metricDef drives the sub-switch's options.
  const metricDef =
    DWELLING_METRICS.find((m) => m.key === metricKey) ?? DWELLING_METRICS[0];
  const activeSub = resolveSub(metricKey, subKey);

  // Primary metric change resets the sub to that metric's first option (so the
  // sub-switch never shows a sub that doesn't belong to the active metric).
  function chooseMetric(label) {
    const m = DWELLING_METRICS.find((d) => d.label === label);
    if (!m) return;
    setMetricKey(m.key);
    setSubKey(m.subs[0].key);
  }
  function chooseSub(label) {
    const s = metricDef.subs.find((x) => x.label === label);
    if (s) setSubKey(s.key);
  }

  // Load the manifest once on mount: populate the year list (newest-first) and
  // seed the default selection in the same update (no loaded-but-no-year frame).
  useEffect(() => {
    let cancelled = false;
    loadPermitManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setYears([...m.years].sort((a, b) => b - a));
        setYear(m.defaultYear);
      })
      .catch((err) => { if (!cancelled) setManifestError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // null until a year is chosen (manifest still loading) — gates the fetch below.
  const url = year != null ? dataUrl(year) : null;

  // Ramp stops for the active field (sequential or diverging per activeSub.ramp).
  // Memoised so the Legend and repaint effect share a stable identity.
  const stops = useMemo(
    () => metricStops(gj, activeSub),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gj, metricKey, subKey]
  );

  // Popup handlers (installed once per map) read year + the active sub from refs
  // so they always see the current selection without being re-registered.
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; }, [year]);
  const setHoveredFeatureRef = useRef(setHoveredFeature);
  useEffect(() => { setHoveredFeatureRef.current = setHoveredFeature; }, [setHoveredFeature]);
  const subRef = useRef(activeSub);
  useEffect(() => { subRef.current = activeSub; });
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    if (year == null) return undefined;   // manifest still loading
    document.title = `Dwelling Units · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Fetch the year's GeoJSON. Resets on year change.
  useEffect(() => {
    if (!url) return undefined;
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

  // Repaint the fill when the metric / sub / stops change, WITHOUT remounting.
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(
          FILL_LAYER_ID,
          "fill-color",
          choroplethFillColor(activeSub, stops)
        );
      }
    } catch {
      /* map removed mid-teardown; next mount repaints via onLoad */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, metricKey, subKey, stops]);

  // Hover (900ms popup dwell + 200ms sidebar) + click-to-pin interactions.
  // Installed once per map; handlers read refs so they stay current.
  useEffect(() => {
    if (!map) return undefined;

    const hoverPopup = new maplibregl.Popup({
      className: "popup-hover",
      closeButton: false, closeOnClick: false,
      offset: 8, maxWidth: "220px",
    });
    const pinnedPopup = new maplibregl.Popup({
      closeButton: true, closeOnClick: false,
      offset: 8, maxWidth: "320px",
    });

    map.doubleClickZoom.disable();

    let hoveredId = null;
    let pinnedId = null;
    let hoverTimer = null;
    let sidebarTimer = null;
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

      if (pinnedId !== null) {
        hoverPopup.remove();
        clearTimeout(hoverTimer);
        return;
      }
      if (hoverPopup.isOpen()) hoverPopup.setLngLat(e.lngLat);

      if (f.id !== lastHoveredId) {
        clearTimeout(hoverTimer);
        if (hoveredId !== null && hoveredId !== f.id) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(hoveredId, true);
        hoverPopup.remove();
        lastHoveredId = f.id;
        clearTimeout(sidebarTimer);
        sidebarTimer = setTimeout(
          () => setHoveredFeatureRef.current(f.properties), 200
        );
        hoverTimer = setTimeout(() => {
          if (hoveredId === f.id) {
            hoverPopup
              .setLngLat(e.lngLat)
              .setHTML(buildPopupHtml(
                f.properties, false, yearRef.current, subRef.current))
              .addTo(map);
          }
        }, 900);
      }
    }

    function onLeave() {
      clearTimeout(sidebarTimer);
      clearHover();
      setHoveredFeatureRef.current(null);
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
        .setHTML(buildPopupHtml(
          f.properties, true, yearRef.current, subRef.current))
        .addTo(map);
      pinnedPopup.once("close", () => {
        if (pinnedId !== null) { setPinned(pinnedId, false); pinnedId = null; }
      });
    }

    function onDblClick(e) {
      e.preventDefault();
      if (!e.features?.length) return;
      const fullFeat = findFeatureById(gjRef.current, e.features[0].id);
      if (fullFeat) flyToFeature(map, fullFeat);
    }

    function onMapClick(e) {
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

  // Gate on the manifest — no hardcoded fallback. (After all hooks so the
  // short-circuits never change hook order.)
  if (manifestError) {
    return (
      <article className="content-map">
        <div className="canvas-wrap">
          <EmptyState
            title="Could not load the year catalogue."
            body={manifestError}
          />
        </div>
      </article>
    );
  }
  if (!manifest) {
    return (
      <article className="content-map">
        <div className="canvas-wrap">
          <p className="map-loading">Loading…</p>
        </div>
      </article>
    );
  }

  return (
    <article className="content-map">
      <aside className="sb" aria-label="Map sidebar">
        <div className="sb-inner">
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year}</h1>
          <p className="sb-sub">
            Residential dwelling units by neighbourhood, {year}.
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
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Primary metric (3) + the active metric's sub-switch (2). */}
          <OptionToggle
            label="Metric"
            options={DWELLING_METRICS.map((m) => m.label)}
            value={metricDef.label}
            onChange={chooseMetric}
          />
          <OptionToggle
            label={metricDef.label}
            options={metricDef.subs.map((s) => s.label)}
            value={activeSub.label}
            onChange={chooseSub}
          />
        </section>

        <section className="sb-section">
          <Legend
            title={activeSub.legendLabel}
            stops={stops}
            format={activeSub.fmt}
          />
        </section>

        {/* Pattern B — live hover stat panel. */}
        {!hoveredFeature ? (
          <section className="sb-section sb-hover-panel sb-hover-empty">
            <p className="sb-hover-hint">Hover a neighbourhood to see its stats</p>
          </section>
        ) : hoveredFeature.polygon_state === "aggregated" ? (
          <section className="sb-section sb-hover-panel">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <div className="sb-hover-rows">
              <div className="sb-hover-row">
                <span className="sb-hover-k">{activeSub.legendLabel}</span>
                <span className="sb-hover-v">{activeSub.fmt(hoveredFeature[activeSub.field])}</span>
              </div>
              <div className="sb-hover-row">
                <span className="sb-hover-k">Residential permits</span>
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
            Residential dwelling units by neighbourhood, {year}.
          </p>
        </div>
        </div>{/* /sb-inner */}
      </aside>

      <div className="canvas-wrap">
        {fetchError ? (
          <EmptyState
            title="Could not load data"
            body={`The ${year} dwelling-unit aggregates failed to load. Try refreshing or selecting a different year.`}
          />
        ) : (
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
                layers={choroplethLayers(stops, activeSub)}
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
