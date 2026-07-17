// =============================================================================
// format.js
//
// Shared value formatters. Originally lived in property-assessment's
// choroplethStyle.js but moved here once the Report Card table became the
// second real consumer — at that point the rule "extract on the second use"
// kicked in.
//
// Every formatter takes one value and returns a display string. Null /
// undefined / NaN all render as the em-dash placeholder so the same code
// path handles missing and suppressed values uniformly.
//
// If you add a new formatter here, also add it to the JSDoc table below so
// future readers can pick the right one by skim rather than by trial.
//
//   fmtCurrency(214500)      → "$214,500"
//   fmtCurrencyShort(1410000)→ "$1.41M"      (compact, for dense tables)
//   fmtNumber(5722)          → "5,722"
//   fmtPct(6.5)              → "6.5%"          (input is already 0-100 scale)
//   fmtLogPts(7.3)           → "+7.3 log pts"  (signed; PA YoY — NOT a percent)
//   fmtLogPtsBare(7.3)       → "+7.3"          (signed; unit lives in the header)
//   fmtYear(1972)            → "1972"
//   fmtArea(384.3)           → "384 m²"
// =============================================================================

const DASH = "—";

export function fmtCurrency(v) {
  if (v == null || isNaN(+v)) return DASH;
  return "$" + Math.round(+v).toLocaleString();
}

// Abbreviated currency for the analyst table + KPI cards, where numeric columns must
// fit a bounded module: $1.13B / $1.41M / $353k / $920. Full precision still lives in
// fmtCurrency (Export's job). The BILLIONS tier is load-bearing for Dwelling Units —
// its Σ construction value reaches ~$1.1B, which without a B tier read "$1134.59M" (a
// value that overflows its own compact form — DESIGN_SYSTEM §2.104). PA never reaches
// $1B (its values are per-property), so the B branch is inert there.
export function fmtCurrencyShort(v) {
  if (v == null || isNaN(+v)) return DASH;
  const n = Math.round(+v);
  if (Math.abs(n) < 1e4) return "$" + n.toLocaleString();           // $9,500
  // Round to thousands first, THEN promote — so a value that rounds up to a boundary
  // (e.g. $999,800 → 1000k) reads "$1.00M", never "$1000k" (same for k→M→B).
  const k = Math.round(n / 1e3);
  if (Math.abs(k) >= 1e6)  return "$" + (k / 1e6).toFixed(2) + "B"; // $1.13B
  if (Math.abs(k) >= 1000) return "$" + (k / 1e3).toFixed(2) + "M"; // $1.41M
  return "$" + k + "k";                                             // $353k
}

export function fmtNumber(v) {
  if (v == null || isNaN(+v)) return DASH;
  return Math.round(+v).toLocaleString();
}

export function fmtPct(v) {
  if (v == null || isNaN(+v)) return DASH;
  return (+v).toFixed(1) + "%";
}

// LOG POINTS — the unit of the Property Assessment YoY metric.
//
// WHY this is not fmtPct: the backend computes log(median_now / median_prior) * 100
// (04_aggregate_historical.R:274), which is a LOG CHANGE, not a percent. The two
// agree to within rounding below about ±14 — 98% of the panel — and diverge hard
// above it: ROSENTHAL 2014 is 159.7 log pts, which as a percent is +393.8%. Writing
// "%" after a log point therefore states a number the data does not support, for
// exactly the neighbourhoods a reader is most likely to look at. See METHODOLOGY.md
// D7 and docs/recon/YOY_UNITS_20260715.md.
//
// SIGNED, always: YoY is the one signed rate on these surfaces, and the +/− glyph is
// the colour-blind-safe redundant channel for the up/down colouring (DESIGN_SYSTEM
// §1.3 / §4) — colour must never sole-encode the direction. Uses U+2212 MINUS, not
// a hyphen, so the sign aligns in tabular-nums columns.
export function fmtLogPtsBare(v) {
  if (v == null || isNaN(+v)) return DASH;
  const n = +v;
  return (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(1);
}

// The FULL form, for surfaces that carry no unit in their label (KPI card value +
// city line, InfoRail value + delta). Where the label already says "(Log Pts)" —
// the table header, the range-slider label — use fmtLogPtsBare instead so the unit
// is stated once, not once per number.
export function fmtLogPts(v) {
  if (v == null || isNaN(+v)) return DASH;
  return fmtLogPtsBare(v) + " log pts";
}

export function fmtYear(v) {
  if (v == null || isNaN(+v)) return DASH;
  return String(Math.round(+v));
}

export function fmtArea(v) {
  if (v == null || isNaN(+v)) return DASH;
  return Math.round(+v).toLocaleString() + " m²";
}
