// =============================================================================
// AmenityPointMap.jsx
//
// The reusable Family-1 amenity POINT map. ONE generic component renders ANY amenity
// point layer — its file, label, category field, category domain, coverage and currency
// all come from the amenities manifest (refresh-by-design; no data literal here). Adding a
// ninth point layer is a manifest entry + a route line, not a new component.
//
// Forked from the Business Census point map (the site's one visual language): the shared
// MapView mount, the pitched home camera (mapCamera), hover-preview / click-pin into the
// detail rail, the violet selection ring, and the dark-casing dot construction
// (amenityPointStyle). NOT forked: the KDE surface, LCLQ, the donut wheel, the console —
// an inventory needs none of them (the survey's dead-weight list).
//
// SINGLE-SYMBOL PATH is first-class: a layer with no category field (bus_stops, lrt_stops,
// police_stations, track_sports_fields) renders ONE symbol and shows NO legend.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import MapView from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import AmenityInfoRail from "./AmenityInfoRail.jsx";
import AmenityLegend from "./AmenityLegend.jsx";
import {
  BASEMAP_STYLE, MAP_VIEW, SOURCE_ID, DOT_LAYER_ID, SELECT_LAYER_ID,
  buildColourExpression, categoryColours, categoryFilter, dotLayer, selectLayer,
} from "./amenityPointStyle.js";

