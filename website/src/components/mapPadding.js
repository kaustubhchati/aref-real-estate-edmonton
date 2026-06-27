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

// Width of the left control overlay (.sb), or 0 if there isn't one.
export function sidebarLeftPad(map) {
  const sb = map.getContainer().closest(".content-map")?.querySelector(".sb");
  return sb ? Math.round(sb.getBoundingClientRect().width) : 0;
}

// Width of the right info rail (.rail), or 0 if there isn't one. Mirror of
// sidebarLeftPad — keeps a flown-to neighbourhood clear of the PA detail rail.
export function sidebarRightPad(map) {
  const rail = map.getContainer().closest(".content-map")?.querySelector(".rail");
  return rail ? Math.round(rail.getBoundingClientRect().width) : 0;
}
