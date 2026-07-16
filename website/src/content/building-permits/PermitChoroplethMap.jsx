// =============================================================================
// PermitChoroplethMap.jsx
//
// The Dwelling Units choropleth route ("/activity/dwelling-units"). STANDARDIZED to
// the Property Assessment instrument (PropertyAssessmentMap.jsx is the website
// standard for every neighbourhood-aggregate map): the same immersive full-bleed
// canvas, the transparent .pa-float instrument column (identity → metric → year →
// legend → count), the shared right rail (recentre / info / database), the unified
// SearchPeek, the About & tips popover, the data-&-attribution panel, and a single-
// select DetailPanel float — all the shared chrome, one visual system.
//
// Where it DIVERGES from PA — and why (data shortage, not choice):
//   • VIEW-ONLY. No analyst Data Console / box-select / KPI rail (Tier B, deferred).
//     Dwelling Units ships one aggregate per neighbourhood-year, no parcel rows to
//     roll up, so there is no selection-aggregate concept (tips honesty={null}).
//   • FLAT metrics. Four metric buttons (METRICS in the style file), each ONE GeoJSON
//     field — Permit Count, Construction Value, Dwellings Added / Demolished. The
//     %-YoY-of-permit-counts metric was dropped as not logical (2026-07-16).
//   • Year lives in the COLUMN (a select), not a console slider — there is no console.
//     And a year change is a real per-year FILE swap (the data is per-year files), so
//     the map dips-and-swaps the source in place; the two-layer opacity crossfade is
//     only for the metric switch (all four fields already live on every feature).
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<year>.geojson
//   fields: display_name, district, Neighbourhood ID, polygon_state, is_annexation_area,
//   n_permits, total_construction_value, median_construction_value, units_added_gross,
//   units_demolished
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";

import MapView from "../../components/MapView.jsx";
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
  DEFAULT_METRIC,
  metricStops,
  choroplethFillColor,
  choroplethLayers,
  buildPopupHtml,
  FILL_OPACITY_EXPR,
  FILL_LAYER_IDS,
  LEGEND_STATES,
} from "./permitChoroplethStyle.js";
import { fmtNumber } from "../../utils/format.js";
import { DUR_SLOW, DUR_FAST, reduceMotion } from "../../components/motion.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE, ICON_INFO, ICON_DATABASE, ICON_MOUSE, ICON_CLICK, ICON_SEARCH } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";

// Crossfade timing. 500ms ease-out for the metric dissolve (MapLibre's built-in
// transition easing); hover stays snappy at 150ms outside a switch.
const FADE_MS = DUR_SLOW;
const HOVER_MS = DUR_FAST;

const SOURCE_ID = "pnbhd";

// This map's "How to Use" index (MapTipsPopover). A LEAN subset of PA's — no console /
// box-select / sliders / clears, because View-only Dwelling Units has none of them.
// Same glyph family as the rail (the index doubles as a tip→control map).
const DU_TIPS = [
  { key: "scroll", glyph: <Glyph body={ICON_MOUSE} />, body: <>Scroll to Zoom</> },
  { key: "click",  glyph: <Glyph body={ICON_CLICK} />, body: <>Click to Select a Neighbourhood</> },
  { key: "search", glyph: <Glyph body={ICON_SEARCH} />, body: <>Search to Find a Neighbourhood and Fly to It</> },
];

async function loadPermitManifest() {
  const res = await fetch(assetUrl("/data/building-permits/manifest.json"));
  if (!res.ok) {
    throw new Error(`Could not load the year catalogue (HTTP ${res.status})`);
  }
  return res.json();
}

// One file per year at a stable path; year is the only thing that varies.
function dataUrl(year) {
  return assetUrl(`/data/building-permits/permit-neighbourhoods/permit_neighbourhoods_${year}.geojson`);
}

// ---- Fly-to helpers (double-click, search, recentre). promoteId = "Neighbourhood ID". ----
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
// Left padding = the instrument column's live width so a flown-to polygon clears the
// .pa-float overlay (mirrors PA's chromePadding; only pads while it's an absolute overlay,
// i.e. desktop — on a stacked mobile layout the column is in flow and this returns 0).
function floatLeftPad(map) {
  const el = map.getContainer().closest(".content-map")?.querySelector(".pa-float");
  if (!el || getComputedStyle(el).position !== "absolute") return 0;
  return Math.round(el.getBoundingClientRect().width);
}
function flyToFeature(map, feat) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    padding: { top: 80, bottom: 80, left: floatLeftPad(map) + 60, right: 60 },
    duration: reduceMotion() ? 0 : 900, maxZoom: 14,
  });
}

