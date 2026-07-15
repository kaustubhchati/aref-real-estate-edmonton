// =============================================================================
// DataTable.jsx
//
// The Property Assessment analyst data module (Felt zone 4) — the full tabular
// form of the per-neighbourhood data. Collapsed to a centred pill handle by
// default; click the handle (or press T) to raise the bounded panel (= analyst
// view). Desktop = centred ~620px module floating at the bottom; narrow/touch =
// fullscreen overlay (CSS).
//
// ENGINE: TanStack Table (@tanstack/react-table, headless) drives sorting,
// name-filtering, and the row model. We bring the markup (the gel look + the
// legibility bar stay ours); TanStack only owns the table logic. The HONEST area
// aggregate is NOT a TanStack aggregation: a parcel-weighted mean must weight by
// n_properties (TanStack's built-in mean is unweighted), so the exact/approx math
// stays bespoke in PropertyAssessmentMap (selectionAggregate) and renders in the
// unchanged AggregateHeader below. Constituent rows render through the same table.
//
// Data: rows are derived ONCE in PropertyAssessmentMap from the RESIDENT combined
// source (gjView for the active-year values, gj for the per-row sparkline) and
// passed in — no querySourceFeatures, no tile-dedupe (the data is already in JS).
// Every metric value is carried on the row, so the table shows the SAME fields the
// rail used to list, for every neighbourhood — the active metric's column is just
// highlighted (it's what the map colours by + what Trend/Rank track).
//
// Props:
//   rows         [{ id, name, state, median_assessvalue, avall_public,
//                   avg_lotsize, median_yearbuilt, yoy_pct_change, series, rank }]
//                numeric fields are null for non-reportable rows → rendered "—"
//   metric       active metric key — highlights its column; Trend/Rank track it
//   metricLabel  active metric label — Trend/Rank header tooltips
//   activeIndex  year index to dot in each row's sparkline
//   selectedIds  current selection (row highlight + scroll-into-view)
//   onSelectRow  (id) => void
//   onHoverRow   (id | null) => void   (drives the polygon hover feature-state)
//   aggregate    honest area aggregate, or null. Non-null = selection mode.
//   cityBaseline honest city-wide aggregate (every polygon) for the vs-city
//                comparison in the AggregateHeader (D8 item 8), or null.
//   onClearSelection (() => void)
//   onExport     (format) => void — scoped export (CSV/GeoJSON/PNG)
//   open         controlled: the table is raised (= analyst view)
//   onToggle     () => void — toggle the table / analyst view
//   rangeSlot    DOM node of the tuning rack's range slot (or null until it
//                mounts). The metric-range slider is PORTALED here so it sits in
//                the rack with the year slider; its TanStack wiring (faceted
//                bounds + setRange + the VIEW-only brush) stays in THIS
//                component — only the UI moves. [tuning-bay]
//   metrics / onMetricChange  METRICS + the active-metric setter — the console's
//                spine header carries the metric selector while the console is up
//                (it lifts out of the identity card, D3).
//
// LAYOUT (D3): a full-width, height-capped panel with FOUR fixed labelled grid slots
// — the compact table SPINE (left, spans all rows) + three wide-shallow gauges
// (TIMESERIES · DISTRIBUTION · VS-CITY). The frames never move; only their interiors
// change with the selection count (N=0 city / N=1 neighbourhood / N≥2 aggregate). The
// single-select detail that used to re-home between panel and console is consolidated
// into these slots (no more `detail` prop).
// =============================================================================

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  flexRender,
  getCoreRowModel,
  getFacetedMinMaxValues,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import DistributionStrip from "./DistributionStrip.jsx";
import TrendInstrument from "./TrendInstrument.jsx";
import ExportMenu from "./ExportMenu.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import Sparkline from "../../components/Sparkline.jsx";
import { DUR_BASE, reduceMotion } from "../../components/motion.js";
import { METRICS, COLOUR_LEVEL_DELTAS } from "./choroplethStyle.js";
import {
  fmtArea,
  fmtCurrencyShort,
  fmtLogPts,
  fmtLogPtsBare,
  fmtNumber,
  fmtPct,
  fmtYear,
} from "../../utils/format.js";

// TREND sparkcol cell (C7, contract §4) — the active-metric trajectory as a ~44×12
// sparkline, trajectory-coloured (median/mean/YoY → rising green / falling coral;
// lot/built → neutral), with GAPS (never zero-bridged) at suppressed / -999 years.
// React.memo'd on (series, metric) so a re-sort / hover / selection never recomputes
// 400 rows — the per-row render-storm guard. < 2 finite points → an honest em-dash.
// C8 measured (403 visible rows, live PA analyst view): metric switch = 403 renders
// (one per row — the series shown IS metric-dependent, so this is the necessary minimum,
// not a storm; observed 806 in dev = 2× only from StrictMode's double-invoke). A re-sort
// and a row hover each = 0 re-renders — the memo holds on every update that isn't a
// metric/series change. Well within the storm guard.
const TREND_METRICS = new Set(["median_assessvalue", "avall_public", "yoy_pct_change"]);
const TrendSparkCell = memo(function TrendSparkCell({ series, metric }) {
  const nums = (series ?? []).map((v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v));
  const finite = nums.filter((v) => v != null);
  if (finite.length < 2) return <span className="dt-spark-empty">—</span>;
  let stroke = "var(--pa-dim)"; // neutral (lot / built, or a flat trajectory)
  if (TREND_METRICS.has(metric)) {
    const dir = finite[finite.length - 1] - finite[0];
    stroke = dir > 0 ? "var(--pa-up)" : dir < 0 ? "var(--pa-dn)" : "var(--pa-dim)";
  }
  return <Sparkline values={nums} stroke={stroke} width={44} height={12} activeIndex={-1} ariaLabel="Trend" />;
});

// Per-metric PRESENTATION for the dense table: a compact column label + compact
// formatter (e.g. $1.41M) that differ from the map's full label / formatter.
// Keyed by metric key; a metric with no entry falls back to its METRICS label/fmt.
//   header  — the column heading; carries the unit (e.g. "Lot size (m²)") so the
//             CELLS don't repeat it (minimal ink). Defaults to `label`.
//   fmt     — the FULL formatter (with units). The range facet + the aggregate
//             header's distribution strip read this, so they KEEP their units.
//   cellFmt — the BARE table-cell formatter (the unit lives in the header).
//             Defaults to `fmt`, so a metric whose unit stays in-cell (e.g. the
//             "$" currency prefix) needs no cellFmt.
const PRESENTATION = {
  median_assessvalue: { label: "Median Value", header: "Median", fmt: fmtCurrencyShort },
  avall_public:       { label: "Mean Value",   header: "Mean",   fmt: fmtCurrencyShort },
  avg_lotsize:        { label: "Lot Size", header: "Lot m²", fmt: fmtArea,
                        cellFmt: fmtNumber },                  // bare — "m²" is in the header
  median_yearbuilt:   { label: "Year Built",   header: "Built", fmt: fmtYear },
  pct_with_unit:      { label: "% Condo",      header: "% Condo", fmt: fmtPct,
                        cellFmt: (v) => (v == null || isNaN(+v) ? "—" : `${Math.round(+v)}%`) },  // D1 — also a map metric now
  // LOG POINTS, not percent (METHODOLOGY.md D7). The unit is stated ONCE in the
  // header — which the range-slider label also reads — so both `fmt` and `cellFmt`
  // are bare here. That is deliberate: for every other metric `fmt` is the FULL
  // unit-carrying formatter, but a slider readout of "+7.3 log pts – +15.5 log pts"
  // says the unit twice in a slot sized for neither.
  yoy_pct_change:     { label: "YoY (Log Pts)", header: "YoY (Log Pts)", fmt: fmtLogPtsBare,
                        cellFmt: fmtLogPtsBare },
};

