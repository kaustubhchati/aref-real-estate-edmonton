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

import { fmtCurrency } from "../../utils/format.js";
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

// ---- The INCANDESCENT density ramps (per-category lava / flame tracks) -----
// Each category ramps from PALE (low density — recedes into the light basemap, "de-fog") to a
// deep saturated CORE (high density). Crucially the hue ROTATES as density climbs — a lava
// track — rather than just darkening in place: darkening orange in place walks it into BROWN
// (brown = dark desaturated orange). Instead residential runs pale-warm → orange → red-orange
// → deep RED, and commercial runs pale lilac → violet → deep magenta-purple. KC-authorized:
// orange→red is still "the orange permit colour, incandescent not brown"; the purple stays
// VIVID; no green anywhere.
//
// These literals ARE the ramp (no HSL derivation) — the ONE source both the map paint AND the
// density legend read, keyed by CATEGORY. Matched density breakpoints (0.12 / 0.35 / 0.62 /
// 0.85 / 1.00) so equal density reads equally strong in both hues — only the hue LINE differs.
// Index 0 is the empty-density stop: the pale colour at ALPHA 0, so empty fades in the true
// hue (not out of black); the five coloured stops (1..5) are pale → core.
const HEAT_RAMPS = {
  residential: [
    { d: 0.00, css: "rgba(255,224,160,0)" },   // empty — pale-warm at alpha 0
    { d: 0.12, css: "rgb(255,224,160)" },       // pale-warm
    { d: 0.35, css: "rgb(255,168,66)" },        // orange
    { d: 0.62, css: "rgb(240,110,40)" },        // red-orange
    { d: 0.85, css: "rgb(214,58,32)" },         // red
    { d: 1.00, css: "rgb(168,26,24)" },         // deep RED core
  ],
  commercial: [
    { d: 0.00, css: "rgba(230,208,242,0)" },    // empty — pale lilac at alpha 0
    { d: 0.12, css: "rgb(230,208,242)" },       // pale lilac
    { d: 0.35, css: "rgb(178,108,212)" },       // violet
    { d: 0.62, css: "rgb(150,55,192)" },        // violet → magenta
    { d: 0.85, css: "rgb(146,30,168)" },        // deep magenta-purple
    { d: 1.00, css: "rgb(118,14,116)" },        // magenta-purple core
  ],
};

// SMOOTH vs STEPPED — the toggle KC sweeps. "smooth" = the interpolate lava ramp (blended);
// "stepped" = 5 discrete CONTOUR bands (the same colours, snapped → concentric density rings).
// heatColor() branches on this; the legend tracks it (gradient vs discrete swatches). Only the
// map paint + legend rendering change — radius / intensity / opacity / crossover are frozen.
export const HEAT_RAMP_MODE = "stepped";   // "smooth" | "stepped"

// One category's ramp as CSS colour stops — THE single source both the map paint AND the
// density legend read, so the legend shows exactly the colours the map paints. Returns
// [{ d, css }] density-ordered; index 0 is the transparent empty-density stop, 1..5 the five
// coloured stops (pale → core).
export function heatRampColours(category) {
  return HEAT_RAMPS[category];
}

// The heatmap-color expression for one category. Density 0 MUST be (near-)transparent (empty
// stays map-colour). Built from heatRampColours so the colours live in exactly one place.
//   • smooth  → interpolate along the lava track at the ramp's density stops.
//   • stepped → step: the SAME five colours as discrete CONTOUR bands at denser-low
//     thresholds (0.12 / 0.30 / 0.50 / 0.70 / 0.88) — 5 bands = clean concentric rings, not
//     posterized. The step BREAKS differ from the smooth stops on purpose (fixed density
//     steps); the band COLOURS are the five coloured stops, identical to smooth.
function heatColor(category) {
  const ramp = heatRampColours(category);
  const c = ramp.map((s) => s.css);   // [empty, c1, c2, c3, c4, c5]
  if (HEAT_RAMP_MODE === "stepped") {
    return [
      "step", ["heatmap-density"],
      "rgba(0,0,0,0)",   // < 0.12 — transparent
      0.12, c[1],        // c1 pale
      0.30, c[2],        // c2
      0.50, c[3],        // c3
      0.70, c[4],        // c4
      0.88, c[5],        // c5 core
    ];
  }
  return [
    "interpolate", ["linear"], ["heatmap-density"],
    ...ramp.flatMap(({ d, css }) => [d, css]),
  ];
}

