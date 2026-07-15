// =============================================================================
// dataSources.js
//
// The seam: what cities and years this section knows about, driven by the
// committed manifest — NOT by literals in this file.
//
// The R pipeline emits /manifest.json each refresh (years, defaultYear, and
// per-year colour scales per city). The frontend auto-discovers everything
// from it, so adding a year is a pipeline-only change: emit the new GeoJSON +
// regenerate the manifest. No edit here, no year literals here.
//
// Calgary is listed in CITIES on purpose even though it has no data yet: the
// city switcher should show the button so users can see it's planned. The
// manifest carries Calgary with an empty years list, so getYearsForCity
// returns [] and the UI falls through to the empty state. When Calgary ships,
// the pipeline adds its years to the manifest — that's the whole change.
// =============================================================================

import { assetUrl } from "../../utils/assetUrl.js";

// Cities the switcher offers. Names, not data — the manifest decides which of
// these actually have years. Calgary stays here so its (planned) button shows
// even while its manifest years list is empty.
export const CITIES = ["Edmonton", "Calgary"];

// Sensible starting city. Not a year literal; the starting YEAR comes from the
// manifest via getDefaultYear so it's never hardcoded.
export const DEFAULT_CITY = "Edmonton";

// === Manifest loading =========================================================

// Fetch the committed manifest. Async because it's a network read of a static
// file; callers await it once on mount and pass the result into the helpers
// below. Errors are surfaced, not swallowed — a missing/broken manifest is a
// real problem the caller should see and show.
export async function loadManifest() {
  const res = await fetch(assetUrl("/manifest.json"));
  if (!res.ok) {
    throw new Error(`Could not load /manifest.json (HTTP ${res.status})`);
  }
  return res.json();
}

// === Reading the manifest =====================================================

// All years a city has data for, in manifest order. Missing city / missing
// section → empty list (the empty-state signal). Never throws on shape gaps.
export function getYearsForCity(manifestData, city) {
  return manifestData?.cities?.[city]?.assessment?.years ?? [];
}

// The year the city should open on. null when the city has no data yet.
export function getDefaultYear(manifestData, city) {
  return manifestData?.cities?.[city]?.assessment?.defaultYear ?? null;
}

// The colour-scale stats for a (city, year): {min,q25,median,q75,max}, or null
// if absent. The map/legend turn this into ramp stops — see
// choroplethStyle.stopsFromScale, which falls back to the locked scale on null.
export function getColourScale(manifestData, city, year) {
  return manifestData?.cities?.[city]?.assessment?.colourScaleByYear?.[year] ?? null;
}

// True if the city has at least one year of data in the manifest. Used by
// describeEmpty to tell "Calgary is coming" (no years at all) apart from
// "Edmonton <year> not ready" (city has data, just not this year).
export function cityHasAnyData(manifestData, city) {
  return getYearsForCity(manifestData, city).length > 0;
}

// === Resolving a data file ====================================================

// Map a (city, year) to its committed per-year GeoJSON path. Gating lives
// upstream: callers only resolve a year that getYearsForCity returned, so a
// city/year without data never reaches here. The filename is currently
// year-keyed only (Edmonton history); revisit the path shape when Calgary's
// files land. RETAINED for the per-year fallback path — the live map now loads
// the combined all-years file (resolveCombinedUrl) and paint-swaps the year.
export function resolveDataUrl(city, year) {
  return assetUrl(`/data/property-assessment/neighbourhoods_${year}_recovered.geojson`);
}

// The ONE combined all-years GeoJSON for a city: geometry serialized once, every
// year's values carried as flat <field>_<year> properties (built by 07b). The
// map loads this once and a year change is a paint swap, not a data reload — no
// year in the URL (refresh-by-design; years still come from the manifest).
// City-agnostic today (Edmonton only); gating upstream (years.length) means a
// city with no data resolves null, so Calgary never reaches here.
export function resolveCombinedUrl(/* city */) {
  return assetUrl(`/data/property-assessment/neighbourhoods_all_years.geojson`);
}

// === Per-year projection of the combined file =================================

// The value fields the combined file carries per year as <field>_<year>. The
// four identity fields (Neighbourhood ID, display_name, shapefile_name,
// district) are year-invariant and NOT suffixed. Mirrors 07b's VALUE_COLS — the
// backend/frontend contract for which columns are year-keyed.
export const PER_YEAR_FIELDS = [
  "polygon_state",
  "n_properties",
  "median_assessvalue",
  "avall_public",
  "sd_assessedvalue",
  "median_yearbuilt",
  "pct_with_unit",
  "avg_assessvalue_without_unit",
  "avg_lotsize",
  "yoy_log_points",
];

// Project a combined feature's properties to the BARE-named shape the rest of
// the section already expects, for one year: <field>_<year> -> <field>. Identity
// fields pass through untouched. This is the seam that lets metricStops, the
// popups, search, and the sidebar stats keep reading bare names unchanged while
// the underlying source is the combined all-years file.
export function projectYearProps(props, year) {
  const out = { ...props };
  for (const f of PER_YEAR_FIELDS) out[f] = props[`${f}_${year}`];
  return out;
}

// Project a whole combined FeatureCollection to one year's bare-named view.
// Geometry is shared by reference (not copied) — only properties are reshaped —
// so this stays cheap to recompute on every year change. Returns null on null.
export function projectYearCollection(gj, year) {
  if (!gj) return null;
  return {
    ...gj,
    features: gj.features.map((ft) => ({
      ...ft,
      properties: projectYearProps(ft.properties, year),
    })),
  };
}

// === Empty-state copy =========================================================

// Pick empty-state copy that matches WHY the selection has no data, reading
// availability from the manifest. Centralised here so a future section can do
// the same shape with section-specific phrasing.
export function describeEmpty(manifestData, city, year) {
  if (!cityHasAnyData(manifestData, city)) {
    return {
      title: `${city} data is coming with the ${city} build.`,
      body: `Switch back to Edmonton to keep exploring.`,
    };
  }
  return {
    title: `${city} ${year} data is not yet available.`,
    body: `Try a different year, or check back when the next refresh lands.`,
  };
}
