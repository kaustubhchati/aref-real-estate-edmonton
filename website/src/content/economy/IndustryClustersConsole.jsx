// =============================================================================
// IndustryClustersConsole.jsx — View 2's bottom Data Console. A pure SELECTOR (trade chips) →
// a readout that adapts to the selection COUNT:
//   • 0 selected  → empty state (browse).
//   • 1 selected  → the full PROSE-FIRST readout (The Finding · Cluster Strength · Where It
//                   Clusters) — one finding, full detail.
//   • 2–5 selected→ COMPARISON CARDS, one per trade in its map hue (name · hero multiplier ·
//                   share · top neighbourhood + count). Clicking a card FOCUSES that trade →
//                   the full readout for it (with a "‹ Compare all" back), so comparison →
//                   detail without losing either. (§2 directive, 2026-07-24.)
// The chips (inline pills) SELECT; the cards COMPARE — two systems, two jobs, never merged.
//
// TEXT HIERARCHY (§1 / DESIGN_SYSTEM §1.5a): console CONTENT is --pa-ink; only section
// labels/eyebrows/captions/gate-secondary stay --pa-mut/--pa-dim. "Where It Clusters" values
// are significant-business COUNTS (labelled as such, §3) — never the multiplier (that is
// Cluster Strength). No p-value — significance is the binary FDR gate.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import { titleCase } from "./titleCase.js";
import { tradeDetail, lclqMultiplierPhrase } from "./industryClustersData.js";
import { paletteSig, CLUSTER_MAX_SELECT } from "./industryClustersStyle.js";

const TOP_CHIPS = 15;   // the ranked trades offered as chips (the tail is a long thin drop-off)

// A BARE multiplier for the readout prose + metric values ("103×"). The CHIPS keep "up to N×".
function times(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return (n < 10 ? n.toFixed(1) : String(Math.round(n))) + "×";
}

