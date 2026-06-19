// =============================================================================
// siteConfig.js
//
// Single source of identity + navigation for the whole site, per CLAUDE.md §6.
// EVERY org-specific string the shell displays — university, centre, department,
// funder, partners, territorial acknowledgment, copyright, the nav tree — is
// declared here as a placeholder. Components MUST read from this object and
// MUST NOT hardcode any of these strings.
//
// To rebrand: edit this file. Nothing else.
// To add a new map/page: append to `nav` and add a matching <Route> in main.jsx.
//
// Placeholders use {Curly Names} so they're obviously not real copy yet.
// =============================================================================

export const siteConfig = {
  // ---- Identity (placeholders — fill before public launch) ---------------
  org:    "{University Name}",
  centre: "{Data Centre Name}",
  dept:   "{Department}",
  funder: "{Funder}",

  // ---- Footer copy (placeholders) ----------------------------------------
  // Each line corresponds to one block in the footer (Footer.jsx).
  footer: {
    funderLine:   "Funded by {Funder}",
    partnersLine: "Data partners: {Data Partner 1}, {Data Partner 2}",
    territorial:  "{Territorial acknowledgment placeholder.}",
    copyright:    "© {Year} {Organization Name}",
    logoAlt:      "{Organization} logo",
  },

  // ---- Download catalogue -------------------------------------------------
  // Publicly released CSV datasets, served as static files from
  // website/public/downloads/. DownloadPage.jsx renders this array — adding a
  // dataset is one entry here plus dropping the file in public/downloads/.
  downloads: [
    {
      id: "pa-neighbourhood-2026",
      label: "Property Assessment — 2026 Neighbourhood Aggregates",
      description:
        "Layer 1a-cleaned residential assessment aggregated to " +
        "407 Edmonton neighbourhoods. Includes median/mean assessed " +
        "value, lot size, year built, condo share, and year-over-year " +
        "change. Suppressed where N < 100.",
      file: "/downloads/neighbourhood_aggregates_2026.csv",
      size: "45 KB",
      rows: "407 neighbourhoods",
      section: "Properties & Land",
      year: 2026,
    },
    {
      id: "permits-category-counts",
      label: "Building Permits — Counts by Year and Category",
      description:
        "Per-year, per-job-category permit counts for Edmonton, " +
        "2009–2026. 12 job categories. Useful for trend analysis " +
        "and sector breakdowns.",
      file: "/downloads/permits_category_counts.csv",
      size: "5 KB",
      rows: "18 years × 12 categories",
      section: "Building Activity",
      year: 2026,
    },
    {
      id: "permits-coverage",
      label: "Building Permits — Mapping Coverage by Year",
      description:
        "Per-year counts of total permits, mapped permits, and " +
        "permits missing coordinates. Documents geocoding lag " +
        "for 2024–2026 years.",
      file: "/downloads/permits_coverage.csv",
      size: "< 1 KB",
      rows: "18 years",
      section: "Building Activity",
      year: 2026,
    },
  ],

  // ---- Navigation tree ---------------------------------------------------
  // Mirrors the live UAlberta site's nav (CLAUDE.md §6). Each node is either:
  //   • a leaf  — { label, kind: 'page' | 'map' | 'tables', to }
  //   • a group — { label, kind: 'group', children: [...leaves] }
  //
  // `kind` is informational (used to label placeholder pages); routing is
  // driven by `to`. Adding an item here without adding a <Route> in main.jsx
  // produces a 404 — that is on purpose, so the two stay in sync.
  nav: [
    { label: "Home", kind: "page", to: "/" },

    { label: "Properties & Land", kind: "group", children: [
      { label: "Properties",          kind: "map",    to: "/properties/properties" },
      { label: "Property Assessment", kind: "map",    to: "/properties/property-assessment" },
      { label: "Zoning",              kind: "map",    to: "/properties/zoning" },
    ]},

    { label: "Activity", kind: "group", children: [
      { label: "Dwelling Units",             kind: "map", to: "/activity/dwelling-units" },
      { label: "Construction & Improvement", kind: "map", to: "/activity/construction-improvement" },
      { label: "Land Transfers",             kind: "map", to: "/activity/land-transfers" },
    ]},

    { label: "Amenities", kind: "group", children: [
      { label: "Public School",         kind: "map", to: "/amenities/public-school" },
      { label: "Public Transportation", kind: "map", to: "/amenities/public-transportation" },
      { label: "Parks",                 kind: "map", to: "/amenities/parks" },
      { label: "Playgrounds",           kind: "map", to: "/amenities/playgrounds" },
      { label: "Recreation Facilities", kind: "map", to: "/amenities/recreation-facilities" },
      { label: "Bike Routes",           kind: "map", to: "/amenities/bike-routes" },
      { label: "EV Charging",           kind: "map", to: "/amenities/ev-charging" },
      { label: "Vegetation",            kind: "map", to: "/amenities/vegetation" },
    ]},

    { label: "Economy", kind: "group", children: [
      { label: "Business Counts",   kind: "map",    to: "/economy/business-counts" },
      { label: "Business Licences", kind: "map",    to: "/economy/business-licences" },
      { label: "Salary Ranges",     kind: "tables", to: "/economy/salary-ranges" },
    ]},

    { label: "Neighbourhood Report Card", kind: "tables", to: "/report-card" },
    { label: "Download",             kind: "page", to: "/download" },
    { label: "Research Competition", kind: "page", to: "/research-competition" },
    { label: "About Us",             kind: "page", to: "/about" },
    { label: "Feedback",             kind: "page", to: "/feedback" },
  ],
};
