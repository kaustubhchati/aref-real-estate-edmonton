// =============================================================================
// IndustryClustersConsole.jsx — View 2's bottom Data Console. A pure SELECTOR (industry chips) →
// a readout that adapts to the selection COUNT:
//   • 0 selected  → empty state (browse).
//   • 1 selected  → the full readout: THE FINDING (prose) + WHERE IT CLUSTERS paired side by
//                   side, CLUSTER STRENGTH (the statistical evidence) below.
//   • 2–5 selected→ COMPARISON CARDS, one per industry in its map hue (name · hero multiplier ·
//                   share · top neighbourhood + count). Clicking a card FOCUSES that industry →
//                   the full readout for it (with a "‹ Compare all" back), so comparison →
//                   detail without losing either. (§2 directive, 2026-07-24.)
// The chips (inline pills) SELECT; the cards COMPARE — two systems, two jobs, never merged.
//
// ── LCLQ REPORTING CONVENTION (single-select readout; directive 2026-07-24) — the DERIVATION ──
// Verified against the citation sources + our estimator before the labels were written:
//   • BASELINE = "EXPECTED", never "average". The LCLQ denominator is the industry's citywide
//     share, N_A/(N−1) (Wang et al. 2017 Eq. 1: it "estimates the expected proportion by
//     chance"; the CLQ is the economist's location quotient generalised to points — Leslie &
//     Kronenfeld 2011). Headline: "…than expected from their citywide share"; the baseline is
//     stated ONCE below the tiles, not repeated per value.
//   • SIGNIFICANCE is CATEGORICAL — a passed test at a threshold, the way Wang et al. report it
//     ("significant at the 0.001 level"), never a per-point p (ours is floor-piled and cannot
//     grade strength — the p-value is REJECTED). The green gate names test + correction +
//     threshold: conditional/Monte Carlo permutation (999 sims) · Benjamini–Hochberg FDR · q<0.05.
//   • COUNT COMPANION is mandatory — the LQ literature warns a high quotient in a small base is
//     not a large cluster, so the multiplier never appears without its absolute N ("N of M").
//   • LABELS use "LCLQ" (the header card directly above teaches "Local Colocation Quotient");
//     full notation (LCLQ_i, A→A, the permutation machinery) belongs in Methodology's formula.
//   • PRECISION (uniform): 1 decimal below 10× ("9.0×"), whole numbers above ("103×") — the
//     headline and the tiles always agree (times()).
//
// TEXT HIERARCHY (§1 / DESIGN_SYSTEM §1.5a): console CONTENT is --pa-ink; section labels /
// eyebrows / captions / gate-secondary stay --pa-mut. The stat tiles use PA's own .dt-tile
// classes (label 13px/600 muted Title Case · value 19px/500 white tabular · muted foot) — the
// PA-conformance idiom, one console language across sections. "Where It Clusters" values are
// significant-business COUNTS (labelled as counts, §3) — never the multiplier.
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

// Neighbourhood names arrive ALL-CAPS from the BC CSV, and titleCase's acronym guard (load-bearing
// for NAICS "RV"/"C.E.G.E.P.s") passes all-caps strings through verbatim — so "STRATHCONA" was
// rendering as shouting amid Title Case prose (PA-conformance sweep catch, 2026-07-24). Lowercase
// first, then Title Case. (The MAP's neighbourhood labels stay uppercase — that is the deliberate
// cartographic register; this is the console's prose/table register. Known cosmetic limit:
// "MCKERNAN" → "Mckernan", the standard lowercase-then-titlecase artefact.)
const areaName = (s) => titleCase(String(s).toLowerCase());

