// =============================================================================
// Header.jsx
//
// Top banner: organization + centre name, both read from siteConfig.
// Clicking the title returns to Home. Nothing else here — Nav is its own
// component (Nav.jsx) so the banner stays uncluttered and easy to restyle.
// =============================================================================

import { Link } from "react-router-dom";
import { siteConfig } from "../config/siteConfig.js";

export default function Header() {
  return (
    <header className="shell-header">
      <Link to="/" className="shell-header-title">
        <span className="shell-header-centre">{siteConfig.centre}</span>
        <span className="shell-header-org">{siteConfig.org}</span>
      </Link>
    </header>
  );
}
