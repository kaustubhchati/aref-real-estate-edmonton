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
// construction-value size key — each tier is a toggle button. Active tier =
// filled SVG dot (white halo, matching the map dot exactly); inactive = dashed
// outline ring + dimmed row. SVG circles (not CSS border-radius divs) so they
// stay crisp at any DPI. Tiers + radii come from VALUE_BUCKETS, the same table
// the map paints from. Reuses existing .legend* classes + tokens (no new CSS).
function PermitLegend({ activeBuckets, onToggle, onReset }) {
  const allActive = activeBuckets.size === ALL_BUCKET_IDS.length;

  return (
    <div className="legend">

      {/* ── Permit type ─────────────────────────────── */}
      <p className="legend-title">Permit type</p>
      <ul className="legend-list">
        {[
          { label: "Residential", colour: COLOURS.residential },
          { label: "Commercial",  colour: COLOURS.commercial  },
        ].map((r) => (
          <li key={r.label} className="legend-row">
            {/* SVG circle matches the map dot exactly —
                crisp at any DPI unlike a CSS border-radius div */}
            <svg
              width="14" height="14"
              viewBox="0 0 14 14"
              aria-hidden="true"
              style={{ flex: "0 0 14px" }}
            >
              <circle
                cx="7" cy="7" r="5.5"
                fill={r.colour}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.5"
              />
            </svg>
            <span className="legend-lab">{r.label}</span>
          </li>
        ))}
      </ul>

      {/* ── Construction value ──────────────────────── */}
      <div className="legend-divider"
        style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between" }}
      >
        <span>Construction value</span>
        {!allActive && (
          <button
            type="button"
            onClick={onReset}
            style={{
              fontSize: 10,
              padding: "1px 7px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-soft)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Bucket rows — each is a toggle button.
          SVG circle sized to bucket.radius * 2 px,
          exactly matching the map dot proportions.
          Active = filled + full opacity.
          Inactive = outlined ring + 0.32 opacity on row. */}
      <ul className="legend-list" style={{ marginTop: 4 }}>
        {VALUE_BUCKETS.map((b) => {
          const active = activeBuckets.has(b.id);
          const d = b.radius * 2;       // diameter in px
          const r = b.radius - 1;       // SVG circle radius (inset 1px for stroke)
          const c = b.radius;           // SVG centre

          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onToggle(b.id)}
                aria-pressed={active}
                title={active ? "Click to hide" : "Click to show"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "3px 0",
                  opacity: active ? 1 : 0.32,
                  textAlign: "left",
                  fontFamily: "inherit",
                  transition: "opacity 150ms ease",
                }}
              >
                {/* SVG proportional circle — crisp at all DPI,
                    sized to match map dot exactly.
                    Container is fixed 38px wide so all labels
                    left-align regardless of circle size. */}
                <span style={{
                  width: 38, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  flex: "0 0 38px",
                }}>
                  <svg
                    width={d} height={d}
                    viewBox={`0 0 ${d} ${d}`}
                    aria-hidden="true"
                  >
                    {active ? (
                      /* Filled: solid grey + white halo stroke */
                      <circle
                        cx={c} cy={c} r={r}
                        fill="var(--text-muted)"
                        stroke="rgba(255,255,255,0.85)"
                        strokeWidth="1.5"
                      />
                    ) : (
                      /* Inactive: outlined ring only */
                      <circle
                        cx={c} cy={c} r={r}
                        fill="none"
                        stroke="var(--text-muted)"
                        strokeWidth="1.5"
                        strokeDasharray="2 1.5"
                      />
                    )}
                  </svg>
                </span>
                <span style={{
                  fontSize: "0.75rem",
                  color: "var(--text)",
                  lineHeight: 1.3,
                }}>
                  {b.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Proportional scale note — cartographic convention */}
      <p style={{
        fontSize: "0.64rem",
        color: "var(--text-subtle)",
        marginTop: 4,
        lineHeight: 1.4,
      }}>
        Circle size proportional to construction value.
        Click any tier to show or hide.
      </p>
    </div>
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
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year}</h1>
          <p className="sb-sub">
            226,184 permit points, 2009–2026. Orange = residential, violet =
            commercial. Dot size = construction value tier. Filter by year,
            permit type, and month below.
          </p>
        </div>

        <section className="sb-section">
          <div className="sb-select-field">
            <span className="sb-select-label">Year</span>
            <select
              className="sb-select"
              aria-label="Year"
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

          <div className="sb-select-field">
            <span className="sb-select-label">Month</span>
            <select
              className="sb-select"
              aria-label="Month"
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
