// =============================================================================
// IndustryClustersConsole.jsx — View 2's BOTTOM data console (PA pattern: `.dt` shell,
// full-width, rises from the bottom). This is the section's CONTROL + READOUT surface
// for the LCLQ finding, matching PA (whose console is the data surface): the left column
// is the static method box; ALL interaction + numbers live here.
//
//   • HEADER (always visible, even when the body is collapsed — the chips must always be
//     reachable): the ranked TRADE CHIPS. Each chip = share-significant headline · trade
//     name · "up to N×". Selecting lights that trade on the map in its palette hue (up to
//     CLUSTER_MAX_SELECT; ranked by share significant — "which trades cluster," spec §2.1).
//   • BODY (collapsible via the handle): the READOUT — for EACH selected trade (all of
//     them, per the PA multi-select idiom: the console reports the whole selection, never
//     one focused member): share significant, PEAK + TYPICAL multiplier, and the
//     significant-area neighbourhood breakdown. Empty selection → a one-line hint.
//
// No p-value, no threshold slider — significance is the binary FDR gate the method box
// states (spec §2.4 amendment 2026-07-24). The multiplier carries its own reference point.
// =============================================================================

import { titleCase } from "./titleCase.js";
import { tradeDetail, lclqMultiplierPhrase } from "./industryClustersData.js";
import { paletteSig, CLUSTER_MAX_SELECT } from "./industryClustersStyle.js";

const TOP_CHIPS = 15;   // the ranked trades offered as chips (the tail is a long thin drop-off)

export default function IndustryClustersConsole({
  trades, selectedTrades, onToggleTrade, onClear, lclqRows, open, onToggle,
}) {
  const atCap = selectedTrades.length >= CLUSTER_MAX_SELECT;

  return (
    <section className="dt bc-icn" aria-label="Industry clusters console">
      {/* HEADER ROW — handle (toggles the readout body) + the always-visible chip strip. */}
      <div className="bc-icn-headrow">
        <button type="button" className="dt-handle bc-icn-handle" onClick={onToggle} aria-expanded={open}>
          <span className="dt-handle-title">Trades That Cluster</span>
          {selectedTrades.length > 0 && (
            <span className="dt-handle-meta">{selectedTrades.length} lit</span>
          )}
          <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
        </button>

        <div className="bc-chip-strip" role="group" aria-label="Trades ranked by share that cluster">
          {!trades ? (
            <span className="bc-icn-hint">Loading the finding…</span>
          ) : (
            trades.slice(0, TOP_CHIPS).map((t) => {
              const sel = selectedTrades.indexOf(t.group);
              const isSel = sel >= 0;
              const disabled = !isSel && atCap;
              // A selected chip carries its map hue as a left border + tint, so the chip and the
              // lit dots read as the same trade (the shared palette is the only cross-reference).
              const hue = isSel ? paletteSig(sel) : null;
              return (
                <button
                  key={t.group}
                  type="button"
                  className={`bc-chip${isSel ? " is-selected" : ""}`}
                  aria-pressed={isSel}
                  disabled={disabled}
                  onClick={() => onToggleTrade(t.group)}
                  style={hue ? { borderColor: hue, boxShadow: `inset 3px 0 0 0 ${hue}` } : undefined}
                  title={disabled ? `Up to ${CLUSTER_MAX_SELECT} at once — deselect one first` : titleCase(t.group)}
                >
                  <span className="bc-chip-share">{Math.round(t.share * 100)}%</span>
                  <span className="bc-chip-name">{titleCase(t.group)}</span>
                  <span className="bc-chip-mult">{lclqMultiplierPhrase(t.maxLclq)}</span>
                </button>
              );
            })
          )}
        </div>

        {selectedTrades.length > 0 && (
          <button type="button" className="bc-icn-clear" onClick={onClear}>Clear</button>
        )}
      </div>

      {/* READOUT BODY — collapsible. Per selected trade, all-selected (the PA multi-select idiom). */}
      <div className={`dt-panel-wrap${open ? " is-open" : ""}`}>
        <div className="dt-panel bc-icn-panel">
          {selectedTrades.length === 0 || !lclqRows ? (
            <p className="bc-icn-hint">
              Pick a trade above to light its statistically significant clusters on the map and read
              its cluster strength here.
            </p>
          ) : (
            <div className="bc-icn-readout">
              {selectedTrades.map((g, i) => {
                const d = tradeDetail(lclqRows, g);
                if (!d) return null;
                const hue = paletteSig(i);
                return (
                  <div key={g} className="bc-icn-card">
                    <div className="bc-icn-card-head">
                      <span className="bc-icn-sw" style={{ background: hue }} aria-hidden="true" />
                      <span className="bc-icn-card-name">{titleCase(g)}</span>
                    </div>
                    {/* SCORES — share significant (the finding), then strength as peak + typical. */}
                    <dl className="bc-icn-scores">
                      <div><dt>In a cluster</dt>
                        <dd><strong>{Math.round(d.share * 100)}%</strong> · {d.sig.toLocaleString()} of {d.n.toLocaleString()}</dd></div>
                      <div><dt>Peak strength</dt>
                        <dd>{lclqMultiplierPhrase(d.maxLclq)}</dd></div>
                      <div><dt>Typical</dt>
                        <dd>{lclqMultiplierPhrase(d.medianLclq)}</dd></div>
                    </dl>
                    <p className="bc-icn-scale">
                      the city average of their own trade nearby
                    </p>
                    {d.topNeighbourhoods.length > 0 && (
                      <p className="bc-icn-nbhd">
                        <span className="bc-icn-nbhd-lab">Where</span>{" "}
                        {d.topNeighbourhoods.map((nb) => titleCase(nb.name)).join(" · ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
