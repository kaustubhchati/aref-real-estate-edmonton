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
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
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
import Sparkline from "../../components/Sparkline.jsx";
import DistributionStrip from "./DistributionStrip.jsx";
import ExportMenu from "./ExportMenu.jsx";
import { METRICS, STATE_STYLE } from "./choroplethStyle.js";
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
// The metric column ids — the range facet targets the ACTIVE one; on a metric
// switch we drop any range filter left on a different metric (units differ).
const METRIC_KEYS = new Set(METRIC_COLS.map((m) => m.key));

// Categorical facets (D6) — VIEW-only table filters, data-driven from the rows.
// Each is a HIDDEN column (a faceting/filtering accessor that is never rendered) +
// a control in the dock header, declared once here and mapped in a loop. `labelOf`
// maps a raw value to its display label: district shows as-is; polygon_state uses
// the existing STATE_STYLE contract (compact form, no hardcoded state list).
const FACETS = [
  { id: "district", label: "District", control: "dropdown", labelOf: (v) => v },
  {
    id: "state", label: "State", control: "toggles",
    labelOf: (v) => STATE_STYLE[v]?.label.split(" (")[0] ?? v,
  },
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
  activeIndex,
  year,
  years,
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
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState([{ id: "name", desc: false }]);
  const [columnFilters, setColumnFilters] = useState([]); // categorical facets (D6)
  const scrollRef = useRef(null);
  useRenderStormGuard("DataTable"); // dev-only: screams if an unstable ref re-storms (D9)

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

  // The selected set's ACTIVE-metric values, for the distribution strip (item 9).
  // Read off the constituent rows (every metric value rides on the row), reportable
  // only (null = suppressed / non-residential, no value). Re-derives on selection
  // change (data) AND metric switch (metric) — refresh-by-design, no literals. The
  // strip reads the SELECTION channel only (data is the selected constituents) —
  // never brushedIds (the VIEW-only fence).
  const distValues = useMemo(
    () => (selectionMode ? data.map((r) => r[metric]).filter((v) => v != null) : []),
    [selectionMode, data, metric]
  );

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
      filterFn: rangeFilter,   // the metric-range facet targets the ACTIVE metric's column
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
  ], [activeIndex, metricLabel]);

  // React Compiler can't memoize a component that calls useReactTable (TanStack
  // returns fresh functions each call); it safely skips this one — fine at 407 rows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
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
    onGlobalFilterChange: setGlobalFilter,
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
  const activeCol = METRIC_COLS.find((m) => m.key === metric);
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
            <AggregateHeader
              aggregate={aggregate}
              cityBaseline={cityBaseline}
              distValues={distValues}
              distLabel={activeCol?.label ?? metricLabel}
              distFmt={activeCol?.fmt ?? ((v) => v)}
              onClear={onClearSelection}
              onExport={onExport}
              year={year}
              years={years}
            />
          ) : (
            <>
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
              {/* Categorical facets (D6) — VIEW-only display filters over the table,
                  rendered from the FACETS config: a dropdown or toggle chips per the
                  facet's `control` (one path, no copy-pasted blocks). */}
              <div className="dt-facets" role="group" aria-label="Filter the table">
                {FACETS.map((f) => {
                  const shared = {
                    label: f.label,
                    options: facetOptions(f.id),
                    selected: facetValue(f.id),
                    labelOf: f.labelOf,
                    onToggle: (v) => toggleFacet(f.id, v),
                  };
                  return f.control === "dropdown"
                    ? <FacetDropdown key={f.id} {...shared} />
                    : <FacetToggles key={f.id} {...shared} />;
                })}
                {/* Metric-range facet — on the active metric; bounds re-derive on
                    metric switch (refresh-by-design). */}
                <RangeFacet
                  label={activeCol?.label ?? metricLabel}
                  fmt={activeCol?.fmt ?? ((v) => v)}
                  bounds={rangeBounds}
                  value={rangeValue}
                  onChange={setRange}
                />
                {anyFacet && (
                  <button type="button" className="dt-facets-clear" onClick={clearFacets}>
                    Clear filters
                  </button>
                )}
              </div>
            </>
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
function fmtSharePct(frac) {              // frac = sel/city → "8% of city" / "<1%" / "0%"
  const pct = frac * 100;
  const s = pct === 0 ? "0" : pct < 1 ? "<1" : String(Math.round(pct));
  return `${s}% of city`;
}

// ---- Selection-mode aggregate header (C3 + D8 item 8) ----------------------
// Honest area summary: the EXACT cards (count, total parcels, parcel-weighted
// mean) are unlabelled; the APPROXIMATE ones (median, YoY) carry a "≈" tag and
// the note explains why (no parcel data in-browser). Each value card now also
// carries a "vs city" line — the same figure against the city-wide baseline, on
// the SAME parcel-weighted basis (item 8). The constituent rows below make the
// rolled-up numbers auditable. NOTE: deliberately NOT a TanStack aggregationFn —
// a parcel-weighted mean must weight by n_properties, which the built-in
// (unweighted) mean can't do; the honest math lives in aggregateFeatures.
function AggregateHeader({ aggregate: a, cityBaseline: cb, distValues, distLabel, distFmt, onClear, onExport, year, years }) {
  // Build a card's "city <value> · <delta>" line, honest per metric kind. A null
  // baseline (data still loading) or null figure yields no line — the cards then
  // render exactly as they did before item 8.
  const cmpLevel = (sel, cityVal, fmt) =>
    cb && sel != null && cityVal != null && cityVal !== 0
      ? `city ${fmt(cityVal)} · ${fmtSignedPct((sel - cityVal) / cityVal)}`
      : null;
  const cmpRate = (sel, cityVal, fmt) =>
    cb && sel != null && cityVal != null
      ? `city ${fmt(cityVal)} · ${fmtSignedPp(sel - cityVal)}`
      : null;
  const cmpShare = (sel, cityVal) =>
    cb && sel != null && cityVal != null && cityVal !== 0
      ? fmtSharePct(sel / cityVal)
      : null;

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
        <AggCard label="Total parcels" value={fmtNumber(a.totalParcels)} tag="exact"
                 compare={cmpShare(a.totalParcels, cb?.totalParcels)} />
        <AggCard label="Mean assessed" value={fmtCurrency(a.parcelMean)} tag="parcel-weighted · exact"
                 compare={cmpLevel(a.parcelMean, cb?.parcelMean, fmtCurrency)} />
        <AggCard label="Median assessed" value={fmtCurrency(a.medianOfMedians)} tag="≈ median of medians" approx
                 compare={cmpLevel(a.medianOfMedians, cb?.medianOfMedians, fmtCurrency)} />
        <AggCard label="YoY change" value={fmtPct(a.areaYoY)} tag="≈ parcel-weighted" approx
                 compare={cmpRate(a.areaYoY, cb?.areaYoY, fmtPct)} />
      </div>
      {/* Distribution of the selection on the ACTIVE metric (item 9) — the spread/
          shape around the central figures above. Self-guards below 2 values. */}
      <DistributionStrip values={distValues} label={distLabel} fmt={distFmt} />
      <p className="dt-agg-note">
        {a.nReportable} reportable · {a.nSuppressed} suppressed · {a.nExcluded} non-residential / no-data
        (excluded from values). Mean is parcel-exact; the median is a median of neighbourhood medians
        and YoY is parcel-weighted across neighbourhoods — both are approximations (no parcel-level
        data in the browser). Each figure is shown against the city-wide baseline on the same
        parcel-weighted basis — level deltas are relative, YoY is in percentage points (pp).
      </p>
    </div>
  );
}

