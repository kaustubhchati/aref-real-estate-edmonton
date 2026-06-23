// =============================================================================
// PermitChoroplethMap.jsx
//
// The Dwelling Units choropleth route ("/activity/dwelling-units"). Mirrors
// property-assessment/PropertyAssessmentMap.jsx for all map chrome (shared
// MapView + custom basemap, the outline/highlight/label layer stack — pnbhd-*
// ids), the polygon states, the 900ms hover popup, click-to-pin, cursor and
// feature-state.
//
// Metric UI (part 1): three top-level metrics, each with a 2-option sub-switch
// that resolves to one GeoJSON field (DWELLING_METRICS in the style file).
//
// Part 2 polish:
//  • The metric + sub controls use PA's city-switcher gel styling (.opt-toggle-gel).
//  • Switching metric/sub is a TWO-LAYER OPACITY CROSSFADE, not a snap. Two fill
//    layers (pnbhd-fill-a / -b) sit over the same source; on a switch the new
//    colour is painted onto the HIDDEN layer, then opacity crossfades (hidden→1,
//    active→0) over 500ms via MapLibre's GPU fill-opacity-transition — no source
//    reload (all six fields already live on every feature), no JS rAF loop.
//  • The legend fades in sync (~500ms). No headline count-up in this component.
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
  FILL_OPACITY_EXPR,
  FILL_LAYER_IDS,
} from "./permitChoroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";
import { DUR_SLOW, DUR_FAST } from "../../components/motion.js";

// Crossfade timing. 500ms ease-out for the dissolve (MapLibre's built-in
// transition easing); hover stays snappy at 150ms outside a switch.
const FADE_MS = DUR_SLOW;
const HOVER_MS = DUR_FAST;

async function loadPermitManifest() {
  const res = await fetch("/data/building-permits/manifest.json");
  if (!res.ok) {
    throw new Error(`Could not load the year catalogue (HTTP ${res.status})`);
  }
  return res.json();
}

