// =============================================================================
// Home.jsx  (Directive 04)
//
// The landing page: a pearl hero, a stats strip that overlaps it, the "Urban
// Alberta Dashboards" card grid (one card per data category, DERIVED from the
// nav groups so it never drifts from the nav), and the funder/partners block.
// Identity + stats come from siteConfig; the page prose is transcribed from the
// approved prototype (bundle.html).
//
// The whole page is a normal scrolling document — index.css switches the shell
// to natural scroll (and sticks the nav) whenever it contains `.home`. The root
// carries `.brand`, so the bridge palette + Roboto apply here.
// =============================================================================

import { Link } from "react-router-dom";
import { siteConfig } from "../../config/siteConfig.js";
import PearlBand from "../../components/PearlBand.jsx";
import Icon from "../../components/Icon.jsx";

// One category card: icon + name + availability badge, then its sub-pages as
// rows. Live rows link and reveal an "Open" cue on hover; soon rows are tagged.
function Catcard({ category }) {
  const anyLive = category.children.some((t) => t.status === "live");
  return (
    <div className="catcard">
      <div className="catcard__head">
        <span className={`catcard__icon catcard__icon--${anyLive ? "live" : "soon"}`}>
          <Icon name={category.icon} size={21} />
        </span>
        <h3 className="catcard__name">{category.label}</h3>
        <span className={`catcard__status catcard__status--${anyLive ? "live" : "soon"}`}>
          {anyLive ? "Available" : "Coming Soon"}
        </span>
      </div>
      <ul className="catcard__topics">
        {category.children.map((topic) => (
          <li key={topic.label}>
            {topic.status === "live" ? (
              <Link to={topic.to} className="subrow subrow--live">
                <span className="subrow__name">{topic.label}</span>
                <span className="subrow__cue">Open <Icon name="arrow-right" size={13} /></span>
              </Link>
            ) : (
              <span className="subrow subrow--soon">
                <span className="subrow__name">{topic.label}</span>
                <span className="subrow__soon">Soon</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const { org, dept, suite, suiteTagline, coverageNote, funder, stats } = siteConfig;
  const categories = siteConfig.nav.filter((item) => item.kind === "group");

  return (
    <div className="readpage brand">
      {/* Hero — the vivid pearl band */}
      <section className="hero">
        <PearlBand variant="hero">
          <div className="wrap">
            <div className="hero__inner">
              <div className="hero__rule" />
              <p className="hero__eyebrow">{org} · {dept}</p>
              <h1 className="hero__title" id="hero-title">
                Data-Driven Research<br />
                For <span className="foil">Albertans</span>
              </h1>
              <p className="hero__sub">
                The single source for neighbourhood-level Property, Development, and
                Economic data across the province&rsquo;s cities.
              </p>
              <div className="hero__cta">
                <a className="btn btn--pearl" href="#collection-title">
                  <span>Explore the Dashboards <Icon name="arrow-right" size={16} /></span>
                </a>
                <Link className="btn btn--ghost" to="/download">Download Datasets</Link>
              </div>
            </div>
          </div>
        </PearlBand>
      </section>

      {/* Stats strip — a centred card that overlaps the hero's bottom edge */}
      <div className="wrap">
        <div className="stats">
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat__value">{s.value}</div>
              <div className="stat__label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* The Urban Alberta Dashboards — one card per data category */}
      <section className="section" aria-labelledby="collection-title">
        <div className="wrap">
          <div className="section__row">
            <div>
              <h2 className="section__title" id="collection-title">The {suite}</h2>
              <p className="section__lead">{suiteTagline}</p>
            </div>
            <span className="section__note">{coverageNote}</span>
          </div>
          <div className="catgrid">
            {categories.map((cat) => <Catcard key={cat.label} category={cat} />)}
          </div>
        </div>
      </section>

      {/* Funder + partners */}
      <section className="section section--soft">
        <div className="wrap">
          <div className="section__head">
            <p className="section__eyebrow">Support</p>
            <h2 className="section__title">Our Funder and Partners</h2>
          </div>
          <div className="grant">
            <div className="grant__text">
              <p className="grant__label">This project is made possible through a grant from</p>
              <p className="grant__name">{funder}</p>
            </div>
            {/* Text stand-in for the funder logo — swap in the real AREF mark when available. */}
            <div className="grant__logo">
              <span className="grant__logo-txt">{funder}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
