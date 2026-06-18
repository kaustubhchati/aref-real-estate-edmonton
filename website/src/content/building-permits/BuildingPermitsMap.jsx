// =============================================================================
// BuildingPermitsMap.jsx
//
// The Building Permits route (nav leaf "Construction & Improvement").
//
// Composition mirrors property-assessment/PropertyAssessmentMap.jsx: a .sb
// sidebar of controls beside a full-bleed .canvas-wrap holding the map. This is
// a POINT-symbol map (orange/slate dots from a PMTiles vector source), so it
// uses its OWN mount (PermitMapView), not the shared components/MapView.jsx.
//
// Step 4a scope: two live filters — Year and Job Category. All 18 years live in
// one PMTiles, so filtering is CLIENT-SIDE via map.setFilter (instant, no
// refetch); nothing reloads when the user changes a control. Popups + legend
// come later.
// =============================================================================

import { useEffect, useState } from "react";

import PermitMapView from "./PermitMapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import { LAYER_ID, COLOURS } from "./permitStyle.js";
import {
  YEARS,
  DEFAULT_YEAR,
  JOB_CATEGORIES,
  DEFAULT_CATEGORY,
  ALL_CATEGORIES,
} from "./dataSources.js";
// Reusing the site's only CSV parser (it lives in report-card). It now has two
// consumers, so by the "extract on second use" rule it should move to utils/ —
// deferred, since this task touches only building-permits files.
import { parseCsvAsObjects } from "../report-card/parseCsv.js";
import { fmtNumber } from "../../utils/format.js";

// Per-year coverage table — how many permits exist vs. how many are mappable.
// Served from /public beside the tiles (a tiny 18-row CSV), NOT from R2: it's a
// plain static fetch, not range-requested like the .pmtiles.
const COVERAGE_URL = "/data/building-permits/permits_coverage.csv";

// Per-(year, job_category) counts — drives the empty-state. The pipeline emits
// only pairs with n>0, so "row exists" == "permits exist". Same /public + plain
// fetch handling as the coverage table.
const COUNTS_URL = "/data/building-permits/permits_category_counts.csv";

// Find the coverage row for one year. Every CSV cell is a string, so compare
// year numerically. Returns null when the year isn't in the table (caller then
// shows nothing).
function coverageForYear(rows, year) {
  return rows.find((r) => Number(r.year) === year) || null;
}

// Does this (year, category) pair have any permits? The counts file lists only
// pairs with n>0, so presence in the file == present. CSV cells are strings:
// compare year numerically, category by exact string (verbatim, commas/ampersand
// intact — the same value the filter matches on).
function pairHasPermits(rows, year, category) {
  return rows.some((r) => Number(r.year) === year && r.job_category === category);
}

// Sidebar legend. Two keys: colour (job_group → hue) and dot size
// (construction_value → radius). Colours come from permitStyle's COLOURS table
// — imported, never re-hardcoded — so the legend can't drift from the map paint.
// The size dots are APPROXIMATE pixel sizes standing in for the value→radius
// ramp: an orientation cue, not the exact stops. Reuses the global .legend* CSS
// (same classes the choropleth Legend uses); the size dots are plain inline-
// styled circles, the same inline-swatch approach Legend.jsx itself uses.
function PermitLegend() {
  const colourRows = [
    { label: "Residential", colour: COLOURS.residential },
    { label: "Commercial", colour: COLOURS.commercial },
  ];
  const sizeDots = [6, 10, 14, 20]; // ascending diameters, small → large

  return (
    <aside className="legend">
      <h2 className="legend-title">Permit type</h2>
      <ul className="legend-list">
        {colourRows.map((r) => (
          <li key={r.label} className="legend-row">
            {/* Round swatch (override .legend-sw's rectangle) so the key reads
                as a permit dot, coloured straight from COLOURS. */}
            <span
              className="legend-sw"
              style={{ background: r.colour, width: 14, flex: "0 0 14px", borderRadius: "50%" }}
            />
            <span className="legend-lab">{r.label}</span>
          </li>
        ))}
      </ul>

      <div className="legend-divider">Construction value</div>
      <div className="legend-row" style={{ gap: 6 }}>
        {sizeDots.map((d) => (
          <span
            key={d}
            style={{
              width: d,
              height: d,
              flex: `0 0 ${d}px`,
              borderRadius: "50%",
              background: "var(--text-muted)", // neutral: size, not group, is the point
            }}
          />
        ))}
        <span className="legend-lab"><small>lower → higher</small></span>
      </div>
    </aside>
  );
}

