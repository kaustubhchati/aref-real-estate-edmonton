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

    { label: "Data Collection", kind: "group", children: [
      { label: "Neighbourhood Profile", kind: "map", to: "/data-collection/neighbourhood-profile" },
    ]},

    { label: "Properties & Property Assessment", kind: "group", children: [
      { label: "Properties",          kind: "map", to: "/properties/properties" },
      { label: "Property Assessment", kind: "map", to: "/properties/property-assessment" },
    ]},

    { label: "Building Activity", kind: "group", children: [
      { label: "Dwelling Units",             kind: "map", to: "/building/dwelling-units" },
      { label: "Construction & Improvement", kind: "map", to: "/building/construction-improvement" },
    ]},

    { label: "Real Estate Market Activity", kind: "group", children: [
      { label: "Land Transfers", kind: "map", to: "/real-estate/land-transfers" },
    ]},

    { label: "Amenities", kind: "group", children: [
      { label: "Air Quality",           kind: "map", to: "/amenities/air-quality" },
      { label: "Community Services",    kind: "map", to: "/amenities/community-services" },
      { label: "Crime",                 kind: "map", to: "/amenities/crime" },
      { label: "Public School",         kind: "map", to: "/amenities/public-school" },
      { label: "Public Transportation", kind: "map", to: "/amenities/public-transportation" },
    ]},

    { label: "Businesses", kind: "group", children: [
      { label: "Business Licences", kind: "map", to: "/businesses/business-licences" },
      { label: "Business Counts",   kind: "map", to: "/businesses/business-counts" },
    ]},

    { label: "Neighbourhood Report Card", kind: "tables", to: "/report-card" },
    { label: "Download",                  kind: "page",   to: "/download" },
    { label: "Research Competition",      kind: "page",   to: "/research-competition" },
    { label: "About Us",                  kind: "page",   to: "/about" },
    { label: "Feedback",                  kind: "page",   to: "/feedback" },
  ],
};
