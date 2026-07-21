// =============================================================================
// FeatureDemo.jsx
//
// One home-section "feature demo" tile: a few REAL dashboard stills, animated
// between with Ken Burns (slow zoom), cross-fades, and motion overlays (a cursor,
// a drag marquee, a click ripple, a rising chip) that narrate how a control works.
// It is NOT a live map — just optimized screenshots + CSS motion.
//
// Contract with index.css (the ".fdemo" block owns all the motion):
//   • Each still is a `.fdemo-slide` (opacity envelope) wrapping a `.fdemo-still`
//     <img> (the Ken Burns zoom) plus its overlays. All three share ONE phase
//     clock: the slide carries `--fdemo-delay`, children inherit it, so the whole
//     slide (image + overlays) is locked to the same moment of the loop.
//   • The slides are phase-shifted by negative `--fdemo-delay` so exactly one is
//     on screen at a time and the cross-fades (including the loop wrap) are seam-
//     less. The delay math lives in `slideDelay()` below, commented there.
//   • Motion is transform + opacity ONLY (GPU-composited); `will-change` is set in
//     CSS. Nothing here animates layout (width/height/top/left are static).
//
// Playback + accessibility:
//   • An IntersectionObserver adds `.is-playing` only while the tile is on screen
//     (off-screen tiles cost nothing), and `loading="lazy"` defers the images.
//   • `prefers-reduced-motion: reduce` is honoured in index.css: all motion is
//     dropped and the one representative still (`data-key`) is left showing. The
//     text label carries the meaning, so the feature reads with motion off.
// =============================================================================

import { assetUrl } from "../utils/assetUrl.js";
import { useInView } from "./useInView.js";

// --- phase clock -------------------------------------------------------------
// Give slide i a NEGATIVE animation-delay so, on one shared infinite timeline,
// the slides are evenly staggered and play in order 0,1,2,… with a seamless wrap.
// (Derivation: window = cycle/n; delay_i = -((n - i) mod n) * window.)
function slideDelay(i, n, cycle) {
  const window = cycle / n;
  return -(((n - i) % n) * window);
}

// --- one overlay element (declarative; index.css animates it) ----------------
// `o.at` is a static {left,top,width,height} placement in % (never animated —
// only transform/opacity move). Extra fields become CSS custom properties.
function Overlay({ o }) {
  const style = { ...(o.at || {}) };
  const cls = `fdemo-ov fdemo-ov--${o.kind}`;
  if (o.kind === "cursor") {
    return (
      <span className={cls} style={style} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26">
          <path
            d="M5 3l14 8-6 1.6L10 20 5 3z"
            fill="#fff"
            stroke="#14171a"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (o.kind === "chip") {
    return (
      <span className={cls} style={style} aria-hidden="true">
        {o.text}
      </span>
    );
  }
  // marquee / pulse — pure CSS shapes
  return <span className={cls} style={style} aria-hidden="true" />;
}

// --- the tile ----------------------------------------------------------------
export default function FeatureDemo({
  label,
  blurb,
  steps = [],
  stills = [],
  cycle = 9, // seconds for a full loop; ~cycle/n on screen per still
  kb = [1.015, 1.05, 1.075], // Ken Burns scale [start, mid, end]; tile 3 pushes harder
  keyStill, // index of the representative still (reduced-motion frame); default middle
  featured = false,
}) {
  const [ref, inView] = useInView(0.35);
  const n = stills.length;
  // The representative frame (shown at rest + under reduced motion): the middle
  // moment reads best (e.g. "area selected + table"), falling back for n < 2.
  const keyIndex = keyStill != null ? keyStill : Math.min(1, Math.max(0, n - 1));

  return (
    <figure
      ref={ref}
      className={`fdemo fdemo--n${n} ${featured ? "fdemo--featured" : ""} ${inView ? "is-playing" : ""}`}
      style={{ "--fdemo-cycle": `${cycle}s`, "--kb-a": kb[0], "--kb-b": kb[1], "--kb-c": kb[2] }}
      aria-label={label}
    >
      <div className="fdemo-frame">
        {stills.map((s, i) => (
          <div
            key={i}
            className="fdemo-slide"
            data-key={i === keyIndex ? "true" : undefined}
            style={{ "--fdemo-delay": `${slideDelay(i, n, cycle)}s` }}
          >
            <img
              className="fdemo-still"
              src={assetUrl(s.src)}
              alt={s.alt}
              loading="lazy"
              decoding="async"
              draggable="false"
              style={{ transformOrigin: s.origin || "50% 50%" }}
            />
            {(s.overlays || []).map((o, k) => (
              <Overlay key={k} o={o} />
            ))}
          </div>
        ))}
      </div>

      <figcaption className="fdemo-cap">
        <span className="fdemo-cap__label">{label}</span>
        {blurb && <span className="fdemo-cap__blurb">{blurb}</span>}
        {steps.length > 0 && (
          <ol className="fdemo-steps" aria-label="Steps in this flow">
            {steps.map((t, i) => (
              <li key={i} className="fdemo-step">
                <span className="fdemo-step__n">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
        )}
      </figcaption>
    </figure>
  );
}
