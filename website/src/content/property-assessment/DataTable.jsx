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
//   onClearSelection (() => void)
//   onExport     (format) => void — scoped export (CSV/GeoJSON/PNG)
//   open         controlled: the table is raised (= analyst view)
//   onToggle     () => void — toggle the table / analyst view
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import Sparkline from "../../components/Sparkline.jsx";
import ExportMenu from "./ExportMenu.jsx";
import { METRICS } from "./choroplethStyle.js";
import {
  fmtArea,
  fmtCurrency,
  fmtCurrencyShort,
  fmtNumber,
  fmtPct,
  fmtYear,
} from "../../utils/format.js";

// Per-metric PRESENTATION for the dense table: a compact column label + compact
// formatter (e.g. $1.41M) that differ from the map's full label / formatter.
// Keyed by metric key; a metric with no entry falls back to its METRICS label/fmt.
const PRESENTATION = {
  median_assessvalue: { label: "Median value", fmt: fmtCurrencyShort },
  avall_public:       { label: "Mean value",   fmt: fmtCurrencyShort },
  avg_lotsize:        { label: "Lot size",     fmt: fmtArea },
  median_yearbuilt:   { label: "Year built",   fmt: fmtYear },
  yoy_pct_change:     { label: "YoY %",        fmt: fmtPct },
};

// The fixed metric columns, DERIVED from the map's canonical METRICS (one source
// of truth) in the same order — so a new map metric automatically gets a table
// column. PRESENTATION supplies the compact label/formatter; anything unlisted
// falls back to the metric's own label + formatter, so the column never silently
// vanishes.
const METRIC_COLS = METRICS.map((m) => ({
  key: m.key,
  label: PRESENTATION[m.key]?.label ?? m.label,
  fmt: PRESENTATION[m.key]?.fmt ?? m.fmt,
}));

