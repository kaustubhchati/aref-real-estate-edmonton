// =============================================================================
// mapPadding.js
//
// Camera-padding helper shared by the section fly-to handlers.
//
// The sidebar (.sb) is an absolute overlay on the LEFT of the map, so a feature
// flown to the geometric centre lands partly UNDER it. sidebarLeftPad reads the
// sidebar's width LIVE from the DOM (it animates open/closed and collapses on
// small screens), so a fly-to/fitBounds caller can add it to `padding.left` and
// the feature clears the panel — without over-shifting when the sidebar is
// collapsed. Returns 0 when there is no sidebar (defensive).
// =============================================================================

export function sidebarLeftPad(map) {
  const sb = map.getContainer().closest(".content-map")?.querySelector(".sb");
  return sb ? Math.round(sb.getBoundingClientRect().width) : 0;
}
