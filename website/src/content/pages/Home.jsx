// =============================================================================
// Home.jsx — landing page text stub.
// Real content (mission, what's new, featured maps) will arrive once at least
// one section is live. Until then, this orients a first-time visitor.
// =============================================================================

import { siteConfig } from "../../config/siteConfig.js";

export default function Home() {
  return (
    <article className="content-page">
      <h1>{siteConfig.centre}</h1>
      <p>
        A free, public clone of the {siteConfig.centre} dashboards — open
        urban-real-estate data for Alberta, rebuilt as our own maps and
        downloadable files. Hosted by {siteConfig.dept} at {siteConfig.org}.
      </p>
      <p>
        Use the navigation above to browse by topic. Sections come online one
        at a time as their data pipelines are validated.
      </p>
    </article>
  );
}
