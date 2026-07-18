// =============================================================================
// BuildingPermitsMap.jsx
//
// The Building Permits route (nav leaf "Construction & Improvement"). A .sb
// sidebar of controls beside a full-bleed .canvas-wrap holding the map. This is
// a POINT-symbol map (orange/violet dots), now on the SHARED components/MapView
// with a per-year GeoJSON source (one file per year under permit-points/).
//
// The Year slider swaps the source file (MapView recreates the source); Permit type
// (job_group), Month, and the construction-value tiers are client-side
// map.setFilter on the loaded year (instant, no refetch).
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";

import MapView from "../../components/MapView.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import { wirePermitPopup } from "./permitInteractions.js";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import {
  LAYER_ID,
  SOURCE_ID,
  COLOURS,
  BASEMAP_STYLE,
  MAP_VIEW,
  permitCircleLayer,
  buildPermitFilter,
  VALUE_BUCKETS,
  ALL_BUCKET_IDS,
  DEFAULT_ACTIVE_BUCKETS,
  stripBuildingCode,
} from "./permitStyle.js";
import {
  loadPermitManifest,
  permitYears,
  permitDefaultYear,
  resolvePermitPointsUrl,
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

// The circle layer spec — built once (MapView reads `layers` only at mount).
const POINT_LAYERS = [permitCircleLayer()];

export default function BuildingPermitsMap() {
  // Year list + default come from the BP manifest (no literals); null until it
  // loads, which gates the slider, the map filter, and the tab title below.
  const [years, setYears] = useState([]);
  // `year` is the LIVE slider value — it drives the readout so a drag feels instant. `loadedYear`
  // is the DEBOUNCED value — it drives the data load (pointsUrl → MapView source-swap, the count
  // fetch, the filter re-assert, the coverage note). So a fast drag updates the readout every step
  // but issues ONE load, at rest (each year is a 2.6–7.7 MB fetch+parse; a drag would otherwise
  // fire one per intermediate year). The debounce is a load/UX win on its own — it was first hoped
  // to also fix the high-zoom point CLIPPING, but a single paced swap still clipped: that was
  // root-caused to setData and fixed in MapView by RECREATING the source (see MapView.jsx).
  // Everything data-shaped below reads loadedYear; only the readout reads year.
  const [year, setYear] = useState(null);
  const [loadedYear, setLoadedYear] = useState(null);
  const [group, setGroup] = useState(DEFAULT_GROUP);
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [map, setMap] = useState(null);
  const [coverage, setCoverage] = useState([]);
  // The year's point features, loaded here ONLY to count the honest shown/excluded totals for
  // the note (the map's own copy lives in MapView's source). Keyed by year so a stale count is
  // never paired with a new year's coverage row. Same URL as MapView → browser cache serves it.
  const [points, setPoints] = useState({ year: null, features: [] });
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

  // Year catalogue (list + default) from the published BP manifest — no literals.
  // A failed load leaves the slider in its loading state; the map still renders.
  useEffect(() => {
    let cancelled = false;
    loadPermitManifest()
      .then((m) => {
        if (cancelled) return;
        setYears(permitYears(m));
        // Set both together so the FIRST load is immediate (not delayed by the debounce).
        setYear(permitDefaultYear(m));
        setLoadedYear(permitDefaultYear(m));
      })
      .catch((err) => console.error("[BuildingPermitsMap] year catalogue:", err.message));
    return () => { cancelled = true; };
  }, []);

  // Debounce year → loadedYear: while the slider is moving, `year` updates every step but the
  // load is deferred. Each change clears the pending timer and starts a fresh one, so loadedYear
  // only advances 250 ms after the LAST change (drag at rest). setState lives in the timer
  // callback (async), not the effect body, so it does not trigger cascading renders. The first
  // value is seeded above, so this only handles subsequent drags.
  useEffect(() => {
    if (year == null || year === loadedYear) return undefined;
    const t = setTimeout(() => setLoadedYear(year), 250);
    return () => clearTimeout(t);
  }, [year, loadedYear]);

  // Re-apply the type/month/value filter when the map is ready or a control changes. setFilter is
  // instant. A YEAR (loadedYear) change is a source swap (geojsonUrl below → MapView recreates it);
  // loadedYear stays in the deps so the filter is re-asserted on the newly loaded data. Guard on
  // `map` + `loadedYear` so we don't filter before onLoad / the manifest land.
  useEffect(() => {
    if (!map || loadedYear == null) return;
    map.setFilter(
      LAYER_ID,
      buildPermitFilter(group, month, activeBuckets)
    );
  }, [map, loadedYear, group, month, activeBuckets]);

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

  // Load the year's points to COUNT the note's shown/excluded totals (separate from the map's
  // source load — same URL, cache-served; cost is one JSON.parse per year). Keyed on loadedYear,
  // so it too is debounced — a drag issues ONE parse at rest, not one per intermediate year (§4).
  // The `cancelled` flag drops a superseded response so a slow load never lands out of order. A
  // failed load leaves the count empty → the note hides (logged, not thrown).
  useEffect(() => {
    if (loadedYear == null) return undefined;
    let cancelled = false;
    fetch(resolvePermitPointsUrl(loadedYear))
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((gj) => { if (!cancelled) setPoints({ year: loadedYear, features: gj.features ?? [] }); })
      .catch((err) => console.error("[BuildingPermitsMap] point count:", err.message));
    return () => { cancelled = true; };
  }, [loadedYear]);

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    if (year == null) return;
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

  // No-coordinate count for the LOADED year (not the live drag value) — the note describes the
  // data actually on the map. The no-coord share spikes in recent years (City geocoding lag), so
  // stating it is honest rather than silently understating.
  const cov = coverageForYear(coverage, loadedYear);
  // Coverage span for the source note — derived from the manifest year list, so
  // it rolls forward with the data (was a "2009–2026" literal).
  const yearSpan = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  // Filter-aware honesty counts, computed from the LOADED features + the live filter (mirrors
  // buildPermitFilter) so the note describes exactly what's on the map right now, not the whole
  // year. nShown is the true rendered set (recomputes on type/month/tier). nMappedNoValue is the
  // mapped permits with NO construction value — counted from the file (not the coverage CSV's
  // n_no_value, which overlaps n_no_coord and can't resolve coords∩value). points is keyed by
  // loadedYear, so we only count once its features match the loaded year (never a stale one).
  const shownStats = useMemo(() => {
    const feats = points.year === loadedYear ? points.features : [];
    const g = group === "All" ? null : group.toLowerCase();
    const allTiers = activeBuckets.size === ALL_BUCKET_IDS.length;
    let nShown = 0, nMappedNoValue = 0;
    for (const f of feats) {
      const p = f.properties;
      const v = p.construction_value;
      if (v == null) { nMappedNoValue++; continue; }   // no value (null) → excluded, mirrors the map's ["!=", get, null]
      if (g && p.job_group !== g) continue;
      if (month !== 0 && p.month_number !== month) continue;
      if (!allTiers && !VALUE_BUCKETS.some((b) => activeBuckets.has(b.id) && v >= b.min && v < b.max)) continue;
      nShown++;
    }
    return { nShown, nMappedNoValue };
  }, [points, loadedYear, group, month, activeBuckets]);

  // The per-year point file, resolved from the DEBOUNCED loadedYear — a change here is what
  // drives MapView's source-swap (recreate), so the map reloads once at rest, not per drag step. null
  // until the manifest seeds loadedYear.
  const pointsUrl = loadedYear != null ? resolvePermitPointsUrl(loadedYear) : null;

  return (
    <article className="content-map">
      <aside ref={sbRef} className="sb" aria-label="Map sidebar">
        {/* Fixed-width holder so content never reflows as .sb animates its width — see .sb-inner in index.css. */}
        <div className="sb-inner">
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">Edmonton — {year ?? "…"}</h1>
        </div>

        <section className="sb-section">
          <div className="sb-select-field">
            <span className="sb-select-label">
              Year <strong className="sb-year-value">{year ?? "…"}</strong>
            </span>
            {/* Each year is its own GeoJSON file: moving the slider swaps the
                source (MapView recreates it) and the type/month/value filter re-applies.
                min/max come from the manifest year list (no literals); years are
                contiguous so step = 1 maps every position to a real year. */}
            {year != null && (
              <input
                type="range"
                className="sb-year-slider"
                aria-label="Year"
                min={Math.min(...years)}
                max={Math.max(...years)}
                step={1}
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            )}
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

        {/* Honesty label (§6): ONE combined, filter-aware statement. Headlines the SHOWN count
            (the true rendered set, recomputes on type/month/tier), then the two involuntary
            exclusions at year scope — no map location (the geocoding cliff, kept with its %) and
            no construction value. ⚠ prefix + existing tokens, no new CSS. */}
        {cov && points.year === loadedYear && (
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
              Showing {fmtNumber(shownStats.nShown)} permits.{" "}
              Of {fmtNumber(Number(cov.n_total))} for {loadedYear},{" "}
              {fmtNumber(nNoCoord)} ({Math.round(Number(cov.pct_no_coord) * 100)}%){" "}
              have no map location and {fmtNumber(shownStats.nMappedNoValue)}{" "}
              have no construction value, so they cannot be shown.
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
          {yearSpan}.
        </p>
        </div>{/* /sb-inner */}
      </aside>

      <div className="canvas-wrap">
        {/* Per-year GeoJSON point map on the shared MapView; skeleton until the
            first paint. The Year slider changes geojsonUrl -> MapView recreates the source. */}
        {!map && <MapSkeleton />}
        {pointsUrl && (
          <MapView
            className="canvas"
            basemapStyle={BASEMAP_STYLE}
            geojsonUrl={pointsUrl}
            view={MAP_VIEW}
            sourceId={SOURCE_ID}
            layers={POINT_LAYERS}
            onLoad={(m) => {
              // MapView is section-agnostic, so the BP-specific wiring lives here:
              // popups/hover/fly-to, and disabling dbl-click-zoom (dbl-click = fly-to).
              wirePermitPopup(m, setClickedFeature);
              m.doubleClickZoom.disable();
              // Land on the SAME pitched HOME camera as PA / DU / BC (the shared mapCamera
              // preset) — a jump under the skeleton, matching their first-load. The Year slider
              // swaps the source, never the camera, so this fires once.
              applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: false });
              setMap(m);
            }}
          />
        )}
      </div>
    </article>
  );
}
