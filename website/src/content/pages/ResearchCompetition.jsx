// =============================================================================
// ResearchCompetition.jsx  (Directive 06)
//
// The annual student/researcher competition page: a page hero and a how-it-works
// section. Prose transcribed from the approved prototype; identity from siteConfig.
// =============================================================================

import { siteConfig } from "../../config/siteConfig.js";
import PearlBand from "../../components/PearlBand.jsx";

export default function ResearchCompetition() {
  const { centreFull } = siteConfig;
  return (
    <div className="readpage brand">
      <section className="pagehero">
        <PearlBand variant="hero">
          <div className="wrap">
            <div className="pagehero__inner">
              <div className="pagehero__rule" />
              <p className="pagehero__eyebrow">Research Competition</p>
              <h1 className="pagehero__title">Research Competition</h1>
              <p className="pagehero__sub">
                An invitation to students and researchers to put this data to work.
              </p>
            </div>
          </div>
        </PearlBand>
      </section>

      <section className="pagebody">
        <div className="wrap">
          <div className="content">
            <p>
              The {centreFull} runs a research competition. It encourages students and
              researchers to use its neighbourhood-level data in original work, from course
              projects to publishable analysis.
            </p>

            <h2>How It Works</h2>
            <ul>
              <li>Use any dataset published on this site.</li>
              <li>Frame a clear question about Alberta&rsquo;s urban neighbourhoods.</li>
              <li>Submit your analysis, plus the data and code behind it.</li>
            </ul>
            <p>Full details, deadlines, and submission instructions are posted each cycle.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
