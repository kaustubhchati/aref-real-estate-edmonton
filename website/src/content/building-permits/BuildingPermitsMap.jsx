// =============================================================================
// BuildingPermitsMap.jsx
//
// The Building Permits route (nav leaf "Construction & Improvement"). STANDARDIZED
// to the Property Assessment instrument chrome (DESIGN_SYSTEM.md): a full-bleed
// .canvas-wrap map underlaid by the transparent .pa-float instrument column. BP is
// single-city + NON-console, so it carries ONE .pa-card-instrument holding every
// module (title → year → permit type → month → coverage → construction value →
// selected permit → source) — no Data Console, no KPI rail, no city switcher.
//
// This is a POINT-symbol map (orange/violet dots) on the SHARED components/MapView
// with a per-year GeoJSON source (one file per year under permit-points/). The map,
// filters, popups, dots, cross-fade and camera are UNCHANGED — this file is a
// chrome/layout re-skin only.
//
// The Year slider swaps the source file (MapView recreates the source); Permit type
// (job_group), Month, and the construction-value tiers are client-side
// map.setFilter on the loaded year (instant, no refetch).
// =============================================================================

import { useEffect, useMemo, useState } from "react";

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
// gradient (orange/violet) for "All". Dark-skinned to the DESIGN_SYSTEM instrument
// column: inactive = quiet glass key + dimmed (that tier is hidden on the map);
// active = the shared petrol/pearl/teal active material (§6, matches the metric
// chips). The circle FILLS are DATA (§1.3, unchanged); the "Construction Value"
// title now lives in the module's .pa-col-lab above, not in here.
function PermitLegend({ activeBuckets, onToggle, onReset, activeGroup }) {
  const allActive = activeBuckets.size === ALL_BUCKET_IDS.length;

  // Circle fill per active group.
  // "All" → diagonal split gradient (both colours visible).
  // Single group → solid colour matching map dots.
  const isAll = activeGroup === "All";
  const resColour = COLOURS.residential;  // #f57c00 orange (DATA — §1.3)
  const comColour = COLOURS.commercial;   // #7b2fa0 violet (DATA — §1.3)

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
            stroke="rgba(255,255,255,0.85)"
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
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="1.2"
        />
      </svg>
    );
  }

  // Tier radii matching VALUE_BUCKETS proportions:
  // micro=4, small=6, medium=8, large=11, major=15. Legend-only scale (kept
  // separate from the map tier-multiplier by purpose).
  const TIER_RADII = [4, 6, 8, 11, 15];

  return (
    <div className="bp-tiers">

      {/* Reset — the §6 both-clears idiom: coral when there's a hidden tier to
          restore, muted + inert (slot held — Principle 0) when every tier shows. */}
      <div className="bp-tiers-head">
        <button
          type="button"
          className="bp-tier-reset"
          onClick={onReset}
          disabled={allActive}
        >
          Show All
        </button>
      </div>

      {/* 5-card grid — each card is a native <button>: pointer cursor, keyboard
          (Tab/Enter/Space) and touch targets for free. The .active class carries
          the on/off signal (independent of circle size). */}
      <div className="bp-tier-grid">
        {VALUE_BUCKETS.map((b, i) => {
          const active = activeBuckets.has(b.id);
          const radius = TIER_RADII[i];

          return (
            <button
              key={b.id}
              type="button"
              className={`bp-tier-btn${active ? " active" : ""}`}
              onClick={() => onToggle(b.id)}
              aria-pressed={active}
              aria-label={`${b.label}: ${
                active ? "visible, click to hide"
                       : "hidden, click to show"
              }`}
            >
              {/* Circle — filled (DATA colour) when active, dashed outline when
                  inactive. Size = tier size. */}
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
                      stroke="var(--pa-mut)"
                      strokeWidth="1.2"
                      strokeDasharray="2 1.5"
                    />
                  </svg>
                )
              }
              <span className="bp-tier-lab">{b.label}</span>
            </button>
          );
        })}
      </div>

      <p className="bp-tier-hint">Click any tier to show or hide.</p>
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

  // No-coordinate count for the LOADED year (not the live drag value) — the note describes the
  // data actually on the map. The no-coord share spikes in recent years (City geocoding lag), so
  // stating it is honest rather than silently understating.
  const cov = coverageForYear(coverage, loadedYear);
  // Coverage span for the source note — derived from the manifest year list, so
  // it rolls forward with the data (was a "2009–2026" literal).
  const yearSpan = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
  const nNoCoord = cov ? Number(cov.n_no_coord) : 0;

  // Total mapped permit points across all years, for the source citation — the sum of
  // the per-year mapped counts (n_mapped = permits WITH coordinates = the dots this map
  // serves). Derived from the coverage table so it tracks the data on refresh, replacing
  // a stale hardcoded "226,184". Verified equal to the total feature count across the
  // per-year GeoJSONs (§6/§9 refresh-by-design — no year/data literals in the frontend).
  const totalPoints = useMemo(
    () => coverage.reduce((sum, r) => sum + (Number(r.n_mapped) || 0), 0),
    [coverage]
  );

  // Year slider fill %: 0–100 across the manifest's year range, feeding the PA slider's
  // thumb-width-aware track fill via `--pct` (matches consoleControls' YearSliderRow).
  const yearPct = years.length && year != null
    ? ((year - Math.min(...years)) / ((Math.max(...years) - Math.min(...years)) || 1)) * 100
    : 0;

  // Month slider fill %: 0 (All Months) → 12 (December), feeding the SAME --pct track fill
  // as Year so the two column sliders read identically.
  const monthPct = (month / 12) * 100;

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
    <article className="content-map pa-map">
      <div className="pa-canvas">
        {/* ===== FULL-BLEED MAP CANVAS (PA standard) — the map is the FIRST child so it
             underlays the floating instrument column. Per-year GeoJSON point map on the
             shared MapView; the Year slider changes geojsonUrl -> MapView recreates the
             source. Behaviour is UNCHANGED — this is a chrome/layout re-skin. ===== */}
        <div className="canvas-wrap">
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

        {/* ===== INSTRUMENT COLUMN (PA standard, adapted) — BP is single-city +
             non-console, so ONE .pa-card-instrument holds every module. The transparent
             .pa-float keeps its measured width; the card carries the dark surface. ===== */}
        <div className="pa-float pa-column pa-column-lean">
          <section className="pa-card pa-card-instrument">

            {/* TITLE — the section name (the live year rides the Year readout below). */}
            <div className="pa-col-mod pa-col-title">
              <h2 className="pa-id-title">Building Permits</h2>
            </div>

            {/* YEAR — the slider swaps the per-year source (MapView recreates it) and the
                type/month/value filter re-applies. min/max come from the manifest year
                list (no literals); step = 1 maps every position to a real year. Re-classed
                to the shared PA dark slider (--pct drives the teal track fill). */}
            <div className="pa-col-mod pa-col-year">
              <span className="pa-col-lab">
                Year <strong className="pa-col-read">{year ?? "…"}</strong>
              </span>
              {year != null && (
                <input
                  type="range"
                  className="pa-slider pa-year-slider"
                  aria-label="Year"
                  min={Math.min(...years)}
                  max={Math.max(...years)}
                  step={1}
                  value={year}
                  style={{ "--pct": yearPct }}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              )}
            </div>

            {/* PERMIT TYPE — colour-dot chips. The dots are DATA (orange/violet,
                dual-encoded with the label, §1.3); the chip chrome is the shared §6
                glass-key chassis (the .opt-toggle-btn dark skin — active = petrol/pearl/
                teal). Not the monochrome SegmentedControl — it can't carry the data colour. */}
            <div className="pa-col-mod pa-col-type">
              <span className="pa-col-lab">Permit Type</span>
              <div className="opt-toggle-buttons bp-type-toggle">
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
                      className={`opt-toggle-btn${isActive ? " active" : ""}`}
                      onClick={() => setGroup(key)}
                      aria-pressed={isActive}
                    >
                      {colour && (
                        <svg className="bp-type-dot" width="8" height="8" viewBox="0 0 8 8"
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

            {/* MONTH — a slider (0 = All Months, 1–12 = Jan–Dec), the standard column
                control matching Year. The readout names the month; monthPct drives the
                same teal --pct track fill. Filters the loaded year in place (setMonth). */}
            <div className="pa-col-mod pa-col-month">
              <span className="pa-col-lab">
                Month <strong className="pa-col-read">{MONTHS[month]?.label ?? "…"}</strong>
              </span>
              <input
                type="range"
                className="pa-slider pa-month-slider"
                aria-label="Month"
                min={0}
                max={12}
                step={1}
                value={month}
                style={{ "--pct": monthPct }}
                onChange={(e) => setMonth(Number(e.target.value))}
              />
            </div>

            {/* COVERAGE — the §6 honesty label (muted tier): ONE combined, filter-aware
                statement. Headlines the SHOWN count (recomputes on type/month/tier), then
                the two involuntary exclusions at year scope — no map location (the geocoding
                cliff, with its %) and no construction value. Same condition + text +
                fmtNumber calls as before. */}
            {cov && points.year === loadedYear && (
              <p className="pa-col-mod pa-col-note">
                <span className="pa-col-note-mark" aria-hidden="true">⚠</span>
                <span>
                  Showing {fmtNumber(shownStats.nShown)} permits.{" "}
                  Of {fmtNumber(Number(cov.n_total))} for {loadedYear},{" "}
                  {fmtNumber(nNoCoord)} ({Math.round(Number(cov.pct_no_coord) * 100)}%){" "}
                  have no map location and {fmtNumber(shownStats.nMappedNoValue)}{" "}
                  have no construction value, so they cannot be shown.
                </span>
              </p>
            )}

            {/* CONSTRUCTION VALUE — the interactive value-tier filter. The title lives in
                the module label; the tiers + reset are the PermitLegend below. */}
            <div className="pa-col-mod pa-col-legend">
              <span className="pa-col-lab">Construction Value</span>
              <PermitLegend
                activeBuckets={activeBuckets}
                onToggle={toggleBucket}
                onReset={resetBuckets}
                activeGroup={group}
              />
            </div>

            {/* SELECTED PERMIT — the last-clicked dot (point map: click, not hover).
                Fixed-height slot (Principle 0) so the column doesn't jump on pick. */}
            <div className="pa-col-mod pa-col-detail-mod">
              {clickedFeature ? (
                <div className="pa-col-detail">
                  <p className="pa-col-detail-name">{clickedFeature.address ?? "—"}</p>
                  <div className="pa-col-detail-rows">
                    <div className="pa-col-detail-row">
                      <span className="pa-col-detail-k">Building Type</span>
                      <span className="pa-col-detail-v">{stripBuildingCode(clickedFeature.building_type ?? "")}</span>
                    </div>
                    <div className="pa-col-detail-row">
                      <span className="pa-col-detail-k">Construction Value</span>
                      <span className="pa-col-detail-v">{fmtCurrency(clickedFeature.construction_value)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pa-col-detail-empty">
                  <p className="pa-col-detail-hint">Click a permit dot for detail</p>
                </div>
              )}
            </div>

            {/* SOURCE — a provenance citation reads at the PRIMARY tier (§6 carve-out).
                The point total is DERIVED from the coverage table (sum of mapped permits),
                so it tracks the data instead of a stale literal. */}
            <div className="pa-col-mod pa-col-foot">
              <p className="pa-col-cite">
                Source: City of Edmonton Open Data (24uj-dj8v).{" "}
                {coverage.length ? fmtNumber(totalPoints) : "…"} permit points, {yearSpan}.
              </p>
            </div>

          </section>
        </div>
      </div>
    </article>
  );
}
