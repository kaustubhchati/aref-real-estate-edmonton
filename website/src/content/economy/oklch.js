// =============================================================================
// oklch.js — OKLCH ⇄ sRGB colour math (Björn Ottosson's OKLab matrices).
//
// Shared by the sector palette (businessCensusPointsStyle) AND the KDE dominance
// surface (businessCensusKde), so the surface and the points read the SAME hues —
// "an amber wash resolves into amber dots" (spec §1.2). All blending / saturation
// modulation happens HERE, in OKLCH (a perceptual LCH space): the spec's §1.1 rule
// is "LAB or LCH, never RGB — RGB interpolation between distant hues passes through
// mud." OKLCH satisfies that (it is a modern perceptual LCH). Nothing downstream
// touches the raw matrices — treat the exported functions as the interface.
// =============================================================================

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}
const inGamut = (rgb) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

// linear sRGB → gamma-encoded #hex, clamped.
export function gammaHex(rgb) {
  return "#" + rgb.map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  }).join("");
}

// Gamut-map (L, C, hue): drop chroma until sRGB holds the colour (preserves hue +
// lightness; only saturation gives on hard hues). Returns the printable spec +hex,
// so the surface can MODULATE and BLEND from the same {L,C,H} the palette uses.
export function gamutMapLCH(L, C, hDeg) {
  let c = C, rgb = oklchToRgb(L, c, hDeg);
  while (!inGamut(rgb) && c > 0) { c -= 0.005; rgb = oklchToRgb(L, c, hDeg); }
  return { L, C: c, H: hDeg, hex: gammaHex(rgb) };
}
export const oklchHex = (L, C, hDeg) => gamutMapLCH(L, C, hDeg).hex;

// Interpolate two OKLCH colours {L,C,H} by t∈[0,1] along the SHORTEST hue arc, in
// OKLCH — the perceptual (non-mud) blend the spec requires. Returns {L,C,H}.
export function oklchLerp(a, b, t) {
  let dh = b.H - a.H;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;   // shortest arc
  return { L: a.L + (b.L - a.L) * t, C: a.C + (b.C - a.C) * t, H: a.H + dh * t };
}

// {L,C,H} → in-gamut #hex.
export const oklchObjHex = ({ L, C, H }) => oklchHex(L, C, H);

// The shared neutral grey — the points' "Other" bucket AND the surface's
// Other-dominant class (both mean "the miscellaneous catch-all"), one value,
// imported by both. A reused literal (matches permitStyle's fallback grey).
export const NEUTRAL_GREY = "#9aa0a6";

// {L,C,hue} → [r,g,b] 0–255 (gamma-encoded, clamped). For the KDE RASTER: C must
// already be in gamut (use maxChromaAt) so there is no per-pixel gamut search.
export function oklchRgb255(L, C, hDeg) {
  return oklchToRgb(L, C, hDeg).map((c) => {
    const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
}

// The most chroma sRGB holds at (L, hue) — the vivid ceiling for the surface's
// chroma-drives-dominance ramp, so a light-L surface still reaches its true max.
export const maxChromaAt = (L, hDeg) => gamutMapLCH(L, 0.4, hDeg).C;
