// =============================================================================
// amenityGlyphs.js
//
// The GLYPH + layer-IDENTITY config for the amenity point maps — the "glyph is a second data
// channel" rule (DESIGN_SYSTEM §8 / CC directive 2026-07-27). The icons are a PRESENTATION concern
// (cream Maki PNGs), so this config lives on the frontend, not in the backend manifest.
//
// THE RULE (DESIGN_SYSTEM §1, revised KC 2026-07-27). Where a category axis has natural iconography,
// COLOUR AND GLYPH BOTH carry it — redundant encoding measurably beats either channel alone (≈88% vs
// 66% colour-only vs 58% shape-only), survives colour-vision deficiency, and survives the overview
// zoom where glyphs drop out but colour does not. Where a category has no iconography, colour carries
// the category and the glyph identifies the layer.
//   channel "both"   → colour+glyph both carry it: disc = per-category (family-grouped), glyph = match(field→glyph)
//   channel "colour" → colour carries category:    disc = per-category palette,          glyph = single layerGlyph
//   channel "none"   → single symbol:              disc = identityHue,                    glyph = single layerGlyph
//
// AN ICON SET IS A GLYPH SOURCE, NEVER A PALETTE SOURCE (DESIGN_SYSTEM §8, KC 2026-07-27). Maki
// supplies shapes; colour comes from QUALITATIVE_12 (the site categorical palette — greens fixed,
// KC-ratified 2026-07-27). Every layer gets its OWN identity hue (Tier 1, §5), so with the exclusive
// selector the disc colour tells the reader which layer they are on — a single hue across layers
// would make the switch communicate nothing. Two exclusions on the warm cream basemap: keep clear of
// the WATER blue (Spray Parks → high-chroma teal) and the PARK green (EV → saturated emerald), and
// avoid warm hues that sit in the cream band (no orange — a figure-ground failure, §3.2). Assigned so
// no two layers sharing a section sit adjacent on the wheel.
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

// Per amenity layer: its identity hue (Tier 1) + how the category is carried + its glyph(s). The hue
// index into QUALITATIVE_12 is noted so the wheel spacing is auditable. bus_stops / lrt_stops render
// in their own components (density / network) but keep their config here so the selector chip and
// those maps read ONE source.
export const GLYPH_CONFIG = {
  // ── Public Transportation section ──────────────────────────────────────────
  bus_stops:             { identityHue: QUALITATIVE_12[7],  channel: "none",   layerGlyph: "bus" },          // blue   — established transit blue
  lrt_stops:             { identityHue: QUALITATIVE_12[11], channel: "none",   layerGlyph: "rail-light" },   // petrol — deep, distinct from bus; LINES keep official ETS colours (§5 exception)
  // ── Parks and Recreation section (4 layers → spread across the wheel) ───────
  playgrounds:           { identityHue: QUALITATIVE_12[0],  channel: "colour", layerGlyph: "playground" },       // rose  — chip/identity; disc stays per-age-band
  spray_parks:           { identityHue: QUALITATIVE_12[5],  channel: "colour", layerGlyph: "swimming" },         // teal  — off the WATER-blue band (§5 trap)
  track_sports_fields:   { identityHue: QUALITATIVE_12[3],  channel: "none",   layerGlyph: "pitch" },            // lime  — field/grass read
  recreation_facilities: {
    // COLOUR + GLYPH (KC 2026-07-27): all 11 facility types get their own hue AND glyph. Hue adjacency
    // is SEMANTIC (§3) — categories that must sit close in hue belong to the same FAMILY, a
    // lightness/saturation step separates members within a family, and the glyph names the specific
    // thing. So the only confusable hue-pairs are same-kind, and the glyph resolves them regardless.
    // Families: GREEN space (greens) · BUILT & indoor (purples) · SPORTS surface (roses) · WATER
    // (cyan) · WINTER (periwinkle). Identity hue = the dominant family (Built, the most features), not
    // a 12th colour (§6.5). Base hues are QUALITATIVE_12 family anchors; the within-family steps are
    // lightness variants of those. Verify ON SCREEN, not in the registry (§3 caution).
    identityHue: QUALITATIVE_12[8],   // purple — Built & indoor is the dominant family (Arena+RecCentre = 43 of 109)
    channel: "both",
    prominent: true,                  // larger disc + glyph from the home overview (sparse, 109 pts — KC 2026-07-27)
    field: "facility_type",
    colourByCategory: {
      // GREEN space — deep → light green
      "River Valley Park": "#15803d",
      "City Park":         "#22c55e",
      "Golf Course":       "#4ade80",
      // BUILT & indoor — deep → light purple
      "Arena":                 "#6d28d9",
      "Recreation Centre":     "#a855f7",
      "Arts Booking Facility": "#c084fc",
      "Arts Program Facility": "#d8b4fe",
      // SPORTS surface — deep → light rose
      "Tennis Court":         "#e11d48",
      "Staffed Sports Field": "#fb7185",
      // WATER
      "Outdoor Pool": "#06b6d4",
      // WINTER
      "Snowshoeing": "#818cf8",
    },
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
  // ── Standalone (one-layer selectors have nothing to select — §2) ────────────
  police_stations:       { identityHue: QUALITATIVE_12[9],  channel: "none",   layerGlyph: "police" },        // magenta — distinct + vivid; the shield glyph carries the meaning
  ev_charging:           { identityHue: QUALITATIVE_12[4],  channel: "colour", layerGlyph: "charging-station" }, // emerald — convention green, clear of the muted park fill (§5); disc per-level
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

// The icon-image expression for a layer's glyph config: a per-category MATCH ("both" channel, glyph
// carries category alongside colour) or a single constant image ("colour" / "none" channels — the
// glyph identifies the layer). Unmapped categories fall through to "" (no glyph).
export function iconImageExpression(cfg) {
  if (cfg.channel === "both") {
    const arms = [];
    for (const [category, glyph] of Object.entries(cfg.glyphByCategory)) arms.push(category, glyph);
    return ["match", ["get", cfg.field], ...arms, ""];
  }
  return cfg.layerGlyph ?? "";   // colour / none channels carry a single layer glyph
}
