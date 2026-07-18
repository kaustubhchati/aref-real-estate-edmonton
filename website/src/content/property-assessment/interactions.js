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
import { DUR_SLOW, reduceMotion } from "../../components/motion.js";

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

// ---- Camera (flat data-derived fits + the pitched home preset) -------------
// Two mechanisms: (1) the FLAT data-derived fit (map.fitBounds → selection-fit,
// search/dblclick, reset-with-a-selection) whose target is a feature subset's bbox
// (no literal center/zoom, pitch 0); (2) the tuned pitched HOME preset
// (applyCameraPreset → easeTo/jumpTo HOME_VIEW's literal center/zoom/pitch).

// Padding that keeps a fit inside the VISIBLE map — clear of the bottom chrome.
// The console rises ALONE over the map's bottom (the tuning rack moved into the
// instrument column, contract §3.2); the .pa-rack query below now returns null, so
// rackH is naturally 0 (kept, not forked, per §5). The bottom reserves the console;
// LEFT reserves the instrument column (.pa-float), which OVERLAYS the map's left
// edge. Deterministic because the fixed-grid work made those zones real, measurable.
// The CONSOLE_SVH fractions describe the SAME bottom band as .dt-panel's max-height
// cap (index.css is the source of truth); keep them in sync with that cap. [camera-model]
const CONSOLE_SVH_DESKTOP = 0.37; // matches the .dt-panel cap calc(37svh - 36px)
const CONSOLE_SVH_MOBILE = 0.62;  // matches the ≤680px .dt-panel cap (62svh)
const MOBILE_BP = 680;
// The tuning bay (.pa-tune-dock) is a FIXED-geometry, bottom-anchored control (Principle 0):
// year + range sliders + the Data Console handle. Its band from top to the map bottom is a
// STABLE ~136px at every viewport height. We reserve it as a documented constant (like the
// console's CONSOLE_SVH) rather than the live rect: the dock SLIDES IN on load (a transform),
// so a live `rect.top` read while it animates over-measures the band and the home fit lands
// too far out. Keep this synced to the dock's CSS if its geometry changes.
const TUNE_DOCK_BAND = 140;
function chromePadding(map, { reserveConsole = false } = {}) {
  const root = map.getContainer().closest(".content-map") || map.getContainer();
  const M = 40; // breathing margin on the clear edges
  const rect = map.getContainer().getBoundingClientRect();
  // BOTTOM chrome — the reserve is whichever bottom element reaches HIGHER up the map:
  //   • the tuning bay (.pa-tune-dock) — ALWAYS shown at the map's bottom (year + range
  //     sliders + the Data Console handle). Reserve its stable band (TUNE_DOCK_BAND) so the
  //     HOME view (console CLOSED) clears it — the occlusion this padding now fixes. A stable
  //     constant, NOT the live rect: the dock slides in on load, so a mid-animation read
  //     over-measures and the home lands too far out. (Was the dead .pa-rack query.)
  //   • the Data Console (.dt-panel) when open, or about to open (reserveConsole — set by
  //     box-select≥2 before React has mounted .dt-panel): reserve its TARGET height (svh),
  //     never the live rect (reading it mid-rise under-reserves). Taller than the dock, so it
  //     dominates when up.
  const dockBand = root.querySelector(".pa-tune-dock") ? TUNE_DOCK_BAND : 0;
  const consoleShown = reserveConsole || !!root.querySelector(".dt-panel");
  const svh = (window.innerWidth || 1200) <= MOBILE_BP ? CONSOLE_SVH_MOBILE : CONSOLE_SVH_DESKTOP;
  const consoleH = consoleShown ? Math.round((window.innerHeight || 800) * svh) : 0;
  const bottomChrome = Math.max(dockBand, consoleH);
  // The floating control card overlays the map's LEFT edge — reserve its live width so
  // fits frame clear of it (0 when absent, e.g. the pre-manifest shell).
  const floatEl = root.querySelector(".pa-float");
  const floatW = floatEl ? Math.round(floatEl.getBoundingClientRect().width) : 0;
  // Clamp so the reserves never swallow the map (else fitBounds clamps to an extreme
  // zoom or yields NaN on a short/narrow window). Keep ≥120px of clear band each axis.
  const bottom = Math.min(M + bottomChrome, Math.max(0, Math.round(rect.height) - M - 120));
  const left = Math.min(M + floatW, Math.max(0, Math.round(rect.width) - M - 120));
  return { top: M, right: M, left, bottom };
}

