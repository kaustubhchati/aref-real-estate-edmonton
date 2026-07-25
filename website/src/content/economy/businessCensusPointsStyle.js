// =============================================================================
// businessCensusPointsStyle.js
//
// The visual contract for the Business Census POINT map (one dot per business),
// the section's own style module — NOT shared with the BC choropleth
// (businessCensusStyle.js) or with PA/BP. The point map reads this file and
// nothing else for styling (DESIGN_SYSTEM.md §6: one source of truth per section).
//
// This is a FIRST-LOOK build for evaluation. Symbology is deliberately plain:
//   • UNIFORM circles — ONE size per zoom (NOT data-proportional): constant opacity +
//     halo, plus a GENTLE high-zoom radius ramp (slightly larger spots when zoomed in,
//     so a dot reads against a building footprint). No per-feature sizing, no clustering,
//     no heatmap.
//   • Colour by `colour_key` — the pipeline's top-10 sectors by count + the
//     "Other" collapse bucket (+ "Unclassified" for a null sector, 0 today).
//   • ALL businesses render; nothing is filtered out for display.
//
// PALETTE — PLACEHOLDER, pending DESIGN_SYSTEM ratification (raise, don't resolve):
//   DESIGN_SYSTEM.md has NO categorical/qualitative palette — §1.3 reserves every
//   hue for a fixed meaning (green=growth, coral=decline, blue=city, violet=
//   selection, teal=interactive) and §1.4 defines only sequential/diverging ramps.
//   So there is nothing to "take" for 10 nominal sectors. KC's ruling: GENERATE the
//   sector hues programmatically (OKLCH, perceptually-even rotation), grey for
//   "Other". This is refresh-proof (the hue COUNT follows the data) and is not a
//   hand-picked literal, but it is NOT yet design-law — it must be ratified (and
//   checked against §1.3's reserved hues) before it ships beyond this evaluation.
//   Deliberately retained for KC to eyeball: 10 hues 36° apart WILL have close
//   pairs (the "10 > ~7 distinguishable" concern) — that is the point of the look.
//   FLAG #2 (retained verbatim, NOT resolved): the grey "Other" collapse bucket
//   sits adjacent in the legend to the real COLOURED sector "Other services (except
//   public administration)" — near-identical labels, one a hue and one grey, both
//   live in this data (top-3). Left as-is for KC to judge; do NOT rename or merge.
//   Two NON-generated literals also await §1.3 ratification: OTHER_COLOUR (grey — a
//   reused neutral) and UNKNOWN_COLOUR (slate — hand-picked, see below).
//
// DATA-DRIVEN, no hardcoded sector list: the sectors and their rank come from the
// loaded features (deriveSectorDomain). Only the two STRUCTURAL bucket labels
// ("Other", "Unclassified") are referenced as constants — they mirror the
// pipeline's fixed OTHER_LABEL / UNCLASSIFIED_LABEL (02_build_business_census_
// points.R), not the changeable sector names. If the pipeline renames a bucket,
// update the two constants below (a flagged one-line coupling).
// =============================================================================

import { CITY_BOUNDS } from "../../config/cityBounds.js";
import { POINT_CASING } from "./businessCensusGround.js";   // shared dark point casing (View 1 + View 2)

// Basemap style is shared + base-resolved; re-exported so the page imports one place.
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";

// Reuse the BC section's map framing (same centre + city-locked bounds as the
// choropleth) so the two Business Census maps sit on the same ground.
export const MAP_VIEW = {
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 18,
  maxBounds: CITY_BOUNDS.Edmonton,
};

export const SOURCE_ID = "bcensus-points";
export const LAYER_ID  = "bcensus-points-circles";

// The two STRUCTURAL bucket labels the pipeline emits (mirror 02's OTHER_LABEL /
// UNCLASSIFIED_LABEL). NOT the sector list — those are data-derived below.
export const OTHER_KEY        = "Other";
export const UNCLASSIFIED_KEY = "Unclassified";

