// =============================================================================
// Header.jsx
//
// The institutional header band (Directive 03): the UAlberta shield, the centre
// name + department, and the "University of Alberta" wordmark, spread edge-to-
// edge across a dark pearl-green band. All identity comes from siteConfig; the
// wordmark text is derived from siteConfig.org (no hardcoded org string, §6).
//
// This band renders on EVERY route, including the data-console pages (the
// site-wide header ratified in Directive 00, Decision 1). The Nav bar is a
// SEPARATE component (Nav.jsx) so the immersive routes can auto-hide it alone.
// =============================================================================

import { Link } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";
import PearlBand from "../components/PearlBand.jsx";
import Shield from "../components/Shield.jsx";

// The UAlberta wordmark: the org name, first word on its own line, final word
// accented gold. Reads siteConfig.org so a rebrand updates it (§6).
function Wordmark({ org }) {
  const [first, ...rest] = org.split(" ");
  const last = rest.pop();
  return (
    <div className="hdr__wordmark">
      {first}
      <br />
      {rest.length ? `${rest.join(" ")} ` : ""}
      <span>{last}</span>
    </div>
  );
}

export default function Header() {
  return (
    <header className="shell-header brand">
      <PearlBand variant="band">
        <div className="wrap--full hdr__inner">
          <Link to="/" className="hdr__mark" aria-label={`${siteConfig.org}, home`}>
            <Shield size={46} />
          </Link>
          <div className="hdr__id">
            <span className="hdr__centre">{siteConfig.centreFull}</span>
            <span className="hdr__dept">{siteConfig.dept}</span>
          </div>
          <div className="hdr__spacer" />
          <Wordmark org={siteConfig.org} />
        </div>
      </PearlBand>
    </header>
  );
}
