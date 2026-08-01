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

// Break the family name after "and" so it WRAPS instead of truncating (§1). The
// wrapped form is DERIVED at render — the crosswalk label stays the single source
// of truth; storing a second wrapped label would drift on the next amendment.
//   "Industrial and Employment" → ["Industrial and", "Employment"]
//   "Alternative Jurisdiction"  → ["Alternative Jurisdiction"] (no "and" → wraps
//                                  naturally in CSS)
// The break is after the FIRST " and " (the set has one each); the remainder,
// however long, is the second line.
function familyNameLines(label) {
  const parts = label.split(/ and (.+)/);   // [before, after, ""] when " and " is present
  if (parts.length >= 2 && parts[1]) return [`${parts[0]} and`, parts[1]];
  return [label];
}

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
        {domain.map((it) => {
          const nameLines = familyNameLines(it.label);
          return (
            <li key={it.key}>
              <button
                type="button"
                className={`zlr-row${isolated === it.key ? " is-active" : ""}${isolated && isolated !== it.key ? " is-dim" : ""}`}
                aria-pressed={isolated === it.key}
                aria-label={`${it.label}, ${fmtCount(it.count)} zones, ${it.shareDisplay}% of area. ${isolated === it.key ? "Isolated. Press to show all." : "Press to isolate."}`}
                onClick={() => onToggleFamily(it.key)}
              >
                <span className="zlr-swatch" style={{ background: it.colour }} aria-hidden="true" />
                {/* Name WRAPS, never truncates (§1): a hard break after "and", else
                    natural word wrap. Derived from the crosswalk label at render. */}
                <span className="zlr-name">
                  {nameLines.length === 2 ? <>{nameLines[0]}<br />{nameLines[1]}</> : nameLines[0]}
                </span>
                <span className="zlr-num zlr-zones">{fmtCount(it.count)}</span>
                <span className="zlr-num zlr-area">{it.shareDisplay}%</span>
              </button>
            </li>
          );
        })}
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