const SOURCE_ID = "pnbhd";

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
  // True while an in-place year swap's new data is genuinely slow (MapView
  // reports it via onLoading) — drives the skeleton-threshold fallback.
  const [swapLoading, setSwapLoading] = useState(false);
  const [hoveredFeature, setHoveredFeature] = useState(null);

  // Which fill layer is currently visible ("a" or "b"). Reset to "a" on every
  // map (re)mount, since choroplethLayers always builds "a" visible / "b" hidden.
  const [activeFill, setActiveFill] = useState("a");
  const activeFillRef = useRef("a");
  const fadeTimerRef = useRef(null);
  // Tracks the last-painted selection so the paint effect can tell a metric/sub
  // SWITCH (crossfade) from a stops-only refinement (gj settling — repaint live).
  const prevSelRef = useRef(`${DEFAULT_METRIC}|${DEFAULT_SUB}`);

  const metricDef =
    DWELLING_METRICS.find((m) => m.key === metricKey) ?? DWELLING_METRICS[0];
  const activeSub = resolveSub(metricKey, subKey);

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

  const url = year != null ? dataUrl(year) : null;

  // Ramp stops for the active field (sequential or diverging per activeSub.ramp).
  const stops = useMemo(
    () => metricStops(gj, activeSub),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gj, metricKey, subKey]
  );

  // Refs so the once-installed map handlers read the live selection.
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; }, [year]);
  const setHoveredFeatureRef = useRef(setHoveredFeature);
  useEffect(() => { setHoveredFeatureRef.current = setHoveredFeature; }, [setHoveredFeature]);
  const subRef = useRef(activeSub);
  useEffect(() => { subRef.current = activeSub; });
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);

  useEffect(() => {
    if (year == null) return undefined;
    document.title = `Dwelling Units · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Fetch the year's GeoJSON. A year swap keeps map + the old gj so MapView
  // dips-and-swaps the source in place (one WebGL context); gj updates when the
  // new file resolves. (No setMap/setGj reset — that forced the old remount.)
  useEffect(() => {
    if (!url) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Reset which fill layer is active whenever a fresh map mounts (year change):
  // choroplethLayers always builds "a" visible / "b" hidden.
  function handleMapLoad(m) {
    activeFillRef.current = "a";
    setActiveFill("a");
    prevSelRef.current = `${metricKey}|${subKey}`;
    setMap(m);
  }

  // Single paint effect. Two cases, told apart by whether the selection changed:
  //  • SWITCH (metric/sub changed): paint the new colour on the HIDDEN layer,
  //    then crossfade opacity over 500ms (hidden→visible, active→0), swap active.
  //    Pure paint — never setData/re-fetch (all fields already on every feature).
  //  • REFINE (same selection, stops settled after gj load): repaint the active
  //    layer in place (no fade).
  useEffect(() => {
    if (!map) return;
    const sel = `${metricKey}|${subKey}`;
    const isSwitch = sel !== prevSelRef.current;
    prevSelRef.current = sel;

    const cur = activeFillRef.current;
    const activeId = `pnbhd-fill-${cur}`;
    const newColor = choroplethFillColor(activeSub, stops);

    if (!isSwitch) {
      try {
        if (map.getLayer(activeId)) {
          map.setPaintProperty(activeId, "fill-color", newColor);
        }
      } catch { /* map mid-teardown */ }
      return;
    }

    const hidden = cur === "a" ? "b" : "a";
    const hiddenId = `pnbhd-fill-${hidden}`;
    try {
      if (!map.getLayer(hiddenId) || !map.getLayer(activeId)) return;
      // 1. New colour on the hidden layer (still at opacity 0).
      map.setPaintProperty(hiddenId, "fill-color", newColor);
      // 2. Crossfade both layers over 500ms (GPU transition; no JS animation).
      map.setPaintProperty(hiddenId, "fill-opacity-transition", { duration: FADE_MS, delay: 0 });
      map.setPaintProperty(activeId, "fill-opacity-transition", { duration: FADE_MS, delay: 0 });
      map.setPaintProperty(hiddenId, "fill-opacity", FILL_OPACITY_EXPR); // 0 → visible
      map.setPaintProperty(activeId, "fill-opacity", 0);                 // visible → 0
      // 3. Swap which layer is active.
      activeFillRef.current = hidden;
      setActiveFill(hidden);
      // 4. After the fade, restore snappy hover transition on the now-active layer.
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = setTimeout(() => {
        try {
          if (map.getLayer(hiddenId)) {
            map.setPaintProperty(hiddenId, "fill-opacity-transition", { duration: HOVER_MS, delay: 0 });
          }
        } catch { /* map gone */ }
      }, FADE_MS + 20);
    } catch { /* map mid-teardown; next mount repaints via choroplethLayers */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, metricKey, subKey, stops]);

  // Clear any pending fade-reset timer on unmount.
  useEffect(() => () => clearTimeout(fadeTimerRef.current), []);

  // Hover + click-to-pin, installed once per map. Bound to BOTH fill layers so
  // events fire whichever is on top mid-crossfade; the popup reads subRef (the
  // ACTIVE sub) so its content is never the fading-out layer's metric.
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
      const hits = map.queryRenderedFeatures(e.point, { layers: FILL_LAYER_IDS });
      if (!hits.length) clearPinned();
    }

    // Bind the per-layer handlers to BOTH fill layers (a + b).
    for (const id of FILL_LAYER_IDS) {
      map.on("mousemove", id, onMove);
      map.on("mouseleave", id, onLeave);
      map.on("click", id, onFillClick);
      map.on("dblclick", id, onDblClick);
    }
    map.on("click", onMapClick);

    return () => {
      for (const id of FILL_LAYER_IDS) {
        map.off("mousemove", id, onMove);
        map.off("mouseleave", id, onLeave);
        map.off("click", id, onFillClick);
        map.off("dblclick", id, onDblClick);
      }
      map.off("click", onMapClick);
      clearTimeout(hoverTimer);
      clearTimeout(sidebarTimer);
      hoverPopup.remove();
      pinnedPopup.remove();
    };
  }, [map]);

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
          <p className="eyebrow">Dwelling Units</p>
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

          {/* Primary metric (3) + the active metric's sub-switch (2), both in
              PA's city-switcher gel style (.opt-toggle-gel). */}
          <div className="opt-toggle-gel">
            <OptionToggle
              label="Metric"
              options={DWELLING_METRICS.map((m) => m.label)}
              value={metricDef.label}
              onChange={chooseMetric}
            />
          </div>
          <div className="opt-toggle-gel">
            <OptionToggle
              label={metricDef.label}
              options={metricDef.subs.map((s) => s.label)}
              value={activeSub.label}
              onChange={chooseSub}
            />
          </div>
        </section>

        {/* Legend fades on each metric/sub switch (keyed remount + CSS fade),
            in step with the 500ms fill crossfade; sequential↔diverging swap
            dissolves rather than snaps. */}
        <section className="sb-section">
          <div className="du-legend-fade" key={`${metricKey}-${subKey}`}>
            <Legend
              title={activeSub.legendLabel}
              stops={stops}
              format={activeSub.fmt}
            />
          </div>
        </section>

        {/* Pattern B — live hover stat panel (reflects the active metric). */}
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
            {(!gj || swapLoading) && <MapSkeleton />}
            {/* resetKey (not key) so a YEAR swap clears a caught error WITHOUT
                remounting MapView — the map persists and dips-and-swaps in place. */}
            <MapErrorBoundary resetKey={url}>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={url}
                view={MAP_VIEW}
                sourceId="pnbhd"
                promoteId="Neighbourhood ID"
                layers={choroplethLayers(stops, activeSub)}
                images={[]}
                onLoad={handleMapLoad}
                onLoading={setSwapLoading}
              />
            </MapErrorBoundary>
          </>
        )}
      </div>
    </article>
  );
}
