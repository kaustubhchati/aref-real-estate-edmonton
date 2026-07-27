// =============================================================================
// amenityGlyphs.js
//
// The GLYPH + layer-IDENTITY config for the amenity point maps — the "glyph is a second data
// channel" rule (DESIGN_SYSTEM §8 / CC directive 2026-07-27). The icons are a PRESENTATION concern
// (cream Maki PNGs), so this config lives on the frontend, not in the backend manifest.
//
// THE RULE (§2). Where a category axis has natural iconography, the GLYPH carries the category and
// the disc is ONE identity hue. Where it does not, the disc carries the category (colour) and the
// glyph identifies the layer.
//   channel "glyph"  → glyph carries category: disc = identityHue, icon-image = match(field → glyph)
//   channel "colour" → colour carries category: disc = per-category palette, icon-image = layerGlyph
//   channel "none"   → single symbol:           disc = identityHue,          icon-image = layerGlyph
//
// Identity hues (Tier 1, §5) are drawn from QUALITATIVE_12 (the ratified categorical palette —
// Vivid-10 was retired), avoiding the basemap water-blue and park-green bands.
// =============================================================================

import { assetUrl } from "../../utils/assetUrl.js";
import { QUALITATIVE_12 } from "./amenityPointStyle.js";

// Every icon PNG in public/icons/ (Maki 8.2.0, CC0 — see public/icons/README.md). Loaded once per
// map; loading them all (≈32 KB) is simpler than a per-layer list and they are cached by name.
export const AMENITY_ICONS = [
  "bus", "rail-light", "playground", "charging-station", "swimming", "police", "pitch",
  "stadium", "fitness-centre", "park", "park-alt1", "tennis", "golf", "skiing", "theatre", "art-gallery",
];

// The PNGs are rasterised at 64 px; pixelRatio 4 → 16 px natural, scaled by the glyph layer's
// icon-size. One constant so the raster size and this stay in sync.
export const ICON_PIXEL_RATIO = 4;

// Per amenity layer. Only layers with a glyph entry get glyphs; the rest render unchanged (disc
// only). Recreation Facilities is the proof of the glyph-carries-category rule — its eleven facility
// types become ONE orange disc + eleven glyphs, retiring the eleven-hue / three-greens problem.
export const GLYPH_CONFIG = {
  recreation_facilities: {
    identityHue: QUALITATIVE_12[1],   // #ff8c1a — orange, clear on cream, off the water/park bands
    channel: "glyph",
    field: "facility_type",
    glyphByCategory: {
      "Arena": "stadium",
      "Recreation Centre": "fitness-centre",
      "River Valley Park": "park-alt1",
      "Tennis Court": "tennis",
      "Staffed Sports Field": "pitch",
      "City Park": "park",
      "Outdoor Pool": "swimming",
      "Snowshoeing": "skiing",           // approximate — no snowshoe glyph in Maki (KC-ratified)
      "Golf Course": "golf",
      "Arts Booking Facility": "theatre",
      "Arts Program Facility": "art-gallery",
    },
  },
  // colour-carries-category + single-symbol layers are wired in the roll step (playgrounds /
  // ev_charging / spray_parks → channel "colour"; bus_stops / police_stations /
  // track_sports_fields / lrt_stops → channel "none"), each with a single layer glyph.
};

// Register every amenity icon on the map (idempotent). Resolves once all are loaded, so the caller
// can add the glyph layer AFTER — no missing-image flash. A failed icon just means no glyph.
export function loadAmenityIcons(map) {
  return Promise.all(AMENITY_ICONS.map(async (name) => {
    if (map.hasImage(name)) return;
    try {
      const resp = await map.loadImage(assetUrl(`/icons/${name}.png`));
      if (!map.hasImage(name)) map.addImage(name, resp.data, { pixelRatio: ICON_PIXEL_RATIO });
    } catch { /* missing icon → no glyph, never throw */ }
  }));
}

// The icon-image expression for a layer's glyph config: a per-category MATCH (glyph channel) or a
// single constant image (colour / none channels). Unmapped categories fall through to "" (no glyph).
export function iconImageExpression(cfg) {
  if (cfg.channel === "glyph") {
    const arms = [];
    for (const [category, glyph] of Object.entries(cfg.glyphByCategory)) arms.push(category, glyph);
    return ["match", ["get", cfg.field], ...arms, ""];
  }
  return cfg.layerGlyph ?? "";   // colour / none channels carry a single layer glyph
}