// The full prose-first readout for ONE trade (single-select, or a focused card in multi-select).
function FullReadout({ detail, hue, onBack }) {
  const maxN = detail.topNeighbourhoods.length ? detail.topNeighbourhoods[0].n || 1 : 1;
  return (
    <div className="bc-icn-readout" style={{ "--hue": hue }}>
      {onBack && (
        // autoFocus so a keyboard user who activated a card lands on the back control (not dropped to
        // <body> when ComparisonCards → FullReadout swaps); mouse users are unaffected (:focus-visible only).
        <button type="button" className="bc-icn-back" onClick={onBack} autoFocus>‹ Compare all industries</button>
      )}
      {/* THE FINDING — the prose headline (the seller) */}
      <div className="bc-icn-finding">
        <div className="bc-icn-eyebrow"><span className="bc-icn-eyeswatch" aria-hidden="true" />The Finding</div>
        <p className="bc-icn-headline">
          {titleCase(detail.group)} cluster{" "}
          <span className="bc-icn-big">{times(detail.maxLclq)} more tightly</span>{" "}
          than the Edmonton average.
        </p>
        <p className="bc-icn-sub">
          {Math.round(detail.share * 100)}% of this industry sits in a statistically real cluster
          {detail.topNeighbourhoods.length > 0 && (
            <>, concentrated in {titleCase(detail.topNeighbourhoods[0].name)}</>
          )}.
        </p>
      </div>
      {/* CLUSTER STRENGTH — the multiplier axis + the binary FDR gate */}
      <div className="bc-icn-support">
        <div className="bc-icn-grplab">Cluster Strength</div>
        <div className="bc-icn-mrow"><span className="bc-icn-ml">Peak colocation</span><span className="bc-icn-mv">{times(detail.maxLclq)}</span></div>
        <div className="bc-icn-mrow"><span className="bc-icn-ml">Median (significant)</span><span className="bc-icn-mv">{times(detail.medianLclq)}</span></div>
        <div className="bc-icn-mrow"><span className="bc-icn-ml">Share significant</span><span className="bc-icn-mv">{Math.round(detail.share * 100)}%</span></div>
        <div className="bc-icn-gate">
          <span className="bc-icn-gate-dot" aria-hidden="true" />
          <span className="bc-icn-gate-t">Significant · <span className="bc-icn-gate-m">FDR q&lt;0.05, 999 perms, BH</span></span>
        </div>
      </div>
      {/* WHERE IT CLUSTERS — significant-business COUNT per neighbourhood (§3: labelled a count, so a
          small bar reads as "fewer businesses", never "less significant" — every one is significant). */}
      <div className="bc-icn-areas">
        <div className="bc-icn-grplab">Where It Clusters</div>
        <div className="bc-icn-unit">significant businesses per neighbourhood</div>
        {detail.topNeighbourhoods.map((nb) => (
          <div key={nb.name} className="bc-icn-arow">
            <span className="bc-icn-an">{titleCase(nb.name)}</span>
            <span className="bc-icn-abar"><span className="bc-icn-afill" style={{ width: `${Math.round((nb.n / maxN) * 100)}%` }} /></span>
            <span className="bc-icn-av">{nb.n.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// COMPARISON CARDS — one per selected trade, in its map hue. The finding compressed to a hero
// multiplier + share + top area/count. Clicking a card focuses that trade (→ FullReadout).
function ComparisonCards({ selectedTrades, lclqRows, onFocusTrade }) {
  return (
    <div className="bc-cmp-cards" role="group" aria-label="Selected industries — click a card for its full finding">
      {selectedTrades.map((g, i) => {
        const d = tradeDetail(lclqRows, g);
        if (!d) return null;
        const hue = paletteSig(i);
        const top = d.topNeighbourhoods[0];
        return (
          <button
            key={g}
            type="button"
            className="bc-cmp-card"
            style={{ "--hue": hue }}
            onClick={() => onFocusTrade(g)}
            title={`Focus ${titleCase(g)} — open its full finding`}
          >
            <span className="bc-cmp-name">{titleCase(g)}</span>
            <span className="bc-cmp-hero">{times(d.maxLclq)}</span>
            <span className="bc-cmp-metric"><strong>{Math.round(d.share * 100)}%</strong> significant</span>
            {top && (
              <span className="bc-cmp-metric bc-cmp-area">
                {titleCase(top.name)} · <strong>{top.n.toLocaleString()}</strong> businesses
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function IndustryClustersConsole({
  trades, selectedTrades, onToggleTrade, onClear, lclqRows, focusedTrade, onFocusTrade, onClearFocus,
}) {
  const atCap = selectedTrades.length >= CLUSTER_MAX_SELECT;
  const stripRef = useRef(null);
  const [fade, setFade] = useState({ left: false, right: false });

  // §2 (shipped) — the overflow affordance is HONEST + directional: cue on the right when more is
  // to the right, on the left once scrolled, both mid-scroll, NOTHING when all chips fit.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    function update() {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 1) { setFade({ left: false, right: false }); return; }
      setFade({ left: el.scrollLeft > 1, right: el.scrollLeft < overflow - 1 });
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [trades, selectedTrades.length]);

  const single = selectedTrades.length === 1;
  const multi = selectedTrades.length >= 2;
  // A focused card (multi-select) that is still selected → its full readout; else the cards.
  const validFocus = multi && focusedTrade && selectedTrades.includes(focusedTrade) ? focusedTrade : null;
  const fullTrade = single ? selectedTrades[0] : validFocus;   // the ONE trade that gets the full readout
  const detail = fullTrade && lclqRows ? tradeDetail(lclqRows, fullTrade) : null;
  const detailHue = fullTrade ? paletteSig(selectedTrades.indexOf(fullTrade)) : null;

  const capText = selectedTrades.length
    ? `${selectedTrades.length} selected · pick up to ${CLUSTER_MAX_SELECT}`
    : `ranked by share significant · pick up to ${CLUSTER_MAX_SELECT}`;

  return (
    <section className="bc-icn" aria-label="Industry specialisations console">
      {/* HEAD — section label (left) · caption + Clear (right). §4: Clear lives HERE, a stable spot
          away from the scrolling strip's clipped right edge (a mis-scroll can't hit it). NO ⚙ gear
          (the app's icon family is Lucide, not emoji). */}
      <div className="bc-icn-head">
        <span className="bc-icn-ttl">Industries That Cluster</span>
        <div className="bc-icn-head-right">
          <span className="bc-icn-cap">{capText}</span>
          {selectedTrades.length > 0 && (
            <button type="button" className="bc-icn-clear" onClick={onClear}>Clear all</button>
          )}
        </div>
      </div>

      {/* SELECTOR — the ranked chips (inline pills) + the §2 overflow affordance */}
      <div className="bc-icn-selector">
        <div className={`bc-strip-wrap${fade.left ? " is-fade-l" : ""}${fade.right ? " is-fade-r" : ""}`}>
          <div className="bc-chip-strip" ref={stripRef} role="group" aria-label="Industries ranked by share that cluster">
            {!trades ? (
              <span className="bc-icn-hint">Loading the finding…</span>
            ) : (
              trades.slice(0, TOP_CHIPS).map((t) => {
                const sel = selectedTrades.indexOf(t.group);
                const isSel = sel >= 0;
                const disabled = !isSel && atCap;
                const chue = isSel ? paletteSig(sel) : null;
                return (
                  <button
                    key={t.group}
                    type="button"
                    className={`bc-chip${isSel ? " is-selected" : ""}`}
                    aria-pressed={isSel}
                    disabled={disabled}
                    onClick={() => onToggleTrade(t.group)}
                    style={chue ? { borderColor: chue, boxShadow: `inset 0 0 0 1px ${chue}` } : undefined}
                    title={isSel
                      ? `${titleCase(t.group)} — selected; click to remove`
                      : (disabled ? `Up to ${CLUSTER_MAX_SELECT} at once — deselect one first` : titleCase(t.group))}
                  >
                    <span className="bc-chip-share" style={chue ? { color: chue } : undefined}>{Math.round(t.share * 100)}%</span>
                    <span className="bc-chip-name">{titleCase(t.group)}</span>
                    <span className="bc-chip-mult">{lclqMultiplierPhrase(t.maxLclq)}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* READOUT — empty (browse) / full readout (single OR a focused card) / comparison cards (multi) */}
      {selectedTrades.length === 0 || !lclqRows ? (
        <div className="bc-icn-empty">
          Select an industry.
        </div>
      ) : detail ? (
        <FullReadout detail={detail} hue={detailHue} onBack={validFocus ? onClearFocus : null} />
      ) : (
        <ComparisonCards selectedTrades={selectedTrades} lclqRows={lclqRows} onFocusTrade={onFocusTrade} />
      )}
    </section>
  );
}
