// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Layout mirrors
// pipeline/yeg/property-assessment/scripts/09_build_choropleth.html (09).
//
//   ┌──── .content-map (flex row, full-bleed within shell-main) ────┐
//   │ ┌─ .sb (300px) ─┐ ┌────── .canvas-wrap (flex 1) ──────────┐ │
//   │ │  Title       │ │  ≡  (toggle, overlays top-left)         │ │
//   │ │  Subtitle    │ │                                          │ │
//   │ │  ░ City      │ │   MapView (when url resolves)            │ │
//   │ │  ░ Year      │ │      OR                                   │ │
//   │ │  ░ Search    │ │   EmptyState (when url is null)          │ │
//   │ │  ░ Legend    │ │                                          │ │
//   │ │  Ref note    │ │                                          │ │
//   │ └──────────────┘ └──────────────────────────────────────────┘ │
//   └────────────────────────────────────────────────────────────────┘
//
// Data source seam: city + year drive a single URL via dataSources.js.
// The available years come from /manifest.json (loaded once on mount), never
// from literals here — adding a year is a pipeline-only change. A (city, year)
// the manifest doesn't list (e.g. any Calgary year today) resolves to null →
// EmptyState.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import polylabel from "polylabel";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import InfoRail from "./InfoRail.jsx";
import DataTable from "./DataTable.jsx";
import SearchInput from "../../components/SearchInput.jsx";
import {
  buildSnapshotCsv,
  buildTimeseriesCsv,
  buildProvenanceText,
  downloadCsvWithSidecar,
  buildGeoJson,
  downloadText,
  exportPng,
} from "./exportData.js";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  METRICS,
  yoyStopsFromValues,
  stopsFromScale,
  metricStops,
  applyYearMetric,
  choroplethLayers,
  choroplethImages,
} from "./choroplethStyle.js";
import {
  CITIES,
  DEFAULT_CITY,
  loadManifest,
  getYearsForCity,
  getDefaultYear,
  getColourScale,
  resolveCombinedUrl,
  projectYearCollection,
  describeEmpty,
} from "./dataSources.js";
import {
  useChoroplethInteractions,
  indexNamesForSearch,
} from "./interactions.js";
import { DUR_BASE, reduceMotion } from "../../components/motion.js";
import { useSearchParams } from "react-router-dom";

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

// Representative INTERIOR point of a (Multi)Polygon for box-select hit-testing.
// The area-weighted (shoelace) centroid is the centre of mass and is correct for
// simple/convex shapes — but for genuinely concave or disjoint-MULTIPART shapes
// (Edmonton's river-valley + annexation neighbourhoods) the centre of mass can
// fall OUTSIDE the polygon, which is wrong for "is this point in the box?". So:
// use the shoelace centroid when it lands inside; otherwise fall back to polylabel's
// point-on-surface (the interior point farthest from any edge — guaranteed inside).
// Verified on the 403 real polygons: 12 (all river-valley/annexation MultiPolygons)
// need the fallback; with it, every centroid is interior. Return shape unchanged
// ([lng,lat] | null) so boxSelect's call site is untouched.
function geometryCentroid(geom) {
  const c = shoelaceCentroid(geom);
  if (c && pointInGeom(c, geom)) return c;
  return pointOnSurface(geom) ?? c ?? meanOfVertices(geom);
}

// Area-weighted (shoelace) centroid — the polygon's centre of mass. Each ring's
// signed-area centroid: A = ½Σ(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ);
// C = 1/(6A)·Σ(pᵢ + pᵢ₊₁)(xᵢyᵢ₊₁ − xᵢ₊₁yᵢ). MultiPolygon parts are combined as the
// AREA-WEIGHTED average of their part centroids (not a naive mean). [shoelace]
function shoelaceCentroid(geom) {
  const rings = geom.type === "MultiPolygon"
    ? geom.coordinates.map((poly) => poly[0])
    : [geom.coordinates[0]];

  let areaSum = 0, cx = 0, cy = 0;
  for (const ring of rings) {
    let A = 0, sx = 0, sy = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % n]; // ring is closed; the wrap edge is zero-length
      const cross = x0 * y1 - x1 * y0;
      A  += cross;
      sx += (x0 + x1) * cross;
      sy += (y0 + y1) * cross;
    }
    A *= 0.5;
    if (A === 0) continue;                // collinear / empty ring contributes nothing
    const w = Math.abs(A);                // weight each part by its area magnitude
    cx += (sx / (6 * A)) * w;
    cy += (sy / (6 * A)) * w;
    areaSum += w;
  }
  return areaSum > 0 ? [cx / areaSum, cy / areaSum] : null;
}

