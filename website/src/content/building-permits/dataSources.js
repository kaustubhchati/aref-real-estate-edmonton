// =============================================================================
// dataSources.js
//
// The option-list seam for Building Permits — what the sidebar controls offer.
// Unlike property-assessment's dataSources.js, there is NO URL resolution here:
// all 18 years live in a SINGLE permits.pmtiles, and Year / Permit type / Month
// are applied as client-side MapLibre filters (see BuildingPermitsMap.jsx), not
// by swapping files. So this file just declares the pick-lists and their
// defaults; adding a year later is one edit here.
// =============================================================================

// Coverage runs 2009–2026 (see permits_coverage.csv). Newest year is the most
// useful default. Listed newest-first so the <select> opens on recent years.
export const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
  2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009,
];
export const DEFAULT_YEAR = 2026;

// Permit type — the two job_group values plus an "All" sentinel. The filter
// compares against the feature's job_group field (lower-cased: "residential" /
// "commercial"); "All" drops the clause entirely (see buildPermitFilter). Only
// three options, so the sidebar uses a segmented OptionToggle, not a <select>.
export const ALL_GROUPS = "All";
export const JOB_GROUPS = ["All", "Residential", "Commercial"];
export const DEFAULT_GROUP = ALL_GROUPS;

// Month filter. value 0 is the "All months" sentinel (no month clause — see
// buildPermitFilter / buildHeatmapFilter); 1–12 match the tile's month_number
// field verbatim. Short labels keep the <select> narrow in the sidebar.
export const MONTHS = [
  { value: 0,  label: "All months" },
  { value: 1,  label: "Jan" }, { value: 2,  label: "Feb" },
  { value: 3,  label: "Mar" }, { value: 4,  label: "Apr" },
  { value: 5,  label: "May" }, { value: 6,  label: "Jun" },
  { value: 7,  label: "Jul" }, { value: 8,  label: "Aug" },
  { value: 9,  label: "Sep" }, { value: 10, label: "Oct" },
  { value: 11, label: "Nov" }, { value: 12, label: "Dec" },
];
export const DEFAULT_MONTH = 0;
