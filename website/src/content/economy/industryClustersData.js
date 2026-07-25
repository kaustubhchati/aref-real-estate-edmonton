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

// The multiplier as a full clause that carries its own counterfactual (spec §2.4):
// "up to 25× more of their own trade nearby than the city average". Used in the panel.
export function clusterStrengthPhrase(lclq) {
  const p = lclqMultiplierPhrase(lclq);
  if (p === "—") return "clustered";
  return `${p} more of their own trade nearby than the city average`;
}

// ── View-2 map join (spec §5 artifact 2 → the point map) ─────────────────────
// The two artifacts stay SEPARATE (points GeoJSON + this CSV); we join them in the
// browser by `objectid`, never in the backend (recon §4). Three steps:

// 1. objectid → { state, lclq } for the 28,381 TESTED businesses. A business ABSENT
//    here is UNTESTED (its group is < min_group_n = 30 citywide), a distinct state
//    that must never render or read as "not significant".
export function buildSignificanceIndex(rows) {
  const idx = new Map();
  for (const r of rows) {
    const id = Number(r.objectid);
    if (!Number.isFinite(id)) continue;
    idx.set(id, { state: r.significant === "TRUE" ? "sig" : "nonsig", lclq: Number(r.lclq) });
  }
  return idx;
}

// 2. The View-2 POINT SOURCE: ONLY tested businesses, each tagged with `lclq_state`
//    ("sig" | "nonsig") + its multiplier. Untested businesses are OMITTED, so the map
//    can never draw one — the untested ≠ non-significant rule, enforced by construction.
export function buildClusterFeatures(features, sigIndex) {
  const out = [];
  for (const f of features) {
    const id = Number(f.properties?.objectid);
    const s = sigIndex.get(id);
    if (!s) continue;   // untested → not in the cluster source
    out.push({
      type: "Feature",
      geometry: f.geometry,
      properties: {
        objectid: id,
        industry_group: f.properties.industry_group,
        industry_group_code: f.properties.industry_group_code,
        sectors: f.properties.sectors,
        neighbourhood_name: f.properties.neighbourhood_name,
        lclq_state: s.state,
        lclq: Number.isFinite(s.lclq) ? s.lclq : null,
      },
    });
  }
  return { type: "FeatureCollection", features: out };
}

// 3. Per-trade detail for the console readout (spec §2.4) — count significant, share, the
//    PEAK and MEDIAN multiplier (peak = the strongest single cluster; median = the typical
//    significant business, so one 242× outlier can't misread the whole trade), and the
//    significant-area neighbourhood breakdown. All from the committed CSV.
export function tradeDetail(rows, group) {
  const r = rows.filter((x) => x.industry_group === group);
  if (!r.length) return null;
  const sigRows = r.filter((x) => x.significant === "TRUE");
  const byNbhd = new Map();
  for (const x of sigRows) {
    const nb = x.neighbourhood_name || "—";
    byNbhd.set(nb, (byNbhd.get(nb) || 0) + 1);
  }
  const topNeighbourhoods = [...byNbhd.entries()]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  const lclqs = sigRows.map((x) => Number(x.lclq)).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  const maxLclq = lclqs.length ? lclqs[lclqs.length - 1] : 0;
  const medianLclq = lclqs.length ? lclqs[Math.floor((lclqs.length - 1) / 2)] : 0;
  return {
    group, sector: r[0].sectors, n: r.length, sig: sigRows.length,
    share: sigRows.length / r.length, maxLclq, medianLclq, topNeighbourhoods,
  };
}
