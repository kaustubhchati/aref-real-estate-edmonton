// =============================================================================
// permitStyle.js
//
// The visual contract for the Building Permits POINT map (the section's own
// equivalent of property-assessment/choroplethStyle.js). Everything about how a
// permit dot looks lives here: basemap + view defaults, the two job-group
// colours, the construction-value → radius ramp, the single circle-layer spec,
// the popups, and the client-side filter. The BP point map reads this file and
// nothing else for styling, so a colour/size/threshold tweak is a one-file edit
// (CLAUDE.md §6: data-driven tables, one source of truth).
//
//   • job_group         — "residential" | "commercial" → colour (orange / blue)
//   • construction_value — raw $CAD; NO value (null) → EXCLUDED (never rendered), a real 0 kept
//                          → radius tier
// =============================================================================

import { VALUE_BUCKETS, ALL_BUCKET_IDS } from "./dataSources.js";
import { CITY_BOUNDS } from "../../config/cityBounds.js";
import { paintTransition, DUR_BASE } from "../../components/motion.js";

// ---- Map view defaults (Edmonton) ------------------------------------------
// Basemap style is shared + base-resolved; re-exported so consumers here are unchanged.
export { BASEMAP_STYLE } from "../../components/basemapStyle.js";
// The self-hosted style (same one PropertyAssessmentMap uses). The CDN Voyager
// URL was a temporary workaround while the map rendered blank — the real cause
// was an invalid nested-zoom circle-radius expression, since fixed.

export const MAP_VIEW = {
  center: [-113.4956, 53.5356],   // Edmonton area-weighted centroid (centres default + constrained view)
  zoom: 10.2,
  minZoom: 7,
  maxZoom: 18,
  maxBounds: CITY_BOUNDS.Edmonton,   // lock pan to the city extent (per-city config)
};

// The GeoJSON source id the page registers the per-year points under (the shared
// MapView fills `source` into the layer at mount). A GeoJSON source has NO
// sub-layers, so the circle layer carries no "source-layer" — that was a
// vector-tile/PMTiles-only key, removed in the move off tippecanoe.
export const SOURCE_ID = "permits";

// The id of the circle layer. Exported so the page can target it with
// map.setFilter(LAYER_ID, …) without restating the string.
export const LAYER_ID = "permits-circles";

// ---- Colour by job_group ---------------------------------------------------
// Orange (residential) vs violet-magenta (commercial) — ~200° hue separation,
// colourblind-safe. Violet-magenta (not blue) because a blue dot conflicts with
// Voyager's water bodies at mid-zoom; violet is absent from the basemap palette.
//
// RATIFIED DIVERGENCE (KC) — the ACTIVE Permit-Type chip glows its OWN category colour
// (residential→orange, commercial→purple), NOT PA's green border / not the generic teal
// interactive accent. PA forbids per-metric colour because its metrics have no colour identity
// (colour would be noise); BP's categories ARE a locked colour identity — this whole map is
// built on orange=residential / purple=commercial — so the chip echoing its category colour
// REINFORCES the encoding, it is not drift. "All" has no category hue → keeps the neutral teal
// accent. The active-chip glow recipe lives in index.css (search "Fix 2 — CATEGORY-COLOUR").
export const COLOURS = {
  residential: "#f57c00",  // deep orange
  commercial:  "#7b2fa0",  // deep violet-magenta
  fallback:    "#9aa0a6",
};

// ["match", job_group, …] → fill colour, built from COLOURS so the table above
// is the only place to edit a hue.
function buildColourExpression() {
  return [
    "match", ["get", "job_group"],
    "residential", COLOURS.residential,
    "commercial",  COLOURS.commercial,
    COLOURS.fallback,
  ];
}

