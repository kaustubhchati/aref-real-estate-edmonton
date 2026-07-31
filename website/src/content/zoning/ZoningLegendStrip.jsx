// =============================================================================
// ZoningLegendStrip.jsx — the PROPORTIONAL legend strip (pass 12 §2; pass 13 §2
// removed the count band). The legend panel is gone; this bottom-docked object
// on the map carries the palette AND the area encoding.
//
//   • THE BAND — ten chips, width = MIN_CHIP_PX + (area share × remaining), so
//     every chip clears its own printed percentage. This is PROPORTIONAL ABOVE
//     A FLOOR, not strictly proportional (pass 17 §1): strict proportionality
//     can't hold Mixed Use at 0.8% (a few pixels), so each chip reserves a text
//     floor and the remaining width is distributed by share. The distortion is
//     acceptable ONLY because the true value is printed inside every chip — the
//     number corrects the pixel. If the number were ever removed, the floor
//     goes with it. The share ink is derived per fill's lightness (§3, the
//     DESIGN_SYSTEM in-fill label rule): dark on the pale families, light on the
//     saturated rest.
//   • LABEL row — family names beneath chips wide enough to hold them, MEASURED
//     (hide-not-drift, never shrunk); the readout replaces them on hover/isolate/
//     selection with the true numbers (name · area share · zone count).
//
// INTERACTION: the hit layer is a row of transparent BUTTONS spanning the
// strip's FULL height (narrow chips stay usable — the hit is the whole band),
// with the same proportional widths as the visual band. Hover/focus emphasise
// the family + preview it on the map (onHoverFamily); click/Enter/Space toggles
// isolate (onToggleFamily); chips are focusable in area order, aria-pressed
// carries the isolate state. A minimum visual width (MIN_AREA_PX) keeps the
// smallest chips off a hairline; the readout states the true share.
//
// `emphasis` — a family key to emphasise from OUTSIDE the strip (§4: a pinned
// zone's family takes the hover treatment, so rail and legend point at each
// other). Precedence: chip hover > emphasis (pinned) > isolated > rest.
// =============================================================================

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The chip TEXT FLOOR (pass 17 §1): the widest percentage string ("32.6%")
// renders 35.4 px at the chip's 11 px/600/tabular-nums; + 7 px left pad + a
// ~6 px right breath = 48. Reserved as each chip's flex-basis; the remaining
// strip width is distributed by area share. width = 48 + (share × remaining).
const MIN_CHIP_PX = 48;

// One cell: flex-basis = the text floor (reserved for all ten), flex-grow =
// the area share (distributes the remainder). Used by the band, the hit layer
// AND the label row so all three divide the strip identically.
const cellStyle = (share) => ({
  flex: `${Math.max(share, 0.0001)} 1 ${MIN_CHIP_PX}px`, minHeight: 0,
});

// In-fill label ink — the DESIGN_SYSTEM in-fill label rule (§1.4 categorical
// polygon fill law): ONE measured threshold (WCAG relative luminance 0.42),
// EXACTLY two tokens — dark-on-light #2a2621, light-on-dark #faf6ec — applied
// uniformly, no third case, no per-family override. Every zoning fill clears it
// with margin (nearest is Industrial/DC/Civic at L≈0.304, 0.116 below → light).
function inkForFill(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.42 ? "#2a2621" : "#faf6ec";
}