// Non-sector colours (structural, so they read as "not a sector"):
//   • OTHER  → neutral grey (the heterogeneous catch-all reads as "everything
//     else", never a real category). Reuses BP's fallback grey literal.
//   • UNCLASSIFIED / null / unexpected → one distinct slate, clearly off the hue
//     wheel and off the "Other" grey, so a missing/unknown sector is visible and
//     NEVER folds into the "Other" colour (the directive's null-honesty rule).
export const OTHER_COLOUR   = NEUTRAL_GREY;   // shared with the surface's "mixed" class (one source)
export const UNKNOWN_COLOUR = "#3d4450";      // dark slate — Unclassified / null / unexpected
// FLAG (§5, pre-existing, 0 live features): this dark slate is the ONE fill that does NOT clear the
// §5 dark casing (#141018) at the 3:1 non-text floor — dark-on-dark, ~1.9:1. It predates §5 and
// renders 0 features today (nullCount is 0). If an Unclassified dot ever appears it would separate
// poorly from its own casing; revisit the slate (lighten it) if that data materialises. KC's call.

// ---- OKLCH sector hues — vibrant house style + co-occurrence arrangement ----
// Colour math lives in oklch.js (shared with the KDE surface so both read the SAME
// hues per sector — an amber wash resolves into amber dots, spec §1.2).
import { rgbToOklch, NEUTRAL_GREY } from "./oklch.js";

// VIBRANT BAND (KC — match Building Permits' register): BP's dots read vivid from
// CHROMA AT GAMUT-MAX, not from being light (BP orange L0.71/violet L0.47, both C~0.18).
// So the vibrancy lever here is CHROMA: the old 0.20 cap is REMOVED — every hue goes to
// its per-hue sRGB ceiling (POINT_C 0.40 = "as much as gamut allows"). Ten evenly-spaced
// hues at gamut-max are NOT uniformly vivid (yellow/cyan have far less headroom than
// red/violet) — that warm/cool asymmetry IS the house style, do NOT flatten to the weakest.
//
// SURFACED TO KC (a real conflict, resolved toward the design system's own rules): the
// directive asked to also RAISE L toward BP's ~0.59. That does NOT transfer to BC and is
// held at 0.52 instead, because — unlike BP, whose ground is plain neutral CREAM — BC's
// ground is the CHROMATIC KDE surface. Raising L to 0.60 (a) fails 4.5:1 vs cream for
// EVERY hue (~3.0–4.1:1; only L≤0.52 clears it, min 4.63:1 at cyan 169°), and worse
// (b) collapses figure-ground: light-vivid dots dissolve into the light-vivid surface
// (measured — the L0.60 build). Keeping the DARK band preserves both the WCAG floor and
// the lightness gap; the gamut-max chroma + the co-occurrence arrangement (below) already
// deliver BP-level vividness. So: vibrancy via chroma, separation via lightness.
// SECTOR → PALETTE-SLOT ARRANGEMENT (spec §1.1 — APPLIED, KC-ratified). The wheel ORDER (not
// count rank) so within-family pairs sit adjacent (legible two-way blends) and cross-
// family pairs sit distant. ROTATED (via ARRANGE_H0) so the highest-co-occurrence pairs
// land in HIGH-chroma-headroom hues and the low-headroom yellow trough falls on a pair
// that doesn't need it — this is the one lever that fixes the Other-services/Accom point
// pair (ΔE 0.08→0.32) WITHOUT breaking the surface blends. Families:
//   • CONSUMER (retail = the universal partner): Health · Accom · Retail · Other-services
//     → the violet→red high-headroom arc (idx 0-3). Retail central, adjacent to its two
//       strongest partners (Accom 86, Other-svc 65); the weaker Accom/Other-svc pair (21)
//       sits 2 apart but is now far apart in HUE (magenta vs red) = distinct as points.
//   • REAL ESTATE (blends with nothing — the spacer between families): idx 4.
//   • INDUSTRIAL: Professional · Construction · Manufacturing (idx 5-7); the trough (97°)
//     falls on Professional, whose pair Construction is distinct by chroma.
//   • Wholesale · Education — the second spacer (idx 8-9).
// A sector not in this list gets the next free wheel index (refresh-safe).
export const SECTOR_ARRANGEMENT = [
  "Health care and social assistance",                // idx 0 → 277° violet
  "Accommodation and food services",                  // idx 1 → 313° magenta
  "Retail trade",                                     // idx 2 → 349° magenta-red
  "Other services (except public administration)",    // idx 3 →  25° red
  "Real estate and rental and leasing",               // idx 4 →  61° orange (spacer)
  "Professional, scientific and technical services",  // idx 5 →  97° yellow-green (trough)
  "Construction",                                     // idx 6 → 133° green
  "Manufacturing",                                    // idx 7 → 169° green-cyan
  "Wholesale trade",                                  // idx 8 → 205° cyan (spacer)
  "Educational services",                             // idx 9 → 241° blue (spacer)
];
// VIVID 10 (2026-07-24, KC "don't hold back") — a bold, high-chroma, maximally-DISTINCT
// categorical palette (min pairwise ΔE 30), REPLACING the generated OKLCH wheel. Bright saturated
// hues read on the warm basemap by CHROMA (they are vivid vs the neutral ground) — the DARK casing
// (§5) separates dots. NOTE (physics): a vivid hue is mid-luminance and CANNOT clear WCAG 4.5:1 vs the
// mid-tone grey/pink grounds (max ~2.9:1) — that floor is only met by darkening the fill (retreat
// to muted, NOT ALLOWED) or a dark basemap flatten (a bigger, non-paint change flagged for KC).
// Mirrored token in DESIGN_SYSTEM.md §1.4, FLAGGED for ratification. Assigned by SECTOR_ARRANGEMENT
// index; the KDE surface reads the SAME hues (rgbToOklch → {L,C,H}) so wash + dots stay in step.
export const VIVID_10 = [
  "#ff3d6e", "#ffa300", "#e6d800", "#8bd642", "#2fe38b",
  "#00c9a7", "#22c1ff", "#5b7cff", "#b061ff", "#ff45cf",
];