// Mean of every vertex — kept ONLY as the last-ditch degenerate fallback (a
// zero-area ring shouldn't occur on a real neighbourhood).
function meanOfVertices(geom) {
  let sx = 0, sy = 0, n = 0;
  (function walk(c) {
    if (typeof c[0] === "number") { sx += c[0]; sy += c[1]; n += 1; }
    else for (const inner of c) walk(inner);
  })(geom.coordinates);
  return n ? [sx / n, sy / n] : null;
}

// |signed area| of a ring — to pick a MultiPolygon's LARGEST part for polylabel.
function ringArea(ring) {
  let A = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    A += x0 * y1 - x1 * y0;
  }
  return Math.abs(A / 2);
}

// Guaranteed-interior point via polylabel (point of inaccessibility — the interior
// point farthest from any edge). polylabel takes ONE polygon (ring array); for a
// MultiPolygon we run it on the LARGEST part so the point lands in the dominant piece.
function pointOnSurface(geom) {
  const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const a = ringArea(poly[0]);
    if (a > bestArea) { bestArea = a; best = poly; }
  }
  if (!best) return null;
  const p = polylabel(best, 0.0005); // ~50 m precision (degrees) — ample for hit-testing
  return p ? [p[0], p[1]] : null;
}

// Ray-casting point-in-(Multi)Polygon, holes-aware — used only to detect the rare
// case where the shoelace centroid lands outside its own polygon.
function pointInGeom(pt, geom) {
  const inRing = (ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > pt[1]) !== (yj > pt[1])) &&
          (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  const inPoly = (poly) => inRing(poly[0]) && !poly.slice(1).some(inRing);
  return geom.type === "MultiPolygon"
    ? geom.coordinates.some(inPoly)
    : inPoly(geom.coordinates);
}

