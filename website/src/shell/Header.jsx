// =============================================================================
// Header.jsx
//
// The institutional header band: a hamburger that opens the site navigation
// drawer (Drawer.jsx), the UAlberta shield, and a framed institutional lockup
// ("University of Alberta" over "Department of Economics") on the LEFT beside the
// mark. The full site name is NOT in the header (it is the hero H1 on Home). All
// identity comes from siteConfig (org + dept) — no hardcoded org string (§6).
//
// This band renders on EVERY route, including the data-console pages (the
// site-wide header ratified in Directive 00, Decision 1). Navigation now lives
// entirely in the drawer the hamburger opens — there is no horizontal nav bar.
// =============================================================================

import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";
import PearlBand from "../components/PearlBand.jsx";
import Shield from "../components/Shield.jsx";
import Icon from "../components/Icon.jsx";
import Drawer from "./Drawer.jsx";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef(null);

  return (
    <header className="shell-header brand">
      <PearlBand variant="band">
        <div className="wrap--full hdr__inner">
          <button
            ref={burgerRef}
            type="button"
            className="hdr__burger"
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-controls="site-drawer"
            onClick={() => setMenuOpen(true)}
          >
            <Icon name="menu-2" size={24} />
          </button>

          <Link to="/" className="hdr__mark" aria-label={`${siteConfig.org}, home`}>
            <Shield size={44} />
          </Link>

          {/* Institutional lockup: parent org over unit, framed. Reads siteConfig. */}
          <div className="hdr__lockup">
            <span className="hdr__lockup-org">{siteConfig.org}</span>
            <span className="hdr__lockup-dept">{siteConfig.dept}</span>
          </div>
        </div>
      </PearlBand>

      <Drawer
        id="site-drawer"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        triggerRef={burgerRef}
      />
    </header>
  );
}
