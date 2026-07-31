// =============================================================================
// PermitDataConsole.jsx
//
// The Dwelling Units analyst "Data Console" (Analysis mode) — DU's equivalent of PA's
// DataTable. Composed from the SHARED console leaves (components/consoleControls,
// consoleTable, DistributionStrip, TrendInstrument, ExportMenu) + DU-specific config
// (5 columns, a SUM aggregate, 4 KPI cards). Mirrors PA's dock mechanics (grid-rows
// 0fr↔1fr rise/collapse, Press-T, scroll-to-selected-row) + its scope precedence
// (selection N≥2 → single N=1 → district facet → city).
//
// Leaner than PA by data: no condo, no mean-vs-median split, no YoY piecewise scale
// (every DU metric is linear). Reportable-only scope everywhere (the aggregate matches
// the map + table + distribution).
// =============================================================================

import { useEffect, useMemo, useRef, useState, memo } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getFacetedRowModel, getFacetedUniqueValues, getFacetedMinMaxValues, flexRender,
} from "@tanstack/react-table";

import SegmentedControl from "../../components/SegmentedControl.jsx";
import Sparkline from "../../components/Sparkline.jsx";
import { KpiCard, YearSliderRow, RangeFacet, FacetDropdown } from "../../components/consoleControls.jsx";
import DistributionStrip from "../../components/DistributionStrip.jsx";
import TrendInstrument from "../../components/TrendInstrument.jsx";
import ExportMenu from "../../components/ExportMenu.jsx";
import {
  rangeFilter, multiSelectFilter, EMPTY_COLUMN_FILTERS, useRenderStormGuard, linearScale, quantileScale,
} from "../../components/consoleTable.js";
import { fmtNumber, fmtCurrencyShort } from "../../utils/format.js";
import { reduceMotion, DUR_BASE } from "../../components/motion.js";

// ── DU column presentation. The 4 MAP metrics are keyed by metric key (so the active-
// metric highlight + the range facet target the right column); median_cv is a table-ONLY
// column (like PA's Year Built), never a map metric. name + 5 + trend = 100%.
const COL_WIDTH = { name: "24%", metric: "13%", trend: "11%" };
// Per-metric presentation: table header (compact, carries the unit) + full/cell formatter.
const DU_COLS = {
  permit_count:       { key: "permit_count",       label: "Permit Count",         header: "Permits",   fmt: fmtNumber,        cellFmt: fmtNumber },
  construction_value: { key: "construction_value", label: "Construction Value",   header: "Constr.",   fmt: fmtCurrencyShort, cellFmt: fmtCurrencyShort },
  units_added:        { key: "units_added",        label: "Dwellings Added",      header: "Added",     fmt: fmtNumber,        cellFmt: fmtNumber },
  units_demolished:   { key: "units_demolished",   label: "Dwellings Demolished", header: "Demol.",    fmt: fmtNumber,        cellFmt: fmtNumber },
};
// The 5 table columns in order (the 4 metrics + the table-only median).
const TABLE_METRIC_COLS = ["permit_count", "construction_value", "units_added", "units_demolished"];
const MEDIAN_COL = { key: "median_cv", header: "Median", cellFmt: fmtCurrencyShort };

// Categorical facet — District (data-driven from the rows). A SCOPE (drives the map dim
// + the KPI/trend/export), matching PA §122.
const FACETS = [{ id: "district", label: "District", labelOf: (v) => v }];

// Per-row Trend sparkline (active metric across years). memo'd so a re-sort / hover is 0
// re-renders; only a metric/series change rebuilds it. All DU metrics are sequential, so
// the stroke reads direction by endpoints (up/down/flat).
const PermitTrendCell = memo(function PermitTrendCell({ series }) {
  const nums = (series ?? []).map((v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v));
  const finite = nums.filter((v) => v != null);
  if (finite.length < 2) return <span className="dt-spark-empty">—</span>;
  const dir = finite[finite.length - 1] - finite[0];
  const stroke = dir > 0 ? "var(--pa-up)" : dir < 0 ? "var(--pa-dn)" : "var(--pa-dim)";
  return <Sparkline values={nums} stroke={stroke} width={44} height={12} activeIndex={-1} ariaLabel="Trend" />;
});

