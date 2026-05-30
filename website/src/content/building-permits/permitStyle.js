// =============================================================================
// permitStyle.js
//
// The visual contract for the Building Permits point map (the section's own
// equivalent of property-assessment/choroplethStyle.js). Everything about how a
// permit dot LOOKS lives here: basemap + view defaults, the two job-group
// colours, the value→radius ramp, and the single circle layer spec that consumes
// them. PermitMapView reads from this file and nothing else for styling, so a
// colour or size tweak is a one-file edit (CLAUDE.md §6: data-driven tables, one
// source of truth).
//
// Two feature properties drive the look:
//   • job_group         — "residential" | "commercial"  → colour
//   • construction_value — raw $CAD, NULL for no-value rows → radius
//
// Scope of step 3: colour + size only. No filters, popups, or legend yet.
// =============================================================================

// ---- Map view defaults (Edmonton, matches the choropleth) ------------------
// Moved here from PermitMapView so the basemap/view live beside the layer paint,
// exactly like choroplethStyle.js. Single source of truth for the section.
export const BASEMAP_STYLE =
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

export const MAP_VIEW = {
  center: [-113.4938, 53.5461], // Edmonton
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 14,
};

// The tippecanoe layer name baked into permits.pmtiles. The circle layer's
// "source-layer" MUST equal this or the source loads but renders nothing.
export const SOURCE_LAYER = "permits";

// ---- Colour by job_group ---------------------------------------------------
// The mix is ~84% residential / 16% commercial. If both were the same hot
// colour the map would read as a single mass; if commercial were the muted one
// it would vanish under the residential majority. So residential is the quiet
// BASE (muted slate-blue) and commercial is the SIGNAL (hot orange) — the 16%
// has to pop against the 84%.
export const COLOURS = {
  residential: "#6b8cae", // muted slate-blue — the base
  commercial:  "#e8590c", // hot orange — the signal
  fallback:    "#9aa0a6", // any unexpected/missing job_group → neutral grey
};

// ["match", job_group, ...] → fill colour. Built from COLOURS so the table above
// is the only place to edit a hue.
function buildColourExpression() {
  return [
    "match", ["get", "job_group"],
    "residential", COLOURS.residential,
    "commercial",  COLOURS.commercial,
    COLOURS.fallback,
  ];
}

// ---- Size by construction_value --------------------------------------------
// The spread is brutal: median ~$67k, max ~$480M — roughly four orders of
// magnitude. A LINEAR radius ramp is unusable: scale so the $480M tower is a
// readable dot and every sub-million permit collapses to a single invisible
// pixel; scale so the small ones show and the tower becomes a blob that swallows
// the map. So we TAME the domain with a square root before interpolating —
// sqrt($480M) ≈ 21,900 vs sqrt($67k) ≈ 259, an ~85× span instead of ~7,000×,
// which fits a legible 2–22px radius band. (sqrt, not log: construction_value
// can be 0/NULL, and log(0) is -Infinity. sqrt(0) is a clean 0.)
//
// RADIUS_STOPS is written in RAW dollars for legibility; the expression applies
// sqrt to both the stop boundaries and the live value so the two stay aligned.
// NULL construction_value coalesces to 0 (via ["number", …, 0]) and lands on the
// first stop → the 2px floor, so no-value permits are small but NEVER invisible.
export const RADIUS_STOPS = [
  { v:           0, r:  2 },  // NULL / no-value → the floor
  { v:      50_000, r:  3.5 },
  { v:     500_000, r:  6 },
  { v:   5_000_000, r: 10 },
  { v:  50_000_000, r: 16 },
  { v: 480_000_000, r: 22 },  // the largest towers
];

function buildRadiusExpression() {
  // sqrt-tamed input: NULL/missing → 0 → first stop.
  const input = ["sqrt", ["number", ["get", "construction_value"], 0]];
  const interp = ["interpolate", ["linear"], input];
  for (const s of RADIUS_STOPS) interp.push(Math.sqrt(s.v), s.r);
  return interp;
}

// ---- The circle layer spec -------------------------------------------------
// Returned WITHOUT `source` (PermitMapView fills that in), mirroring
// choroplethLayers(). One layer: colour by job_group, size by construction_value,
// semi-transparent so overlapping dots read as density, with a thin dark stroke
// so individual dots stay distinct where they pile up.
export function permitCircleLayer() {
  return {
    id: "permits-circles",
    type: "circle",
    "source-layer": SOURCE_LAYER,
    paint: {
      "circle-color":        buildColourExpression(),
      "circle-radius":       buildRadiusExpression(),
      "circle-opacity":      0.6,
      "circle-stroke-width": 0.4,
      "circle-stroke-color": "rgba(40,40,45,0.5)",
    },
  };
}
