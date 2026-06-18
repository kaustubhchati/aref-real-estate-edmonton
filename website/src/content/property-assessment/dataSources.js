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
  const res = await fetch("/manifest.json");
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

// Map a (city, year) to its committed GeoJSON path. Gating lives upstream:
// callers only resolve a year that getYearsForCity returned, so a city/year
// without data never reaches here. The filename is currently year-keyed only
// (Edmonton history); revisit the path shape when Calgary's files land.
export function resolveDataUrl(city, year) {
  return `/data/property-assessment/neighbourhoods_${year}_recovered.geojson`;
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
