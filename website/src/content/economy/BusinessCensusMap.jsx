// =============================================================================
// BusinessCensusMap.jsx
//
// The Business Counts choropleth route ("/economy/business-counts"). STANDARDIZED to
// the Property Assessment instrument (the website standard for every neighbourhood-
// aggregate map): the immersive full-bleed canvas, the transparent .pa-float column
// (identity → metric → legend → count), the shared right rail (recentre / info /
// database), the unified SearchPeek, the About & tips popover, the data-&-attribution
// panel, and a single-select DetailPanel float.
//
// VIEW-ONLY — the leanest of the three (data shortage, "keep BC as view only"):
//   • NO year axis. ONE survey-year file (2025), so there is no year module at all —
//     the survey year rides in the metric labels ("Businesses (2025)") and the legend.
//   • Two metrics (Businesses / Employees), two states (data / no_data). No console.
//   • The "geography changed → not comparable" §6 caveat re-homes into the tips
//     popover's honesty slot (it has no .sb-ref footer any more).
//
// Data: /data/economy/business_census_2025.geojson
//   fields: neighbourhood_id, display_name, civic_ward, planning_district,
//   census_state, is_annexation_area, n_businesses_2025, n_employees_2025,
//   n_businesses_2024, n_employees_2024, yoy_businesses_change, yoy_employees_change,
//   yoy_businesses_pct, yoy_employees_pct
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import MapView, { findFirstSymbolLayerId } from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import SearchPeek from "../../components/SearchPeek.jsx";
import MapTipsPopover, { Glyph } from "../../components/MapTipsPopover.jsx";
import AttributionPanel from "../../components/AttributionPanel.jsx";
import DetailPanel from "../../components/DetailPanel.jsx";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  METRICS,
  bcensusMetricStops,
  bcensusFillColor,
  bcensusLayers,
  buildBusinessCensusPopupHtml,
  fmtSignedPct,
  LEGEND_STATES,
} from "./businessCensusStyle.js";
import { fmtNumber } from "../../utils/format.js";
import { reduceMotion } from "../../components/motion.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE, ICON_INFO, ICON_DATABASE, ICON_MOUSE, ICON_CLICK, ICON_SEARCH } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { CENTROID_SOURCE, buildCentroidPoints, centroidNameLayer, centroidFocusLayer } from "../../components/nameLabels.js";
import { applyChoroplethBasemapHarmony } from "../../components/choroplethBasemap.js";

// Single committed GeoJSON — survey year 2025, no year axis.
const DATA_URL = assetUrl("/data/economy/business_census_2025.geojson");

const SOURCE_ID = "bcensus";
const FILL_LAYER_ID = "bcensus-fill";

// This map's "How to Use" index — the lean View-only subset (no console / sliders).
const BC_TIPS = [
  { key: "scroll", glyph: <Glyph body={ICON_MOUSE} />, body: <>Scroll to Zoom</> },
  { key: "click",  glyph: <Glyph body={ICON_CLICK} />, body: <>Click to Select a Neighbourhood</> },
  { key: "search", glyph: <Glyph body={ICON_SEARCH} />, body: <>Search to Find a Neighbourhood and Fly to It</> },
];

// The §6 source caveat, re-homed into the tips popover's honesty slot (its purpose) —
// the immersive layout dropped the old .sb-ref footer that used to carry it.
const BC_SOURCE_NOTE = (
  <div className="pa-tips-honesty">
    <span className="pa-tips-honesty-h">Source note</span>
    <ul>
      <li>Edmonton Business Census, survey year 2025 (wh44-4bkz)</li>
      <li>Geography changed from the prior dashboard (StatCan, Census Tract) — figures are <b>not comparable</b></li>
    </ul>
  </div>
);

