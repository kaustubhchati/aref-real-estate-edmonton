// =============================================================================
// main.jsx
//
// App entry. Mounts <BrowserRouter> with one <Layout> route whose children are
// the pages and per-nav-item placeholders.
//
// Routing rule of thumb:
//   • Text pages   → import the real page component from content/pages/
//   • Map / tables → <Placeholder title=... kind=... /> until the section is built
//
// Keep this file flat (one Route per nav leaf) rather than introducing a
// route-generator that walks siteConfig — Olivia should be able to map any URL
// to a line here by reading top to bottom. When a real map ships, swap its
// <Placeholder> for the section component on its own line.
// =============================================================================

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import maplibregl from "maplibre-gl";

import Layout from "./shell/Layout.jsx";
import Home from "./content/pages/Home.jsx";
import About from "./content/pages/About.jsx";
import DownloadPage from "./content/download/DownloadPage.jsx";
import Feedback from "./content/pages/Feedback.jsx";
import ResearchCompetition from "./content/pages/ResearchCompetition.jsx";
import Placeholder from "./content/Placeholder.jsx";
import PropertyAssessmentMap from "./content/property-assessment/PropertyAssessmentMap.jsx";
import BuildingPermitsMap from "./content/building-permits/BuildingPermitsMap.jsx";
import PermitChoroplethMap from "./content/building-permits/PermitChoroplethMap.jsx";
import BusinessCensusMap from "./content/economy/BusinessCensusMap.jsx";
import ReportCard from "./content/report-card/ReportCard.jsx";

import "./index.css";

// Warm MapLibre's worker pool + WebGL resources at app entry, BEFORE any map
// mounts — the init overlaps React's first render, so the first map paints sooner.
// This is a maps-first site (most sections are maps), so we deliberately do NOT
// clearPrewarmedResources(): clearing then re-warming on the next map would be
// net-negative. One-time, no teardown.
maplibregl.prewarm();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Text pages — real stubs */}
          <Route path="/"                      element={<Home />} />
          <Route path="/about"                 element={<About />} />
          <Route path="/download"              element={<DownloadPage />} />
          <Route path="/feedback"              element={<Feedback />} />
          <Route path="/research-competition"  element={<ResearchCompetition />} />

          {/* Map routes — placeholders until each section is built */}
          <Route path="/properties/properties"                  element={<Placeholder title="Properties"                 kind="map" />} />
          <Route path="/properties/property-assessment"         element={<PropertyAssessmentMap />} />
          <Route path="/properties/zoning"                      element={<Placeholder title="Zoning"                     kind="map" />} />
          <Route path="/activity/dwelling-units"                element={<PermitChoroplethMap />} />
          <Route path="/activity/construction-improvement"      element={<BuildingPermitsMap />} />
          <Route path="/activity/land-transfers"                element={<Placeholder title="Land Transfers"             kind="map" />} />
          <Route path="/amenities/public-school"                element={<Placeholder title="Public School"              kind="map" />} />
          <Route path="/amenities/public-transportation"        element={<Placeholder title="Public Transportation"      kind="map" />} />
          <Route path="/amenities/parks"                        element={<Placeholder title="Parks"                      kind="map" />} />
          <Route path="/amenities/playgrounds"                  element={<Placeholder title="Playgrounds"                kind="map" />} />
          <Route path="/amenities/recreation-facilities"        element={<Placeholder title="Recreation Facilities"      kind="map" />} />
          <Route path="/amenities/bike-routes"                  element={<Placeholder title="Bike Routes"                kind="map" />} />
          <Route path="/amenities/ev-charging"                  element={<Placeholder title="EV Charging"                kind="map" />} />
          <Route path="/amenities/vegetation"                   element={<Placeholder title="Vegetation"                 kind="map" />} />
          <Route path="/economy/business-counts"                element={<BusinessCensusMap />} />
          <Route path="/economy/business-licences"              element={<Placeholder title="Business Licences"          kind="map" />} />
          <Route path="/economy/salary-ranges"                  element={<Placeholder title="Salary Ranges"              kind="tables" />} />

          {/* Report Card — Edmonton table; Calgary will join when its pipeline lands. */}
          <Route path="/report-card" element={<ReportCard />} />

          {/* Catch-all */}
          <Route path="*" element={<Placeholder title="Page not found" kind="404" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