export default function PermitChoroplethMap() {
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(null);

  // One flat metric (4 buttons). Default = Dwellings Added.
  const [metricKey, setMetricKey] = useState(DEFAULT_METRIC);

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // True while an in-place year swap's new data is genuinely slow (MapView reports it
  // via onLoading) — drives the skeleton-threshold fallback.
  const [swapLoading, setSwapLoading] = useState(false);

  // Shared-chrome state (mirrors PA): the About & tips popover, the attribution panel,
  // the unified search text, and the single SELECTED neighbourhood (its id — the detail
  // float + pinned highlight derive from it).
  const [infoOpen, setInfoOpen] = useState(false);
  const [attribOpen, setAttribOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  // Which fill layer is currently visible ("a" or "b") — carried in a REF, not state:
  // the crossfade is driven imperatively (MapLibre paint props), so nothing renders off
  // it. Reset to "a" on every map (re)mount, since choroplethLayers builds "a" visible.
  const activeFillRef = useRef("a");
  const fadeTimerRef = useRef(null);
  // Tracks the last-painted metric so the paint effect can tell a metric SWITCH
  // (crossfade) from a stops-only refinement (gj settling — repaint live).
  const prevSelRef = useRef(DEFAULT_METRIC);

  const metricDef = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

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

  // Ramp stops for the active metric field (all metrics sequential).
  const stops = useMemo(
    () => metricStops(gj, metricDef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gj, metricKey]
  );

  // The selected neighbourhood's LIVE properties — derived from selectedId + the current
  // year's gj (NOT a click-time snapshot), so a year swap refreshes the detail float with
  // the new year's data (and shows the no-data/suppressed note if it lost coverage).
  const selectedFeature = useMemo(() => {
    if (selectedId == null || !gj) return null;
    const f = findFeatureById(gj, selectedId);
    return f ? f.properties : null;
  }, [selectedId, gj]);

  // Search datalist names — every neighbourhood in the loaded year, de-duped + sorted.
  const names = useMemo(() => {
    if (!gj) return [];
    const s = new Set();
    for (const f of gj.features) { const n = f.properties?.display_name; if (n) s.add(n); }
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [gj]);

  // Refs so the once-installed map handlers read the live selection.
  const yearRef = useRef(year);
  useEffect(() => { yearRef.current = year; }, [year]);
  const metricRef = useRef(metricDef);
  useEffect(() => { metricRef.current = metricDef; });
  const gjRef = useRef(gj);
  useEffect(() => { gjRef.current = gj; }, [gj]);

  useEffect(() => {
    if (year == null) return undefined;
    document.title = `Dwelling Units · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Fetch the year's GeoJSON. A year swap keeps map + the old gj so MapView dips-and-swaps
  // the source in place (one WebGL context); gj updates when the new file resolves.
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

  // Reset which fill layer is active whenever a fresh map mounts: choroplethLayers always
  // builds "a" visible / "b" hidden.
  function handleMapLoad(m) {
    activeFillRef.current = "a";
    prevSelRef.current = metricKey;
    setMap(m);
  }

  // Single paint effect. Two cases, told apart by whether the metric changed:
  //  • SWITCH (metric changed): paint the new colour on the HIDDEN layer, then crossfade
  //    opacity over 500ms (hidden→visible, active→0), swap active. Pure paint — never
  //    setData/re-fetch (all four fields already on every feature).
  //  • REFINE (same metric, stops settled after gj load): repaint the active layer in
  //    place (no fade).
  useEffect(() => {
    if (!map) return;
    const sel = metricKey;
    const isSwitch = sel !== prevSelRef.current;
    prevSelRef.current = sel;

    const cur = activeFillRef.current;
    const activeId = `pnbhd-fill-${cur}`;
    const newColor = choroplethFillColor(metricDef, stops);

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
  }, [map, metricKey, stops]);

  // Clear any pending fade-reset timer on unmount.
  useEffect(() => () => clearTimeout(fadeTimerRef.current), []);

  // Sync the PINNED feature-state to the React selection (selectedId). Re-runs on a year
  // swap (gj dep) because setData clears feature-state — re-applies the pin to the reloaded
  // feature. No MapLibre pinned popup any more: the DetailPanel float is the selection UI.
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

  // Hover (900ms popup) + click-to-SELECT, installed once per map. Bound to BOTH fill
  // layers so events fire whichever is on top mid-crossfade; the popup reads metricRef
  // (the ACTIVE metric) so its content is never the fading-out layer's metric.
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
              .setHTML(buildPopupHtml(
                f.properties, false, yearRef.current, metricRef.current))
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
      const hits = map.queryRenderedFeatures(e.point, { layers: FILL_LAYER_IDS });
      if (!hits.length) setSelectedId(null);   // click empty → clear selection
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
      hoverPopup.remove();
    };
  }, [map]);

  // ---- Right rail (shared chrome): recentre / info / database ----------------
  // The recentre control fits to the selection if one exists, else eases home. State-aware
  // NAME, one stable glyph (Option C, PA) — the shape never lies, the label carries the
  // precision. Info toggles the tips popover; database toggles the attribution panel.
  const resetRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  resetRef.current = () => {
    if (!map) return;
    if (selectedId != null) {
      const feat = findFeatureById(gjRef.current, selectedId);
      if (feat) { flyToFeature(map, feat); return; }
    }
    map.easeTo({ center: MAP_VIEW.center, zoom: MAP_VIEW.zoom, duration: reduceMotion() ? 0 : 600 });
  };
  const infoToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  infoToggleRef.current = () => setInfoOpen((o) => !o);
  const attribToggleRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  attribToggleRef.current = () => setAttribOpen((o) => !o);

  // Relabel the recentre control in place as the selection comes and goes (mount once).
  const resetLabel = selectedId != null ? "Fit to selection" : "Return to home view";
  const resetCtrlRef = useRef(null);
  useEffect(() => { resetCtrlRef.current?.setLabel(resetLabel); }, [resetLabel]);

  // The info / database controls GLOW while their panel is open — load-bearing (with no ×
  // on the popovers, the glow is the only cue for where the close action lives).
  const infoCtrlRef = useRef(null);
  useEffect(() => { infoCtrlRef.current?.setActive(infoOpen); }, [infoOpen]);
  const attribCtrlRef = useRef(null);
  useEffect(() => { attribCtrlRef.current?.setActive(attribOpen); }, [attribOpen]);

  useEffect(() => {
    if (!map) return undefined;
    const reset = makeIconButtonControl({
      svg: railGlyph(ICON_RECENTRE),
      label: () => resetLabel,   // read at mount so the first label matches the load state
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
    // Controls mount ONCE; relabel/glow ride the effects above. resetLabel/*Open are read
    // at mount then updated in place — re-adding on every change would rebuild the rail.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Search → fly + select (mirrors PA's flyAndPinByName). Finds the feature by name in the
  // loaded year, frames it, and sets it as the selection (detail float + pin).
  function flyAndPinByName(name) {
    const gjNow = gjRef.current;
    if (!map || !gjNow) return;
    const feat = gjNow.features.find((f) => f.properties?.display_name === name);
    if (!feat) return;
    flyToFeature(map, feat);
    setSelectedId(feat.properties["Neighbourhood ID"]);
  }

  if (manifestError) {
    return (
      <article className="content-map pa-map">
        <div className="pa-canvas"><div className="canvas-wrap">
          <EmptyState title="Could not load the year catalogue." body={manifestError} />
        </div></div>
      </article>
    );
  }
  if (!manifest) {
    return (
      <article className="content-map pa-map">
        <div className="pa-canvas"><div className="canvas-wrap">
          <p className="map-loading">Loading…</p>
        </div></div>
      </article>
    );
  }

  return (
    <article className="content-map pa-map">
      {/* ===== FULL-BLEED MAP CANVAS (PA standard). The instrument column floats on the
           left, the detail float on the right; the map centre stays chrome-free. ===== */}
      <div className="pa-canvas">
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
                  layers={choroplethLayers(stops, metricDef)}
                  images={[]}
                  onLoad={handleMapLoad}
                  onLoading={setSwapLoading}
                  cooperativeGestures={false}
                  attributionCompact={false}
                  mapAttribution={siteConfig.mapAttributionStrip}
                />
              </MapErrorBoundary>
            </>
          )}
        </div>

        {/* ===== INSTRUMENT COLUMN (PA standard) — identity card + instrument chassis
            (metric → year → legend → count). Identity always renders; the chassis waits
            for the year's data. ===== */}
        <div className="pa-float pa-column">
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Dwelling Units" />
          </section>

          {gj && (
            <section className="pa-card pa-card-instrument">
              {/* METRIC — the four flat metrics as the shared SegmentedControl (icon chips). */}
              <div className="pa-col-mod pa-col-metric">
                <SegmentedControl
                  label="Metric"
                  options={METRICS}
                  value={metricKey}
                  onChange={setMetricKey}
                />
              </div>

              {/* YEAR — a select, not a console slider: Dwelling Units has no console, and a
                  year change is a real per-year FILE swap. */}
              <div className="pa-col-mod pa-col-year">
                <span className="pa-col-lab">Year</span>
                <select
                  className="pa-year-select"
                  aria-label="Year"
                  value={year ?? ""}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* LEGEND — fades on each metric switch (keyed remount), in step with the
                  500ms fill crossfade. Sequential ramp + the categorical status block. */}
              <div className="pa-col-mod pa-col-legend">
                <span className="pa-col-lab">Legend</span>
                <div className="du-legend-fade" key={metricKey}>
                  <Legend
                    title={metricDef.legendLabel}
                    stops={stops}
                    format={metricDef.fmt}
                    horizontal
                    greyTitle="Neighbourhood status"
                    greyStates={LEGEND_STATES}
                  />
                </div>
              </div>

              {/* FOOTER — the neighbourhood count (the universe for this year). */}
              <div className="pa-col-mod pa-col-foot">
                <div className="pa-foot-line">
                  <span className="pa-col-count">{gj.features.length.toLocaleString()} neighbourhoods</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ===== SINGLE-SELECT DETAIL (PA standard) — the right-side float, shown when
            exactly one neighbourhood is selected. Lean vs PA's InfoRail (no sparkline /
            triplet / condo — Dwelling Units has no timeseries or parcel aggregate). ===== */}
        {selectedFeature && (() => {
          const p = selectedFeature;
          const agg = p.polygon_state === "aggregated";
          const notes = [];
          if (p.is_annexation_area) {
            notes.push("Annexation area — annexed, not yet subdivided into neighbourhoods; shown with its own outline.");
          }
          if (!agg) {
            notes.push(p.polygon_state === "suppressed_low_n"
              ? "Fewer than 10 permits — aggregate values suppressed."
              : "No permit data for this neighbourhood.");
          }
          const rows = agg
            ? [
                { k: metricDef.legendLabel, v: metricDef.fmt(p[metricDef.field]) },
                ...(metricDef.field !== "n_permits"
                  ? [{ k: "Residential permits", v: fmtNumber(p.n_permits) }]
                  : []),
              ]
            : [];
          return (
            <DetailPanel
              name={p.display_name}
              sub={p.district ? `${p.district} district` : null}
              notes={notes}
              rows={rows}
              onClear={() => setSelectedId(null)}
            />
          );
        })()}

        {/* UNIFIED SEARCH (PA standard) — the magnifier peek by the map's zoom stack.
            Selecting flies + pins; the text is kept in state (single source of truth). */}
        {gj && (
          <SearchPeek
            names={names}
            value={searchQuery}
            onValueChange={setSearchQuery}
            onSelect={(name) => { flyAndPinByName(name); setSearchQuery(name); }}
          />
        )}

        {/* ABOUT & TIPS — opened by the "i" in the rail. Lean DU index; no §6 honesty
            block (view-only, no selection aggregates). */}
        <MapTipsPopover
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          tips={DU_TIPS}
          honesty={null}
          lastUpdated={manifest?.last_updated}
        />

        {/* DATA & ATTRIBUTION — opened by the database control (bottom-right). */}
        <AttributionPanel open={attribOpen} onClose={() => setAttribOpen(false)} />
      </div>
    </article>
  );
}
