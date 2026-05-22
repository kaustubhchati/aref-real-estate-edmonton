// =============================================================================
// interactions.js
//
// All section-specific map behaviour for the Property Assessment choropleth:
// hover popup, click-to-pin popup, fly-to-and-pin by neighbourhood name. Lives
// next to choroplethStyle.js (the visual contract) and is wired in via
// MapView's onLoad(map) hook — MapView itself stays interaction-agnostic.
//
// Ported from pipeline/property-assessment/scripts/09_build_choropleth.html.
// If a behaviour here disagrees with 09, 09 wins until we explicitly decide
// to diverge.
//
// Public surface:
//   • installChoroplethInteractions(map, gj) → { flyAndPinByName, cleanup }
//   • useChoroplethInteractions(map, gj)     → flyAndPinByName  (React hook)
//   • indexNamesForSearch(gj)                → string[] (sorted display names)
// =============================================================================

import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { buildPopupHtml } from "./choroplethStyle.js";

const SOURCE_ID = "nbhd";
const FILL_LAYER_ID = "nbhd-fill";
const ID_PROPERTY = "Neighbourhood ID";

// ---- Public hook -----------------------------------------------------------
// Page component pattern:
//
//   const [map, setMap] = useState(null);
//   const [gj,  setGj]  = useState(null);
//   const flyAndPin = useChoroplethInteractions(map, gj);
//   ...
//   <MapView onLoad={setMap} ... />
//   <SearchInput onSelect={flyAndPin} ... />
//
// The hook installs handlers exactly once when BOTH map and gj are ready,
// and tears them down on unmount (and before re-install if either changes).
export function useChoroplethInteractions(map, gj) {
  const apiRef = useRef(null);

  useEffect(() => {
    if (!map || !gj) return undefined;
    const api = installChoroplethInteractions(map, gj);
    apiRef.current = api;
    return () => {
      api.cleanup();
      apiRef.current = null;
    };
  }, [map, gj]);

  // Stable identity for the search component — it doesn't need to re-render
  // when interactions re-install.
  return useCallback((name) => {
    apiRef.current?.flyAndPinByName(name);
  }, []);
}

// ---- Plain-JS installer (the hook is a thin wrapper around this) ----------
export function installChoroplethInteractions(map, gj) {
  const hoverPopup = new maplibregl.Popup({
    closeButton: false, closeOnClick: false, offset: 8, maxWidth: "320px",
  });
  const pinnedPopup = new maplibregl.Popup({
    closeButton: true, closeOnClick: false, offset: 8, maxWidth: "320px",
  });

  // promoteId rewrites every feature.id to the value of "Neighbourhood ID".
  // We track ids — not array indices — so feature-state survives source updates.
  let hoveredId = null;
  let pinnedId = null;

  function setHover(id, on) {
    map.setFeatureState({ source: SOURCE_ID, id }, { hover: on });
  }
  function setPinned(id, on) {
    map.setFeatureState({ source: SOURCE_ID, id }, { pinned: on });
  }

  function clearHover() {
    if (hoveredId !== null) {
      setHover(hoveredId, false);
      hoveredId = null;
    }
    hoverPopup.remove();
    map.getCanvas().style.cursor = "";
  }
  function clearPinned() {
    if (pinnedId !== null) {
      setPinned(pinnedId, false);
      pinnedId = null;
    }
    pinnedPopup.remove();
  }

  // ---- Handlers (named so .off() can detach them on cleanup) -----------
  function onMouseMove(e) {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
    const f = e.features[0];

    // Suppress hover popup when it would just duplicate the pinned popup.
    if (pinnedId !== null && pinnedId === f.id) {
      hoverPopup.remove();
      return;
    }
    if (hoveredId !== null && hoveredId !== f.id) setHover(hoveredId, false);
    hoveredId = f.id;
    setHover(hoveredId, true);
    hoverPopup
      .setLngLat(e.lngLat)
      .setHTML(buildPopupHtml(f.properties, false))
      .addTo(map);
  }

  function onMouseLeave() {
    clearHover();
  }

  function onClickFill(e) {
    if (!e.features?.length) return;
    const f = e.features[0];
    // promoteId puts the property value into f.id, but we still need the
    // original feature for geometry (fitBounds wants the bbox).
    const fullFeat = findFeatureById(gj, f.id);

    clearHover();
    clearPinned();

    pinnedId = f.id;
    setPinned(pinnedId, true);
    pinnedPopup
      .setLngLat(e.lngLat)
      .setHTML(buildPopupHtml(f.properties, true))
      .addTo(map);
    // The popup's own close button (X) clears feature-state pinning.
    pinnedPopup.once("close", () => {
      if (pinnedId !== null) {
        setPinned(pinnedId, false);
        pinnedId = null;
      }
    });

    if (fullFeat) flyToFeature(map, fullFeat);
  }

  function onMapClick(e) {
    // Click on empty basemap (not a polygon) clears the pin.
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
    if (!hits.length) clearPinned();
  }

  map.on("mousemove", FILL_LAYER_ID, onMouseMove);
  map.on("mouseleave", FILL_LAYER_ID, onMouseLeave);
  map.on("click", FILL_LAYER_ID, onClickFill);
  map.on("click", onMapClick);

  // ---- Search-driven fly-to + pin --------------------------------------
  const nameIndex = buildNameIndex(gj);
  function flyAndPinByName(name) {
    const feat = nameIndex.lookup(name);
    if (!feat) return false;

    clearHover();
    clearPinned();

    flyToFeature(map, feat, { duration: 1100 });

    pinnedId = feat.properties[ID_PROPERTY];
    setPinned(pinnedId, true);

    const [[minX, minY], [maxX, maxY]] = bboxOfGeom(feat.geometry);
    pinnedPopup
      .setLngLat([(minX + maxX) / 2, (minY + maxY) / 2])
      .setHTML(buildPopupHtml(feat.properties, true))
      .addTo(map);
    pinnedPopup.once("close", () => {
      if (pinnedId !== null) {
        setPinned(pinnedId, false);
        pinnedId = null;
      }
    });
    return true;
  }

  function cleanup() {
    map.off("mousemove", FILL_LAYER_ID, onMouseMove);
    map.off("mouseleave", FILL_LAYER_ID, onMouseLeave);
    map.off("click", FILL_LAYER_ID, onClickFill);
    map.off("click", onMapClick);
    hoverPopup.remove();
    pinnedPopup.remove();
  }

  return { flyAndPinByName, cleanup };
}

