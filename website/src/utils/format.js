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
//   fmtCurrency(214500)  → "$214,500"
//   fmtNumber(5722)      → "5,722"
//   fmtPct(6.5)          → "6.5%"          (input is already 0-100 scale)
//   fmtYear(1972)        → "1972"
//   fmtArea(384.3)       → "384 m²"
// =============================================================================

const DASH = "—";

export function fmtCurrency(v) {
  if (v == null || isNaN(+v)) return DASH;
  return "$" + Math.round(+v).toLocaleString();
}

export function fmtNumber(v) {
  if (v == null || isNaN(+v)) return DASH;
  return Math.round(+v).toLocaleString();
}

export function fmtPct(v) {
  if (v == null || isNaN(+v)) return DASH;
  return (+v).toFixed(1) + "%";
}

export function fmtYear(v) {
  if (v == null || isNaN(+v)) return DASH;
  return String(Math.round(+v));
}

export function fmtArea(v) {
  if (v == null || isNaN(+v)) return DASH;
  return Math.round(+v).toLocaleString() + " m²";
}
