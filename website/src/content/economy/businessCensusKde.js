// =============================================================================
// businessCensusKde.js — View 1 wide-zoom SECTOR-CHARACTER SURFACE (spec §1.1).
//
// Per-sector kernel density, argmax per cell — "urban functional zone
// identification" (grid the city, per-category KDE, assign each cell its dominant
// function). Pure compute; the worker wraps it (viability measured: bin →
// separable-Gaussian → argmax, ~22–65 ms; NOT naive point-by-point ~1.5B ops).
//
// OUTPUT = an RGBA RASTER (not a polygon grid), rendered with BILINEAR resampling
// (KC / cartographic standard): a continuous density surface is smoothed for
// DISPLAY without changing the data — interior cell seams disappear; no-data cells
// are transparent so the outer boundary stays honest (basemap shows through).
//
// COLOUR (KC directions — exploit OKLCH):
//   • ONE fixed LIGHTNESS for the whole surface, LIGHTER than the points, so the
//     surface reads as GROUND and the (darker, more saturated) points as FIGURE —
//     figure-ground by lightness, not by muddy low opacity (spec §1.2).
//   • NACREOUS (pearlescent) ground: a LIGHT band (SURFACE_L) at a low-but-CLEARLY-
//     PRESENT chroma (SURFACE_C_CAP), so a sector is NAMEABLE at city zoom. LIGHTNESS
//     is the figure-ground separator (~0.27 gap to the dark point band); the surface
//     reflects softly, it does not emit — no bloom/additive glow (impossible on a
//     cream basemap). The two-way OKLCH blend + bilinear smoothing IS the pearly
//     sheen (hues shifting between neighbouring sectors).
//   • hue = dominant sector (single) or the OKLCH blend of the top-two (two-way) —
//     blends in OKLCH (perceptual LCH), NEVER RGB. Palette (HUES) shared with the
//     points. Chromatic cells scale chroma with dominance within [floor, ceiling].
//   • THREE distinct neutral meanings (KC), all lightness-separated: MIXED (genuine
//     three-way, ~⅓ of cells) = a PALE warm-grey at the surface L; "Other" GENUINELY
//     DOMINANT = its own MEDIUM grey; NO-DATA = transparent (the cream basemap shows).
//   • "Other" (+ null) is EXCLUDED from the hue argmax (KC), but its density IS
//     tracked so an Other-heavy area is labelled Other-dominant rather than painting
//     a thin named winner vividly.
// =============================================================================

import { oklchLerp, oklchRgb255, maxChromaAt, NEUTRAL_GREY } from "./oklch.js";

const R = 6371000, D2R = Math.PI / 180;
const SURFACE_L = 0.80;      // PALE but CHROMATIC-ENOUGH nacreous band (the ground). At 0.80 every hue
                            // still holds ≥0.10 chroma (blue's gamut limit); higher L collapses the
                            // wash toward grey (KC problem A — a weak surface). Point band L 0.52
                            // (POINT_L, businessCensusPointsStyle.js) → a ~0.28 LIGHTNESS gap = separation.
const SURFACE_C_CAP = 0.11;  // pearlescent chroma ceiling — low but CLEARLY PRESENT (nameable sectors),
                            // per-hue gamut-capped. LOWERED 0.14→0.11 for the co-occurrence arrangement:
                            // it moves the dense retail/consumer family into the HIGH-headroom magenta/red
                            // arc, where 0.14 absolute chroma read as a vivid pink that fought the points.
                            // 0.11 keeps that wash pale (ground) while green/cyan stay nameable.
const SURFACE_C_FLOOR = 0.62;// a chromatic cell's chroma never drops below this × its ceiling, so
                            // single/two-way cells stay legibly coloured (dominance nudges it to 1).
const THREE_WAY_MAX = 0.72;  // 3rd ≥ this × 2nd (and no clear leader) → genuinely MIXED → a neutral,
                            // NOT a pale tint of a non-existent leader (KC: show the ~⅓ three-way honestly).
