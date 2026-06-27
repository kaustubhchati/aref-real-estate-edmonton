// =============================================================================
// EdgeReveal.jsx
//
// Wraps a piece of site chrome (the Nav, or the Footer) so it auto-hides and
// reveals on edge proximity — used only on the immersive Property Assessment map
// route (see Layout.jsx). The wrapped chrome slides off-screen by default and
// comes back on:
//   • pointer  — hovering the thin edge hot-zone (or the revealed panel)  [CSS]
//   • keyboard — focusing anything inside it (:focus-within)             [CSS]
//   • touch    — tapping the always-visible grip handle                  [this]
//
// The grip is a real <button aria-expanded> so the chrome is reachable without a
// pointer and never leaves the a11y tree (the panel is moved with transform, not
// display:none). All the show/hide visuals live in index.css (.edge-reveal*);
// this component only owns the explicit tap toggle.
//
// Props:
//   side     — "top" (Nav, under the header) | "bottom" (Footer)
//   label    — what the grip reveals, for the aria-label ("site navigation")
//   children — the chrome to wrap (<Nav/> or <Footer/>)
// =============================================================================

import { useState } from "react";

export default function EdgeReveal({ side, label, children }) {
  // `pinned` is the explicit tap/click reveal (the touch affordance). Pointer
  // hover and keyboard focus reveal purely via CSS and don't touch this state.
  const [pinned, setPinned] = useState(false);

  return (
    <div className={`edge-reveal edge-reveal--${side}${pinned ? " is-pinned" : ""}`}>
      <button
        type="button"
        className="edge-reveal-tab"
        aria-expanded={pinned}
        aria-label={`${pinned ? "Hide" : "Show"} ${label}`}
        onClick={() => setPinned((p) => !p)}
      >
        <span className="edge-reveal-grip" aria-hidden="true" />
      </button>
      <div className="edge-reveal-panel">{children}</div>
    </div>
  );
}