// One sector's hue at its wheel index — a fixed VIVID_10 entry + its OKLCH for the KDE. {hex,L,C,H}.
export function sectorHueAt(wheelIdx) {
  const hex = VIVID_10[((wheelIdx % VIVID_10.length) + VIVID_10.length) % VIVID_10.length];
  return { hex, ...rgbToOklch(hex) };
}

// ---- Derive the colour domain from the loaded features ---------------------
// Counts every colour_key present (null included), then partitions:
//   • sectors — every present value that is NOT "Other"/"Unclassified"/null,
//     ordered by count DESC (biggest sector first) and given a generated hue by
//     that rank, so a refresh that reshuffles the top-10 recolours consistently.
//   • other — the "Other" bucket (grey), if present.
//   • unclassified — the "Unclassified" null-sector bucket (distinct slate), if present.
//   • nullCount — features whose colour_key is JSON null (should be 0; the page
//     console-warns it when > 0, and it renders via the match fallback in
//     UNKNOWN_COLOUR — never the "Other" grey).
// No sector NAME is hardcoded; the ranking is the data's.
export function deriveSectorDomain(features) {
  const counts = new Map();
  let nullCount = 0;
  for (const f of features) {
    const k = f.properties?.colour_key;
    if (k == null) { nullCount++; continue; }
    counts.set(k, (counts.get(k) || 0) + 1);
  }

  const otherCount = counts.get(OTHER_KEY) || 0;
  const unclCount  = counts.get(UNCLASSIFIED_KEY) || 0;

  const sectors = [...counts.entries()]
    .filter(([k]) => k !== OTHER_KEY && k !== UNCLASSIFIED_KEY)
    .sort((a, b) => b[1] - a[1]);               // count DESC (biggest first — for the LEGEND order)

  // Assign each sector its CO-OCCURRENCE-ARRANGED hue (NOT count rank). A named sector
  // takes its SECTOR_ARRANGEMENT wheel index; any unknown sector (a refresh that changed
  // the top-10) takes the lowest free index, so colouring is always defined. Legend order
  // stays count DESC (above); only the HUE per sector follows the arrangement.
  const usedIdx = new Set(
    sectors.map(([key]) => SECTOR_ARRANGEMENT.indexOf(key)).filter((i) => i >= 0),
  );
  let free = 0;
  const wheelOf = (key) => {
    const i = SECTOR_ARRANGEMENT.indexOf(key);
    if (i >= 0) return i;
    while (usedIdx.has(free)) free++;
    usedIdx.add(free);
    return free;
  };

  return {
    // colour = hex (point paint + legend); oklch = {L,C,H} (KDE surface reads the HUE).
    sectors: sectors.map(([key, count]) => {
      const hue = sectorHueAt(wheelOf(key));
      return { key, count, colour: hue.hex, oklch: { L: hue.L, C: hue.C, H: hue.H } };
    }),
    other:        otherCount ? { key: OTHER_KEY,        count: otherCount, colour: OTHER_COLOUR   } : null,
    unclassified: unclCount  ? { key: UNCLASSIFIED_KEY, count: unclCount,  colour: UNKNOWN_COLOUR } : null,
    nullCount,
  };
}