// The full readout for ONE industry (single-select, or a focused card in multi-select), reported to
// LQ/CLQ convention (directive 2026-07-24; derivation in the component header). Layout: THE FINDING
// (prose) and WHERE IT CLUSTERS (the geographic finding) sit PAIRED side by side — the "reading" —
// with CLUSTER STRENGTH (the statistical evidence) below them.
function FullReadout({ detail, hue, onBack }) {
  const maxN = detail.topNeighbourhoods.length ? detail.topNeighbourhoods[0].n || 1 : 1;
  return (
    <div className={`bc-icn-readout${onBack ? " has-back" : ""}`} style={{ "--hue": hue }}>
      {onBack && (
        // autoFocus so a keyboard user who activated a card lands on the back control (not dropped to
        // <body> when ComparisonCards → FullReadout swaps); mouse users are unaffected (:focus-visible only).
        <button type="button" className="bc-icn-back" onClick={onBack} autoFocus>‹ Compare all industries</button>
      )}
      {/* THE FINDING — the prose headline. Baseline = the EXPECTED-value counterfactual (the LCLQ
          denominator is the industry's citywide share, N_A/(N−1)) — never "the average" (Wang et al.
          2017 Eq. 1: the denominator "estimates the expected proportion by chance"). "UP TO" is
          load-bearing: the number is the MAXIMUM — one business's local quotient, not the industry's
          (Funeral Services: 234× is one business of 32) — so the headline hedges exactly as the chips
          do; the count-companion tile + "strongest significant business" foot carry the rest.
          VERB (KC ruling 2026-07-24, "precision across all"): "concentrate … more strongly" — the
          LCLQ is own-industry ENRICHMENT among nearest neighbours, not spatial tightness, so the
          mockup's "cluster … more tightly" was retired; the verb now mirrors the KC-locked header
          descriptor ("How strongly … concentrates among its nearest businesses"). */}
      <div className="bc-icn-finding">
        <div className="bc-icn-eyebrow"><span className="bc-icn-eyeswatch" aria-hidden="true" />The Finding</div>
        <p className="bc-icn-headline">
          {titleCase(detail.group)} concentrate{" "}
          <span className="bc-icn-big">up to {times(detail.maxLclq)} more strongly</span>{" "}
          than expected from their citywide share.
        </p>
        <p className="bc-icn-sub">
          {Math.round(detail.share * 100)}% of this industry sits in a statistically significant cluster
          {detail.topNeighbourhoods.length > 0 && (
            <>, concentrated in {areaName(detail.topNeighbourhoods[0].name)}</>
          )}.
        </p>
      </div>
      {/* WHERE IT CLUSTERS — the geographic finding, PAIRED with the prose. Significant-business
          COUNT per neighbourhood, labelled a count: a small bar means FEWER businesses, never "less
          significant" — every listed business passed the same gate. */}
      <div className="bc-icn-areas">
        <div className="bc-icn-grplab">Where It Clusters</div>
        <div className="bc-icn-unit">significant businesses per neighbourhood · count</div>
        {detail.topNeighbourhoods.map((nb) => (
          <div key={nb.name} className="bc-icn-arow">
            <span className="bc-icn-an">{areaName(nb.name)}</span>
            <span className="bc-icn-abar"><span className="bc-icn-afill" style={{ width: `${Math.round((nb.n / maxN) * 100)}%` }} /></span>
            <span className="bc-icn-av">{nb.n.toLocaleString()}</span>
          </div>
        ))}
      </div>
      {/* THE STATISTICAL EVIDENCE — below the paired finding, in PA's KPI-RAIL idiom: an UNLABELLED
          row of self-labelling .dt-tile tiles (PA's rail carries no group label — conformance; the
          "Cluster Strength" wording lives in the baseline note). The COUNT COMPANION tile is the
          literature's honesty requirement: a high quotient in a small base is not a large cluster,
          so the multiplier is never shown without its absolute N. Significance = the CATEGORICAL
          gate (named test + correction + threshold) — the per-point p-value is rejected
          (floor-piled; it cannot grade strength). The gate + the once-stated baseline sit INLINE in
          the same row (the vertical budget: the evidence must stay above the fold, PA's rail-never-
          scrolls rule; the AREAS list is the internal scroll zone instead). */}
      <div className="bc-icn-support">
        <div className="bc-icn-stats">
          <div className="dt-tile">
            <div className="dt-tile-l">Maximum LCLQ</div>
            <div className="dt-tile-v">{times(detail.maxLclq)}</div>
            <div className="dt-tile-ft"><span className="dt-tile-foot">strongest significant business</span></div>
          </div>
          <div className="dt-tile">
            <div className="dt-tile-l">Median LCLQ</div>
            <div className="dt-tile-v">{times(detail.medianLclq)}</div>
            <div className="dt-tile-ft"><span className="dt-tile-foot">among significant businesses</span></div>
          </div>
          <div className="dt-tile">
            <div className="dt-tile-l">Businesses in Cluster</div>
            <div className="dt-tile-v">{detail.sig.toLocaleString()} of {detail.n.toLocaleString()}</div>
            <div className="dt-tile-ft"><span className="dt-tile-foot">{Math.round(detail.share * 100)}% significant</span></div>
          </div>
          <div className="bc-icn-gateblock">
            <div className="bc-icn-gate">
              <span className="bc-icn-gate-dot" aria-hidden="true" />
              <span className="bc-icn-gate-t">Significant · <span className="bc-icn-gate-m">FDR q&lt;0.05, 999 perms, BH</span></span>
            </div>
            <p className="bc-icn-baseline">
              Cluster strength is the LCLQ: observed ÷ expected, where expected is the
              industry’s share of all Edmonton businesses.
            </p>
          </div>
        </div>
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
            <span className="bc-cmp-hero"><span className="bc-cmp-upto">up to</span> {times(d.maxLclq)}</span>
            <span className="bc-cmp-metric"><strong>{Math.round(d.share * 100)}%</strong> significant</span>
            {top && (
              <span className="bc-cmp-metric bc-cmp-area">
                {areaName(top.name)} · <strong>{top.n.toLocaleString()}</strong> businesses
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
    <section className="bc-icn" aria-label="Industry specializations console">
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
