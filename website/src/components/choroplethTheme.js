// =============================================================================
// choroplethTheme.js
//
// Shared paint tunables that fix low-value choropleth polygons blanking into the
// warm Apple-Classic land (#f7f1df). The OrRd / cream→red sequential ramps are
// tuned for WHITE backgrounds: their lightest bucket is near-white (#f5f0e8) and
// disappears into the cream land, so low-data, no-data, and the basemap read as
// one blur. Two paint-level fixes, shared by every choropleth section so a tweak
// is one edit:
//   • POLY_OUTLINE_COLOR — a muted grey-brown stroke on every data polygon, so
//     a shape is legible against both the cream land and the warm ramp (replaces
//     the white aggregated outline, which itself blanked on cream).
//   • RAMP_FLOOR — floors the ramp's lowest stop just off near-white to a pale
//     peach, so the minimum bucket keeps warm character but is distinct from the
//     land. (Mirrors CARTO's non-white-background adaptation of ColorBrewer.)
//
// Behind FIX_LOWVAL_BLANKING so KC can A/B against the current look. The helpers
// gate BOTH changes in one place: pass the pre-fix fallback, get the fix when on.
// =============================================================================

export const FIX_LOWVAL_BLANKING = true;

// Muted grey-brown — reads against both cream land and the warm ramp.
export const POLY_OUTLINE_COLOR = "#b8ae96";
// Soft warm yellow low-stop — gentle (not lemon), clearly distinct from the
// cream basemap (#f7f1df) so the lowest OrRd band reads as DATA, not basemap.
// Shared min for the sequential ramps that call rampFloor(): Dwelling Units
// (RAMP_SEQ), Business Census (RAMP_ORRD), + Property Assessment (RAMP_ASSESSED's
// $-value floor). Tunable — nudge here after eyeball.
export const RAMP_FLOOR = "#fbe3a0";

// Gate the outline colour (fallback = the pre-fix white the layers used).
export const polyOutline = (fallback) =>
  FIX_LOWVAL_BLANKING ? POLY_OUTLINE_COLOR : fallback;

// Gate a ramp's lowest stop (fallback = the pre-fix near-white the ramp used).
export const rampFloor = (fallback) =>
  FIX_LOWVAL_BLANKING ? RAMP_FLOOR : fallback;

// Standard data-polygon stroke width: ~0.5px wide-zoom → ~1px street-zoom.
// Subtle discriminator, not a heavy grid. Shared so all sections match.
export const POLY_OUTLINE_WIDTH = [
  "interpolate", ["linear"], ["zoom"],
  7, 0.5, 13, 1.0,
];
