// =============================================================================
// EdgeReveal.jsx
//
// Wraps a piece of site chrome (the Nav) so it auto-hides on the immersive
// full-bleed map routes and reveals on demand — used for every immersive map
// (Property Assessment, Dwelling Units, Business Counts) via Layout.jsx, so the
// behaviour is identical across all of them.
//
// Reveal / persist (all edge-proximity is measured off a zero-height marker, so
// NOTHING overlays the map to catch the hover — the map keeps every click/drag):
//   • reveal  — the pointer coming within REVEAL_PX of this edge, ACROSS THE FULL
//               WIDTH (not a narrow corner). Move toward the top → the nav drops in.
//   • persist — once open, it stays open while the pointer is anywhere over the
//               header→nav region (+ KEEP_PX of hysteresis) OR over an open section
//               dropdown. So you can slide along the whole bar and into its menus,
//               not thread a narrow strip. Computed in JS (not CSS :hover, which
//               was unreliable: the panel is pointer-events:none until it opens).
//   • keyboard — focusing anything inside it (CSS :focus-within).
//   • touch    — tapping the always-visible grip pins it open (toggle).
//
// The chrome moves with transform (never display:none), so it stays in the a11y
// tree + tab order. All show/hide visuals live in index.css (.edge-reveal*).
//
// Props: side ("top"|"bottom") · label (grip aria) · children (the chrome).
// =============================================================================

import { useEffect, useRef, useState } from "react";

// Proximity (px) beyond the edge that REVEALS the hidden chrome.
const REVEAL_PX = 44;
// Extra margin (px) past the revealed chrome that KEEPS it open (hysteresis), so
// small overshoots toward the map don't snap it shut mid-interaction.
const KEEP_PX = 56;

export default function EdgeReveal({ side, label, children }) {
  const ref = useRef(null);
  const panelRef = useRef(null);
  const [near, setNear] = useState(false);    // pointer in the reveal / keep zone
  const [pinned, setPinned] = useState(false); // explicit grip tap (touch/click)
  const open = near || pinned;
  // Mirror `open` into a ref so the window pointer listener reads the current
  // state without re-subscribing on every toggle (synced in an effect, not during
  // render, per the refs lint rule).
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    function onMove(e) {
      const marker = ref.current;
      const panel = panelRef.current;
      if (!marker || !panel) return;
      const edgeY = marker.getBoundingClientRect().top; // the edge (header bottom / viewport bottom)
      const navH = panel.offsetHeight;                  // layout height (unaffected by the transform)
      const { clientX: x, clientY: y } = e;
      let active;
      if (openRef.current) {
        // KEEP OPEN generously: the whole header→nav band + hysteresis, full width.
        active = side === "top" ? y <= edgeY + navH + KEEP_PX : y >= edgeY - navH - KEEP_PX;
        // ...or over an OPEN section dropdown (it overflows the nav's own box).
        if (!active) {
          for (const dd of panel.querySelectorAll(".nav__item.is-open .nav__menu")) {
            const r = dd.getBoundingClientRect();
            if (r.height > 1 && x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) {
              active = true;
              break;
            }
          }
        }
      } else {
        // REVEAL: near the edge, across the full width.
        active = side === "top" ? y <= edgeY + REVEAL_PX : y >= edgeY - REVEAL_PX;
      }
      setNear(active); // setState bails when unchanged, so this stays cheap
    }
    function onLeave() { setNear(false); }
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [side]);

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
      <div ref={panelRef} className="edge-reveal-panel">{children}</div>
    </div>
  );
}
