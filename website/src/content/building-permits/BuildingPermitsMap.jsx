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
  stripBuildingCode,
} from "./permitStyle.js";
import {
  YEARS,
  DEFAULT_YEAR,
  DEFAULT_GROUP,
  MONTHS,
  DEFAULT_MONTH,
} from "./dataSources.js";
import { parseCsvAsObjects } from "../report-card/parseCsv.js";
import { fmtNumber, fmtCurrency } from "../../utils/format.js";
import { assetUrl } from "../../utils/assetUrl.js";

// Per-year coverage table — how many permits exist vs. how many are mappable.
// Served from /public (a tiny 18-row CSV), a plain static fetch.
const COVERAGE_URL = assetUrl("/data/building-permits/yeg_building-permits_coverage.csv");

// Find the coverage row for one year. CSV cells are strings, so compare year
// numerically. Returns null when the year isn't in the table.
function coverageForYear(rows, year) {
  return rows.find((r) => Number(r.year) === year) || null;
}

// The construction-value tier selector: a 5-card grid. Each card is a native
// <button> (free keyboard + touch a11y) showing a proportional circle coloured
// to the active permit type — solid for a single group, a diagonal split
// gradient (orange/violet) for "All". Active cards carry a coloured border + bg;
// inactive cards a dashed ring + dimmed. Reuses existing tokens (no new CSS).
function PermitLegend({ activeBuckets, onToggle, onReset, activeGroup }) {
  const allActive = activeBuckets.size === ALL_BUCKET_IDS.length;

  // Circle fill per active group.
  // "All" → diagonal split gradient (both colours visible).
  // Single group → solid colour matching map dots.
  const isAll = activeGroup === "All";
  const resColour = COLOURS.residential;  // #f57c00 orange
  const comColour = COLOURS.commercial;   // #7b2fa0 violet

  // Gradient id must be unique per bucket to avoid SVG id collisions.
  function circleContent(bucketId, radius) {
    const cx = radius + 2;
    const cy = radius + 2;
    const size = (radius + 2) * 2;
    const gradId = `cv-grad-${bucketId}`;

    if (isAll) {
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="50%" stopColor={resColour} />
              <stop offset="50%" stopColor={comColour} />
            </linearGradient>
          </defs>
          <circle cx={cx} cy={cy} r={radius}
            fill={`url(#${gradId})`}
            stroke="rgba(255,255,255,0.8)"
            strokeWidth="1.2"
          />
        </svg>
      );
    }

    const colour = activeGroup === "Residential" ? resColour : comColour;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true">
        <circle cx={cx} cy={cy} r={radius}
          fill={colour}
          stroke="rgba(255,255,255,0.8)"
          strokeWidth="1.2"
        />
      </svg>
    );
  }

  // Tier radii matching VALUE_BUCKETS proportions:
  // micro=4, small=6, medium=8, large=11, major=15
  const TIER_RADII = [4, 6, 8, 11, 15];

  return (
    <div className="legend">

      {/* ── Section header + reset ─────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
      }}>
        <span className="legend-title" style={{ margin: 0 }}>
          Construction value
        </span>
        {!allActive && (
          <button
            type="button"
            onClick={onReset}
            style={{
              fontSize: "0.66rem",
              padding: "2px 9px",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--bg-soft)",
              color: "var(--text-muted)",
              fontFamily: "inherit",
              cursor: "pointer",
              lineHeight: 1.6,
              transition: "border-color 120ms, color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--text-muted)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            Show all
          </button>
        )}
      </div>

      {/* ── 5-card grid ────────────────────────────── */}
      {/* Each card is a native <button> — pointer cursor,
          keyboard (Tab/Enter/Space), and 44px+ touch
          targets come for free. No SVG role="button"
          fragility. Card border = on/off signal,
          independent of circle size. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 4,
        marginBottom: 6,
      }}>
        {VALUE_BUCKETS.map((b, i) => {
          const active = activeBuckets.has(b.id);
          const radius = TIER_RADII[i];

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b.id)}
              aria-pressed={active}
              aria-label={`${b.label}: ${
                active ? "visible, click to hide"
                       : "hidden, click to show"
              }`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
                padding: "7px 3px 6px",
                minHeight: 52,
                borderRadius: 7,
                // Gel tier card: green raised when active, cream raised when
                // inactive. The group colour (orange/violet/split) still reads
                // from the circle inside the card, so coding isn't lost.
                border: active
                  ? "1.5px solid rgba(46,125,50,0.35)"
                  : "1px solid rgba(0,0,0,0.12)",
                background: active
                  ? "linear-gradient(180deg, #e8f5e9 0%, #c8e6c9 100%)"
                  : "linear-gradient(180deg, #f8f6f2 0%, #e8e4dc 100%)",
                boxShadow: active
                  ? "0 1px 0 rgba(255,255,255,0.8) inset, 0 -1px 0 rgba(0,0,0,0.08) inset, 0 1px 3px rgba(46,125,50,0.18)"
                  : "0 1px 0 rgba(255,255,255,0.9) inset, 0 -1px 0 rgba(0,0,0,0.06) inset, 0 1px 2px rgba(0,0,0,0.10)",
                cursor: "pointer",
                fontFamily: "inherit",
                transition:
                  "opacity 150ms, border-color 150ms, background 150ms",
                opacity: active ? 1 : 0.42,
              }}
              onMouseEnter={(e) => {
                if (!activeBuckets.has(b.id)) {
                  e.currentTarget.style.opacity = "0.72";
                  e.currentTarget.style.borderColor =
                    "var(--text-muted)";
                } else {
                  // Slight deepen on hover for active cards
                  e.currentTarget.style.filter =
                    "brightness(0.94)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity =
                  activeBuckets.has(b.id) ? "1" : "0.42";
                e.currentTarget.style.borderColor = active
                  ? "rgba(46,125,50,0.35)"
                  : "rgba(0,0,0,0.12)";
                e.currentTarget.style.filter = "";
              }}
            >
              {/* Circle — filled when active, dashed
                  outline when inactive. Size = tier size. */}
              {active
                ? circleContent(b.id, radius)
                : (
                  <svg
                    width={(radius + 2) * 2}
                    height={(radius + 2) * 2}
                    viewBox={`0 0 ${(radius+2)*2} ${(radius+2)*2}`}
                    aria-hidden="true"
                  >
                    <circle
                      cx={radius + 2}
                      cy={radius + 2}
                      r={radius}
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="1.2"
                      strokeDasharray="2 1.5"
                    />
                  </svg>
                )
              }

              {/* Label below circle */}
              <span style={{
                fontSize: "0.58rem",
                lineHeight: 1.2,
                textAlign: "center",
                color: active
                  ? "var(--text)"
                  : "var(--text-muted)",
                wordBreak: "break-all",
                hyphens: "auto",
                maxWidth: "100%",
              }}>
                {b.label}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{
        fontSize: "0.66rem",
        color: "var(--text-muted)",
        lineHeight: 1.4,
      }}>
        Click any tier to show or hide.
      </p>
    </div>
  );
}

