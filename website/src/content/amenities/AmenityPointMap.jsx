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
//
// title / selectorNode (OPTIONAL, injected by AmenitySection when this map is one VIEW of a
// consolidated section — e.g. Parks & Recreation): `title` overrides the column/tab title to the
// SECTION name; `selectorNode` is the shared view <SegmentedControl>, rendered as the top module
// of the console column. Absent on a standalone route → unchanged behaviour.
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
  buildColourExpression, resolveDisplayDomain, categoryFilter, dotLayer, selectLayer, amenityLabel,
  RING, ringRadiusAt, labelLayer, LABEL_LAYER_ID,
} from "./amenityPointStyle.js";

const MANIFEST_URL = assetUrl("/data/amenities/manifest.json");

export default function AmenityPointMap({ layerId, title, selectorNode }) {
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
        // All display items shown initially. Set here (a fetch callback, once per mount —
        // each layer is its own route), not in an effect (set-state-in-effect is disallowed).
        const dom = resolveDisplayDomain(rec.categories || [], rec.categoryCounts, rec.categoryLabels, rec.residualCategories);
        setActive(new Set(dom.items.map((it) => it.key)));
      })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [layerId]);

  const categoryField = entry?.categoryField || "";
  const categories = useMemo(() => entry?.categories || [], [entry]);
  // Resolve to display items: ≤10 → one per category; >10 → top-10 by count + Other (§7.1).
  const domain = useMemo(
    () => resolveDisplayDomain(categories, entry?.categoryCounts, entry?.categoryLabels, entry?.residualCategories),
    [entry],  // eslint-disable-line react-hooks/exhaustive-deps
  );

  const geojsonUrl = entry ? assetUrl(`/data/amenities/${entry.file}`) : null;
  // The dot + ring, coloured from the resolved domain. Built once the entry exists, so
  // MapView adds them already-coloured (no post-hoc setPaintProperty).
  const layers = useMemo(() => {
    if (!entry) return null;
    const base = [selectLayer(), dotLayer(buildColourExpression(categoryField, domain))];
    if (entry.family === "S") base.push(labelLayer("name"));   // A6: sparse layers get name labels
    return base;
  }, [entry]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = entry ? `${title ?? entry.label} · Edmonton` : "Open Data Centre";
    return () => { document.title = "Open Data Centre"; };
  }, [entry, title]);

  // ── Map load: lift the points above the basemap, land the home camera, add recentre ──
  const firstHomeRef = useRef(true);
  const recentreAddedRef = useRef(false);
  function handleMapLoad(m) {
    setMap(m);
    if (import.meta.env.DEV) window.__amenityMap = m;
    // Points sit ABOVE all basemap layers (MapView inserts data layers below labels).
    for (const id of [SELECT_LAYER_ID, DOT_LAYER_ID, LABEL_LAYER_ID]) if (m.getLayer(id)) m.moveLayer(id);
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
    // A2 HOVER state: grow the pointed-at dot via feature-state (the source has generateId ids).
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
      if (f.id === lastHoverId) return;   // same dot → no state change (smooth scanning)
      setHoverFs(f.id);
      setHovered({ id: f.id, props: f.properties });
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

  // A2 SELECT state: on a new pin, animate the ring OUTWARD ONCE, then hold (restore the
  // zoom-interpolate radius). One-shot, NOT a loop; reduced-motion jumps straight to the held
  // ring (WCAG 2.2.2). rAF is cancelled on unmount / re-pin, and a hidden tab pauses rAF.
  useEffect(() => {
    if (!map || !map.getLayer(SELECT_LAYER_ID) || selected?.id == null) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) { try { map.setPaintProperty(SELECT_LAYER_ID, "circle-radius", RING); } catch { /* */ } return undefined; }
    const end = ringRadiusAt(map.getZoom());
    const start = end * 0.4;
    let raf, t0 = null;
    const step = (ts) => {
      if (t0 == null) t0 = ts;
      const p = Math.min(1, (ts - t0) / 380);
      const e = 1 - (1 - p) ** 3;   // ease-out cubic
      try { map.setPaintProperty(SELECT_LAYER_ID, "circle-radius", start + (end - start) * e); } catch { /* */ }
      if (p < 1) raf = requestAnimationFrame(step);
      else { try { map.setPaintProperty(SELECT_LAYER_ID, "circle-radius", RING); } catch { /* */ } }
    };
    raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [map, selected, layers]);

  // Category show/hide: the legend selection filters the dot layer (removes hidden points
  // from render AND hit-test — never opacity:0, directive §6).
  useEffect(() => {
    if (!map || !active || !map.getLayer(DOT_LAYER_ID)) return;
    try {
      map.setFilter(DOT_LAYER_ID, categoryFilter(categoryField, active, domain));
    } catch { /* map tearing down */ }
  }, [map, active, categoryField, domain, layers]);

  function toggleCategory(key) {
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // A pin whose category falls in the item being hidden points at nothing — clear it.
    if (active?.has(key) && selected) {
      const item = domain.items.find((it) => it.key === key);
      if (item && item.members.includes(selected.props?.[categoryField])) setSelected(null);
    }
  }

  // ── Currency + coverage (from the manifest — no date literal, §8) ────────────
  // Currency: distinguish WHOSE date it is (B2/D10e honesty). sourceUpdatedAt is the City's
  // own rowsUpdatedAt -> "Updated"; if that read ever fails (null), fall back to OUR snapshot
  // date but label it "Fetched" so the line never claims the City updated on our fetch date.
  const count = entry ? entry.featureCount.toLocaleString() : "";
  const currency = entry
    ? (entry.sourceUpdatedAt
        ? `Updated ${entry.sourceUpdatedAt} · ${count} locations`
        : `Fetched ${entry.fetchedAt} · ${count} locations`)
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
            categoryLabel={categoryField ? amenityLabel(categoryField) : null}
            categoryLabels={entry?.categoryLabels}
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

            {categoryField && active && domain.items.length > 0 && (
              <section className="pa-card pa-card-instrument">
                <AmenityLegend
                  title={amenityLabel(categoryField)}
                  note={domain.note}
                  items={domain.items}
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
              {/* The interaction prompt, homed in the console (D10a — was a detached float). */}
              <p className="pa-detail-hint" style={{ margin: "4px 0 0" }}>Hover a point for a reading; click to pin it.</p>
            </section>
          </div>
        )}
      </div>
    </article>
  );
}
