// =============================================================================
// Layout.jsx
//
// The page frame every route renders inside. The header (with the navigation
// drawer's hamburger) sits up top, the active route's content in the middle
// (via <Outlet />), and the Footer at the bottom. Navigation lives in the
// off-canvas drawer the header opens (Drawer.jsx) — there is no nav bar here.
//
// This component owns no state — it's purely structural. If a future page
// needs a different chrome (e.g. a full-bleed map page with no footer), add
// a sibling layout rather than adding props here.
// =============================================================================

import { useEffect, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import Footer from "./Footer.jsx";
import SectionErrorBoundary from "../components/SectionErrorBoundary.jsx";

// Routes that run the immersive map chrome (the Footer is removed so the map's
// data table can own the bottom edge). Property Assessment is the standard;
// Dwelling Units, Business Counts, and the Building Permits point map all adopt it.
// useLocation().pathname has the router basename stripped, so match the bare path.
const IMMERSIVE_ROUTES = new Set([
  "/properties/property-assessment",
  "/activity/dwelling-units",
  "/economy/business-counts",
  "/economy/business-census",
  "/activity/construction-improvement",
  "/amenities/playgrounds",
]);

// Shown in the content area while a code-split section chunk downloads (the maps +
// Report Card are React.lazy — main.jsx). A neutral pulse, not a spinner; the map's
// own MapSkeleton takes over once its GeoJSON starts loading.
function RouteFallback() {
  return <div className="route-fallback" role="status" aria-label="Loading section" />;
}

export default function Layout() {
  // Key the boundary by route so a section that errored recovers when the user
  // navigates elsewhere (new key → fresh mount). Header/Footer sit OUTSIDE the
  // boundary, so a section throw can never blank the chrome.
  const location = useLocation();
  const immersive = IMMERSIVE_ROUTES.has(location.pathname);

  // Reset scroll to the top on every route change. The read pages scroll the
  // document BODY (index.css :has(.readpage)); without this, navigating away from
  // a scrolled page would land you part-way down the next one, which reads as the
  // click doing nothing. Keyed on pathname, so in-page "#anchor" jumps (hash-only
  // changes) are unaffected; a no-op on the fixed-viewport console routes.
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  return (
    <div className={`shell${immersive ? " shell-immersive" : ""}`}>
      <Header />
      <main className="shell-main">
        <SectionErrorBoundary key={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </SectionErrorBoundary>
      </main>
      {/* On the immersive map route the footer is fully removed (not just hidden):
          the data table owns the bottom edge, and a hidden-but-present footer could
          intercept pointer events over the map. The footer is present on every
          other route. */}
      {!immersive && <Footer />}
    </div>
  );
}