function AggCard({ label, value, tag, compare = null, approx = false }) {
  return (
    <div className={`dt-card${approx ? " is-approx" : ""}`}>
      <span className="dt-card-label">{label}</span>
      <span className="dt-card-value">{value}</span>
      {compare && <span className="dt-card-cmp">{compare}</span>}
      <span className="dt-card-tag">{tag}</span>
    </div>
  );
}

// ---- Facet controls (D6) ---------------------------------------------------
// A multi-select facet dropdown built on a native <details> disclosure — legible
// and accessible with no custom open/close state. Options are data-driven; ticking
// one toggles it in/out of the column filter. Selected count shows on the summary.
function FacetDropdown({ label, options, selected, labelOf, onToggle }) {
  return (
    <details className="dt-facet-dd">
      <summary className="dt-facet-summary">
        {label}{selected.length ? ` · ${selected.length}` : ""}
      </summary>
      <div className="dt-facet-list">
        {options.map((v) => (
          <label key={v} className="dt-facet-opt">
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={() => onToggle(v)}
            />
            <span>{labelOf(v)}</span>
          </label>
        ))}
      </div>
    </details>
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

// The metric-RANGE facet: a min + a max slider over the active metric's bounds, with
// a live readout. Two stacked native sliders (legible + robust over an overlapping
// dual-thumb hack); each clamps against the other so lo never passes hi. `value` is
// the column's [lo, hi] filter (undefined = full range); `bounds` is [min, max] from
// getFacetedMinMaxValues — null/degenerate bounds render nothing.
function RangeFacet({ label, fmt, bounds, value, onChange }) {
  if (!bounds || bounds[0] === bounds[1]) return null;
  const [min, max] = bounds;
  const [lo, hi] = value ?? [min, max];
  const step = (max - min) / 100;
  return (
    <div className="dt-facet-range">
      <span className="dt-facet-range-cap">
        {label}: <strong>{fmt(lo)} – {fmt(hi)}</strong>
      </span>
      <div className="dt-facet-range-rows">
        <input
          type="range" min={min} max={max} step={step} value={lo}
          aria-label={`${label} minimum`}
          onChange={(e) => onChange([Math.min(+e.target.value, hi), hi])}
        />
        <input
          type="range" min={min} max={max} step={step} value={hi}
          aria-label={`${label} maximum`}
          onChange={(e) => onChange([lo, Math.max(+e.target.value, lo)])}
        />
      </div>
    </div>
  );
}
