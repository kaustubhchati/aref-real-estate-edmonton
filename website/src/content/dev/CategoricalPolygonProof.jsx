// =============================================================================
// CategoricalPolygonProof.jsx  (scratch route — /dev/categorical-polygon-proof)
//
// PROOF ROUTE, not a product page: mounts the GENERIC categorical polygon
// standard (components/categoricalPolygon.js + CategoricalPolygonLegend) on the
// already-published school-catchment polygons to prove the standard BEFORE
// zoning consumes it (build directive step 5 — §9 step 6 of the ratified
// strategy, satisfied cheaply). It exercises every mechanism zoning needs:
//   • flat class fills via the match expression (5 sch_type classes),
//   • a PATTERN class (SR renders as a hatch — proving the two-layer flat+pattern
//     construction and the pattern-image registration path),
//   • the legend with count rows + click-to-hide (filter, never opacity:0),
//   • hover/click readout of the clicked polygon's properties,
//   • the shared home camera.
// The palette below is PROOF-ONLY (muted area tones, not a ratified design).
// Not in the nav; reachable only by URL. Kept after the proof as the standard's
// living reference mount.
// =============================================================================

import { useEffect, useMemo, useState } from "react";

import MapView from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import CategoricalPolygonLegend from "../../components/CategoricalPolygonLegend.jsx";
import {
  polygonFillLayer, polygonPatternLayer, polygonClassFilter, patternImages,
} from "../../components/categoricalPolygon.js";
import { BASEMAP_STYLE } from "../../components/basemapStyle.js";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";
import { siteConfig } from "../../config/siteConfig.js";
import { assetUrl } from "../../utils/assetUrl.js";

const MANIFEST_URL = assetUrl("/data/amenities/manifest.json");
const SOURCE_ID = "catpoly-proof";
const FILL_ID = "catpoly-proof-fill";
const PATTERN_ID = "catpoly-proof-pattern";
const LINE_ID = "catpoly-proof-line";

// PROOF-ONLY palette — muted area tones so the mechanism (not a design) is what
// is on trial. SR deliberately takes a hatch PATTERN to prove the pattern path.
const PROOF_STYLE = {
  EL:  { colour: "#e8dfc0" },
  EJ:  { colour: "#b9cfa6" },
  JR:  { colour: "#a9c4d9" },
  SR:  { pattern: { kind: "hatch", base: "#cfc9bd", ink: "#7d7669" } },
  EJS: { colour: "#d9a8a0" },
};

const MAP_VIEW = {
  center: HOME_VIEW.Edmonton.center,
  zoom: HOME_VIEW.Edmonton.zoom,
  minZoom: 7,
  maxZoom: 18,
  maxBounds: CITY_BOUNDS.Edmonton,
};

export default function CategoricalPolygonProof() {
  const [entry, setEntry] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [map, setMap] = useState(null);
  const [reading, setReading] = useState(null);   // hovered/clicked feature props
  const [active, setActive] = useState(null);     // Set of shown class keys

  useEffect(() => {
    let cancelled = false;
    fetch(MANIFEST_URL)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((m) => {
        if (cancelled) return;
        const rec = m.layers?.find((L) => L.id === "schools");
        if (!rec) throw new Error('Layer "schools" not in the amenities manifest.');
        setEntry(rec);
        setActive(new Set(rec.categories));
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Domain: manifest classes ordered by count DESC (the polygon-law order),
  // styled from the proof table.
  const items = useMemo(() => {
    if (!entry) return null;
    const counts = entry.categoryCounts || {};
    return [...entry.categories]
      .sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b))
      .map((key) => ({ key, label: key, count: counts[key], ...(PROOF_STYLE[key] ?? { colour: "#c9c2b2" }) }));
  }, [entry]);

  const layers = useMemo(() => {
    if (!items) return null;
    const field = entry.categoryField;
    const pattern = polygonPatternLayer({ id: PATTERN_ID, classField: field, items });
    return [
      polygonFillLayer({ id: FILL_ID, classField: field, items, opacity: 0.85 }),
      ...(pattern ? [pattern] : []),
      // A neutral hairline so catchment edges read on the proof — zoning replaces
      // this with its own zoom-laddered boundary treatment.
      { id: LINE_ID, type: "line", paint: { "line-color": "#8a836f", "line-width": 0.6, "line-opacity": 0.6 } },
    ];
  }, [items, entry]);

  const images = useMemo(() => (items ? patternImages(items) : []), [items]);

  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__catpolyMap = m;
    applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: false });
  }

  // Hover + click readout — the shape of interaction zoning inherits.
  useEffect(() => {
    if (!map) return undefined;
    function onMove(e) {
      if (!e.features?.length) return;
      map.getCanvas().style.cursor = "pointer";
      setReading(e.features[0].properties);
    }
    function onLeave() {
      map.getCanvas().style.cursor = "";
      setReading(null);
    }
    map.on("mousemove", FILL_ID, onMove);
    map.on("mouseleave", FILL_ID, onLeave);
    return () => {
      map.off("mousemove", FILL_ID, onMove);
      map.off("mouseleave", FILL_ID, onLeave);
    };
  }, [map]);

  // Legend toggle → filter both fill layers (pattern layer keeps its own
  // patterned-classes filter AND the visibility filter).
  useEffect(() => {
    if (!map || !active || !items || !map.getLayer(FILL_ID)) return;
    try {
      const f = polygonClassFilter(entry.categoryField, active, items);
      map.setFilter(FILL_ID, f);
      if (map.getLayer(PATTERN_ID)) {
        const patterned = items.filter((it) => it.pattern).map((it) => it.key);
        const own = ["in", ["get", entry.categoryField], ["literal", patterned]];
        map.setFilter(PATTERN_ID, f ? ["all", own, f] : own);
      }
      if (map.getLayer(LINE_ID)) map.setFilter(LINE_ID, f);
    } catch { /* map tearing down */ }
  }, [map, active, items, entry]);

  function toggleClass(key) {
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        <div className="canvas-wrap">
          {fetchError ? (
            <EmptyState title="Could not load data" body={fetchError} />
          ) : (
            <>
              {!layers && <MapSkeleton />}
              {layers && (
                <MapErrorBoundary>
                  <MapView
                    className="canvas"
                    basemapStyle={BASEMAP_STYLE}
                    geojsonUrl={assetUrl(`/data/amenities/${entry.file}`)}
                    view={MAP_VIEW}
                    sourceId={SOURCE_ID}
                    layers={layers}
                    images={images}
                    onLoad={handleMapLoad}
                    cooperativeGestures={false}
                    mapAttribution={siteConfig.mapAttributionStrip}
                  />
                </MapErrorBoundary>
              )}
            </>
          )}
        </div>

        {items && active && (
          <div className="pa-float pa-column pa-column-lean">
            <section className="pa-card pa-card-identity">
              <IdentityCard title="Categorical Polygon Proof" />
            </section>
            <section className="pa-card pa-card-instrument">
              <CategoricalPolygonLegend
                title="School Catchment Type (proof palette)"
                note="Scratch route — proves the generic standard on schools before zoning consumes it. SR is deliberately a hatch."
                items={items}
                active={active}
                onToggle={toggleClass}
              />
            </section>
            <section className="pa-card">
              {reading ? (
                <>
                  <p className="pa-box-cite" style={{ margin: 0 }}>{reading.school_nam}</p>
                  <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>
                    {reading.sch_type ?? "—"} · {reading.grades ?? "no grades"}
                  </p>
                </>
              ) : (
                <p className="pa-detail-hint" style={{ margin: 0 }}>Hover a catchment for a reading.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
