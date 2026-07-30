// =============================================================================
// ZoningLegendStrip.jsx — the PROPORTIONAL legend strip (pass 12 §2; pass 13 §2
// removed the count band). The legend panel is gone; this bottom-docked object
// on the map carries the palette AND the area encoding.
//
//   • THE BAND — ten chips, widths proportional to AREA SHARE, ordered
//     area-descending. Each wide-enough chip prints its share INSIDE itself,
//     battery-indicator style; the ink is derived per chip from the fill's
//     lightness (dark on the pale Band-A families, light on the saturated
//     rest — a single fixed colour fails at one end). Narrow chips print no
//     number (measured, never shrunk — hide-not-drift, the building-number
//     principle); the hover readout supplies it.
//   • LABEL row — family names beneath chips wide enough to hold them, same
//     measured fit; a quiet trailing hint covers the unlabelled tail. On
//     hover/isolate/selection it is REPLACED by a readout stating the true
//     numbers (name · area share · zone count).
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

const MIN_AREA_PX = 10;   // chip floor — nothing renders as a hairline

// One proportional cell: flex-grow carries the share, min-width the floor.
// Used by the band, the hit layer and the label row so all three divide
// the strip identically.
const cellStyle = (share) => ({
  flex: `${Math.max(share, 0.0001)} 1 0px`, minWidth: MIN_AREA_PX, minHeight: 0,
});

// Per-chip ink from fill lightness (§2): dark on the pale families, light on
// the saturated rest — the map's own polarity inks (#2a2621 / #faf6ec). WCAG
// relative luminance, threshold 0.42 cleanly splits sage/gold (dark) from the
// rest (light). Derived, never a single hardcoded colour that fails at one end.
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

  // Fit measurement — the in-chip percentage AND the family name each render
  // only when their cell holds them whole (hide-not-drift). Both re-measured
  // on any strip resize.
  const bandRef = useRef(null);
  const labelRowRef = useRef(null);
  const [pctFits, setPctFits] = useState({});
  const [labelFits, setLabelFits] = useState({});
  useLayoutEffect(() => {
    const measureRow = (row, setter, slack) => {
      if (!row) return;
      const next = {};
      for (const cell of row.querySelectorAll("[data-family]")) {
        const span = cell.querySelector("span");
        next[cell.dataset.family] = span ? span.scrollWidth <= cell.clientWidth - slack : false;
      }
      setter(next);
    };
    const measure = () => {
      measureRow(bandRef.current, setPctFits, 12);   // chip padding 7L + a right breath
      measureRow(labelRowRef.current, setLabelFits, 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (bandRef.current) ro.observe(bandRef.current);
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
      <div ref={bandRef} className="zls-band zls-area" aria-hidden="true">
        {domain.map((it) => (
          <div key={it.key}
               className={`zls-chip${it.key === focus ? " is-emph" : dimmed(it.key) ? " is-dim" : ""}`}
               data-family={it.key} style={{ ...cellStyle(it.share), background: it.colour }}>
            <span className="zls-pct"
                  style={{ color: inkForFill(it.colour), visibility: pctFits[it.key] ? "visible" : "hidden" }}>
              {it.shareDisplay}%
            </span>
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
          <span className="zls-hint">hover a segment to read its family</span>
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