// ---- Size by construction-value TIER ---------------------------------------
// Final radius = zoomBase(zoom) × tierMultiplier(construction_value).
//
// MapLibre rule: a "zoom" expression may only be the input to ONE, TOP-LEVEL
// "step"/"interpolate". So the zoom curve must be the OUTERMOST expression, with
// the value-tier multiplier (a data-driven `case`, not zoom-based) INSIDE each
// stop output. The two patterns MapLibre rejects (both verified against its
// expression validator):
//   • nesting a zoom interpolate inside every output of a construction_value
//     `step` → "Only one zoom-based subexpression may be used" (the old bug);
//   • ["*", ["interpolate", ["zoom"], …], case] → "zoom may only be input to a
//     top-level step/interpolate" (zoom interp isn't outermost).
// This form computes the identical base×tier value but is valid.
function buildRadiusExpression() {
  // NO 0 fallback (was ["number", …, 0]). A rendered dot ALWAYS has a value — the layer's base
  // filter + buildPermitFilter both exclude no-value permits — so ["number", …] resolves to the
  // real value and never evaluates on an absent one. Coalescing null→0 was the defect: it
  // laundered ~40% unknown-value permits into the <$10k tier (size IS value; a valueless dot
  // cannot carry it). A genuine 0 is not null, so it survives the filter and still reads as micro.
  const v = ["number", ["get", "construction_value"]];
  // Data-driven tier multiplier (1.0 = micro floor). Thresholds match the
  // VALUE_BUCKETS boundaries. NOT zoom-based, so it nests freely.
  const tier = [
    "case",
    ["<", v,    10_000], 1.0,
    ["<", v,   100_000], 1.6,
    ["<", v,   500_000], 2.5,
    ["<", v, 2_000_000], 3.8,
    5.5,  // > $2M
  ];

  // The single, top-level zoom curve. Each stop multiplies a zoom base by the tier, so
  // value-tier PROPORTIONS are preserved at every zoom. The base grows to a PEAK at the
  // ~200 m scanning sweet spot (z14), then SHRINKS toward building zoom (z18 / ~10 m) so a
  // big-value dot becomes a small marker sitting ON its parcel instead of sprawling over
  // neighbours (and, being small, it no longer straddles tile edges → no clipped crescents).
  // 200–500 m (z13–14) is untouched — that's where value-by-size reads best.
  return [
    "interpolate", ["linear"], ["zoom"],
    9,  ["*", 1.8, tier],
    11, ["*", 2.8, tier],
    13, ["*", 4.0, tier],   // 500 m — value reading strong (unchanged)
    14, ["*", 4.6, tier],   // 200 m — the value-reading sweet spot (peak; ≈ the old curve)
    15, ["*", 3.6, tier],   // 100 m — begin shrinking so dots stop oversizing city blocks
    16, ["*", 2.8, tier],   // 50 m
    18, ["*", 1.5, tier],   // 10 m building level — a small marker ON the parcel
  ];
}

// ---- Scale-dependent representation: heat (overview) ↔ dots (street) --------
// The POINT map shows TWO things depending on scale:
//   • zoomed OUT (city overview) — two single-hue HEATMAPS (residential orange +
//     commercial violet), so the eye reads DENSITY, not thousands of overlapping dots;
//   • zoomed IN (street level)  — the categorical DOTS (the circle layer below).
// They CROSS-FADE across a band just below the crossover: heat fades OUT while dots
// fade IN over the SAME band, so neither pops. The crossover ≈ the "1 km" mark on the
// scale bar at Edmonton's latitude (≈ zoom 12 — the "1 km" mark; MapLibre's 512px tiles).
//
// ONE knob re-dials the whole flip — HEAT_CROSSOVER. Move it and the band edges, the
// heat fade-out, the dots fade-in AND the dots minzoom all follow (all derived below).
// HEAT_BAND widens/narrows the crossfade. (Sweep HEAT_CROSSOVER to pick the flip point.)
export const HEAT_CROSSOVER = 12;   // zoom of the heat→dots flip (~1 km scale bar, 53.5°N)
export const HEAT_BAND = 1;         // crossfade width in zoom levels, immediately BELOW the crossover

