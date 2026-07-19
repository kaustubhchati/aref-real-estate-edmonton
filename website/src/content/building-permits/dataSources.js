// =============================================================================
// dataSources.js
//
// The option-list seam for Building Permits — what the sidebar controls offer.
// The year list + default come from the published BP manifest (the same file
// the choropleth reads), so a refresh that adds a year flows through with no
// edit here. Each year is its OWN per-year GeoJSON (permit-points/), so the Year
// slider swaps the file (MapView recreates the source); Permit type / Month / value tier are
// client-side MapLibre filters on the loaded year (see BuildingPermitsMap).
// =============================================================================

import { assetUrl } from "../../utils/assetUrl.js";

// Load the published BP manifest: { years:[...], defaultYear }. Errors surface
// so the caller can show / log them. Mirrors property-assessment/dataSources.js.
export async function loadPermitManifest() {
  const res = await fetch(assetUrl("/data/building-permits/manifest.json"));
  if (!res.ok) {
    throw new Error(`Could not load the permit year catalogue (HTTP ${res.status})`);
  }
  return res.json();
}

// Years newest-first for the slider; the year to open on. Empty / null when the
// manifest lacks the field (the UI shows a loading state until they resolve).
export const permitYears = (m) => [...(m?.years ?? [])].sort((a, b) => b - a);
export const permitDefaultYear = (m) => m?.defaultYear ?? null;

// The per-year point GeoJSON for one year (published by the runner from 01's 4b2
// emit). The slider passes the result as MapView's geojsonUrl, so a year change
// recreates the source. No year literal — the year comes from the manifest/slider;
// the filename derives from it, mirroring the choropleth's permit_neighbourhoods.
export const resolvePermitPointsUrl = (year) =>
  assetUrl(`/data/building-permits/permit-points/permit_points_${year}.geojson`);

// === Choropleth combined-file model (the Data Console's resident source) =======
//
// The Dwelling Units CHOROPLETH (PermitChoroplethMap + its Analysis console) loads
// ONE combined all-years GeoJSON (02b) — geometry once, every year's values as flat
// <field>_<year> props — so a year change is a paint swap, not a file reload, and a
// per-neighbourhood trend is readable client-side. This mirrors PA's dataSources.js
// (projectYearCollection + resolveCombinedUrl), kept DU-local rather than shared:
// a self-contained section file of trivial code beats a clever cross-section factory
// (§6). NB: the POINT map above stays on its per-year files — different product.

// The combined all-years choropleth file (02b's output; runner-published).
export const resolveCombinedPermitUrl = () =>
  assetUrl(`/data/building-permits/permit-neighbourhoods/permit_neighbourhoods_all_years.geojson`);

// The value fields the combined file carries per year as <field>_<year>. The four
// identity fields (Neighbourhood ID, display_name, district, is_annexation_area) are
// year-invariant and NOT suffixed. Mirrors 02b's VALUE_COLS — the backend/frontend
// contract for which columns are year-keyed.
export const PER_YEAR_FIELDS = [
  "polygon_state",
  "n_permits",
  "total_construction_value",
  "median_construction_value",
  "units_added_gross",
  "units_demolished",
  "yoy_pct_permits",
];

// Project a combined feature's props to the BARE-named shape the rest of the section
// expects, for one year: <field>_<year> -> <field>. Identity fields pass through. The
// seam that lets metricStops, the popup, search and the detail read bare names while
// the source is the combined all-years file.
export function projectYearProps(props, year) {
  const out = { ...props };
  for (const f of PER_YEAR_FIELDS) out[f] = props[`${f}_${year}`];
  return out;
}

// Project a whole combined FeatureCollection to one year's bare-named view. Geometry
// is shared by reference (only properties are reshaped), so this is cheap to recompute
// on every year change. Returns null on null.
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

