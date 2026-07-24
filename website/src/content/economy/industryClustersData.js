// =============================================================================
// industryClustersData.js
//
// View 2 (Industry Clusters) DATA seam — the LCLQ finding, derived from the
// committed estimator output `bc_lclq_industry_group.csv` (Part 5 artifact 2).
// This file does NOT compute the estimator (that lives in the R eda/ line, spec
// Part 5); it only READS and shapes the committed result for the interface.
//
// Statistical facts of the shipped CSV (measured — see the CC report):
//   • join key: `objectid`. 28,381 tested businesses; the other ~1,513 points are
//     in industry groups with < min_group_n (30) → NOT in the CSV. Those are
//     UNTESTED, not "not clustered" — a distinction the interface must keep.
//   • `significant` = exactly `p_across ≤ 0.05` (the BH-FDR q-value); 4,226 (14.9%
//     of tested) are significant.
//   • The LCLQ multiplier (`lclq`) spans 3.7×–242× among significant businesses and
//     is the honest STRENGTH axis (the p-value cannot grade strength on this data —
//     see the CC report: FDR q has nothing < 0.05, raw p is all ≤ 0.01).
//
// Language rules the interface must obey (spec §2.4) live where the strings are
// built: never a p-value, never "LCLQ", the multiplier carries its own reference
// point, and one counterfactual sentence sits near the legend.
// =============================================================================

// Rank trades (industry groups) by SHARE SIGNIFICANT (spec §2.1) — "which trades
// cluster," not "which are biggest." A count ranking would put Lessors of real
// estate on top by volume; share is the finding. (NB: measured, share ALSO puts
// Lessors on top at 52% — whether to curate it out is a KC call; this function
// stays data-driven and returns every tested group with ≥1 significant member.)
//   row shape in: { objectid, industry_group, sectors, significant, lclq, ... }
//   returns: [{ group, sector, n, sig, share, maxLclq }] sorted by share desc.
export function rankTradesByShareSignificant(rows) {
  const byGroup = new Map();
  for (const r of rows) {
    const g = r.industry_group;
    if (!g) continue;
    if (!byGroup.has(g)) byGroup.set(g, { group: g, sector: r.sectors, n: 0, sig: 0, maxLclq: 0 });
    const e = byGroup.get(g);
    e.n += 1;
    if (r.significant === "TRUE") {
      e.sig += 1;
      const v = Number(r.lclq);
      if (Number.isFinite(v) && v > e.maxLclq) e.maxLclq = v;
    }
  }
  return [...byGroup.values()]
    .filter((e) => e.sig > 0)
    .map((e) => ({ ...e, share: e.sig / e.n }))
    .sort((a, b) => b.share - a.share);
}

// The LCLQ value as a plain-English multiplier that CONTAINS its own reference
// point (spec §2.4) — never the term "LCLQ", never a p-value. Rounds sensibly:
// small values keep one decimal, larger ones read as whole multiples.
//   1.8  → "up to 1.8×"      25.06 → "up to 25×"      242.4 → "up to 242×"
export function lclqMultiplierPhrase(lclq) {
  const v = Number(lclq);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const n = v < 10 ? v.toFixed(1) : String(Math.round(v));
  return `up to ${n}×`;
}