// A signed percent for the YoY card VALUE: "+12.4%", coloured up/down. null → null.
// (DU's permit-count YoY is a true Σthis/Σprev−1 rate, so the value IS a percent — unlike
// PA's log-points.)
function signedPct(v, digits = 1) {
  if (v == null || !Number.isFinite(+v)) return null;
  const n = +v * 100;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}
// A signed percentage-POINT delta: "+1.7pp" — NO % (a pp is the gap between two percentages,
// so it never carries a percent sign; §2.104. The former "+1.7% pp" double-unit was a defect).
function signedPp(v, digits = 1) {
  if (v == null || !Number.isFinite(+v)) return null;
  const n = +v * 100;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}pp`;
}
const signClass = (v) => (v > 0 ? "dt-up" : v < 0 ? "dt-dn" : "");

// ── The KPI rail — 4 DU cards (Permits · Construction Value · Net Units · YoY) +
// Distribution. Scope precedence: selection (N≥2) → single (N=1) → facet → city; each
// non-city scope shows a delta vs the city baseline. All display; the sums come pre-
// computed from aggregatePermitFeatures.
function PermitKpiRail({ scope, cityBaseline, cityScope, cityName, dist }) {
  if (!scope) return null;
  // % of city for an extensive total (share); null at city scope or when the city total is 0.
  const share = (v, base) =>
    cityScope || base == null || base === 0 ? null
    : { txt: `${((v / base) * 100).toFixed(1)}% of city`, cls: "" };
  const yoyDeltaPp =
    cityScope || scope.areaYoYPermits == null || cityBaseline?.areaYoYPermits == null ? null
    : { txt: signedPp(scope.areaYoYPermits - cityBaseline.areaYoYPermits, 1),
        cls: signClass(scope.areaYoYPermits - cityBaseline.areaYoYPermits) };

  const cityTxt = (v, fmt) => (cityScope || v == null ? null : `${cityName ?? "city"} ${fmt(v)}`);

  return (
    <div className="dt-cards">
      <KpiCard
        label="Permits" cityScope={cityScope} cityName={cityName}
        value={fmtNumber(scope.sumPermits)}
        city={cityTxt(cityBaseline?.sumPermits, fmtNumber)}
        delta={share(scope.sumPermits, cityBaseline?.sumPermits)}
      />
      <KpiCard
        label="Construction Value" cityScope={cityScope} cityName={cityName}
        value={fmtCurrencyShort(scope.sumConstructionValue)}
        foot={scope.medianOfMedianCV != null
          ? `Median ≈ ${fmtCurrencyShort(scope.medianOfMedianCV)}`
          : "Median —"}
      />
      <KpiCard
        label="Net Units" cityScope={cityScope} cityName={cityName}
        value={fmtNumber(scope.netUnits)}
        foot={`Added ${fmtNumber(scope.sumUnitsAdded)} · Demol. ${fmtNumber(scope.sumUnitsDemolished)}`}
      />
      <KpiCard
        label="YoY (Permits)" cityScope={cityScope} cityName={cityName}
        value={signedPct(scope.areaYoYPermits) ?? "—"}
        valueCls={scope.areaYoYPermits != null ? signClass(scope.areaYoYPermits) : ""}
        city={cityScope || cityBaseline?.areaYoYPermits == null ? null : `${cityName ?? "city"} ${signedPct(cityBaseline.areaYoYPermits)}`}
        delta={yoyDeltaPp}
      />
      {/* DISTRIBUTION — the citywide histogram with the SCOPE marked (a selection or a
          District view). Same frame PA uses (.dt-card--dist). */}
      <div className="dt-card dt-card--dist">
        <div className="dt-card-hd">
          <span className="dt-card-l">Distribution{dist ? ` · ${dist.label}` : ""}</span>
        </div>
        <div className="dt-slot-body">
          <DistributionStrip
            values={dist.values} markers={dist.markers} scopeKind={dist.scopeKind}
            label={dist.label} fmt={dist.fmt}
          />
        </div>
      </div>
    </div>
  );
}

export default function PermitDataConsole({
  rows, metric, metricLabel, metrics, onMetricChange,
  cityName, activeIndex, year, years, sliderYear, slideYear,
  selectedIds, singleAggregate, aggregate, facetAggregate, cityBaseline,
  onSelectRow, onHoverRow, onClearSelection, onExport, onBrush,
  open, onToggle, globalFilter, onGlobalFilterChange,
}) {
  const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
  const [columnFilters, setColumnFilters] = useState([]);
  const scrollRef = useRef(null);
  useRenderStormGuard("PermitDataConsole");

  // Panel mount/expand (grid-rows 0fr↔1fr rise/collapse) — the heavy table mounts only
  // while open or mid-collapse. Mirrors PA exactly.
  const [panelMounted, setPanelMounted] = useState(open);
  const [panelExpanded, setPanelExpanded] = useState(open);
  useEffect(() => {
    if (open) {
      setPanelMounted(true);
      const raf = requestAnimationFrame(() => setPanelExpanded(true));
      return () => cancelAnimationFrame(raf);
    }
    setPanelExpanded(false);
    const t = setTimeout(() => setPanelMounted(false), reduceMotion() ? 0 : DUR_BASE + 60);
    return () => clearTimeout(t);
  }, [open]);

  const selectionMode = !!aggregate;
  const anyFacet = columnFilters.length > 0;
  const districtFacet = useMemo(
    () => columnFilters.some((f) => FACETS.some((d) => d.id === f.id)), [columnFilters]);
  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  // In selection mode the table is just the selected constituents.
  const data = useMemo(() => {
    if (!selectionMode) return rows;
    return rows.filter((r) => selectedSet.has(String(r.id)));
  }, [rows, selectionMode, selectedSet]);

  const singleRow = useMemo(
    () => (selectedIds.length === 1 ? rows.find((r) => String(r.id) === String(selectedIds[0])) : null),
    [selectedIds, rows]);

  // Distribution bars = the city's reportable active-metric values (always). The scope is
  // marked INSIDE — see scopeMarks.
  const cityValues = useMemo(
    () => rows.map((r) => r[metric]).filter((v) => v != null), [rows, metric]);

  // Column defs (STATIC). Metric cols keyed by metric key; median_cv table-only; trend; name;
  // hidden district facet.
  const columns = useMemo(() => {
    const metricCol = (key) => {
      const c = DU_COLS[key];
      return {
        id: key,
        accessorFn: (r) => r[key] ?? undefined,
        header: c.header,
        cell: (info) => { const v = info.getValue(); return v == null ? "—" : c.cellFmt(v); },
        sortUndefined: "last",
        enableGlobalFilter: false,
        filterFn: rangeFilter,   // the range facet targets the ACTIVE metric's column
        meta: { numeric: true, metricKey: key, width: COL_WIDTH.metric },
      };
    };
    const medianCol = {
      id: MEDIAN_COL.key,
      accessorFn: (r) => r[MEDIAN_COL.key] ?? undefined,
      header: MEDIAN_COL.header,
      cell: (info) => { const v = info.getValue(); return v == null ? "—" : MEDIAN_COL.cellFmt(v); },
      sortUndefined: "last",
      enableGlobalFilter: false,
      meta: { numeric: true, width: COL_WIDTH.metric },   // table-only: no metricKey, no filter
    };
    const trendCol = {
      id: "trend", header: "Trend", enableSorting: false, enableGlobalFilter: false,
      cell: (info) => <PermitTrendCell series={info.row.original.series} />,
      meta: { numeric: true, width: COL_WIDTH.trend },
    };
    return [
      {
        accessorKey: "name",
        header: "Neighbourhood",
        cell: (info) => <span title={info.getValue()}>{info.getValue()}</span>,
        meta: { className: "dt-name", width: COL_WIDTH.name },
      },
      ...TABLE_METRIC_COLS.map(metricCol),
      medianCol,
      trendCol,
      ...FACETS.map((f) => ({
        id: f.id, accessorFn: (r) => r[f.id],
        filterFn: multiSelectFilter, enableSorting: false, enableGlobalFilter: false,
      })),
    ];
  }, []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data, columns,
    meta: { metric },
    state: {
      sorting,
      globalFilter: selectionMode ? "" : globalFilter,
      columnFilters: selectionMode ? EMPTY_COLUMN_FILTERS : columnFilters,
    },
    initialState: { columnVisibility: Object.fromEntries(FACETS.map((f) => [f.id, false])) },
    onSortingChange: setSorting,
    onGlobalFilterChange,
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

  // Trend plot series — the single row's active-metric series (N=1), else the per-year
  // MEAN across the scope rows (selection → facet view → city).
  const plotSeries = useMemo(() => {
    if (!years.length) return [];
    if (singleRow) return singleRow.series ?? [];
    const src = selectionMode ? data : viewRows.map((vr) => vr.original);
    return years.map((_, i) => {
      const vals = src.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  }, [singleRow, selectionMode, data, viewRows, years]);

  const cityLine = useMemo(
    () => years.map((_, i) => {
      const vals = rows.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }), [rows, years]);
  const trendEnvelope = useMemo(() => {
    if (!selectionMode) return null;
    return years.map((_, i) => {
      const vals = data.map((r) => r.series?.[i]).filter((v) => v != null);
      return vals.length ? [Math.min(...vals), Math.max(...vals)] : null;
    });
  }, [selectionMode, data, years]);

  // Distribution scope marks — selection (N≥2) → single (N=1) → district view → none.
  // The metric-range facet does NOT mark (it filters on the histogram's own axis).
  const scopeMarks = useMemo(() => {
    const valuesOf = (src) => src.map((r) => r[metric]).filter((v) => v != null);
    if (singleRow) return { marks: valuesOf([singleRow]), kind: "selected" };
    if (selectionMode) return { marks: valuesOf(data), kind: "selected" };
    if (districtFacet) return { marks: valuesOf(viewRows.map((vr) => vr.original)), kind: "filtered" };
    return { marks: [], kind: null };
  }, [singleRow, selectionMode, data, districtFacet, viewRows, metric]);

  const scopeTitle = selectionMode
    ? `${aggregate.nReportable + (aggregate.nSuppressed ?? 0) + (aggregate.nExcluded ?? 0)} Neighbourhoods Selected`
    : singleRow ? singleRow.name
    : viewRows.length < rows.length ? `${viewRows.length} Of ${rows.length} Neighbourhoods`
    : `All ${rows.length} Neighbourhoods`;

  // ── Facet helpers (District) — generic over FACETS, reading/writing the hidden column.
  const facetValue = (id) => table.getColumn(id)?.getFilterValue() ?? [];
  const facetOptionsAll = useMemo(() => {
    const out = {};
    for (const f of FACETS) out[f.id] = [...new Set(rows.map((r) => r[f.id]).filter((v) => v != null))].sort();
    return out;
  }, [rows]);
  const facetOptions = (id) => facetOptionsAll[id] ?? [];
  function toggleFacet(id, v) {
    const cur = facetValue(id);
    table.getColumn(id)?.setFilterValue(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  }

  // ── Metric-range facet (targets the active metric's column).
  const activeCol = DU_COLS[metric];
  const rangeValue = table.getColumn(metric)?.getFilterValue();
  // Panel-wide (YEAR-INVARIANT) range track — a FIXED frame (Principle 0: the track never
  // resizes with the year, so a filter set in one year means the same thing in every year).
  // The SHAPE of the track is metric-dependent:
  //   • construction value — QUANTILE. Its values span ~4 orders of magnitude ($0–$395M,
  //     median only $2.28M), so a linear track jams the bulk into the left edge and can't
  //     separate neighbourhoods. quantileScale lays it out by PERCENTILE (equal drag = an
  //     equal SHARE of neighbourhoods), ends at p2/p98, median at the detent.
  //   • every other metric (permit count, dwellings added/demolished) — modest range, so a
  //     LINEAR track between the p2/p98 ends is honest and evenly spaced (outlier-trimmed so
  //     neither a lone $0 nor a lone outlier dominates).
  // Both read from `series` (the active metric across ALL years), so the frame is
  // year-invariant by construction; values outside [p2, p98] clamp to the ends and still
  // SHOW when the range is at full (the full-range = no-filter rule includes them).
  const rangeScale = useMemo(() => {
    const vals = [];
    for (const r of rows) for (const v of r.series ?? []) if (v != null && Number.isFinite(v)) vals.push(v);
    if (vals.length < 2) return null;
    vals.sort((a, b) => a - b);
    if (metric === "construction_value") return quantileScale(vals);
    const q = (pp) => vals[Math.min(vals.length - 1, Math.max(0, Math.round((vals.length - 1) * pp)))];
    const min = q(0.02);   // p2 — the distribution's low bound (excludes $0-value edge cases)
    const max = q(0.98);   // p98 — outlier-robust high bound
    return min >= max ? null : linearScale(min, max);
    // rows recomputes per year but `series` is year-invariant, so the bounds are STABLE.
  }, [metric, rows]);
  const setRange = ([lo, hi]) => {
    if (!rangeScale) return;
    const full = lo <= rangeScale.min && hi >= rangeScale.max;
    table.getColumn(metric)?.setFilterValue(full ? undefined : [lo, hi]);
  };
  // On a metric switch, drop any range filter left on a DIFFERENT metric (units differ).
  useEffect(() => {
    setColumnFilters((prev) => prev.filter((cf) => !DU_COLS[cf.id] || cf.id === metric));
  }, [metric]);

  const searchActive = !!globalFilter;
  const anyNarrowing = anyFacet || searchActive;
  const clearFacets = () => { setColumnFilters([]); onGlobalFilterChange?.(""); };

  // ── Brush (District facet → map dim + KPI/trend/export scope) — throttled report up.
  const brushActive = !selectionMode && anyFacet;
  const brushedIds = useMemo(
    () => (brushActive ? viewRows.map((r) => r.original.id) : null), [brushActive, viewRows]);
  const lastBrushSig = useRef("");
  const lastBrushAt = useRef(0);
  const brushTrailing = useRef(null);
  useEffect(() => () => clearTimeout(brushTrailing.current), []);
  useEffect(() => {
    const sig = brushedIds ? [...brushedIds].map(String).sort().join(",") : "";
    if (sig === lastBrushSig.current) return;
    const fire = () => { lastBrushSig.current = sig; lastBrushAt.current = performance.now(); onBrush?.(brushedIds); };
    clearTimeout(brushTrailing.current);
    const BRUSH_GAP = 100;
    const since = performance.now() - lastBrushAt.current;
    if (since >= BRUSH_GAP) fire();
    else brushTrailing.current = setTimeout(fire, BRUSH_GAP - since);
  }, [brushedIds, onBrush]);

  // Press-T toggles the console (ignored while typing).
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

  // Scroll the single-selected row into view when the table is open.
  useEffect(() => {
    if (!open || selectedIds.length !== 1 || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-id="${CSS.escape(String(selectedIds[0]))}"]`);
    row?.scrollIntoView({ block: "start" });
  }, [selectedIds, open, sorting, globalFilter, data, panelMounted]);

  // ── KPI scope (precedence): selection (N≥2) → single (N=1) → facet → city.
  const kpiScope = aggregate ?? singleAggregate ?? facetAggregate ?? cityBaseline;
  const cityScope = !aggregate && !singleAggregate && !facetAggregate;

  // ── The Tuning instrument — Year (single) + Metric range (dual). Rendered in ONE dock
  // (strip above the handle when down; console header when up).
  const yMin = years?.length ? Math.min(...years) : 0;
  const yMax = years?.length ? Math.max(...years) : 1;
  const tuningInstrument = (
    <div className="pa-tune-instrument" role="group" aria-label="Year and value range">
      <YearSliderRow year={year} sliderYear={sliderYear} slideYear={slideYear} yMin={yMin} yMax={yMax} />
      <div className="pa-tune-divider" aria-hidden="true" />
      <RangeFacet
        label={activeCol?.header ?? metricLabel}
        fmt={activeCol?.fmt ?? ((v) => v)}
        scale={rangeScale} value={rangeValue} onChange={setRange} disabled={selectionMode}
      />
    </div>
  );

  return (
    <section className="dt" aria-label="Neighbourhood data console">
      {!open && <div className="pa-tune-dock pa-tune-dock-strip">{tuningInstrument}</div>}
      {/* §6 button form (2026-07-31) — icon + label, teal when open, T in the tooltip.
          The selection count stays (live feedback); "Press T" moved into the tooltip. */}
      <button type="button" className="dt-handle" onClick={onToggle} aria-expanded={open}
              title="Data Console (T)">
        <svg className="dt-handle-icon" width="15" height="15" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
             strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <line x1="3" y1="9.5" x2="21" y2="9.5" />
          <line x1="9" y1="9.5" x2="9" y2="20" />
        </svg>
        <span className="dt-handle-title">Data Console</span>
        {selectionMode && (
          <span className="dt-handle-meta dt-handle-sel">{data.length} selected</span>
        )}
        <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      <div className={`dt-panel-wrap${panelExpanded ? " is-open" : ""}`}>
        {panelMounted && (
          <div className="dt-panel">
            {/* HEADER — scope title + metric chips (left) · tuning (when open) · clears +
                district + export (right). Metric chips re-home here when the console is up. */}
            <div className="dt-head">
              <div className="dt-head-l">
                <span className="dt-scope">{scopeTitle}</span>
                {metrics && onMetricChange && (
                  <div className="dt-metric">
                    <SegmentedControl
                      label="Metric"
                      options={metrics.map((m) => ({ key: m.key, label: DU_COLS[m.key]?.label ?? m.label }))}
                      value={metric} onChange={onMetricChange}
                    />
                  </div>
                )}
              </div>
              {open && <div className="pa-tune-dock pa-tune-dock-console">{tuningInstrument}</div>}
              <div className="dt-head-r">
                <button type="button" className="dt-facets-clear" onClick={clearFacets} disabled={!anyNarrowing}>
                  Clear filters
                </button>
                <button type="button" className="dt-clear" onClick={onClearSelection} disabled={!(selectionMode || singleRow)}>
                  Clear selection
                </button>
                <div className="dt-facets" role="group" aria-label="Filter the table">
                  {FACETS.map((f) => (
                    <FacetDropdown key={f.id}
                      label={f.label} options={facetOptions(f.id)} selected={facetValue(f.id)}
                      labelOf={f.labelOf} onToggle={(v) => toggleFacet(f.id, v)} disabled={selectionMode} />
                  ))}
                </div>
                <ExportMenu
                  onExport={onExport} year={year} years={years}
                  scopeCount={selectedIds.length || (viewRows.length < rows.length ? viewRows.length : 0)}
                  scopeKind={selectedIds.length ? "selected" : viewRows.length < rows.length ? "filtered" : null}
                />
              </div>
            </div>

            {/* FOUR FRAMES — rail | table | trend. */}
            <div className="dt-grid">
              <div className="dt-slot dt-slot--rail">
                <PermitKpiRail
                  scope={kpiScope} cityBaseline={cityBaseline} cityScope={cityScope} cityName={cityName}
                  dist={{
                    values: cityValues, markers: scopeMarks.marks, scopeKind: scopeMarks.kind,
                    label: activeCol?.label ?? metricLabel, fmt: activeCol?.fmt ?? ((v) => v),
                  }}
                />
              </div>

              <div className="dt-slot dt-slot--table">
                <div className="dt-scroll" ref={scrollRef}>
                  <table className="dt-table">
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
                            const sorted = header.column.getIsSorted();
                            const ind = !sortable ? "" : sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "▾";
                            const active = meta.metricKey === metric;
                            return (
                              <th key={header.id}
                                className={`${meta.numeric ? "numeric" : ""}${active ? " is-active-metric" : ""}`}
                                aria-sort={sortable ? (sorted ? (sorted === "asc" ? "ascending" : "descending") : "none") : undefined}>
                                {sortable ? (
                                  <button type="button" className="dt-th-btn" onClick={header.column.getToggleSortingHandler()} title="Sort">
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
                            {globalFilter
                              ? <>No neighbourhoods match “{globalFilter}”.</>
                              : "No neighbourhoods match the current filters."}
                          </td>
                        </tr>
                      ) : (
                        viewRows.map((row) => {
                          const id = row.original.id;
                          return (
                            <tr key={id} data-id={id}
                              className={`dt-row${selectedSet.has(String(id)) ? " is-selected" : ""}${selectionMode ? " dt-row--member" : ""}`}
                              onClick={() => onSelectRow(id)}
                              onMouseEnter={() => onHoverRow(id)}
                              onMouseLeave={() => onHoverRow(null)}>
                              {row.getVisibleCells().map((cell) => {
                                const meta = cell.column.columnDef.meta || {};
                                const active = meta.metricKey === metric;
                                const cls = [meta.numeric ? "numeric" : "", meta.className || "", active ? "is-active-metric" : ""].filter(Boolean).join(" ");
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

              <div className="dt-slot dt-slot--trend">
                <TrendInstrument
                  label={activeCol?.label ?? metricLabel}
                  main={plotSeries}
                  city={selectionMode || singleRow ? cityLine : null}
                  envelope={trendEnvelope}
                  years={years} activeIndex={activeIndex}
                  fmt={activeCol?.fmt ?? ((v) => v)}
                  scopeName={singleRow ? singleRow.name : selectionMode ? "Selection Mean" : cityName}
                  cityName={cityName}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
