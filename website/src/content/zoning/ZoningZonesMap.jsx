// =============================================================================
// ZoningZonesMap.jsx — View 1 of the Zoning section: the base-zone FAMILY map.
//
// Named for the VIEW, not the section (the Business Census naming-trap lesson:
// BusinessCensusMap vs BusinessCensusSection serve different routes; explicit
// view-named files stop that recurring). The section shell (ZoningSection)
// mounts this; View 2 (Overlays, v1.1) will be its own component — adding it
// must not touch this file.
//
// The map: 11,518 zoning parcels flat-filled by their family in the
// ALGORITHMICALLY DERIVED banded palette (zoningStyle.js — the frozen _oneshot
// derivation is the spec), the dissolved family boundaries at district zoom,
// family-tinted parcel hairlines at parcel zoom, the city-limit line, and a
// per-instance ground treatment that mutes the basemap under the fill. The
// HIGHLIGHT REGISTER rides feature-state: hover = lightness-lifted fill +
// near-white casing (preview); selected = near-black casing (commitment).
// Everything data-driven from the zoning manifest — no family/year literal here.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import MapView, { findFirstSymbolLayerId } from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import CategoricalPolygonLegend from "../../components/CategoricalPolygonLegend.jsx";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE } from "../../components/mapIcons.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";
import {
  BASEMAP_STYLE, MAP_VIEW, SOURCE_ID, BOUNDS_SOURCE_ID, LIMIT_SOURCE_ID,
  FILL_ID, HAIRLINE_ID,
  buildZoningDomain, zoningFillLayers, familyLineLayer, hairlineLayer,
  cityLimitLayer, applyZoningGround, buildFillPaint, zoningLineTint,
} from "./zoningStyle.js";

const MANIFEST_URL = assetUrl("/data/zoning/manifest.json");

