// =============================================================================
// DataTable.jsx
//
// The Property Assessment bottom data table (Felt zone 4) — the analytical
// surface. Collapsed to a thin handle by default; click the handle (or press T)
// to raise it. Desktop = bottom drawer; narrow/touch = fullscreen overlay (CSS).
//
// Data: the rows are derived ONCE in PropertyAssessmentMap from the RESIDENT
// combined source (gjView.features) and passed in — no querySourceFeatures, no
// tile-dedupe (the data is already in JS). This component only does the view:
// type-to-filter, click-to-sort, the per-row sparkline, and the bidirectional
// link to the shared selection (hover row → highlight polygon; click row →
// select; a selected polygon scrolls its row into view + highlights it).
//
// Props:
//   rows         [{ id, name, state, value, yoy, series, rank }]  (value/yoy/rank
//                are null for non-reportable rows → rendered as "—")
//   metricLabel  header for the active-metric column
//   metricFmt    formatter for the active-metric value
//   showYoyCol   false when the active metric IS YoY (avoids a duplicate column)
//   activeIndex  year index to dot in each row's sparkline
//   selectedIds  current selection (row highlight + scroll-into-view)
//   onSelectRow  (id) => void
//   onHoverRow   (id | null) => void   (drives the polygon hover feature-state)
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import Sparkline from "../../components/Sparkline.jsx";
import ExportMenu from "./ExportMenu.jsx";
import { fmtCurrency, fmtNumber, fmtPct } from "../../utils/format.js";

// Sort comparator: nulls always last (regardless of direction), numbers numeric,
// strings locale-compared.
function comparator(sort) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return (a, b) => {
    const va = a[sort.key];
    const vb = b[sort.key];
    const na = va == null;
    const nb = vb == null;
    if (na && nb) return 0;
    if (na) return 1;
    if (nb) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  };
}

export default function DataTable({
  rows,
  metricLabel,
  metricFmt,
  showYoyCol,
  activeIndex,
  selectedIds,
  onSelectRow,
  onHoverRow,
  aggregate,         // honest area aggregate, or null. Non-null = selection mode.
  onClearSelection,  // () => void
  onExport,          // (format) => void — scoped export (CSV/GeoJSON/PNG)
  open,              // controlled: the table is raised (= analyst view)
  onToggle,          // () => void — toggle the table / analyst view
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const scrollRef = useRef(null);

  // Selection mode = a multi-neighbourhood box-select is active (aggregate set):
  // show the aggregate header + just the constituent rows. (The page raises the
  // table — `open` — on a box-select; here we only render the aggregate.)
  const selectionMode = !!aggregate;

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

  // Columns (data-driven). The active-metric column's label is dynamic; YoY is
  // dropped when it would duplicate the metric column. `trend` isn't sortable.
  const cols = useMemo(() => {
    const c = [
      { key: "name", label: "Neighbourhood", numeric: false, sortable: true },
      { key: "value", label: metricLabel, numeric: true, sortable: true },
    ];
    if (showYoyCol) c.push({ key: "yoy", label: "YoY", numeric: true, sortable: true });
    c.push({ key: "trend", label: "Trend", numeric: false, sortable: false });
    c.push({ key: "rank", label: "Rank", numeric: true, sortable: true });
    return c;
  }, [metricLabel, showYoyCol]);

  const selectedSet = useMemo(() => new Set(selectedIds.map(String)), [selectedIds]);

  const view = useMemo(() => {
    let base;
    if (selectionMode) {
      // Selection mode: only the constituent rows (the auditable detail behind
      // the aggregate cards).
      base = rows.filter((r) => selectedSet.has(String(r.id)));
    } else {
      const q = query.trim().toLowerCase();
      base = q ? rows.filter((r) => (r.name || "").toLowerCase().includes(q)) : rows;
    }
    return [...base].sort(comparator(sort));
  }, [rows, query, sort, selectionMode, selectedSet]);

  // When the selection changes to a single nbhd (e.g. clicked on the map), scroll
  // its row into view if the table is open.
  useEffect(() => {
    if (!open || selectedIds.length !== 1 || !scrollRef.current) return;
    const row = scrollRef.current.querySelector(`[data-id="${CSS.escape(String(selectedIds[0]))}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedIds, open, view]);

  function toggleSort(col) {
    if (!col.sortable) return;
    setSort((s) =>
      s.key === col.key
        ? { key: col.key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.numeric ? "desc" : "asc" }
    );
  }

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
            <AggregateHeader aggregate={aggregate} onClear={onClearSelection} onExport={onExport} />
          ) : (
            <div className="dt-toolbar">
              <input
                type="text"
                className="dt-filter search-input"
                placeholder="Filter by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Filter neighbourhoods by name"
              />
              <span className="dt-count">{view.length} of {rows.length}</span>
              <ExportMenu onExport={onExport} />
            </div>
          )}

          <div className="dt-scroll" ref={scrollRef}>
            <table className="dt-table">
              <thead>
                <tr>
                  {cols.map((col) => {
                    const active = sort.key === col.key;
                    const ind = !col.sortable ? "" : active ? (sort.dir === "asc" ? "▲" : "▼") : "▾";
                    return (
                      <th
                        key={col.key}
                        className={col.numeric ? "numeric" : ""}
                        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            className="dt-th-btn"
                            onClick={() => toggleSort(col)}
                            title="Sort"
                          >
                            {col.label}
                            <span className={`dt-sort${active ? " active" : ""}`}>{ind}</span>
                          </button>
                        ) : (
                          col.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {view.length === 0 ? (
                  <tr><td colSpan={cols.length} className="dt-empty">No neighbourhoods match “{query}”.</td></tr>
                ) : (
                  view.map((r) => (
                    <tr
                      key={r.id}
                      data-id={r.id}
                      className={`dt-row${selectedSet.has(String(r.id)) ? " is-selected" : ""}`}
                      onClick={() => onSelectRow(r.id)}
                      onMouseEnter={() => onHoverRow(r.id)}
                      onMouseLeave={() => onHoverRow(null)}
                    >
                      <td className="dt-name">{r.name}</td>
                      <td className="numeric">{r.value == null ? "—" : metricFmt(r.value)}</td>
                      {showYoyCol && <td className="numeric">{r.yoy == null ? "—" : fmtPct(r.yoy)}</td>}
                      <td className="dt-spark">
                        <Sparkline values={r.series} activeIndex={activeIndex} width={80} height={20}
                                   ariaLabel={`${r.name} trend`} />
                      </td>
                      <td className="numeric">{r.rank == null ? "—" : r.rank}</td>
                    </tr>
                  ))
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
// make the rolled-up numbers auditable.
function AggregateHeader({ aggregate: a, onClear, onExport }) {
  return (
    <div className="dt-agg">
      <div className="dt-agg-bar">
        <strong className="dt-agg-title">{a.nSelected} neighbourhoods selected</strong>
        <div className="dt-agg-actions">
          <button type="button" className="dt-agg-clear" onClick={onClear}>Clear selection</button>
          <ExportMenu onExport={onExport} />
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