const DENSITY_FLOOR = 0.4;   // min smoothed density (named + Other) for a cell to render at all
// TWO distinct neutrals, both LIGHTNESS-separated from transparent no-data (which shows the ~L0.94
// cream ground): MIXED = a pale warm-grey at the surface L (no clear sector); OTHER-DOMINANT = the
// points' MEDIUM Other grey (~L0.66; the miscellaneous catch-all leads). Three meanings, three looks.
const MIXED_RGB = oklchRgb255(SURFACE_L, 0.012, 80);
const OTHER_RGB = [1, 3, 5].map((i) => parseInt(NEUTRAL_GREY.slice(i, i + 2), 16));

function gaussKernel(sigmaCells) {
  const rad = Math.max(1, Math.ceil(3 * sigmaCells));
  const w = new Float64Array(2 * rad + 1);
  let s = 0;
  for (let i = -rad; i <= rad; i++) { const v = Math.exp(-(i * i) / (2 * sigmaCells * sigmaCells)); w[i + rad] = v; s += v; }
  for (let i = 0; i < w.length; i++) w[i] /= s;
  return { w, rad };
}
function blur(src, W, H, ker) {
  const { w, rad } = ker;
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { const row = y * W;
    for (let x = 0; x < W; x++) { let a = 0; for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx >= 0 && xx < W) a += src[row + xx] * w[k + rad]; } tmp[row + x] = a; } }
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) { let a = 0; for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy >= 0 && yy < H) a += tmp[yy * W + x] * w[k + rad]; } out[y * W + x] = a; } }
  return out;
}

