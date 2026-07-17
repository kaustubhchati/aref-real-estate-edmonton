// =============================================================================
// consoleTable.js  (shared — analyst Data Console table helpers)
//
// The domain-agnostic @tanstack/react-table helpers + the linear range scale, shared
// by every section's Data Console (Property Assessment is the source; Dwelling Units
// adopts them). Extracted from property-assessment/DataTable.jsx verbatim so a fix to
// any of these applies once. PA's piecewise YoY scale (yoyScale) stays in PA — it is
// the only YoY-specific piece and no other section has a diverging metric.
// =============================================================================

import { useEffect, useRef } from "react";

// LOAD-BEARING, NOT STYLISTIC — do NOT inline this back into a `[]` literal.
// In selection mode we hand TanStack an EMPTY filter set, and it must be the SAME
// array reference every render. TanStack's filter handling is REFERENTIAL: a fresh
// `[]` literal each render reads as "the filters changed", so it recomputes the
// faceted/filtered row models and re-renders via its own internal state — which
// renders again, producing another fresh `[]` → an infinite re-render loop that
// blocks the main thread and FREEZES box-select (D9: 5056 renders → hard hang;
// this stable ref → 58, fixed). A future "tidy" that turns this back into an inline
// `[]` reintroduces that freeze. Keep the reference stable.
export const EMPTY_COLUMN_FILTERS = [];

// A multi-select column filter: a row passes when its value is in the selected set.
// An empty/absent set means NO filter (every row passes) — so the default is "all".
export function multiSelectFilter(row, columnId, selected) {
  return !selected?.length || selected.includes(row.getValue(columnId));
}

// Range SCALE — how a value maps to a position on the track, and back. Linear: the
// track spans that column's own min..max (re-scales when the data changes). Returns
// {min, max, toPct, toVal, detentPct, detentVal}; detent* are null (no piecewise break).
export const linearScale = (min, max) => {
  const span = (max - min) || 1;
  return {
    min, max, detentPct: null, detentVal: null,
    toPct: (v) => ((v - min) / span) * 100,
    toVal: (p) => min + (p / 100) * span,
  };
};

// Range SCALE — QUANTILE. For a metric whose values span orders of magnitude — Dwelling
// Units' construction value runs $0–$395M with a median of only $2.28M — a LINEAR track
// jams the whole bulk into its left edge (median at ~2% of the track), so the slider can't
// separate neighbourhoods. This lays the track out by PERCENTILE of the panel-wide
// distribution instead: track position IS the value's rank, so equal track travel filters
// an equal SHARE of neighbourhood-years. The dense small-permit cluster and the sparse
// $10M+ cluster each get room proportional to how many neighbourhoods they hold, and a lone
// outlier sits one thumb-width past its neighbour instead of stretching the axis. The ends
// clamp to p2/p98 (robust — a lone $0 or the single $395M never defines an end label), and
// the median sits at the detent (mid-track: half the neighbourhoods below, half above).
// `sorted` is the panel-wide value array across ALL years, already ascending — so the frame
// is year-invariant (DESIGN_SYSTEM Principle 0), same as linearScale's panel-wide bounds.
// Returns the same {min,max,toPct,toVal,detentPct,detentVal} shape; detentPct is set, so
// RangeFacet renders it piecewise (detent line + snap), exactly like PA's yoyScale.
const Q_LO = 0.02, Q_HI = 0.98;              // the track's ends, as fractional ranks (p2 … p98)
export const quantileScale = (sorted) => {
  const n = sorted.length;
  // The value at a fractional rank f∈[0,1] — linear interpolation between the two neighbours.
  const valueAt = (f) => {
    const x = Math.min(n - 1, Math.max(0, f * (n - 1)));
    const i = Math.floor(x);
    return i + 1 < n ? sorted[i] + (x - i) * (sorted[i + 1] - sorted[i]) : sorted[i];
  };
  // The fractional rank of a value v∈[0,1] — the inverse of valueAt (binary search, then
  // interpolate the rank between the bracketing samples, so toPct∘toVal round-trips).
  const rankOf = (v) => {
    if (v <= sorted[0]) return 0;
    if (v >= sorted[n - 1]) return 1;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    const a = sorted[lo - 1], b = sorted[lo];        // a < v ≤ b  (lo = first index with sorted[lo] ≥ v)
    return (lo - 1 + (b > a ? (v - a) / (b - a) : 0)) / (n - 1);
  };
  const usable = Q_HI - Q_LO;                        // the rank window [p2, p98] the track spans
  return {
    min: valueAt(Q_LO), max: valueAt(Q_HI),
    detentPct: ((0.5 - Q_LO) / usable) * 100,        // the median → mid-track (50%)
    detentVal: valueAt(0.5),
    toPct: (v) => Math.min(100, Math.max(0, ((rankOf(v) - Q_LO) / usable) * 100)),
    toVal: (p) => valueAt(Q_LO + (p / 100) * usable),
  };
};

// Numeric RANGE filter (the metric-range facet) — a row passes when its value is in
// [lo, hi]. Set on the metric columns; the slider targets the ACTIVE metric's column.
// A null value (non-reportable polygon) has no value to be in range, so it drops out
// while the range is active. No filter value = every row passes.
export function rangeFilter(row, columnId, value) {
  if (!value) return true;
  const v = row.getValue(columnId);
  return v != null && v >= value[0] && v <= value[1];
}

// Regression guard for the D9 freeze CLASS (not just its one instance). The freeze was
// an UNSTABLE reference (a fresh [] each render) passed into a hot render path, which
// drove a runaway re-render loop — silent in prod, a hard main-thread hang. This catches
// that class LOUDLY in dev: it counts renders in a short window and warns ONCE if they
// cross a sane threshold (a real interaction is well under it — D9's fixed box-select was
// ~58; the loop was thousands), so the next unstable-ref slip screams immediately instead
// of shipping as a prod freeze. The tally lives in an EFFECT, not the render body: effects
// run after each commit — the only place refs/Date may be touched (the render-purity lint
// forbids them in render) — and a no-dependency effect fires once per commit, so it counts
// renders directly. Dev-only: import.meta.env.DEV is statically false in prod, so the body
// is inert there (an empty post-commit effect).
export function useRenderStormGuard(label, threshold = 300, windowMs = 1000) {
  const startRef = useRef(0);
  const countRef = useRef(0);
  const firedRef = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const now = performance.now();
    if (now - startRef.current > windowMs) { // a new window → reset the tally
      startRef.current = now;
      countRef.current = 0;
      firedRef.current = false;
    }
    countRef.current += 1;
    if (countRef.current > threshold && !firedRef.current) {
      firedRef.current = true;
      console.warn(
        `[render-storm] <${label}> committed ${countRef.current}× within ${windowMs}ms — ` +
        "likely an UNSTABLE reference (a fresh []/{}/fn passed into a hot render path, " +
        "e.g. useReactTable state). See EMPTY_COLUMN_FILTERS / the D9 box-select freeze."
      );
    }
  }); // no deps → runs after EVERY commit
}
