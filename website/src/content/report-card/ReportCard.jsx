// =============================================================================
// ReportCard.jsx
//
// Edmonton — Neighbourhood Report Card table. Loads the Layer-2 aggregates
// CSV from public/data/, filters by name, sorts by any column.
//
// Why one component and not many:
//   • A single page with one table doesn't earn a Table / Toolbar / Row split
//     yet — that would just be ceremony. When Calgary lands and the page gets
//     a city switcher, the natural split is page (city + data fetch) vs
//     <ReportCardTable city={...}/> — break it then, with a real second use.
//
// Data shape (after coercion): each row is the CSV row with numeric columns
// coerced to Number and `suppressed` coerced to a real boolean. We coerce
// up-front so sort comparators and formatters work uniformly.
// =============================================================================

import { useEffect, useMemo, useState } from "react";

import { parseCsvAsObjects } from "./parseCsv.js";
import { COLUMNS, DEFAULT_SORT } from "./columns.js";

const CSV_URL = "/data/neighbourhood_aggregates_2026.csv";

// Coerce raw CSV string values to the types the table sorts/formats over.
// Numeric columns become Number (or null for empty / "NA"); `suppressed`
// becomes boolean; the Neighbourhood name stays a string.
function coerceRow(raw) {
  const out = {};
  for (const k in raw) {
    const v = raw[k];
    if (k === "Neighbourhood" || k === "Neighbourhood ID") {
      out[k] = v;
    } else if (k === "suppressed") {
      out[k] = v === "TRUE";
    } else if (v === "" || v == null || v === "NA") {
      out[k] = null;
    } else {
      const n = Number(v);
      out[k] = Number.isNaN(n) ? v : n;
    }
  }
  return out;
}

// Compare two rows under the current sort. Suppressed cells and missing
// numerics always sort to the END regardless of direction — that way an
// "ascending median" sort still surfaces the cheapest real neighbourhoods
// at the top rather than a wall of em-dashes.
function makeComparator(col, dir) {
  const factor = dir === "asc" ? 1 : -1;
  return (a, b) => {
    if (col.suppressible) {
      if (a.suppressed && !b.suppressed) return 1;
      if (!a.suppressed && b.suppressed) return -1;
    }
    const va = a[col.key];
    const vb = b[col.key];
    if (col.numeric) {
      const aMissing = va == null || Number.isNaN(va);
      const bMissing = vb == null || Number.isNaN(vb);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return (va - vb) * factor;
    }
    return String(va ?? "").localeCompare(String(vb ?? "")) * factor;
  };
}

function cellContent(row, col) {
  if (col.suppressible && row.suppressed) return "—";
  return col.format(row[col.key]);
}

export default function ReportCard() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(DEFAULT_SORT);

  // Fetch + parse once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch(CSV_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((text) => {
        if (cancelled) return;
        const coerced = parseCsvAsObjects(text).map(coerceRow);
        setRows(coerced);
      })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // Filter (by name substring) then sort. Both are pure — useMemo keeps them
  // off the critical path while the user types / re-sorts.
  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => String(r.Neighbourhood || "").toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!filtered) return null;
    const col = COLUMNS.find((c) => c.key === sort.key) ?? COLUMNS[0];
    return filtered.slice().sort(makeComparator(col, sort.dir));
  }, [filtered, sort]);

  function onHeaderClick(col) {
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.numeric ? "desc" : "asc" }
        // Numeric columns default to descending (largest first) — usually
        // the more interesting view; string columns default to ascending.
    );
  }

  return (
    <article className="content-page report-card">
      <header>
        <h1>Neighbourhood Report Card</h1>
        <p>
          <strong>Edmonton — 2026.</strong> Layer-2 aggregates over the
          Layer-1a-cleaned property assessments. <em>Calgary will appear
          here when its pipeline lands.</em>
        </p>
        <p className="content-map-sub">
          Showing residential neighbourhoods only ({rows?.length ?? "…"} rows).
          The 56 non-residential / manufactured-home / no-data polygons that
          appear on the map are omitted here because they have no residential
          properties to aggregate. Rows with N&nbsp;&lt;&nbsp;100 follow the
          same suppression rule as the map and display "—" for the suppressed
          values.
        </p>
      </header>

      <div className="report-card-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Search neighbourhood…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="report-card-count">
          {sorted && rows
            ? `${sorted.length} of ${rows.length} neighbourhoods`
            : error
              ? `Error: ${error}`
              : "Loading…"}
        </div>
      </div>

      {sorted && (
        <div className="report-card-table-wrap">
          <table className="report-card-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => {
                  const isActive = sort.key === col.key;
                  const indicator = isActive ? (sort.dir === "asc" ? "▲" : "▼") : "▾";
                  return (
                    <th
                      key={col.key}
                      className={col.numeric ? "numeric" : ""}
                      onClick={() => onHeaderClick(col)}
                      title="Click to sort"
                    >
                      {col.label}
                      <span className={`sort-ind${isActive ? " active" : ""}`}>{indicator}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="report-card-empty">
                    No neighbourhoods match “{query}”.
                  </td>
                </tr>
              ) : (
                sorted.map((row) => (
                  // ID + name composite key: 8 rows in the CSV have
                  // `Neighbourhood ID` == "NA" (Anthony Henday subdivisions
                  // and friends), so the id alone collides. Name is unique
                  // within the dataset; the pair gives React a stable key
                  // across re-sorts.
                  <tr key={`${row["Neighbourhood ID"]}::${row.Neighbourhood}`}>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className={col.numeric ? "numeric" : ""}>
                        {cellContent(row, col)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
