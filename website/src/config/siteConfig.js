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

// ---- Source-data attribution + licence — ONE source of truth ------------
// City of Edmonton Open Data Portal, under the Open Government Licence – City of
// Edmonton (Terms of Use v2.1, Jan 2016). Consumed BOTH by the map's attribution
// control AND by every data export (exportData.js) so the required notice travels
// with any distribution — see the Terms' distribution clause: "If you distribute or
// provide access to the datasets … you agree to include … this URL for … these
// Terms of Use." Attribution itself is REQUESTED, not required, by these Terms; the
// URL-travels-with-distribution obligation is the hard one, so it is centralised here.
//
// NO City of Edmonton LOGO anywhere (deliberate): the Terms licence the DATASETS only
// ("this licence does not give you a copyright or other proprietary interest") and
// grant no right to the City's marks; importing the mark would also imply the
// endorsement the disclaimer exists to disclaim. Text citation + Terms URL is the
// compliant, more rigorous form.
export const EDMONTON_OPEN_DATA = {
  name:       "City of Edmonton Open Data",
  url:        "https://data.edmonton.ca",
  licence:    "Open Government Licence – City of Edmonton (Terms of Use v2.1)",
  termsUrl:   "https://data.edmonton.ca/stories/s/City-of-Edmonton-Open-Data-Terms-of-Use/msh8-if28/",
  disclaimer: "These datasets do not represent an official statement of City policy, practice, services, or procedure.",
};

// Basemap credit — LEGALLY REQUIRED verbatim by CARTO's terms + OSM's ODbL. On the live
// map it is supplied automatically by the CARTO Voyager TileJSON (do NOT repeat it in
// the strip's customAttribution). This copy exists to burn into the PNG export (whose
// canvas does not include the DOM attribution overlay — see exportData.exportPng) and to
// render the CARTO/OSM lines in the attribution PANEL. Wording is fixed by the licences;
// never iconify or abbreviate — the "©" and the word "contributors" are both required.
export const BASEMAP_CREDIT = "© OpenStreetMap contributors, © CARTO";

// The basemap sources as LINKED parts, for the attribution panel. `pre`/`post` carry the
// licence-fixed wording OUTSIDE the link text (the "©" and " contributors"), so the visible
// string reads verbatim "© CARTO" and "© OpenStreetMap contributors" while CARTO /
// OpenStreetMap themselves are the links. URLs match the CARTO TileJSON's own attribution.
export const BASEMAP_SOURCES = [
  { pre: "© ", label: "CARTO",         url: "https://carto.com/about-carto/",      post: "" },
  { pre: "© ", label: "OpenStreetMap", url: "http://www.openstreetmap.org/about/", post: " contributors" },
];

// The two City links, composed once (shared by the strip + the full record below).
const CITY_LINK  = `<a href="${EDMONTON_OPEN_DATA.url}" target="_blank" rel="noopener noreferrer">City of Edmonton Open Data</a>`;
const TERMS_LINK = `<a href="${EDMONTON_OPEN_DATA.termsUrl}" target="_blank" rel="noopener noreferrer">Open Government Licence (Terms of Use v2.1)</a>`;

export const siteConfig = {
  // ---- Identity (placeholders — fill before public launch) ---------------
  org:    "University of Alberta",
  centre: "Open Data Centre",
  dept:   "Department of Economics",
  funder: "{Funder}",

  // ---- Data source + licence (see EDMONTON_OPEN_DATA above) ---------------
  dataSource: EDMONTON_OPEN_DATA,

  // ---- Map attribution ---------------------------------------------------
  // Two shapes (both APPENDED to MapLibre's AttributionControl via customAttribution;
  // the "© CARTO, © OpenStreetMap contributors" basemap credit is added AUTOMATICALLY by
  // the CARTO Voyager TileJSON, never repeated here). Links open in a new tab.
  //
  //  • mapAttribution      — the DEFAULT: source + licence links + the §6 disclaimer.
  //                          Used by sections whose attribution is a single compact
  //                          control (building-permits, business-census).
  //  • mapAttributionStrip — LINKS ONLY (no disclaimer prose). Used by Property
  //                          Assessment's always-visible bottom strip, where the prose
  //                          both overflowed into the console AND is redundant — PA moves
  //                          the disclaimer into its attribution PANEL (the database-glyph
  //                          control), which is the §6 home for it. See DESIGN_SYSTEM §6.
  mapAttribution:      [CITY_LINK, TERMS_LINK, EDMONTON_OPEN_DATA.disclaimer],
  mapAttributionStrip: [CITY_LINK, TERMS_LINK],

  // ---- Footer copy (placeholders) ----------------------------------------
  // Each line corresponds to one block in the footer (Footer.jsx).
  footer: {
    funderLine:   "Department of Economics, University of Alberta",
    partnersLine: "Data: City of Edmonton Open Data Portal",
    territorial:  "The University of Alberta acknowledges that we are located on Treaty 6 territory, and respects the histories, languages, and cultures of First Nations, Métis, Inuit, and all First Peoples of Canada.",
    copyright:    "© 2026 University of Alberta — Open Data Centre",
    logoAlt:      "University of Alberta logo",
  },

  // ---- Download catalogue -------------------------------------------------
  // Publicly released CSV datasets, served as static files from
  // website/public/downloads/. DownloadPage.jsx renders this array — adding a
  // dataset is one entry here plus dropping the file in public/downloads/.
  //
  // Year-bearing bits are TEMPLATES, not literals: {year} / {span} /
  // {recentSpan} / {yearCount} are filled by DownloadPage from the backend
  // manifest named by `source` ("assessment" → PA manifest, "permits" → BP
  // manifest), so labels, filenames, and spans roll forward on the next refresh
  // with no edit here.
  downloads: [
    {
      id: "pa-neighbourhood",
      source: "assessment",
      label: "Property Assessment — {year} Neighbourhood Aggregates",
      description:
        "Layer 1a-cleaned residential assessment aggregated to " +
        "407 Edmonton neighbourhoods. Includes median/mean assessed " +
        "value, lot size, year built, condo share, and year-over-year " +
        "change. Suppressed where N < 100.",
      file: "/downloads/yeg_property-assessment_per_nbhd_{year}.csv",
      size: "45 KB",
      rows: "407 neighbourhoods",
      section: "Properties & Land",
    },
    {
      id: "permits-category-counts",
      source: "permits",
      label: "Building Permits — Counts by Year and Category",
      description:
        "Per-year, per-job-category permit counts for Edmonton, " +
        "{span}. 12 job categories. Useful for trend analysis " +
        "and sector breakdowns.",
      file: "/downloads/yeg_building-permits_category_counts.csv",
      size: "5 KB",
      rows: "{yearCount} years × 12 categories",
      section: "Building Activity",
    },
    {
      id: "permits-coverage",
      source: "permits",
      label: "Building Permits — Mapping Coverage by Year",
      description:
        "Per-year counts of total permits, mapped permits, and " +
        "permits missing coordinates. Documents geocoding lag " +
        "for {recentSpan} years.",
      file: "/downloads/yeg_building-permits_coverage.csv",
      size: "< 1 KB",
      rows: "{yearCount} years",
      section: "Building Activity",
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
