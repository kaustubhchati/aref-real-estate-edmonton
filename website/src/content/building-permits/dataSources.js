// =============================================================================
// dataSources.js
//
// The option-list seam for Building Permits — what the sidebar controls offer.
// The year list + default come from the published BP manifest (the same file
// the choropleth reads), so a refresh that adds a year flows through with no
// edit here. Each year is its OWN per-year GeoJSON (permit-points/), so the Year
// slider swaps the file (MapView setData); Permit type / Month / value tier are
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
// is a setData swap. No year literal — the year comes from the manifest/slider;
// the filename derives from it, mirroring the choropleth's permit_neighbourhoods.
export const resolvePermitPointsUrl = (year) =>
  assetUrl(`/data/building-permits/permit-points/permit_points_${year}.geojson`);

// Permit type toggle — filters on job_group field in tile.
export const ALL_GROUPS    = "All";
export const JOB_GROUPS    = ["All", "Residential", "Commercial"];
export const DEFAULT_GROUP = ALL_GROUPS;

// Month filter — 0 = all months sentinel.
export const MONTHS = [
  { value: 0,  label: "All months" },
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

// Construction value buckets — interactive legend filter.
// id must be stable (used as React key + Set member).
export const VALUE_BUCKETS = [
  { id:"micro",  label:"< $10k",       min:0,         max:10_000,    radius:4  },
  { id:"small",  label:"$10k–$100k",   min:10_000,    max:100_000,   radius:7  },
  { id:"medium", label:"$100k–$500k",  min:100_000,   max:500_000,   radius:10 },
  { id:"large",  label:"$500k–$2M",    min:500_000,   max:2_000_000, radius:14 },
  { id:"major",  label:"> $2M",        min:2_000_000, max:Infinity,  radius:19 },
];
export const ALL_BUCKET_IDS = VALUE_BUCKETS.map((b) => b.id);
// All buckets active on load — map shows everything by default.
export const DEFAULT_ACTIVE_BUCKETS = new Set(ALL_BUCKET_IDS);
