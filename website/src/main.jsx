// =============================================================================
// main.jsx
//
// App entry. Mounts <BrowserRouter> with one <Layout> route whose children are the
// pages, the code-split map/table sections, and per-nav-item placeholders.
//
// Routing rule of thumb:
//   • Text pages           → eager import from content/pages/
//   • Map / table sections → React.lazy() (code-split — see the note below)
//   • Unbuilt sections     → <Placeholder title=... kind=... />
//
// Keep this file flat (one Route per nav leaf) rather than a route-generator that
// walks siteConfig — Olivia should map any URL to a line top to bottom. Every `to`
// in siteConfig.nav needs a matching <Route> here.
// =============================================================================

import { StrictMode, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Layout from "./shell/Layout.jsx";
import Home from "./content/pages/Home.jsx";
import About from "./content/pages/About.jsx";
import DownloadPage from "./content/download/DownloadPage.jsx";
import ResearchCompetition from "./content/pages/ResearchCompetition.jsx";
import Placeholder from "./content/Placeholder.jsx";

// MapLibre's base stylesheet MUST load BEFORE index.css so our map overrides win the
// cascade (equal specificity → later wins). It used to live in MapView.jsx, but the
// code-split put that in a LAZY chunk that loads AFTER index.css — flipping the order so
// MapLibre's `.maplibregl-map { position: relative }` beat our `.canvas { position:
// absolute; inset: 0 }` and collapsed every map to 0 height. Import it here, eagerly,
// FIRST — this also keeps our popup/control overrides winning.
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";

// CODE-SPLIT sections: the four maps + the Report Card table are React.lazy(), so
// MapLibre GL and @tanstack/react-table land in their OWN chunks that download only
// when a visitor opens that section — the home + read pages boot without a mapping
// engine. The text pages above stay eager (instant, no chunk hop). <Suspense> + the
// fallback live in Layout, around the <Outlet>, so the shell stays put while a
// section chunk loads. (MapLibre worker prewarm moved to MapView.jsx: it now fires
// on the first map-chunk load, not app entry — app-entry prewarm would have pulled
// MapLibre straight back into the boot bundle.)
// A code-split chunk can fail to load when a NEW version deploys while a tab is still
// open on the OLD one: the old app requests hashed chunk names the new deploy replaced,
// so they 404 and the section would break (the exact "maps stopped loading after a
// deploy" failure). lazyWithReload catches that and reloads ONCE — timestamp-guarded, so
// a chunk that's genuinely, repeatedly missing shows the error boundary instead of
// looping — to pull the current deploy's chunks. Standard code-split hardening.
const RELOAD_KEY = "chunk-reload-at";
function lazyWithReload(importer) {
  return lazy(() =>
    importer().catch((err) => {
      const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
      if (Date.now() - last > 10000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {}); // hang until the reload takes over — no error flash
      }
      throw err; // reloaded moments ago and still failing → let the boundary show it
    }),
  );
}

const PropertyAssessmentMap = lazyWithReload(() => import("./content/property-assessment/PropertyAssessmentMap.jsx"));
const BuildingPermitsMap    = lazyWithReload(() => import("./content/building-permits/BuildingPermitsMap.jsx"));
const PermitChoroplethMap   = lazyWithReload(() => import("./content/building-permits/PermitChoroplethMap.jsx"));
const BusinessCensusMap     = lazyWithReload(() => import("./content/economy/BusinessCensusMap.jsx"));
const BusinessCensusSection = lazyWithReload(() => import("./content/economy/BusinessCensusSection.jsx"));
const AmenityPointMap       = lazyWithReload(() => import("./content/amenities/AmenityPointMap.jsx"));
const ReportCard            = lazyWithReload(() => import("./content/report-card/ReportCard.jsx"));

// basename mounts the app under Vite's base path. import.meta.env.BASE_URL is set
// by vite.config's `base`, so it is "/" by default — basename="/" is a no-op — and
// it tracks a subpath deploy automatically without ever drifting from the build base.
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<Layout />}>
          {/* Text pages — real stubs */}
          <Route path="/"                      element={<Home />} />
          <Route path="/about"                 element={<About />} />
          <Route path="/download"              element={<DownloadPage />} />
          <Route path="/research-competition"  element={<ResearchCompetition />} />

          {/* Map / tables routes — mirror siteConfig.nav exactly (every nav `to`
              needs a route here). Live sections render their component; the rest
              are <Placeholder> until built. Live-map URLs are held stable
              (Directive 00 Decision 4): Building Permits keeps its
              /activity/construction-improvement path though its label is now
              "Building Permits". Dropped placeholders (Properties, Land Transfers,
              Parks, Playgrounds, Recreation Facilities, Bike Routes, EV Charging,
              Vegetation, Salary Ranges) were removed; new ones added. */}
          <Route path="/properties/property-assessment"    element={<PropertyAssessmentMap />} />
          <Route path="/properties/zoning"                 element={<Placeholder title="Zoning"                 kind="map" />} />
          <Route path="/properties/land-titles"            element={<Placeholder title="Land Titles"            kind="map" />} />
          <Route path="/activity/dwelling-units"           element={<PermitChoroplethMap />} />
          <Route path="/activity/construction-improvement" element={<BuildingPermitsMap />} />
          <Route path="/amenities/air-quality"             element={<Placeholder title="Air Quality"            kind="map" />} />
          <Route path="/amenities/community-services"      element={<Placeholder title="Community Services"      kind="map" />} />
          <Route path="/amenities/crime"                   element={<Placeholder title="Crime"                  kind="map" />} />
          <Route path="/amenities/public-school"           element={<Placeholder title="Public School"          kind="map" />} />
          <Route path="/amenities/public-transportation"   element={<Placeholder title="Public Transportation"  kind="map" />} />
          {/* Family-1 amenity POINT layers — interim per-layer routes (the thematic
              consolidation that folds them into the leaves above is a later session). Not
              yet in siteConfig.nav; reachable by URL until consolidation wires the nav. */}
          <Route path="/amenities/playgrounds"             element={<AmenityPointMap layerId="playgrounds" />} />
          <Route path="/economy/business-counts"           element={<BusinessCensusMap />} />
          <Route path="/economy/business-census"           element={<BusinessCensusSection />} />
          <Route path="/economy/business-licences"         element={<Placeholder title="Business Licences"      kind="map" />} />
          <Route path="/economy/labour-market"             element={<Placeholder title="Labour Market"          kind="map" />} />

          {/* Report Card — Edmonton table; Calgary will join when its pipeline lands. */}
          <Route path="/report-card" element={<ReportCard />} />

          {/* Catch-all */}
          <Route path="*" element={<Placeholder title="Page not found" kind="404" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