// ---- Helpers --------------------------------------------------------------
function flyToFeature(map, feat, opts = {}) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    padding: { top: 80, bottom: 80, left: 60, right: 60 },
    duration: 900,
    maxZoom: 14,
    ...opts,
  });
}

function findFeatureById(gj, id) {
  // Match as strings so numeric and string promoteId values both compare.
  for (const f of gj.features) {
    if (f.properties && String(f.properties[ID_PROPERTY]) === String(id)) return f;
  }
  return null;
}

// Compute the geometry bbox by walking nested coordinate arrays.
// Returns [[minLng, minLat], [maxLng, maxLat]] — MapLibre's fitBounds shape.
function bboxOfGeom(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function walk(c) {
    if (typeof c[0] === "number") {
      if (c[0] < minX) minX = c[0];
      if (c[0] > maxX) maxX = c[0];
      if (c[1] < minY) minY = c[1];
      if (c[1] > maxY) maxY = c[1];
    } else {
      for (const inner of c) walk(inner);
    }
  }
  walk(geom.coordinates);
  return [[minX, minY], [maxX, maxY]];
}

// Build a name → feature lookup with case-insensitive matching as a fallback.
// (The datalist autocomplete gives exact strings, but hand-typed entries land
// here too — be forgiving.)
function buildNameIndex(gj) {
  const byExact = new Map();
  const byLower = new Map();
  for (const f of gj.features) {
    const name = f.properties?.display_name;
    if (!name) continue;
    if (!byExact.has(name)) {
      byExact.set(name, f);
      byLower.set(name.toLowerCase(), f);
    }
  }
  return {
    lookup(input) {
      const trimmed = (input || "").trim();
      if (!trimmed) return null;
      return (
        byExact.get(trimmed) ||
        byExact.get(trimmed.toUpperCase()) ||
        byLower.get(trimmed.toLowerCase()) ||
        null
      );
    },
  };
}

// Sorted unique display names — what the search datalist consumes.
export function indexNamesForSearch(gj) {
  const set = new Set();
  for (const f of gj.features) {
    const name = f.properties?.display_name;
    if (name) set.add(name);
  }
  return Array.from(set).sort();
}