// Plain median of a numeric array (used for the labelled "median of medians"
// area approximation).
function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function PropertyAssessmentMap() {
  // The manifest is the source of truth for which years exist. Until it loads,
  // we show a loading state; if it fails, an error state. year is null until
  // the manifest tells us a city's default.
  // The analytical controls (city/year/metric) mirror to the URL query so a view
  // is shareable/bookmarkable. Read here on first render (validated against the
  // known cities / metrics), written by the effect below. The CAMERA (center,
  // zoom) is intentionally NOT in the URL — controls only.
  const [searchParams, setSearchParams] = useSearchParams();

  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [city, setCity] = useState(() =>
    CITIES.includes(searchParams.get("city")) ? searchParams.get("city") : DEFAULT_CITY
  );
  const [year, setYear] = useState(null); // seeded from the URL/manifest once it loads (year validity needs the manifest)
  // Live drag position for the year slider (drives the thumb + readout). It
  // commits to `year` on a throttle (see slideYear) so a fast drag doesn't pile
  // overlapping colour fades — kept separate so the thumb still feels instant.
  const [sliderYear, setSliderYear] = useState(null);
  const [metric, setMetric] = useState(() =>
    METRICS.some((m) => m.key === searchParams.get("metric")) ? searchParams.get("metric") : METRICS[0].key
  );

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  // True while an in-place year swap's new data is genuinely slow (MapView
  // reports it via onLoading) — drives the skeleton-threshold fallback.
  const [swapLoading, setSwapLoading] = useState(false);
  // First-paint cover: true once the map has actually DRAWN (MapView.onReady, on
  // its first idle). The 4 MB combined file paints well after the page's own
  // fetch resolves, so the skeleton must wait for this — not for gj — or it
  // flashes a blank map (the gap that read as "nothing's there").
  const [mapReady, setMapReady] = useState(false);
  // The selected neighbourhoods, by "Neighbourhood ID" (= promoteId). ONE shared
  // selection that every Felt zone reads/writes: a single click is length-1, a
  // box-select (C3) sets the whole set, an empty-map click clears it. The right
  // rail shows detail when exactly one is selected; the bottom table aggregates
  // when many are. Persists across year/metric changes (it's ids, not values).
  const [selectedIds, setSelectedIds] = useState([]);
  // Exactly-one-selected id — drives the single-neighbourhood rail; null in the
  // empty or multi-select cases.
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  // Click/search reports an id (or null to clear) → a length-1 (or empty)
  // selection. Box-select (C3) will call setSelectedIds with the whole set.
  const selectNeighbourhood = useCallback(
    (id) => setSelectedIds(id == null ? [] : [id]),
    []
  );
  // The neighbourhood whose table row is hovered — mirrored to the map's `hover`
  // feature-state so a row lights up its polygon (and vice-versa). null = none.
  const [hoveredRowId, setHoveredRowId] = useState(null);
  // Analyst view: the bottom data table is raised. The table handle toggles it;
  // a box-select enters it. While on, the left control box + search hide and the
  // area-select tools show — the table becomes the stats surface.
  const [analystMode, setAnalystMode] = useState(false);

  // Load the manifest once on mount and seed the year in the SAME update (no
  // frame where the manifest is loaded but no year is chosen → no empty-state
  // flash). The year comes from the URL if it's valid for the (URL-or-default)
  // city, else that city's default — year validity needs the loaded manifest, so
  // unlike city/metric it can't be seeded synchronously.
  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        const cityYears = getYearsForCity(m, city);
        const urlYear = Number(searchParams.get("year"));
        setYear(cityYears.includes(urlYear) ? urlYear : getDefaultYear(m, city));
      })
      .catch((err) => { if (!cancelled) setManifestError(err.message); });
    return () => { cancelled = true; };
    // Runs once on mount; city/searchParams here are the first-render URL values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the controls into the URL so the view is shareable/bookmarkable, but
  // only the DEVIATIONS: bare path = all defaults, query = a deliberate selection.
  // A default load writes an empty query (no-op → stays bare, no populate-on-load),
  // and returning a control to its default drops it from the URL. Missing params
  // default on read, so a partial link (e.g. ?year=2018) still restores fully.
  // replace:true so a control change updates the link without history spam.
  useEffect(() => {
    if (!manifest) return; // nothing to reflect until the manifest resolves
    const params = {};
    if (city !== DEFAULT_CITY) params.city = city;
    if (metric !== METRICS[0].key) params.metric = metric;
    const defaultYear = getDefaultYear(manifest, city);
    if (year != null && year !== defaultYear) params.year = String(year);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, year, metric, manifest]);

  // The years this city offers, and the URL for the current selection. The map
  // now loads ONE combined all-years file per city (07b) and a year change is a
  // paint swap, not a new URL — so the URL depends only on whether the city has
  // data. A city with no data (Calgary today) yields url=null → EmptyState.
  const years = getYearsForCity(manifest, city);
  const url = years.length ? resolveCombinedUrl(city) : null;

  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  // yoy_pct_change is a signed % with no prior year for the earliest year in
  // the dataset, so that (year, metric) combination has no data to colour.
  // Derive "earliest" from the manifest's years — no year literal.
  const isYoy = metric === "yoy_pct_change";
  const earliestYear = years.length ? Math.min(...years) : null;
  const noPriorYear = isYoy && year != null && year === earliestYear;

  // Colour ramp for the current metric:
  //   yoy_pct_change     → data-derived diverging scale (0-centred, robust ±E),
  //                        same scale every year — see yoyStopsFromValues
  //   median_assessvalue → its locked per-year manifest scale
  //   everything else    → quantiles computed from the loaded polygons
  // gj is null until the fetch resolves — metricStops falls back to the locked
  // STOPS until then. Memoised so its identity is stable between renders (the
  // repaint effect and the Legend both depend on it).
  // The map source is the combined all-years file; project it to the selected
  // year's bare-named view (<field>_<year> → <field>) for every JS consumer:
  // the legend stops below, search, the sidebar stats, and the interactions.
  // Cheap (properties only; geometry shared by reference) so it recomputes per
  // year. null until the fetch resolves.
  const gjView = useMemo(() => projectYearCollection(gj, year), [gj, year]);

  // All matched-log YoY values across EVERY year (from the combined source), for
  // the data-derived diverging endpoints (yoyStopsFromValues). Sentinel/NA
  // excluded — Number.isFinite drops the JSON null. One fixed scale, same every
  // year; recomputes only on load.
  const yoyAllValues = useMemo(() => {
    if (!gj) return null;
    const yrs = getYearsForCity(manifest, city);
    const out = [];
    for (const f of gj.features) {
      for (const y of yrs) {
        const v = f.properties[`yoy_pct_change_${y}`];
        if (Number.isFinite(v) && v !== -999) out.push(v);
      }
    }
    return out;
  }, [gj, manifest, city]);

  const stops = useMemo(() => {
    if (metric === "yoy_pct_change") return yoyStopsFromValues(yoyAllValues);
    return metric === "median_assessvalue"
      ? stopsFromScale(getColourScale(manifest, city, year), metric)
      : metricStops(gjView, metric);
  }, [metric, manifest, city, year, gjView, yoyAllValues]);

  // Switching city resets the year to that city's default in the same update,
  // so we never carry one city's year onto another (or onto a city with none).
  function changeCity(nextCity) {
    setCity(nextCity);
    setYear(getDefaultYear(manifest, nextCity));
    setSelectedIds([]); // neighbourhood ids are city-specific — drop the selection
  }

  // --- Year slider: live thumb, paced paint swap ------------------------------
  // The thumb tracks the drag (sliderYear) for instant feedback; the heavier
  // `year` commit — which drives the paint swap + every per-year stat — is
  // throttled to ~DUR_BASE so a fast drag fires ONE clean fill-color fade per
  // step instead of piling overlapping tweens. (Building Permits' slider needs
  // no throttle: its setFilter is instant; PA's colour tween is ~DUR_BASE.)
  // Under reduced motion the tween is already 0 (paintTransition), so commit live.
  // Keep sliderYear in sync when year changes from elsewhere (default/url/city);
  // a no-op during a drag (slideYear sets sliderYear first). Mirroring one bit of
  // state, not a render cascade — disable the advisory as the fetch effect does.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSliderYear(year); }, [year]);
  const lastCommitRef = useRef(0);
  const trailingRef = useRef(null);
  useEffect(() => () => clearTimeout(trailingRef.current), []); // drop any pending commit on unmount
  function slideYear(next) {
    setSliderYear(next);                       // live thumb + readout
    const gap = reduceMotion() ? 0 : DUR_BASE; // pacing window (0 = instant when motion is off)
    clearTimeout(trailingRef.current);
    const since = performance.now() - lastCommitRef.current;
    if (since >= gap) {
      lastCommitRef.current = performance.now();
      setYear(next);                           // commit now: drives the same paint swap the dropdown drove
    } else {
      // Too soon after the last commit — land the latest value on the trailing edge.
      trailingRef.current = setTimeout(() => {
        lastCommitRef.current = performance.now();
        setYear(next);
      }, gap - since);
    }
  }

  // Fetch the city's combined all-years file. url is constant across YEARS now
  // (a year change is a paint swap, not a new URL), so this re-runs only on a
  // CITY change. When url is null (a city with no data, e.g. Calgary) we leave
  // gj/map null and the JSX renders EmptyState instead of MapView; MapView then
  // unmounts and map.remove() in its cleanup destroys the instance.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchError(null);
    // A null url = the city has no data: clear so the empty state shows and the
    // persistent map tears down.
    if (!url) {
      setMap(null);
      setGj(null);
      setMapReady(false); // next real map must re-cover until it paints
      return undefined;
    }

    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data) => { if (!cancelled) setGj(data); })
      .catch((err) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [url]);

  // Repaint on a metric OR year change — a paint swap on the PERSISTENT map (no
  // data reload, no remount). Year + metric both feed the year-keyed
  // paint/filter/layout expressions; the combined source stays put and
  // nbhd-fill's fill-color-transition tweens the colour old→new. This is the
  // setData-free year slider — MapView reads `layers` only at mount, so every
  // later update goes through applyYearMetric (setPaintProperty/setFilter).
  useEffect(() => {
    if (!map) return;
    try {
      // The map can be mid-teardown (switching to the no-prior-year empty state
      // unmounts MapView without changing `url`). applyYearMetric guards getLayer;
      // the try/catch backstops a fully-removed instance — the next mounted map
      // repaints via onLoad → this effect re-running.
      applyYearMetric(map, metric, year, stops);
    } catch {
      /* map removed; no-op */
    }
  }, [map, metric, year, stops]);

  // Search datalist names + the selection wiring. Names come from the combined
  // source (display_name is year-invariant), so they don't recompute per year.
  // Clicking/searching reports the Neighbourhood ID up via selectNeighbourhood.
  const names = useMemo(() => (gj ? indexNamesForSearch(gj) : []), [gj]);
  const flyAndPinByName = useChoroplethInteractions(map, gj, selectNeighbourhood);

  // The single-selected neighbourhood's projected (bare-named) props for the
  // active year — recomputes when the year changes (gjView changes), so the
  // rail's numbers track the year slider live. null unless EXACTLY one is selected.
  const selectedFeature = useMemo(() => {
    if (singleSelectedId == null || !gjView) return null;
    const f = gjView.features.find(
      (ft) => String(ft.properties["Neighbourhood ID"]) === String(singleSelectedId)
    );
    return f ? f.properties : null;
  }, [singleSelectedId, gjView]);

  // Mirror the selection set into the map's `pinned` feature-state (the highlight
  // the paint expressions already read), so selected polygons stay outlined across
  // year/metric changes. interactions.js only REPORTS clicks now; the pinned
  // visual is owned here. Set-diff: clear ids that left the set, (re)apply true
  // for every current id — re-applying is idempotent and also re-pins after a map
  // remount (where the new map starts with no feature-state).
  const prevPinnedRef = useRef(new Set());
  useEffect(() => {
    if (!map) return;
    const next = new Set(selectedIds.map(String));
    const prev = prevPinnedRef.current;
    try {
      for (const id of prev) {
        if (!next.has(id)) map.setFeatureState({ source: "nbhd", id }, { pinned: false });
      }
      for (const id of next) {
        map.setFeatureState({ source: "nbhd", id }, { pinned: true });
      }
      prevPinnedRef.current = next;
    } catch {
      /* map mid-teardown — the next mounted map re-applies via this effect */
    }
  }, [map, selectedIds]);

  // Row hover in the bottom table highlights its polygon via the SAME `hover`
  // feature-state the map hover uses — the two are never active at once (the
  // pointer is over the table OR the map). Clear the previous, set the new.
  const prevRowHoverRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    const prev = prevRowHoverRef.current;
    try {
      if (prev != null && String(prev) !== String(hoveredRowId)) {
        map.setFeatureState({ source: "nbhd", id: prev }, { hover: false });
      }
      if (hoveredRowId != null) {
        map.setFeatureState({ source: "nbhd", id: hoveredRowId }, { hover: true });
      }
      prevRowHoverRef.current = hoveredRowId;
    } catch {
      /* map mid-teardown */
    }
  }, [map, hoveredRowId]);

  // Active-metric series across every year for the single-selected nbhd — the
  // rail sparkline. All years are on the resident combined feature (gj), so this
  // is free. null unless exactly one nbhd is selected; -999 (the YoY no-prior
  // sentinel) and non-finite become gaps the sparkline skips.
  const sparkValues = useMemo(() => {
    if (singleSelectedId == null || !gj) return null;
    const f = gj.features.find(
      (ft) => String(ft.properties["Neighbourhood ID"]) === String(singleSelectedId)
    );
    if (!f) return null;
    return years.map((y) => {
      const v = f.properties[`${metric}_${y}`];
      return Number.isFinite(v) && v !== -999 ? v : null;
    });
  }, [singleSelectedId, gj, metric, years]);
  const activeYearIndex = years.indexOf(year);

  // Rows for the bottom data table, derived from the RESIDENT combined source —
  // gjView for the active-year value/yoy, gj (same feature order) for the per-row
  // all-years sparkline. No querySourceFeatures: the data is already in JS.
  // value/yoy/series entries are null for non-reportable polygons (rendered "—").
  const tableRows = useMemo(() => {
    if (!gjView || !gj) return [];
    const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
    const out = gjView.features.map((f, i) => {
      const p = f.properties;
      const gp = gj.features[i].properties;
      return {
        id: p["Neighbourhood ID"],
        name: p.display_name,
        state: p.polygon_state,
        // Every metric value for the active year — the analyst table shows the
        // FULL set (the same fields the rail lists), not just the active column.
        // gjView is already projected to bare names for the active year.
        median_assessvalue: num(p.median_assessvalue),
        avall_public:       num(p.avall_public),
        avg_lotsize:        num(p.avg_lotsize),
        median_yearbuilt:   num(p.median_yearbuilt),
        yoy_pct_change:     num(p.yoy_pct_change),
        // Trend = the ACTIVE metric across every year (per-row sparkline).
        series: years.map((y) => num(gp[`${metric}_${y}`])),
        rank: null,
      };
    });
    // City rank by the ACTIVE metric (descending; highest = 1), reportable rows only.
    out
      .filter((r) => r[metric] != null)
      .sort((a, b) => b[metric] - a[metric])
      .forEach((r, i) => { r.rank = i + 1; });
    return out;
  }, [gjView, gj, metric, years]);

  // Shift-drag box SELECT (C3): the boxZoomEnd callback hands us the pixel box;
  // a neighbourhood joins the selection when its centroid PROJECTS inside the box
  // (matches the plan's "centroid falls in the box"; dedup-free — we read the
  // resident gjView, not tiles). 0 hits = clear; 1 = rail; many = table aggregate.
  function boxSelect(mapInst, startPos, endPos) {
    if (!gjView) return;
    // Ignore a jitter shift-click (no real drag) so it doesn't blow away the
    // current selection; an intentional empty-area drag is >3px and still clears.
    if (Math.abs(endPos.x - startPos.x) < 3 && Math.abs(endPos.y - startPos.y) < 3) return;
    const x1 = Math.min(startPos.x, endPos.x);
    const x2 = Math.max(startPos.x, endPos.x);
    const y1 = Math.min(startPos.y, endPos.y);
    const y2 = Math.max(startPos.y, endPos.y);
    const ids = [];
    for (const f of gjView.features) {
      const c = geometryCentroid(f.geometry);
      if (!c) continue;
      const pt = mapInst.project(c);
      if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) {
        ids.push(f.properties["Neighbourhood ID"]);
      }
    }
    setSelectedIds(ids);
    // An area select (≥2) is analyst work — raise the table to show the aggregate.
    if (ids.length >= 2) setAnalystMode(true);
  }

  // Scoped export (C4): the selection if any, else ALL features. Built from the
  // resident combined `gj` (every year on the feature) — pure client-side blobs.
  function handleExport(format) {
    if (!gj) return;
    const set = selectedIds.length ? new Set(selectedIds.map(String)) : null;
    const scoped = set
      ? gj.features.filter((f) => set.has(String(f.properties["Neighbourhood ID"])))
      : gj.features;
    const base = `property-assessment_${city}_${selectedIds.length ? `${scoped.length}-selected` : "all"}`;
    // Provenance context for the CSV sidecars — all from state, no literals. The
    // CSV bodies are pure data; provenance rides alongside as a _provenance.txt.
    const meta = {
      city,
      metric,
      scope: selectedIds.length ? `${scoped.length} selected neighbourhoods` : "all neighbourhoods",
    };
    if (format === "csv-current") {
      const csvName = `${base}_${year}.csv`;
      downloadCsvWithSidecar(csvName, buildSnapshotCsv(scoped, year),
        buildProvenanceText({ ...meta, file: csvName, coverage: String(year),
          shape: `wide — one row per neighbourhood, single year ${year}` }));
    } else if (format === "csv-timeseries") {
      const csvName = `${base}_timeseries.csv`;
      const asc = [...years].sort((a, b) => a - b);
      const span = asc.length ? `${asc[0]}–${asc[asc.length - 1]}` : "";
      downloadCsvWithSidecar(csvName, buildTimeseriesCsv(scoped, years),
        buildProvenanceText({ ...meta, file: csvName, coverage: span,
          shape: `long panel — one row per neighbourhood × year, ${span}` }));
    } else if (format === "geojson") {
      downloadText(`${base}.geojson`, buildGeoJson(scoped), "application/geo+json");
    } else if (format === "png" && map) {
      exportPng(map, `property-assessment_${city}_${year}.png`);
    }
  }

  // Honest area aggregate over the selection (C3). The browser holds only
  // neighbourhood aggregates and the combined file NULLs values for non-aggregated
  // polygons, so: counts + total parcels + parcel-weighted MEAN are EXACT (mean is
  // linear → n-weighted mean of per-nbhd means = the true parcel mean over the
  // reportable nbhds); MEDIAN and YoY are neighbourhood-weighted APPROXIMATIONS
  // (no parcel distribution in-browser) and are labelled as such in the table.
  // Suppressed nbhds contribute their count only; non-res/no-data are excluded.
  const selectionAggregate = useMemo(() => {
    if (selectedIds.length <= 1 || !gjView) return null;
    const set = new Set(selectedIds.map(String));
    const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
    let nReportable = 0, nSuppressed = 0, nExcluded = 0;
    let totalParcels = 0, sumNV = 0, sumN = 0, sumNYoY = 0, sumNYoYW = 0;
    const medians = [];
    for (const f of gjView.features) {
      if (!set.has(String(f.properties["Neighbourhood ID"]))) continue;
      const p = f.properties;
      const n = num(p.n_properties);
      if (p.polygon_state === "aggregated") {
        nReportable++;
        if (n != null) totalParcels += n;
        const mean = num(p.avall_public);
        if (mean != null && n != null) { sumNV += n * mean; sumN += n; }
        const med = num(p.median_assessvalue);
        if (med != null) medians.push(med);
        const yoy = num(p.yoy_pct_change);
        if (yoy != null && n != null) { sumNYoY += n * yoy; sumNYoYW += n; }
      } else if (p.polygon_state === "suppressed_low_n") {
        nSuppressed++;
        if (n != null) totalParcels += n;
      } else {
        nExcluded++;
      }
    }
    return {
      nSelected: selectedIds.length,
      nReportable, nSuppressed, nExcluded, totalParcels,
      parcelMean: sumN > 0 ? sumNV / sumN : null,            // EXACT
      medianOfMedians: medians.length ? medianOf(medians) : null, // APPROX
      areaYoY: sumNYoYW > 0 ? sumNYoY / sumNYoYW : null,     // APPROX
    };
  }, [selectedIds, gjView]);

  // Sum n_properties across every polygon that has a finite count. This includes
  // aggregated + suppressed_low_n polygons and naturally excludes non_residential
  // / manufactured_home_community / no_data (which carry no count). Recomputes on
  // year switch (gj changes).
  const propertyCount = useMemo(() => {
    if (!gjView) return 0;
    let sum = 0;
    for (const f of gjView.features) {
      const n = Number(f.properties?.n_properties);
      if (Number.isFinite(n)) sum += n;
    }
    return sum;
  }, [gjView]);

  // Count-up of the cleaned property count, summed live from the loaded GeoJSON.
  const propCount = useCountUp(propertyCount);

  // Reflect the current selection in the browser tab title; restore on unmount.
  useEffect(() => {
    const m = METRICS.find((x) => x.key === metric);
    document.title = m
      ? `${m.label} · ${city} ${year}`
      : `Property Assessment`;
    return () => { document.title = "Open Data Centre"; };
  }, [metric, city, year]);

  // All hooks above run every render; only now do we branch the output, so the
  // loading/error short-circuits never change hook order.
  if (manifestError) {
    return (
      <article className="content-map">
        <div className="canvas-wrap">
          <EmptyState
            title="Could not load the data catalogue."
            body={manifestError}
          />
        </div>
      </article>
    );
  }

  if (!manifest) {
    return (
      <article className="content-map">
        <div className="canvas-wrap">
          <p className="map-loading">Loading data catalogue…</p>
        </div>
      </article>
    );
  }

  const empty = url ? null : describeEmpty(manifest, city, year);

  return (
    <article className={`content-map pa-map${analystMode ? " is-analyst" : ""}`}>
      {/* TOP-CENTRE search pill — default view only (hidden in analyst view, where
          all lookup happens in the table). The dropdown is bounded so it can't
          flood the map or overlay the right rail (SearchInput). */}
      {url && !analystMode && (
        <div className="pa-search">
          <SearchInput
            placeholder="Search neighbourhood…"
            names={names}
            onSelect={flyAndPinByName}
          />
        </div>
      )}

      {/* LEFT floating box (vertically centred, hugs content).
          DEFAULT: title + city switcher + metric selector + compact provenance.
          ANALYST: area-select tools (clear + export). The city switcher renders
          even with no data so a user can leave the Calgary empty state. */}
      {!analystMode ? (
        <aside className="pa-box pa-box--left" aria-label="Map controls">
          <div className="pa-box-title">{city} — {year}</div>
          {url && (
            <p className="pa-box-sub">{propCount.toLocaleString()} cleaned residential properties</p>
          )}
          <div className="opt-toggle-gel">
            <OptionToggle label="City" options={CITIES} value={city} onChange={changeCity} />
          </div>
          {/* Single-select — the fill encodes exactly one metric (METRICS source). */}
          {url && (
            <SegmentedControl label="Metric" options={METRICS} value={metric} onChange={setMetric} />
          )}
          {url && (
            <p className="pa-box-ref">
              <span>Updated {manifest?.last_updated ?? "—"}.</span>{" "}
              Some neighbourhoods were renamed (e.g. Oliver → Wîhkwêntôwin, 2025); a
              neighbourhood's full history shows under its current name.{" "}
              <a
                href="https://www.edmonton.ca/city_government/city_organization/naming-committee"
                target="_blank"
                rel="noopener noreferrer"
              >
                Naming Committee
              </a>.
            </p>
          )}
        </aside>
      ) : (
        <aside className="pa-box pa-box--left pa-tools" aria-label="Area selection tools">
          <div className="pa-box-title">Area select</div>
          <p className="pa-box-sub">Shift-drag the map to select neighbourhoods.</p>
          <div className="pa-tools-row">
            <button
              type="button"
              className="pa-tools-btn"
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length}
            >
              Clear{selectedIds.length ? ` (${selectedIds.length})` : ""}
            </button>
          </div>
          {/* Export lives in the table header (reachable on mobile, where the
              table is fullscreen and this toolset is behind it). */}
        </aside>
      )}

      <div className="canvas-wrap">
        {fetchError && url ? (
          // The fetch failed for a real URL — a load failure, NOT "no data
          // for this selection" (that's the !url case below). Different copy
          // so the user knows it's worth retrying.
          <EmptyState
            title="Could not load data"
            body={`The ${city} ${year} dataset failed to load. Try refreshing or select a different year.`}
          />
        ) : noPriorYear ? (
          // YoY needs a prior year; the earliest year in the dataset has none,
          // so the whole year is blank for this metric (every polygon is NA).
          <EmptyState
            title="No prior year"
            body={`YoY change is not available for the earliest year in the dataset (${year}).`}
          />
        ) : url ? (
          // The map loads the combined all-years file ONCE; a year change is a
          // paint swap (applyYearMetric), not a remount or data reload. The
          // boundary's resetKey={url} keeps a WebGL/MapLibre failure from
          // blanking the page. MapView only mounts/unmounts on the url-null
          // boundary (a city with no data), where the fetch effect tears down
          // map + gj. (url is constant per city now, so the boundary is stable.)
          <>
            {url && (!mapReady || swapLoading) && <MapSkeleton />}
            {/* resetKey (not key) so a YEAR swap clears a caught error WITHOUT
                remounting MapView — the map persists and dips-and-swaps in place. */}
            <MapErrorBoundary resetKey={url}>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={url}
                view={MAP_VIEW}
                sourceId="nbhd"
                promoteId="Neighbourhood ID"
                layers={choroplethLayers(stops, metric, year)}
                images={choroplethImages()}
                onLoad={setMap}
                onLoading={setSwapLoading}
                onReady={() => setMapReady(true)}
                boxSelect={boxSelect}
                preserveDrawingBuffer
                cooperativeGestures={false}
              />
            </MapErrorBoundary>
          </>
        ) : (
          <EmptyState title={empty.title} body={empty.body} />
        )}
      </div>

      {/* RIGHT info rail (Felt zone 3) — hidden by default; mounts (and slides in)
          only when EXACTLY one neighbourhood is selected. Shows that nbhd's detail
          + a value sparkline, reactive to the active year/metric. Empty/multi
          select → not rendered (multi aggregates land in the bottom table). */}
      {url && selectedFeature && (
        <InfoRail
          feature={selectedFeature}
          year={year}
          metric={metric}
          years={years}
          sparkValues={sparkValues}
          activeIndex={activeYearIndex}
          onClear={() => setSelectedIds([])}
          compact={analystMode}
        />
      )}

      {/* LEGEND — small card bottom-right (default view only). */}
      {url && !analystMode && (
        <div className="pa-legend">
          <Legend
            title={selectedMetric.label}
            stops={stops}
            format={selectedMetric.fmt}
            discrete={isYoy}
          />
        </div>
      )}

      {/* YEAR — slim slider bottom-centre; lifted clear of the table in analyst
          view (CSS keys off .is-analyst on the article). */}
      {url && year != null && (
        <div className="pa-year">
          <span className="pa-year-label">
            Year <strong className="sb-year-value">{sliderYear ?? year}</strong>
          </span>
          <input
            type="range"
            className="sb-year-slider"
            aria-label="Year"
            min={Math.min(...years)}
            max={Math.max(...years)}
            step={1}
            value={sliderYear ?? year}
            onChange={(e) => slideYear(Number(e.target.value))}
          />
        </div>
      )}

      {/* BOTTOM data table — the handle doubles as the analyst-view toggle
          (open = analystMode). Analytical surface over the resident gjView; rows
          link both ways to the shared selection. Only with data loaded. */}
      {url && gjView && (
        <DataTable
          rows={tableRows}
          metric={metric}
          metricLabel={selectedMetric.label}
          activeIndex={activeYearIndex}
          year={year}
          years={years}
          selectedIds={selectedIds}
          onSelectRow={selectNeighbourhood}
          onHoverRow={setHoveredRowId}
          aggregate={selectionAggregate}
          onClearSelection={() => setSelectedIds([])}
          onExport={handleExport}
          open={analystMode}
          onToggle={() => setAnalystMode((a) => !a)}
        />
      )}
    </article>
  );
}
