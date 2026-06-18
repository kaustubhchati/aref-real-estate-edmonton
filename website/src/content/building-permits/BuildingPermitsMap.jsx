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
// Three live filters — Year, Permit type (job_group), and Month. All 18 years
// live in one PMTiles, so filtering is CLIENT-SIDE via map.setFilter (instant,
// no refetch); nothing reloads when the user changes a control. Both the circle
// and heatmap layers share the same filter.
// =============================================================================

import { useEffect, useState } from "react";

import PermitMapView from "./PermitMapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import {
  LAYER_ID,
  HEATMAP_LAYER_ID,
  COLOURS,
  buildPermitFilter,
  buildHeatmapFilter,
  VALUE_BUCKETS,
  ALL_BUCKET_IDS,
  DEFAULT_ACTIVE_BUCKETS,
} from "./permitStyle.js";
import {
  YEARS,
  DEFAULT_YEAR,
  JOB_GROUPS,
  DEFAULT_GROUP,
  MONTHS,
  DEFAULT_MONTH,
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

// Find the coverage row for one year. Every CSV cell is a string, so compare
// year numerically. Returns null when the year isn't in the table (caller then
// shows nothing).
function coverageForYear(rows, year) {
  return rows.find((r) => Number(r.year) === year) || null;
}

// Sidebar legend. Two parts: a static colour key (job_group → hue) and an
// INTERACTIVE construction-value size key — each tier is a button that toggles
// whether that bucket's dots show on the map. Active tier = filled dot; inactive
// = outlined ring (the map dots vanish, the ring says "this tier exists but is
// hidden"). Tiers + radii come from VALUE_BUCKETS, the same table the map paints
// from, so the legend can't drift. Reuses the global .legend* CSS (no new CSS).
function PermitLegend({ activeBuckets, onToggle, onReset }) {
  const colourRows = [
    { label: "Residential", colour: COLOURS.residential },
    { label: "Commercial",  colour: COLOURS.commercial  },
  ];
  const allActive = activeBuckets.size === ALL_BUCKET_IDS.length;

  return (
    <aside className="legend">
      <h2 className="legend-title">Permit type</h2>
      <ul className="legend-list">
        {colourRows.map((r) => (
          <li key={r.label} className="legend-row">
            <span
              className="legend-sw"
              style={{
                background: r.colour,
                width: 14,
                flex: "0 0 14px",
                borderRadius: "50%",
              }}
            />
            <span className="legend-lab">{r.label}</span>
          </li>
        ))}
      </ul>

      <div className="legend-divider">
        Construction value
        {!allActive && (
          <button
            type="button"
            onClick={onReset}
            style={{
              marginLeft: 8,
              fontSize: 10,
              padding: "1px 6px",
              border: "1px solid var(--border)",
              borderRadius: 3,
              background: "var(--bg-soft)",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            All
          </button>
        )}
      </div>

      <ul className="legend-list">
        {VALUE_BUCKETS.map((b) => {
          const active = activeBuckets.has(b.id);
          const dotPx = b.radius * 2;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onToggle(b.id)}
                className="legend-row"
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 0",
                  opacity: active ? 1 : 0.35,
                  // Inactive bucket: label muted, dot outlined.
                  // Dots on map vanish — legend ring signals "off".
                }}
                aria-pressed={active}
                title={active ? "Click to hide" : "Click to show"}
              >
                <span
                  style={{
                    width: dotPx,
                    height: dotPx,
                    flex: `0 0 ${dotPx}px`,
                    borderRadius: "50%",
                    background: active
                      ? "var(--text-muted)"
                      : "none",
                    border: active
                      ? "none"
                      : "2px solid var(--text-muted)",
                    display: "inline-block",
                  }}
                />
                <span
                  className="legend-lab"
                  style={{ marginLeft: 8 }}
                >
                  {b.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// Match the .sb collapse transition (index.css) so we resize the map only after
// the sidebar has finished shrinking/growing — resizing mid-animation leaves the
// canvas at a stale width.
const SIDEBAR_TRANSITION_MS = 220;

export default function BuildingPermitsMap() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [map, setMap] = useState(null);
  const [coverage, setCoverage] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  // Factory init so new Set(...) runs ONCE on mount, not every render.
  const [activeBuckets, setActiveBuckets] = useState(
    () => new Set(DEFAULT_ACTIVE_BUCKETS)
  );

  // Toggle one value tier on/off (immutably — clone, mutate the clone, return it
  // so React sees a new Set reference and re-renders + re-filters).
  function toggleBucket(id) {
    setActiveBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function resetBuckets() {
    setActiveBuckets(new Set(ALL_BUCKET_IDS));
  }

  // Hide/show the sidebar. MapLibre sizes its canvas to the container, so after
  // the width transition finishes we tell the map to re-measure and fill the
  // reclaimed space.
  function toggleSidebar() {
    setCollapsed((v) => !v);
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  // Re-apply BOTH layers' filters whenever the map is ready or a control changes.
  // setFilter is instant — it re-evaluates the already-loaded tiles, no network.
  // The dot layer also honours the active value tiers; the heatmap intentionally
  // does NOT take the bucket filter (it's a density-context layer), but it still
  // tracks year + permit-type + month so it stays in sync with the selection.
  // Guard on `map` so we don't call setFilter before onLoad hands us the instance.
  useEffect(() => {
    if (!map) return;
    map.setFilter(LAYER_ID, buildPermitFilter(year, group, month, activeBuckets));
    map.setFilter(HEATMAP_LAYER_ID, buildHeatmapFilter(year, group, month));
  }, [map, year, group, month, activeBuckets]);

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

  // No-coordinate count for the selected year. WHY surface this: the share is
  // small in older years (~2-5%) but spikes recently — ~28% in 2025, ~35% in
  // 2026 — because of City geocoding lag. The map only plots permits that HAVE
  // coordinates, so without this line it silently understates recent years.
  // Stating the absence is honest; dropping the rows quietly is not.
  const cov = coverageForYear(coverage, year);
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  return (
    <article className="content-map">
      <aside className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <p className="eyebrow">Building Activity</p>
        <h1 className="sb-title">Edmonton — {year}</h1>
        <p className="sb-sub">
          226,184 permit points, 2009–2026. Orange = residential, blue =
          commercial. Click value tiers below to show or hide by construction
          value.
        </p>

        <section className="sb-section">
          {/* Reuse the existing sidebar classes (no new CSS): .opt-toggle for
              spacing, .opt-toggle-label for the 11px label, .search-input for
              the bordered control — a <select> wears the input style fine. */}
          <div className="opt-toggle">
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
          </div>

          <OptionToggle
            label="Permit type"
            options={JOB_GROUPS}
            value={group}
            onChange={setGroup}
          />

          <div className="opt-toggle">
            <div className="opt-toggle-label">Month</div>
            <select
              className="search-input"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
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

        <section className="sb-section">
          <PermitLegend
            activeBuckets={activeBuckets}
            onToggle={toggleBucket}
            onReset={resetBuckets}
          />
        </section>

        <p className="sb-ref">
          Source: City of Edmonton Open Data (24uj-dj8v). 226,184 permit points,
          2009–2026.
        </p>
      </aside>

      <div className="canvas-wrap">
        {/* Sidebar collapse control — overlays the map's top-left so the toggle
            stays reachable whether the sidebar is open or hidden. */}
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title="Toggle sidebar"
        >
          ≡
        </button>
        {/* No url/gj here (PMTiles point map, no MapErrorBoundary); the loading
            signal is "map not ready yet" — skeleton shows until onLoad fires. */}
        {!map && <MapSkeleton />}
        <PermitMapView className="canvas" onLoad={setMap} />
      </div>
    </article>
  );
}
