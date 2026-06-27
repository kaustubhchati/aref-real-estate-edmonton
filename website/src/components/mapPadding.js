// =============================================================================
// mapPadding.js
//
// Camera-padding helpers shared by the section fly-to handlers.
//
// The control overlay (.sb) is an absolute overlay on the LEFT of the map, and
// the Property Assessment info rail (.rail) is its mirror on the RIGHT. A feature
// flown to its geometric centre would land partly UNDER whichever overlay sits on
// that side. Each helper reads its overlay's width LIVE from the DOM (the panels
// can collapse on small screens), so a fly-to/fitBounds caller can add it to the
// matching `padding` edge and the feature clears the panel — without over-shifting
// when the panel is absent or collapsed. Each returns 0 when its overlay is not
// present (defensive), so a section with only a left panel pays nothing on the right.
// =============================================================================

// Width of a map-edge overlay panel, or 0 when it isn't there OR isn't actually
// overlaying the map. On mobile the panels stack IN FLOW (position:relative, full
// width) rather than floating over the map, so padding the camera by their width
// would shove the whole map off and no-op the fitBounds. We only pad when the
// panel is an absolute overlay (the desktop case).
function overlayWidth(map, selector) {
  const el = map.getContainer().closest(".content-map")?.querySelector(selector);
  if (!el || getComputedStyle(el).position !== "absolute") return 0;
  return Math.round(el.getBoundingClientRect().width);
}

// Width of the left overlay, or 0 if absent / not overlaying. A section renders
// exactly one of these: PA's floating control box (.pa-box--left) or the shared
// .sb sidebar (Building Permits, Business Census) — the selector list resolves to
// whichever is present, so PA's rename doesn't drop BP/BC camera padding.
export function sidebarLeftPad(map) {
  return overlayWidth(map, ".pa-box--left, .sb");
}

// Width of the right info rail (.rail), or 0 if absent / not overlaying. Mirror
// of sidebarLeftPad — keeps a flown-to neighbourhood clear of the PA detail rail.
export function sidebarRightPad(map) {
  return overlayWidth(map, ".rail");
}
