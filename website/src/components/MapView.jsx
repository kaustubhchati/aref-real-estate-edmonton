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
import { siteConfig } from "../config/siteConfig.js";
import {
  MOTION_PASS, SKELETON_THRESHOLD, reduceMotion,
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
      // Lock panning to the section's city extent (per-city CITY_BOUNDS via
      // MAP_VIEW.maxBounds) so the user can't pan off into empty basemap.
      maxBounds: view.maxBounds,
      // compact "i" toggle; the basemap CARTO/OSM credit comes from the TileJSON
      // automatically, customAttribution APPENDS our data credit (siteConfig §6).
      attributionControl: { compact: true, customAttribution: siteConfig.mapAttribution },
      // Scrolling over the map zooms only when the user holds ctrl/⌘ (or uses two
      // fingers on touch); a plain wheel scrolls the PAGE. Stops the full-width
      // embedded map from hijacking page scroll. 5.24 is boolean-only — the
      // "use ctrl + scroll to zoom" overlay is MapLibre's built-in (no custom text).
      cooperativeGestures: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-right");
    // Fullscreen the whole section view — .content-map wraps the sidebar + legend
    // + map, so both stay visible/readable in fullscreen (not just the bare
    // canvas). Falls back to the map container if the wrapper isn't found.
    map.addControl(
      new maplibregl.FullscreenControl({
        container: map.getContainer().closest(".content-map") || map.getContainer(),
      }),
      "top-right",
    );

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

  // In-place YEAR/SOURCE swap on a PERSISTENT map (no remount, ONE WebGL context).
  // On a geojsonUrl change: HIDE the data fills instantly, swap the source behind
  // the seam, then — only once the new data is LOADED *and* fully RENDERED —
  // dissolve the settled layer back in as one surface. Sequencing the reveal AFTER
  // the render is what stops the new year painting in clump-by-clump (the fade must
  // not run concurrently with the progressive tile paint). The create effect handles
  // the FIRST load, so this runs only on later swaps. Reduced-motion = instant.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(sourceId)) return undefined;
    if (geojsonUrl === loadedUrlRef.current) return undefined;
    loadedUrlRef.current = geojsonUrl;

    // ---- The data-swap SEAM: the ONLY backend-aware step --------------------
    // Mode A (today, per-year GeoJSON files): replace the source data with the new
    // year's URL. Mode B (future, ONE combined multi-year source): drop setData and
    //   map.setFilter(dataLayerId, ["==", ["get", "year"], year])
    // instead — the source would also be created from the combined file (the
    // addSource line in the create effect above). The A→B switch is THIS function
    // (+ that one addSource line); the persistent-map lifecycle, the fade, the
    // layers, feature-state, and the controls do NOT change.
    function applyYearData() {
      map.getSource(sourceId).setData(geojsonUrl); // mode A
    }

    if (!MOTION_PASS || reduceMotion()) {
      applyYearData(); // reduced motion: instant, no fade
      return undefined;
    }

    // We animate only the FILL data layers — basemap + the year-INVARIANT outlines
    // / labels (same boundaries every year) stay put; only the choropleth fill
    // dissolves. Skip a hidden pattern fill (opacity 0 → fading it would flash it).
    const fills = layers.filter(
      (l) => l.type === "fill" && l.paint?.["fill-opacity"] !== 0
    );
    // Restore a fill to its real (stateful hover/pin) opacity AND its own snappy
    // transition. Used by the reveal AND by cleanup, so a superseded swap never
    // leaves fills stuck hidden.
    const restore = () =>
      fills.forEach((l) => {
        map.setPaintProperty(l.id, "fill-opacity-transition", l.paint?.["fill-opacity-transition"]);
        map.setPaintProperty(l.id, "fill-opacity", l.paint["fill-opacity"]);
      });

    let done = false;
    let skeletonTimer = null;
    let maxTimer = null;

    // Dissolve the now-SETTLED layer in as one surface: restore() flips the
    // transition back on and opacity 0 → its real expression. One-shot — detaches
    // its own listeners so rapid swaps don't stack them.
    function reveal() {
      if (done) return;
      done = true;
      map.off("sourcedata", onData);
      map.off("idle", reveal);
      clearTimeout(skeletonTimer);
      clearTimeout(maxTimer);
      onLoadingRef.current?.(false);
      restore();
    }

    // The new data is LOADED (parsed) here — but its tiles may still be painting,
    // so don't reveal yet: wait for the next 'idle' (all tiles drawn). Attaching
    // the 'idle' listener only AFTER the data loads avoids a premature 'idle' that
    // fires during the fetch (while the source is briefly empty).
    function onData(e) {
      if (e.sourceId !== sourceId || !e.isSourceLoaded) return;
      map.off("sourcedata", onData);
      map.on("idle", reveal);
    }

    // 1. Hide the fills INSTANTLY (transition 0 → no fade) so the new year's
    //    progressive paint is never visible, then swap the data behind the seam.
    fills.forEach((l) => {
      map.setPaintProperty(l.id, "fill-opacity-transition", { duration: 0 });
      map.setPaintProperty(l.id, "fill-opacity", 0);
    });
    map.on("sourcedata", onData);
    applyYearData();

    // Skeleton only if the swap is genuinely slow; safety net forces the reveal if
    // neither 'sourcedata' nor 'idle' ever fires (e.g. a failed fetch).
    skeletonTimer = setTimeout(() => { if (!done) onLoadingRef.current?.(true); }, SKELETON_THRESHOLD);
    maxTimer = setTimeout(reveal, 8000);

    return () => {
      clearTimeout(skeletonTimer);
      clearTimeout(maxTimer);
      map.off("sourcedata", onData);
      map.off("idle", reveal);
      onLoadingRef.current?.(false);
      restore(); // a newer swap superseded this one — don't leave fills hidden
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
