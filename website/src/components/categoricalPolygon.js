// =============================================================================
// categoricalPolygon.js
//
// The GENERIC categorical (nominal-class) polygon-fill standard — layer builders
// + pattern-image factories shared by every large-area class map (first
// consumers: the schools proof route, then Zoning). This module knows NOTHING
// about zoning: callers pass a class FIELD and a DOMAIN and get MapLibre layer
// specs back (MapView fills in the source), the same shape amenityPointStyle
// gives the point maps.
//
// A DOMAIN is an ordered array of items, one per class:
//   { key, label, colour }                                — flat hue fill
//   { key, label, pattern: { kind: "hatch"|"dots", base, ink } }
//                                                         — non-hue PATTERN fill
//     (DESIGN_SYSTEM §1.4 polygon law part 3: governance categories render as a
//      pattern, never a hue). `base` is the background, `ink` the stroke/dot.
//
// WHY two fill layers, not one: MapLibre's fill-pattern, once set, overrides
// fill-color for every feature in the layer — a single layer cannot mix flat
// and patterned features. So the standard is a BASE layer that flat-fills every
// feature (pattern items contribute their pattern's `base` colour, which keeps
// tiny polygons readable at overview where an 8-px pattern is sub-pixel) plus a
// PATTERN layer filtered to just the patterned classes, drawn over its own base.
// =============================================================================

// Fallback for a class value not in the domain (or a null) — the warm neutral
// frame tone from the design schematic, quiet on the cream ground.
export const UNMATCHED_FILL = "#c9c2b2";

// The fill colour every feature gets on the BASE layer: flat items their hue,
// pattern items their pattern's base tone, everything else the fallback.
export function buildPolygonFillColour(classField, items, fallback = UNMATCHED_FILL) {
  if (!items?.length) return fallback;
  const arms = [];
  for (const it of items) arms.push(it.key, it.pattern ? it.pattern.base : it.colour);
  return ["match", ["get", classField], ...arms, fallback];
}

// BASE fill layer — every feature, flat-filled from the domain.
export function polygonFillLayer({ id, classField, items, opacity = 1, fallback }) {
  return {
    id,
    type: "fill",
    paint: {
      "fill-color": buildPolygonFillColour(classField, items, fallback),
      "fill-opacity": opacity,
      "fill-color-transition": { duration: 0 },
      "fill-opacity-transition": { duration: 0 },
    },
  };
}

// PATTERN fill layer — only the patterned classes, fill-pattern per class.
// Returns null when the domain has no pattern items (schools; a future all-hue
// layer) so callers can spread `...(layer ? [layer] : [])`.
export function polygonPatternLayer({ id, classField, items }) {
  const patterned = (items ?? []).filter((it) => it.pattern);
  if (!patterned.length) return null;
  const arms = [];
  for (const it of patterned) arms.push(it.key, patternImageId(it));
  return {
    id,
    type: "fill",
    filter: ["in", ["get", classField], ["literal", patterned.map((it) => it.key)]],
    paint: {
      // match needs a fallback image id; the filter means it never fires, so
      // reuse the first pattern's id rather than referencing a missing image.
      "fill-pattern": ["match", ["get", classField], ...arms, patternImageId(patterned[0])],
    },
  };
}

// Legend/map show-hide filter: null = everything visible (no filter). Otherwise
// keep only the active classes — hiding is a FILTER (render + hit-test), never
// opacity:0 (the point-standard rule, kept here).
export function polygonClassFilter(classField, activeKeys, items) {
  if (!items?.length || !activeKeys || activeKeys.size >= items.length) return null;
  return ["in", ["get", classField], ["literal", items.filter((it) => activeKeys.has(it.key)).map((it) => it.key)]];
}

// ---- Pattern images ---------------------------------------------------------
// 8×8 rasters matching the SVG pattern definitions 1:1 (patternUnits are the
// spec — docs/design/zoning_family_fill_schematic_edmonton.svg <defs>). Returned
// as ImageData for MapView's `images` prop.

export function patternImageId(item) {
  return `catpoly-${item.pattern.kind}-${item.key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

// One [{ id, make }] entry per patterned class — MapView registers them before
// the layers are added.
export function patternImages(items) {
  return (items ?? [])
    .filter((it) => it.pattern)
    .map((it) => ({
      id: patternImageId(it),
      make: () =>
        it.pattern.kind === "dots"
          ? makeDotImage(it.pattern.base, it.pattern.ink)
          : makeHatchImage(it.pattern.base, it.pattern.ink),
    }));
}

function patternCanvas(size = 8) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

// Diagonal hatch: base square + one ⟋ stroke (SVG: path M0 8L8 0, width 0.9).
export function makeHatchImage(base, ink) {
  const [c, ctx] = patternCanvas(8);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 8, 8);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(8, 0);
  // Repeat the stroke in the two corners so the hatch tiles seamlessly.
  ctx.moveTo(-4, 4);
  ctx.lineTo(4, -4);
  ctx.moveTo(4, 12);
  ctx.lineTo(12, 4);
  ctx.stroke();
  return ctx.getImageData(0, 0, c.width, c.height);
}

// Dot grid: base square + one centred dot (SVG: circle cx4 cy4 r0.9).
export function makeDotImage(base, ink) {
  const [c, ctx] = patternCanvas(8);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(4, 4, 0.9, 0, Math.PI * 2);
  ctx.fill();
  return ctx.getImageData(0, 0, c.width, c.height);
}
