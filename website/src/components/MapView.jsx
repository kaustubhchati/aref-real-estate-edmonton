// =============================================================================
// MapView.jsx
//
// A section-agnostic MapLibre canvas. Mount it with:
//   • basemapStyle  — URL to a MapLibre style.json
//   • geojsonUrl    — URL of the GeoJSON to load as a single source
//   • view          — { center: [lng,lat], zoom, minZoom, maxZoom }
//   • sourceId      — what to name the GeoJSON source (referenced by layers)
//   • promoteId     — optional property name to use as the feature id
//   • layers        — array of MapLibre layer specs to add (source filled in)
//   • images        — optional [{ id, make: () => ImageData }] for fill-pattern
//   • onLoad        — optional (map) => void; called once after images +
//                     source + layers are installed. Section files use this
//                     to wire their own interactions (popups, search) against
//                     the live map instance. Intentionally the ONLY hook
//                     MapView exposes — we'll only generalise once a second
//                     section actually needs the same wiring.
//
// The component is intentionally dumb: it knows nothing about choropleths,
// stops, or property-assessment — those live in the section's style file
// (e.g. choroplethStyle.js). Permits or crime maps will reuse this exact
// component with different layers / source.
//
// Lifecycle: a single useEffect creates the map on mount and removes it on
// unmount. React 19 StrictMode double-mounts effects in dev; map.remove()
// teardown handles that cleanly.
// =============================================================================

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyAppleClassic } from "./basemapTheme.js";
import {
  MOTION_PASS, DUR_FAST, DUR_BASE, EASE, DIP_FLOOR, SKELETON_THRESHOLD, reduceMotion,
} from "./motion.js";

export default function MapView({
  basemapStyle,
  geojsonUrl,
  view,
  sourceId,
  promoteId,
  layers,
  images = [],
  onLoad,
  onLoading,
  className = "",
}) {
  const containerRef = useRef(null);

  // onLoad is read from a ref so it can change between renders (e.g. when
  // the section closes over fresh state) without re-mounting the map.
  const onLoadRef = useRef(onLoad);
  // Live-callback pattern: ref is updated during render so the
  // effect always reads the latest onLoad without re-mounting
  // the map. The rule flags ref writes outside effects but this
  // is safe and intentional — see MapView.jsx / PermitMapView.jsx.
  // eslint-disable-next-line react-hooks/refs
  onLoadRef.current = onLoad;

  // onLoading(bool): optional — true if an in-place year swap's new data takes
  // longer than the skeleton threshold to settle, false when it settles.
  const onLoadingRef = useRef(onLoading);
  // eslint-disable-next-line react-hooks/refs
  onLoadingRef.current = onLoading;

  // The live map instance + the URL currently in its source, so the in-place
  // swap effect can update data without re-creating the map (one WebGL context).
  const mapRef = useRef(null);
  const loadedUrlRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle,
      center: view.center,
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-right");

    map.on("error", (e) => {
      // Surface map errors honestly instead of swallowing them — CLAUDE.md §6.
      const err = e?.error;
      console.error("[MapView]", err?.message || err || e);
    });

    map.on("load", () => {
      // Apple-Classic basemap restyle (colour + POI-hide only). Runs FIRST, so
      // only basemap layers exist — the data source/layers added below are
      // never touched. Behind APPLY_APPLE_CLASSIC in basemapTheme.js.
      applyAppleClassic(map);

      // Register pattern images first; the fill-pattern layers depend on them.
      for (const img of images) {
        try {
          map.addImage(img.id, img.make());
        } catch (err) {
          console.warn(`[MapView] addImage("${img.id}") failed`, err);
        }
      }

      const sourceSpec = { type: "geojson", data: geojsonUrl };
      if (promoteId) sourceSpec.promoteId = promoteId;
      map.addSource(sourceId, sourceSpec);

      // Insert below the first basemap symbol layer so road / city labels
      // render on top of our polygons — MapLibre's beforeId trick.
      const beforeId = findFirstSymbolLayerId(map);

      for (const layer of layers) {
        map.addLayer({ ...layer, source: sourceId }, beforeId);
      }

      // Section-specific wiring (popups, search, etc.) runs last so it can
      // assume every source + layer it expects is already on the map.
      if (onLoadRef.current) onLoadRef.current(map);

      // Hand the live map + its loaded url to the in-place swap effect below.
      mapRef.current = map;
      loadedUrlRef.current = geojsonUrl;
    });

    return () => { mapRef.current = null; map.remove(); };
    // We intentionally do NOT re-run this effect when props change —
    // the section is rebuilt by routing, not by prop tweaks. If a future
    // page needs live updates (e.g. toggling a filter), expose that via
    // map.setPaintProperty inside a child effect rather than re-mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-place YEAR/SOURCE swap (Option A — container dip-and-swap). On a
  // geojsonUrl change WITHOUT a remount: dip the canvas to DIP_FLOOR, setData the
  // new file, fade back in when the source settles. The map instance persists —
  // ONE WebGL context, no map.remove(). The create effect above handles the
  // FIRST load (loadedUrlRef === geojsonUrl), so this only runs on later swaps.
  // Gated by MOTION_PASS + prefers-reduced-motion (reduced = instant setData).
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !map.getSource(sourceId)) return undefined;
    if (geojsonUrl === loadedUrlRef.current) return undefined;
    loadedUrlRef.current = geojsonUrl;

    if (!MOTION_PASS || reduceMotion()) {
      map.getSource(sourceId).setData(geojsonUrl); // instant, no dip
      return undefined;
    }

    let settled = false;
    let skeletonTimer = null;
    let maxTimer = null;

    function settle() {
      if (settled) return;
      settled = true;
      map.off("sourcedata", onSourceData);
      clearTimeout(skeletonTimer);
      clearTimeout(maxTimer);
      onLoadingRef.current?.(false);
      container.style.transition = `opacity ${DUR_BASE}ms ${EASE}`;
      container.style.opacity = "1"; // fade back in
    }

    function onSourceData(e) {
      if (e.sourceId === sourceId && e.isSourceLoaded) settle();
    }

    // 1. Dip out — to the FLOOR, not 0, so the basemap never fully vanishes.
    container.style.transition = `opacity ${DUR_FAST}ms ${EASE}`;
    container.style.opacity = String(DIP_FLOOR);

    // 2. After the dip, swap the data and wait for the source to settle.
    const dipTimer = setTimeout(() => {
      map.on("sourcedata", onSourceData);
      map.getSource(sourceId).setData(geojsonUrl);
      // 3. Skeleton only if the new data is genuinely slow (> threshold).
      skeletonTimer = setTimeout(() => {
        if (!settled) onLoadingRef.current?.(true);
      }, SKELETON_THRESHOLD);
      // Safety net: never leave the canvas stuck-dimmed if 'sourcedata' never
      // settles (e.g. a failed fetch) — force the fade-in after a hard cap.
      maxTimer = setTimeout(settle, 8000);
    }, DUR_FAST);

    return () => {
      clearTimeout(dipTimer);
      clearTimeout(skeletonTimer);
      clearTimeout(maxTimer);
      map.off("sourcedata", onSourceData);
      onLoadingRef.current?.(false);
      container.style.transition = "";
      container.style.opacity = "1";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojsonUrl, sourceId]);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}

function findFirstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) if (l.type === "symbol") return l.id;
  return undefined;
}