// Derived band edges — the SAME band drives heat-out and dots-in (a true crossfade).
//   BAND_LO — heat FULL / dots ZERO.   BAND_HI (= the crossover) — heat ZERO / dots FULL.
// HEAT_BAND must be > 0 (two equal interpolate inputs are illegal).
const BAND_LO = HEAT_CROSSOVER - HEAT_BAND;   // heat FULL / dots ZERO (band low edge)
const BAND_HI = HEAT_CROSSOVER;               // = the crossover: heat ZERO / dots FULL
// The dots layer becomes AVAILABLE at the band start (BAND_LO), where its opacity is
// still 0 — so it fades in with no pop-in AND never renders below the band. Tracking the
// band (not HEAT_CROSSOVER-2) keeps invisible dots from being hover/click targets over
// the heat at the overview (they don't exist below the crossover band at all).
const DOTS_MINZOOM = BAND_LO;                 // dots exist only from the band up

// The two categories that each get a heatmap: id + job_group value + its inherited hue +
// a display label. One row = one heatmap layer AND one density-legend row. Declared ONCE so
// the layer builder, the filter effect, AND the density legend (BuildingPermitsMap) iterate
// the same pair — no restated id / colour / label anywhere else.
export const HEAT_CATEGORIES = [
  { id: "permits-heat-residential", category: "residential", label: "Residential", colour: COLOURS.residential },
  { id: "permits-heat-commercial",  category: "commercial",  label: "Commercial",  colour: COLOURS.commercial  },
];

// ---- The INCANDESCENT density ramps (per-category "lava glow" tracks) -------
// Density should GLOW BRIGHTER as it climbs — like molten lava / incandescent metal: a dull-red
// crust heats through orange to a bright amber-gold core (the blackbody sequence, cooler→hotter
// running red→orange→toward-yellow). Luminance RISES toward the core — a deliberate FLIP of the
// old darken-to-core ramp.
//
// The non-obvious part is doing this on a LIGHT basemap. A naive "bright at the core" washes the
// hottest spots INTO the cream and they vanish — a glow reads through CONTRAST, not brightness
// alone. Real lava glows because its bright molten centre is ringed by a darker, cooler crust;
// that dark surround is what makes the centre read as lit FROM WITHIN. So each ramp is
// NON-MONOTONIC in luminance: transparent → DARK crust (deep maroon / aubergine, ~0.12) →
// brightening → BRIGHT saturated glowing CORE (luminous amber-gold / pink-magenta, ~1.00). The
// DARKEST band sits at the crust (~0.12), NOT the core — that dark shoulder is the mechanism that
// separates a glowing core from the basemap; drop it and the bright cores fade into cream.
//
// Guardrails baked into the stops: each core tops out at a SATURATED amber (residential) /
// pink-magenta (commercial), held SHORT of white — white both washes into cream and kills the
// molten look. De-fog is preserved by ALPHA: density 0 is the crust hue at alpha 0, so sparse
// areas fade transparently into the map. Still the orange / purple permit families, now
// incandescent — no new base hue, no green.
//
// SHOULDER-HEAVY weighting: the bright lift covers too much area if the bright stops sit early
// (Edmonton's wide dense areas then all hit the bright end → broad bright fields). So the dark
// shoulder OWNS the low-and-mid range (crust 0.15 → still-dark-red 0.45 → warming 0.68) and the
// bright lift is squeezed into the top ~15% (orange 0.85 → amber 0.94 → gold 1.00). Most of any
// hotspot's area is dark shoulder; only the dense core lifts to glow (the ArcGIS "raise max-density
// → fewer hot-spots" principle) — small bright cores riding a broad dark body.
//
// These literals ARE the ramp (no HSL derivation) — the ONE source both the map paint AND the
// density legend read, keyed by CATEGORY. Matched density breakpoints (0.15 / 0.45 / 0.68 / 0.85 /
// 0.94 / 1.00) and the same crust→glow SHAPE for both, so equal density gives equal shoulder-vs-glow
// balance per hue (orange→gold, purple→pink-magenta), each ringed by its own dark crust. Index 0 is
// the empty stop: the crust hue at ALPHA 0, so empty fades in the crust colour; the six coloured
// stops (1..6) run dark crust → bright glowing core.
const HEAT_RAMPS = {
  residential: [
    { d: 0.00, css: "rgba(120,24,12,0)" },     // empty — dark maroon crust at alpha 0
    { d: 0.15, css: "rgb(120,24,12)" },         // DARK maroon crust — begins early
    { d: 0.45, css: "rgb(150,34,16)" },         // STILL dark red — shoulder HOLDS through mid-range
    { d: 0.68, css: "rgb(190,60,22)" },         // deep red-orange — only now warming
    { d: 0.85, css: "rgb(236,110,28)" },        // orange — the LIFT starts this late
    { d: 0.94, css: "rgb(255,176,52)" },        // amber
    { d: 1.00, css: "rgb(255,208,92)" },        // gold-amber GLOW core — only the very peak, NOT white
  ],
  commercial: [
    { d: 0.00, css: "rgba(60,20,80,0)" },       // empty — deep aubergine crust at alpha 0
    { d: 0.15, css: "rgb(60,20,80)" },          // DEEP aubergine crust — begins early
    { d: 0.45, css: "rgb(84,28,118)" },         // STILL deep purple — shoulder HOLDS
    { d: 0.68, css: "rgb(120,44,168)" },        // purple — only now warming
    { d: 0.85, css: "rgb(176,66,200)" },        // violet-magenta — the LIFT starts this late
    { d: 0.94, css: "rgb(220,104,214)" },       // magenta
    { d: 1.00, css: "rgb(242,148,228)" },       // pink-magenta GLOW core — only the very peak, NOT white
  ],
};

