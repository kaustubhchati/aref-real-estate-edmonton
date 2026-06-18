// =============================================================================
// Footer.jsx
//
// Dark three-column footer (About / Funding / Land Acknowledgment) over a
// divider + centred copyright, matching the dark header. Every string is a
// placeholder read from siteConfig — never hardcoded here.
// =============================================================================

import { siteConfig } from "../config/siteConfig.js";

export default function Footer() {
  return (
    <footer className="shell-footer"><div className="shell-footer-inner">
      <div className="shell-footer-grid">
        <div><p className="shell-footer-col-label">About</p>
          <p className="shell-footer-line">{siteConfig.centre}</p>
          <p className="shell-footer-line">{siteConfig.org}</p></div>
        <div><p className="shell-footer-col-label">Funding</p>
          <p className="shell-footer-line">{siteConfig.footer.funderLine}</p>
          <p className="shell-footer-line">{siteConfig.footer.partnersLine}</p></div>
        <div><p className="shell-footer-col-label">Land Acknowledgment</p>
          <p className="shell-footer-territorial">{siteConfig.footer.territorial}</p></div>
      </div>
      <hr className="shell-footer-divider" />
      <p className="shell-footer-copy">{siteConfig.footer.copyright}</p>
    </div></footer>
  );
}
