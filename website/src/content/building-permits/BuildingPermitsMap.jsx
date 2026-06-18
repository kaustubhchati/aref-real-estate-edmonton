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
  COLOUR_BY_GROUP,
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

// Sidebar legend. Two parts: display-only permit-type chips that MIRROR the
// active OptionToggle selection (they don't duplicate the control), and an
// interactive construction-value size legend laid out as nested proportional
// circles on a shared baseline (the cartographic convention). Circles are
// coloured to the active permit type so the legend and map read identically.
// Reuses existing .legend* classes + tokens (no new CSS).
function PermitLegend({ activeBuckets, onToggle, onReset, activeGroup }) {
  const allActive = activeBuckets.size === ALL_BUCKET_IDS.length;

  // Colour to use for filled circles in the size legend. Matches the currently
  // selected permit type filter so the legend always mirrors what's on the map.
  const dotColour = activeGroup === "All"
    ? COLOUR_BY_GROUP.all
    : activeGroup === "Residential"
      ? COLOUR_BY_GROUP.residential
      : COLOUR_BY_GROUP.commercial;

  return (
    <div className="legend">

      {/* ── Section 1: Permit type filter chips ──────── */}
      {/* Material Design 3 filter chip pattern:
          active = coloured fill + coloured border.
          inactive = outlined, muted. The chip IS the
          filter control — no separate toggle above. */}
      <p className="legend-title">Permit type</p>
      <div style={{
        display: "flex",
        gap: 6,
        marginBottom: 14,
        flexWrap: "wrap",
      }}>
        {[
          { key: "All",         colour: null },
          { key: "Residential", colour: COLOURS.residential },
          { key: "Commercial",  colour: COLOURS.commercial  },
        ].map(({ key, colour }) => {
          const isActive = activeGroup === key;
          const bg = colour
            ? isActive
              ? colour + "22"   // 13% opacity tint
              : "transparent"
            : isActive
              ? "var(--bg-soft)"
              : "transparent";
          const border = colour
            ? isActive ? colour : "var(--border)"
            : isActive ? "var(--accent)" : "var(--border)";
          const textCol = colour
            ? isActive ? colour : "var(--text-muted)"
            : isActive ? "var(--accent)" : "var(--text-muted)";

          return (
            <button
              key={key}
              type="button"
              onClick={() => {/* no-op — group is
                controlled by the OptionToggle above.
                This chip is DISPLAY ONLY — it mirrors
                the active group selection but does not
                duplicate the control. */}}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: colour ? 5 : 0,
                padding: "3px 10px",
                borderRadius: 999,
                border: `1.5px solid ${border}`,
                background: bg,
                color: textCol,
                fontSize: "0.72rem",
                fontWeight: isActive ? 600 : 400,
                fontFamily: "inherit",
                cursor: "default",
                pointerEvents: "none",
                transition:
                  "background 150ms, border-color 150ms",
                lineHeight: 1.6,
              }}>
              {colour && (
                <svg width="8" height="8"
                  viewBox="0 0 8 8"
                  aria-hidden="true">
                  <circle cx="4" cy="4" r="3.5"
                    fill={isActive ? colour : "none"}
                    stroke={isActive
                      ? colour : "var(--text-muted)"}
                    strokeWidth="1"
                  />
                </svg>
              )}
              {key}
            </button>
          );
        })}
      </div>

      {/* ── Section 2: Construction value size legend ─ */}
      {/* Nested-circles layout: all circles share a
          common BOTTOM baseline — the standard
          cartographic convention for proportional
          symbol legends (Axis Maps, ESRI, Brewer).
          Coloured to match the active permit type
          so legend and map are visually identical. */}
      <div style={{
        display: "flex",
        alignItems: "flex-end",    // COMMON BASELINE
        justifyContent: "space-between",
        marginBottom: 6,
      }}>
        <p className="legend-title" style={{ margin: 0 }}>
          Construction value
        </p>
        {!allActive && (
          <button
            type="button"
            onClick={onReset}
            style={{
              fontSize: "0.66rem",
              padding: "1px 8px",
              border: "1px solid var(--border)",
              borderRadius: 999,
              background: "var(--bg-soft)",
              cursor: "pointer",
              color: "var(--text-muted)",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          >
            Show all
          </button>
        )}
      </div>

      {/* Nested circle display — SVG with all 5 circles
          sharing a common bottom baseline.
          Circles are coloured by active group.
          Inactive buckets shown as outlined/faded. */}
      <div style={{ position: "relative", marginBottom: 4 }}>
        {(() => {
          // Layout constants
          const maxR   = VALUE_BUCKETS[4].radius; // 19
          const svgH   = maxR * 2 + 4;            // height
          // Column x-centres: evenly spaced
          const cols   = VALUE_BUCKETS.length;
          const colW   = 44;
          const svgW   = cols * colW;
          const baseline = svgH;                  // y of baseline

          return (
            <svg
              width={svgW}
              height={svgH}
              viewBox={`0 0 ${svgW} ${svgH}`}
              aria-label="Construction value size reference"
              style={{ overflow: "visible",
                display: "block", marginBottom: 2 }}
            >
              {VALUE_BUCKETS.map((b, i) => {
                const active = activeBuckets.has(b.id);
                const cx = i * colW + colW / 2;
                // Baseline alignment: cy = baseline - r
                const cy = baseline - b.radius;

                return (
                  <g
                    key={b.id}
                    onClick={() => onToggle(b.id)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-pressed={active}
                    aria-label={`${b.label}: ${active
                      ? "visible" : "hidden"}`}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={b.radius}
                      fill={active
                        ? dotColour
                        : "none"}
                      stroke={active
                        ? "rgba(255,255,255,0.7)"
                        : "var(--border)"}
                      strokeWidth={active ? 1.5 : 1}
                      opacity={active ? 0.85 : 0.4}
                    />
                    {/* Invisible hit area — easier to click
                        small dots */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={Math.max(b.radius, 12)}
                      fill="transparent"
                    />
                  </g>
                );
              })}
              {/* Shared baseline rule */}
              <line
                x1={0} y1={svgH}
                x2={svgW} y2={svgH}
                stroke="var(--border)"
                strokeWidth="0.75"
              />
            </svg>
          );
        })()}
      </div>

      {/* Value labels below each circle column */}
      {(() => {
        const colW = 44;
        return (
          <div style={{
            display: "flex",
            width: VALUE_BUCKETS.length * colW,
          }}>
            {VALUE_BUCKETS.map((b) => {
              const active = activeBuckets.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onToggle(b.id)}
                  aria-pressed={active}
                  style={{
                    width: colW,
                    flex: `0 0 ${colW}px`,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 0 0",
                    textAlign: "center",
                    fontSize: "0.60rem",
                    color: active
                      ? "var(--text)"
                      : "var(--text-subtle)",
                    fontFamily: "inherit",
                    lineHeight: 1.3,
                    opacity: active ? 1 : 0.45,
                    transition: "opacity 150ms",
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        );
      })()}

      <p style={{
        fontSize: "0.66rem",
        color: "var(--text-subtle)",
        marginTop: 6,
        lineHeight: 1.4,
        fontStyle: "italic",
      }}>
        Click any circle or label to show/hide that tier.
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
            coordinates. ⚠ prefix + warning styling (existing tokens, no new CSS). */}
        {nNoCoord > 0 && (
          <p style={{
            fontSize: "0.72rem",
            color: "var(--text-muted)",
            lineHeight: 1.45,
            margin: "4px 0 8px",
            display: "flex",
            gap: 5,
            alignItems: "flex-start",
          }}>
            <span aria-hidden="true"
              style={{ flex:"0 0 auto", marginTop:1 }}>⚠</span>
            <span>
              {fmtNumber(nNoCoord)} of {fmtNumber(cov.n_total)}{" "}
              permits ({Math.round(
                Number(cov.pct_no_coord) * 100)}%){" "}
              have no map location for {year} and are not shown.
            </span>
          </p>
        )}

        <section className="sb-section">
          <PermitLegend
            activeBuckets={activeBuckets}
            onToggle={toggleBucket}
            onReset={resetBuckets}
            activeGroup={group}
          />
        </section>

        <p className="sb-ref" style={{
          borderTop: "1px solid var(--border-soft)",
          paddingTop: 10,
          marginTop: 8,
        }}>
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
