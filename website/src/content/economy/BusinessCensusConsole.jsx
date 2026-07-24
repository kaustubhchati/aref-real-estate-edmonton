// =============================================================================
// BusinessCensusConsole.jsx — the BOTTOM data console (PA pattern: `.pa-foot` + `.dt`
// chrome, "Data Console · Press T" pull-up handle, grid-rows 0fr↔1fr, default closed).
// Content flows LEFT→RIGHT and WRAPS; names are FULL (a long NAICS name wraps, never ellipses).
//
//   • REST — the ten sectors as cells: swatch · name · BAR (sector hue, proportional across
//     sectors) · count · share. Clicking a sector SELECTS it (one state → mute + drill).
//   • DRILL — a sector's industry groups: name · BAR (parent-sector hue, proportional WITHIN
//     the sector) · count · share, ending with the REMAINDER (neutral-grey bar). The remainder
//     bar is the finding: for Manufacturing (82 groups) it dominates; for Accommodation (6
//     groups) it is a stub. Header = ‹ All Sectors · swatch · name · N businesses · M groups.
//
// It DRILLS (the wheel/console SELECT a sector; the reset is the breadcrumb — PA puts clears in
// the console, not the sidebar). One selection state drives wheel + console + map.
// =============================================================================

import { titleCase } from "./titleCase.js";
import { drillRows } from "./businessCensusAggregates.js";
import { NEUTRAL_GREY } from "./oklch.js";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// A magnitude bar: length = frac of the row-group max; min 2% so a tiny value is still visible.
function Bar({ frac, colour }) {
  return (
    <span className="bc-cn-bar">
      <span className="bc-cn-bar-fill" style={{ width: `${Math.max(2, frac * 100)}%`, background: colour }} />
    </span>
  );
}

export default function BusinessCensusConsole({
  aggregates, selectedSector, selectedGroup, hoveredSector, open,
  onToggle, onSelectSector, onBack, onSelectGroup, onHoverSector,
}) {
  const { sectors, otherSectors } = aggregates;
  const drilled = selectedSector ? sectors.find((s) => s.key === selectedSector) : null;
  const drill = drilled ? drillRows(drilled, 8) : null;
  const maxSector = Math.max(...sectors.map((s) => s.count), otherSectors ? otherSectors.count : 0);

  return (
    <section className="dt bc-cn" aria-label="Composition data console">
      <button type="button" className="dt-handle" onClick={onToggle} aria-expanded={open}>
        <span className="dt-handle-title">Data Console</span>
        {open && drilled
          ? <span className="dt-handle-meta">{titleCase(drilled.key)}</span>
          : !open && <span className="dt-handle-meta">Press T</span>}
        <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      <div className={`dt-panel-wrap${open ? " is-open" : ""}`}>
        <div className="dt-panel bc-cn-panel">
          {!drilled ? (
            <>
              <div className="bc-cn-head"><span className="dt-scope">Composition · By Sector</span></div>
              <div className="bc-cn-grid">
                {[...sectors].sort((a, b) => b.count - a.count).map((s) => (
                  <button key={s.key} type="button"
                          className={`bc-cn-cell${hoveredSector === s.key ? " is-hover" : ""}`}
                          onClick={() => onSelectSector(s.key)}
                          onMouseEnter={() => onHoverSector?.(s.key)}
                          onMouseLeave={() => onHoverSector?.(null)}
                          title={`Drill into ${titleCase(s.key)}`}>
                    <span className="bc-cn-cellhead">
                      <span className="bc-cn-sw" style={{ background: s.colour }} aria-hidden="true" />
                      <span className="bc-cn-name">{titleCase(s.key)}</span>
                    </span>
                    <span className="bc-cn-barrow">
                      <Bar frac={s.count / maxSector} colour={s.colour} />
                      <span className="bc-cn-meta">{s.count.toLocaleString()} · {pct(s.share)} ›</span>
                    </span>
                  </button>
                ))}
                {otherSectors && (
                  <div className="bc-cn-cell is-static" title="A collapse of the ten smaller sectors">
                    <span className="bc-cn-cellhead">
                      <span className="bc-cn-sw" style={{ background: otherSectors.colour }} aria-hidden="true" />
                      <span className="bc-cn-name">Other Sectors</span>
                    </span>
                    <span className="bc-cn-barrow">
                      <Bar frac={otherSectors.count / maxSector} colour={NEUTRAL_GREY} />
                      <span className="bc-cn-meta">{otherSectors.count.toLocaleString()} · {pct(otherSectors.share)}</span>
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bc-cn-head">
                <button type="button" className="bc-cn-crumb" onClick={onBack}>‹ All Sectors</button>
                <span className="bc-cn-sw bc-cn-headsw" style={{ background: drilled.colour }} aria-hidden="true" />
                <span className="dt-scope">{titleCase(drilled.key)}</span>
                <span className="bc-cn-sub">{drilled.count.toLocaleString()} businesses · {drilled.igGroups.length} industry groups</span>
              </div>
              <div className="bc-cn-grid">
                {drill.rows.map((g) => (
                  <button key={g.group} type="button"
                          className={`bc-cn-cell bc-cn-group${selectedGroup === g.group ? " is-active" : ""}`}
                          onClick={() => onSelectGroup(g.group)} title={titleCase(g.group)}>
                    <span className="bc-cn-name">{titleCase(g.group)}</span>
                    <span className="bc-cn-barrow">
                      <Bar frac={g.count / drill.maxRow} colour={drilled.colour} />
                      <span className="bc-cn-meta">{g.count.toLocaleString()} · {pct(g.share)}</span>
                    </span>
                  </button>
                ))}
                {drill.remainder && (
                  <div className="bc-cn-cell is-static bc-cn-remainder"
                       title={`${drill.remainder.nGroups} smaller groups, not shown individually`}>
                    <span className="bc-cn-name">+{drill.remainder.nGroups} more groups</span>
                    <span className="bc-cn-barrow">
                      <Bar frac={drill.remainder.count / drill.maxRow} colour={NEUTRAL_GREY} />
                      <span className="bc-cn-meta">{drill.remainder.count.toLocaleString()} · {pct(drill.remainder.share)}</span>
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