// computeDominanceSurface — the whole pipeline → an RGBA raster.
//   lon, lat : Float32Array of ALL point coords
//   cat      : Int16Array — named-sector index (≥0), -1 = "Other", -2 = null/excluded
//   palette  : [{L,C,H}] per named sector (index-aligned with cat)
//   params   : { cellSize, bandwidth, domThreshold }
// returns { rgba, width, height, coordinates, coocc, stats }.
export function computeDominanceSurface(lon, lat, cat, palette, params) {
  const { cellSize, bandwidth, domThreshold } = params;
  const NC = palette.length, N = lon.length;

  // project lon/lat → local metres (equirectangular, cos-lat; adequate to SMOOTH
  // points for a display surface — the estimator's UTM precision isn't needed here).
  let latSum = 0; for (let i = 0; i < N; i++) latSum += lat[i];
  const lat0 = latSum / N;
  const kx = R * Math.cos(lat0 * D2R) * D2R, ky = R * D2R;
  let lonMin = Infinity, latMin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (let i = 0; i < N; i++) { if (lon[i] < lonMin) lonMin = lon[i]; if (lat[i] < latMin) latMin = lat[i]; }
  const X = new Float32Array(N), Y = new Float32Array(N);
  for (let i = 0; i < N; i++) { X[i] = (lon[i] - lonMin) * kx; Y[i] = (lat[i] - latMin) * ky; if (X[i] > xmax) xmax = X[i]; if (Y[i] > ymax) ymax = Y[i]; }

  const pad = 3 * bandwidth;
  const W = Math.ceil((xmax + 2 * pad) / cellSize) + 1;
  const H = Math.ceil((ymax + 2 * pad) / cellSize) + 1;
  const ox = -pad, oy = -pad;

  // bin: named sectors (cat≥0) into per-sector bins; "Other" (cat=-1) into its own
  // bin (tracked, not in the argmax); null/excluded (cat=-2) dropped.
  const bins = Array.from({ length: NC }, () => new Float32Array(W * H));
  const otherBin = new Float32Array(W * H);
  for (let i = 0; i < N; i++) {
    const c = cat[i]; if (c === -2) continue;
    const ix = ((X[i] - ox) / cellSize) | 0, iy = ((Y[i] - oy) / cellSize) | 0;
    (c >= 0 ? bins[c] : otherBin)[iy * W + ix] += 1;
  }
  const ker = gaussKernel(bandwidth / cellSize);
  const dens = bins.map((b) => blur(b, W, H, ker));
  const otherDens = blur(otherBin, W, H, ker);

  // per cell → an RGBA pixel (vertically flipped: image row 0 = north = iy H-1).
  const rgba = new Uint8ClampedArray(W * H * 4);
  const coocc = Array.from({ length: NC }, () => new Array(NC).fill(0));
  let single = 0, twoway = 0, mixed = 0, other = 0, populated = 0;
  for (let iy = 0; iy < H; iy++) {
    for (let ix = 0; ix < W; ix++) {
      const cell = iy * W + ix;
      let namedSum = 0, d1 = 0, d2 = 0, d3 = 0, i1 = -1, i2 = -1;
      for (let s = 0; s < NC; s++) {
        const v = dens[s][cell]; namedSum += v;
        if (v > d1) { d3 = d2; d2 = d1; i2 = i1; d1 = v; i1 = s; }
        else if (v > d2) { d3 = d2; d2 = v; i2 = s; }
        else if (v > d3) { d3 = v; }
      }
      const oD = otherDens[cell];
      const px = ix, py = H - 1 - iy, p = (py * W + px) * 4;

      if (namedSum + oD < DENSITY_FLOOR) { rgba[p + 3] = 0; continue; }   // no-data → transparent
      populated++;
      if (i2 >= 0) coocc[Math.min(i1, i2)][Math.max(i1, i2)]++;
      const lead = d1 / (d1 + d2 || 1);                 // leader's share of the top-two ∈ [0.5,1]

      // Classify (single FIRST — a clear leader is never stolen into mixed), then colour.
      // Chromatic cells sit at the pearly ceiling scaled by dominance (floor..1); genuinely
      // three-way cells go to the neutral MIXED grey; Other-dominant to its own grey.
      let rgb;
      if (oD > d1) { rgb = OTHER_RGB; other++; }                          // Other genuinely dominates
      else if (i2 < 0 || lead >= domThreshold) {                         // clear single leader → chromatic
        const H_ = palette[i1].H;
        const f = SURFACE_C_FLOOR + (1 - SURFACE_C_FLOOR) * Math.min(1, (lead - 0.5) / 0.5);
        rgb = oklchRgb255(SURFACE_L, Math.min(maxChromaAt(SURFACE_L, H_), SURFACE_C_CAP) * f, H_);
        single++;
      } else if ((d2 > 0 ? d3 / d2 : 0) > THREE_WAY_MAX) { rgb = MIXED_RGB; mixed++; }  // three-way → neutral
      else {                                                             // two-way → chromatic OKLCH blend
        const H_ = oklchLerp(palette[i1], palette[i2], d2 / (d1 + d2)).H;
        rgb = oklchRgb255(SURFACE_L, Math.min(maxChromaAt(SURFACE_L, H_), SURFACE_C_CAP) * 0.85, H_);
        twoway++;
      }
      rgba[p] = rgb[0]; rgba[p + 1] = rgb[1]; rgba[p + 2] = rgb[2]; rgba[p + 3] = 255;
    }
  }

  // image corners (lon/lat): TL(NW), TR(NE), BR(SE), BL(SW) for the MapLibre image source.
  const invX = 1 / kx, invY = 1 / ky;
  const lonOf = (x) => lonMin + x * invX, latOf = (y) => latMin + y * invY;
  const xW = ox + W * cellSize, yN = oy + H * cellSize;
  const coordinates = [
    [lonOf(ox), latOf(yN)], [lonOf(xW), latOf(yN)],
    [lonOf(xW), latOf(oy)], [lonOf(ox), latOf(oy)],
  ];
  return { rgba, width: W, height: H, coordinates, coocc, stats: { populated, single, twoway, mixed, other } };
}
