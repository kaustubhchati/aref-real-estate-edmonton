// =============================================================================
// mapPadding.js
//
// Camera-padding helper shared by the section fly-to handlers.
//
// Building Permits and Business Census float a control sidebar (.sb) as an ABSOLUTE
// overlay on the LEFT of the map; a feature flown to its geometric centre would land
// partly UNDER it. sidebarLeftPad reads that overlay's width LIVE from the DOM (it
// can collapse on small screens), so a fly-to/fitBounds caller can add it to the
// `left` padding and the feature clears the panel — without over-shifting when the
// panel is absent or stacked in flow.
//
// Property Assessment does NOT use this: its left panel is IN FLOW (the map reflows
// into the canvas beside it), so there is no over-map overlay to compensate for.
// =============================================================================

// Width of a map-edge overlay panel, or 0 when it isn't there OR isn't actually
// overlaying the map. On mobile the panels stack IN FLOW (position:relative/static,
// full width) rather than floating over the map, so padding the camera by their
// width would shove the whole map off and no-op the fitBounds. We only pad when the
// panel is an ABSOLUTE overlay (the desktop case). (If a future responsive collapse
// makes a panel position:fixed AS an over-map overlay, widen this guard to 'fixed'.)
function overlayWidth(map, selector) {
  const el = map.getContainer().closest(".content-map")?.querySelector(selector);
  if (!el || getComputedStyle(el).position !== "absolute") return 0;
  return Math.round(el.getBoundingClientRect().width);
}

// Width of the left .sb sidebar overlay (Building Permits, Business Census), or 0
// if absent / not overlaying. Property Assessment's left panel is in flow, so it
// has no .sb and this returns 0 there.
export function sidebarLeftPad(map) {
  return overlayWidth(map, ".sb");
}