// SMOOTH vs STEPPED — the toggle KC sweeps. "smooth" = the interpolate incandescent ramp (blended);
// "stepped" = 6 discrete CONTOUR bands (the same colours, snapped → concentric density rings).
// heatColor() branches on this; the legend tracks it (gradient vs discrete swatches). Only the
// map paint + legend rendering change — radius / intensity / opacity / crossover are frozen.
export const HEAT_RAMP_MODE = "smooth";   // "smooth" | "stepped"

// One category's ramp as CSS colour stops — THE single source both the map paint AND the
// density legend read, so the legend shows exactly the colours the map paints. Returns
// [{ d, css }] density-ordered; index 0 is the transparent empty-density stop, 1..6 the six
// coloured stops (dark crust → bright glow core).
export function heatRampColours(category) {
  return HEAT_RAMPS[category];
}

// STEPPED contour thresholds — the LOWER EDGE of each band, one per coloured stop, SHOULDER-HEAVY
// to match the smooth ramp's weighting: the dark bands (c1..c3) span 0.15→0.80 (most of the range),
// the bright bands (c4..c6) are squeezed into 0.80→1.0 (the top ~20%). Kept SEPARATE from the
// smooth `d` values because a step's top band needs a threshold BELOW 1.0 to ever show (density
// rarely hits exactly 1.0) — so the brightest core rings at ≥0.96, not ≥1.00. Length MUST match the
// coloured-stop count (6). This is the ONE place the contour balance is tuned.
const STEP_THRESHOLDS = [0.15, 0.42, 0.62, 0.80, 0.90, 0.96];

// The heatmap-color expression for one category. Density 0 MUST be (near-)transparent (empty
// stays map-colour). Built from heatRampColours so the colours live in exactly one place.
//   • smooth  → interpolate along the incandescent track (crust→glow) at the ramp's density stops
//     (shoulder-heavy: the lift starts at 0.85, so most of the range is dark shoulder).
//   • stepped → step: the SAME colours as discrete CONTOUR bands, at STEP_THRESHOLDS — wide dark
//     shoulder bands + narrow bright core rings (concentric ISOTHERMS: dark crust = cool OUTER
//     ring, bright glow = hot INNER core). Derived from the same coloured stops as smooth, so a
//     ramp edit re-weights both modes; only the density BREAKS differ (STEP_THRESHOLDS vs the
//     smooth `d`s), by construction.
function heatColor(category) {
  const coloured = heatRampColours(category).filter((s) => s.d > 0);   // drop the empty stop → c1..c6
  if (HEAT_RAMP_MODE === "stepped") {
    // Pair each coloured stop with its shoulder-heavy lower edge; below the first band → transparent.
    const bands = coloured.flatMap((s, i) => [STEP_THRESHOLDS[i], s.css]);
    return ["step", ["heatmap-density"], "rgba(0,0,0,0)", ...bands];
  }
  return [
    "interpolate", ["linear"], ["heatmap-density"],
    ...heatRampColours(category).flatMap(({ d, css }) => [d, css]),
  ];
}

