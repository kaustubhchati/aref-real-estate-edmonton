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
import { LAYER_ID } from "./permitStyle.js";
import {
  YEARS,
  DEFAULT_YEAR,
  JOB_CATEGORIES,
  DEFAULT_CATEGORY,
  ALL_CATEGORIES,
} from "./dataSources.js";

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

  // Re-apply the filter whenever the map is ready or a control changes. setFilter
  // is instant — it re-evaluates the already-loaded tiles, no network. Guard on
  // `map` so we don't call setFilter before onLoad hands us the instance.
  useEffect(() => {
    if (!map) return;
    map.setFilter(LAYER_ID, buildPermitFilter(year, category));
  }, [map, year, category]);

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
      </aside>

      <div className="canvas-wrap">
        <PermitMapView className="canvas" onLoad={setMap} />
      </div>
    </article>
  );
}
