// =============================================================================
// ZoningLegendStrip.jsx — the PROPORTIONAL legend strip (pass 12 §2): the
// legend panel is gone; this bottom-docked object on the map carries the
// palette AND two encodings at once.
//
//   • UPPER band (thicker) — ten chips, widths proportional to AREA SHARE,
//     ordered area-descending. The primary encoding.
//   • LOWER band (thin, quieter) — same order, same colours, widths
//     proportional to COUNT SHARE. Behind SHOW_COUNT_BAND (default on).
//     The divergence between the bands is the point: Agricultural is 32.6%
//     of area from 151 zones; Residential is 30.6% from 5,255.
//   • LABEL row — family names beneath chips wide enough to hold them,
//     measured, never shrunk/truncated (hide-not-drift, the building-number
//     principle); a quiet trailing hint covers the unlabelled tail. On hover/
//     isolate/selection the row is REPLACED by a readout stating the true
//     numbers (name · area share · zone count · count share) — the number
//     corrects the pixel wherever the minimum chip width distorts.
//
// INTERACTION: the hit layer is a row of transparent BUTTONS spanning the
// strip's FULL height (visual chips are 18px; hits are the whole ~50px band —
// narrow chips stay usable), with the same proportional widths as the area
// band. Hover/focus emphasise the family in both bands + preview it on the
// map (onHoverFamily); click/Enter/Space toggles isolate (onToggleFamily);
// chips are focusable in area order, aria-pressed carries the isolate state.
// A minimum visual width keeps the smallest chips from becoming hairlines
// (MIN_AREA_PX / MIN_COUNT_PX); the readout states true shares.
//
// `emphasis` — a family key to emphasise from OUTSIDE the strip (§4: a pinned
// zone's family takes the hover treatment, so rail and legend point at each
// other). Precedence: chip hover > emphasis (pinned) > isolated > rest.
// =============================================================================

import { useLayoutEffect, useRef, useState } from "react";
import { SHOW_COUNT_BAND } from "./zoningStyle.js";

const MIN_AREA_PX = 10;   // area-band chip floor — nothing renders as a hairline
const MIN_COUNT_PX = 4;   // count-band floor (visual only — hits ride the area row)

// One proportional row of cells: flex-grow carries the share, min-width the
// floor. Used four times (area band, count band, hit layer, label row) so all
// rows divide the strip identically.
const cellStyle = (share, minPx) => ({
  flex: `${Math.max(share, 0.0001)} 1 0px`, minWidth: minPx, minHeight: 0,
});

export default function ZoningLegendStrip({
  domain, totalCount, isolated, emphasis, onToggleFamily, onHoverFamily,
}) {
  const [chipHover, setChipHover] = useState(null);

  // The emphasised family and which reading the readout states.
  const focus = chipHover ?? emphasis ?? isolated;
  const mode = chipHover ? "hover" : emphasis ? "selected" : isolated ? "isolated" : "rest";
  const focusItem = focus ? domain.find((d) => d.key === focus) : null;

  // Label fitting — measured, not guessed: a name renders only when its cell
  // holds it whole (hide-not-drift). Re-measured on any strip resize.
  const labelRowRef = useRef(null);
  const [fits, setFits] = useState({});
  useLayoutEffect(() => {
    const row = labelRowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const next = {};
      for (const cell of row.querySelectorAll("[data-family]")) {
        const span = cell.firstChild;
        next[cell.dataset.family] = span ? span.scrollWidth <= cell.clientWidth - 2 : false;
      }
      setFits(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [domain]);

  const countShare = (it) => (totalCount ? (it.count / totalCount) * 100 : 0);
  const dimmed = (key) => (focus != null && key !== focus);

  function hoverStart(key) { setChipHover(key); onHoverFamily?.(key); }
  function hoverEnd() { setChipHover(null); onHoverFamily?.(null); }

  return (
    <div className="zls" role="group" aria-label="Zone families — share of city area and zone count">
      {/* AREA band (primary) + COUNT band (flagged) — passive visuals; the
          hit layer above carries every interaction. */}
      <div className="zls-band zls-area" aria-hidden="true">
        {domain.map((it) => (
          <div key={it.key} className={`zls-chip${dimmed(it.key) ? " is-dim" : ""}`}
               style={{ ...cellStyle(it.share, MIN_AREA_PX), background: it.colour }} />
        ))}
      </div>
      {SHOW_COUNT_BAND && (
        <div className="zls-band zls-count" aria-hidden="true">
          {domain.map((it) => (
            <div key={it.key} className={`zls-chip${dimmed(it.key) ? " is-dim" : ""}`}
                 style={{ ...cellStyle(countShare(it), MIN_COUNT_PX), background: it.colour }} />
          ))}
        </div>
      )}

      {/* LABEL row ⇄ READOUT — same slot, one height (grid-stack). */}
      <div className="zls-foot">
        <div ref={labelRowRef} className="zls-labels"
             style={{ visibility: mode === "rest" ? "visible" : "hidden" }} aria-hidden={mode !== "rest"}>
          {domain.map((it) => (
            <div key={it.key} className="zls-labelcell" data-family={it.key}
                 style={cellStyle(it.share, MIN_AREA_PX)}>
              <span style={{ visibility: fits[it.key] ? "visible" : "hidden" }}>{it.label}</span>
            </div>
          ))}
          <span className="zls-hint">hover a segment for its family</span>
        </div>
        {mode !== "rest" && focusItem && (
          <p className="zls-readout" aria-live="polite">
            <b>{focusItem.label}</b>
            {" — "}{focusItem.shareDisplay}% of area · {focusItem.count?.toLocaleString()} zones
            {SHOW_COUNT_BAND && ` · ${countShare(focusItem).toFixed(1)}% of count`}
            {mode === "isolated" && " · isolated — click again to show all"}
            {mode === "selected" && " · the selected zone's family"}
          </p>
        )}
      </div>

      {/* HIT layer — transparent buttons over the whole strip height, same
          proportional division as the area band. Keyboard: focus emphasises
          (hover parity), Enter/Space toggles isolate (native button). */}
      <div className="zls-hits">
        {domain.map((it) => (
          <button
            key={it.key} type="button"
            style={cellStyle(it.share, MIN_AREA_PX)}
            aria-pressed={isolated === it.key}
            aria-label={`${it.label} — ${it.shareDisplay}% of city area, ${it.count?.toLocaleString()} zones (${countShare(it).toFixed(1)}% of count). ${isolated === it.key ? "Isolated — press to show all." : "Press to isolate."}`}
            onMouseEnter={() => hoverStart(it.key)}
            onMouseLeave={hoverEnd}
            onFocus={() => hoverStart(it.key)}
            onBlur={hoverEnd}
            onClick={() => onToggleFamily(it.key)}
          />
        ))}
      </div>
    </div>
  );
}
