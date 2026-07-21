// =============================================================================
// SliderDemo.jsx  (home feature-demo — tile 2)
//
// A SPLIT feature-demo tile: the year slider on the LEFT and the neighbourhood
// map on the RIGHT, cross-fading between two years (2012 ↔ 2026) IN SYNC — so the
// viewer sees the slider CAUSE the map recolour. A token knob glides along the
// left track, synced with the recolour, for a crisp "slide" rather than a jump.
//
// Same contract as <FeatureDemo>: one uniform `.fdemo` frame + caption; motion is
// transform/opacity only (CSS owns it — the `.fdemo-split` / `sld-*` block); an
// IntersectionObserver plays it only in view; reduced-motion leaves the END (2026)
// state; stills self-hosted through assetUrl. See index.css for the animation.
//
// Props:
//   map:   [srcA(2012), srcB(2026)]  — the choropleth at each year
//   years: [labelA, labelB]          — the readout / tick labels (default 2012/2026)
// =============================================================================

import { useInView } from "./useInView.js";
import { assetUrl } from "../utils/assetUrl.js";

export default function SliderDemo({ label, blurb, cycle = 7.5, map, years = ["2012", "2026"], alt }) {
  const [ref, inView] = useInView(0.35);

  return (
    <figure
      ref={ref}
      className={`fdemo ${inView ? "is-playing" : ""}`}
      style={{ "--fdemo-cycle": `${cycle}s` }}
      aria-label={label}
    >
      <div className="fdemo-frame">
        <div className="fdemo-split">
          {/* LEFT — a SYNTHETIC year slider (design tokens) that glides 2012→2026 */}
          <div className="fdemo-split__panel fdemo-split__panel--left">
            <div className="synslider" aria-hidden="true">
              <div className="synslider__head">
                <span className="synslider__label">YEAR</span>
                <span className="synslider__val">
                  <span className="synslider__val-a">{years[0]}</span>
                  <span className="synslider__val-b">{years[1]}</span>
                </span>
              </div>
              <div className="synslider__track">
                <span className="synslider__fill" />
                <span className="synslider__knob" />
              </div>
              <div className="synslider__ticks">
                <span>{years[0]}</span>
                <span>{years[1]}</span>
              </div>
            </div>
          </div>
          {/* RIGHT — the map, recolouring in sync (cross-fade) */}
          <div className="fdemo-split__panel fdemo-split__panel--right">
            <img className="sld-img sld-img--map sld-a" src={assetUrl(map[0])} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false" />
            <img className="sld-img sld-img--map sld-b" src={assetUrl(map[1])} alt={alt} loading="lazy" decoding="async" draggable="false" />
          </div>
        </div>
      </div>

      <figcaption className="fdemo-cap">
        <span className="fdemo-cap__label">{label}</span>
        {blurb && <span className="fdemo-cap__blurb">{blurb}</span>}
      </figcaption>
    </figure>
  );
}
