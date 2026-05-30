// =============================================================================
// PermitMapView.jsx
//
// The Building Permits map mount — a MapLibre canvas owned by THIS section.
//
// Why a separate mount instead of the shared components/MapView.jsx?
// MapView loads a single GeoJSON source (type: "geojson", data: <url>). Permits
// is 226,184 points served as PMTiles vector tiles (type: "vector", pmtiles://).
// MapView can't express that, and bending it to would couple two unrelated data
// shapes. Per the project's sectional-map approach (CLAUDE.md §3), each section
// owns its mount; we generalise only on a real second need. So this file MIRRORS
// MapView's lifecycle shape — single create-on-mount useEffect, map.remove()
// teardown, StrictMode-safe, honest error surfacing — but loads a vector source.
//
// Scope of THIS file (step 2): protocol + vector source + one uniform circle
// layer that proves the points render. No styling, filters, popups, or legend.
// =============================================================================

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import { BASEMAP_STYLE, MAP_VIEW, permitCircleLayer } from "./permitStyle.js";

// Register the PMTiles protocol ONCE at module load, not inside the effect.
// WHY: MapLibre only knows http(s) URLs out of the box. PMTiles needs a protocol
// handler so MapLibre can read pmtiles:// URLs (it reads tiles by byte-range from
// the single .pmtiles file). Registering here — once per module — means repeated
// mounts (StrictMode double-mount, route revisits) don't re-register the handler.
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// The PMTiles vector source this mount loads. (Look-and-feel — basemap, view,
// the circle layer's colour/size — lives in permitStyle.js; this file only wires
// the data source into the map.) The source-layer name lives in the layer spec.
const SOURCE_ID = "permits";
const PERMITS_URL = "pmtiles:///data/building-permits/permits.pmtiles";

export default function PermitMapView({ className = "" }) {
  const containerRef = useRef(null);

  // Single effect: create on mount, remove on unmount. Same shape as MapView.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: MAP_VIEW.center,
      zoom: MAP_VIEW.zoom,
      minZoom: MAP_VIEW.minZoom,
      maxZoom: MAP_VIEW.maxZoom,
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-right");

    map.on("error", (e) => {
      // Surface map errors honestly instead of swallowing them — CLAUDE.md §6.
      // A wrong source-layer name does NOT error here (it just renders nothing),
      // but a bad URL / unreachable tile / style problem will show up here.
      const err = e?.error;
      console.error("[PermitMapView]", err?.message || err || e);
    });

    map.on("load", () => {
      map.addSource(SOURCE_ID, {
        type: "vector",
        url: PERMITS_URL,
      });

      // One circle layer from permitStyle.js — colour by job_group, size by
      // construction_value. The spec is returned without `source`; we fill it in
      // here so the style file stays agnostic about what the source is named.
      map.addLayer({ ...permitCircleLayer(), source: SOURCE_ID });
    });

    // StrictMode double-mounts effects in dev; map.remove() teardown handles it.
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}
