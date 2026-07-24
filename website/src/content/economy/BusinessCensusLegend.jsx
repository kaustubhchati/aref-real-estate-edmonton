// =============================================================================
// BusinessCensusLegend.jsx — View 1's sidebar INSTRUMENT: an interactive DONUT (the wheel)
// with its readout in the centre HOLE. Reference contract: an interactive donut chart
// (Fluent DonutChart), NOT a pie menu — a persistent wheel in a fixed bay gets none of a
// radial menu's Fitts's-Law benefit, so it is built to the donut behaviours instead.
//
// RINGS (spec §1.1) — two SEPARATE concentric bands: inner = flat sector colour (exactly the
// map point colour), outer = that sector's KDE range (potent inner edge → faint ~10% outer
// edge, one gradient PER SEGMENT). Segment order = the co-occurrence arrangement (do NOT
// reorder). Mixed + Other are not on the wheel.
//
// HIT HALO (the scratchiness fix) — the divider lines sit ON TOP of the arcs in the panel
// colour, and SVG's default `visiblePainted` means a sweep repeatedly lands on a divider and
// hover drops. So each segment has a SEPARATE transparent HIT arc, WIDER than the drawn band
// and BUTTED edge-to-edge with no dividers/gaps, painted (fill rgba 0) so it receives events.
// The visual bands are `pointer-events:none`; the hit arc carries every handler + the a11y
// role. It is also STATIC — the lift/press transform rides the visual bands, so the hit target
// never moves under the cursor.
//
// STATES are SHAPE, not colour alone (a11y): hover → the segment LIFTS (grows outward);
// selected → it DEPRESSES (sits inward); unselected recede to ~45% (readable, not extinguished).
// Teal (§1.3 --accent-teal) supplements the shape, it does not carry the state.
//
// READOUT (centre hole, Fluent) — rest = the total; hover/keyboard-focus = that sector's name +
// count + share; select = the selected sector's. Hover/focus WIN over selection, reverting on
// exit. `pointer-events:none` so the hole is never a dead zone. This REPLACES the external frame.
//
// KEYBOARD — a radiogroup with roving tabindex: one tab stop, arrows move-AND-select (wrapping),
// Space toggles, focus updates the readout. Bidirectional with the console: the shared
// `hoveredSector` lights the matching console row, and a hovered console row lights the segment
// + the centre readout here.
// =============================================================================

import { useRef, useState } from "react";
import { titleCase } from "./titleCase.js";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ---- Wheel geometry (viewBox 200; a big hole so the readout is legible) ------
const C = 100;                    // centre
const RI0 = 60, RI1 = 75;         // inner ring (flat colour)
const RO0 = 80, RO1 = 94;         // outer ring (KDE ramp) — RI1→RO0 gap separates the rings
const HIT_I = 56, HIT_O = 97;     // HIT arc — 4 wider inward, 3 outward than the drawn bands
const SEG = 36;                   // 360 / 10
const RIM_FAINT = 0.1;            // outer-edge opacity floor (boundaries must survive)