export default function DataTable({
  rows,
  metric,
  metricLabel,
  activeIndex,
  year,
  years,
  selectedIds,
  onSelectRow,
  onHoverRow,
  aggregate,
  onClearSelection,
  onExport,
  open,
  onToggle,
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
  const scrollRef = useRef(null);

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

  // Column defs (data-driven). accessorFn maps null → undefined so TanStack's
  // sortUndefined keeps blanks last in BOTH directions; the cell renders "—".
  // `meta.metricKey` lets the renderer highlight the active metric's column.
  // Depends on activeIndex so the per-row Trend dots track the year slider.
  const columns = useMemo(() => [
    {
      accessorKey: "name",
      header: "Neighbourhood",
      cell: (info) => info.getValue(),
      meta: { className: "dt-name" },
    },
    ...METRIC_COLS.map((m) => ({
      id: m.key,
      accessorFn: (r) => r[m.key] ?? undefined,
      header: m.label,
      cell: (info) => {
        const v = info.getValue();
        return v == null ? "—" : m.fmt(v);
      },
      sortUndefined: "last",
      enableGlobalFilter: false,
      meta: { numeric: true, metricKey: m.key },
    })),
    {
      id: "trend",
      header: "Trend",
      enableSorting: false,
      enableGlobalFilter: false,
      cell: ({ row }) => (
        <Sparkline
          values={row.original.series}
          activeIndex={activeIndex}
          width={80}
          height={20}
          ariaLabel={`${row.original.name} ${metricLabel} trend`}
        />
      ),
      meta: { className: "dt-spark" },
    },
    {
      id: "rank",
      accessorFn: (r) => r.rank ?? undefined,
      header: "Rank",
      cell: (info) => {
        const v = info.getValue();
        return v == null ? "—" : v;
      },
      sortUndefined: "last",
      enableGlobalFilter: false,
      meta: { numeric: true },
    },
  ], [activeIndex, metricLabel]);

  // React Compiler can't memoize a component that calls useReactTable (TanStack
  // returns fresh functions each call); it safely skips this one — fine at 407 rows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    // Filtering applies to name only (the lone string column); suppress it in
    // selection mode so every constituent row stays visible under the aggregate.
    state: { sorting, globalFilter: selectionMode ? "" : globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const viewRows = table.getRowModel().rows;

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
  useEffect(() => {
    if (!open || selectedIds.length !== 1 || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-id="${CSS.escape(String(selectedIds[0]))}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIds, open, sorting, globalFilter, data]);

  return (
    <section className={`dt${open ? " dt--open" : ""}`} aria-label="Neighbourhood data table">
      <button
        type="button"
        className="dt-handle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="dt-handle-title">Data table</span>
        <span className="dt-handle-meta">
          {selectionMode
            ? `${aggregate.nSelected} selected`
            : `${rows.length} · ${open ? "Analyst view" : "Analyst view · press T"}`}
        </span>
        <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      {open && (
        <div className="dt-panel">
          {selectionMode ? (
            <AggregateHeader aggregate={aggregate} onClear={onClearSelection} onExport={onExport} year={year} years={years} />
          ) : (
            <div className="dt-toolbar">
              <input
                type="text"
                className="dt-filter search-input"
                placeholder="Filter by name…"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                aria-label="Filter neighbourhoods by name"
              />
              <span className="dt-count">{viewRows.length} of {rows.length}</span>
              <ExportMenu onExport={onExport} year={year} years={years} selectedCount={selectedIds.length} />
            </div>
          )}

          <div className="dt-scroll" ref={scrollRef}>
            <table className="dt-table">
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
                          aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
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
                    <td colSpan={columns.length} className="dt-empty">
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
                        className={`dt-row${selectedSet.has(String(id)) ? " is-selected" : ""}`}
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
      )}
    </section>
  );
}

// ---- Selection-mode aggregate header (C3) ----------------------------------
// Honest area summary: the EXACT cards (count, total parcels, parcel-weighted
// mean) are unlabelled; the APPROXIMATE ones (median, YoY) carry a "≈" tag and
// the note explains why (no parcel data in-browser). The constituent rows below
// make the rolled-up numbers auditable. NOTE: deliberately NOT a TanStack
// aggregationFn — a parcel-weighted mean must weight by n_properties, which the
// built-in (unweighted) mean can't do; the honest math lives in selectionAggregate.
function AggregateHeader({ aggregate: a, onClear, onExport, year, years }) {
  return (
    <div className="dt-agg">
      <div className="dt-agg-bar">
        <strong className="dt-agg-title">{a.nSelected} neighbourhoods selected</strong>
        <div className="dt-agg-actions">
          <button type="button" className="dt-agg-clear" onClick={onClear}>Clear selection</button>
          <ExportMenu onExport={onExport} year={year} years={years} selectedCount={a.nSelected} />
        </div>
      </div>
      <div className="dt-agg-cards">
        <AggCard label="Total parcels" value={fmtNumber(a.totalParcels)} tag="exact" />
        <AggCard label="Mean assessed" value={fmtCurrency(a.parcelMean)} tag="parcel-weighted · exact" />
        <AggCard label="Median assessed" value={fmtCurrency(a.medianOfMedians)} tag="≈ median of medians" approx />
        <AggCard label="YoY change" value={fmtPct(a.areaYoY)} tag="≈ parcel-weighted" approx />
      </div>
      <p className="dt-agg-note">
        {a.nReportable} reportable · {a.nSuppressed} suppressed · {a.nExcluded} non-residential / no-data
        (excluded from values). Mean is parcel-exact; the median is a median of neighbourhood medians
        and YoY is parcel-weighted across neighbourhoods — both are approximations (no parcel-level
        data in the browser).
      </p>
    </div>
  );
}

function AggCard({ label, value, tag, approx = false }) {
  return (
    <div className={`dt-card${approx ? " is-approx" : ""}`}>
      <span className="dt-card-label">{label}</span>
      <span className="dt-card-value">{value}</span>
      <span className="dt-card-tag">{tag}</span>
    </div>
  );
}
