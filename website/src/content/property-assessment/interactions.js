// =============================================================================
// interactions.js
//
// Section-specific map behaviour for the Property Assessment choropleth:
//   • hover      → feature-state highlight ONLY (no DOM popup) + pointer cursor
//   • click      → report the clicked Neighbourhood ID up via onSelect(id)
//   • click empty→ onSelect(null) to clear the selection
//   • dblclick   → fly-to the neighbourhood (no popup)
//   • search     → flyAndPinByName(name): fly-to + onSelect(id)
//
// The single-neighbourhood DETAIL now lives in the right info rail (InfoRail.jsx),
// driven by React `selectedId` — so this module no longer builds popups, holds
// `year`, or owns the "pinned" feature-state. It reports selection via onSelect;
// PropertyAssessmentMap turns `selectedId` into the `pinned` feature-state (so the
// highlight survives year/metric changes, which never re-run this installer).
// Hover state is the only feature-state this module owns.
//
// Wired in via MapView's onLoad(map) hook — MapView itself stays interaction-agnostic.
// Ported from pipeline/yeg/property-assessment/scripts/09_build_choropleth.html;
// where a behaviour here disagrees with 09, 09 wins until we explicitly diverge.
//
// Public surface:
//   • installChoroplethInteractions(map, gj, onSelect) → { flyAndPinByName, cleanup }
//   • useChoroplethInteractions(map, gj, onSelect)     → flyAndPinByName (React hook)
//   • indexNamesForSearch(gj)                          → string[] (sorted display names)
// =============================================================================

import { useEffect, useRef, useCallback } from "react";

const SOURCE_ID = "nbhd";
const FILL_LAYER_ID = "nbhd-fill";
const ID_PROPERTY = "Neighbourhood ID";

// ---- Public hook -----------------------------------------------------------
// Installs handlers once when BOTH map and gj are ready, and tears them down on
// unmount (and before re-install if either changes). `gj` is the combined source
// (or its bare-named projection) — only its YEAR-INVARIANT parts are read here
// (geometry, display_name, Neighbourhood ID), so a year change does NOT re-install.
export function useChoroplethInteractions(map, gj, onSelect) {
  const apiRef = useRef(null);
  // onSelect is read through a ref so changing it (it closes over fresh React
  // state) doesn't tear down and re-install the map handlers.
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!map || !gj) return undefined;
    const api = installChoroplethInteractions(map, gj, (id) => onSelectRef.current?.(id));
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
export function installChoroplethInteractions(map, gj, onSelect) {
  // Tier 3 fly-to is bound to dblclick below; disable MapLibre's default
  // double-click-to-zoom so it doesn't fight our handler (must be done now,
  // not in the handler — the default fires first).
  map.doubleClickZoom.disable();

  // promoteId rewrites every feature.id to the value of "Neighbourhood ID".
  // We track the hovered id (not array indices) so feature-state survives source
  // updates. The SELECTED (pinned) id is owned by React, not here.
  let hoveredId = null;

  function setHover(id, on) {
    map.setFeatureState({ source: SOURCE_ID, id }, { hover: on });
  }
  function clearHover() {
    if (hoveredId !== null) {
      setHover(hoveredId, false);
      hoveredId = null;
    }
    map.getCanvas().style.cursor = "";
  }

  // ---- Handlers (named so .off() can detach them on cleanup) -----------
  function onMouseMove(e) {
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = "pointer";
    const id = e.features[0].id;
    if (id !== hoveredId) {
      if (hoveredId !== null) setHover(hoveredId, false);
      hoveredId = id;
      setHover(hoveredId, true);
    }
  }

  function onMouseLeave() {
    clearHover();
  }

  // Single click selects the neighbourhood → fills the right rail (React state).
  function onClickFill(e) {
    if (!e.features?.length) return;
    onSelect(e.features[0].id);
  }

  // Fly-to — double click only. Does not change the selection.
  function onDblClickFill(e) {
    e.preventDefault();   // stop MapLibre's default zoom (also disabled above)
    if (!e.features?.length) return;
    const fullFeat = findFeatureById(gj, e.features[0].id);
    if (fullFeat) flyToFeature(map, fullFeat);
  }

  // Click on empty basemap (not a polygon) clears the selection.
  function onMapClick(e) {
    const hits = map.queryRenderedFeatures(e.point, { layers: [FILL_LAYER_ID] });
    if (!hits.length) onSelect(null);
  }

  map.on("mousemove", FILL_LAYER_ID, onMouseMove);
  map.on("mouseleave", FILL_LAYER_ID, onMouseLeave);
  map.on("click", FILL_LAYER_ID, onClickFill);
  map.on("dblclick", FILL_LAYER_ID, onDblClickFill);
  map.on("click", onMapClick);

  // ---- Search-driven fly-to + select -----------------------------------
  const nameIndex = buildNameIndex(gj);
  function flyAndPinByName(name) {
    const feat = nameIndex.lookup(name);
    if (!feat) return false;
    flyToFeature(map, feat, { duration: 1100 });
    onSelect(feat.properties[ID_PROPERTY]);
    return true;
  }

  function cleanup() {
    map.off("mousemove", FILL_LAYER_ID, onMouseMove);
    map.off("mouseleave", FILL_LAYER_ID, onMouseLeave);
    map.off("click", FILL_LAYER_ID, onClickFill);
    map.off("dblclick", FILL_LAYER_ID, onDblClickFill);
    map.off("click", onMapClick);
    clearHover();
  }

  return { flyAndPinByName, cleanup };
}

// ---- Helpers --------------------------------------------------------------

function flyToFeature(map, feat, opts = {}) {
  map.fitBounds(bboxOfGeom(feat.geometry), {
    // Plain edge margins: the controls + detail live in an IN-FLOW left panel (the
    // map reflows into the canvas beside it), so there is no over-map overlay to
    // compensate for — the map's own viewport already excludes the panel.
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
