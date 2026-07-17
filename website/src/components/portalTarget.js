// =============================================================================
// portalTarget.js
//
// Where a portaled overlay (the District menu, the Export menu) must mount.
//
// `document.body` is WRONG the moment the map goes fullscreen, and it fails SILENTLY.
// Fullscreen paints ONLY the fullscreen element's subtree; the rest of the document
// stays in the DOM but is never rendered. So a menu portaled to <body> while
// `.content-map` is fullscreen still exists in every way you would think to check —
// React renders it, `display` is not none, getBoundingClientRect returns a real
// 407x247 box — and simply never appears. The button just looks dead. That is exactly
// how District and Export broke in fullscreen: nothing threw, nothing logged, and the
// element measured fine.
//
// Returning the fullscreen element (when there is one) keeps the overlay inside the
// painted subtree. `position: fixed` still resolves against the viewport — verified
// that no ancestor of `.content-map` sets transform / filter / will-change / contain,
// any of which would re-root fixed children and shift the menus.
//
// Read this at RENDER time, not once at mount: entering fullscreen fires a resize, both
// menus close on resize, and the next open re-reads it — so the target is always current
// for the state the menu actually opens in.
// =============================================================================

export function portalTarget() {
  return document.fullscreenElement ?? document.body;
}
