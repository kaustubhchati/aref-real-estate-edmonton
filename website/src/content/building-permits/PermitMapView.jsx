// =============================================================================
// PermitMapView.jsx
//
// The Building Permits map mount — a MapLibre canvas owned by THIS section.
//
// Why a separate mount instead of the shared components/MapView.jsx? MapView
// loads a single GeoJSON source; permits is 226,184 points served as PMTiles
// vector tiles (pmtiles://). This file MIRRORS MapView's lifecycle shape —
// single create-on-mount useEffect, map.remove() teardown, StrictMode-safe,
// honest error surfacing — but loads a vector source.
//
// Props:
//   • className — extra class on the canvas div.
//   • onLoad    — optional (map) => void, called once after the source + layer
//                 are installed; the page uses it to drive live filters.
// =============================================================================

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { applyAppleClassic } from "../../components/basemapTheme.js";

import {
  BASEMAP_STYLE,
  MAP_VIEW,
  LAYER_ID,
  permitCircleLayer,
  buildPermitPopupHtml,
  buildPermitHoverHtml,
} from "./permitStyle.js";

// Register the PMTiles protocol exactly once, lazily, the first time a map
// mounts. A module-level flag guards against re-registration across StrictMode
// double-mounts and route revisits — re-adding the same protocol can silently
// conflict. MapLibre only knows http(s) out of the box; PMTiles needs this
// handler to read pmtiles:// URLs by byte-range.
let pmtilesRegistered = false;
function ensurePMTilesProtocol() {
  if (pmtilesRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  pmtilesRegistered = true;
}

const SOURCE_ID = "permits";

// The permits .pmtiles is hosted on Cloudflare R2 (NOT /public): PMTiles reads
// tiles by HTTP range request, which Cloudflare Pages does not honor on static
// assets but R2 does.
const R2_BASE_URL = "https://pub-600ea350470345bbb93a035ad72875d5.r2.dev";

// The pmtiles:// prefix routes the URL through the registered protocol handler.
const PERMITS_URL = `pmtiles://${R2_BASE_URL}/building-permits/permits.pmtiles`;

// Click a dot → pinned popup; hover a dot → light preview popup; pointer cursor
// while hovering. One shared instance each, so re-clicking/-hovering repositions
// rather than leaking popups. The effect's map.remove() disposes them.
function wirePermitPopup(map, onPickRef) {
  // Click popup — full detail, stays until dismissed.
  const popup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    offset: [0, -4],
    maxWidth: "320px",
    anchor: "bottom",
  });

  // Hover popup — lightweight, follows cursor. Tier 2 slim styling via class.
  const hoverPopup = new maplibregl.Popup({
    className: "popup-hover",
    closeButton: false,
    closeOnClick: false,
    offset: [0, -4],
    maxWidth: "220px",
    anchor: "bottom",
  });

  let hoverTimer = null;
  let lastHoveredId = null;

  map.on("click", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    // Anchor to the dot's exact geographic coordinates,
    // not the click pixel. This means the popup tip
    // always points to the dot regardless of where on
    // the dot the user clicked, and doesn't drift when
    // the map is panned after clicking.
    popup
      .setLngLat(f.geometry.coordinates)
      .setHTML(buildPermitPopupHtml(f.properties))
      .addTo(map);
    // Surface the clicked dot to the page for the sidebar's last-clicked panel.
    onPickRef?.current?.(f.properties);
  });

  // Fly-to — double click only. Does not open or close any popup.
  map.on("dblclick", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    e.preventDefault();
    map.flyTo({ center: f.geometry.coordinates, zoom: 15, duration: 900 });
  });

  map.on("mousemove", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    const fid = f.id ?? f.properties?.address;

    // Position update every frame — eliminates drift.
    if (hoverPopup.isOpen()) {
      hoverPopup.setLngLat(f.geometry.coordinates);
    }

    // Only rebuild HTML when feature changes.
    if (fid !== lastHoveredId) {
      clearTimeout(hoverTimer);
      hoverPopup.remove();
      lastHoveredId = fid;

      // Suppress Tier 2 hover while a Tier 3 click popup is open.
      if (popup.isOpen()) return;

      hoverTimer = setTimeout(() => {
        if (lastHoveredId === fid) {
          hoverPopup
            .setLngLat(f.geometry.coordinates)
            .setHTML(buildPermitHoverHtml(f.properties))
            .addTo(map);
        }
      }, 900);
    }
  });

  map.on("mouseleave", LAYER_ID, () => {
    clearTimeout(hoverTimer);
    lastHoveredId = null;
    hoverPopup.remove();
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
}

export default function PermitMapView({ className = "", onLoad, onPick }) {
  const containerRef = useRef(null);

  // onLoad is read from a ref so the page can pass a fresh callback between
  // renders without re-mounting the map (same trick as the shared MapView).
  const onLoadRef = useRef(onLoad);
  // Live-callback pattern: ref is updated during render so the effect always
  // reads the latest onLoad without re-mounting. The rule flags ref writes
  // outside effects but this is safe and intentional — see MapView.jsx.
  // eslint-disable-next-line react-hooks/refs
  onLoadRef.current = onLoad;

  // Same live-callback pattern for onPick (clicked dot → sidebar panel).
  const onPickRef = useRef(onPick);
  // eslint-disable-next-line react-hooks/refs
  onPickRef.current = onPick;

  // Single effect: create on mount, remove on unmount. Same shape as MapView.
  useEffect(() => {
    ensurePMTilesProtocol();
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: MAP_VIEW.center,
      zoom: MAP_VIEW.zoom,
      minZoom: MAP_VIEW.minZoom,
      maxZoom: MAP_VIEW.maxZoom,
      attributionControl: true,
      // ctrl/⌘ + wheel (or two-finger) to zoom, so a plain page scroll isn't
      // hijacked by the map. Same guard as MapView.jsx (see the note there).
      cooperativeGestures: true,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric", maxWidth: 100 }), "bottom-right");

    // Fly-to is bound to double-click (in wirePermitPopup); disable the default
    // double-click-to-zoom so it doesn't fight our handler.
    map.doubleClickZoom.disable();

    map.on("load", () => {
      // Apple-Classic basemap restyle (colour + POI-hide only). Runs FIRST, so
      // the permit point source/layer added below is never touched. Behind
      // APPLY_APPLE_CLASSIC in basemapTheme.js.
      applyAppleClassic(map);

      map.addSource(SOURCE_ID, {
        type: "vector",
        url: PERMITS_URL,
      });
      map.addLayer({ ...permitCircleLayer(), source: SOURCE_ID });
      wirePermitPopup(map, onPickRef);
      // Hand the live map to the page (last, so the layer it filters exists).
      if (onLoadRef.current) onLoadRef.current(map);
    });

    // Surface map errors honestly instead of swallowing them — CLAUDE.md §6.
    map.on("error", (e) => {
      console.error("[PermitMapView] map error:", e.error);
    });

    // StrictMode double-mounts effects in dev; map.remove() teardown handles it.
    return () => map.remove();
  }, []);

  return <div ref={containerRef} className={`mapview ${className}`} />;
}