const MANIFEST_URL = assetUrl("/data/amenities/manifest.json");
const labelFor = (k) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function AmenityPointMap({ layerId }) {
  const [entry, setEntry] = useState(null);       // this layer's manifest record
  const [fetchError, setFetchError] = useState(null);
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null); // { id, props } — pinned
  const [hovered, setHovered] = useState(null);   // { id, props } — hover preview
  const [active, setActive] = useState(null);     // Set of shown categories (legend filter)

  // ── Manifest: find THIS layer's record (label, file, category field + domain,
  //    coverage, currency). No data literal — everything is read from the manifest. ──
  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((m) => {
        if (cancelled) return;
        const rec = m.layers?.find((L) => L.id === layerId);
        if (!rec) throw new Error(`Layer "${layerId}" not in the amenities manifest.`);
        setEntry(rec);
        setActive(new Set(rec.categories || []));   // all categories shown initially
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [layerId]);

  const categoryField = entry?.categoryField || "";
  const categories = entry?.categories || [];
  const legendItems = useMemo(() => categoryColours(categories), [entry]); // eslint-disable-line react-hooks/exhaustive-deps

  const geojsonUrl = entry ? assetUrl(`/data/amenities/${entry.file}`) : null;
  // The dot + ring, coloured from the manifest's category domain. Built once the entry
  // exists, so MapView adds them already-coloured (no post-hoc setPaintProperty).
  const layers = useMemo(
    () => (entry ? [selectLayer(), dotLayer(buildColourExpression(categoryField, categories))] : null),
    [entry],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    document.title = entry ? `${entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry]);

  // ── Map load: lift the points above the basemap, land the home camera, add recentre ──
  const firstHomeRef = useRef(true);
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__amenityMap = m;
    // Points sit ABOVE all basemap layers (MapView inserts data layers below labels).
    for (const id of [SELECT_LAYER_ID, DOT_LAYER_ID]) if (m.getLayer(id)) m.moveLayer(id);
    applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: !firstHomeRef.current });
    firstHomeRef.current = false;
    if (!recentreAddedRef.current) {
      m.addControl(makeIconButtonControl({
        svg: railGlyph(ICON_RECENTRE),
        label: "Return to home view",
        onClick: () => applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: true }),
      }), "top-right");
      recentreAddedRef.current = true;
    }
  }

  // ── Hover-preview + click-pin (the InfoRail owns both readings) ──────────────
  useEffect(() => {
    if (!map) return undefined;
    let lastHoverId = null;
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      if (f.id === lastHoverId) return;   // same dot → no state change (smooth scanning)
      lastHoverId = f.id;
      setHovered({ id: f.id, props: f.properties });
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      lastHoverId = null;
      setHovered(null);
    }
    function onSelect(e) {
      if (!e.features?.length) return;
      const f = e.features[0];
      setSelected({ id: f.id, props: f.properties });
    }
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      if (!map.queryRenderedFeatures(box, { layers: [DOT_LAYER_ID] }).length) setSelected(null);
    }
    map.on("mousemove", DOT_LAYER_ID, onMove);
    map.on("mouseleave", DOT_LAYER_ID, onLeave);
    map.on("click", DOT_LAYER_ID, onSelect);
    map.on("click", onDismiss);
    return () => {
      map.off("mousemove", DOT_LAYER_ID, onMove);
      map.off("mouseleave", DOT_LAYER_ID, onLeave);
      map.off("click", DOT_LAYER_ID, onSelect);
      map.off("click", onDismiss);
    };
  }, [map]);

  // Ring the pinned point (the select layer's filter → the pinned feature id).
  useEffect(() => {
    if (!map || !map.getLayer(SELECT_LAYER_ID)) return;
    try {
      const id = selected?.id;
      map.setFilter(SELECT_LAYER_ID, ["==", ["id"], id != null ? id : -1]);
    } catch { /* map tearing down */ }
  }, [map, selected, layers]);

  // Category show/hide: the legend selection filters the dot layer (removes hidden points
  // from render AND hit-test — never opacity:0, directive §6).
  useEffect(() => {
    if (!map || !active || !map.getLayer(DOT_LAYER_ID)) return;
    try {
      map.setFilter(DOT_LAYER_ID, categoryFilter(categoryField, [...active], categories.length));
    } catch { /* map tearing down */ }
  }, [map, active, categoryField, categories.length, layers]);

  function toggleCategory(cat) {
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
    // A pin whose category is being hidden points at nothing — clear it (BC's rule).
    if (active?.has(cat) && selected?.props?.[categoryField] === cat) setSelected(null);
  }

  // ── Currency + coverage (from the manifest — no date literal, §8) ────────────
  const currency = entry
    ? `Updated ${entry.sourceUpdatedAt || entry.fetchedAt} · ${entry.featureCount.toLocaleString()} locations`
    : "";
  const gap = entry?.coverage?.withoutGeometry || 0;
  const coverage = gap > 0
    ? `${entry.coverage.withGeometry.toLocaleString()} of ${(entry.coverage.withGeometry + gap).toLocaleString()} mapped (${gap.toLocaleString()} without a location)`
    : null;

  const detail = hovered ?? selected;

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data"
              body="The amenity data failed to load. Try refreshing the page." />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={geojsonUrl}
                    view={MAP_VIEW}
                    sourceId={SOURCE_ID}
                    sourceOptions={{ generateId: true }}
                    layers={layers}
                    onLoad={handleMapLoad}
                    cooperativeGestures={false}
                    mapAttribution={siteConfig.mapAttributionStrip}
                  />
                </MapErrorBoundary>
              )}
            </>
          )}
        </div>

        {layers && (
          <AmenityInfoRail
            selected={detail?.props ?? null}
            pinned={hovered == null && selected != null}
            onClear={() => setSelected(null)}
            categoryField={categoryField}
            categoryLabel={categoryField ? labelFor(categoryField) : null}
          />
        )}

        {entry && (
          <div className="pa-float pa-column pa-column-lean">
            <section className="pa-card pa-card-identity">
              <IdentityCard title={entry.label} />
            </section>

            {categoryField && active && (
              <section className="pa-card pa-card-instrument">
                <AmenityLegend
                  title={labelFor(categoryField)}
                  items={legendItems}
                  active={active}
                  onToggle={toggleCategory}
                />
              </section>
            )}

            <section className="pa-card">
              <p className="pa-box-cite" style={{ margin: 0 }}>{currency}</p>
              {coverage && (
                <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>{coverage}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