// ---- Heat radius / intensity dials -----------------------------------------
// Radius stays MODERATE — tight enough for defined cores, wide enough to still read as density.
// INTENSITY is the second shoulder-vs-glow lever (Lever 2): it multiplies accumulated density, so
// LOWERING it makes density climb more slowly and FEWER areas reach the bright top of the ramp —
// directly shrinking the bright area. Dropped (moderate: 1.0/1.6 → 0.8/1.4) to pair with the
// shoulder-heavy stops so the glow concentrates into true peaks, not broad bright fields. Lever 1
// (the late colour stops) controls WHAT COLOUR a density gets; Lever 2 controls HOW MUCH density
// accumulates. Both categories share the dials; each ramps in its OWN hue. Sweep HEAT_TUNING.
export const HEAT_TUNINGS = {
  tight:    { radius: [8, 6,  11, 11, HEAT_CROSSOVER, 15], intensity: [8, 0.9, HEAT_CROSSOVER, 1.6] },
  moderate: { radius: [8, 8,  11, 14, HEAT_CROSSOVER, 18], intensity: [8, 0.8, HEAT_CROSSOVER, 1.4] },
  soft:     { radius: [8, 10, 11, 18, HEAT_CROSSOVER, 22], intensity: [8, 0.7, HEAT_CROSSOVER, 1.2] },
};
export const HEAT_TUNING = HEAT_TUNINGS.moderate;   // ← the knob KC picks

// One heatmap layer for a job_group. Returned WITHOUT `source` (MapView fills it in), like
// permitCircleLayer(). Residential ramps the LAVA track (orange→red), commercial the
// violet→magenta track, so the masses read separately where they overlap. Radius / intensity
// from HEAT_TUNING; the incandescent colour ramp from heatColor (category-keyed, mode-aware).
function buildHeatLayer(id, category) {
  return {
    id,
    type: "heatmap",
    // No heat above the crossover (dots own street level); +0.5 so it's fully faded before drop.
    maxzoom: HEAT_CROSSOVER + 0.5,
    filter: ["==", ["get", "job_group"], category],
    paint: {
      // Every permit counts equally — density is how many fall together (construction value is
      // the DOTS' encoding, not the heat's).
      "heatmap-weight": 1,
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], ...HEAT_TUNING.radius],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], ...HEAT_TUNING.intensity],
      "heatmap-color": heatColor(category),
      // The crossfade OUT: full-ish at/below BAND_LO → gone at/above BAND_HI (the crossover) —
      // mirrors the dots' fade-IN across the SAME band. Kept HIGH in-band (its job is the
      // crossfade, not softening the heat). Ramp-preserving under the year-swap.
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], BAND_LO, 0.95, BAND_HI, 0],
    },
  };
}

// Both heatmap layers, WITHOUT `source` (MapView fills it), in stack order UNDER the dots.
// POINT_LAYERS = [...permitHeatLayers(), permitCircleLayer()].
export function permitHeatLayers() {
  return HEAT_CATEGORIES.map(({ id, category }) => buildHeatLayer(id, category));
}

// ---- Figure-ground base tint (inside the Edmonton boundary) ----------------
// Cartographic figure-ground: the permit glow (the FIGURE) reads best on a subdued, UNIFORM
// ground. The raw basemap is a variable backdrop — cream PLUS green parkland PLUS water — that the
// warm glow has to fight. Fill the inside of the city boundary with one quiet tint so the glow has
// a single consistent ground, and Edmonton itself becomes a coherent figure against the outside.
//
// The boundary is the existing 407-neighbourhood universe, dissolved to the city outline and
// simplified to a ~18 KB single polygon (no new City fetch — FOIP intact; regenerate with:
//   npx mapshaper public/data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<yr>.geojson \
//     -dissolve -simplify 20% keep-shapes -clean -each 'city="Edmonton"' -o public/geo/edmonton_boundary.geojson
// Long-term this belongs in the pipeline shared/ base-geo section as a handoff; committed as a
// frontend geo asset for now — see the note to KC).
export const BOUNDARY_SOURCE_ID = "city-boundary";
export const CITY_BOUNDARY_PATH = "/geo/edmonton_boundary.geojson";