export default function ZoningLegendStrip({
  domain, isolated, emphasis, pinned, onToggleFamily, onHoverFamily,
}) {
  const [chipHover, setChipHover] = useState(null);
  // The MAP preview is DEBOUNCED (see hoverStart): a fast sweep across chips
  // fires one onMouseEnter per chip crossed, and each map preview is a full
  // 11,518-feature fill-colour re-evaluation — a burst of them backs up the
  // render loop into a visible cascade of snaps that lag the cursor and keep
  // playing after a click. The strip EMPHASIS stays instant; only the costly
  // map paint waits for the cursor to settle.
  const previewTimer = useRef(null);
  const clearPreviewTimer = () => {
    if (previewTimer.current) { clearTimeout(previewTimer.current); previewTimer.current = null; }
  };
  useEffect(() => clearPreviewTimer, []);   // cancel a pending preview on unmount

  // The emphasised family and which reading the readout states.
  const focus = chipHover ?? emphasis ?? isolated;
  const mode = chipHover ? "hover" : emphasis ? "selected" : isolated ? "isolated" : "rest";
  const focusItem = focus ? domain.find((d) => d.key === focus) : null;

  // Fit measurement — only the family NAMES need it now (the chip floor §1
  // guarantees every percentage fits its chip, so the in-chip % always shows).
  // A name renders only when its cell holds it whole (hide-not-drift); measured
  // on any strip resize.
  const labelRowRef = useRef(null);
  const [labelFits, setLabelFits] = useState({});
  useLayoutEffect(() => {
    const row = labelRowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const next = {};
      for (const cell of row.querySelectorAll("[data-family]")) {
        const span = cell.querySelector("span");
        next[cell.dataset.family] = span ? span.scrollWidth <= cell.clientWidth - 2 : false;
      }
      setLabelFits(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [domain]);

  const dimmed = (key) => (focus != null && key !== focus);

  // While a zone is PINNED the selection owns the view (pass 15 audit): hover is
  // INERT, so the strip keeps showing the selected family (no contradictory
  // strip-vs-map double-highlight, no dead map-preview promise). A CLICK still
  // acts — the parent clears the pin and isolates the clicked family.
  // The strip emphasis is INSTANT; the map preview is debounced to the cursor's
  // REST (PREVIEW_DELAY), so a fast sweep collapses to one paint, not a cascade.
  const PREVIEW_DELAY = 80;
  function hoverStart(key) {
    if (pinned) return;
    setChipHover(key);                 // emphasis: immediate (cheap DOM)
    clearPreviewTimer();
    previewTimer.current = setTimeout(() => onHoverFamily?.(key), PREVIEW_DELAY);   // map: on settle
  }
  function hoverEnd() {
    setChipHover(null);
    clearPreviewTimer();
    onHoverFamily?.(null);             // clear the preview immediately on strip-leave
  }
  // A click is a committed choice — cancel any pending preview so it can't fire
  // AFTER the isolate/select and repaint a stale preview over it.
  function handleClick(key) { clearPreviewTimer(); onToggleFamily(key); }

  return (
    <div className="zls" role="group" aria-label="Zone families by share of city area">
      {/* THE BAND — area-share chips with the share printed inside where it
          fits. Passive visual; the hit layer below carries every interaction.
          The focused chip takes the ABSOLUTE two-tone emphasis (is-emph, §2);
          the rest dim (secondary). */}
      <div className="zls-band zls-area" aria-hidden="true">
        {domain.map((it) => (
          <div key={it.key}
               className={`zls-chip${it.key === focus ? " is-emph" : dimmed(it.key) ? " is-dim" : ""}`}
               data-family={it.key} style={{ ...cellStyle(it.share), background: it.colour }}>
            <span className="zls-pct" style={{ color: inkForFill(it.colour) }}>{it.shareDisplay}%</span>
          </div>
        ))}
      </div>

      {/* LABEL row ⇄ READOUT — same slot, one height (grid-stack). */}
      <div className="zls-foot">
        {/* opacity, NOT visibility: the fit-measured spans carry their own
            visibility:visible, which would override a hidden ancestor. */}
        <div ref={labelRowRef} className="zls-labels"
             style={{ opacity: mode === "rest" ? 1 : 0 }} aria-hidden={mode !== "rest"}>
          {domain.map((it) => (
            <div key={it.key} className="zls-labelcell" data-family={it.key} style={cellStyle(it.share)}>
              <span style={{ visibility: labelFits[it.key] ? "visible" : "hidden" }}>{it.label}</span>
            </div>
          ))}
        </div>
        {mode !== "rest" && focusItem && (
          // Readout sentence (§1) — no em dash, no interpunct, one sentence.
          // KC ruling (pass 14): SENTENCE CASE, and the city is NAMED:
          // "Residential class: 30.6% of Edmonton, 5,255 zones".
          <p className="zls-readout" aria-live="polite">
            <b>{focusItem.label}</b> class: {focusItem.shareDisplay}% of Edmonton,{" "}
            {focusItem.count?.toLocaleString()} zones
            {mode === "isolated" && ". Isolated; click again to show all"}
            {mode === "selected" && ". The selected zone's family"}
          </p>
        )}
      </div>

      {/* HIT layer — transparent buttons over the whole strip height, same
          proportional division as the band. Keyboard: focus emphasises (hover
          parity), Enter/Space toggles isolate (native button).
          The mouse-leave CLEAR lives on the CONTAINER, not the buttons (pass 15
          audit): the band keeps its 2px visual gaps, but clearing per-button
          would fire in the handler-less seams between buttons and flash the map
          back to the full palette on a slow scan. Container-leave clears only
          when the cursor leaves the whole strip; scanning chip→chip just
          overwrites the hovered family, no intermediate reset. */}
      <div className="zls-hits" onMouseLeave={hoverEnd}>
        {domain.map((it) => (
          <button
            key={it.key} type="button"
            style={cellStyle(it.share)}
            aria-pressed={isolated === it.key}
            aria-label={`${it.label} class: ${it.shareDisplay}% of Edmonton, ${it.count?.toLocaleString()} zones. ${isolated === it.key ? "Isolated. Press to show all." : "Press to isolate."}`}
            onMouseEnter={() => hoverStart(it.key)}
            onFocus={() => hoverStart(it.key)}
            onBlur={hoverEnd}
            onClick={() => handleClick(it.key)}
          />
        ))}
      </div>
    </div>
  );
}
