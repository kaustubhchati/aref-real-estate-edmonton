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
// The specific SOURCE DATASET's about-page (Business Census, 8c4b-u4a4). PA links the portal
// generically (no per-dataset link), so this is a proposed BC slot: alongside the portal +
// licence in the strip (see the CC report + DESIGN_SYSTEM §6 attribution standard).
const BC_DATASET_LINK = `<a href="https://data.edmonton.ca/Urban-Planning-Economy/Edmonton-Business-Census/8c4b-u4a4/about_data" target="_blank" rel="noopener noreferrer">Edmonton Business Census</a>`;

export const siteConfig = {
  // ---- Identity ----------------------------------------------------------
  // org/dept/centre are the COMPACT forms the current shell shows; `centreFull`
  // is the full public title (browser <title>, hero, footer mark). The suite*
  // strings + coverage note are the approved prototype copy (bundle.html),
  // consumed by the rebuilt shell (Dir 03) and Home/About (Dir 04-05). The
  // `{Funder}` placeholder is retired here per Directive 00 §F.
  org:        "University of Alberta",
  centre:     "Open Data Centre",
  centreFull: "Open Data Centre for Alberta Urban Real Estate",
  dept:       "Department of Economics",
  funder:     "Alberta Real Estate Foundation",

  // The named dashboard suite + its framing copy (prototype-approved).
  suite:        "Urban Alberta Dashboards",
  suiteArticle: "the Urban Alberta Dashboards",
  suiteTagline: "Interactive geo-dashboards enabling city-wide exploration of metrics across all neighbourhoods and years.",
  coverageNote: "Edmonton available now. Calgary in development.",
  domain:       "realestatedata.srv.ualberta.ca",

  // Hero lede: the site-name H1 renders from centreFull; this is its supporting line.
  heroSub: "The single source for Alberta's urban real estate data, integrating property, construction, and economic records across every neighbourhood to enable data-driven research for Albertans.",

  // Home-page headline stats (prototype-approved marketing figures, not live-
  // computed). Update here if the collection grows.
  stats: [
    { value: "407",   label: "neighbourhoods" },
    { value: "3.5M+", label: "records integrated" },
    { value: "15+",   label: "years of data" },
  ],

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
  //  • bcMapAttribution    — Business Census: links only (KC 2026-07-24 — the prose is
  //                          removed site-wide) PLUS the specific source-dataset link. The
  //                          disclaimer is NOT dropped from the codebase (EDMONTON_OPEN_DATA
  //                          still carries it for the panel); it is simply off the rail.
  mapAttribution:      [CITY_LINK, TERMS_LINK, EDMONTON_OPEN_DATA.disclaimer],
  mapAttributionStrip: [CITY_LINK, TERMS_LINK],
  bcMapAttribution:    [CITY_LINK, BC_DATASET_LINK, TERMS_LINK],

  // ---- Footer copy (placeholders) ----------------------------------------
  // Each line corresponds to one block in the footer (Footer.jsx).
  footer: {
    // Institutional footer content (prototype-approved, transcribed from
    // bundle.html), consumed by Footer.jsx (Directive 03).
    territorialAck:
      "The University of Alberta, its buildings, labs, and research stations are " +
      "primarily located on the traditional territory of Cree, Blackfoot, Métis, " +
      "Nakota Sioux, Iroquois, Dene, and Ojibway/Saulteaux/Anishinaabe nations; " +
      "lands that are now known as part of Treaties 6, 7, and 8 and homeland of " +
      "the Métis. The University of Alberta respects the sovereignty, lands, " +
      "histories, languages, knowledge systems, and cultures of First Nations, " +
      "Métis and Inuit nations.",
    responsibilityNote:
      "The Open Data Centre for Alberta Urban Real Estate is responsible for " +
      "potential errors in the integration, aggregation, and presentation " +
      "process of the underlying data.",
    dataPartners: [
      "Realtors Associations of Edmonton",
      "Alberta Land Titles",
      "City of Edmonton",
      "Edmonton Public School Board",
      "AltaLIS",
    ],
    openSources: [
      "Edmonton Open Data Portal",
      "Open Calgary",
      "Government of Alberta Open Data",
      "Statistics Canada",
    ],
    // Social links — PLACEHOLDER hrefs ("#") pending real URLs (or removal); the
    // centre may not keep distinct socials. KC decision before launch (Dir 03).
    socials: [
      { label: "Facebook",    icon: "brand-facebook",  href: "#" },
      { label: "X (Twitter)", icon: "brand-x",         href: "#" },
      { label: "Instagram",   icon: "brand-instagram", href: "#" },
      { label: "YouTube",     icon: "brand-youtube",   href: "#" },
    ],
    copyrightYear: new Date().getFullYear(),
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
      label: "Property Assessment: {year} Neighbourhood Aggregates",
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
      label: "Building Permits: Counts by Year and Category",
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
      label: "Building Permits: Mapping Coverage by Year",
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
  // The SINGLE source for the header nav AND (via the group nodes) the Home
  // "Urban Alberta Dashboards" card grid. Each node is either:
  //   • a leaf  — { label, kind: 'page' | 'map' | 'tables', to, status? }
  //   • a group — { label, kind: 'group', icon, children: [...leaves] }
  //
  // `status` ('live' | 'soon') drives the live/soon badges (nav dropdowns + home
  // cards). `icon` is an Icon.jsx glyph name (no 'ti-' prefix) for the category
  // cards. `kind` labels placeholder pages; routing is driven by `to`. Every `to`
  // needs a matching <Route> in main.jsx or it 404s — the two are kept in sync.
  //
  // Live-map paths are HELD STABLE (Directive 00 Decision 4): "Building Permits"
  // keeps its /activity/construction-improvement URL though the label changed;
  // Property Assessment / Dwelling Units / Business Counts keep theirs (they are
  // also Layout's IMMERSIVE_ROUTES). Renamed ("Labour Market", ex-"Salary Ranges")
  // and new ("Land Titles", "Air Quality", "Community Services", "Crime") leaves
  // take fresh paths.
  nav: [
    { label: "Home", kind: "page", to: "/" },

    { label: "Properties & Land", kind: "group", icon: "home-dollar", children: [
      { label: "Property Assessment", kind: "map", status: "live", to: "/properties/property-assessment" },
      { label: "Zoning",              kind: "map", status: "soon", to: "/properties/zoning" },
      { label: "Land Titles",         kind: "map", status: "soon", to: "/properties/land-titles" },
    ]},

    { label: "Building Activity", kind: "group", icon: "building-community", children: [
      { label: "Dwelling Units",  kind: "map", status: "live", to: "/activity/dwelling-units" },
      { label: "Building Permits", kind: "map", status: "live", to: "/activity/construction-improvement" },
    ]},

    { label: "Amenities", kind: "group", icon: "map-pin", children: [
      { label: "Air Quality",           kind: "map", status: "soon", to: "/amenities/air-quality" },
      { label: "Community Services",    kind: "map", status: "soon", to: "/amenities/community-services" },
      { label: "Crime",                 kind: "map", status: "soon", to: "/amenities/crime" },
      { label: "Public School",         kind: "map", status: "soon", to: "/amenities/public-school" },
      { label: "Public Transportation", kind: "map", status: "soon", to: "/amenities/public-transportation" },
    ]},

    { label: "Economy", kind: "group", icon: "briefcase", children: [
      { label: "Business Counts",    kind: "map", status: "live", to: "/economy/business-counts" },
      { label: "Business Census",    kind: "map", status: "live", to: "/economy/business-census" },
      { label: "Business Licences",  kind: "map", status: "soon", to: "/economy/business-licences" },
      { label: "Labour Market",     kind: "map", status: "soon", to: "/economy/labour-market" },
    ]},

    { label: "Neighbourhood Report Card", kind: "tables", status: "live", to: "/report-card" },
    { label: "Download",             kind: "page", to: "/download" },
    { label: "Research Competition", kind: "page", to: "/research-competition" },
    { label: "About Us",             kind: "page", to: "/about" },
  ],
};
