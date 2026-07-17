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
