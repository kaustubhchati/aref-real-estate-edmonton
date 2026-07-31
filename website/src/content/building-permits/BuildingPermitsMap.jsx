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

import { useEffect, useMemo, useRef, useState } from "react";

import MapView from "../../components/MapView.jsx";
import { siteConfig } from "../../config/siteConfig.js";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import IdentityCard from "../../components/IdentityCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
// City axis reused from PA's config (the single source of the city list) so BP's switcher is in
// guaranteed parity with PA — same cities, same default. BP mirrors PA's LOCAL city STATE (there
// is no shared city store; PA's is a useState too).
import { CITIES, DEFAULT_CITY } from "../property-assessment/dataSources.js";
import { wirePermitInteractions } from "./permitInteractions.js";
import PermitInforail from "./PermitInforail.jsx";
import { HOME_VIEW, applyCameraPreset } from "../../components/mapCamera.js";
import { makeIconButtonControl, railGlyph } from "../../components/mapControls.js";
import { ICON_RECENTRE, ICON_INFO, ICON_DATABASE, ICON_MOUSE, ICON_MOUSE_CLICK, ICON_CLICK, ICON_SLIDERS } from "../../components/mapIcons.js";
import MapTipsPopover, { Glyph } from "../../components/MapTipsPopover.jsx";
import AttributionPanel from "../../components/AttributionPanel.jsx";
import { YearSliderRow, CalibTicks } from "../../components/consoleControls.jsx";
import {
  LAYER_ID,
  SOURCE_ID,
  COLOURS,
  BASEMAP_STYLE,
  MAP_VIEW,
  permitCircleLayer,
  permitHeatLayers,
  HEAT_CATEGORIES,
  heatRampColours,
  HEAT_RAMP_MODE,
  buildPermitFilter,
  buildHeatFilter,
  VALUE_BUCKETS,
  ALL_BUCKET_IDS,
  DEFAULT_ACTIVE_BUCKETS,
  BOUNDARY_SOURCE_ID,
  CITY_BOUNDARY_PATH,
  TINT_BEFORE_ID,
  SHOW_BOUNDARY_LINE,
  cityTintLayer,
  cityBoundaryLineLayer,
  LANDUSE_ABOVE_TINT,
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
import { fmtNumber } from "../../utils/format.js";
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

// The map layers — built once (MapView reads `layers` only at mount). Two single-hue
// heatmaps (the city OVERVIEW) UNDER the categorical dots (STREET level); they cross-fade
// across the crossover band. Heatmaps first so the dots draw on top.
const POINT_LAYERS = [...permitHeatLayers(), permitCircleLayer()];

// The SMOOTH-mode density-legend gradient for one category, from its coloured ramp stops —
// so the legend bar reads exactly the colours the map paints (one source of truth). Anchor
// the crust colour at 0% so the bar starts on the DARK crust (Fewer) and climbs its true
// non-linear incandescent path to the BRIGHT glow core at 100% (More) — the same crust→glow
// direction the map paints. No hue literal here — every colour comes from the ramp.
function heatRampGradient(stops) {
  const parts = [
    `${stops[0].css} 0%`,
    ...stops.map((s) => `${s.css} ${Math.round(s.d * 100)}%`),
  ];
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

// Month — the point map's SECOND tuning slider, mirroring consoleControls' YearSliderRow
// shape (so it inherits the .pa-tune-* bay chrome) but single-value 0–12, where 0 = "All
// Months". The readout NAMES the month (MONTHS[month].label); the ends read All → Dec.
// Principle 0: the track is fixed, the handle + readout move. CalibTicks marks all 13 stops,
// thickening every third (All · Mar · Jun · Sep · Dec).
function MonthSliderRow({ month, onChange, pct }) {
  return (
    <div className="pa-tune-ctrl">
      <div className="pa-tune-ctrl-head">
        <span className="pa-tune-ctrl-name">Month</span>
        <strong className="pa-tune-active">{MONTHS[month]?.label ?? "…"}</strong>
      </div>
      <div className="pa-tune-track-wrap">
        <input
          type="range"
          className="pa-slider pa-month-slider"
          aria-label="Month"
          min={0}
          max={12}
          step={1}
          value={month}
          style={{ "--pct": pct }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <CalibTicks count={13} majorEvery={3} />
      </div>
      <div className="pa-tune-ends"><span>All</span><span>Dec</span></div>
    </div>
  );
}

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
  // The right INFORAIL's two interaction channels (Principle 0 — one fixed frame, content
  // swaps): `hoveredFeature` drives the light runner as the cursor moves over dots;
  // `selectedFeature` drives the pinned full detail on click and takes precedence over hover.
  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  // Factory init so new Set(...) runs ONCE on mount, not every render.
  const [activeBuckets, setActiveBuckets] = useState(
    () => new Set(DEFAULT_ACTIVE_BUCKETS)
  );
  // The "i" (About & tips) popover open state — the coverage/honesty caveat lives inside it.
  const [infoOpen, setInfoOpen] = useState(false);
  // The bottom-right Data & Attribution panel — the single attribution surface (the native
  // MapLibre bar was removed; this panel carries every licence string).
  const [attribOpen, setAttribOpen] = useState(false);

  // City axis — mirrors PA's LOCAL city state + its S-E gating. BP's permit data is Edmonton-only,
  // so `cityHasData` is BP's equivalent of PA's `url` presence check (PA: years.length ? url : null):
  // the active city having data. Any other city (Calgary today) → the SAME gated / no-data state PA
  // shows in S-E — the Identity card + switcher persist, the map/tuning/instrument card are gated
  // and an EmptyState fills the canvas. The switcher genuinely drives the axis.
  const [city, setCity] = useState(DEFAULT_CITY);
  const cityHasData = city === DEFAULT_CITY;
  function changeCity(next) {
    setCity(next);
    setMap(null);              // drop the soon-unmounted map ref so a clean instance mounts on return
    setSelectedFeature(null);  // clear the inforail + "i" on a city switch (no stale selection)
    setHoveredFeature(null);
    setInfoOpen(false);
    setAttribOpen(false);
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
    // Dots: the type/month/value filter (includes the no-value exclusion).
    map.setFilter(
      LAYER_ID,
      buildPermitFilter(group, month, activeBuckets)
    );
    // Heatmaps: the SAME filtered set, each ALSO gated to its own job_group, so heat and
    // dots always show identical data. Picking a single Permit Type empties the other
    // category's heatmap (its category ∩ the picked category = ∅) — same as the dots.
    for (const { id, category } of HEAT_CATEGORIES) {
      map.setFilter(id, buildHeatFilter(category, group, month, activeBuckets));
    }
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

  // Month slider fill %: 0 (All Months) → 12 (December), feeding the `--pct` track fill of
  // the tuning-bay MonthSliderRow. (Year's fill is computed inside consoleControls'
  // YearSliderRow from year/yMin/yMax, so it needs no companion here.)
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

  // ── Nav stack: the two BP-added rail controls (recentre + info "i"), mounted ONCE and
  // sharing the rail chassis with MapLibre's own zoom / fullscreen (makeIconButtonControl).
  // recentre → the HOME preset (BP has no selection to fit, so the label is always "home");
  // info → the About & tips popover. The "i" GLOWS while its panel is open (setActive) —
  // load-bearing, since the popover has no × (it closes via the "i" or Esc). Order = stack
  // order: info lands at the bottom, below zoom / fullscreen / recentre.
  const infoCtrlRef = useRef(null);
  useEffect(() => { infoCtrlRef.current?.setActive(infoOpen); }, [infoOpen]);
  // The database control (bottom-right) glows while the attribution panel is open —
  // the same load-bearing cue as the "i" (no × on either popover).
  const attribCtrlRef = useRef(null);
  useEffect(() => { attribCtrlRef.current?.setActive(attribOpen); }, [attribOpen]);
  useEffect(() => {
    if (!map) return undefined;
    const reset = makeIconButtonControl({
      svg: railGlyph(ICON_RECENTRE),
      label: "Return to home view",
      onClick: () => applyCameraPreset(map, HOME_VIEW.Edmonton, { ease: true }),
    });
    const info = makeIconButtonControl({
      svg: railGlyph(ICON_INFO),
      label: "About & tips",
      onClick: () => setInfoOpen((o) => !o),
    });
    // Data & Attribution — the bottom-right database control (distinct from the top-right
    // "i"), the single attribution surface now the native bar is gone.
    const attrib = makeIconButtonControl({
      svg: railGlyph(ICON_DATABASE),
      label: "Data & attribution",
      onClick: () => setAttribOpen((o) => !o),
    });
    map.addControl(reset, "top-right");
    map.addControl(info, "top-right");
    map.addControl(attrib, "bottom-right");
    infoCtrlRef.current = info;
    attribCtrlRef.current = attrib;
    info.setActive(infoOpen);
    attrib.setActive(attribOpen);
    return () => {
      infoCtrlRef.current = null;
      attribCtrlRef.current = null;
      for (const c of [reset, info, attrib]) { try { map.removeControl(c); } catch { /* map already gone */ } }
    };
    // Controls mount once; the glow rides the setActive effect above. map is the only dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // The "i" popover content — a VISUAL INDEX (glyph gutter + text), BP interactions only
  // (no search / area-select / console — BP has none). The glyphs come from the rail's own
  // Lucide family (mapIcons) so each tip echoes its control.
  const bpTips = [
    { key: "scroll", glyph: <Glyph body={ICON_MOUSE} />, body: <>Scroll to Zoom</> },
    { key: "hover", glyph: <Glyph body={ICON_MOUSE_CLICK} />, body: <>Hover a Permit for a Reading</> },
    { key: "click", glyph: <Glyph body={ICON_CLICK} />, body: <>Click a Permit for Detail</> },
    { key: "sliders", glyph: <Glyph body={ICON_SLIDERS} />, body: <>Drag Sliders to Select Year and Month</> },
  ];

  // The "i" honesty/methodology notes, re-homed from the column (§6, muted tier): the COVERAGE
  // caveat (Fix in the re-home — the same statement + counts, null until the loaded year's row
  // is in hand so a stale count is never shown) AND the DENSITY explainer (Fix 3 — the
  // "relative permit density" prose that stood under the column legend). Two blocks so each
  // gets its own header + the inter-block spacing.
  const bpHonesty = (
    <>
      {(cov && points.year === loadedYear) && (
        <div className="pa-tips-honesty">
          <span className="pa-tips-honesty-h">Coverage</span>
          <p>
            Showing {fmtNumber(shownStats.nShown)} permits. Of {fmtNumber(Number(cov.n_total))}{" "}
            for {loadedYear}, {fmtNumber(nNoCoord)} ({Math.round(Number(cov.pct_no_coord) * 100)}%){" "}
            have no map location and {fmtNumber(shownStats.nMappedNoValue)} have no construction
            value, so they cannot be shown.
          </p>
        </div>
      )}
      <div className="pa-tips-honesty">
        <span className="pa-tips-honesty-h">Density</span>
        <p>
          Relative permit density: the heat shows where permits concentrate at the overview;
          zoom in for individual permits.
        </p>
      </div>
    </>
  );

  return (
    <article className="content-map pa-map">
      <div className="pa-canvas">
        {/* ===== FULL-BLEED MAP CANVAS (PA standard) — the map is the FIRST child so it
             underlays the floating instrument column. Per-year GeoJSON point map on the
             shared MapView; the Year slider changes geojsonUrl -> MapView recreates the
             source. Behaviour is UNCHANGED — this is a chrome/layout re-skin. ===== */}
        <div className="canvas-wrap">
          {cityHasData && !map && <MapSkeleton />}
          {cityHasData && pointsUrl && (
            <MapView
              className="canvas"
              basemapStyle={BASEMAP_STYLE}
              geojsonUrl={pointsUrl}
              view={MAP_VIEW}
              sourceId={SOURCE_ID}
              layers={POINT_LAYERS}
              // Cap the geojson-vt tiling at z12: the points don't need finer tiles than
              // the heat→dots crossover, and a lower source maxzoom means fewer tiles to
              // build + fewer high-zoom tile edges for the large dots to clip against.
              sourceOptions={{ maxzoom: 12 }}
              // GESTURE PARITY with PA/DU/BC (the shared convention): opt OUT of
              // cooperativeGestures so a PLAIN scroll wheel / two-finger pinch zooms — no
              // ctrl/⌘ modifier. BP is a full-bleed map (the map IS the page), so there is no
              // scrolling document to hijack; cooperativeGestures only protects an EMBEDDED map.
              // Every other handler (drag-pan, double-click-zoom, rotate, pitch, keyboard) is
              // MapLibre-default on the shared MapView, so it already matches PA.
              cooperativeGestures={false}
              // Attribution consolidated into the Data & Attribution panel (bottom-right
              // database control); the native MapLibre bar is removed. mapAttribution kept
              // as the single string source the panel/exports read.
              mapAttribution={siteConfig.mapAttributionStrip}
              nativeAttribution={false}
              onLoad={(m) => {
                // MapView is section-agnostic, so the BP-specific wiring lives here:
                // hover/click → the right inforail (NO floating popups — map centre sacred).
                // Double-click is left at the MapLibre default (zoom in) to match PA — BP no
                // longer overrides it for a fly-to (gesture parity, this directive).
                wirePermitInteractions(m, { onHover: setHoveredFeature, onSelect: setSelectedFeature });
                // Figure-ground base tint: quiet the cream + green parkland INSIDE the city
                // boundary so the permit glow reads against one uniform ground. ONE extra GeoJSON
                // source (the dissolved ~18 KB boundary), independent of the per-year permit source
                // so the Year-slider swap never touches it. Inserted at TINT_BEFORE_ID so the tint
                // sits above land/parks but below water/roads/labels AND the heat/dots (which
                // MapView draws on top). Guarded so it adds exactly once.
                if (!m.getSource(BOUNDARY_SOURCE_ID)) {
                  m.addSource(BOUNDARY_SOURCE_ID, {
                    type: "geojson",
                    data: assetUrl(CITY_BOUNDARY_PATH),
                  });
                }
                const beforeId = m.getLayer(TINT_BEFORE_ID) ? TINT_BEFORE_ID : undefined;
                if (!m.getLayer("city-tint")) {
                  m.addLayer(cityTintLayer(BOUNDARY_SOURCE_ID), beforeId);
                }
                if (SHOW_BOUNDARY_LINE && !m.getLayer("city-outline")) {
                  m.addLayer(cityBoundaryLineLayer(BOUNDARY_SOURCE_ID), beforeId);
                }
                // BP land-use emphasis: lift the three DESCRIPTIVE land-use fills ABOVE the boundary
                // tint so they stay legible on the points map (the tint would otherwise wash them
                // out). Colours are shared and already set by the theme (applyAppleClassic, run just
                // before this onLoad) — this is ORDER only. BP-scoped: moveLayer mutates THIS map
                // instance, so the shared basemap order (and PA/DU/BC) is unchanged. The fills stay
                // BELOW water / roads / labels / dots (MapView draws those on top); residential +
                // parks intentionally stay muted below the tint (the quiet base ground for the glow).
                for (const id of LANDUSE_ABOVE_TINT) {
                  if (m.getLayer(id) && m.getLayer(TINT_BEFORE_ID)) m.moveLayer(id, TINT_BEFORE_ID);
                }
                // Land on the SAME pitched HOME camera as PA / DU / BC (the shared mapCamera
                // preset) — a jump under the skeleton, matching their first-load. The Year slider
                // swaps the source, never the camera, so this fires once.
                applyCameraPreset(m, HOME_VIEW.Edmonton, { ease: false });
                setMap(m);
              }}
            />
          )}
          {/* S-E (mirrors PA): a city with no BP data → the switcher persists in the Identity
              card while the canvas shows a no-data EmptyState. Active city read dynamically (no
              hardcoded literal — `city` is the selection, DEFAULT_CITY the config for the one with
              data). */}
          {!cityHasData && (
            <EmptyState
              title={`No Building Permits Data for ${city}`}
              body={`Building permits are currently published for ${DEFAULT_CITY} only. Switch back to ${DEFAULT_CITY} to explore the map.`}
            />
          )}
        </div>

        {/* ===== RIGHT INFORAIL (fixed frame, Principle 0) — the detail-on-select /
             hover-runner instrument, mounted below the top-right nav stack. ONE frame
             whose CONTENT swaps (idle / hover / select); it replaces the floating popups,
             so the map centre is never covered. Present once the map is up (Edmonton only). ===== */}
        {cityHasData && map && (
          <PermitInforail
            hovered={hoveredFeature}
            selected={selectedFeature}
            onClear={() => setSelectedFeature(null)}
          />
        )}

        {/* ABOUT & TIPS — opened by the "i" in the nav stack. Holds the BP interaction index,
            the coverage caveat (§6 honesty, re-homed from the column), and the source citation
            (dataset id + derived point total, re-homed from the column footer; §6 carve-out,
            primary tier). The licence/© record lives in the Data & Attribution panel below. */}
        <MapTipsPopover
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          tips={bpTips}
          honesty={bpHonesty}
          citation={
            <p className="pa-box-ref pa-box-cite">
              Source: City of Edmonton Open Data (24uj-dj8v).{" "}
              {coverage.length ? fmtNumber(totalPoints) : "…"} permit points, {yearSpan}.
            </p>
          }
        />

        {/* DATA & ATTRIBUTION — the single attribution surface (bottom-right database
            control). Carries City / OGL / CARTO / OSM / disclaimer; replaces the removed
            native MapLibre bar. */}
        <AttributionPanel open={attribOpen} onClose={() => setAttribOpen(false)} />

        {/* ===== TUNING BAY (standalone, bottom-centre) — Year + Month single sliders in
             the PA Data-Console spine SHAPE (.pa-tune-instrument), but BP has no pull-up
             console, so the bay stands on its own over the map. Principle 0: fixed tracks,
             moving handles/readouts. Year debounces to loadedYear (the source swap); Month
             filters the loaded year in place. Gated to the data city (S-E). ===== */}
        {cityHasData && year != null && (
          <div className="bp-tune-dock">
            <div className="pa-tune-instrument" role="group" aria-label="Year and month">
              <YearSliderRow
                year={year}
                sliderYear={year}
                slideYear={setYear}
                yMin={Math.min(...years)}
                yMax={Math.max(...years)}
              />
              <div className="pa-tune-divider" />
              <MonthSliderRow month={month} onChange={setMonth} pct={monthPct} />
            </div>
          </div>
        )}

        {/* ===== INSTRUMENT COLUMN (PA TWO-CARD standard) — an Identity card (title + city
             switcher) gap-separated from the Instrument chassis card (the modules), mirroring
             PA. The transparent .pa-float keeps its measured width; each card carries the dark
             surface. ===== */}
        <div className="pa-float pa-column pa-column-lean">
          {/* IDENTITY CARD — its own surface: the section title + the FUNCTIONAL city switcher
              (shared IdentityCard). Selecting a no-data city (Calgary) drops BP into PA's S-E
              gated state — this card + the switcher persist, the chassis below is gated and the
              canvas shows the EmptyState. Title is the --t-lg Identity title, distinct from the
              section-header tier used inside the chassis. */}
          <section className="pa-card pa-card-identity">
            <IdentityCard title="Building Permits" cities={CITIES} city={city} onCityChange={changeCity} />
          </section>

          {/* INSTRUMENT CHASSIS — gated to the data city (S-E: absent for Calgary). Holds the
              three standing modules: Permit Type · Construction Value · Density legend. Year +
              Month live in the standalone tuning bay, not the column. */}
          {cityHasData && (
          <section className="pa-card pa-card-instrument">

            {/* PERMIT TYPE — colour-dot chips. The dots are DATA (orange/violet,
                dual-encoded with the label, §1.3); the chip chrome is the shared §6
                glass-key chassis (the .opt-toggle-btn dark skin — active = petrol/pearl/
                teal). Not the monochrome SegmentedControl — it can't carry the data colour. */}
            <div className="pa-col-mod pa-col-type">
              <span className="pa-col-lab">Permit Type</span>
              <div className="opt-toggle-buttons bp-type-toggle">
                {[
                  { key: "All",         colour: null,                 cat: "all" },
                  { key: "Residential", colour: COLOURS.residential,   cat: "res" },
                  { key: "Commercial",  colour: COLOURS.commercial,    cat: "com" },
                ].map(({ key, colour, cat }) => {
                  const isActive = group === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      // bp-type-<cat> lets the ACTIVE chip glow its OWN category colour
                      // (Fix 2, a documented divergence from PA's green rule — see permitStyle
                      // / index.css): res→orange, com→purple, all→the neutral teal accent.
                      className={`opt-toggle-btn bp-type-${cat}${isActive ? " active" : ""}`}
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


            {/* COVERAGE caveat re-homed from the column into the "i" (About & tips) as its
                §6 honesty block — the same statement + counts, surfaced on demand instead of
                standing in the column (coverageHonesty, above). */}

            {/* CONSTRUCTION VALUE — the interactive value-tier filter. Reordered ABOVE the
                density legend (Fix 3): the column reads Permit Type → Construction Value →
                Building Permits (density). The title lives in the module label; the tiers +
                reset are the PermitLegend below. */}
            <div className="pa-col-mod pa-col-legend">
              <span className="pa-col-lab">Construction Value</span>
              <PermitLegend
                activeBuckets={activeBuckets}
                onToggle={toggleBucket}
                onReset={resetBuckets}
                activeGroup={group}
              />
            </div>

            {/* BUILDING PERMITS density legend — the OVERVIEW heatmap key (relabelled, Fix 5:
                section "Building Permits", the two scales "Residential/Commercial Construction
                Activity"). One row per hue, built from the SAME ramp the map paints
                (heatRampColours) so legend = map: SMOOTH → a continuous gradient bar; STEPPED →
                discrete swatches. Density is RELATIVE (a KDE) — the explainer lives in the "i". */}
            <div className="pa-col-mod pa-col-heat">
              <span className="pa-col-lab">Building Permits</span>
              <div className="bp-heat-legend">
                {HEAT_CATEGORIES.map(({ category, label }) => {
                  // The coloured stops (drop the transparent empty-density stop) — shared by the
                  // smooth gradient AND the stepped swatches, so both render the map's exact
                  // colours (one source of truth).
                  const stops = heatRampColours(category).filter((s) => s.d > 0);
                  return (
                    <div key={category} className="bp-heat-row">
                      <span className="bp-heat-cat">{label} Construction Activity</span>
                      {HEAT_RAMP_MODE === "stepped" ? (
                        <div className="bp-heat-swatches" aria-hidden="true">
                          {stops.map((s) => (
                            <span key={s.d} className="bp-heat-swatch" style={{ background: s.css }} />
                          ))}
                        </div>
                      ) : (
                        <div
                          className="bp-heat-bar"
                          style={{ background: heatRampGradient(stops) }}
                          aria-hidden="true"
                        />
                      )}
                      <div className="bp-heat-ends">
                        <span>Fewer</span>
                        <span>More</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SELECTED-PERMIT detail was re-homed OUT of the column into the fixed right
                inforail (PermitInforail — hover runner / click detail), so the map centre
                stays sacred and the column keeps only its standing controls + legends. */}

            {/* SOURCE citation re-homed from the column footer into the "i" (About & tips) —
                the column now ends on the Construction Value legend, matching PA's silhouette
                (Identity + instrument modules, no footer citation). */}

          </section>
          )}
        </div>
      </div>
    </article>
  );
}