// LAYER ORDER is the whole trick. Insert the tint ABOVE the basemap's land / parkland / landuse
// but BELOW water, roads, labels, and the heat/dots — so it quiets the cream + green ground while
// rivers, roads, labels, and the glow all draw ON TOP. "waterway" is the first basemap layer that
// must stay above the tint (custom-basemap.json order: background → landcover → parks → landuse →
// [waterway] → water → roads → labels). The heat/dots are added by MapView on top of everything,
// so they sit above the tint automatically.
export const TINT_BEFORE_ID = "waterway";

// The three GROUND candidates KC compares — muted, mid-light, LOW-saturation (a ground, never a
// figure; a saturated ground becomes a second data layer). Warm data pops hardest on a COOL,
// desaturated ground (azure is orange's complement), so the default is a cool neutral; the
// blue-grey pushes warm-pop hardest (but can fight the magenta — test both hues); the greige is
// the subtlest (a deeper cream, no hue shift). Opacity can sit firm because roads/water/labels are
// ABOVE the tint — a higher opacity unifies land+parks WITHOUT hiding map structure, and the light
// tint keeps it a LIGHT map (not a dark theme). line = a quiet city-edge stroke (the figure edge).
export const BASE_TINTS = {
  "cool-neutral": { label: "Cool neutral grey", fill: "#cdd0cd", opacity: 0.55, line: "#98a29b" },
  "cool-blue":    { label: "Cool blue-grey",    fill: "#b6c6d2", opacity: 0.52, line: "#8ba0b0" },
  "warm-greige":  { label: "Warm greige",       fill: "#e5ddcb", opacity: 0.44, line: "#c3b79d" },
};
export const ACTIVE_TINT = "warm-greige";   // ← the knob KC picks (key into BASE_TINTS)
export const SHOW_BOUNDARY_LINE = true;      // thin city-edge stroke on/off (the figure edge)

// The tint FILL (the city ground). `source` is filled by the page (the dissolved boundary). No
// maxzoom: the tint is a constant ground at every scale (the glow sits on it at the overview, the
// dots at street level). fill-antialias default keeps a smooth city edge.
export function cityTintLayer(source) {
  const t = BASE_TINTS[ACTIVE_TINT];
  return {
    id: "city-tint",
    type: "fill",
    source,
    paint: {
      "fill-color": t.fill,
      "fill-opacity": t.opacity,
    },
  };
}

// The optional city-edge STROKE — marks the figure boundary crisply. Hairline, low opacity, so it
// reads as an edge, not a border. Same beforeId as the fill (just above it, below water/roads).
export function cityBoundaryLineLayer(source) {
  const t = BASE_TINTS[ACTIVE_TINT];
  return {
    id: "city-outline",
    type: "line",
    source,
    paint: {
      "line-color": t.line,
      "line-width": 1.2,
      "line-opacity": 0.7,
    },
  };
}

// ---- BP land-use zones: lift above the boundary tint -----------------------
// The land-use fill COLOURS are shared across ALL maps — set once in
// components/basemapTheme.js (land-use-convention hue + muted tone + value separation), so
// PA/DU/BC/BP read the same palette. BP's only section-specific need is ORDER: on the points
// map these fills sit UNDER the greige boundary tint, which washes them out, so BP lifts the
// three DESCRIPTIVE land-use classes ABOVE the tint (BuildingPermitsMap onLoad consumes this
// list) to keep them legible — they still stay below water / roads / labels and the permit
// dots. Residential + parks intentionally stay BELOW the tint (the quiet base ground the glow
// reads on). Just the id list + order here; NO colour (the theme owns it).
export const LANDUSE_ABOVE_TINT = ["landuse_commercial", "landuse_industrial", "landuse_institutional"];