// ---- Colour expression -----------------------------------------------------
// ["match", ["get","colour_key"], sector, hue, …, "Other", grey, "Unclassified",
//  slate, <fallback: slate>]. The FALLBACK catches a JSON-null colour_key: ["get"]
// returns null for it, match finds no arm → fallback → UNKNOWN_COLOUR, so a null
// NEVER paints as the "Other" grey (the directive's null-honesty rule). NB ["has"]
// would LIE here (it returns true for a null-then-stripped key) — never use it to
// guard a null; the match fallback is the correct guard.
export function buildColourExpression(domain) {
  const arms = [];
  for (const s of domain.sectors) arms.push(s.key, s.colour);
  if (domain.other)        arms.push(domain.other.key, domain.other.colour);
  if (domain.unclassified) arms.push(domain.unclassified.key, domain.unclassified.colour);
  // A ["match", …] needs at least one label→output pair. With an empty domain (no
  // sectors / no Other / no Unclassified — impossible with the current pipeline,
  // which always emits an "Other" bucket) a bare colour is the valid paint value.
  if (arms.length === 0) return UNKNOWN_COLOUR;
  return ["match", ["get", "colour_key"], ...arms, UNKNOWN_COLOUR];
}

// ---- The point layers: a DARK casing HALO under the VIVID DOTS ---------------
// TWO circle layers on the same source (spec §1.1 casing / KC): a wider DARK halo
// drawn UNDER each dot — the shared POINT_CASING (#141018), the SAME dark casing View 2's
// dots use — then the DOT itself (the vivid VIVID_10 sector figure). §5 casing directive
// (2026-07-24): the casing went CREAM → DARK. On the light basemap a light/cream casing
// MERGES the dot boundary into the pale ground (vivid dots read soft-edged + washed); a
// DARK casing is the local luminance boundary that makes the vivid fill read CRISPLY —
// exactly the logic already shipped for View 2's significant dots. The dot carries NO
// stroke (the halo IS the casing). Both returned WITHOUT `source`; the page lifts BOTH
// above every basemap layer (§1.3), halo just under the dots.
// FLAG (deferred, not solved by §5): a dark casing crisps an INDIVIDUAL dot but does not
// resolve View 1's overall DENSITY — all ~29,894 points at once, where dark rims can merge
// in the densest cores. Point-thinning / aggregation for dense View 1 is a separate future
// item (§5 scope note), NOT this change.
// Dot radius — a GENTLE high-zoom ramp (KC: slightly larger spots when zoomed in). Held at
// the tuned base size through the overview + mid zooms (the dense city constellation must
// NOT bloat), lifting modestly from ~z13 in. Data-driven stops → ONE interpolate the dot
// and its halo both consume, so the dark casing ring stays exactly HALO_WIDTH wide at every zoom.
const RADIUS_BASE  = 3.4;            // the tuned uniform size — overview through mid-zoom
const RADIUS_STOPS = [
  [13, RADIUS_BASE],                 // ≤ z13: unchanged (MapLibre clamps flat below the first stop)
  [15, 4.4],                         // buildings visible → slightly larger
  [17, 5.4],                         // close in → a little larger still (clamps flat above)
];
// interpolate(circle-radius) from RADIUS_STOPS (+ a constant for the halo ring): linear
// BETWEEN stops, clamped flat OUTSIDE — so the size is constant at low + very high zoom.
function radiusExpression(add = 0) {
  return ["interpolate", ["linear"], ["zoom"], ...RADIUS_STOPS.flatMap(([z, r]) => [z, r + add])];
}
export const POINT_OPACITY = 0.92;   // dot: near-solid VIVID figure (0.92, not 1.0)
// FLAG (§5 eyeball item, benign — KC's call whether to touch): the dark casing halo is a full disc
// UNDER this 0.92-opaque dot, so ~(1−0.92)×HALO_OPACITY ≈ 6.8% of the near-black casing bleeds
// through the ENTIRE dot face, uniformly. When the dot was DARK (pre-VIVID_10) this was invisible;
// on the VIVID_10 fills it slightly deepens each hue. Measured benign-to-BETTER: the dark bleed
// lands CLOSER to the true hue than the old CREAM halo's bleed, which washed dots pastel (#ff3d6e
// centre → ≈(238,60,105) dark-bleed vs ≈(254,75,119) cream-bleed vs (255,61,110) pure). To remove
// it entirely, raise POINT_OPACITY to 1.0 (no bleed) — not done here (unrequested; 0.92 reads well).
export const HALO_LAYER_ID = "bcensus-points-halo";
const HALO_WIDTH   = 1.9;            // dark casing-ring radius added around each dot — the local luminance
                                    // boundary that separates a vivid dot from the pale ground (§5). Width
                                    // unchanged from the cream era; flagged for KC to eyeball vs View 2's
                                    // thinner proportional stroke.
