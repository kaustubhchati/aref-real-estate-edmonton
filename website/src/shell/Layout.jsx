// =============================================================================
// Layout.jsx
//
// The page frame every route renders inside. Header + Nav up top, the active
// route's content in the middle (via <Outlet />), Footer at the bottom.
//
// This component owns no state — it's purely structural. If a future page
// needs a different chrome (e.g. a full-bleed map page with no footer), add
// a sibling layout rather than adding props here.
// =============================================================================

import { Outlet, useLocation } from "react-router-dom";
import Header from "./Header.jsx";
import Nav from "./Nav.jsx";
import Footer from "./Footer.jsx";
import EdgeReveal from "./EdgeReveal.jsx";
import SectionErrorBoundary from "../components/SectionErrorBoundary.jsx";

// Routes that run the immersive map chrome (Nav + Footer auto-hide so the map
// fills the frame). One entry today; add a path here when another map opts in.
// useLocation().pathname has the router basename stripped, so match the bare path.
const IMMERSIVE_ROUTES = new Set(["/properties/property-assessment"]);

export default function Layout() {
  // Key the boundary by route so a section that errored recovers when the user
  // navigates elsewhere (new key → fresh mount). Header/Nav/Footer sit OUTSIDE
  // the boundary, so a section throw can never blank the chrome/nav.
  const location = useLocation();
  const immersive = IMMERSIVE_ROUTES.has(location.pathname);

  return (
    <div className={`shell${immersive ? " shell-immersive" : ""}`}>
      <Header />
      {/* On an immersive route the Nav (section selector) auto-hides into the top
          edge; everywhere else it's the normal sticky bar. */}
      {immersive ? (
        <EdgeReveal side="top" label="site navigation"><Nav /></EdgeReveal>
      ) : (
        <Nav />
      )}
      <main className="shell-main">
        <SectionErrorBoundary key={location.pathname}>
          <Outlet />
        </SectionErrorBoundary>
      </main>
      {immersive ? (
        <EdgeReveal side="bottom" label="site footer"><Footer /></EdgeReveal>
      ) : (
        <Footer />
      )}
    </div>
  );
}
