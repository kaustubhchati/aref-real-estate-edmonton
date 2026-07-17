// =============================================================================
// PermitChoroplethMap.jsx
//
// The Dwelling Units map ("/activity/dwelling-units") — the PA instrument, now with the
// full analyst DATA CONSOLE (Analysis mode). Combined-file model (geometry once, every
// year's values as <field>_<year>; year + metric are paint swaps). View = the immersive
// column + single-select DetailPanel; Analysis (Press T / box-select ≥2) raises the
// PermitDataConsole (the @tanstack table + KPI rail + distribution + year/range sliders +
// trend + export), all composed from the shared console leaves.
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_all_years.geojson
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
import MapTipsPopover from "../../components/MapTipsPopover.jsx";
import AttributionPanel from "../../components/AttributionPanel.jsx";
import DetailPanel from "../../components/DetailPanel.jsx";
import PermitDataConsole from "./PermitDataConsole.jsx";
import { geometryCentroid } from "../../components/geometry.js";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { CENTROID_SOURCE, buildCentroidPoints, centroidNameLayer, centroidFocusLayer } from "../../components/nameLabels.js";
import { applyChoroplethBasemapHarmony } from "../../components/choroplethBasemap.js";
import {
  BASEMAP_STYLE, MAP_VIEW, METRICS, DEFAULT_METRIC,
  metricStops, choroplethLayers, applyPermitYearMetric, buildPopupHtml,
  FILL_LAYER_ID, LEGEND_STATES,
} from "./permitChoroplethStyle.js";
import {
  loadPermitManifest, permitYears, permitDefaultYear,
  resolveCombinedPermitUrl, projectYearCollection, projectYearProps,
  aggregatePermitFeatures,
} from "./dataSources.js";
import {
  buildSnapshotCsv, buildTimeseriesCsv, buildAggregateCsv, buildGeoJson,
  buildProvenanceText, downloadCsvWithSidecar, downloadText, exportPng,
} from "./exportPermitData.js";
import { fmtNumber } from "../../utils/format.js";
import { reduceMotion } from "../../components/motion.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE, ICON_INFO, ICON_DATABASE } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";

const SOURCE_ID = "pnbhd";
const CITY = "Edmonton";
const COMBINED_URL = resolveCombinedPermitUrl();
const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);

// ---- Fly-to / fit helpers. promoteId = "Neighbourhood ID". --------------------
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
function floatLeftPad(map) {
  const el = map.getContainer().closest(".content-map")?.querySelector(".pa-float");
  if (!el || getComputedStyle(el).position !== "absolute") return 0;
  return Math.round(el.getBoundingClientRect().width);
}
function flyToFeature(map, feat, { reserveConsole = false } = {}) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    // reserveConsole reserves the raised dock's height so a flown-to neighbourhood clears it.
    padding: { top: 80, bottom: reserveConsole ? 320 : 80, left: floatLeftPad(map) + 60, right: 60 },
    duration: reduceMotion() ? 0 : 900, maxZoom: 14,
    pitch: 0, bearing: 0, // a focus is a data-derived FLAT fit — HOME is the only pitched view
  });
}
// Fit the camera to a SET of features. reserveConsole reserves the raised dock's height
// in the bottom padding so a ≥2 selection frames in the clear map above the console.
function fitToFeatures(map, features, { reserveConsole = false } = {}) {
  if (!features?.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    const [[x1, y1], [x2, y2]] = bboxOfGeom(f.geometry);
    minX = Math.min(minX, x1); minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
  }
  map.fitBounds([[minX, minY], [maxX, maxY]], {
    padding: { top: 80, bottom: reserveConsole ? 320 : 80, left: floatLeftPad(map) + 60, right: 60 },
    duration: reduceMotion() ? 0 : 700, maxZoom: 14,
    pitch: 0, bearing: 0, // flat data-derived fit — HOME is the only pitched view
  });
}