export default function ZoningZonesMap({ title, selectorNode, cameraRef }) {
  const [entry, setEntry] = useState(null);        // the zoning_bylaw manifest record
  const [boundsFile, setBoundsFile] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState(null);  // { id, props } — pinned parcel
  const [hovered, setHovered] = useState(null);    // props — hover preview
  const [isolated, setIsolated] = useState(null);  // family key ISOLATED via the legend, or null

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((m) => {
        if (cancelled) return;
        const bylaw = m.layers?.find((L) => L.id === "zoning_bylaw");
        if (!bylaw) throw new Error('Layer "zoning_bylaw" not in the zoning manifest.');
        setEntry(bylaw);
        setBoundsFile(m.layers?.find((L) => L.id === "zoning_family_boundaries")?.file ?? null);
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Families ordered by AREA SHARE desc, styled from the derived table.
  const domain = useMemo(() => (entry ? buildZoningDomain(entry) : null), [entry]);
  const layers = useMemo(
    () => (domain ? [...zoningFillLayers(domain), hairlineLayer(domain)] : null),
    [domain],
  );

  useEffect(() => {
    document.title = entry ? `${title ?? entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry, title]);

  // ── Map load: bounds source + family lines, ground treatment, camera ─────────
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__zoningMap = m;
    const firstSymbol = findFirstSymbolLayerId(m);
    // The family-boundary rung rides its OWN source (the dissolved backend emit),
    // so it is added here, not via MapView's single-source layers prop.
    if (boundsFile && !m.getSource(BOUNDS_SOURCE_ID)) {
      m.addSource(BOUNDS_SOURCE_ID, { type: "geojson", data: assetUrl(`/data/zoning/${boundsFile}`) });
      m.addLayer(familyLineLayer(), firstSymbol);
    }
    // The city-limit line: the island's edge, named. Added before the ground
    // treatment so the promoted roads/water draw over it.
    if (!m.getSource(LIMIT_SOURCE_ID)) {
      m.addSource(LIMIT_SOURCE_ID, { type: "geojson", data: assetUrl("/geo/edmonton_boundary.geojson") });
      m.addLayer(cityLimitLayer(), firstSymbol);
    }
    // Per-instance ground: mute basemap land-use, lighten, promote water + white
    // streets over the fill (contained to this map — applyDeepenedGround precedent).
    applyZoningGround(m, firstSymbol);
    // Land on the section camera: the shell preserves it across views (v1.1 seam);
    // first entry uses the shared home preset.
    applyCameraPreset(m, cameraRef?.current ?? HOME_VIEW.Edmonton, { ease: false });
    if (!recentreAddedRef.current) {
      m.addControl(makeIconButtonControl({
        svg: railGlyph(ICON_RECENTRE),
        label: "Return to home view",
        onClick: () => applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: true }),
      }), "top-right");
      recentreAddedRef.current = true;
    }
  }

  // Preserve the camera for the section shell (view switches keep the frame).
  useEffect(() => {
    if (!map || !cameraRef) return undefined;
    const save = () => {
      cameraRef.current = {
        center: map.getCenter().toArray(),
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
    };
    map.on("moveend", save);
    return () => { map.off("moveend", save); };
  }, [map, cameraRef]);

  // ── Hover + click-pin ride FEATURE-STATE (the highlight register, §3):
  //    hover lifts the fill's lightness + draws the near-white preview casing;
  //    a click pins the near-black commitment casing. setFeatureState only —
  //    the layer is never re-styled per interaction.
  useEffect(() => {
    if (!map) return undefined;
    let lastHoverId = null;
    const setHoverFs = (id) => {
      if (id === lastHoverId) return;
      try {
        if (lastHoverId != null) map.setFeatureState({ source: SOURCE_ID, id: lastHoverId }, { hover: false });
        if (id != null) map.setFeatureState({ source: SOURCE_ID, id }, { hover: true });
      } catch { /* map tearing down */ }
      lastHoverId = id;
    };
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      const f = e.features[0];
      setHoverFs(f.id);
      setHovered(f.properties);
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      setHoverFs(null);
      setHovered(null);
    }
    function onSelect(e) {
      if (!e.features?.length) return;
      const f = e.features[0];
      setSelected({ id: f.id, props: f.properties });
    }
    function onDismiss(e) {
      const box = [[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]];
      if (!map.queryRenderedFeatures(box, { layers: [FILL_ID] }).length) setSelected(null);
    }
    map.on("mousemove", FILL_ID, onMove);
    map.on("mouseleave", FILL_ID, onLeave);
    map.on("click", FILL_ID, onSelect);
    map.on("click", onDismiss);
    return () => {
      map.off("mousemove", FILL_ID, onMove);
      map.off("mouseleave", FILL_ID, onLeave);
      map.off("click", FILL_ID, onSelect);
      map.off("click", onDismiss);
    };
  }, [map]);

  // Selection state → the commitment casing (persists until cleared).
  const lastSelectedRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    try {
      if (lastSelectedRef.current != null) {
        map.setFeatureState({ source: SOURCE_ID, id: lastSelectedRef.current }, { selected: false });
      }
      if (selected?.id != null) {
        map.setFeatureState({ source: SOURCE_ID, id: selected.id }, { selected: true });
      }
      lastSelectedRef.current = selected?.id ?? null;
    } catch { /* map tearing down */ }
  }, [map, selected]);

  // Legend ISOLATE: the picked family paints at its Band-C iso (a figure state);
  // the remainder drops to the oriented neutrals. A RECOLOUR via buildFillPaint —
  // the hover lift composes on top through feature-state, so a hovered parcel in
  // isolate previews its true family colour.
  useEffect(() => {
    if (!map || !domain || !map.getLayer(FILL_ID)) return;
    try {
      map.setPaintProperty(FILL_ID, "fill-color", buildFillPaint(domain, isolated));
      // Parcel hairlines follow the isolate tint; the FAMILY boundary is the
      // constant dark neutral and is never re-tinted (optical pass 6 — the one
      // line that never gives way).
      if (map.getLayer(HAIRLINE_ID)) {
        map.setPaintProperty(HAIRLINE_ID, "line-color", zoningLineTint(domain, isolated));
      }
    } catch { /* map tearing down */ }
  }, [map, isolated, domain, layers]);

  function toggleFamily(key) {
    setIsolated((cur) => (cur === key ? null : key));
  }

  // Currency from the manifest (whose date it is — the amenity honesty rule).
  const currency = entry
    ? (entry.sourceUpdatedAt
        ? `Updated ${entry.sourceUpdatedAt} · ${entry.featureCount.toLocaleString()} zoned parcels`
        : `Fetched ${entry.fetchedAt} · ${entry.featureCount.toLocaleString()} zoned parcels`)
    : "";

  const detail = hovered ?? selected?.props ?? null;

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data"
              body="The zoning data failed to load. Try refreshing the page." />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={assetUrl(`/data/zoning/${entry.file}`)}
                    view={MAP_VIEW}
                    sourceId={SOURCE_ID}
                    sourceOptions={{ generateId: true }}
                    layers={layers}
                    onLoad={handleMapLoad}
                    cooperativeGestures={false}
                    attributionCompact={false}
                    mapAttribution={siteConfig.mapAttributionStrip}
                  />
                </MapErrorBoundary>
              )}
            </>
          )}
        </div>

        {domain && (
          <div className="pa-float pa-column pa-column-lean zoning-console">
            {/* ONE fused card (optical pass 3 §5): the seam KC flagged twice was
                the inter-card gap showing map through — title, selector, legend
                and readout are MODULES of a single card, divided by the console's
                own hairlines, not separate floating cards. */}
            <section className="pa-card pa-card-instrument">
              <div className="pa-col-mod">
                <IdentityCard title={title ?? entry.label} />
              </div>

              {/* View switch — injected by ZoningSection only when it has >1 view. */}
              {selectorNode && <div className="pa-col-mod pa-col-metric">{selectorNode}</div>}

              <CategoricalPolygonLegend
                title="Zone Family"
                note={isolated ? "Click the family again to show all." : "Click a family to isolate it."}
                items={domain}
                active={isolated ? new Set([isolated]) : new Set(domain.map((it) => it.key))}
                onToggle={toggleFamily}
                interaction="isolate"
              />

              <div className="pa-col-mod">
                {detail ? (
                  <>
                    <p className="pa-box-cite" style={{ margin: 0 }}>
                      {detail.zoning}{detail.dc2_sub_area ? ` · Sub-area ${detail.dc2_sub_area}` : ""}
                    </p>
                    {/* When the code's description IS the family name (AJ, DC), one line says it once. */}
                    {detail.description !== detail.zone_family && (
                      <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>{detail.description}</p>
                    )}
                    <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>{detail.zone_family}</p>
                  </>
                ) : (
                  <p className="pa-detail-hint" style={{ margin: 0 }}>
                    Hover a parcel for its zone; click to pin it.
                  </p>
                )}
                <p className="pa-box-cite" style={{ margin: "8px 0 0" }}>{currency}</p>
              </div>
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
