// =============================================================================
// ZoningLegendRail.jsx — the column-standardized legend TABLE (pass 18 §3).
//
// A side-docked panel beneath the "Legend" toggle button (they read as one unit:
// the button is the header, this is the body). Four fixed columns — swatch,
// family name, zones, area — the numeric two right-aligned in tabular numerals
// so digits align vertically; no interpunct, the column boundary is the
// separator. Rows are area-descending (the domain's own order). A Total row
// under a foot rule ("Total · 11,518 · 100%") both replaces the loose zone-count
// footer and checks that the shares are complete.
//
// COLOUR TIERS (DESIGN_SYSTEM categorical-legend-table rule, §1.5a): the family
// NAME and the AREA percentage are PRIMARY (--pa-ink) because area is what the
// map encodes — it drives the strip widths and the row order; the zone COUNT is
// secondary (--pa-mut) so it doesn't present a second competing ranking; the
// column headers and the Total row are muted.
//
// Rows are click-to-isolate, sharing the SAME `isolated` state + `onToggleFamily`
// as the bottom strip chips, so isolating from either surface updates both.
// =============================================================================

export default function ZoningLegendRail({ domain, isolated, total, onToggleFamily, separators = true }) {
  const fmtCount = (n) => (n == null ? "—" : separators ? n.toLocaleString() : String(n));
  return (
    <div className="zlr" role="group" aria-label="Zone families — zones and area by family">
      {/* Header rule — Zones + Area only; swatch/name are covered by the panel title. */}
      <div className="zlr-head" aria-hidden="true">
        <span /><span />
        <span className="zlr-num">Zones</span>
        <span className="zlr-num">Area</span>
      </div>
      <ul className="zlr-rows">
        {domain.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              className={`zlr-row${isolated === it.key ? " is-active" : ""}${isolated && isolated !== it.key ? " is-dim" : ""}`}
              aria-pressed={isolated === it.key}
              aria-label={`${it.label}, ${fmtCount(it.count)} zones, ${it.shareDisplay}% of area. ${isolated === it.key ? "Isolated. Press to show all." : "Press to isolate."}`}
              onClick={() => onToggleFamily(it.key)}
            >
              <span className="zlr-swatch" style={{ background: it.colour }} aria-hidden="true" />
              <span className="zlr-name" title={it.label}>{it.label}</span>
              <span className="zlr-num zlr-zones">{fmtCount(it.count)}</span>
              <span className="zlr-num zlr-area">{it.shareDisplay}%</span>
            </button>
          </li>
        ))}
      </ul>
      {/* Total row under a foot rule — the completeness check. */}
      <div className="zlr-total">
        <span /><span className="zlr-name">Total</span>
        <span className="zlr-num zlr-zones">{fmtCount(total)}</span>
        <span className="zlr-num zlr-area">100%</span>
      </div>
    </div>
  );
}
