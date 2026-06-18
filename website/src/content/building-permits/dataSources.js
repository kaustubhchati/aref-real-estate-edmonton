// =============================================================================
// dataSources.js
//
// The option-list seam for Building Permits — what the sidebar controls offer.
// No URL resolution here: all 18 years live in a SINGLE permits.pmtiles, and
// Year / Permit type / Month / value tier are applied as client-side MapLibre
// filters (see BuildingPermitsMap.jsx), not by swapping files.
// =============================================================================

// Years — newest first.
export const YEARS = [
  2026,2025,2024,2023,2022,2021,2020,2019,2018,
  2017,2016,2015,2014,2013,2012,2011,2010,2009,
];
export const DEFAULT_YEAR = 2026;

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
