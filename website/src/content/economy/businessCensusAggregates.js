// =============================================================================
// businessCensusAggregates.js — the View-1 sector/industry-group aggregates, computed
// CLIENT-SIDE from the already-loaded points GeoJSON (each business carries its sector +
// industry group). No pipeline change: the GeoJSON is the single source, and the derived
// counts match the measured values in the campaign brief exactly (verified). If these ever
// need to be pipeline-emitted for another consumer, that becomes a backend concern; today
// one pass over ~30k features is trivial and keeps the frontend self-contained.
//
// Produces, for the ten hued sectors (the wheel + list + console rest):
//   • count + share (of all businesses)
//   • family (the measured co-occurrence group — provisional labels, KC may rename)
//   • arrangeIdx (wheel position, the co-occurrence order — DO NOT reorder)
//   • igGroups: this sector's industry groups, count-desc (the console drill-down)
// plus the "Other Sectors" collapse bucket. "Mixed — No Leader" is a SURFACE concept (a
// legend row), not a business count, so it is not here.
// =============================================================================

import { SECTOR_ARRANGEMENT } from "./businessCensusPointsStyle.js";

// Co-occurrence families (spec §1.1). Real Estate stands alone — it barely co-occurs with
// anything (tops the single-dominant list). Keyed by the sentence-case sector name (=colour_key).
export const SECTOR_FAMILIES = {
  "Retail trade": "consumer",
  "Other services (except public administration)": "consumer",
  "Accommodation and food services": "consumer",
  "Health care and social assistance": "consumer",
  "Real estate and rental and leasing": "standalone",
  "Professional, scientific and technical services": "industrial",
  "Construction": "industrial",
  "Manufacturing": "industrial",
  "Wholesale trade": "industrial",
  "Educational services": "industrial",
};
export const FAMILY_ORDER = ["consumer", "standalone", "industrial"];
export const FAMILY_LABELS = {   // PROVISIONAL (KC may rename) — Title Case per the standing rule
  consumer: "Consumer-Facing",
  standalone: "Standalone",
  industrial: "Industrial",
};

// Enrich the colour-domain sectors (the ten hued top-sectors) with share / family /
// wheel index / their industry-group breakdown, + the Other-Sectors bucket.
export function deriveAggregates(features, domain) {
  const total = features.length;

  // industry groups per sector (keyed by the `sectors` field — the sector a business is in).
  const igBySector = new Map();   // sectorKey -> Map(group -> count)
  for (const f of features) {
    const s = f.properties?.sectors, ig = f.properties?.industry_group;
    if (!s || !ig) continue;
    if (!igBySector.has(s)) igBySector.set(s, new Map());
    const m = igBySector.get(s);
    m.set(ig, (m.get(ig) || 0) + 1);
  }

  const sectors = domain.sectors.map((sec) => {
    const groupsMap = igBySector.get(sec.key) || new Map();
    const secTotal = [...groupsMap.values()].reduce((a, v) => a + v, 0) || sec.count;
    const igGroups = [...groupsMap.entries()]
      .map(([group, count]) => ({ group, count, share: count / secTotal }))
      .sort((a, b) => b.count - a.count);
    return {
      ...sec,                                   // key, count, colour, oklch
      share: sec.count / total,
      family: SECTOR_FAMILIES[sec.key] ?? "industrial",
      arrangeIdx: SECTOR_ARRANGEMENT.indexOf(sec.key),
      igGroups,
      secTotal,
    };
  });

  const otherSectors = domain.other
    ? { key: domain.other.key, count: domain.other.count, share: domain.other.count / total, colour: domain.other.colour }
    : null;

  return { sectors, otherSectors, total };
}

// Top-N industry groups for a sector's drill-down + an EXPLICIT remainder row (never a
// silent truncation). N=8 matches the brief's Manufacturing example ("+74 more · 1,019 ·
// 62.1%"); sectors with ≤N groups show all rows, no remainder.
export function drillRows(sector, topN = 8) {
  const groups = sector.igGroups;
  let rows, remainder;
  if (groups.length <= topN) {
    rows = groups; remainder = null;
  } else {
    rows = groups.slice(0, topN);
    const rest = groups.slice(topN);
    const count = rest.reduce((a, g) => a + g.count, 0);
    remainder = { nGroups: rest.length, count, share: count / sector.secTotal };
  }
  // Bar scale: the biggest displayed ROW (a top group OR the remainder) fills the bar. So for
  // Manufacturing the remainder (926 > top group 132) dominates; for Accommodation the top
  // group fills and the remainder is a stub — that contrast is the finding.
  const maxRow = Math.max(...rows.map((r) => r.count), remainder ? remainder.count : 0);
  return { rows, remainder, maxRow };
}
