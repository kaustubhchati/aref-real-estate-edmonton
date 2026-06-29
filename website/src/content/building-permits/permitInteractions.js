// =============================================================================
// permitInteractions.js
//
// Wires the Building Permits POINT map's popups onto a live MapLibre instance:
//   • click a dot  → pinned full-detail popup (+ reports the dot to the sidebar)
//   • double-click → fly-to (does not open/close a popup)
//   • hover a dot  → light preview popup + pointer cursor
//
// Moved out of the retired PermitMapView so the shared components/MapView.jsx can
// drive it from its onLoad hook — the point-map analogue of property-assessment's
// useChoroplethInteractions split (style vs. behaviour in separate files).
//
// onPick(properties): called with the clicked dot's properties so the page can
// fill its last-clicked sidebar panel. A plain callback (not a ref): MapView's
// onLoad fires once and closes over the page's stable state setter.
// =============================================================================

import maplibregl from "maplibre-gl";
import { sidebarLeftPad } from "../../components/mapPadding.js";
import { LAYER_ID, buildPermitPopupHtml, buildPermitHoverHtml } from "./permitStyle.js";

export function wirePermitPopup(map, onPick) {
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
    // Anchor to the dot's exact geographic coordinates, not the click pixel, so
    // the popup tip always points at the dot and doesn't drift on a later pan.
    popup
      .setLngLat(f.geometry.coordinates)
      .setHTML(buildPermitPopupHtml(f.properties))
      .addTo(map);
    // Surface the clicked dot to the page for the sidebar's last-clicked panel.
    onPick?.(f.properties);
  });

  // Fly-to — double click only. Does not open or close any popup.
  map.on("dblclick", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    e.preventDefault();
    // padding.left = live sidebar width so the point lands in the visible area
    // right of the .sb overlay, not centred under it.
    map.flyTo({ center: f.geometry.coordinates, zoom: 15, duration: 900, padding: { left: sidebarLeftPad(map) } });
  });

  map.on("mousemove", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    // GeoJSON features have no stable id here (row_id is not served), so the
    // de-dupe key falls back to address — fine for "did the hovered dot change".
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