// ---- The circle layer spec -------------------------------------------------
// Returned WITHOUT `source` (the shared MapView fills that in). Colour by
// job_group, size by construction-value tier, white halo so dots stay distinct
// on the light Voyager basemap. No "source-layer": the source is plain GeoJSON.
// minzoom = DOTS_MINZOOM: the dots live only from just below the crossover up, so the
// overview belongs to the heatmaps; circle-opacity fades them in across [BAND_LO, BAND_HI].
export function permitCircleLayer() {
  return {
    id: LAYER_ID,
    type: "circle",
    minzoom: DOTS_MINZOOM,
    // Base exclusion: no-value permits NEVER render. Present in the layer spec (not only in
    // buildPermitFilter's setFilter) so the exclusion holds from mount — before the React filter
    // effect runs — which keeps the no-fallback radius above from ever seeing an absent value.
    // "No value" is JSON null in the file; ["get","construction_value"] returns null for it, so
    // ["!=", get, null] drops exactly those and KEEPS a legitimate 0 (verified on the live map:
    // it excludes 38/366 nulls at a dense z14 view, 0 remaining). NB ["has"] does NOT work here
    // (it returns true for the null-then-stripped key). setFilter(buildPermitFilter) re-asserts it.
    filter: ["!=", ["get", "construction_value"], ["literal", null]],
    layout: {
      // Draw commercial (the ~16% minority) ON TOP so it isn't buried under the
      // residential majority (key 1 sorts above key 0).
      "circle-sort-key": ["case",
        ["==", ["get", "job_group"], "commercial"], 1, 0],
    },
    paint: {
      "circle-color":  buildColourExpression(),
      // Tween the dot colour if the job-group palette ever changes; reduced-motion
      // safe (paintTransition zeroes the duration under prefers-reduced-motion). A
      // YEAR change is a data swap (MapView recreates the source per-year file), so dots
      // replace rather than tween — same per-year model as the choropleth.
      "circle-color-transition": paintTransition(DUR_BASE),
      "circle-radius": buildRadiusExpression(),
      // The crossfade IN — mirror of the heatmaps' fade OUT over the SAME band:
      // 0 at/below BAND_LO (hidden beneath the heat over the overview) → 0.75 at BAND_HI
      // (the crossover), then the unchanged 0.88 far stop. Below BAND_LO the interpolate
      // clamps to 0, so the dots are fully transparent under the heat.
      "circle-opacity": [
        "interpolate", ["linear"], ["zoom"],
        BAND_LO, 0, BAND_HI, 0.75, 18, 0.88,
      ],
      // Heavier white ring at the 200-500 m scanning zooms (z13-14) so overlapping big dots
      // in dense areas stay individually legible — the outline delineates each where the
      // sort-key stacks them (taming the overlap-occlusion crescents). Peaks at z14, then
      // tapers: past the sweet spot the radius is small, so a lighter ring keeps proportion.
      "circle-stroke-width": [
        "interpolate", ["linear"], ["zoom"],
        9, 1.0, 13, 2.2, 14, 2.6, 16, 1.8, 18, 1.4,
      ],
      "circle-stroke-color": "rgba(255,255,255,0.95)",
      // The white halo MUST fade with the fill across the crossover band. circle-stroke-opacity
      // defaults to 1, so without this the stroke keeps drawing hollow white rings over the heat
      // at the overview (the fill alone at opacity 0 is not enough to hide a dot). Same
      // [BAND_LO, BAND_HI] gate as circle-opacity: 0 beneath the heat → full at the crossover.
      "circle-stroke-opacity": [
        "interpolate", ["linear"], ["zoom"],
        BAND_LO, 0, BAND_HI, 1,
      ],
    },
  };
}

// ---- Feature-field formatters ----------------------------------------------
// Small pure helpers that turn a permit's raw fields into display strings — now consumed by
// the right INFORAIL (PermitInforail) instead of the retired hand-built popups. Exported so
// the inforail reads a permit exactly as the map once did.
// Capitalise the first letter — job_group arrives lower-case in the tile
// ("residential" → "Residential"). null / undefined / "" → the project em-dash.
export const capitalise = (v) =>
  v == null || v === ""
    ? "—"
    : String(v).charAt(0).toUpperCase() + String(v).slice(1);

// Strip the City's internal code suffix from building_type.
// "Indoor Recreational Buildings (560)" → "Indoor Recreational Buildings"
// Exported so the sidebar's last-clicked panel (BuildingPermitsMap) formats
// building_type the same way the popup does.
export const stripBuildingCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/\s*\(\d+\)\s*$/, "").trim();