const polar = (r, deg) => {
  const a = (deg - 90) * Math.PI / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
};
function band(ri, ro, a0, a1) {
  const [xo0, yo0] = polar(ro, a0), [xo1, yo1] = polar(ro, a1);
  const [xi1, yi1] = polar(ri, a1), [xi0, yi0] = polar(ri, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${xo0} ${yo0} A${ro} ${ro} 0 ${large} 1 ${xo1} ${yo1} `
       + `L${xi1} ${yi1} A${ri} ${ri} 0 ${large} 0 ${xi0} ${yi0} Z`;
}

export default function BusinessCensusLegend({
  aggregates, selectedSector, hoveredSector, onSelectSector, onHoverSector,
}) {
  const segRefs = useRef([]);
  const [focusedKey, setFocusedKey] = useState(null);   // keyboard/mouse focus → drives the readout

  const active = (key) => selectedSector === key;
  const hover = (key) => hoveredSector === key;

  const segments = [...aggregates.sectors]
    .sort((a, b) => a.arrangeIdx - b.arrangeIdx)
    .map((s) => ({ ...s, a0: s.arrangeIdx * SEG }));

  // Roving tabindex: the selected segment is the single tab stop, else the first.
  const ai = segments.findIndex((s) => s.key === selectedSector);
  const activeIdx = ai >= 0 ? ai : 0;

  // Centre readout: HOVER, then keyboard FOCUS, then the selection, else the total.
  const shownKey = hoveredSector ?? focusedKey ?? selectedSector;
  const shownSec = shownKey ? aggregates.sectors.find((s) => s.key === shownKey) : null;

  // Arrow keys move focus AND select (radiogroup contract), wrapping; Space toggles.
  function onKey(e, idx) {
    const n = segments.length;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); onSelectSector(segments[idx].key); return; }
    let ni;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") ni = (idx + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") ni = (idx - 1 + n) % n;
    else return;
    e.preventDefault();
    onSelectSector(segments[ni].key);       // arrow SELECTS
    segRefs.current[ni]?.focus();           // ...and moves focus
  }

  return (
    <div className="bc-legend">
      <span className="pa-col-lab">Sectors</span>
      <div className="bc-wheel-wrap">
        <svg className="bc-wheel" viewBox="0 0 200 200" role="radiogroup" aria-label="Filter businesses by sector">
          <defs>
            {/* PEARL — the SAME duochrome as the slider rims (DESIGN_SYSTEM §6 --accent-duochrome).
                SVG gradient stops can't read a CSS var, so the luminance-flat teal→cyan→gold-green
                sweep is mirrored here (the choroplethStyle.js precedent for CSS-var-in-SVG). It
                paints the ring RIMS (full) + the segment dividers (light, via CSS opacity). */}
            <linearGradient id="bc-pearl" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#35d6c4" />
              <stop offset="0.28" stopColor="#46e0d6" />
              <stop offset="0.5" stopColor="#cdd486" />
              <stop offset="0.72" stopColor="#46e0d6" />
              <stop offset="1" stopColor="#35d6c4" />
            </linearGradient>
            {segments.map((s) => {
              const mid = s.a0 + SEG / 2;
              const [x1, y1] = polar(RO0, mid);   // inner edge midpoint — potent
              const [x2, y2] = polar(RO1, mid);   // outer edge midpoint — faint
              return (
                <linearGradient key={s.key} id={`bcw-${s.arrangeIdx}`} gradientUnits="userSpaceOnUse"
                                x1={x1} y1={y1} x2={x2} y2={y2}>
                  <stop offset="0" stopColor={s.colour} stopOpacity="1" />
                  <stop offset="1" stopColor={s.colour} stopOpacity={RIM_FAINT} />
                </linearGradient>
              );
            })}
          </defs>

          {/* One <g> per segment IS the radio (focusable, roving tabindex). Each holds a STATIC
              transparent HIT arc (wider + butted, receives events → the sweep never drops) BENEATH
              the two VISUAL bands (pointer-events:none, they carry the lift/press/dim + dividers).
              The transform rides the visual bands only, so the hit target never moves. */}
          {segments.map((s, idx) => {
            const cls = `bc-wheel-seg${active(s.key) ? " is-active" : ""}`
              + `${hover(s.key) ? " is-hover" : ""}`
              + `${selectedSector != null && !active(s.key) ? " is-dim" : ""}`;
            return (
              <g key={s.key} className={cls} role="radio" aria-checked={active(s.key)}
                 aria-label={`${titleCase(s.key)}, ${s.count.toLocaleString()} businesses, ${pct(s.share)}`}
                 tabIndex={idx === activeIdx ? 0 : -1}
                 ref={(el) => { segRefs.current[idx] = el; }}
                 onMouseEnter={() => onHoverSector(s.key)}
                 onMouseLeave={() => onHoverSector(null)}
                 onFocus={() => setFocusedKey(s.key)}
                 onBlur={() => setFocusedKey(null)}
                 onClick={() => onSelectSector(s.key)}
                 onKeyDown={(e) => onKey(e, idx)}>
                <path className="bc-wheel-hit" d={band(HIT_I, HIT_O, s.a0, s.a0 + SEG)} fill="rgba(0,0,0,0)" />
                <path className="bc-wheel-vis bc-wheel-inner" d={band(RI0, RI1, s.a0, s.a0 + SEG)} fill={s.colour} />
                <path className="bc-wheel-vis bc-wheel-outer" d={band(RO0, RO1, s.a0, s.a0 + SEG)} fill={`url(#bcw-${s.arrangeIdx})`} />
              </g>
            );
          })}

          {/* PEARL RIMS (Fix 2) — FULL pearl on the dial's outer + inner (hole) edges, so the ring
              reads as ONE physical object. Static + pointer-events:none — purely visual, they never
              touch the hit halo. The lighter divider treatment rides the visual bands (CSS). */}
          <g className="bc-wheel-rims" aria-hidden="true">
            <circle cx={C} cy={C} r={RO1} />
            <circle cx={C} cy={C} r={RI0} />
          </g>
        </svg>

        {/* CENTRE READOUT (in the hole) — never intercepts pointer events (or the hole becomes a
            dead zone). PURELY VISUAL: the count/share travel WITH each radio's accessible name (see
            aria-label above), so this is NOT an aria-live region — a live readout here double-spoke
            on arrow and announced stale content (the revert-to-total) on tab-out. */}
        <div className="bc-wheel-centre">
          {shownSec ? (
            <>
              <div className="bc-centre-name">{titleCase(shownSec.key)}</div>
              <div className="bc-centre-meta">{shownSec.count.toLocaleString()} · {pct(shownSec.share)}</div>
            </>
          ) : (
            <>
              <div className="bc-centre-total">{aggregates.total.toLocaleString()}</div>
              <div className="bc-centre-meta">businesses</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