// Union bbox over many features — the full-city extent or a selected subset.
// [[minLng,minLat],[maxLng,maxLat]] | null when empty.
export function bboxOfFeatures(features) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of features) {
    if (!f?.geometry) continue;
    const [[aX, aY], [bX, bY]] = bboxOfGeom(f.geometry);
    if (aX < minX) minX = aX;
    if (aY < minY) minY = aY;
    if (bX > maxX) maxX = bX;
    if (bY > maxY) maxY = bY;
  }
  return Number.isFinite(minX) ? [[minX, minY], [maxX, maxY]] : null;
}

// Fit the camera to a SET of features' combined extent with chrome-aware padding —
// the shared primitive for the home view (all features), selection-fit (the
// selected subset), and reset. Gentle ease; snaps under reduced motion. Guarded so
// a fit against a mid-teardown map is a no-op.
export function fitToFeatures(map, features, { ease = true, reserveConsole = false } = {}) {
  if (!map || !features || !features.length) return;
  const bbox = bboxOfFeatures(features);
  if (!bbox) return;
  try {
    map.fitBounds(bbox, {
      padding: chromePadding(map, { reserveConsole }),
      duration: ease && !reduceMotion() ? DUR_SLOW : 0,
      maxZoom: 14,
      pitch: 0, bearing: 0, // the FLAT data-derived fit — HOME is the only pitched view
    });
  } catch {
    /* map removed mid-flight — ignore */
  }
}

// Apply the tuned camera PRESET (HOME_VIEW) — center/zoom/pitch/bearing applied as-is. This IS
// the HOME view now: KC's hand-found, ratified framing is a CAPTURED camera, not a fit (the
// bounds-fitting approach overshot twice — see the HOME_VIEW note in choroplethStyle.js). easeTo
// for a gentle landing; jumpTo when reduced-motion is on or a snap is asked for (ease:false, e.g.
// the first load under the skeleton). Shared verbatim by the load/city HOME and the no-selection
// recentre, so the two are ONE camera and never drift. Guarded against a mid-teardown map.
export function applyCameraPreset(map, preset, { ease = true } = {}) {
  if (!map || !preset) return;
  try {
    if (ease && !reduceMotion()) map.easeTo({ ...preset, duration: DUR_SLOW });
    else map.jumpTo(preset);
  } catch {
    /* map removed mid-flight — ignore */
  }
}

// ---- Rail controls: MOVED to components/mapControls.js -------------------
// makeIconButtonControl + railGlyph are now shared across all map sections
// (Property Assessment is the standard; Dwelling Units + Business Counts adopt
// the same rail). Imported from ../../components/mapControls.js where used.

// ---- Helpers --------------------------------------------------------------

function flyToFeature(map, feat, opts = {}) {
  const { duration = 900, ...rest } = opts;
  map.fitBounds(bboxOfGeom(feat.geometry), {
    // Chrome-aware padding so a flown-to neighbourhood frames in the clear map
    // region (above the rack / open console), same as the selection fit. Flat
    // (pitch/bearing 0) — a focus is a data-derived fit, not the pitched home.
    padding: chromePadding(map),
    maxZoom: 14,
    duration: reduceMotion() ? 0 : duration,
    pitch: 0, bearing: 0,
    ...rest,
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