// Fixed-chassis column widths (table-layout: fixed) — proportions by column ROLE,
// so the column SET is a deliberate constant and the table never reflows when
// values change. The 6 share-width columns (median · mean · lot · built · %Condo ·
// YoY) share one `metric` width; name + trend take the rest — 24 + 6×11 + 10 = 100%.
// The <colgroup> renders these in column order. The per-row TREND sparkline is
// re-added (contract §4/C7), beside the console's wide trend instrument. [console-chassis]
const COL_WIDTH = { name: "24%", metric: "11%", trend: "10%" };

// The fixed metric columns, DERIVED from the map's canonical METRICS (one source
// of truth) in the same order — so a new map metric automatically gets a table
// column. PRESENTATION supplies the compact label/formatter; anything unlisted
// falls back to the metric's own label + formatter, so the column never silently
// vanishes.
// A column descriptor for any metric key — PRESENTATION supplies the compact
// label/header/formatter; the map metric's own label/fmt is the fallback.
const colFor = (key) => {
  const m = METRICS.find((mm) => mm.key === key);
  return {
    key,
    label:   PRESENTATION[key]?.label ?? m?.label ?? key,                              // range facet + dist strip
    header:  PRESENTATION[key]?.header ?? PRESENTATION[key]?.label ?? m?.label ?? key, // table heading (carries the unit)
    fmt:     PRESENTATION[key]?.fmt ?? m?.fmt,                                          // FULL (units) — range + dist
    cellFmt: PRESENTATION[key]?.cellFmt ?? PRESENTATION[key]?.fmt ?? m?.fmt,            // BARE — table cell
  };
};
// The table BODY's plain metric columns, in order (median · mean · lot · built).
// DECOUPLED from the map METRICS (D1): Year built stays a table column though it left
// the metric row; %Condo (condoCol) + YoY (yoyCol) are built specially below.
const METRIC_COLS = ["median_assessvalue", "avall_public", "avg_lotsize", "median_yearbuilt"].map(colFor);
// Every metric that can be the ACTIVE map metric OR a range-filtered column — resolves
// activeCol (trend/KPI label + fmt) and the range facet, which targets the active metric.
// On a metric switch we drop any range filter left on a different metric (units differ).
const COLS_BY_KEY = Object.fromEntries(
  ["median_assessvalue", "avall_public", "avg_lotsize", "median_yearbuilt", "pct_with_unit", "yoy_pct_change"].map((k) => [k, colFor(k)]),
);
const METRIC_KEYS = new Set(Object.keys(COLS_BY_KEY));

// Categorical facets (D6) — VIEW-only table filters, data-driven from the rows.
// Each is a HIDDEN column (a faceting/filtering accessor that is never rendered) +
// a control in the dock header, declared once here and mapped in a loop. `labelOf`
// maps a raw value to its display label.
// D4 removed the State (polygon_state) filter CHIPS — filter UI only. The map's
// state COLOURING (STATE_STYLE + polygon_state in choroplethStyle.js) is untouched,
// and the shared brush is unaffected (District + the metric-range still populate
// columnFilters → the VIEW-only dim; the fence is intact).
const FACETS = [
  { id: "district", label: "District", control: "dropdown", labelOf: (v) => v },
];

// LOAD-BEARING, NOT STYLISTIC — do NOT inline this back into a `[]` literal.
// In selection mode we hand TanStack an EMPTY filter set, and it must be the SAME
// array reference every render. TanStack's filter handling is REFERENTIAL: a fresh
// `[]` literal each render reads as "the filters changed", so it recomputes the
// faceted/filtered row models and re-renders via its own internal state — which
// renders again, producing another fresh `[]` → an infinite re-render loop that
// blocks the main thread and FREEZES box-select (D9: 5056 renders → hard hang;
// this stable ref → 58, fixed). A future "tidy" that turns this back into an inline
// `[]` reintroduces that freeze. Keep the reference stable.
const EMPTY_COLUMN_FILTERS = [];

// A multi-select column filter: a row passes when its value is in the selected set.
// An empty/absent set means NO filter (every row passes) — so the default is "all".
function multiSelectFilter(row, columnId, selected) {
  return !selected?.length || selected.includes(row.getValue(columnId));
}

// Numeric RANGE filter (D7 metric-range facet) — a row passes when its value is in
// [lo, hi]. Set on the metric columns; the slider targets the ACTIVE metric's column.
// A null value (non-reportable polygon) has no value to be in range, so it drops out
// while the range is active. No filter value = every row passes.
function rangeFilter(row, columnId, value) {
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
function useRenderStormGuard(label, threshold = 300, windowMs = 1000) {
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
        "e.g. useReactTable state). See DataTable's EMPTY_COLUMN_FILTERS / the D9 box-select freeze."
      );
    }
  }); // no deps → runs after EVERY commit
}