const HALO_COLOUR  = POINT_CASING;   // §5: was cream #f7f1df; now the shared DARK point casing (#141018)
export const HALO_OPACITY = 0.85;    // dark casing opacity (unchanged; flagged as a crispness tuning lever)

// The VIVID saturated DOT (figure). Colour = the VIVID_10 sector expression, drawn OVER the dark casing.
export function pointCircleLayer(colourExpression) {
  return {
    id: LAYER_ID,
    type: "circle",
    paint: {
      "circle-color": colourExpression,
      "circle-radius": radiusExpression(),
      "circle-opacity": POINT_OPACITY,
      // INSTANT mute (KC: "muting is a paint-property change and stays instant"). MapLibre's
      // default ~300ms opacity transition otherwise animates every filter/hover-preview change,
      // which reads as a slow fade and lags rapid scanning across the legend.
      "circle-opacity-transition": { duration: 0 },
    },
  };
}

// The DARK casing HALO (§5), a wider circle UNDER the dots on the same source.
export function pointHaloLayer() {
  return {
    id: HALO_LAYER_ID,
    type: "circle",
    paint: {
      "circle-color": HALO_COLOUR,
      "circle-radius": radiusExpression(HALO_WIDTH),
      "circle-opacity": HALO_OPACITY,
      "circle-opacity-transition": { duration: 0 },   // instant with the dot (see pointCircleLayer)
    },
  };
}

// The SELECTION ring — marks the PINNED point so the reader keeps track of which dot the
// InfoRail describes. A violet ring just OUTSIDE the dark casing halo: violet is the §1.3 MAP
// selection colour (--pa-selection-outline), reserved as "not data", and sitting outside the
// halo it reads as "selected" over ANY sector hue (the dark casing separates it from even a
// violet Health dot). Base filter matches nothing; the page sets it to the pinned objectid.
// Sits just under the halo (lifted with the point layers), so dot + halo draw on top.
export const SELECT_LAYER_ID = "bcensus-points-select";
const SELECT_COLOUR = "#8b5cf6";        // --pa-selection-outline (§1.3), a literal because MapLibre can't read CSS vars
export function pointSelectLayer() {
  return {
    id: SELECT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["==", ["get", "objectid"], -1],   // nothing pinned until the page sets the objectid
    paint: {
      "circle-radius": radiusExpression(HALO_WIDTH + 3),
      "circle-color": SELECT_COLOUR,
      "circle-opacity": 0,                       // ring only, no fill
      "circle-stroke-color": SELECT_COLOUR,
      "circle-stroke-width": 3,
      // instant like the dot/halo (the ring toggles via setFilter, but zero the opacity
      // transitions too so any future value change can't animate/strand out of step).
      "circle-opacity-transition": { duration: 0 },
      "circle-stroke-opacity-transition": { duration: 0 },
    },
  };
}

// ---- Legend rows (shared Legend, discrete mode) ----------------------------
// The shared Legend renders `discrete` stops as swatch+label rows (it uses only
// s.c + s.label) and REVERSES them (max-at-top for a ramp). We want biggest sector
// at the top, then Other, then Unclassified — so we return our intended top-to-
// bottom order REVERSED, and Legend's own reverse restores it.
export function buildLegendStops(domain) {
  const topToBottom = [
    ...domain.sectors.map((s) => ({ c: s.colour, label: s.key })),
    ...(domain.other        ? [{ c: domain.other.colour,        label: OTHER_KEY }] : []),
    ...(domain.unclassified ? [{ c: domain.unclassified.colour, label: UNCLASSIFIED_KEY }] : []),
  ];
  return topToBottom.slice().reverse();
}

// ---- (No on-map popup) ------------------------------------------------------
// The hover/click popup + its HTML builder (buildPointPopupHtml) and helpers were REMOVED
// (KC 2026-07-24): the popup was a redundant second readout that occluded the inspected
// region, so the InfoRail now owns both hover-preview and click-pin (BusinessCensusSection).
