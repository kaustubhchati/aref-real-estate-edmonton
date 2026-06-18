// =============================================================================
// interactions.js  (Building Permits neighbourhood choropleth)
//
// Section-specific map behaviour for the permit choropleth: hover popup,
// click-to-pin popup, click-empty-to-clear, and feature-state hover/pin on the
// fill layer. Mirrors property-assessment/interactions.js but TRIMMED — this
// section has no neighbourhood search and no copy-stats button, so the fly-to-
// by-name surface and the copy wiring are dropped.
//
// Wired via MapView's onLoad(map) hook; MapView stays interaction-agnostic.
//
// `metric` is the currently-selected METRIC (permitChoroplethStyle.METRICS). It
// is threaded into every popup so the chosen metric's row is the headline. The
// hook re-installs when the metric changes so a freshly-opened popup reflects it.
// =============================================================================

import { useEffect } from "react";
import maplibregl from "maplibre-gl";
import { buildPermitChoroplethPopupHtml } from "./permitChoroplethStyle.js";

const SOURCE_ID = "permit-nbhd";
const FILL_LAYER_ID = "permit-nbhd-fill";
const ID_PROPERTY = "Neighbourhood ID";

// ---- Public hook -----------------------------------------------------------
// Installs handlers once when BOTH map and gj are ready; tears them down on
// unmount and re-installs when map / gj / metric changes.
export function useChoroplethInteractions(map, gj, metric) {
  useEffect(() => {
    if (!map || !gj) return undefined;
    const api = installChoroplethInteractions(map, gj, metric);
    return () => api.cleanup();
  }, [map, gj, metric]);
}

// ---- Plain-JS installer ----------------------------------------------------
export function installChoroplethInteractions(map, gj, metric) {
  const hoverPopup = new maplibregl.Popup({
    closeButton: false, closeOnClick: false, offset: 8, maxWidth: "320px",
  });
  const pinnedPopup = new maplibregl.Popup({
    closeButton: true, closeOnClick: false, offset: 8, maxWidth: "320px",
  });

  // promoteId rewrites every feature.id to "Neighbourhood ID", so feature-state
  // survives source updates. Track ids, not array indices.
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
      .setHTML(buildPermitChoroplethPopupHtml(f.properties, metric))
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
      .setHTML(buildPermitChoroplethPopupHtml(f.properties, metric))
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

  function cleanup() {
    map.off("mousemove", FILL_LAYER_ID, onMouseMove);
    map.off("mouseleave", FILL_LAYER_ID, onMouseLeave);
    map.off("click", FILL_LAYER_ID, onClickFill);
    map.off("click", onMapClick);
    hoverPopup.remove();
    pinnedPopup.remove();
  }

  return { cleanup };
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
