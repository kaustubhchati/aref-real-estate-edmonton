// =============================================================================
// Footer.jsx
//
// Four lines, exactly as CLAUDE.md §6 specifies: funder, data partners,
// territorial acknowledgment, copyright. Every string is a placeholder read
// from siteConfig.footer — never hardcoded here.
//
// The logo is intentionally rendered as a text alt placeholder until real
// brand assets land; swap the <span> for an <img> when those exist.
// =============================================================================

import { siteConfig } from "../config/siteConfig.js";

export default function Footer() {
  const f = siteConfig.footer;
  return (
    <footer className="shell-footer">
      <div className="shell-footer-logo" aria-label={f.logoAlt}>
        {/* TODO: replace with <img src="..." alt={f.logoAlt} /> when brand assets exist */}
        [logo]
      </div>
      <p className="shell-footer-line">{f.funderLine}</p>
      <p className="shell-footer-line">{f.partnersLine}</p>
      <p className="shell-footer-line shell-footer-territorial">{f.territorial}</p>
      <p className="shell-footer-line shell-footer-copy">{f.copyright}</p>
    </footer>
  );
}
