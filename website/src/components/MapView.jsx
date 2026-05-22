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

export default function MapView({
  basemapStyle,
  geojsonUrl,
  view,
  sourceId,
  promoteId,
  layers,
  images = [],
  onLoad,
  className = "",
}) {
  const containerRef = useRef(null);

  // onLoad is read from a ref so it can change between renders (e.g. when
  // the section closes over fresh state) without re-mounting the map.
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle,
      center: view.center,
      zoom: view.zoom,
      minZoom: view.minZoom,
      maxZoom: view.maxZoom,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-right");

    map.on("error", (e) => {
      // Surface map errors honestly instead of swallowing them — CLAUDE.md §6.
      const err = e?.error;
      console.error("[MapView]", err?.message || err || e);
    });

    map.on("load", () => {
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
    });

    return () => map.remove();
    // We intentionally do NOT re-run this effect when props change —
    // the section is rebuilt by routing, not by prop tweaks. If a future
    // page needs live updates (e.g. toggling a filter), expose that via
    // map.setPaintProperty inside a child effect rather than re-mounting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}

function findFirstSymbolLayerId(map) {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) if (l.type === "symbol") return l.id;
  return undefined;
}
