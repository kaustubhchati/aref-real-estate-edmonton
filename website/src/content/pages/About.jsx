// =============================================================================
// About.jsx  (Directive 05)
//
// Institutional overview + the supervisor-mandated methods content: the
// residential-building-activity scope note, the location/coordinates note, and
// the three-state has-data / suppressed / no-data legend (the suppressed-vs-
// absent honesty distinction). Prose is transcribed from the approved prototype;
// identity strings come from siteConfig.
// =============================================================================

import { siteConfig } from "../../config/siteConfig.js";
import PearlBand from "../../components/PearlBand.jsx";
import Icon from "../../components/Icon.jsx";

// The three map states, with the representative swatch colours from the prototype.
const STATES = [
  { colour: "#1d9e75", label: "Has data",
    desc: "Enough observations to report. Shaded by value." },
  { colour: "#d3d1c7", label: "Suppressed",
    desc: "Some activity, but too few observations to report reliably. Value withheld as a reliability signal, not because the area is empty." },
  { colour: "#f4f1ea", label: "No data",
    desc: "Zero observations for this measure. For example, no permits in the selected year." },
];

const TOC = [
  ["purpose", "Purpose"],
  ["coverage", "Coverage"],
  ["data-methods", "Data and Methods"],
  ["reading", "Reading the Dashboards"],
  ["comparing", "Comparing Figures"],
  ["responsibility", "Responsibility"],
];

export default function About() {
  const { centre, centreFull, suite, footer } = siteConfig;
  return (
    <div className="readpage brand">
      <section className="pagehero">
        <PearlBand variant="hero">
          <div className="wrap">
            <div className="pagehero__inner">
              <div className="pagehero__rule" />
              <p className="pagehero__eyebrow">About</p>
              <h1 className="pagehero__title">About the {centre}</h1>
              <p className="pagehero__sub">
                What this project is, where the data comes from, how to read the
                numbers behind every dashboard.
              </p>
            </div>
          </div>
        </PearlBand>
      </section>

      <section className="pagebody">
        <div className="wrap">
          <div className="doc">
            <nav className="toc" aria-label="On this page">
              <p className="toc__h">On this page</p>
              <ul className="toc__list">
                {TOC.map(([id, label]) => (
                  <li key={id}><a href={`#${id}`}>{label}</a></li>
                ))}
              </ul>
            </nav>

            <div className="content">
              <h2 id="purpose">Purpose</h2>
              <p>
                The {centreFull} promotes data-driven local research most relevant to
                Albertans. Through the {suite}, it presents neighbourhood-level property,
                development, and economic data as interactive dashboards, each pairing a
                live view with the data behind it, for researchers, industry, policymakers,
                and the public. Free to explore, free to download, no login.
              </p>

              <h2 id="coverage">Coverage</h2>
              <p>
                The collection covers the City of Edmonton: 407 neighbourhoods, more than
                fifteen years of history, spanning property assessment, building activity,
                and business data. Calgary is in development.
              </p>

              <h2 id="data-methods">Data and Methods</h2>
              <p>
                An automated pipeline fetches the latest public data, cleans and aggregates
                it to the neighbourhood level, and publishes each dashboard. The same cleaned
                data behind every dashboard is on the Download page.
              </p>

              <div className="note">
                <p className="note__label">
                  <Icon name="info-circle" size={14} /> A Note on Residential Building Activity
                </p>
                <p>
                  Dwelling-unit and construction figures count residential building types
                  only. Unit-bearing non-residential permits, such as office complexes,
                  hotels, and care facilities, are excluded. Demolitions use the
                  City&rsquo;s demolition work type, not any negative-unit entry, matching
                  the City of Edmonton&rsquo;s own published totals.
                </p>
                <p>
                  Because of this scope, some neighbourhood-and-year figures differ from the
                  previous version of this site.
                </p>
              </div>

              <div className="note">
                <p className="note__label">
                  <Icon name="map-pin" size={14} /> A Note on Location
                </p>
                <p>
                  Neighbourhoods are assigned by the City&rsquo;s own neighbourhood attribute
                  on each record, not by locating each point on a map. This is more robust
                  than the older location-based method: a growing share of recent permits
                  arrive without coordinates (roughly 28 percent in 2025, 34 percent in 2026).
                  Those permits are still counted here; the older method dropped them.
                </p>
              </div>

              <h2 id="reading">Reading the Dashboards</h2>
              <p>
                Every neighbourhood appears on every dashboard, in one of three states. The
                distinction matters: too few observations to report reliably is not the same
                as no activity at all.
              </p>
              <div className="states">
                {STATES.map((s) => (
                  <div className="state-row" key={s.label}>
                    <span className="state-swatch" style={{ background: s.colour }} />
                    <p><strong>{s.label}</strong>{s.desc}</p>
                  </div>
                ))}
              </div>

              <h2 id="comparing">Comparing Figures</h2>
              <p>
                This site continues the same underlying data series published previously, with
                the scope choices above. Where a figure differs from an older number, the cause
                is almost always one of those scope choices or a routine source revision by the
                City, not an error. Closed years can shift slightly when the City revises its
                records.
              </p>

              <h2 id="responsibility">Responsibility</h2>
              <p>{footer.responsibilityNote}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
