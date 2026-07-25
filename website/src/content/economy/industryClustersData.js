// =============================================================================
// industryClustersData.js
//
// View 2 (Industry Specializations) DATA seam — the LCLQ finding, derived from the
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
//     is the honest STRENGTH axis. The p-value cannot grade strength on this data:
//     the significant q values pile into a narrow floor band (measured on the shipped
//     CSV: all 4,226 in [0.0104, 0.047], 2,721 tied at the minimum; the smallest
//     non-significant q is 0.0519) — a binary gate, not a gradient.
//
// Language rules (spec §2.4 AS AMENDED 2026-07-24 — the estimator IS named): "LCLQ"
// appears in stat labels (the title header teaches the full form); significance is
// the categorical FDR gate, never a displayed p; every multiplier carries or sits
// under its reference point (the expected citywide share), and the multiplier is
// never shown without its absolute count companion.
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

// The MAXIMUM LCLQ as a hedged multiplier — the "up to" is load-bearing (the value is one
// business's local quotient, not the group's). Used by the chips. Rounds uniformly with the
// readout's times(): one decimal below 10, whole multiples above.
//   1.8  → "up to 1.8×"      25.06 → "up to 25×"      242.4 → "up to 242×"
export function lclqMultiplierPhrase(lclq) {
  const v = Number(lclq);
  if (!Number.isFinite(v) || v <= 0) return "—";
  const n = v < 10 ? v.toFixed(1) : String(Math.round(v));
  return `up to ${n}×`;
}

// (clusterStrengthPhrase — the old "…than the city average" clause — was REMOVED 2026-07-24:
// its only consumer was the InfoRail's unreachable View-2 branch, and its baseline framing was
// retired by the convention rewrite: the baseline is "expected", stated in the console.)

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
//    MAXIMUM and MEDIAN multiplier over the SIGNIFICANT businesses (maximum = the strongest
//    single significant business; median = the typical one, so one 242× outlier can't misread
//    the whole group; NB the median is the LOWER median on even counts — immaterial at this
//    data's spreads, e.g. 68.27 vs 68.31, both render "68×"), and the significant-area
//    neighbourhood breakdown. All from the committed CSV.
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
