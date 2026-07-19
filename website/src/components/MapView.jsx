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
import { crossFadeSource, abortCrossFade } from "./crossFadeSource.js";
import { siteConfig } from "../config/siteConfig.js";

// Warm MapLibre's worker pool + WebGL resources as soon as a map section's chunk
// loads (this module is the shared MapLibre entry for every map), so worker init
// overlaps React rendering the map component and the first paint comes sooner.
// This used to run at app entry (main.jsx), but that pulled MapLibre into the boot
// bundle; here it fires only once a map route is actually opened. One-time, no
// teardown (clearing then re-warming for the next map would be net-negative).
maplibregl.prewarm();

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
  onReady,
  boxSelect,
  preserveDrawingBuffer = false,
  cooperativeGestures = true,
  className = "",
  // Attribution shape (§6). Defaults reproduce the compact "i" every section had.
  //   • attributionCompact — false = an always-visible inline strip (no toggle). PA, DU
  //     and BC ALL pass false now (the standardization gave DU/BC PA's links strip + the
  //     attribution panel); the `true` default is only the built-in fallback for a caller
  //     that passes nothing (e.g. the permit POINT map). The fuller record lives in the
  //     database-control attribution panel.
  //   • mapAttribution — the customAttribution entries (CARTO/OSM come from the TileJSON
  //     automatically, on top of these). PA passes the links-only strip; the default
  //     carries the disclaimer too.
  attributionCompact = true,
  mapAttribution = siteConfig.mapAttribution,
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

  // onReady(): optional — fired ONCE after the map's first idle (source loaded +
  // layers painted), so a section can keep its loading cover up until the map is
  // actually drawn, not merely until its own data fetch resolved.
  const onReadyRef = useRef(onReady);
  // eslint-disable-next-line react-hooks/refs
  onReadyRef.current = onReady;

  // boxSelect(map, startPos, endPos): optional — when provided, Shift-drag does a
  // box SELECT (this callback) instead of the default box-zoom (PA's C3). Read via
  // a ref so it always sees the section's latest closure (the current gjView).
  const boxSelectRef = useRef(boxSelect);
  // eslint-disable-next-line react-hooks/refs
  boxSelectRef.current = boxSelect;

  // The live map instance + the URL currently in its source, so the in-place
  // swap effect can update data without re-creating the map (one WebGL context).
  const mapRef = useRef(null);
  const loadedUrlRef = useRef(null);
  // Interrupt/lifecycle state for the year-swap cross-fade, owned here and passed
  // to crossFadeSource so a fast re-swap (or unmount) tears the fade down cleanly.
  const crossFadeRef = useRef({ token: 0, listeners: [], ghostLayers: [], ghostSrc: null, timer: null, raf: null });

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
      // The basemap CARTO/OSM credit comes from the TileJSON automatically;
      // customAttribution APPENDS our data credit (siteConfig §6). PA, DU and BC all run
      // the always-visible links strip (compact:false); the compact "i" toggle (default
      // true) is only the fallback for a caller that passes nothing (the permit point map).
      attributionControl: { compact: attributionCompact, customAttribution: mapAttribution },
      // Default: scrolling zooms only with ctrl/⌘ (or two fingers); a plain wheel scrolls
      // the PAGE, so an embedded map doesn't hijack scroll. PA/DU/BC all opt OUT
      // (cooperativeGestures=false) for a free-roam, full-bleed map:
      // wheel/two-finger zooms directly, no modifier. PA-scoped via the prop.
      cooperativeGestures,
      // PA opts in (preserveDrawingBuffer) so the WebGL canvas can be exported to
      // PNG (getCanvas().toDataURL()) — without it the export is blank. Small perf
      // cost, so it's opt-in; other sections pass false (= the default).
      preserveDrawingBuffer: !!preserveDrawingBuffer,
      // PA opts into box-SELECT (Shift-drag) by passing boxSelect: the boxZoomEnd
      // callback runs INSTEAD of the default fit-to-box zoom (MapLibre 5.20+).
      // SPREAD so the key is ABSENT for sections that don't opt in — Object.assign
      // copies an explicit `undefined`, which would override the default
      // boxZoom:true and silently disable box-zoom for BP / Business Census.
      ...(boxSelect
        ? { boxZoom: { boxZoomEnd: (m, s, e) => boxSelectRef.current?.(m, s, e) } }
        : {}),
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

      // First idle = the source has loaded AND the layers have painted. Signal
      // the page once so it can drop its loading cover only now — the heavy
      // combined GeoJSON paints well after its fetch resolves.
      map.once("idle", () => { if (onReadyRef.current) onReadyRef.current(); });

      // Hand the live map + its loaded url to the in-place swap effect below.
      mapRef.current = map;
      loadedUrlRef.current = geojsonUrl;
    });

    return () => {
      // Stop any in-flight cross-fade (timers, listeners, ghost) BEFORE destroying the
      // map, so nothing fires against a removed map.
      abortCrossFade(map, crossFadeRef, layers);
      mapRef.current = null;
      map.remove();
    };
    // We intentionally do NOT re-run this effect when props change —
    // the section is rebuilt by routing, not by prop tweaks. If a future
    // page needs live updates (e.g. toggling a filter), expose that via
    // map.setPaintProperty inside a child effect rather than re-mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // In-place SOURCE swap on a PERSISTENT map (no remount, ONE WebGL context). The
  // create effect handles the FIRST load; this runs only on a LATER geojsonUrl change.
  // Today the one section that changes its geojsonUrl is the Building Permits POINT map
  // (the Year slider swaps to that year's per-year file). The choropleths (PA, DU, BC)
  // keep a CONSTANT url and change year by PAINT (setPaintProperty over a combined
  // all-years file), so they never enter this effect at all.
  //
  // The swap is delegated to crossFadeSource (components/crossFadeSource.js), which:
  //   • RECREATES the source (removeSource + addSource), NEVER setData — setData on a
  //     live GeoJSON source corrupts its tiles at high zoom (the BP points clipping);
  //     recreating forces a clean re-tile. This is the load-bearing fix and it stays.
  //   • CROSS-FADES year→year: a throwaway ghost source holds the OLD year and fades out
  //     while the recreated canonical (NEW year) fades in — they OVERLAP, so the map is
  //     never empty of points mid-swap. Ramp-preserving (it scales the layer's opacity
  //     EXPRESSION, never flattens it) and reduced-motion-aware (duration 0 → straight
  //     recreate, no ghost).
  //   • Re-adds the layers at their anchor carrying their LIVE filter (getStyle), so the
  //     section's setFilter + popup/hover wiring (bound to the fixed LAYER id) survive.
  // Interrupt state lives in crossFadeRef; the create effect aborts it before map.remove().
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(sourceId)) return undefined;
    if (geojsonUrl === loadedUrlRef.current) return undefined;
    const oldUrl = loadedUrlRef.current;
    loadedUrlRef.current = geojsonUrl;

    crossFadeSource(map, {
      sourceId,
      oldUrl,
      newUrl: geojsonUrl,
      promoteId,
      baseLayers: layers,
      stateRef: crossFadeRef,
    }).catch((err) => console.warn("[MapView] crossFadeSource", err));
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojsonUrl, sourceId]);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}

// Exported so a section can anchor its OWN symbol layers into the basemap's collision
// index (PA's centroid labels — D-P3 B2) rather than stacking them above everything.
export function findFirstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) if (l.type === "symbol") return l.id;
  return undefined;
}