export default function BuildingPermitsMap() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [map, setMap] = useState(null);
  const [coverage, setCoverage] = useState([]);
  // Pattern B (point map): stats for the LAST CLICKED dot — point-map hover is
  // on dots, not polygons, so the sidebar panel updates on click, not hover.
  const [clickedFeature, setClickedFeature] = useState(null);
  // Factory init so new Set(...) runs ONCE on mount, not every render.
  const [activeBuckets, setActiveBuckets] = useState(
    () => new Set(DEFAULT_ACTIVE_BUCKETS)
  );

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

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    document.title = `Building Activity · Edmonton ${year}`;
    return () => { document.title = "Open Data Centre"; };
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
      <aside ref={sbRef} className="sb" aria-label="Map sidebar">
        {/* Fixed-width holder so content never reflows as .sb animates its width — see .sb-inner in index.css. */}
        <div className="sb-inner">
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year}</h1>
        </div>

        <section className="sb-section">
          <div className="sb-select-field">
            <span className="sb-select-label">
              Year <strong className="sb-year-value">{year}</strong>
            </span>
            {/* All 18 years live in ONE permits.pmtiles, so the slider just drives
                the same instant setFilter (no file swap). min/max from YEARS
                (manifest-derived, no literals); YEARS is contiguous so step = 1
                maps every position to a real year. */}
            <input
              type="range"
              className="sb-year-slider"
              aria-label="Year"
              min={Math.min(...YEARS)}
              max={Math.max(...YEARS)}
              step={1}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
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
                      // Gel: raised glossy lift on the active chip only.
                      boxShadow: isActive
                        ? "0 1px 0 rgba(255,255,255,0.8) inset, 0 1px 3px rgba(0,0,0,0.14)"
                        : undefined,
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

        {/* Pattern B — last-clicked dot panel (point map: click, not hover). */}
        {clickedFeature ? (
          <section className="sb-section sb-hover-panel">
            <p className="sb-hover-name">{clickedFeature.address ?? "—"}</p>
            <div className="sb-hover-rows">
              <div className="sb-hover-row">
                <span className="sb-hover-k">Building type</span>
                <span className="sb-hover-v">{stripBuildingCode(clickedFeature.building_type ?? "")}</span>
              </div>
              <div className="sb-hover-row">
                <span className="sb-hover-k">Construction value</span>
                <span className="sb-hover-v">{fmtCurrency(clickedFeature.construction_value)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="sb-section sb-hover-panel sb-hover-empty">
            <p className="sb-hover-hint">Click a permit dot for detail</p>
          </section>
        )}

        <p className="sb-ref" style={{
          borderTop: "1px solid var(--border-soft)",
          paddingTop: 10,
          marginTop: 8,
        }}>
          Source: City of Edmonton Open Data (24uj-dj8v). 226,184 permit points,
          2009–2026.
        </p>
        </div>{/* /sb-inner */}
      </aside>

      <div className="canvas-wrap">
        {/* PMTiles point map (no MapErrorBoundary); skeleton shows until onLoad. */}
        {!map && <MapSkeleton />}
        <PermitMapView className="canvas" onLoad={setMap} onPick={setClickedFeature} />
      </div>
    </article>
  );
}
