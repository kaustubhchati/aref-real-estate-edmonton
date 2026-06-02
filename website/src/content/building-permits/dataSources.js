// =============================================================================
// dataSources.js
//
// The option-list seam for Building Permits — what the sidebar controls offer.
// Unlike property-assessment's dataSources.js, there is NO URL resolution here:
// all 18 years live in a SINGLE permits.pmtiles, and Year / Job Category are
// applied as client-side MapLibre filters (see BuildingPermitsMap.jsx), not by
// swapping files. So this file just declares the two pick-lists and their
// defaults; adding a year or category later is one edit here.
// =============================================================================

// Coverage runs 2009–2026 (see permits_coverage.csv). Newest year is the most
// useful default. Listed newest-first so the <select> opens on recent years.
export const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
  2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009,
];
export const DEFAULT_YEAR = 2026;

// The 12 raw job_category values exactly as they appear on each feature — the
// filter compares against these strings, so they MUST match the data verbatim.
// "All" is a sentinel (not a real category): selecting it drops the category
// clause from the filter entirely (see buildPermitFilter).
export const ALL_CATEGORIES = "All";
export const JOB_CATEGORIES = [
  ALL_CATEGORIES,
  "Accessory Building Combination",
  "Commercial Demolition",
  "Commercial Excavation",
  "Commercial Final",
  "Commercial Footing / Foundation",
  "Commercial Structural Framing",
  "Home Improvement",
  "House Combination",
  "Mobile Home Move On",
  "Other Miscellaneous Building",
  "Single, Semi-detached & Rowhousing",
  "Uncovered Deck Combination",
];
export const DEFAULT_CATEGORY = ALL_CATEGORIES;
