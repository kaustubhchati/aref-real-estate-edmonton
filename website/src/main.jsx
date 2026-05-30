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

import Layout from "./shell/Layout.jsx";
import Home from "./content/pages/Home.jsx";
import About from "./content/pages/About.jsx";
import Download from "./content/pages/Download.jsx";
import Feedback from "./content/pages/Feedback.jsx";
import ResearchCompetition from "./content/pages/ResearchCompetition.jsx";
import Placeholder from "./content/Placeholder.jsx";
import PropertyAssessmentMap from "./content/property-assessment/PropertyAssessmentMap.jsx";
import BuildingPermitsMap from "./content/building-permits/BuildingPermitsMap.jsx";
import ReportCard from "./content/report-card/ReportCard.jsx";

import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Text pages — real stubs */}
          <Route path="/"                      element={<Home />} />
          <Route path="/about"                 element={<About />} />
          <Route path="/download"              element={<Download />} />
          <Route path="/feedback"              element={<Feedback />} />
          <Route path="/research-competition"  element={<ResearchCompetition />} />

          {/* Map routes — placeholders until each section is built */}
          <Route path="/data-collection/neighbourhood-profile"  element={<Placeholder title="Neighbourhood Profile"      kind="map" />} />
          <Route path="/properties/properties"                  element={<Placeholder title="Properties"                 kind="map" />} />
          <Route path="/properties/property-assessment"         element={<PropertyAssessmentMap />} />
          <Route path="/building/dwelling-units"                element={<Placeholder title="Dwelling Units"             kind="map" />} />
          <Route path="/building/construction-improvement"      element={<BuildingPermitsMap />} />
          <Route path="/real-estate/land-transfers"             element={<Placeholder title="Land Transfers"             kind="map" />} />
          <Route path="/amenities/air-quality"                  element={<Placeholder title="Air Quality"                kind="map" />} />
          <Route path="/amenities/community-services"           element={<Placeholder title="Community Services"         kind="map" />} />
          <Route path="/amenities/crime"                        element={<Placeholder title="Crime"                      kind="map" />} />
          <Route path="/amenities/public-school"                element={<Placeholder title="Public School"              kind="map" />} />
          <Route path="/amenities/public-transportation"        element={<Placeholder title="Public Transportation"      kind="map" />} />
          <Route path="/businesses/business-licences"           element={<Placeholder title="Business Licences"          kind="map" />} />
          <Route path="/businesses/business-counts"             element={<Placeholder title="Business Counts"            kind="map" />} />

          {/* Report Card — Edmonton table; Calgary will join when its pipeline lands. */}
          <Route path="/report-card" element={<ReportCard />} />

          {/* Catch-all */}
          <Route path="*" element={<Placeholder title="Page not found" kind="404" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