// Strip the City's internal code prefix from work_type.
// "(03) Interior Alterations" → "Interior Alterations"
export const stripWorkCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/^\(\d+\)\s*/, "").trim();


// ---- Client-side filter ----------------------------------------------------
// Type / month / value-tier filters on the LOADED per-year source (MapLibre
// setFilter — instant, no refetch). There is deliberately NO year clause: each
// GeoJSON file already holds exactly one year (the slider swaps the file — MapView
// recreates the source), so a year filter would be redundant AND would blank the old
// dots before the new file finishes loading. group is the "Permit type" pick
// ("All" / "Residential" / "Commercial"); the data's job_group is lower-case, so
// we lower-case the picked value. month 0 is the "All months" sentinel.
// activeBucketIds is the Set of active value tiers.
//
// UNCONDITIONAL first clause: ["!=", get, null] excludes no-value permits at EVERY filter state.
// "No value" is JSON null in the file; ["get","construction_value"] returns null for it, so
// ["!=", get, null] drops exactly the nulls and KEEPS a legitimate 0 (verified: 48/13,804 in
// 2023 are a real 0; and on the live map ["!=",get,null] removes 38/366 nulls at a dense z14
// view while ["has"] removes 0 — has returns true for the null-then-stripped key, so it does NOT
// work here). It is FIRST so the ["all", …] short-circuits before the value-tier comparison ever
// evaluates ["number", get] on an absent value. Self-healing: when the City backfills a value it
// stops being null and the permit renders with no code change (no baked exclusion list).
export function buildPermitFilter(group, month, activeBucketIds) {
  const clauses = [["!=", ["get", "construction_value"], ["literal", null]]];

  if (group !== "All") {
    clauses.push(["==", ["get", "job_group"], group.toLowerCase()]);
  }

  if (month !== 0) {
    clauses.push(["==", ["get", "month_number"], month]);
  }

  // Bucket filter: independent AND with type + month. A permit shows if it falls
  // in ANY active bucket. All tiers active → no clause (show everything); none
  // active → an impossible clause (show nothing). Infinity max → no upper bound.
  if (activeBucketIds && activeBucketIds.size < ALL_BUCKET_IDS.length) {
    const active = VALUE_BUCKETS.filter((b) => activeBucketIds.has(b.id));
    if (active.length === 0) {
      clauses.push(["==", ["get", "year"], -1]); // show nothing
    } else {
      const bucketClauses = active.map((b) => {
        // No 0 fallback: the leading ["!=", get, null] clause already excluded no-value permits
        // and short-circuits ["all"] before this runs, so ["number", get] always sees a value.
        const val = ["number", ["get", "construction_value"]];
        const above = [">=", val, b.min];
        if (b.max === Infinity) return above;
        return ["all", above, ["<", val, b.max]];
      });
      clauses.push(
        bucketClauses.length === 1
          ? bucketClauses[0]
          : ["any", ...bucketClauses]
      );
    }
  }

  return ["all", ...clauses];
}

// Heatmap filter = the SAME filtered set as the dots, PLUS this heatmap's own category.
// So a heatmap shows exactly the permits of its job_group that ALSO pass the type / month /
// value filter (and the no-value exclusion — that lives inside buildPermitFilter, shared).
// When the user picks Permit Type = Commercial, buildPermitFilter adds
// job_group==commercial, so the RESIDENTIAL heatmap resolves to residential ∩ commercial =
// ∅ (empty) and vice-versa — exactly the behaviour we want. A nested ["all", …] inside an
// ["all", …] is legal MapLibre (flattens to one AND).
export function buildHeatFilter(category, group, month, activeBucketIds) {
  return [
    "all",
    ["==", ["get", "job_group"], category],
    buildPermitFilter(group, month, activeBucketIds),
  ];
}

// Re-export the bucket symbols so BuildingPermitsMap only needs one import
// source (these live in dataSources.js, the option-list seam).
export { VALUE_BUCKETS, ALL_BUCKET_IDS } from "./dataSources.js";
export { DEFAULT_ACTIVE_BUCKETS } from "./dataSources.js";
