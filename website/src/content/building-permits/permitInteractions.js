// =============================================================================
// permitInteractions.js
//
// Wires the Building Permits POINT map's hover + click to CALLBACKS — no floating
// popups. The detail now lives in the fixed right INFORAIL (the map centre is sacred,
// per PA_MODE_CONTRACT §1 / the BP re-home directive); this file only reports what the
// cursor is over and lets the page render it in the reserved frame.
//   • hover a dot  → onHover(properties)  → the inforail's light "runner"
//   • click a dot  → onSelect(properties) → the inforail's full detail
//   • click empty  → onSelect(null)       → clears the selection (besides the frame's ✕)
//   • mouseleave   → onHover(null) + reset the pointer cursor
//
// Double-click is deliberately NOT wired here — it is left at the MapLibre default (zoom in)
// to match PA / the other maps (gesture-parity directive); BP no longer overrides it for a
// fly-to. Both handlers are plain callbacks (not refs): MapView's onLoad fires once and closes
// over the page's stable state setters. Replaces the old buildPermit*Html popups — the same
// fields now render in the inforail with DESIGN_SYSTEM chrome.
// =============================================================================

import { LAYER_ID } from "./permitStyle.js";

export function wirePermitInteractions(map, { onHover, onSelect }) {
  // De-dupe hover reports to one per dot (mousemove fires per pixel); the key falls back
  // to address because the served GeoJSON has no stable feature id (row_id isn't emitted).
  let lastHoveredId = null;

  // Click a dot → select it (fills the inforail's full detail, pinned until dismissed).
  map.on("click", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    onSelect?.(e.features[0].properties);
  });

  // Click empty map (not a dot) → clear the selection. queryRenderedFeatures on the dot
  // layer: no hit means the click missed every dot, so it's a "dismiss" (the inforail's
  // ✕ is the other way out). When the click IS on a dot, hits is non-empty and the layer
  // handler above owns it, so this never fights the select.
  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER_ID] });
    if (!hits.length) onSelect?.(null);
  });

  // Hover → report the dot under the cursor (only when it changes). The FRAME never
  // moves — the page swaps the inforail's content — so there is no popup to position and
  // no follow-the-cursor drift to correct.
  map.on("mousemove", LAYER_ID, (e) => {
    if (!e.features?.length) return;
    const f = e.features[0];
    const fid = f.id ?? f.properties?.address;
    if (fid !== lastHoveredId) {
      lastHoveredId = fid;
      onHover?.(f.properties);
    }
  });

  map.on("mouseleave", LAYER_ID, () => {
    lastHoveredId = null;
    onHover?.(null);
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
}
