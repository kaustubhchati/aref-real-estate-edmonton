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
// Props:
//   • className — extra class on the canvas div.
//   • onLoad    — optional (map) => void, called once after the source + layer
//                 are installed. The page uses this to grab the map instance so
//                 it can drive live filters (year / job category) via setFilter.
//                 Same single hook the shared MapView exposes, same reason.
// =============================================================================

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  BASEMAP_STYLE,
  MAP_VIEW,
  LAYER_ID,
  permitCircleLayer,
  buildPermitPopupHtml,
  buildPermitHoverHtml,
} from "./permitStyle.js";

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

// The permits .pmtiles is hosted on Cloudflare R2, NOT served from the site's own
// /public assets. WHY: PMTiles reads tiles by HTTP range request (byte ranges into
// the single .pmtiles file). Cloudflare Pages does NOT honor range requests on
// static assets — it returns the whole file — so pmtiles:// fails there. R2 does
// honor them, so the tile must live in an R2 bucket exposed at this public URL.
const R2_BASE_URL = "https://pub-600ea350470345bbb93a035ad72875d5.r2.dev";

// The pmtiles:// prefix is required: it routes the URL through the registered
// PMTiles protocol handler (see addProtocol above) instead of a plain fetch.
const PERMITS_URL = `pmtiles://${R2_BASE_URL}/building-permits/permits.pmtiles`;

// Click a dot → show a popup at that point; pointer cursor while hovering a dot.
// WHY one shared Popup instance: re-clicking another dot just repositions and
// refills it (setLngLat/setHTML/addTo), so we never leak popups. No explicit
// teardown is needed — the effect's map.remove() disposes the popup and these
// handlers together with the map.
function wirePermitPopup(map) {
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    offset: 10,
    maxWidth: "300px",
  });

  // A second, lighter popup that follows the pointer to preview the dot under it
  // (address + category). No close button — it lives only while hovering and is
  // removed on mouseleave. Separate instance from the click popup so a pinned
  // click popup isn't disturbed by hovering nearby dots.
  const hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 8,
    maxWidth: "220px",
  });

  map.on("mousemove", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(buildPermitHoverHtml(f.properties))
      .addTo(map);
  });

  map.on("mouseleave", LAYER_ID, () => {
    hoverPopup.remove();
  });

  map.on("click", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    // Anchor on the dot's own coordinates (point geometry), not the click pixel,
    // so the popup tip sits exactly on the permit.
    popup
      .setLngLat(f.geometry.coordinates)
      .setHTML(buildPermitPopupHtml(f.properties))
      .addTo(map);
  });

  // A pointer cursor signals the dots are clickable.
  map.on("mouseenter", LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
}

export default function PermitMapView({ className = "", onLoad }) {
  const containerRef = useRef(null);

  // onLoad is read from a ref so the page can pass a fresh callback between
  // renders without re-mounting the map (same trick as the shared MapView).
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;

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

      // Click-popup + hover cursor on the dots (step 4b).
      wirePermitPopup(map);

      // Hand the live map to the page (last, so the layer it filters exists).
      if (onLoadRef.current) onLoadRef.current(map);
    });

    // StrictMode double-mounts effects in dev; map.remove() teardown handles it.
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}