// === Selection / area aggregate (the KPI rail's math) ==========================
//
// Roll a set of combined features up to one area total, for `year` (+ `prevYear`
// for the exact area-YoY). Reads the RAW <field>_<year> props directly (not the
// projected view) so both years are reachable in one pass.
//
// The DU analogue of PA's aggregateFeatures — but SUM-based, because DU carries no
// parcel-count weight and its measures are counts/$ totals, not parcel-weighted means.
// Scope = REPORTABLE (aggregated) only, so the KPI cards describe the SAME set the map
// colours + the table lists + the distribution bins (internal consistency), and it
// matches PA's aggregated-only value aggregates. suppressed_low_n (the established
// "values suppressed for N<10" state) + no_data are COUNTED (nSuppressed / nExcluded)
// but never summed — pooling their values would contradict the suppression the whole
// UI already shows. Exact-vs-estimate contract (mirrors PA's honesty split):
//   • Sums (permits, construction value, units added/demolished) + area-YoY are EXACT.
//   • medianOfMedianCV is an ESTIMATE (median of per-neighbourhood medians) — it carries
//     the "≈ of medians" §6 tag wherever it shows.
const num = (v) => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) || n === -999 ? null : n;
};
const medianOf = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function aggregatePermitFeatures(features, year, prevYear) {
  let nReportable = 0, nSuppressed = 0, nExcluded = 0;
  let sumPermits = 0, sumConstructionValue = 0, sumUnitsAdded = 0, sumUnitsDemolished = 0;
  let sumPermitsPrev = 0;
  const medians = [];

  for (const f of features) {
    const p = f.properties;
    const state = p[`polygon_state_${year}`];

    // Reportable (aggregated) only. suppressed_low_n keeps the established "values
    // suppressed for N<10" semantics — counted, never summed; no_data is out entirely.
    if (state === "suppressed_low_n") { nSuppressed++; continue; }
    if (state !== "aggregated") { nExcluded++; continue; }   // no_data / unknown
    nReportable++;

    // Sums over the reportable set. null / -999 sentinel skipped. A sum is EXACT; the one
    // estimate is medianOfMedianCV (a median of per-neighbourhood medians).
    const np = num(p[`n_permits_${year}`]);                  if (np != null) sumPermits += np;
    const cv = num(p[`total_construction_value_${year}`]);   if (cv != null) sumConstructionValue += cv;
    const ua = num(p[`units_added_gross_${year}`]);          if (ua != null) sumUnitsAdded += ua;
    const ud = num(p[`units_demolished_${year}`]);           if (ud != null) sumUnitsDemolished += ud;
    if (prevYear != null) {
      const npp = num(p[`n_permits_${prevYear}`]);           if (npp != null) sumPermitsPrev += npp;
    }
    const mcv = num(p[`median_construction_value_${year}`]); if (mcv != null) medians.push(mcv);
  }

  return {
    nReportable, nSuppressed, nExcluded,
    sumPermits, sumConstructionValue, sumUnitsAdded, sumUnitsDemolished,
    netUnits: sumUnitsAdded - sumUnitsDemolished,
    medianOfMedianCV: medianOf(medians),
    // Exact area-YoY of permit COUNT: Σthis / Σprev − 1 (over the same data-bearing
    // set). null when there is no prior year in range or the prior sum is 0.
    areaYoYPermits:
      prevYear != null && sumPermitsPrev > 0
        ? (sumPermits - sumPermitsPrev) / sumPermitsPrev
        : null,
  };
}

// Permit type toggle — filters on job_group field in tile.
export const ALL_GROUPS    = "All";
export const JOB_GROUPS    = ["All", "Residential", "Commercial"];
export const DEFAULT_GROUP = ALL_GROUPS;

// Month filter — 0 = all months sentinel.
export const MONTHS = [
  { value: 0,  label: "All Months" },
  { value: 1,  label: "Jan" },
  { value: 2,  label: "Feb" },
  { value: 3,  label: "Mar" },
  { value: 4,  label: "Apr" },
  { value: 5,  label: "May" },
  { value: 6,  label: "Jun" },
  { value: 7,  label: "Jul" },
  { value: 8,  label: "Aug" },
  { value: 9,  label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];
export const DEFAULT_MONTH = 0;

// Construction value buckets — interactive legend filter (id + label + [min,max) bounds).
// id must be stable (used as React key + Set member). (Removed a dead `radius` field here — it
// was never read; the legend cards size from PermitLegend.TIER_RADII and the map dots from the
// radius expression's tier multipliers. Those two remain separate by purpose — legend px vs map
// zoom×tier ratios — a unify-or-leave call flagged as a follow-up, out of this honesty fix.)
export const VALUE_BUCKETS = [
  { id:"micro",  label:"< $10k",       min:0,         max:10_000    },
  { id:"small",  label:"$10k–$100k",   min:10_000,    max:100_000   },
  { id:"medium", label:"$100k–$500k",  min:100_000,   max:500_000   },
  { id:"large",  label:"$500k–$2M",    min:500_000,   max:2_000_000 },
  { id:"major",  label:"> $2M",        min:2_000_000, max:Infinity  },
];
export const ALL_BUCKET_IDS = VALUE_BUCKETS.map((b) => b.id);
// All buckets active on load — map shows everything by default.
export const DEFAULT_ACTIVE_BUCKETS = new Set(ALL_BUCKET_IDS);