// ---- Fly-to helpers (double-click, search, recentre). promoteId = "neighbourhood_id". ----
function findFeatureById(gj, id) {
  for (const f of gj?.features ?? []) {
    if (String(f.properties?.neighbourhood_id) === String(id)) return f;
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
// Left padding = the instrument column's live width so a flown-to polygon clears the
// .pa-float overlay (mirrors PA's chromePadding; only pads while it's an absolute overlay).
function floatLeftPad(map) {
  const el = map.getContainer().closest(".content-map")?.querySelector(".pa-float");
  if (!el || getComputedStyle(el).position !== "absolute") return 0;
  return Math.round(el.getBoundingClientRect().width);
}
function flyToFeature(map, feat) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    padding: { top: 80, bottom: 80, left: floatLeftPad(map) + 60, right: 60 },
    duration: reduceMotion() ? 0 : 900, maxZoom: 14,
    pitch: 0, bearing: 0, // a focus is a data-derived FLAT fit — HOME is the only pitched view
  });
}

export default function BusinessCensusMap() {
  const [metric, setMetric] = useState(METRICS[0].key);
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Shared-chrome state (mirrors PA): tips popover, attribution panel, unified search
  // text, and the single SELECTED neighbourhood (its id — the detail float + pin derive
  // from it).
  const [infoOpen, setInfoOpen] = useState(false);
  const [attribOpen, setAttribOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  // gj read via ref so the once-installed dblclick / reset / search handlers see the data.
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);
  const firstHomeRef = useRef(true);   // first HOME landing = jumpTo (under skeleton), then ease

  // Land on the pitched HOME view (jumpTo under the skeleton on first load; ease after).
  function handleMapLoad(m) {
    setMap(m);
    applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: !firstHomeRef.current });
    firstHomeRef.current = false;
  }

  // Ramp stops from the loaded polygons' quantiles for the chosen metric (fallback until
  // gj resolves). Memoised so the Legend and repaint effect share a stable identity.
  const stops = useMemo(() => bcensusMetricStops(gj, metric), [gj, metric]);

  // The selected neighbourhood's LIVE properties — derived from selectedId + gj (not a
  // click-time snapshot), so the detail float always reflects the loaded data.
  const selectedFeature = useMemo(() => {
    if (selectedId == null || !gj) return null;
    const f = findFeatureById(gj, selectedId);
    return f ? f.properties : null;
  }, [selectedId, gj]);

  // Search datalist names — every neighbourhood, de-duped + sorted.
  const names = useMemo(() => {
    if (!gj) return [];
    const s = new Set();
    for (const f of gj.features) { const n = f.properties?.display_name; if (n) s.add(n); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [gj]);

  useEffect(() => {
    document.title = "Business Counts · Edmonton 2025";
    return () => { document.title = "Open Data Centre"; };
  }, []);

  // Fetch the GeoJSON once on mount (one file, no year axis). MapView loads the same URL
  // into the source; the fetched object is kept for the quantile stops + selection.
  useEffect(() => {
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

  // Repaint the single fill when the metric (or its stops) changes, WITHOUT remounting.
  // (One fill layer + a fill-color tween — no two-layer crossfade; BC has one metric axis.)
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(FILL_LAYER_ID, "fill-color", bcensusFillColor(metric, stops));
      }
    } catch { /* map removed; next mount repaints via onLoad */ }
  }, [map, metric, stops]);

  // Sync the PINNED feature-state to the React selection (selectedId). No MapLibre pinned
  // popup any more — the DetailPanel float is the selection UI.
  const prevPinnedRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    try {
      if (prevPinnedRef.current != null && String(prevPinnedRef.current) !== String(selectedId)) {
        map.setFeatureState({ source: SOURCE_ID, id: prevPinnedRef.current }, { pinned: false });
      }
      if (selectedId != null) {
        map.setFeatureState({ source: SOURCE_ID, id: selectedId }, { pinned: true });
      }
    } catch { /* map tearing down or feature not in source yet */ }
    prevPinnedRef.current = selectedId ?? null;
  }, [map, selectedId, gj]);

  // Hover (900ms popup) + click-to-SELECT, installed once per map.
  useEffect(() => {
    if (!map) return undefined;

    const hoverPopup = new maplibregl.Popup({
      className: "popup-hover",
      closeButton: false, closeOnClick: false,
      offset: 8, maxWidth: "220px",
    });

    map.doubleClickZoom.disable();

    let hoveredId = null;
    let hoverTimer = null;
    let lastHoveredId = null;

    function setHover(id, on) {
      map.setFeatureState({ source: SOURCE_ID, id }, { hover: on });
    }
    function clearHover() {
      clearTimeout(hoverTimer);
      lastHoveredId = null;
      if (hoveredId !== null) { setHover(hoveredId, false); hoveredId = null; }
      hoverPopup.remove();
      map.getCanvas().style.cursor = "";
    }

    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      if (hoverPopup.isOpen()) hoverPopup.setLngLat(e.lngLat);

      if (f.id !== lastHoveredId) {
        clearTimeout(hoverTimer);
        if (hoveredId !== null && hoveredId !== f.id) setHover(hoveredId, false);
        hoveredId = f.id;
        setHover(hoveredId, true);
        hoverPopup.remove();
        lastHoveredId = f.id;
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
      clearHover();
    }

    function onFillClick(e) {
      if (!e.features?.length) return;
      const f = e.features[0];
      clearHover();
      setSelectedId(f.id);   // React selection → DetailPanel + pinned sync effect
    }

    function onDblClick(e) {
      e.preventDefault();
      if (!e.features?.length) return;
      const fullFeat = findFeatureById(gjRef.current, e.features[0].id);
      if (fullFeat) flyToFeature(map, fullFeat);
    }

    function onMapClick(e) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
      if (!hits.length) setSelectedId(null);   // click empty → clear selection
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
      hoverPopup.remove();
    };
  }, [map]);

  // Basemap harmony (buildings → neutral grey so the ramp reads through; hide the basemap's
  // OWN neighbourhood labels) + lift the selection highlight pair to the TOP so a pin is never
  // occluded (PA P4). Declared BEFORE the label mount so the centroid labels still land on top.
  useEffect(() => {
    if (!map) return;
    applyChoroplethBasemapHarmony(map);
    try {
      for (const id of ["bcensus-highlight-casing", "bcensus-highlight"]) {
        if (map.getLayer(id)) map.moveLayer(id);
      }
    } catch { /* map mid-teardown */ }
  }, [map]);

  // Name labels — a CLIENT-DERIVED centroid source + the base/focus layers (shared, mirrors
  // PA). Base adjacent to the basemap symbols (one collision index); focus ABOVE everything.
  useEffect(() => {
    if (!map || !gj) return;
    const points = buildCentroidPoints(gj, "neighbourhood_id");
    try {
      const src = map.getSource(CENTROID_SOURCE);
      if (src) { src.setData(points); return; }
      map.addSource(CENTROID_SOURCE, { type: "geojson", data: points, promoteId: "neighbourhood_id" });
      map.addLayer({ ...centroidNameLayer(), source: CENTROID_SOURCE }, findFirstSymbolLayerId(map));
      map.addLayer({ ...centroidFocusLayer(), source: CENTROID_SOURCE });
    } catch { /* map mid-teardown — re-adds on next mount */ }
  }, [map, gj]);

  // Filter the BASE name layer to the DATA neighbourhoods (BC's reportable state) so no-data
  // names never clutter. The FOCUS layer stays unfiltered (hover/select names any).
  useEffect(() => {
    if (!map || !gj) return;
    try {
      if (!map.getLayer("nbhd-labels")) return;
      const withData = gj.features
        .filter((f) => f.properties.census_state === "data")
        .map((f) => String(f.properties.neighbourhood_id));
      map.setFilter("nbhd-labels", ["in", ["get", "neighbourhood_id"], ["literal", withData]]);
    } catch { /* map mid-teardown */ }
  }, [map, gj]);

  // Mirror the selection (pinned) onto the centroid source so a selected neighbourhood keeps
  // its name via the focus layer even where the base label was collision-culled.
  const prevCentroidPinRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    const prev = prevCentroidPinRef.current;
    try {
      if (prev != null && String(prev) !== String(selectedId)) map.setFeatureState({ source: CENTROID_SOURCE, id: prev }, { pinned: false });
      if (selectedId != null) map.setFeatureState({ source: CENTROID_SOURCE, id: selectedId }, { pinned: true });
      prevCentroidPinRef.current = selectedId ?? null;
    } catch { /* centroid source not added yet */ }
  }, [map, selectedId]);

  // Mirror the MAP hover onto the centroid source (its focus label shows on hover).
  useEffect(() => {
    if (!map) return undefined;
    let curId = null;
    const set = (id, on) => { try { map.setFeatureState({ source: CENTROID_SOURCE, id }, { hover: on }); } catch { /* not ready */ } };
    const onMove = (e) => { const id = e.features?.[0]?.id; if (id === curId) return; if (curId != null) set(curId, false); curId = id ?? null; if (curId != null) set(curId, true); };
    const onLeave = () => { if (curId != null) { set(curId, false); curId = null; } };
    map.on("mousemove", FILL_LAYER_ID, onMove);
    map.on("mouseleave", FILL_LAYER_ID, onLeave);
    return () => { map.off("mousemove", FILL_LAYER_ID, onMove); map.off("mouseleave", FILL_LAYER_ID, onLeave); };
  }, [map]);

  // ---- Right rail (shared chrome): recentre / info / database ----------------
  const resetRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  resetRef.current = () => {
    if (!map) return;
    if (selectedId != null) {
      const feat = findFeatureById(gjRef.current, selectedId);
      if (feat) { flyToFeature(map, feat); return; }
    }
    applyCameraPreset(map, HOME_VIEW.Edmonton, { ease: true });   // no selection → the pitched HOME
  };
  const infoToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  infoToggleRef.current = () => setInfoOpen((o) => !o);
  const attribToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  attribToggleRef.current = () => setAttribOpen((o) => !o);

  const resetLabel = selectedId != null ? "Fit to selection" : "Return to home view";
  const resetCtrlRef = useRef(null);
  useEffect(() => { resetCtrlRef.current?.setLabel(resetLabel); }, [resetLabel]);

  const infoCtrlRef = useRef(null);
  useEffect(() => { infoCtrlRef.current?.setActive(infoOpen); }, [infoOpen]);
  const attribCtrlRef = useRef(null);
  useEffect(() => { attribCtrlRef.current?.setActive(attribOpen); }, [attribOpen]);

  useEffect(() => {
    if (!map) return undefined;
    const reset = makeIconButtonControl({
      svg: railGlyph(ICON_RECENTRE),
      label: () => resetLabel,
      onClick: () => resetRef.current?.(),
    });
    const info = makeIconButtonControl({
      svg: railGlyph(ICON_INFO),
      label: "About & tips",
      onClick: () => infoToggleRef.current?.(),
    });
    const attrib = makeIconButtonControl({
      svg: railGlyph(ICON_DATABASE),
      label: "Data & attribution",
      onClick: () => attribToggleRef.current?.(),
    });
    map.addControl(reset, "top-right");
    map.addControl(info, "top-right");
    map.addControl(attrib, "bottom-right");
    resetCtrlRef.current = reset;
    infoCtrlRef.current = info;
    attribCtrlRef.current = attrib;
    info.setActive(infoOpen);
    attrib.setActive(attribOpen);
    return () => {
      resetCtrlRef.current = null;
      infoCtrlRef.current = null;
      attribCtrlRef.current = null;
      for (const c of [reset, info, attrib]) { try { map.removeControl(c); } catch { /* map already gone */ } }
    };
    // Controls mount ONCE; relabel/glow ride the effects above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Search → fly + select (mirrors PA's flyAndPinByName).
  function flyAndPinByName(name) {
    const gjNow = gjRef.current;
    if (!map || !gjNow) return;
    const feat = gjNow.features.find((f) => f.properties?.display_name === name);
    if (!feat) return;
    flyToFeature(map, feat);
    setSelectedId(feat.properties.neighbourhood_id);
  }

  return (
    <article className="content-map pa-map">
      {/* ===== FULL-BLEED MAP CANVAS (PA standard). ===== */}
      <div className="pa-canvas">
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
                  onLoad={handleMapLoad}
                  cooperativeGestures={false}
                  attributionCompact={false}
                  mapAttribution={siteConfig.mapAttributionStrip}
                />
              </MapErrorBoundary>
            </>
          )}
        </div>

        {/* ===== INSTRUMENT COLUMN (PA standard) — identity + metric → legend → count.
            No year module: Business Counts is a single survey year (2025). ===== */}
        <div className="pa-float pa-column">
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Business Counts" />
          </section>

          {gj && (
            <section className="pa-card pa-card-instrument">
              {/* METRIC — the two metrics as the shared SegmentedControl (icon chips). */}
              <div className="pa-col-mod pa-col-metric">
                <SegmentedControl
                  label="Metric"
                  options={METRICS}
                  value={metric}
                  onChange={setMetric}
                />
              </div>

              {/* LEGEND — ramp + the "Neighbourhood status" categorical block
                  (no-data + annexation). */}
              <div className="pa-col-mod pa-col-legend">
                <span className="pa-col-lab">Legend</span>
                <div className="du-legend-fade" key={metric}>
                  <Legend
                    title={selectedMetric.label}
                    stops={stops}
                    format={selectedMetric.fmt}
                    horizontal
                    greyTitle="Neighbourhood status"
                    greyStates={LEGEND_STATES}
                  />
                </div>
              </div>

              {/* FOOTER — the neighbourhood count. */}
              <div className="pa-col-mod pa-col-foot">
                <div className="pa-foot-line">
                  <span className="pa-col-count">{gj.features.length.toLocaleString()} neighbourhoods</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ===== SINGLE-SELECT DETAIL (PA standard) — the right-side float. Lean vs PA's
            InfoRail; carries the pinned-tier figures (2025 counts, 2024, YoY). ===== */}
        {selectedFeature && (() => {
          const p = selectedFeature;
          const hasData = p.census_state === "data";
          const notes = [];
          if (p.is_annexation_area) {
            notes.push("Annexation area — annexed, not yet subdivided into neighbourhoods; shown with its own outline. Any business counts it carries are real and included.");
          }
          if (!hasData) notes.push("No business census data recorded for this neighbourhood.");
          const yoy = hasData ? fmtSignedPct(p.yoy_businesses_pct) : null;
          const rows = hasData
            ? [
                { k: "Businesses (2025)", v: fmtNumber(p.n_businesses_2025) },
                { k: "Employees (2025)", v: fmtNumber(p.n_employees_2025) },
                ...(p.n_businesses_2024 != null ? [{ k: "Businesses (2024)", v: fmtNumber(p.n_businesses_2024) }] : []),
                ...(yoy != null ? [{ k: "Businesses YoY", v: yoy }] : []),
              ]
            : [];
          return (
            <DetailPanel
              name={p.display_name}
              sub={p.planning_district ?? p.civic_ward ?? null}
              notes={notes}
              rows={rows}
              onClear={() => setSelectedId(null)}
            />
          );
        })()}

        {/* UNIFIED SEARCH (PA standard) — added to BC (it had none). */}
        {gj && (
          <SearchPeek
            names={names}
            value={searchQuery}
            onValueChange={setSearchQuery}
            onSelect={(name) => { flyAndPinByName(name); setSearchQuery(name); }}
          />
        )}

        {/* ABOUT & TIPS — lean BC index; the §6 source caveat rides the honesty slot. */}
        <MapTipsPopover
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          tips={BC_TIPS}
          honesty={BC_SOURCE_NOTE}
        />

        {/* DATA & ATTRIBUTION — opened by the database control (bottom-right). */}
        <AttributionPanel open={attribOpen} onClose={() => setAttribOpen(false)} />
      </div>
    </article>
  );
}
