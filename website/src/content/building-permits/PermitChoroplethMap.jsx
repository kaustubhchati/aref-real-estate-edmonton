// =============================================================================
// PermitChoroplethMap.jsx
//
// The Dwelling Units choropleth route ("/activity/dwelling-units"), STANDARDIZED to
// the Property Assessment instrument (the website standard for neighbourhood
// aggregates): the immersive full-bleed canvas, the .pa-float instrument column
// (identity → metric → year → legend → count), the shared right rail, SearchPeek,
// the About & tips popover, the Data & attribution panel, and the single-select
// DetailPanel.
//
// COMBINED-FILE MODEL (mirrors PA — the foundation for the Analysis Data Console):
//   • Loads ONE combined all-years GeoJSON (02b) — geometry once, every year's values
//     as flat <field>_<year> props. A YEAR change is a PAINT SWAP (applyPermitYearMetric
//     on <field>_<year>), not a file reload; a METRIC change is the same paint swap.
//     (Retired: the per-year file fetch + the two-layer a/b opacity crossfade.)
//   • `gjView = projectYearCollection(gj, year)` is the bare-named view for the active
//     year that the JS-side consumers read (stops, search, detail, popups).
//
// Metric UI: four FLAT metric buttons (Permit Count, Construction Value, Dwellings
// Added / Demolished — the %-YoY-of-permit-counts metric was dropped, not logical).
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_all_years.geojson
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
  choroplethLayers,
  applyPermitYearMetric,
  buildPopupHtml,
  FILL_LAYER_ID,
  LEGEND_STATES,
} from "./permitChoroplethStyle.js";
import {
  loadPermitManifest,
  permitYears,
  permitDefaultYear,
  resolveCombinedPermitUrl,
  projectYearCollection,
  projectYearProps,
} from "./dataSources.js";
import { fmtNumber } from "../../utils/format.js";
import { reduceMotion } from "../../components/motion.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE, ICON_INFO, ICON_DATABASE, ICON_MOUSE, ICON_CLICK, ICON_SEARCH } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";

const SOURCE_ID = "pnbhd";
// The combined all-years file is a stable URL — the year is a paint swap, not a path.
const COMBINED_URL = resolveCombinedPermitUrl();

// This map's "How to Use" index — the lean View subset (no console/sliders yet).
const DU_TIPS = [
  { key: "scroll", glyph: <Glyph body={ICON_MOUSE} />, body: <>Scroll to Zoom</> },
  { key: "click",  glyph: <Glyph body={ICON_CLICK} />, body: <>Click to Select a Neighbourhood</> },
  { key: "search", glyph: <Glyph body={ICON_SEARCH} />, body: <>Search to Find a Neighbourhood and Fly to It</> },
];

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
// .pa-float overlay (only pads while it's an absolute overlay — desktop).
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
  const [gj, setGj] = useState(null);          // the combined all-years file (loaded once)
  const [fetchError, setFetchError] = useState(null);

  // Shared-chrome state (mirrors PA): tips popover, attribution panel, unified search
  // text, and the single SELECTED neighbourhood (its id — detail float + pin derive).
  const [infoOpen, setInfoOpen] = useState(false);
  const [attribOpen, setAttribOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const metricDef = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

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

  // The active-year bare-named projection of the combined file — the JS-side view every
  // consumer reads (stops, search, detail). Geometry shared by reference (cheap per year).
  const gjView = useMemo(() => projectYearCollection(gj, year), [gj, year]);

  // Ramp stops for the active metric, from the active year's projected view.
  const stops = useMemo(
    () => metricStops(gjView, metricDef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gjView, metricKey]
  );

  // The selected neighbourhood's LIVE (active-year) props — from gjView, so a year swap
  // refreshes the detail float with the new year's data.
  const selectedFeature = useMemo(() => {
    if (selectedId == null || !gjView) return null;
    const f = findFeatureById(gjView, selectedId);
    return f ? f.properties : null;
  }, [selectedId, gjView]);

  // Search datalist names — every neighbourhood (display_name is year-invariant).
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
  const gjRef = useRef(gj);   // the raw combined file (dblclick fly-to lookup)
  useEffect(() => { gjRef.current = gj; }, [gj]);

  useEffect(() => {
    if (year == null) return undefined;
    document.title = `Dwelling Units · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
  }, [year]);

  // Fetch the combined file ONCE (a year change is a paint swap, not a fetch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchError(null);
    let cancelled = false;
    fetch(COMBINED_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  function handleMapLoad(m) { setMap(m); }

  // Paint swap — year OR metric OR stops change repaints the ONE fill layer + re-filters
  // the state outlines for the new year, in place (no data reload). Mirrors PA.
  useEffect(() => {
    if (!map) return;
    applyPermitYearMetric(map, metricDef, year, stops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, metricKey, year, stops]);

  // Sync the PINNED feature-state to the React selection (selectedId).
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

  // Hover (900ms popup) + click-to-SELECT, installed once per map. The popup reads the
  // PROJECTED (bare-name) props for the active year — the raw source props are
  // year-suffixed, so we project the hovered feature before building the popup.
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
                projectYearProps(f.properties, yearRef.current), false,
                yearRef.current, metricRef.current))
              .addTo(map);
          }
        }, 900);
      }
    }

    function onLeave() { clearHover(); }

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

  // ---- Right rail (shared chrome): recentre / info / database ----------------
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Search → fly + select (mirrors PA's flyAndPinByName).
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
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState
              title="Could not load data"
              body="The dwelling-unit aggregates failed to load. Try refreshing the page."
            />
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
                  cooperativeGestures={false}
                  attributionCompact={false}
                  mapAttribution={siteConfig.mapAttributionStrip}
                />
              </MapErrorBoundary>
            </>
          )}
        </div>

        {/* ===== INSTRUMENT COLUMN (PA standard) ===== */}
        <div className="pa-float pa-column">
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Dwelling Units" />
          </section>

          {gjView && (
            <section className="pa-card pa-card-instrument">
              <div className="pa-col-mod pa-col-metric">
                <SegmentedControl
                  label="Metric"
                  options={METRICS}
                  value={metricKey}
                  onChange={setMetricKey}
                />
              </div>

              {/* YEAR — a select (a paint swap now, not a file swap). The Data Console
                  (Phase 3) re-homes this to a slider; kept as a select while View-only. */}
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

              <div className="pa-col-mod pa-col-foot">
                <div className="pa-foot-line">
                  <span className="pa-col-count">{gjView.features.length.toLocaleString()} neighbourhoods</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ===== SINGLE-SELECT DETAIL (PA standard) ===== */}
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

        {/* UNIFIED SEARCH (PA standard) */}
        {gj && (
          <SearchPeek
            names={names}
            value={searchQuery}
            onValueChange={setSearchQuery}
            onSelect={(name) => { flyAndPinByName(name); setSearchQuery(name); }}
          />
        )}

        {/* ABOUT & TIPS */}
        <MapTipsPopover
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          tips={DU_TIPS}
          honesty={null}
          lastUpdated={manifest?.last_updated}
        />

        {/* DATA & ATTRIBUTION */}
        <AttributionPanel open={attribOpen} onClose={() => setAttribOpen(false)} />
      </div>
    </article>
  );
}
