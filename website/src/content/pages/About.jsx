// =============================================================================
// About.jsx — about-us text stub. Identity strings flow from siteConfig.
// =============================================================================

import { siteConfig } from "../../config/siteConfig.js";

export default function About() {
  return (
    <article className="content-page">
      <h1>About</h1>
      <p>
        {siteConfig.centre} is a research initiative based in {siteConfig.dept}{" "}
        at {siteConfig.org}, funded by {siteConfig.funder}.
      </p>
      <p>
        The site replicates the dashboards previously published on Tableau
        Public, refreshed from City of Edmonton open data on a quarterly
        cadence. Full team and methodology pages will appear here.
      </p>
    </article>
  );
}
