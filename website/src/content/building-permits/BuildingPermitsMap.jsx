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

import { useEffect, useRef, useState } from "react";

import PermitMapView from "./PermitMapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
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

// The construction-value size legend: nested proportional circles on a shared
// baseline (the cartographic convention), coloured to the active permit type
// (activeGroup → dotColour), clickable + keyboard-accessible. Permit-type colour
// is communicated by the filter chips in the sidebar above (no chip row here).
// Reuses existing classes + tokens (no new CSS).
function PermitLegend({
  activeBuckets, onToggle, onReset, activeGroup
}) {
  const allActive =
    activeBuckets.size === ALL_BUCKET_IDS.length;

  // Active dot colour mirrors the map exactly.
  const dotColour =
    activeGroup === "Residential" ? COLOURS.residential :
    activeGroup === "Commercial"  ? COLOURS.commercial  :
    COLOURS.residential; // "All" → show residential orange
                         // as the dominant colour (84%)

  // Layout: 5 columns, 48px each = 240px total. Wider columns give bucket
  // labels room at legible font sizes. Fits inside the 300px sidebar (18px
  // padding each side → 264px usable, 24px clearance).
  const COL_W  = 48;
  const MAX_R  = VALUE_BUCKETS[4].radius; // 19
  const SVG_H  = MAX_R * 2 + 4;          // 42px
  const SVG_W  = VALUE_BUCKETS.length * COL_W; // 240px

  return (
    <div className="legend">

      {/* ── Construction value header ─────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span className="legend-title">
          Construction value
        </span>
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

      {/* ── Nested baseline circles ───────────────────
          All circles share the same bottom baseline.
          This is the cartographic gold standard for
          proportional symbol legends (Axis Maps, ESRI).
          Active = filled with dotColour + white halo.
          Inactive = outlined dashed ring, 40% opacity.
          Invisible expanded hit area (r=12 min) for
          comfortable clicking on tiny circles. */}
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        aria-label="Construction value size reference.
          Click each circle to filter."
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Baseline rule */}
        <line
          x1={0} y1={SVG_H - 1}
          x2={SVG_W} y2={SVG_H - 1}
          stroke="var(--border)"
          strokeWidth="0.75"
        />

        {VALUE_BUCKETS.map((b, i) => {
          const active = activeBuckets.has(b.id);
          const cx = i * COL_W + COL_W / 2;
          // Baseline alignment: bottom edge of circle
          // sits on the baseline line.
          const cy = SVG_H - 1 - b.radius;

          return (
            <g
              key={b.id}
              onClick={() => onToggle(b.id)}
              style={{ cursor: "pointer" }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(b.id);
                }
              }}
              aria-pressed={active}
              aria-label={`${b.label}: ${
                active ? "visible, click to hide"
                       : "hidden, click to show"
              }`}
            >
              {/* Invisible expanded hit area */}
              <circle
                cx={cx} cy={cy}
                r={Math.max(b.radius, 12)}
                fill="transparent"
              />
              {active ? (
                <circle
                  cx={cx} cy={cy} r={b.radius}
                  fill={dotColour}
                  stroke="rgba(255,255,255,0.75)"
                  strokeWidth={1.5}
                  opacity={0.85}
                />
              ) : (
                <circle
                  cx={cx} cy={cy} r={b.radius}
                  fill="none"
                  stroke="var(--text-muted)"
                  strokeWidth={1}
                  strokeDasharray="2 1.5"
                  opacity={0.35}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* ── Value label buttons below each circle ─── */}
      <div style={{
        display: "flex",
        width: SVG_W,
        marginTop: 3,
      }}>
        {VALUE_BUCKETS.map((b) => {
          const active = activeBuckets.has(b.id);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              style={{
                flex: `0 0 ${COL_W}px`,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 1px 0",
                textAlign: "center",
                fontSize: "0.72rem",
                color: active
                  ? "var(--text)"
                  : "var(--text-muted)",
                fontFamily: "inherit",
                lineHeight: 1.3,
                opacity: active ? 1 : 0.55,
                transition: "opacity 150ms",
              }}
            >
              {b.label}
            </button>
          );
        })}
      </div>

      <p style={{
        fontSize: "0.72rem",
        color: "var(--text-muted)",
        marginTop: 7,
        lineHeight: 1.45,
      }}>
        Click any circle or label to show/hide that tier.
      </p>
    </div>
  );
}

// Match the .sb collapse transition (index.css) so we resize the map only after
// the sidebar has finished its width transition.
const SIDEBAR_TRANSITION_MS = 220;

// Animate a number from 0 → target on mount (ease-out cubic). Signals the figure
// is computed, not static copy. Returns the current integer value.
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(target * ease));
      if (p < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [target, duration]);
  return val;
}

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

  // Count-up of the permit-point total shown in sb-sub.
  const permitCount = useCountUp(226184);

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    document.title = `Building Activity · Edmonton ${year} | AREF`;
    return () => { document.title = "AREF Open Data Centre"; };
  }, [year]);

  // Bottom-shadow cue when the sidebar overflows (content continues below).
  const sbRef = useRef(null);
  useEffect(() => {
    const el = sbRef.current;
    if (!el) return;
    const check = () => {
      const overflows = el.scrollHeight > el.clientHeight + 4;
      el.classList.toggle("sb-scroll-shadow", overflows);
    };
    check();
    el.addEventListener("scroll", check);
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  // No-coordinate count for the selected year. The map only plots permits that
  // HAVE coordinates; the no-coord share spikes in recent years (City geocoding
  // lag), so stating it is honest rather than silently understating.
  const cov = coverageForYear(coverage, year);
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  return (
    <article className="content-map">
      <aside ref={sbRef} className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year}</h1>
          <p className="sb-sub">
            {permitCount.toLocaleString()} permit points, 2009–2026. Orange =
            residential, violet = commercial. Dot size = construction value tier.
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

          {/* Permit type — colour-coded filter chips (the real control). Each
              chip carries the same hue as its map dots, so selecting one reads
              directly: "show the orange/violet dots". */}
          <div style={{ marginBottom: 12 }}>
            <div className="opt-toggle-label">Permit type</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "nowrap", overflow: "hidden" }}>
              {[
                { key: "All",         colour: null },
                { key: "Residential", colour: COLOURS.residential },
                { key: "Commercial",  colour: COLOURS.commercial  },
              ].map(({ key, colour }) => {
                const isActive = group === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGroup(key)}
                    aria-pressed={isActive}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: colour ? 5 : 0,
                      padding: "4px 11px",
                      borderRadius: 999,
                      border: `1.5px solid ${
                        isActive && colour ? colour
                        : isActive        ? "var(--accent)"
                        :                   "var(--border)"
                      }`,
                      background: isActive && colour
                        ? colour + "18"
                        : isActive
                          ? "var(--accent-soft)"
                          : "transparent",
                      color: isActive && colour
                        ? colour
                        : isActive
                          ? "var(--accent-dark)"
                          : "var(--text-muted)",
                      fontSize: "0.78rem",
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: "inherit",
                      cursor: "pointer",
                      lineHeight: 1.5,
                      transition:
                        "background 150ms, border-color 150ms, color 150ms",
                    }}
                  >
                    {colour && (
                      <svg width="8" height="8" viewBox="0 0 8 8"
                        aria-hidden="true">
                        <circle
                          cx="4" cy="4" r="3.5"
                          fill={isActive ? colour : "none"}
                          stroke={colour}
                          strokeWidth="1.2"
                        />
                      </svg>
                    )}
                    {key}
                  </button>
                );
              })}
            </div>
          </div>

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
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            lineHeight: 1.45,
            margin: "4px 0 10px",
            display: "flex",
            gap: 5,
            alignItems: "flex-start",
          }}>
            <span aria-hidden="true"
              style={{ flex: "0 0 auto", marginTop: 1 }}>
              ⚠
            </span>
            <span>
              {fmtNumber(nNoCoord)} of{" "}
              {fmtNumber(cov.n_total)} permits{" "}
              ({Math.round(Number(cov.pct_no_coord) * 100)}%){" "}
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