export default function PermitChoroplethMap() {
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [years, setYears] = useState([]);            // newest-first (slider/select order)
  const [year, setYear] = useState(null);
  const [sliderYear, setSliderYear] = useState(null); // live year thumb (throttled commit)
  const [metricKey, setMetricKey] = useState(DEFAULT_METRIC);

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);                // the combined all-years file
  const [fetchError, setFetchError] = useState(null);

  const [infoOpen, setInfoOpen] = useState(false);
  const [attribOpen, setAttribOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [dockOpen, setDockOpen] = useState(false);   // Analysis mode (console up)
  const [brushedIds, setBrushedIds] = useState(null); // District facet view (map dim)

  const metricDef = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;

  // Ascending years for the trend/series (oldest → newest, left → right). The year
  // slider bounds (min/max) are order-agnostic.
  const yearsAsc = useMemo(() => [...years].sort((a, b) => a - b), [years]);
  const prevYear = year != null && yearsAsc.length && year > yearsAsc[0] ? year - 1 : null;
  const activeIndex = year != null ? yearsAsc.indexOf(year) : -1;

  useEffect(() => {
    let cancelled = false;
    loadPermitManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setYears(permitYears(m));
        setYear(permitDefaultYear(m));
      })
      .catch((err) => { if (!cancelled) setManifestError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const gjView = useMemo(() => projectYearCollection(gj, year), [gj, year]);
  const stops = useMemo(
    () => metricStops(gjView, metricDef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gjView, metricKey]
  );

  const selectedFeature = useMemo(() => {
    if (singleSelectedId == null || !gjView) return null;
    const f = findFeatureById(gjView, singleSelectedId);
    return f ? f.properties : null;
  }, [singleSelectedId, gjView]);

  const names = useMemo(() => {
    if (!gj) return [];
    const s = new Set();
    for (const f of gj.features) { const n = f.properties?.display_name; if (n) s.add(n); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [gj]);

  // ---- Table rows for the console (active-year values + all-years series). ------
  // reportable (aggregated) only — suppressed/no_data render "—", matching the map +
  // the aggregate. `series` is the ACTIVE metric across years (drives the trend).
  const tableRows = useMemo(() => {
    if (!gjView || !gj) return [];
    const field = metricDef.field;
    return gjView.features.map((f, i) => {
      const p = f.properties;                 // active-year, bare-named
      const gp = gj.features[i].properties;   // raw combined (all years)
      const agg = p.polygon_state === "aggregated";
      return {
        id: p["Neighbourhood ID"],
        name: p.display_name,
        district: p.district,
        state: p.polygon_state,
        permit_count:       agg ? num(p.n_permits) : null,
        construction_value: agg ? num(p.total_construction_value) : null,
        units_added:        agg ? num(p.units_added_gross) : null,
        units_demolished:   agg ? num(p.units_demolished) : null,
        median_cv:          agg ? num(p.median_construction_value) : null,
        series: yearsAsc.map((y) =>
          gp[`polygon_state_${y}`] === "aggregated" ? num(gp[`${field}_${y}`]) : null),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gjView, gj, metricKey, yearsAsc]);

  // ---- Scope aggregates (the KPI rail's math). aggregatePermitFeatures reads the RAW
  // combined features (year + prevYear), so filter gj.features by id. -------------
  const featuresByIds = (ids) => {
    if (!gj) return [];
    const set = new Set(ids.map(String));
    return gj.features.filter((f) => set.has(String(f.properties["Neighbourhood ID"])));
  };
  const cityBaseline = useMemo(
    () => (gj && year != null ? aggregatePermitFeatures(gj.features, year, prevYear) : null),
    [gj, year, prevYear]
  );
  const selectionAggregate = useMemo(
    () => (selectedIds.length >= 2 && gj && year != null
      ? aggregatePermitFeatures(featuresByIds(selectedIds), year, prevYear) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, gj, year, prevYear]
  );
  const singleAggregate = useMemo(
    () => (singleSelectedId != null && gj && year != null
      ? aggregatePermitFeatures(featuresByIds([singleSelectedId]), year, prevYear) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [singleSelectedId, gj, year, prevYear]
  );
  const facetAggregate = useMemo(
    () => (!selectedIds.length && brushedIds?.length && gj && year != null
      ? aggregatePermitFeatures(featuresByIds(brushedIds), year, prevYear) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, brushedIds, gj, year, prevYear]
  );

  // Refs so the once-installed map handlers read the live values.
  const yearRef = useRef(year);       useEffect(() => { yearRef.current = year; }, [year]);
  const metricRef = useRef(metricDef); useEffect(() => { metricRef.current = metricDef; });
  const gjRef = useRef(gj);           useEffect(() => { gjRef.current = gj; }, [gj]);
  const gjViewRef = useRef(gjView);   useEffect(() => { gjViewRef.current = gjView; }, [gjView]);
  const dockOpenRef = useRef(dockOpen); useEffect(() => { dockOpenRef.current = dockOpen; }, [dockOpen]);
  const firstHomeRef = useRef(true);   // first HOME landing = jumpTo (under skeleton), then ease

  useEffect(() => {
    if (year == null) return undefined;
    document.title = `Dwelling Units · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Keep the slider thumb synced when year changes from elsewhere (default/dropdown).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSliderYear(year); }, [year]);
  // Year slider: live thumb; the year commit (paint swap) is instant (setFilter is cheap,
  // no colour tween to pace — DU differs from PA here).
  function slideYear(next) {
    setSliderYear(next);
    setYear(next);
  }

  // Fetch the combined file ONCE.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchError(null);
    let cancelled = false;
    fetch(COMBINED_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`); return r.json(); })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  function handleMapLoad(m) {
    setMap(m);
    // Land on the pitched HOME view (jumpTo under the skeleton on first load; ease after).
    applyCameraPreset(m, HOME_VIEW[CITY], { ease: !firstHomeRef.current });
    firstHomeRef.current = false;
    if (import.meta.env.DEV) window.__duMap = m;   // dev-only console handle (mirrors PA's __paMap)
  }

  // Paint swap on year/metric/stops change.
  useEffect(() => {
    if (!map) return;
    applyPermitYearMetric(map, metricDef, year, stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, metricKey, year, stops]);

  // PINNED feature-state ← selectedIds (multi). Set-diff; re-applies on gj (source) change.
  const prevPinnedRef = useRef(new Set());
  useEffect(() => {
    if (!map || !gj) return;
    const next = new Set(selectedIds.map(String));
    const prev = prevPinnedRef.current;
    try {
      for (const id of prev) if (!next.has(id)) map.setFeatureState({ source: SOURCE_ID, id }, { pinned: false });
      for (const id of next) map.setFeatureState({ source: SOURCE_ID, id }, { pinned: true });
      prevPinnedRef.current = next;
    } catch { /* map mid-teardown */ }
  }, [map, selectedIds, gj]);

  // DIMMED feature-state ← the District facet view (brushedIds) OR the ≥2 selection
  // (dim the non-selected). Mirrors PA. hover/pinned win over dimmed in the paint expr.
  const prevDimmedRef = useRef(new Set());
  useEffect(() => {
    if (!map || !gj) return;
    const keepIds = brushedIds ? brushedIds.map(String)
      : selectedIds.length >= 2 ? selectedIds.map(String) : null;
    const next = new Set();
    if (keepIds) {
      const keep = new Set(keepIds);
      for (const f of gj.features) {
        const id = String(f.properties["Neighbourhood ID"]);
        if (!keep.has(id)) next.add(id);
      }
    }
    const prev = prevDimmedRef.current;
    try {
      for (const id of prev) if (!next.has(id)) map.setFeatureState({ source: SOURCE_ID, id }, { dimmed: false });
      for (const id of next) map.setFeatureState({ source: SOURCE_ID, id }, { dimmed: true });
      prevDimmedRef.current = next;
    } catch { /* map mid-teardown */ }
  }, [map, gj, brushedIds, selectedIds]);

  // Shift-drag box SELECT — a neighbourhood joins when its centroid projects inside the
  // box. ≥2 raises the console + fits (reserving its height); 1 = fit + detail; 0 = clear.
  function boxSelect(mapInst, startPos, endPos) {
    const gjNow = gjViewRef.current;
    if (!gjNow) return;
    if (Math.abs(endPos.x - startPos.x) < 3 && Math.abs(endPos.y - startPos.y) < 3) return;
    const x1 = Math.min(startPos.x, endPos.x), x2 = Math.max(startPos.x, endPos.x);
    const y1 = Math.min(startPos.y, endPos.y), y2 = Math.max(startPos.y, endPos.y);
    const ids = [], selected = [];
    for (const f of gjNow.features) {
      const c = geometryCentroid(f.geometry);
      if (!c) continue;
      const pt = mapInst.project(c);
      if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) {
        ids.push(f.properties["Neighbourhood ID"]);
        selected.push(f);
      }
    }
    setSelectedIds(ids);
    setSearchQuery("");
    if (ids.length >= 2) { setDockOpen(true); fitToFeatures(mapInst, selected, { reserveConsole: true }); }
    else if (ids.length === 1) fitToFeatures(mapInst, selected);
  }

  // Hover (900ms popup) + click-to-SELECT (single), installed once per map.
  useEffect(() => {
    if (!map) return undefined;
    const hoverPopup = new maplibregl.Popup({
      className: "popup-hover", closeButton: false, closeOnClick: false, offset: 8, maxWidth: "220px",
    });
    map.doubleClickZoom.disable();

    let hoveredId = null, hoverTimer = null, lastHoveredId = null;
    function setHover(id, on) { map.setFeatureState({ source: SOURCE_ID, id }, { hover: on }); }
    function clearHover() {
      clearTimeout(hoverTimer); lastHoveredId = null;
      if (hoveredId !== null) { setHover(hoveredId, false); hoveredId = null; }
      hoverPopup.remove(); map.getCanvas().style.cursor = "";
    }
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      if (hoverPopup.isOpen()) hoverPopup.setLngLat(e.lngLat);
      if (f.id !== lastHoveredId) {
        clearTimeout(hoverTimer);
        if (hoveredId !== null && hoveredId !== f.id) setHover(hoveredId, false);
        hoveredId = f.id; setHover(hoveredId, true); hoverPopup.remove(); lastHoveredId = f.id;
        hoverTimer = setTimeout(() => {
          if (hoveredId === f.id) {
            hoverPopup.setLngLat(e.lngLat)
              .setHTML(buildPopupHtml(projectYearProps(f.properties, yearRef.current), false, yearRef.current, metricRef.current))
              .addTo(map);
          }
        }, 900);
      }
    }
    function onLeave() { clearHover(); }
    function onFillClick(e) {
      if (!e.features?.length) return;
      clearHover();
      setSelectedIds([e.features[0].id]);   // single-select (box-select does ≥2)
    }
    function onDblClick(e) {
      e.preventDefault();
      if (!e.features?.length) return;
      const full = findFeatureById(gjRef.current, e.features[0].id);
      if (full) flyToFeature(map, full, { reserveConsole: dockOpenRef.current });
    }
    function onMapClick(e) {
      const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
      if (!hits.length) setSelectedIds([]);
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
      clearTimeout(hoverTimer); hoverPopup.remove();
    };
  }, [map]);

  // Basemap harmony (buildings → neutral grey so the ramp reads through; hide the basemap's
  // OWN neighbourhood labels) + lift the selection highlight pair to the TOP so a pin is never
  // occluded (PA P4). Declared BEFORE the label mount so the centroid labels still land on top.
  useEffect(() => {
    if (!map) return;
    applyChoroplethBasemapHarmony(map);
    try {
      for (const id of ["pnbhd-highlight-casing", "pnbhd-highlight"]) {
        if (map.getLayer(id)) map.moveLayer(id);
      }
    } catch { /* map mid-teardown */ }
  }, [map]);

  // Name labels — a CLIENT-DERIVED centroid source + the base/focus layers (shared, mirrors
  // PA). Base adjacent to the basemap symbols (one collision index); focus ABOVE everything
  // (the hover/select always-names guarantee). Year-invariant; re-derived only if gj changes.
  useEffect(() => {
    if (!map || !gj) return;
    const points = buildCentroidPoints(gj, "Neighbourhood ID");
    try {
      const src = map.getSource(CENTROID_SOURCE);
      if (src) { src.setData(points); return; }
      map.addSource(CENTROID_SOURCE, { type: "geojson", data: points, promoteId: "Neighbourhood ID" });
      map.addLayer({ ...centroidNameLayer(), source: CENTROID_SOURCE }, findFirstSymbolLayerId(map));
      map.addLayer({ ...centroidFocusLayer(), source: CENTROID_SOURCE });
    } catch { /* map mid-teardown — re-adds on next mount */ }
  }, [map, gj]);

  // Filter the BASE name layer to REPORTABLE (aggregated) neighbourhoods for the active year,
  // so suppressed/no-data names never clutter. The FOCUS layer stays unfiltered.
  useEffect(() => {
    if (!map || !gjView) return;
    try {
      if (!map.getLayer("nbhd-labels")) return;
      const reportable = gjView.features
        .filter((f) => f.properties.polygon_state === "aggregated")
        .map((f) => String(f.properties["Neighbourhood ID"]));
      // to-string COERCES the property to a string — DU's "Neighbourhood ID" is a NUMBER
      // (PA's is a string), so a bare ["get"] would compare number-vs-string-array and cull
      // EVERY base label (the "labels gone" bug). to-string makes the match type-agnostic.
      map.setFilter("nbhd-labels", ["in", ["to-string", ["get", "Neighbourhood ID"]], ["literal", reportable]]);
    } catch { /* map mid-teardown */ }
  }, [map, gjView]);

  // Mirror the selection (pinned) onto the centroid source so a selected neighbourhood keeps
  // its name via the focus layer even where the base label was collision-culled.
  const prevCentroidPinRef = useRef(new Set());
  useEffect(() => {
    if (!map) return;
    const next = new Set(selectedIds.map(String));
    const prev = prevCentroidPinRef.current;
    try {
      for (const id of prev) if (!next.has(id)) map.setFeatureState({ source: CENTROID_SOURCE, id }, { pinned: false });
      for (const id of next) map.setFeatureState({ source: CENTROID_SOURCE, id }, { pinned: true });
      prevCentroidPinRef.current = next;
    } catch { /* centroid source not added yet */ }
  }, [map, selectedIds]);

  // Mirror the MAP hover onto the centroid source (its focus label shows on hover). Read-only;
  // the polygon hover channel is owned by the interactions effect above.
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

  // ---- Right rail (recentre / info / database) ----
  const resetRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  resetRef.current = () => {
    if (!map) return;
    if (selectedIds.length) {
      const feats = featuresByIds(selectedIds);
      if (feats.length) { fitToFeatures(map, feats, { reserveConsole: dockOpen }); return; }
    }
    applyCameraPreset(map, HOME_VIEW[CITY], { ease: true });   // no selection → the pitched HOME
  };
  const infoToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  infoToggleRef.current = () => setInfoOpen((o) => !o);
  const attribToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  attribToggleRef.current = () => setAttribOpen((o) => !o);

  const resetLabel = selectedIds.length ? "Fit to selection" : "Return to home view";
  const resetCtrlRef = useRef(null);
  useEffect(() => { resetCtrlRef.current?.setLabel(resetLabel); }, [resetLabel]);
  const infoCtrlRef = useRef(null);
  useEffect(() => { infoCtrlRef.current?.setActive(infoOpen); }, [infoOpen]);
  const attribCtrlRef = useRef(null);
  useEffect(() => { attribCtrlRef.current?.setActive(attribOpen); }, [attribOpen]);

  useEffect(() => {
    if (!map) return undefined;
    const reset = makeIconButtonControl({ svg: railGlyph(ICON_RECENTRE), label: () => resetLabel, onClick: () => resetRef.current?.() });
    const info = makeIconButtonControl({ svg: railGlyph(ICON_INFO), label: "About & tips", onClick: () => infoToggleRef.current?.() });
    const attrib = makeIconButtonControl({ svg: railGlyph(ICON_DATABASE), label: "Data & attribution", onClick: () => attribToggleRef.current?.() });
    map.addControl(reset, "top-right");
    map.addControl(info, "top-right");
    map.addControl(attrib, "bottom-right");
    resetCtrlRef.current = reset; infoCtrlRef.current = info; attribCtrlRef.current = attrib;
    info.setActive(infoOpen); attrib.setActive(attribOpen);
    return () => {
      resetCtrlRef.current = null; infoCtrlRef.current = null; attribCtrlRef.current = null;
      for (const c of [reset, info, attrib]) { try { map.removeControl(c); } catch { /* gone */ } }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  function flyAndPinByName(name) {
    const gjNow = gjRef.current;
    if (!map || !gjNow) return;
    const feat = gjNow.features.find((f) => f.properties?.display_name === name);
    if (!feat) return;
    flyToFeature(map, feat, { reserveConsole: dockOpenRef.current });
    setSelectedIds([feat.properties["Neighbourhood ID"]]);
  }

  // ---- Console callbacks ----
  const selectRow = (id) => setSelectedIds([id]);
  const hoverRow = (id) => {
    if (!map) return;
    try { map.removeFeatureState({ source: SOURCE_ID }, "hover"); } catch { /* ok */ }
    if (id != null) { try { map.setFeatureState({ source: SOURCE_ID, id }, { hover: true }); } catch { /* ok */ } }
  };
  const clearSelection = () => setSelectedIds([]);

  // Scoped export (selection → district facet → all city). CSV bodies + a provenance
  // sidecar, GeoJSON, or a PNG of the map — all client-side, mirroring PA's handleExport.
  function handleExport(format) {
    if (!gj) return;
    const ids = selectedIds.length ? selectedIds : (brushedIds?.length ? brushedIds : null);
    const set = ids ? new Set(ids.map(String)) : null;
    const scoped = set
      ? gj.features.filter((f) => set.has(String(f.properties["Neighbourhood ID"])))
      : gj.features;
    const scopeKind = selectedIds.length ? "selected" : brushedIds?.length ? "filtered" : null;
    const base = `dwelling-units_${CITY}_${scopeKind ? `${scoped.length}-${scopeKind}` : "all"}`;
    const span = `${yearsAsc[0]}-${yearsAsc[yearsAsc.length - 1]}`;
    const meta = {
      city: CITY,
      metric: metricDef.label,
      scope: scopeKind ? `${scoped.length} ${scopeKind === "selected" ? "selected" : "filtered (table view)"} neighbourhoods` : "all neighbourhoods",
    };
    if (format === "csv-current") {
      const name = `${base}_${year}.csv`;
      downloadCsvWithSidecar(name, buildSnapshotCsv(scoped, year),
        buildProvenanceText({ ...meta, file: name, shape: "snapshot — one row per neighbourhood", coverage: String(year) }));
    } else if (format === "csv-timeseries") {
      const name = `${base}_${span}.csv`;
      downloadCsvWithSidecar(name, buildTimeseriesCsv(scoped, yearsAsc),
        buildProvenanceText({ ...meta, file: name, shape: "timeseries panel — one row per neighbourhood × year", coverage: span }));
    } else if (format === "csv-aggregate") {
      const name = `${base}_summary_${year}.csv`;
      downloadCsvWithSidecar(name, buildAggregateCsv(selectionAggregate, cityBaseline),
        buildProvenanceText({ ...meta, file: name, shape: "aggregate — one row per measure", coverage: String(year) }));
    } else if (format === "geojson") {
      downloadText(`${base}.geojson`, buildGeoJson(scoped), "application/geo+json");
    } else if (format === "png") {
      if (map) exportPng(map, `${base}_${year}.png`);
    }
  }

  if (manifestError) {
    return (
      <article className="content-map pa-map"><div className="pa-canvas"><div className="canvas-wrap">
        <EmptyState title="Could not load the year catalogue." body={manifestError} />
      </div></div></article>
    );
  }
  if (!manifest) {
    return (
      <article className="content-map pa-map"><div className="pa-canvas"><div className="canvas-wrap">
        <p className="map-loading">Loading…</p>
      </div></div></article>
    );
  }

  const detailRail = selectedFeature && !dockOpen ? (() => {
    const p = selectedFeature;
    const agg = p.polygon_state === "aggregated";
    const notes = [];
    if (p.is_annexation_area) notes.push("Annexation area — annexed, not yet subdivided into neighbourhoods; shown with its own outline.");
    if (!agg) notes.push(p.polygon_state === "suppressed_low_n" ? "Fewer than 10 permits — aggregate values suppressed." : "No permit data for this neighbourhood.");
    const rows = agg ? [
      { k: metricDef.legendLabel, v: metricDef.fmt(p[metricDef.field]) },
      ...(metricDef.field !== "n_permits" ? [{ k: "Residential permits", v: fmtNumber(p.n_permits) }] : []),
    ] : [];
    return <DetailPanel name={p.display_name} sub={p.district ? `${p.district} district` : null} notes={notes} rows={rows} onClear={clearSelection} />;
  })() : null;

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data" body="The dwelling-unit aggregates failed to load. Try refreshing the page." />
          ) : (
            <>
              {(!gj || !map) && <MapSkeleton />}
              <MapErrorBoundary resetKey={COMBINED_URL}>
                <MapView
                  className="canvas"
                  basemapStyle={BASEMAP_STYLE}
                  geojsonUrl={COMBINED_URL}
                  view={MAP_VIEW}
                  sourceId="pnbhd"
                  promoteId="Neighbourhood ID"
                  layers={choroplethLayers(stops, metricDef, year)}
                  images={[]}
                  onLoad={handleMapLoad}
                  boxSelect={boxSelect}
                  preserveDrawingBuffer
                  cooperativeGestures={false}
                  attributionCompact={false}
                  mapAttribution={siteConfig.mapAttributionStrip}
                />
              </MapErrorBoundary>
            </>
          )}
        </div>

        {/* INSTRUMENT COLUMN — metric DORMANT (re-homes to the console header) when the
            console is up; legend + count stay. No year select — the Year slider lives in
            the console tuning bay (strip above the handle when down). */}
        <div className="pa-float pa-column">
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Dwelling Units" />
          </section>
          {gjView && (
            <section className="pa-card pa-card-instrument">
              {!dockOpen && (
                <div className="pa-col-mod pa-col-metric">
                  <SegmentedControl label="Metric" options={METRICS} value={metricKey} onChange={setMetricKey} />
                </div>
              )}
              <div className="pa-col-mod pa-col-legend">
                <span className="pa-col-lab">Legend</span>
                <div className="du-legend-fade" key={metricKey}>
                  <Legend title={metricDef.legendLabel} stops={stops} format={metricDef.fmt} horizontal
                          greyTitle="Neighbourhood status" greyStates={LEGEND_STATES} />
                </div>
              </div>
              <div className="pa-col-mod pa-col-foot">
                <div className="pa-foot-line">
                  <span className="pa-col-count">{gjView.features.length.toLocaleString()} neighbourhoods</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* SINGLE-SELECT DETAIL — only while the console is down (up, the KPI rail owns it). */}
        {detailRail}

        {/* UNIFIED SEARCH */}
        {gj && (
          <SearchPeek names={names} value={searchQuery} onValueChange={setSearchQuery}
            onSelect={(name) => { flyAndPinByName(name); setSearchQuery(name); }} />
        )}

        {/* ABOUT & TIPS — the full tip set now that DU has the console (box-select, sliders,
            Press T, clears). honesty={null}: the median-of-medians ≈ tag rides the KPI card. */}
        <MapTipsPopover open={infoOpen} onClose={() => setInfoOpen(false)} honesty={null} lastUpdated={manifest?.last_updated} />

        {/* DATA & ATTRIBUTION */}
        <AttributionPanel open={attribOpen} onClose={() => setAttribOpen(false)} />

        {/* ===== DATA CONSOLE (Analysis) ===== */}
        {gjView && (
          <div className="pa-foot">
            <PermitDataConsole
              rows={tableRows}
              metric={metricKey}
              metricLabel={metricDef.label}
              metrics={METRICS}
              onMetricChange={setMetricKey}
              cityName={CITY}
              activeIndex={activeIndex}
              year={year}
              years={yearsAsc}
              sliderYear={sliderYear}
              slideYear={slideYear}
              selectedIds={selectedIds}
              singleAggregate={singleAggregate}
              aggregate={selectionAggregate}
              facetAggregate={facetAggregate}
              cityBaseline={cityBaseline}
              onSelectRow={selectRow}
              onHoverRow={hoverRow}
              onClearSelection={clearSelection}
              onExport={handleExport}
              onBrush={setBrushedIds}
              open={dockOpen}
              onToggle={() => setDockOpen((o) => !o)}
              globalFilter={searchQuery}
              onGlobalFilterChange={setSearchQuery}
            />
          </div>
        )}
      </div>
    </article>
  );
}