// Build the MapLibre filter for the current controls.
// WHY an ["all", …]: the two clauses are independent and BOTH must hold. Year is
// always constrained (exactly one year shows at a time). Job category is added
// only when it isn't "All" — "All" means "don't filter by category", so we drop
// the clause entirely rather than trying to match a non-existent category value.
function buildPermitFilter(year, category) {
  const clauses = [["==", ["get", "year"], year]];
  if (category !== ALL_CATEGORIES) {
    clauses.push(["==", ["get", "job_category"], category]);
  }
  return ["all", ...clauses];
}

export default function BuildingPermitsMap() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [map, setMap] = useState(null);
  const [coverage, setCoverage] = useState([]);
  const [counts, setCounts] = useState([]);

  // Re-apply the filter whenever the map is ready or a control changes. setFilter
  // is instant — it re-evaluates the already-loaded tiles, no network. Guard on
  // `map` so we don't call setFilter before onLoad hands us the instance.
  useEffect(() => {
    if (!map) return;
    map.setFilter(LAYER_ID, buildPermitFilter(year, category));
  }, [map, year, category]);

  // Load the coverage table ONCE on mount. It's supplementary to the map, so a
  // failed load just hides the note (logged, not thrown — the map still works).
  useEffect(() => {
    let cancelled = false;
    fetch(COVERAGE_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((text) => { if (!cancelled) setCoverage(parseCsvAsObjects(text)); })
      .catch((err) => console.error("[BuildingPermitsMap] coverage:", err.message));
    return () => { cancelled = true; };
  }, []);

  // Load the per-(year, category) counts ONCE on mount (same handling as
  // coverage). Supplementary: if it fails the empty-state simply never shows.
  useEffect(() => {
    let cancelled = false;
    fetch(COUNTS_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.text();
      })
      .then((text) => { if (!cancelled) setCounts(parseCsvAsObjects(text)); })
      .catch((err) => console.error("[BuildingPermitsMap] counts:", err.message));
    return () => { cancelled = true; };
  }, []);

  // No-coordinate count for the selected year. WHY surface this: the share is
  // small in older years (~2-5%) but spikes recently — ~28% in 2025, ~35% in
  // 2026 — because of City geocoding lag. The map only plots permits that HAVE
  // coordinates, so without this line it silently understates recent years.
  // Stating the absence is honest; dropping the rows quietly is not.
  const cov = coverageForYear(coverage, year);
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  // WHY: several job categories are legacy taxonomy with genuinely zero permits
  // in recent years, so filtering to one yields a correctly-empty map. This flag
  // drives a line that says so — distinguishing "empty" from "broken". Only
  // meaningful for a specific category ("All" is never empty for a year that has
  // permits, so skip it), and only once counts have loaded (else a not-yet-found
  // pair would read as empty during the fetch).
  const categoryEmpty =
    category !== ALL_CATEGORIES &&
    counts.length > 0 &&
    !pairHasPermits(counts, year, category);

  return (
    <article className="content-map">
      <aside className="sb" aria-label="Map sidebar">
        <h1 className="sb-title">Edmonton — building permits</h1>
        <p className="sb-sub">
          226,184 permit points, 2009–2026. Slate = residential, orange =
          commercial; dot size scales with construction value. Filter by year and
          job category below.
        </p>

        <section className="sb-section">
          {/* Reuse the existing sidebar classes (no new CSS): .opt-toggle for
              spacing, .opt-toggle-label for the 11px label, .search-input for
              the bordered control — a <select> wears the input style fine. */}
          <label className="opt-toggle">
            <div className="opt-toggle-label">Year</div>
            <select
              className="search-input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>

          <label className="opt-toggle">
            <div className="opt-toggle-label">Job category</div>
            <select
              className="search-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {JOB_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </section>

        {/* Honest-absence note: only shown when some permits for the year lack
            coordinates. Reuses the .sb-sub caption style (same as the subtitle
            above) — no new CSS. Updates live because `year` drives `cov`. */}
        {nNoCoord > 0 && (
          <p className="sb-sub">
            {fmtNumber(nNoCoord)} of {fmtNumber(cov.n_total)} permits
            {" "}({Math.round(Number(cov.pct_no_coord) * 100)}%) have no map
            location for {year} and are not shown.
          </p>
        )}

        {/* Empty-state: the selected category genuinely has no permits this year
            (legacy taxonomy). Reuses the .sb-sub caption style — no new CSS. */}
        {categoryEmpty && (
          <p className="sb-sub">No permits in this category for {year}.</p>
        )}

        <section className="sb-section">
          <PermitLegend />
        </section>
      </aside>

      <div className="canvas-wrap">
        {/* No url/gj here (PMTiles point map, no MapErrorBoundary); the loading
            signal is "map not ready yet" — skeleton shows until onLoad fires. */}
        {!map && <MapSkeleton />}
        <PermitMapView className="canvas" onLoad={setMap} />
      </div>
    </article>
  );
}
