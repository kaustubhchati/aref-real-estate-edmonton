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

      <h2>Data notes</h2>
      <p>
        <strong>Annexation areas.</strong> A few polygons cover Edmonton&rsquo;s
        annexed-but-not-yet-subdivided south. They appear on every map with a
        distinct outline and label. They are not neighbourhoods in the ordinary
        sense, but any business, permit, or assessment figures they carry are
        real and included &mdash; not dropped.
      </p>
    </article>
  );
}
