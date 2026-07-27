// =============================================================================
// AmenityDensityMap.jsx
//
// Family D — a DENSE amenity point layer (bus stops). Reads its file/label/currency from the
// SAME amenities manifest as AmenityPointMap, but renders the heatmap → cluster → point stages
// (amenityDensityStyle) instead of a single disc, because 6,882 constant dots destroy the
// basemap at overview (D2). A SEPARATE component (not a branch of AmenityPointMap) because the
// clustered source + heatmap + cluster-expand interaction are a genuinely different map — one
// component, one map type, so Olivia can follow each (§7). Shares the chrome: MapView, the
// pitched home camera, the detail rail, the recentre control.
//
// idField = the layer's unique property (bus stops: stop_id), promoted to the MapLibre feature
// id so the pin ring + hover key off it on a clustered source.
//
// title / selectorNode (OPTIONAL, injected by AmenitySection when this map is one VIEW of a
// consolidated section): `title` overrides the column/tab title to the SECTION name; `selectorNode`
// is the shared view <SegmentedControl>, rendered as the top module of the console column. Absent
// on the standalone route → unchanged behaviour.
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
import { BASEMAP_STYLE, MAP_VIEW } from "./amenityPointStyle.js";
import {
  D_SOURCE_ID, D_HEAT_ID, D_CLUSTER_ID, D_CLUSTER_COUNT_ID, D_POINT_ID, D_SELECT_ID, D_SOURCE_OPTIONS,
  heatLayer, clusterLayer, clusterCountLayer, densityPointLayer, densitySelectLayer,
} from "./amenityDensityStyle.js";

const MANIFEST_URL = assetUrl("/data/amenities/manifest.json");

export default function AmenityDensityMap({ layerId, idField = "stop_id", title, selectorNode }) {
  const [entry, setEntry] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null);   // { id, props } — pinned stop
  const [hovered, setHovered] = useState(null);      // { id, props } — hover preview

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((m) => {
        if (cancelled) return;
        const rec = m.layers?.find((L) => L.id === layerId);
        if (!rec) throw new Error(`Layer "${layerId}" not in the amenities manifest.`);
        setEntry(rec);
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [layerId]);

  const geojsonUrl = entry ? assetUrl(`/data/amenities/${entry.file}`) : null;
  const sourceOptions = useMemo(() => ({ ...D_SOURCE_OPTIONS, promoteId: idField }), [idField]);
  // Stack bottom→top: heatmap · selection ring · cluster discs · stops · cluster counts.
  const layers = useMemo(
    () => (entry ? [heatLayer(), densitySelectLayer(), clusterLayer(), densityPointLayer(), clusterCountLayer()] : null),
    [entry],
  );

  useEffect(() => {
    document.title = entry ? `${title ?? entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry, title]);

  const firstHomeRef = useRef(true);
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__amenityMap = m;
    for (const id of [D_HEAT_ID, D_SELECT_ID, D_CLUSTER_ID, D_POINT_ID, D_CLUSTER_COUNT_ID])
      if (m.getLayer(id)) m.moveLayer(id);
    applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: !firstHomeRef.current });
    firstHomeRef.current = false;
    if (!recentreAddedRef.current) {
      m.addControl(makeIconButtonControl({
        svg: railGlyph(ICON_RECENTRE), label: "Return to home view",
        onClick: () => applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: true }),
      }), "top-right");
      recentreAddedRef.current = true;
    }
  }

  // Interaction: a CLUSTER click zooms to its expansion; a STOP click pins it in the rail; a
  // stop hover previews it; a click on empty clears the pin.
  useEffect(() => {
    if (!map) return undefined;
    let lastHoverId = null;
    function onClusterClick(e) {
      const f = e.features?.[0]; if (!f) return;
      const src = map.getSource(D_SOURCE_ID);
      src.getClusterExpansionZoom(f.properties.cluster_id, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: f.geometry.coordinates, zoom: zoom + 0.2 });
      });
    }
    function onPointMove(e) {
      const f = e.features?.[0]; if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (f.id === lastHoverId) return;
      lastHoverId = f.id;
      setHovered({ id: f.id, props: f.properties });
    }
    function onPointLeave() { map.getCanvas().style.cursor = ""; lastHoverId = null; setHovered(null); }
    function onPointClick(e) {
      const f = e.features?.[0]; if (!f) return;
      setSelected({ id: f.id, props: f.properties });
    }
    function onClusterEnter() { map.getCanvas().style.cursor = "pointer"; }
    function onClusterLeave() { map.getCanvas().style.cursor = ""; }
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      const hit = map.queryRenderedFeatures(box, { layers: [D_POINT_ID, D_CLUSTER_ID] });
      if (!hit.length) setSelected(null);
    }
    map.on("click", D_CLUSTER_ID, onClusterClick);
    map.on("mouseenter", D_CLUSTER_ID, onClusterEnter);
    map.on("mouseleave", D_CLUSTER_ID, onClusterLeave);
    map.on("mousemove", D_POINT_ID, onPointMove);
    map.on("mouseleave", D_POINT_ID, onPointLeave);
    map.on("click", D_POINT_ID, onPointClick);
    map.on("click", onDismiss);
    return () => {
      map.off("click", D_CLUSTER_ID, onClusterClick);
      map.off("mouseenter", D_CLUSTER_ID, onClusterEnter);
      map.off("mouseleave", D_CLUSTER_ID, onClusterLeave);
      map.off("mousemove", D_POINT_ID, onPointMove);
      map.off("mouseleave", D_POINT_ID, onPointLeave);
      map.off("click", D_POINT_ID, onPointClick);
      map.off("click", onDismiss);
    };
  }, [map]);

  // Ring the pinned stop (keyed on the promoted feature id).
  useEffect(() => {
    if (!map || !map.getLayer(D_SELECT_ID)) return;
    try {
      const id = selected?.id;
      map.setFilter(D_SELECT_ID, ["==", ["id"], id != null ? id : -1]);
    } catch { /* map tearing down */ }
  }, [map, selected, layers]);

  const currency = entry
    ? (entry.sourceUpdatedAt
        ? `Updated ${entry.sourceUpdatedAt} · ${entry.featureCount.toLocaleString()} stops`
        : `Fetched ${entry.fetchedAt} · ${entry.featureCount.toLocaleString()} stops`)
    : "";
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
                    sourceId={D_SOURCE_ID}
                    sourceOptions={sourceOptions}
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
            categoryField=""
          />
        )}

        {entry && (
          <div className="pa-float pa-column pa-column-lean">
            <section className="pa-card pa-card-identity">
              <IdentityCard title={title ?? entry.label} />
            </section>
            {/* View switch — the section's shared selector, injected by AmenitySection (the top
                module of the console, PA's metric-module home). Absent on the standalone route. */}
            {selectorNode && (
              <section className="pa-card pa-card-instrument">
                <div className="pa-col-mod pa-col-metric">{selectorNode}</div>
              </section>
            )}
            <section className="pa-card">
              <p className="pa-box-cite" style={{ margin: 0 }}>{currency}</p>
              <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>
                Coverage as a heatmap when zoomed out; clusters, then individual stops as you zoom in.
              </p>
              {/* The interaction prompt, homed in the console (D10a — was a detached float). */}
              <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>Hover a stop for a reading; click to pin it.</p>
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
