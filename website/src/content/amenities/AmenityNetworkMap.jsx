// =============================================================================
// AmenityNetworkMap.jsx
//
// Family N — the LRT NETWORK. Two sources: the coloured ROUTE LINES (lrt_lines) via MapView,
// and the STATION NODES (lrt_stops) added imperatively ON TOP in an effect (the established
// "primary source via MapView + secondary via addSource in onLoad" pattern). Reads the station
// layer's label/currency from the amenities manifest. A separate component (not a branch) — one
// component per map type (§7). The line legend shows the three lines + their system-map colours.
//
// title / selectorNode (OPTIONAL, injected by AmenitySection when this is one VIEW of a
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
  N_LINES_SRC, N_LINE_CASING_ID, N_LINE_ID, N_STATIONS_SRC, N_NODE_ID, N_INTERCHANGE_ID, N_GLYPH_ID, N_SELECT_ID,
  lineCasingLayer, lineLayer, nodeLayer, interchangeLayer, nodeGlyphLayer, nodeSelectLayer, deriveLineLegend,
} from "./amenityNetworkStyle.js";
import { loadAmenityIcons } from "./amenityGlyphs.js";

const MANIFEST_URL = assetUrl("/data/amenities/manifest.json");
const LINES_URL    = assetUrl("/data/amenities/lrt_lines.geojson");

export default function AmenityNetworkMap({ layerId, idField = "lrt_stop_number", title, selectorNode }) {
  const [entry, setEntry] = useState(null);       // the STATION layer's manifest record
  const [fetchError, setFetchError] = useState(null);
  const [linesGj, setLinesGj] = useState(null);   // the route lines (legend)
  const [stationsGj, setStationsGj] = useState(null);
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL).then((r) => r.json()).then((m) => {
      if (cancelled) return;
      const rec = m.layers?.find((L) => L.id === layerId);
      if (!rec) throw new Error(`Layer "${layerId}" not in the amenities manifest.`);
      setEntry(rec);
      return fetch(assetUrl(`/data/amenities/${rec.file}`)).then((r) => r.json())
        .then((gj) => { if (!cancelled) setStationsGj(gj); });
    }).catch((err) => { if (!cancelled) setFetchError(err.message); });
    fetch(LINES_URL).then((r) => r.json()).then((gj) => { if (!cancelled) setLinesGj(gj); })
      .catch((err) => console.error("[AmenityNetworkMap] lines load:", err.message));
    return () => { cancelled = true; };
  }, [layerId]);

  const lineLegend = useMemo(() => deriveLineLegend(linesGj), [linesGj]);
  // The lines are the MapView source; the two line layers ride on it.
  const layers = useMemo(() => (linesGj ? [lineCasingLayer(), lineLayer()] : null), [linesGj]);

  useEffect(() => {
    document.title = entry ? `${title ?? entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry, title]);

  const firstHomeRef = useRef(true);
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__amenityMap = m;
    for (const id of [N_LINE_CASING_ID, N_LINE_ID]) if (m.getLayer(id)) m.moveLayer(id);
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

  // Add the STATION nodes on top of the lines once both the map and the stations are ready.
  useEffect(() => {
    if (!map || !stationsGj) return;
    try {
      if (!map.getSource(N_STATIONS_SRC)) {
        map.addSource(N_STATIONS_SRC, { type: "geojson", data: stationsGj, promoteId: idField });
      }
      for (const layer of [nodeSelectLayer(), nodeLayer(), interchangeLayer()]) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
      for (const id of [N_SELECT_ID, N_NODE_ID, N_INTERCHANGE_ID]) if (map.getLayer(id)) m_move(map, id);
      // The cream rail-light glyph rides on top of the nodes — load the icons THEN add it (no flash).
      loadAmenityIcons(map).then(() => {
        if (map.getSource(N_STATIONS_SRC) && !map.getLayer(N_GLYPH_ID)) {
          map.addLayer(nodeGlyphLayer());
          map.moveLayer(N_GLYPH_ID);
        }
      }).catch(() => { /* icons failed → nodes read without the glyph */ });
    } catch { /* map tearing down */ }
  }, [map, stationsGj, idField]);

  // Interaction: hover/click a station node (or the interchange) → the detail rail + ring.
  useEffect(() => {
    if (!map) return undefined;
    let lastHoverId = null;
    function onMove(e) {
      const f = e.features?.[0]; if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (f.id === lastHoverId) return;
      lastHoverId = f.id;
      setHovered({ id: f.id, props: f.properties });
    }
    function onLeave() { map.getCanvas().style.cursor = ""; lastHoverId = null; setHovered(null); }
    function onClick(e) { const f = e.features?.[0]; if (f) setSelected({ id: f.id, props: f.properties }); }
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      if (!map.queryRenderedFeatures(box, { layers: [N_NODE_ID, N_INTERCHANGE_ID] }).length) setSelected(null);
    }
    for (const id of [N_NODE_ID, N_INTERCHANGE_ID]) {
      map.on("mousemove", id, onMove); map.on("mouseleave", id, onLeave); map.on("click", id, onClick);
    }
    map.on("click", onDismiss);
    return () => {
      for (const id of [N_NODE_ID, N_INTERCHANGE_ID]) {
        map.off("mousemove", id, onMove); map.off("mouseleave", id, onLeave); map.off("click", id, onClick);
      }
      map.off("click", onDismiss);
    };
  }, [map, stationsGj]);

  useEffect(() => {
    if (!map || !map.getLayer(N_SELECT_ID)) return;
    try { map.setFilter(N_SELECT_ID, ["==", ["id"], selected?.id != null ? selected.id : -1]); }
    catch { /* map tearing down */ }
  }, [map, selected, stationsGj]);

  const currency = entry
    ? (entry.sourceUpdatedAt ? `Updated ${entry.sourceUpdatedAt}` : `Fetched ${entry.fetchedAt}`)
    : "";
  const detail = hovered ?? selected;

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data"
              body="The LRT data failed to load. Try refreshing the page." />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={LINES_URL}
                    view={MAP_VIEW}
                    sourceId={N_LINES_SRC}
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
                module of the console). Absent on the standalone route. */}
            {selectorNode && (
              <section className="pa-card pa-card-instrument">
                <div className="pa-col-mod pa-col-metric">{selectorNode}</div>
              </section>
            )}

            {lineLegend.length > 0 && (
              <section className="pa-card pa-card-instrument">
                <div className="pa-col-mod pa-col-legend">
                  <div className="pa-col-lab">LRT Lines</div>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                    {lineLegend.map(({ line, colour }) => (
                      <li key={line} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--t-xs)" }}>
                        <span aria-hidden="true" style={{ width: 18, height: 4, borderRadius: 2, background: colour, boxShadow: "0 0 0 1px #14101822" }} />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <section className="pa-card">
              <p className="pa-box-cite" style={{ margin: 0 }}>{currency}</p>
              <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>
                {`${entry.featureCount} stops across ${lineLegend.length || 3} lines. Each dot is one stop record; Churchill (the interchange) is drawn larger.`}
              </p>
              {/* The interaction prompt, homed in the console (D10a — was a detached float). */}
              <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>Hover a station for a reading; click to pin it.</p>
            </section>
          </div>
        )}
      </div>
    </article>
  );
}

// Small helper: move a layer to the top (kept out of the effect body for readability).
function m_move(map, id) { map.moveLayer(id); }
