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

  // onReady(): optional — fired ONCE after the map's first idle (source loaded +
  // layers painted), so a section can keep its loading cover up until the map is
  // actually drawn, not merely until its own data fetch resolved.
  const onReadyRef = useRef(onReady);
  // eslint-disable-next-line react-hooks/refs
  onReadyRef.current = onReady;

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

      // First idle = the source has loaded AND the layers have painted. Signal
      // the page once so it can drop its loading cover only now — the heavy
      // combined GeoJSON paints well after its fetch resolves.
      map.once("idle", () => { if (onReadyRef.current) onReadyRef.current(); });

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
  // The assessed ramp is now `interpolate` (a CONTINUOUS colour space), so on a year
  // change we just swap the source data here + the per-year stops (the latter via
  // the page's setPaintProperty repaint effect) and let nbhd-fill's
  // fill-color-transition TWEEN the colour old→new. No opacity blank-then-fill —
  // that was a workaround for the old `step` colours, which couldn't tween. Reduced-
  // motion: paintTransition already yields a 0-duration fill-color-transition, so the
  // colour snaps. The create effect handles the FIRST load, so this runs only on
  // later swaps.
  //
  // TWEEN EXPERIMENT: whether setData actually tweens a DATA-driven fill-color is the
  // load-bearing question — this path is deliberately UNCOVERED (no opacity fade) so
  // a dev eyeball of one year swap answers it: colours FLOW (tween) or SNAP. If they
  // snap, restore the sequenced opacity dissolve (git history).
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
    // (+ that one addSource line); the persistent-map lifecycle, the colour tween,
    // the layers, feature-state, and the controls do NOT change.
    function applyYearData() {
      map.getSource(sourceId).setData(geojsonUrl); // mode A
    }

    applyYearData();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojsonUrl, sourceId]);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}

function findFirstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) if (l.type === "symbol") return l.id;
  return undefined;
}
