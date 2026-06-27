// =============================================================================
// EdgeReveal.jsx
//
// Wraps a piece of site chrome (the Nav, or the Footer) so it auto-hides and
// reveals on edge proximity — used only on the immersive Property Assessment map
// route (see Layout.jsx). The wrapped chrome slides off-screen by default and
// comes back on:
//   • pointer  — the cursor coming within REVEAL_PX of this edge (measured here,
//                so NOTHING overlays the map to catch the hover — the map's own
//                controls and edge panning stay fully usable)
//   • dwell    — keeping the cursor on the revealed panel (CSS :hover)
//   • keyboard — focusing anything inside it (CSS :focus-within)
//   • touch    — tapping the always-visible grip handle
//
// The chrome is moved with transform (never display:none), so it stays in the
// a11y tree and tab order. The grip is a real <button aria-expanded> so the
// chrome is reachable without a pointer. All the show/hide visuals live in
// index.css (.edge-reveal*); this component owns the proximity + tap state and
// toggles the .is-open class.
//
// Props:
//   side     — "top" (Nav, under the header) | "bottom" (Footer)
//   label    — what the grip reveals, for the aria-label ("site navigation")
//   children — the chrome to wrap (<Nav/> or <Footer/>)
// =============================================================================

import { useEffect, useRef, useState } from "react";

// How close (px) the pointer must come to this edge to reveal the chrome.
const REVEAL_PX = 28;

export default function EdgeReveal({ side, label, children }) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);    // pointer near this edge
  const [pinned, setPinned] = useState(false); // explicit tap/click reveal (touch)

  // Reveal on edge proximity WITHOUT an overlay: a window pointer listener checks
  // the cursor's distance to this edge (the zero-height marker's screen position),
  // so the map underneath keeps all of its clicks, drags, and corner controls.
  useEffect(() => {
    function onMove(e) {
      const el = ref.current;
      if (!el) return;
      const edgeY = el.getBoundingClientRect().top; // the marker sits on the edge
      const close =
        side === "top"
          ? e.clientY <= edgeY + REVEAL_PX
          : e.clientY >= edgeY - REVEAL_PX;
      setNear(close); // setState bails when unchanged, so this is cheap on move
    }
    function onLeave() { setNear(false); }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [side]);

  const open = near || pinned;

  return (
    <div ref={ref} className={`edge-reveal edge-reveal--${side}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="edge-reveal-tab"
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${label}`}
        onClick={() => setPinned((p) => !p)}
      >
        <span className="edge-reveal-grip" aria-hidden="true" />
      </button>
      <div className="edge-reveal-panel">{children}</div>
    </div>
  );
}