// ---- Heat radius / intensity dials -----------------------------------------
// The light→dark ramp now does most of the de-fog (pale low density fades into the light
// map), so radius stays MODERATE — tight enough for defined cores, wide enough to still read
// as density. Intensity is kept modest so mid areas sit MID-ramp, not blown to the dark core.
// (The old tailCut / core fields are gone — the ramp itself IS the de-fog now.) Both
// categories share the dials; each ramps in its OWN hue. Sweep HEAT_TUNING to pick the look.
export const HEAT_TUNINGS = {
  tight:    { radius: [8, 6,  11, 11, HEAT_CROSSOVER, 15], intensity: [8, 1.1, HEAT_CROSSOVER, 1.8] },
  moderate: { radius: [8, 8,  11, 14, HEAT_CROSSOVER, 18], intensity: [8, 1.0, HEAT_CROSSOVER, 1.6] },
  soft:     { radius: [8, 10, 11, 18, HEAT_CROSSOVER, 22], intensity: [8, 0.9, HEAT_CROSSOVER, 1.4] },
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
      "circle-stroke-width": [
        "interpolate", ["linear"], ["zoom"],
        9, 0.8, 14, 1.5, 18, 2.0,
      ],
      "circle-stroke-color": "rgba(255,255,255,0.9)",
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

// ---- Popups ----------------------------------------------------------------
// Capitalise the first letter — job_group arrives lower-case in the tile
// ("residential" → "Residential"). null / undefined / "" → the project em-dash,
// the same null convention the other popup formatters use.
const capitalise = (v) =>
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
const stripWorkCode = (v) =>
  v == null || v === "" ? "—" : String(v).replace(/^\(\d+\)\s*/, "").trim();

// HTML-escape before interpolating into setHTML() — popup content is the only
// place we hand-build HTML.
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Click popup — mirrors the assessment popup's shape: address as the bold
// pop-name header, capitalised permit type as the muted pop-district subtitle, a
// colour-coded job-group badge, the construction-value headline row, then the
// detail rows, closing with the pinned-dismiss hint.
export function buildPermitPopupHtml(p) {
  const group = capitalise(p.job_group ?? "");

  const badgeBg = p.job_group === "commercial"
    ? "#f3e8ff" : "#fff3e0";
  const badgeColor = p.job_group === "commercial"
    ? "#7b2fa0" : "#e65100";

  return [
    // Address as location anchor — pop-name role,
    // mirrors neighbourhood name in assessment popup.
    `<div class="pop-name">${
      escapeHtml(p.address ?? "—")
    }</div>`,

    // Capitalised job group — pop-district role.
    `<div class="pop-district">${
      escapeHtml(group)
    }</div>`,

    // Colour-coded badge matching map dot colour.
    // Inline style because pop-state CSS classes are
    // keyed to polygon states, not job groups.
    `<div style="margin-bottom:0.5rem;">
      <span class="pop-state" style="
        background:${badgeBg};
        color:${badgeColor};
        border:1px solid ${badgeColor}22;
      ">${escapeHtml(group)} permit</span>
    </div>`,

    // Headline row: construction value bold + bordered.
    // Mirrors median_assessvalue headline in assessment.
    `<div class="pop-row headline">
      <span class="pop-k">Construction value</span>
      <span class="pop-v">${
        escapeHtml(fmtCurrency(p.construction_value))
      }</span>
    </div>`,

    // Standard rows — description, building, work type.
    `<div class="pop-row">
      <span class="pop-k">Description</span>
      <span class="pop-v">${
        escapeHtml(stripWorkCode(p.job_description ?? ""))
      }</span>
    </div>`,

    `<div class="pop-row">
      <span class="pop-k">Building type</span>
      <span class="pop-v">${
        escapeHtml(stripBuildingCode(p.building_type ?? ""))
      }</span>
    </div>`,

    `<div class="pop-row">
      <span class="pop-k">Work type</span>
      <span class="pop-v">${
        escapeHtml(stripWorkCode(p.work_type ?? ""))
      }</span>
    </div>`,

    // Pinned hint — same pattern as assessment popup.
    `<div class="pop-pinned-hint">Click map to dismiss</div>`,

  ].join("");
}

// Tier 2 hover popup: a slim preview shown while the pointer dwells on a dot.
// Address header + construction value + building type — same fields as the
// point-map's last-clicked sidebar panel.
export function buildPermitHoverHtml(p) {
  return [
    // Address as the bold header — the location anchor.
    `<div class="pop-name">${escapeHtml(p.address ?? "—")}</div>`,

    `<div class="pop-row">
      <span class="pop-k">Construction value</span>
      <span class="pop-v">${
        escapeHtml(fmtCurrency(p.construction_value))
      }</span>
    </div>`,

    `<div class="pop-row">
      <span class="pop-k">Building type</span>
      <span class="pop-v">${
        escapeHtml(stripBuildingCode(p.building_type ?? ""))
      }</span>
    </div>`,
  ].join("");
}

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
