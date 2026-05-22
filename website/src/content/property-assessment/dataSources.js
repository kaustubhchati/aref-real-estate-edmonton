// =============================================================================
// dataSources.js
//
// The seam: what cities and years this section knows about, and which
// (city, year) combinations have real data files yet.
//
// One row in DATA_SOURCES = one available dataset. Extending later =
// drop the GeoJSON into website/public/data/property-assessment/ and add
// a row here. No code changes elsewhere — the controls, the loader, and
// the empty-state copy all read from this table.
//
// Calgary is listed in CITIES on purpose even though it has no data yet:
// the city switcher should show the button so users can see it's planned;
// selecting it falls through to the empty state via resolveDataUrl returning
// null. When the Calgary GeoJSON ships, add ONE row to DATA_SOURCES — that's
// the whole change.
// =============================================================================

export const CITIES = ["Edmonton", "Calgary"];
export const YEARS = [2026];

export const DEFAULT_CITY = "Edmonton";
export const DEFAULT_YEAR = 2026;

// Flat map keyed by `${city}:${year}`. Missing key = no data yet → empty
// state. Don't gate Calgary behind a "comingSoon" flag; the absence of the
// row IS the gate.
const DATA_SOURCES = {
  "Edmonton:2026": "/data/property-assessment/neighbourhoods_2026_recovered.geojson",
};

export function resolveDataUrl(city, year) {
  return DATA_SOURCES[`${city}:${year}`] ?? null;
}

// Returns true if the city has at least one dataset across any year.
// Used by describeEmpty to pick between "Calgary is coming" (city not
// available at all) vs "Edmonton 2027 not yet ready" (city available,
// just not this year).
export function cityHasAnyData(city) {
  return YEARS.some((y) => resolveDataUrl(city, y) !== null);
}

// Pick empty-state copy that matches WHY the selection has no data.
// Centralised here so a future section can do the same shape but with
// section-specific phrasing.
export function describeEmpty(city, year) {
  if (!cityHasAnyData(city)) {
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
