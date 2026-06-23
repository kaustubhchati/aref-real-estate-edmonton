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
import SectionErrorBoundary from "../components/SectionErrorBoundary.jsx";

export default function Layout() {
  // Key the boundary by route so a section that errored recovers when the user
  // navigates elsewhere (new key → fresh mount). Header/Nav/Footer sit OUTSIDE
  // the boundary, so a section throw can never blank the chrome/nav.
  const location = useLocation();
  return (
    <div className="shell">
      <Header />
      <Nav />
      <main className="shell-main">
        <SectionErrorBoundary key={location.pathname}>
          <Outlet />
        </SectionErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