export default function DataTable({
  rows,
  metric,
  metricLabel,
  cityName,         // active city name (e.g. "Edmonton") — labels every city baseline (C3)
  metrics,          // METRICS — the console's spine header carries the metric selector (D3)
  onMetricChange,   // set the active metric from the console
  activeIndex,
  year,
  years,
  sliderYear,       // Fix 4 — live year thumb (throttled commit via slideYear); the Year
  slideYear,        // slider now docks in the console (this spine), not the instrument column
  selectedIds,
  onSelectRow,
  onHoverRow,
  aggregate,
  cityBaseline,
  onClearSelection,
  onExport,
  onBrush,
  open,
  onToggle,
  globalFilter,          // CONTROLLED by the parent's unified SearchPeek (D5) — the
  onGlobalFilterChange,  // dock's own .dt-filter input is gone; this is the sole driver
}) {
  const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
  const [columnFilters, setColumnFilters] = useState([]); // categorical facets (D6)
  const scrollRef = useRef(null);
  useRenderStormGuard("DataTable"); // dev-only: screams if an unstable ref re-storms (D9)

  // Smooth takeover (note 6): the panel's HEIGHT animates open↔closed via the
  // grid-rows 0fr↔1fr trick, so the console RISES / COLLAPSES (and the handle +
  // the tuning rack above it move with it) instead of popping. The heavy panel
  // (the table) is mounted ONLY while open OR mid-collapse:
  //   open  → mount, then expand on the NEXT frame so the 0fr→1fr transition runs
  //   close → collapse, then unmount after the transition window (a TIMEOUT, not
  //           transitionEnd: a sub-frame open→close cancels the expand RAF so the
  //           grid never leaves 0fr and no transitionEnd would ever fire — the
  //           timeout unmounts reliably either way). reduceMotion → unmount next tick.
  const [panelMounted, setPanelMounted] = useState(open);
  const [panelExpanded, setPanelExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      const raf = requestAnimationFrame(() => setPanelExpanded(true)); // expand after mount
      return () => cancelAnimationFrame(raf);
    }
    setPanelExpanded(false); // collapse
    const t = setTimeout(() => setPanelMounted(false), reduceMotion() ? 0 : DUR_BASE + 60);
    return () => clearTimeout(t);
  }, [open]);

  // Selection mode = a multi-neighbourhood box-select is active (aggregate set):
  // the table shows the aggregate header + only the constituent rows.
  const selectionMode = !!aggregate;
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  // In selection mode the table data is just the constituents (the auditable
  // detail behind the aggregate cards); otherwise it's every neighbourhood.
  const data = useMemo(() => {
    if (!selectionMode) return rows;
    return rows.filter((r) => selectedSet.has(String(r.id)));
  }, [rows, selectionMode, selectedSet]);

  // ---- Console visual-slot data (D3) -----------------------------------------
  // The four slots read the SELECTION channel only (singleRow / data / rows) — never
  // brushedIds (the VIEW-only fence). Everything re-derives on selection AND metric
  // switch, so the slots refresh by design (no literals).
  //
  // The single-selected row (N=1) — the slots show THIS neighbourhood.
  const singleRow = useMemo(
    () => (selectedIds.length === 1 ? rows.find((r) => String(r.id) === String(selectedIds[0])) : null),
    [selectedIds, rows]
  );

  // TIMESERIES: the active-metric trajectory to plot — the single row's series (N=1),
  // else the per-year MEAN across the scope rows (selection mean at N≥2, city mean at
  // N=0). `series` already carries the ACTIVE metric across every year.
  const plotSeries = useMemo(() => {
    if (!years.length) return [];
    if (singleRow) return singleRow.series ?? [];
    const src = selectionMode ? data : rows;
    return years.map((_, i) => {
      const vals = src.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }, [singleRow, selectionMode, data, rows, years]);

  // DISTRIBUTION: the CITY values (all reportable) as the histogram; the SELECTION's
  // values as the marker(s) within it (none at N=0 → the city histogram alone).
  const cityValues = useMemo(
    () => rows.map((r) => r[metric]).filter((v) => v != null),
    [rows, metric]
  );
  const selMarkers = useMemo(() => {
    if (singleRow) return singleRow[metric] != null ? [singleRow[metric]] : [];
    if (selectionMode) return data.map((r) => r[metric]).filter((v) => v != null);
    return [];
  }, [singleRow, selectionMode, data, metric]);

  // ---- Trend instrument data (C8) --------------------------------------------
  // The dashed CITY baseline — the city's active-metric mean per year (drawn for the
  // S-d/S-e comparison; at N=0 the main line IS the city, so it isn't drawn twice).
  const cityLine = useMemo(
    () => years.map((_, i) => {
      const vals = rows.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }),
    [rows, years]
  );
  // The min–max ENVELOPE across the selection (N≥2 only) — per-year [min, max].
  const trendEnvelope = useMemo(() => {
    if (!selectionMode) return null;
    return years.map((_, i) => {
      const vals = data.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
    });
  }, [selectionMode, data, years]);
  // The matched-sample YoY per year for the scope (single nbhd / selection mean / city
  // (The trendYoy mean-series + scopeLabel were removed 2026-07-14 with the YoY·Matched strip
  // and the header scope-name dedupe — both were their sole consumers.)

  // Column defs (data-driven, STATIC). accessorFn maps null → undefined so TanStack's
  // sortUndefined keeps blanks last in BOTH directions; the cell renders "—".
  // `meta.metricKey` lets the renderer highlight the active metric's column. The
  // per-row Trend sparkline is gone (D3) — its full trajectory is the timeseries slot.
  const columns = useMemo(() => {
    // One metric column def (level/rate metrics). accessorFn maps null → undefined so
    // TanStack's sortUndefined keeps blanks last in BOTH directions; the cell renders "—".
    const metricCol = (m) => ({
      id: m.key,
      accessorFn: (r) => r[m.key] ?? undefined,
      header: m.header,                         // short heading (e.g. "Lot m²")
      cell: (info) => {
        const v = info.getValue();
        return v == null ? "—" : m.cellFmt(v);  // bare number; the unit is in the header
      },
      sortUndefined: "last",
      enableGlobalFilter: false,
      filterFn: rangeFilter,   // the metric-range facet targets the ACTIVE metric's column
      meta: { numeric: true, metricKey: m.key, width: COL_WIDTH.metric },
    });
    // % Condo (D4/D1) — share of individually-titled CONDOMINIUM parcels (Plan/Unit
    // land-titles registration; incl. single-unit bare-land condos). NOT "% apartments"
    // / "% multi-family": rental blocks register as one Plan/Block/Lot title and count
    // as non-condo. Now ALSO a map metric (D1, on its own 0–100 share ramp), so it carries
    // metricKey + the range filterFn — the active-metric highlight + range facet target it
    // like any metric column. null → "—".
    const condoCol = {
      id: "pct_with_unit",
      accessorFn: (r) => r.pct_with_unit ?? undefined,
      header: "% Condo",
      cell: (info) => {
        const v = info.getValue();
        return v == null ? "—" : `${Math.round(v)}%`;
      },
      sortUndefined: "last",
      enableGlobalFilter: false,
      filterFn: rangeFilter,   // the metric-range facet targets %Condo when it's active
      meta: { numeric: true, metricKey: "pct_with_unit", width: COL_WIDTH.metric },
    };
    // TREND (C7) — the active-metric trajectory as a per-row sparkline. Rendered by the
    // React.memo'd TrendSparkCell; the active metric comes from table.options.meta so
    // this []-dep memo never captures a stale metric. Not sortable.
    const trendCol = {
      id: "trend",
      header: "Trend",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: (info) => (
        <TrendSparkCell series={info.row.original.series} metric={info.table.options.meta?.metric} />
      ),
      meta: { numeric: true, width: COL_WIDTH.trend },
    };
    // YoY (C3) — the only SIGNED rate in the table: render it signed, 1-decimal, and
    // coloured up/down (green/coral) so it reads like a rate, not a bare number. The
    // cell carries NO unit: the header says "(Log Pts)". fmtLogPtsBare supplies the
    // sign, so every YoY surface now uses one notation (it previously printed "%"
    // here while the KPI rail two functions away printed none).
    const yoyCol = {
      id: "yoy_pct_change",
      accessorFn: (r) => r.yoy_pct_change ?? undefined,
      header: COLS_BY_KEY.yoy_pct_change.header,
      cell: (info) => {
        const v = info.getValue();
        if (v == null) return "—";
        return <span className={signCls(v)}>{fmtLogPtsBare(v)}</span>;
      },
      sortUndefined: "last",
      enableGlobalFilter: false,
      filterFn: rangeFilter,   // the metric-range facet targets YoY when it's active
      meta: { numeric: true, metricKey: "yoy_pct_change", width: COL_WIDTH.metric },
    };
    return [
      {
        accessorKey: "name",
        header: "Neighbourhood",
        // title so a name truncated by the fixed-width column stays readable on hover.
        cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
        meta: { className: "dt-name", width: COL_WIDTH.name },
      },
      // Contract §4 order: MEDIAN · MEAN · LOT m² · BUILT · % CONDO · YOY · TREND.
      ...METRIC_COLS.filter((m) => m.key !== "yoy_pct_change").map(metricCol),  // median · mean · lot · built
      condoCol,                                                                 // % Condo
      yoyCol,                                                                   // YoY (C3 — signed/%/coloured)
      trendCol,                                                                 // Trend
      // Hidden facet columns (D6) — accessor + multi-select filter only, never
      // rendered (hidden via initialState.columnVisibility), so the VISIBLE table is
      // unchanged. getFacetedUniqueValues reads these to populate the facet controls.
      ...FACETS.map((f) => ({
        id: f.id,
        accessorFn: (r) => r[f.id],
        filterFn: multiSelectFilter,
        enableSorting: false,
        enableGlobalFilter: false,
      })),
    ];
  }, []);

  // React Compiler can't memoize a component that calls useReactTable (TanStack
  // returns fresh functions each call); it safely skips this one — fine at 407 rows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    meta: { metric },   // read by the TREND sparkcol cell (avoids a stale-metric closure)
    // Name filter + categorical facets both suppress in selection mode, so every
    // constituent row stays visible under the aggregate (the facets are VIEW-only,
    // so they never desync from the selection aggregate — D6 recon #4).
    state: {
      sorting,
      // globalFilter: "" is a stable PRIMITIVE (string), so a literal is safe here.
      // columnFilters MUST be a stable reference — see EMPTY_COLUMN_FILTERS (an inline
      // [] each render churns TanStack into an infinite re-render loop, the D9 freeze).
      globalFilter: selectionMode ? "" : globalFilter,
      columnFilters: selectionMode ? EMPTY_COLUMN_FILTERS : columnFilters,
    },
    // The facet columns exist only to drive faceting/filtering — keep them hidden.
    initialState: { columnVisibility: Object.fromEntries(FACETS.map((f) => [f.id, false])) },
    onSortingChange: setSorting,
    onGlobalFilterChange: onGlobalFilterChange,   // controlled up to the unified search (D5)
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
  });

  const viewRows = table.getRowModel().rows;

  // Console-header scope title (contract §4): the entity the console describes.
  //   N=0 → "All M neighbourhoods" (or "K of M" when a search filter narrows it)
  //   N=1 → "<Name>" (name only — the rank · parcels · state detail lives in the
  //         InfoRail, not repeated here; Fix 3, frees the header slot for Fix 4)
  //   N≥2 → "N neighbourhoods selected"
  const scopeTitle = selectionMode
    ? `${aggregate.nSelected} Neighbourhoods Selected`
    : singleRow
    ? singleRow.name
    : viewRows.length < rows.length
    ? `${viewRows.length} Of ${rows.length} Neighbourhoods`
    : `All ${rows.length} Neighbourhoods`;

  // --- Categorical facets (D6) — VIEW-only; the controls live in the dock header
  // and read/write the hidden facet columns through TanStack. Each helper is generic
  // over a facet id, so the two facets share one code path (no copy-pasted blocks). --
  const facetValue = (id) => table.getColumn(id)?.getFilterValue() ?? [];
  const facetOptions = (id) =>
    Array.from(table.getColumn(id)?.getFacetedUniqueValues()?.keys() ?? [])
      .filter((v) => v != null)
      .sort();
  function toggleFacet(id, v) {
    const cur = facetValue(id);
    table.getColumn(id)?.setFilterValue(
      cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    );
  }
  // Metric-RANGE facet (D7) — targets the ACTIVE metric's own column. Bounds come
  // from getFacetedMinMaxValues (re-derived on metric switch); the value is that
  // column's [lo, hi] filter (undefined = full range = no filter). A range that
  // spans the full bounds clears the filter so it doesn't count as active.
  const activeCol = COLS_BY_KEY[metric];   // resolves any active metric (incl. %Condo / YoY)
  const rangeBounds = table.getColumn(metric)?.getFacetedMinMaxValues();
  const rangeValue = table.getColumn(metric)?.getFilterValue();
  const setRange = ([lo, hi]) => {
    if (!rangeBounds) return;
    const full = lo <= rangeBounds[0] && hi >= rangeBounds[1];
    table.getColumn(metric)?.setFilterValue(full ? undefined : [lo, hi]);
  };
  // On a metric switch, drop any range filter left on a DIFFERENT metric (its units
  // no longer apply). Categorical facets (non-metric ids) are metric-independent and
  // persist untouched.
  useEffect(() => {
    setColumnFilters((prev) => prev.filter((cf) => !METRIC_KEYS.has(cf.id) || cf.id === metric));
  }, [metric]);

  // "Clear filters" resets the FACETS only — distinct from the selection-mode
  // "Clear selection" (which empties the selected set). The two never co-exist
  // (facets show in normal mode; Clear-selection in the AggregateHeader), so the
  // labels keep them unambiguous.
  const anyFacet = columnFilters.length > 0;
  const clearFacets = () => setColumnFilters([]);

  // --- Brush (D7) -------------------------------------------------------------
  // The IDs of the rows currently shown WHEN a facet is active — the map dims
  // everything NOT in this set, so filtering the table visibly narrows the map.
  // Gated on a facet being active and not in selection mode (per D6's rule: no
  // facet → no dim). null = no brush. Reported UP to the map via onBrush; it feeds
  // ONLY the dim channel — never the aggregate or export (the D6 VIEW-only ruling).
  const brushActive = !selectionMode && columnFilters.length > 0;
  const brushedIds = useMemo(
    () => (brushActive ? viewRows.map((r) => r.original.id) : null),
    [brushActive, viewRows]
  );
  // Report only on a real CONTENT change (a sorted signature ignores re-sorts and
  // the row model's per-render identity churn — so this can't loop the parent), and
  // THROTTLE it: a range-slider drag changes the brush many times a second, and each
  // report repaints ~376 map polygons (the dim). Pacing to ~10/s with a trailing
  // call keeps the map from thrashing while the table + thumb stay live. (The dim is
  // a feature-state opacity change, which MapLibre applies instantly — it snaps, so
  // reduced-motion is honoured with no transition to gate.)
  const lastBrushSig = useRef("");
  const lastBrushAt = useRef(0);
  const brushTrailing = useRef(null);
  useEffect(() => () => clearTimeout(brushTrailing.current), []);
  useEffect(() => {
    const sig = brushedIds ? [...brushedIds].map(String).sort().join(",") : "";
    if (sig === lastBrushSig.current) return;
    const fire = () => {
      lastBrushSig.current = sig;
      lastBrushAt.current = performance.now();
      onBrush?.(brushedIds);
    };
    clearTimeout(brushTrailing.current);
    const BRUSH_GAP = 100; // ms — pacing window for the expensive map repaint
    const since = performance.now() - lastBrushAt.current;
    if (since >= BRUSH_GAP) fire();
    else brushTrailing.current = setTimeout(fire, BRUSH_GAP - since);
  }, [brushedIds, onBrush]);

  // Keyboard shortcut: T toggles the table (ignored while typing in a field).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "t" && e.key !== "T") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey) return;
      onToggle?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);

  // When the selection narrows to a single nbhd (e.g. clicked on the map), scroll
  // its row into view if the table is open. Re-runs after ANY reorder: a sort, a
  // filter, OR a data change (year/metric rebuilds `data`, which can reorder a
  // value/rank-sorted list). `data` is the memo, not the live row model, so this
  // fires only on real reorders — not every render.
  // panelMounted is a dep so this re-runs once the table actually mounts: opening
  // the dock defers the table's mount by one render (panelMounted), so on the open
  // commit scrollRef.current is still null — without this dep the scroll-to-row
  // would be missed when the dock opens with a row already selected.
  useEffect(() => {
    if (!open || selectedIds.length !== 1 || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-id="${CSS.escape(String(selectedIds[0]))}"]`);
    row?.scrollIntoView({ block: "start" });   // top-align the selected row (D4, note 27) — was "nearest"
  }, [selectedIds, open, sorting, globalFilter, data, panelMounted]);

  // ── The Tuning instrument (Fix 4) — ONE fixed frame: Year (single) + a hairline
  // divider + Metric range (dual). Rendered in TWO docks below (a strip above the handle
  // in View; the console header in Analysis) — never both at once, so one instance. The
  // frame is constant; only the slot it occupies changes (grid-structured / dynamic-in).
  const yMin = years?.length ? Math.min(...years) : 0;
  const yMax = years?.length ? Math.max(...years) : 1;
  const tuningInstrument = (
    <div className="pa-tune-instrument" role="group" aria-label="Year and value range">
      <YearSliderRow
        year={year} sliderYear={sliderYear} slideYear={slideYear} yMin={yMin} yMax={yMax}
      />
      <div className="pa-tune-divider" aria-hidden="true" />
      <RangeFacet
        label={activeCol?.header ?? metricLabel}
        fmt={activeCol?.fmt ?? ((v) => v)}
        bounds={rangeBounds}
        value={rangeValue}
        onChange={setRange}
        disabled={selectionMode}
      />
    </div>
  );

  return (
    <section className="dt" aria-label="Neighbourhood data table">
      {/* VIEW dock (Fix 4) — the Tuning instrument rides as a strip ABOVE the pull-up
          handle when the console is DOWN. In Analysis it relocates into the console
          header (below), so it renders here only while collapsed. */}
      {!open && <div className="pa-tune-dock pa-tune-dock-strip">{tuningInstrument}</div>}
      <button
        type="button"
        className="dt-handle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="dt-handle-title">Data Table</span>
        {/* Fix A2 — "Data Table" + its pull-up affordance only. The universe count (·407)
            and the "Analyst View" chip are removed (dropping the count also retires the
            stale-403/407 maintenance — no literal to keep in sync). The SELECTION count
            stays (live state feedback, contract §3.1); a light "Press T" discoverability
            hint stays while collapsed. */}
        {selectionMode ? (
          <span className="dt-handle-meta dt-handle-sel">{aggregate.nSelected} selected</span>
        ) : (
          !open && <span className="dt-handle-meta">Press T</span>
        )}
        <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      {/* The animating shell — grid-rows 0fr↔1fr (is-open) gives a TRUE height
          transition so the console rises/collapses smoothly. The panel mounts only
          while open or mid-collapse (panelMounted, unmounted by the effect's timeout). */}
      <div className={`dt-panel-wrap${panelExpanded ? " is-open" : ""}`}>
        {panelMounted && (
          <div className="dt-panel">
            {/* ===== CONSOLE HEADER (contract §4) — scope title + metric chips on the
                left; District facet · × Clear · Export on the right. The metric chips
                re-home HERE from the instrument column when the console is up (the
                two-conditional-homes mechanic). ===== */}
            <div className="dt-head">
              <div className="dt-head-l">
                <span className="dt-scope">{scopeTitle}</span>
                {metrics && onMetricChange && (
                  <div className="dt-metric">
                    <SegmentedControl
                      label="Metric"
                      options={metrics.map((m) => ({
                        key: m.key,
                        label: COLS_BY_KEY[m.key]?.label ?? m.label,
                      }))}
                      value={metric}
                      onChange={onMetricChange}
                    />
                  </div>
                )}
              </div>
              {/* ANALYSIS dock (Fix 4) — the SAME instrument, relocated right of the
                  metric chips into the header slot Fix 3 freed. Renders only while the
                  console is up (the View strip above holds it when down). */}
              {open && <div className="pa-tune-dock pa-tune-dock-console">{tuningInstrument}</div>}
              <div className="dt-head-r">
                {/* FIXED-SLOT strip (Principle 0 — grid-structured external, dynamic
                    internal): Clear filters, Clear selection, District, Export each hold a
                    PERMANENT slot in that reading order (§6 regroup: the two clears sit
                    together, then the District brush, then Export). State toggles their
                    ENABLED state in place (dimmed but present when inert, §4
                    disabled-may-drop-floor-but-readable); it never adds/removes an element,
                    so nothing reflows. Every control shares the §6 console-button chassis. */}
                {/* Two DISTINCT clears (Bug 2 / §6): FILTER (range or District, `anyFacet`)
                    vs SELECTION — disambiguated labels, identical pill treatment, each
                    disabled in place when its target is empty. `Clear filters` also clears
                    the metric-range narrowing (both are columnFilters). */}
                <button type="button" className="dt-facets-clear" onClick={clearFacets} disabled={!anyFacet}>
                  Clear filters
                </button>
                <button type="button" className="dt-clear" onClick={onClearSelection} disabled={!(selectionMode || singleRow)}>
                  Clear selection
                </button>
                {/* District facet (VIEW-only brush) — inert while a selection is active. */}
                <div className="dt-facets" role="group" aria-label="Filter the table">
                  {FACETS.map((f) => {
                    const shared = {
                      label: f.label,
                      options: facetOptions(f.id),
                      selected: facetValue(f.id),
                      labelOf: f.labelOf,
                      onToggle: (v) => toggleFacet(f.id, v),
                      disabled: selectionMode,
                    };
                    return f.control === "dropdown"
                      ? <FacetDropdown key={f.id} {...shared} />
                      : <FacetToggles key={f.id} {...shared} />;
                  })}
                </div>
                <ExportMenu onExport={onExport} year={year} years={years} selectedCount={selectedIds.length} />
              </div>
            </div>

            {/* ===== FOUR FIXED FRAMES — rail | table | trend | margin (§3.2/§4). ===== */}
            <div className="dt-grid">

              {/* ===== RAIL — the KPI stack (contract §4). C5 turns these into the
                  MEDIAN / MEAN·YOY / CONDO cards; C4 seats the existing vs-city
                  figures + the distribution histogram in the rail frame. ===== */}
              <div className="dt-slot dt-slot--rail">
                <KpiRail
                  selectionMode={selectionMode}
                  aggregate={aggregate}
                  singleRow={singleRow}
                  cityBaseline={cityBaseline}
                  metric={metric}
                  cityName={cityName}
                  dist={{
                    values: cityValues,
                    markers: selMarkers,
                    label: activeCol?.label ?? metricLabel,
                    fmt: activeCol?.fmt ?? ((v) => v),
                  }}
                />
              </div>

              {/* ===== TABLE — the compact spine table (centre column). The head
                  controls (metric chips · facets · × Clear · export) now live in the
                  console header bar above (C6). ===== */}
              <div className="dt-slot dt-slot--table">
                <div className="dt-scroll" ref={scrollRef}>
            <table className="dt-table">
              {/* Fixed chassis: explicit per-column widths (meta.width) in column
                  order, so table-layout:fixed gives a constant grid — columns
                  never reflow when values change or rows re-sort. [console-chassis] */}
              <colgroup>
                {table.getVisibleLeafColumns().map((col) => (
                  <col key={col.id} style={{ width: col.columnDef.meta?.width }} />
                ))}
              </colgroup>
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => {
                      const meta = header.column.columnDef.meta || {};
                      const sortable = header.column.getCanSort();
                      const sorted = header.column.getIsSorted(); // 'asc' | 'desc' | false
                      const ind = !sortable ? "" : sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "▾";
                      const active = meta.metricKey === metric;
                      return (
                        <th
                          key={header.id}
                          className={`${meta.numeric ? "numeric" : ""}${active ? " is-active-metric" : ""}`}
                          aria-sort={sortable ? (sorted ? (sorted === "asc" ? "ascending" : "descending") : "none") : undefined}
                          title={header.column.id === "rank" ? `City rank by ${metricLabel}` : undefined}
                        >
                          {sortable ? (
                            <button
                              type="button"
                              className="dt-th-btn"
                              onClick={header.column.getToggleSortingHandler()}
                              title="Sort"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span className={`dt-sort${sorted ? " active" : ""}`}>{ind}</span>
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {viewRows.length === 0 ? (
                  <tr>
                    <td colSpan={table.getVisibleLeafColumns().length} className="dt-empty">
                      No neighbourhoods match “{globalFilter}”.
                    </td>
                  </tr>
                ) : (
                  viewRows.map((row) => {
                    const id = row.original.id;
                    return (
                      <tr
                        key={id}
                        data-id={id}
                        className={`dt-row${selectedSet.has(String(id)) ? " is-selected" : ""}${selectionMode ? " dt-row--member" : ""}`}
                        onClick={() => onSelectRow(id)}
                        onMouseEnter={() => onHoverRow(id)}
                        onMouseLeave={() => onHoverRow(null)}
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta || {};
                          const active = meta.metricKey === metric;
                          const cls = [
                            meta.numeric ? "numeric" : "",
                            meta.className || "",
                            active ? "is-active-metric" : "",
                          ].filter(Boolean).join(" ");
                          return (
                            <td key={cell.id} className={cls}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
                </div>
              </div>

              {/* ===== TREND — the scope's active-metric trajectory (C8 builds the
                  full trend instrument: min–max envelope + dashed city baseline +
                  year cursor + labelled endpoints + YoY strip). ===== */}
              <div className="dt-slot dt-slot--trend">
                <TrendInstrument
                  label={activeCol?.label ?? metricLabel}
                  main={plotSeries}
                  city={selectionMode || singleRow ? cityLine : null}
                  envelope={trendEnvelope}
                  years={years}
                  activeIndex={activeIndex}
                  fmt={activeCol?.fmt ?? ((v) => v)}
                  scopeName={singleRow ? singleRow.name : selectionMode ? "Selection Mean" : cityName}
                  cityName={cityName}
                />
              </div>

            </div>
          </div>
        )}
      </div>

      {/* The metric-range slider's brain stays in THIS component (TanStack faceted
          bounds + setRange + the VIEW-only brush, all unchanged). Fix 4: it now renders
          INLINE inside the Tuning instrument (both docks above) instead of being portaled
          into the instrument column — the portal + its rack slot are retired. */}
    </section>
  );
}

// ---- Selection-vs-city comparison (D8 item 8) ------------------------------
// Each value card reads its SELECTION figure against the CITY baseline (the same
// honest parcel-weighted aggregate computed over every polygon). The comparison
// KIND differs by metric so the delta stays honest — a percent-of-a-percent on YoY
// would mislead, and a signed delta on a count is less meaningful than a share:
//   • level (mean / median $): relative delta (sel−city)/city → "+6.4%"
//   • rate  (YoY, already a %): pp difference  sel−city        → "+1.1pp"
//   • share (parcel count):     sel / city                     → "8% of city"
// These read the SELECTION channel only — never brushedIds (the VIEW-only fence).
function fmtSignedPct(ratio) {            // ratio is a fraction (0.064 → "+6.4%")
  const pct = ratio * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function fmtSignedPp(diff) {              // diff already in percentage points (0–100 scale)
  return (diff >= 0 ? "+" : "") + diff.toFixed(1) + "pp";
}
// ---- KPI RAIL (contract §4/§7) ---------------------------------------------
// The rail's four cards in FIXED order: MEDIAN → (MEAN or YOY) → CONDO → DISTRIBUTION.
// Card anatomy: small-caps label · big value · footer = city baseline on its OWN line (so
// "<City> $NNNk" renders in full — D-F3) + coloured delta. The CONDO card carries a
// secondary block (Mean excl.
// condo / Lot non-condo). Interiors by scope: N=0 city baselines (NO delta — the card
// IS the baseline); N=1 this neighbourhood vs city; N≥2 the parcel-weighted aggregate
// (§7); its honest-aggregate note lives once in About & tips. Deltas: level metrics
// relative %, YoY & condo in pp. Reads
// the SELECTION channel only — never brushedIds (the VIEW-only fence).
function signCls(n) { return n > 0 ? "dt-up" : n < 0 ? "dt-dn" : ""; }

function KpiRail({ selectionMode, aggregate: a, singleRow: r, cityBaseline: cb, metric, cityName, dist }) {
  const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
  const pctText = (x) => (x == null ? "—" : `${Math.round(x)}%`);

  // Resolve the scope's figures + per-figure honesty tags (N≥2 aggregate / N=1
  // this-nbhd / N=0 city baseline).
  let s;
  if (selectionMode && a) {
    s = { isCity: false,
          median: a.medianOfMedians, mean: a.parcelMean, yoy: a.areaYoY,
          condo: a.condoShare, mexcl: a.meanExclCondo, lot: a.lotNonCondo };
  } else if (r) {
    s = { isCity: false,
          median: num(r.median_assessvalue), mean: num(r.avall_public), yoy: num(r.yoy_pct_change),
          condo: num(r.pct_with_unit), mexcl: num(r.avg_assessvalue_without_unit), lot: num(r.avg_lotsize) };
  } else if (cb) {
    s = { isCity: true,
          median: cb.medianOfMedians, mean: cb.parcelMean, yoy: cb.areaYoY,
          condo: cb.condoShare, mexcl: cb.meanExclCondo, lot: cb.lotNonCondo };
  } else {
    return <p className="dt-vs-note">No data.</p>;
  }

  const city = cb || {};
  // Second card: the aggregate scope surfaces the EXACT parcel-weighted MEAN; browse /
  // single surfaces YOY (growth) — unless the ACTIVE metric is itself mean or yoy.
  const secondKey = metric === "yoy_pct_change" ? "yoy"
    : metric === "avall_public" ? "mean"
    : selectionMode ? "mean" : "yoy";

  // Deltas — null at city scope (the card IS the baseline). Level metrics: relative
  // %; YoY & condo share: percentage-point difference.
  const rel = (sel, c) => (!s.isCity && sel != null && c != null && c !== 0)
    ? { txt: fmtSignedPct((sel - c) / c), cls: COLOUR_LEVEL_DELTAS ? signCls(sel - c) : "" } : null;
  const pp = (sel, c) => (!s.isCity && sel != null && c != null)
    ? { txt: fmtSignedPp(sel - c), cls: signCls(sel - c) } : null;
  const cityTxt = (v, fmt) => (s.isCity || v == null ? null : `${cityName ?? "city"} ${fmt(v)}`);

  const cards = [];
  cards.push({
    key: "median", label: "Median", cityScope: s.isCity,
    city: cityTxt(city.medianOfMedians, fmtCurrencyShort),
    value: s.median != null ? fmtCurrencyShort(s.median) : "—",
    delta: rel(s.median, city.medianOfMedians),
  });
  cards.push(secondKey === "mean"
    ? { key: "mean", label: "Mean", cityScope: s.isCity,
        city: cityTxt(city.parcelMean, fmtCurrencyShort),
        value: s.mean != null ? fmtCurrencyShort(s.mean) : "—",
        delta: rel(s.mean, city.parcelMean) }
    // YoY carries its unit in the VALUE (this card's label is just "YoY", with no
    // room for "(Log Pts)"). The delta is log points too, NOT "pp": a percentage
    // point is the gap between two percentages, and these are not percentages
    // (METHODOLOGY.md D7). fmtLogPts is already signed, so it serves both.
    : { key: "yoy", label: "YoY", cityScope: s.isCity,
        city: cityTxt(city.areaYoY, fmtLogPts),
        value: s.yoy != null ? fmtLogPts(s.yoy) : "—", valueCls: signCls(s.yoy),
        delta: (!s.isCity && s.yoy != null && city.areaYoY != null)
          ? { txt: fmtLogPts(s.yoy - city.areaYoY), cls: signCls(s.yoy - city.areaYoY) } : null });
  // A4 — the CONDO card splits into two EQUAL square tiles (matching Median/Mean): the
  // vs-city SHARE (lens a) and the condo-stripped view (lens b, "Excluding Condos": the
  // mean value + lot), so neither is a wide rectangle.
  cards.push({
    key: "condo", label: "Condo", cityScope: s.isCity,
    city: s.isCity ? null : (city.condoShare != null ? `${cityName ?? "city"} ${pctText(city.condoShare)}` : null),
    value: pctText(s.condo), delta: pp(s.condo, city.condoShare),
  });
  cards.push({
    key: "exclcondo", label: "Excluding Condos",
    value: s.mexcl != null ? fmtCurrencyShort(s.mexcl) : "—",
    foot: `Lot ${s.lot != null ? `${Math.round(s.lot)} m²` : "—"}`,
  });

  return (
    <div className="dt-cards">
      {cards.map((c) => <KpiCard key={c.key} {...c} cityName={cityName} />)}
      {/* DISTRIBUTION — the 4th card: the citywide histogram with the selection marked. */}
      <div className="dt-card dt-card--dist">
        <div className="dt-card-hd">
          <span className="dt-card-l">Distribution{dist ? ` · ${dist.label}` : ""}</span>
        </div>
        <div className="dt-slot-body">
          {dist && (
            <DistributionStrip values={dist.values} markers={dist.markers} label={dist.label} fmt={dist.fmt} />
          )}
        </div>
      </div>
    </div>
  );
}

// One KPI square tile: label (+ honesty tag) · big value · footer. The footer is either
// the city baseline + coloured delta (standard tiles) OR a single `foot` string (the
// Excluding-Condos tile, whose footer is the non-condo lot). At city scope the label
// shows "· <City>" and no delta (it IS the baseline). Honest em-dashes on nulls.
function KpiCard({ label, city, value, valueCls, delta, cityScope, cityName, foot }) {
  return (
    <div className="dt-tile">
      {/* C1 — tile anatomy: label (top) · big value (centre) · footer (city baseline on its
          OWN line + coloured delta). D-F3: the per-card methodology tag was removed and the
          honest-aggregate disclosure now lives once in the column's About & tips popover;
          the freed footer space lets the "<City> $NNNk" baseline render in full. */}
      <div className="dt-tile-l">
        {label}{cityScope ? ` · ${cityName ?? "City"}` : ""}
      </div>
      <div className={`dt-tile-v${valueCls ? " " + valueCls : ""}`}>{value}</div>
      <div className="dt-tile-ft">
        {foot != null ? (
          <span className="dt-tile-foot">{foot}</span>
        ) : (
          <>
            {city != null && <span className="dt-tile-city">{city}</span>}
            {delta && <span className={`dt-tile-d ${delta.cls}`}>{delta.txt}</span>}
          </>
        )}
      </div>
    </div>
  );
}

// ---- Facet controls (D6) ---------------------------------------------------
// A multi-select facet dropdown built on a native <details> disclosure — legible
// and accessible with no custom open/close state. Options are data-driven; ticking
// one toggles it in/out of the column filter. Selected count shows on the summary.
function FacetDropdown({ label, options, selected, labelOf, onToggle, disabled = false }) {
  // A1 — a PORTALED dark menu (was a native <details> trapped in the console's
  // overflow:hidden with invisible light-shell option text). Mirrors ExportMenu: the
  // menu is portaled to <body> as position:fixed, anchored under the trigger and
  // flipping UP when the short console leaves no room below.
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      // Flip UP when a full-height menu would overflow the console bottom (the trigger
      // sits in the shallow console header). Opening upward puts the menu over the map,
      // clear of the console's stacking context, so it always reads.
      const MENU_W = 180; // .dt-facet-list min-width
      const flipUp = window.innerHeight - r.bottom < 340;
      // Right-anchor (open leftward) when a left-anchored menu would spill off the
      // right edge — District sits near the console's right edge after the regroup.
      const spillsRight = r.left + MENU_W > window.innerWidth - 8;
      const horiz = spillsRight
        ? { right: Math.round(window.innerWidth - r.right) }
        : { left: Math.round(r.left) };
      const vert = flipUp
        ? { bottom: Math.round(window.innerHeight - r.top + 6) }
        : { top: Math.round(r.bottom + 6) };
      setPos({ ...horiz, ...vert });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    const onScroll = () => setOpen(false);   // the fixed menu doesn't track scroll — close instead of drift
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <div className="dt-facet-dd" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`dt-facet-summary${open ? " is-open" : ""}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}{selected.length ? ` · ${selected.length}` : ""}
        <span className="dt-facet-caret" aria-hidden="true">▾</span>
      </button>
      {open && pos && createPortal(
        <div className="dt-facet-list" role="menu" ref={menuRef} style={{ position: "fixed", ...pos }}>
          {options.map((v) => (
            <label key={v} className="dt-facet-opt">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => onToggle(v)} />
              <span>{labelOf(v)}</span>
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// A multi-select facet rendered as toggle CHIPS (one per option) — for a small,
// stable option set (the polygon states). aria-pressed reflects each chip's on/off;
// clicking toggles it in the column filter. Default (nothing pressed) = all shown.
function FacetToggles({ label, options, selected, labelOf, onToggle }) {
  return (
    <div className="dt-facet-toggles" role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      {options.map((v) => {
        const on = selected.includes(v);
        return (
          <button
            key={v}
            type="button"
            className={`dt-facet-chip${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => onToggle(v)}
          >
            {labelOf(v)}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// The Tuning instrument (Fix 4) — horizontal Year (single) + Metric range (dual),
// docked in the Data Table spine (strip above the handle in View; console header in
// Analysis). Unmistakably-operable controls: end-labelled data bounds, calibration
// ticks below the track, an accent active-readout in a fixed slot. Honest affordance:
// Year snaps to discrete year ticks; the continuous metric glides over a ruler.
// =============================================================================

// ── Calibration ticks below a track — the "this axis has positions, drag it" signal
// (Fix 4). `count` marks spaced evenly 0→100%; `majorEvery` (0 = none) thickens every
// Nth. Data-driven count (year count for Year; a fixed ruler for the continuous metric).
function CalibTicks({ count, majorEvery = 0, ruler = false }) {
  const marks = [];
  for (let i = 0; i < count; i++) {
    const left = count === 1 ? 50 : (i / (count - 1)) * 100;
    marks.push(
      <i
        key={i}
        className={majorEvery && i % majorEvery === 0 ? "major" : undefined}
        style={{ left: `${left}%` }}
      />
    );
  }
  return <div className={`pa-tune-calib${ruler ? " ruler" : ""}`} aria-hidden="true">{marks}</div>;
}

// ── Year — SINGLE handle, snaps to discrete year ticks (step 1). Honest affordance:
// discrete years exist, so it snaps. Two-tier readout: the active year (accent, in a
// FIXED slot up top) vs the data-bound endpoints (muted, below the track). One tick per
// year — the ticks ARE the selectable values; the count is manifest-driven (a 2027
// refresh grows the track by one tick, no code change). slideYear throttle unchanged.
function YearSliderRow({ year, sliderYear, slideYear, yMin, yMax }) {
  const val = sliderYear ?? year ?? yMin;
  const pct = ((val - yMin) / ((yMax - yMin) || 1)) * 100;
  const nYears = Math.max(1, yMax - yMin + 1);
  return (
    <div className="pa-tune-ctrl">
      <div className="pa-tune-ctrl-head">
        <span className="pa-tune-ctrl-name">Year</span>
        <strong className="pa-tune-active">{val}</strong>
      </div>
      <div className="pa-tune-track-wrap">
        <input
          type="range"
          className="pa-slider pa-year-slider"
          aria-label="Year"
          min={yMin}
          max={yMax}
          step={1}
          value={val}
          style={{ "--pct": pct }}
          onChange={(e) => slideYear(Number(e.target.value))}
        />
        <CalibTicks count={nYears} majorEvery={5} />
      </div>
      <div className="pa-tune-ends"><span>{yMin}</span><span>{yMax}</span></div>
    </div>
  );
}

// ── Metric range — DUAL handle, continuous glide (NO snapping). Honest affordance: the
// metric is continuous, so the marks below are an evenly-spaced RULER (reference only) —
// they must NOT imply discrete stops. Two-tier readout: the active range (accent, FIXED
// slot) vs the data-bound min/max (muted, below). FIXED slot: when the range doesn't
// apply (selection mode) or bounds are degenerate, it renders INERT (dimmed) rather than
// null — the frame never reflows. The TanStack wiring (onChange → setFilterValue → the
// VIEW-only brush) is unchanged from the vertical version.
function RangeFacet({ label, fmt, bounds, value, onChange, disabled = false }) {
  const usable = bounds && bounds[0] !== bounds[1];
  const off = disabled || !usable;
  const [min, max] = usable ? bounds : [0, 1];
  const [lo, hi] = usable && value ? value : [min, max];
  const step = (max - min) / 100 || 1;
  const pct = (v) => `${((v - min) / (max - min || 1)) * 100}%`;
  return (
    <div className={`pa-tune-ctrl${off ? " is-off" : ""}`}>
      <div className="pa-tune-ctrl-head">
        <span className="pa-tune-ctrl-name">{label}</span>
        <strong className="pa-tune-active">{off ? "—" : `${fmt(lo)} – ${fmt(hi)}`}</strong>
      </div>
      <div className="pa-tune-track-wrap">
        <div className="pa-dual" style={{ "--lo": pct(lo), "--hi": pct(hi) }}>
          <div className="pa-dual-track" />
          <div className="pa-dual-fill" />
          {/* When the thumbs COINCIDE, only the top one is grabbable, so raise whichever
              must move to separate them: `lo` clamps to ≤ hi (can only go DOWN), `hi`
              clamps to ≥ lo (can only go UP). So raise lo in the upper half (recovers a
              stuck [max,max]) and leave hi on top otherwise (recovers [min,min]). */}
          <input
            type="range" className="pa-slider pa-dual-input pa-dual-lo"
            min={min} max={max} step={step} value={lo} disabled={off}
            style={{ zIndex: lo > (min + max) / 2 ? 3 : 1 }}
            aria-label={`${label} minimum`}
            onChange={(e) => onChange([Math.min(+e.target.value, hi), hi])}
          />
          <input
            type="range" className="pa-slider pa-dual-input pa-dual-hi"
            min={min} max={max} step={step} value={hi} disabled={off}
            style={{ zIndex: 2 }}
            aria-label={`${label} maximum`}
            onChange={(e) => onChange([lo, Math.max(+e.target.value, lo)])}
          />
        </div>
        <CalibTicks count={11} ruler />
      </div>
      <div className="pa-tune-ends"><span>{off ? "—" : fmt(min)}</span><span>{off ? "—" : fmt(max)}</span></div>
    </div>
  );
}
