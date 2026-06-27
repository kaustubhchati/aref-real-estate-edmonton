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
import { fmtPct } from "../../utils/format.js";

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
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const scrollRef = useRef(null);

  // Keyboard shortcut: T toggles the table (ignored while typing in a field).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "t" && e.key !== "T") return;
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey) return;
      setOpen((o) => !o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    const q = query.trim().toLowerCase();
    const base = q ? rows.filter((r) => (r.name || "").toLowerCase().includes(q)) : rows;
    return [...base].sort(comparator(sort));
  }, [rows, query, sort]);

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
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="dt-handle-title">Data table</span>
        <span className="dt-handle-meta">{rows.length} neighbourhoods · press T</span>
        <span className="dt-handle-caret" aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>

      {open && (
        <div className="dt-panel">
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
          </div>

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
                        onClick={() => toggleSort(col)}
                        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                        title={col.sortable ? "Click to sort" : undefined}
                        data-sortable={col.sortable ? "true" : "false"}
                      >
                        {col.label}
                        {col.sortable && <span className={`dt-sort${active ? " active" : ""}`}>{ind}</span>}
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
