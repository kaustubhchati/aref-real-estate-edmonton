// =============================================================================
// BuildingPermitsMap.jsx
//
// The Building Permits route (nav leaf "Construction & Improvement"). A .sb
// sidebar of controls beside a full-bleed .canvas-wrap holding the map. This is
// a POINT-symbol map (orange/blue dots from a PMTiles vector source), so it uses
// its OWN mount (PermitMapView), not the shared components/MapView.jsx.
//
// Four live, client-side filters — Year, Permit type (job_group), Month, and the
// interactive construction-value tiers — applied via map.setFilter (instant, no
// refetch). All 18 years live in one PMTiles.
// =============================================================================

import { useEffect, useState } from "react";

import PermitMapView from "./PermitMapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import {
  LAYER_ID,
  COLOURS,
  buildPermitFilter,
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
import { parseCsvAsObjects } from "../report-card/parseCsv.js";
import { fmtNumber } from "../../utils/format.js";

// Per-year coverage table — how many permits exist vs. how many are mappable.
// Served from /public (a tiny 18-row CSV), a plain static fetch.
const COVERAGE_URL = "/data/building-permits/permits_coverage.csv";

// Find the coverage row for one year. CSV cells are strings, so compare year
// numerically. Returns null when the year isn't in the table.
function coverageForYear(rows, year) {
  return rows.find((r) => Number(r.year) === year) || null;
}

// Sidebar legend. A static colour key (job_group → hue) plus an INTERACTIVE
// construction-value size key — each tier is a button that toggles whether that
// bucket's dots show. Active tier = filled dot; inactive = outlined ring (map
// dots vanish; the ring says "this tier exists but is hidden"). Tiers + radii
// come from VALUE_BUCKETS, the same table the map paints from. Reuses the global
// .legend* CSS (no new CSS).
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
                    background: active ? "var(--text-muted)" : "none",
                    border: active ? "none" : "2px solid var(--text-muted)",
                    display: "inline-block",
                  }}
                />
                <span className="legend-lab" style={{ marginLeft: 8 }}>
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
// the sidebar has finished its width transition.
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

  // Hide/show the sidebar; resize the map once the width transition completes.
  function toggleSidebar() {
    setCollapsed((v) => !v);
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  // Toggle one value tier on/off (immutably — clone, mutate, return a new Set so
  // React re-renders and the filter effect re-runs).
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

  // Re-apply the dot filter whenever the map is ready or a control changes
  // (year, permit type, month, or the active value tiers). setFilter is instant.
  // Guard on `map` so we don't call it before onLoad hands us the instance.
  useEffect(() => {
    if (!map) return;
    map.setFilter(
      LAYER_ID,
      buildPermitFilter(year, group, month, activeBuckets)
    );
  }, [map, year, group, month, activeBuckets]);

  // Load the coverage table ONCE on mount. Supplementary to the map, so a failed
  // load just hides the note (logged, not thrown — the map still works).
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

  // No-coordinate count for the selected year. The map only plots permits that
  // HAVE coordinates; the no-coord share spikes in recent years (City geocoding
  // lag), so stating it is honest rather than silently understating.
  const cov = coverageForYear(coverage, year);
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  return (
    <article className="content-map">
      <aside className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <p className="eyebrow">Building Activity</p>
        <h1 className="sb-title">Edmonton — {year}</h1>
        <p className="sb-sub">
          226,184 permit points, 2009–2026. Orange = residential, blue =
          commercial. Dot size = construction value tier. Filter by year, permit
          type, and month below.
        </p>

        <section className="sb-section">
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

        {/* Honest-absence note: shown only when some permits for the year lack
            coordinates. Reuses the .sb-sub caption style — no new CSS. */}
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
        {/* Sidebar collapse control — overlays the map's top-left. */}
        <button
          type="button"
          className="sb-toggle"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title="Toggle sidebar"
        >
          ≡
        </button>
        {/* PMTiles point map (no MapErrorBoundary); skeleton shows until onLoad. */}
        {!map && <MapSkeleton />}
        <PermitMapView className="canvas" onLoad={setMap} />
      </div>
    </article>
  );
}
