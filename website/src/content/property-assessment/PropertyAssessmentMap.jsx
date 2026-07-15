// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route — a three-mode analyst map (PA_MODE_CONTRACT.md §3):
//
//   ┌──── .content-map / .pa-map (full-bleed) ─────────────────────┐
//   │ ┌.pa-float┐   MAP (sacred centre, zero chrome)   ┌ nav ┐     │
//   │ │┌identity┐│                                      │🔍 +−│     │
//   │ │└────────┘│                       ┌ .pa-detail (S-b only) ┐  │
//   │ │┌instrmt─┐│                       └──────────────────────┘  │
//   │ ││ metric ││                                                  │
//   │ ││ tuning ││   .pa-foot: DataTable console (rises ALONE)      │
//   │ ││ legend ││    handle → [ rail | table | trend | margin ]    │
//   │ │└footer──┘│                                                  │
//   │ └─────────┘                                                   │
//   └──────────────────────────────────────────────────────────────┘
//   The instrument COLUMN (left) is a TRANSPARENT .pa-float wrapper — kept so
//   chromePadding reserves it — holding TWO dark .pa-card surfaces (P1): an identity
//   card (title + city switcher) and, below it, the instrument chassis
//   (metric → tuning → legend → footer). The console
//   rises from the bottom into a four-frame grid (rail KPI cards | table | trend
//   instrument | margin); its header carries the scope title + metric chips +
//   District / Clear / Export. The S-b single-select detail is a right float below
//   the nav. Three modes (Display / View / Analysis) over url / dockOpen / selectedIds.
//
// Data source seam: city + year drive a single URL via dataSources.js.
// The available years come from /manifest.json (loaded once on mount), never
// from literals here — adding a year is a pipeline-only change. A (city, year)
// the manifest doesn't list (e.g. any Calgary year today) resolves to null →
// EmptyState.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import polylabel from "polylabel";

import MapView, { findFirstSymbolLayerId } from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import IdentityCard from "./IdentityCard.jsx";
import SegmentedControl from "../../components/SegmentedControl.jsx";
import InfoRail from "./InfoRail.jsx";
import DataTable from "./DataTable.jsx";
import SearchPeek from "./SearchPeek.jsx";
import {
  buildSnapshotCsv,
  buildTimeseriesCsv,
  buildAggregateCsv,
  buildProvenanceText,
  downloadCsvWithSidecar,
  buildGeoJson,
  downloadText,
  exportPng,
} from "./exportData.js";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  HOME_VIEW,
  METRICS,
  yoyStopsFromValues,
  stopsFromScale,
  metricStops,
  condoStops,
  applyYearMetric,
  choroplethLayers,
  choroplethImages,
  CENTROID_SOURCE,
  centroidNameLayer,
  centroidFocusLayer,
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
  fitToFeatures,
  applyCameraPreset,
  makeResetControl,
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

// D-P2 F2 — client-derived neighbourhood centroid POINTS for the name-label layer.
// One Point per neighbourhood (the combined source is already one feature per nbhd,
// so no dedup is needed), placed at the guaranteed-interior centroid — reusing the
// SAME geometryCentroid the box-select uses (shoelace, polylabel fallback). `area` is
// the largest ring's |area|, year-invariant, handed to the label layer's
// symbol-sort-key so the bigger neighbourhood wins a collision. Returns a GeoJSON
// FeatureCollection ready for map.addSource.
function buildCentroidPoints(gj) {
  const pts = [];
  for (const f of gj.features) {
    const c = geometryCentroid(f.geometry);
    if (!c) continue;
    const g = f.geometry;
    const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
    const area = polys.reduce((max, poly) => Math.max(max, ringArea(poly[0])), 0);
    pts.push({ c, area, id: f.properties["Neighbourhood ID"], name: f.properties.display_name });
  }
  // D-P2 F2 F3 D-P3 B3 — assign a zoom-density TIER by area rank so the overview breathes:
  // the largest neighbourhoods (tier 1) label from the wide view, mid ones (tier 2) appear
  // ~z12.5, the rest (tier 3) only at neighbourhood zoom ~z14. The label layer's text-size
  // step reads this tier; the table always holds the exhaustive list.
  const byArea = [...pts].sort((a, b) => b.area - a.area);
  const n = byArea.length;
  const t1 = Math.round(n * 0.08);  // top ~8% = major
  const t2 = Math.round(n * 0.33);  // next ~25% = mid
  byArea.forEach((p, i) => { p.tier = i < t1 ? 1 : i < t2 ? 2 : 3; });
  return {
    type: "FeatureCollection",
    features: pts.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: p.c },
      properties: { "Neighbourhood ID": p.id, display_name: p.name, area: p.area, tier: p.tier },
    })),
  };
}

// Plain median of a numeric array (used for the labelled "median of medians"
// area approximation).
function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Honest parcel-weighted aggregate over a set of polygon features. Defined ONCE and
// shared by BOTH the SELECTION aggregate (the box-selected set) and the CITY baseline
// (every polygon, D8 item 8) — so the parcel-weighting math is never duplicated. The
// browser holds only neighbourhood aggregates, so: counts + total parcels + the mean
// are EXACT (the mean is linear → an n-weighted mean of per-nbhd means IS the true
// parcel mean over the reportable nbhds); the MEDIAN (median of neighbourhood medians)
// and YoY (neighbourhood-weighted) are APPROXIMATIONS (no parcel distribution in
// browser) and are labelled as such where they render. Suppressed nbhds contribute
// their count only; non-residential / no-data are excluded from values.
function aggregateFeatures(features) {
  const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
  let nReportable = 0, nSuppressed = 0, nExcluded = 0;
  let totalParcels = 0, sumNV = 0, sumN = 0, sumNYoY = 0, sumNYoYW = 0;
  // §7 condo math: condo SHARE is parcel-weighted (Σ n·pct / Σ n, exact); the
  // excl-condo MEAN and LOT are NON-CONDO-parcel-weighted (Σ nc·x / Σ nc, exact,
  // where nc = n·(1−pct/100)), each summed only over members with a finite figure.
  // An all-condo selection (Σ nc = 0) yields an honest null → "—", never a false 0.
  let sumNPct = 0, sumNPctW = 0;            // condo share
  let sumNcMexcl = 0, sumNcMexclW = 0;      // mean excl. condo
  let sumNcLot = 0, sumNcLotW = 0;          // lot (non-condo)
  const medians = [];
  for (const f of features) {
    const p = f.properties;
    const n = num(p.n_properties);
    if (p.polygon_state === "aggregated") {
      nReportable++;
      if (n != null) totalParcels += n;
      const mean = num(p.avall_public);
      if (mean != null && n != null) { sumNV += n * mean; sumN += n; }
      const med = num(p.median_assessvalue);
      if (med != null) medians.push(med);
      const yoy = num(p.yoy_log_points);
      if (yoy != null && n != null) { sumNYoY += n * yoy; sumNYoYW += n; }
      const pct = num(p.pct_with_unit);       // % of parcels that are titled condo units
      if (pct != null && n != null) {
        sumNPct += n * pct; sumNPctW += n;
        const nc = n * (1 - pct / 100);        // non-condo parcels in this nbhd
        const mexcl = num(p.avg_assessvalue_without_unit);
        if (mexcl != null) { sumNcMexcl += nc * mexcl; sumNcMexclW += nc; }
        const lot = num(p.avg_lotsize);
        if (lot != null) { sumNcLot += nc * lot; sumNcLotW += nc; }
      }
    } else if (p.polygon_state === "suppressed_low_n") {
      nSuppressed++;
      if (n != null) totalParcels += n;
    } else {
      nExcluded++;
    }
  }
  return {
    nReportable, nSuppressed, nExcluded, totalParcels,
    parcelMean: sumN > 0 ? sumNV / sumN : null,            // EXACT (n-weighted)
    medianOfMedians: medians.length ? medianOf(medians) : null, // APPROX
    areaYoY: sumNYoYW > 0 ? sumNYoY / sumNYoYW : null,     // APPROX (n-weighted)
    condoShare: sumNPctW > 0 ? sumNPct / sumNPctW : null,          // % parcel-weighted, EXACT
    meanExclCondo: sumNcMexclW > 0 ? sumNcMexcl / sumNcMexclW : null, // $ non-condo-weighted, EXACT; null if all-condo
    lotNonCondo: sumNcLotW > 0 ? sumNcLot / sumNcLotW : null,      // m² non-condo-weighted, EXACT; null if all-condo
  };
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

  // The ONE unified search value (D5) — lifted here (single source of truth) so the
  // SearchPeek by the zoom stack drives BOTH the map (flyAndPinByName) and the table
  // (DataTable's controlled globalFilter, and SearchInput's controlled value — so the
  // box and the filter never desync). CLEARED by any NON-search selection (map click /
  // box-select / row click) and by a city switch, so a persisted name filter never
  // hides a subsequently-selected neighbourhood (D5 review). A search re-sets it.
  const [searchQuery, setSearchQuery] = useState("");

  // Click/search reports an id (or null to clear) → a length-1 (or empty)
  // selection. Box-select (C3) will call setSelectedIds with the whole set. Clearing
  // searchQuery here means a fresh selection always shows in the (now-unfiltered)
  // table; the search's own onSelect re-sets it right after (batched).
  const selectNeighbourhood = useCallback(
    (id) => { setSelectedIds(id == null ? [] : [id]); setSearchQuery(""); },
    []
  );
  // The neighbourhood whose table row is hovered — mirrored to the map's `hover`
  // feature-state so a row lights up its polygon (and vice-versa). null = none.
  const [hoveredRowId, setHoveredRowId] = useState(null);
  // Brush (D7): the ids currently passing the table's facet filters, reported up by
  // the DataTable. The map DIMS everything not in this set (a third feature-state
  // channel, distinct from selection/hover). null = no facet active → nothing dimmed.
  // This drives ONLY the map dim — never the aggregate or export (D6 VIEW-only).
  const [brushedIds, setBrushedIds] = useState(null);
  // The analysis dock (bottom data table) is RAISED. Two explicit RAISE drivers,
  // unchanged: a box-select of ≥2 auto-raises it (boxSelect), and the pill / T key
  // toggle it by hand. The persistent panel + canvas chrome no longer hide when
  // it's open (they did under the old full-screen "analyst mode").
  const [dockOpen, setDockOpen] = useState(false);

  // The tuning rack's range slot — its DOM node, captured by a ref-callback so
  // The floating "About & tips" popover (open/closed). Holds the box-select tip +
  // the provenance/naming note — rehomed here from the removed left panel. [D1]
  const [infoOpen, setInfoOpen] = useState(false);

  // Auto-collapse the dock when the selection empties — the ONE intentional
  // behaviour change in the layout re-architecture (previously the dock latched
  // open until toggled). This only LOWERS it on an empty set, so a manual open at
  // 0 selection still sticks (selectedIds doesn't change on a toggle). EXCEPTION:
  // the console-header × Clear empties the selection but MUST keep the console up
  // (S-e → S-c in place, contract §5) — it raises this one-shot flag so this effect
  // skips the collapse for that emptying only. A map-click deselect still collapses.
  const keepDockOnClearRef = useRef(false);
  useEffect(() => {
    if (selectedIds.length !== 0) return;
    if (keepDockOnClearRef.current) { keepDockOnClearRef.current = false; return; }
    setDockOpen(false);
  }, [selectedIds]);

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

  // yoy_log_points is a signed LOG CHANGE (not a percent — METHODOLOGY.md D7) with
  // no prior year for the earliest year in
  // the dataset, so that (year, metric) combination has no data to colour.
  // Derive "earliest" from the manifest's years — no year literal.
  const isYoy = metric === "yoy_log_points";
  const earliestYear = years.length ? Math.min(...years) : null;
  const noPriorYear = isYoy && year != null && year === earliestYear;

  // Colour ramp for the current metric:
  //   yoy_log_points     → data-derived diverging scale (0-centred, robust ±E),
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
        const v = f.properties[`yoy_log_points_${y}`];
        if (Number.isFinite(v) && v !== -999) out.push(v);
      }
    }
    return out;
  }, [gj, manifest, city]);

  const stops = useMemo(() => {
    if (metric === "yoy_log_points") return yoyStopsFromValues(yoyAllValues);
    if (metric === "pct_with_unit") return condoStops(gjView);  // warm quantile share ramp (A3)
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
    setSearchQuery(""); // and the name filter (else a no-data round-trip leaves a stale filter, D5 review)
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

  // P4 — lift the selection outline pair (cream casing + violet highlight) to the TOP of
  // the map stack, above all fills AND basemap hairlines/labels, so the selected boundary
  // is never occluded by an adjacent polygon (the QMP z-order fix). MapView inserts them
  // below the basemap symbols with the rest of the choropleth batch; we re-order them up
  // once the map + data are ready. Casing first, then highlight, so the cream under-stroke
  // stays beneath the violet. This runs BEFORE the centroid effect below, so the selected
  // neighbourhood's focus label still lands above the outline. getLayer + try/catch guard a
  // mid-teardown / not-yet-added instance; re-runs on map remount (city switch).
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer("nbhd-highlight-casing")) map.moveLayer("nbhd-highlight-casing");
      if (map.getLayer("nbhd-highlight")) map.moveLayer("nbhd-highlight");
    } catch {
      /* map mid-teardown — re-applies when the next map mounts */
    }
  }, [map, gj]);

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

  // Brush dim (D7) — the third feature-state channel. `dimmed` is set TRUE on every
  // polygon NOT in brushedIds (the table's current facet view), so the out-of-filter
  // polygons fade and the in-filter ones read as the live set. brushedIds === null
  // (no facet active) → clear all dimming. Set-diff like the pinned/hover effects;
  // hover + pinned win over dimmed in the paint expression, so selected/hovered
  // polygons stay dominant. Feature-state is GPU-side, so even ~376 updates are cheap.
  const prevDimmedRef = useRef(new Set());
  useEffect(() => {
    if (!map || !gj) return;
    const next = new Set();
    // The dim set is EITHER the table's facet view (brush, VIEW-only) OR — whenever N≥2
    // are SELECTED — the non-selected polygons, so the selected set's boundaries read for
    // analysis. A6: this now applies in BOTH the S-b₂ down-state AND Analysis (console up),
    // not just when the console is down. brushedIds is ALWAYS null in selection mode (the
    // VIEW-only fence is off), so the two dim channels never collide — they stay separate
    // code paths (brush branch first) and the SELECTION dim takes precedence by construction.
    const keepIds = brushedIds
      ? brushedIds.map(String)
      : selectedIds.length >= 2
      ? selectedIds.map(String)
      : null;
    if (keepIds) {
      const keep = new Set(keepIds);
      for (const f of gj.features) {
        const id = String(f.properties["Neighbourhood ID"]);
        if (!keep.has(id)) next.add(id);
      }
    }
    const prev = prevDimmedRef.current;
    try {
      for (const id of prev) {
        if (!next.has(id)) map.setFeatureState({ source: "nbhd", id }, { dimmed: false });
      }
      for (const id of next) {
        map.setFeatureState({ source: "nbhd", id }, { dimmed: true });
      }
      prevDimmedRef.current = next;
    } catch {
      /* map mid-teardown — the next mounted map re-applies via this effect */
    }
  }, [map, gj, brushedIds, selectedIds, dockOpen]);

  // D-P2 F1/F2 — mount the neighbourhood NAME labels on a client-derived centroid
  // point source, ABOVE everything (no beforeId), so names clear the choropleth fills
  // AND the basemap's own labels. Runs once the map + data are ready; re-derives on a
  // city switch (gj changes). The source is year-invariant, so the year slider never
  // touches it (applyYearMetric leaves it alone).
  useEffect(() => {
    if (!map || !gj) return;
    const points = buildCentroidPoints(gj);
    try {
      const src = map.getSource(CENTROID_SOURCE);
      if (src) {
        src.setData(points);   // city switch — same layers, new points
        return;
      }
      map.addSource(CENTROID_SOURCE, {
        type: "geojson",
        data: points,
        promoteId: "Neighbourhood ID", // so the focus layer (F3) reads feature-state by id
      });
      // B2 (DESIGN_SYSTEM §5) — anchor the base name layer ADJACENT to the basemap's
      // symbol layers (insert before the first one) so it joins their ONE collision
      // index: with allow-overlap:false, our names and the basemap's own labels mutually
      // collide-test and never overprint. Inserted first among the symbols → our names
      // win placement (basemap street/place labels yield in the gaps).
      const symbolAnchor = findFirstSymbolLayerId(map);
      map.addLayer({ ...centroidNameLayer(), source: CENTROID_SOURCE }, symbolAnchor);
      // F3 — the hover/selected guarantee stays ON TOP (allow-overlap:true, the ONE
      // exception): the pointed-at neighbourhood always names itself, above everything.
      map.addLayer({ ...centroidFocusLayer(), source: CENTROID_SOURCE });
    } catch {
      /* map mid-teardown — the next mounted map re-adds via this effect */
    }
  }, [map, gj]);

  // D-P4 B1 — filter the BASE name layer to REPORTABLE (coloured/aggregated) neighbourhoods
  // for the ACTIVE YEAR only. Suppressed / non-residential / no-data names never clutter the
  // overview and their collision budget frees the analyzable set to fill in (B2). The centroid
  // SOURCE is year-invariant, so the per-year reportable set is applied as a layer FILTER here
  // (recomputed on year change from gjView's polygon_state). The FOCUS layer stays unfiltered —
  // hover/selected still names any neighbourhood (the always-label exception).
  useEffect(() => {
    if (!map || !gjView || !map.getLayer("nbhd-labels")) return;
    const reportable = gjView.features
      .filter((f) => f.properties.polygon_state === "aggregated")
      .map((f) => String(f.properties["Neighbourhood ID"]));
    try {
      map.setFilter("nbhd-labels", ["in", ["get", "Neighbourhood ID"], ["literal", reportable]]);
    } catch {
      /* map mid-teardown */
    }
  }, [map, gjView]);

  // D-P2 F3 — mirror the selection (pinned) onto the centroid source, so a selected
  // neighbourhood keeps its name shown via the focus layer even where the base label
  // was collision-culled. Set-diff, mirroring the polygon `pinned` effect (read-only:
  // it copies the existing channel, never writes selection).
  const prevCentroidPinRef = useRef(new Set());
  useEffect(() => {
    if (!map) return;
    const next = new Set(selectedIds.map(String));
    const prev = prevCentroidPinRef.current;
    try {
      for (const id of prev) {
        if (!next.has(id)) map.setFeatureState({ source: CENTROID_SOURCE, id }, { pinned: false });
      }
      for (const id of next) {
        map.setFeatureState({ source: CENTROID_SOURCE, id }, { pinned: true });
      }
      prevCentroidPinRef.current = next;
    } catch {
      /* map mid-teardown or centroid source not added yet — re-applies on next change */
    }
  }, [map, selectedIds]);

  // D-P2 F3 — mirror the table-row hover onto the centroid source. Map hover is handled
  // by the listener effect below; the two are never active at once (pointer over the
  // table OR the map), exactly like the polygon hover channels.
  const prevCentroidRowHoverRef = useRef(null);
  useEffect(() => {
    if (!map) return;
    const prev = prevCentroidRowHoverRef.current;
    try {
      if (prev != null && String(prev) !== String(hoveredRowId)) {
        map.setFeatureState({ source: CENTROID_SOURCE, id: prev }, { hover: false });
      }
      if (hoveredRowId != null) {
        map.setFeatureState({ source: CENTROID_SOURCE, id: hoveredRowId }, { hover: true });
      }
      prevCentroidRowHoverRef.current = hoveredRowId;
    } catch {
      /* map mid-teardown or centroid source not added yet */
    }
  }, [map, hoveredRowId]);

  // D-P2 F3 — mirror the MAP hover onto the centroid source. interactions.js owns the
  // polygon hover state (left untouched); this read-only listener copies the pointed-at
  // id onto the centroid source so its focus label shows. Own listeners so the working
  // interactions core stays frozen.
  useEffect(() => {
    if (!map) return undefined;
    let curId = null;
    const set = (id, on) => {
      try { map.setFeatureState({ source: CENTROID_SOURCE, id }, { hover: on }); } catch { /* source not ready */ }
    };
    const onMove = (e) => {
      const id = e.features?.[0]?.id;
      if (id === curId) return;
      if (curId != null) set(curId, false);
      curId = id ?? null;
      if (curId != null) set(curId, true);
    };
    const onLeave = () => { if (curId != null) { set(curId, false); curId = null; } };
    map.on("mousemove", "nbhd-fill", onMove);
    map.on("mouseleave", "nbhd-fill", onLeave);
    return () => { map.off("mousemove", "nbhd-fill", onMove); map.off("mouseleave", "nbhd-fill", onLeave); };
  }, [map]);

  // D-P3 B4 — building/ramp harmony. Carto's building fills are a warm TAN (set by
  // applyAppleClassic) that clashes hue-vs-hue with the choropleth ramp at parcel zoom.
  // MapLibre has no per-layer blend mode, so approximate a LUMINOSITY blend: drop the
  // buildings to a neutral warm GREY (hue out → tonal texture) and make `building`
  // translucent so the ramp reads THROUGH as lightness modulation, not a competing colour.
  // Colour/opacity only; composes with the choropleth's own F4 zoom-fade (separate layer,
  // untouched). PA-scoped (runs after applyAppleClassic); guarded.
  useEffect(() => {
    if (!map) return;
    try {
      if (map.getLayer("building")) {
        map.setPaintProperty("building", "fill-color", "#d9d6cf");   // neutral warm grey (desaturated)
        map.setPaintProperty("building", "fill-opacity", 0.6);        // ramp reads through
      }
      if (map.getLayer("building-top")) {
        map.setPaintProperty("building-top", "fill-color", "#e7e3db"); // lighter neutral top face (keeps its zoom opacity ramp)
      }
    } catch {
      /* map mid-teardown */
    }
  }, [map]);

  // D-P2 F5 — suppress the basemap's OWN neighbourhood labels for the PA view. Carto's
  // place_hamlet (class=neighbourhood) and place_suburbs (class=suburb) label Edmonton
  // neighbourhoods from z12, which DOUBLES our centroid labels (at Carto's point, offset
  // from our interior centroid). Ours are the authoritative set — all 403, reconciled
  // names incl. Wîhkwêntôwin — so hide theirs. PA-scoped (this map only); guarded, so a
  // basemap without these layers is a no-op.
  useEffect(() => {
    if (!map) return;
    try {
      for (const id of ["place_hamlet", "place_suburbs"]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      }
    } catch {
      /* map mid-teardown */
    }
  }, [map]);

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
        district: p.district,   // year-invariant; carried for the table's district facet (D6)
        // Every metric value for the active year — the analyst table shows the
        // FULL set (the same fields the rail lists), not just the active column.
        // gjView is already projected to bare names for the active year.
        median_assessvalue: num(p.median_assessvalue),
        avall_public:       num(p.avall_public),
        avg_lotsize:        num(p.avg_lotsize),
        // Mean excl. condo — carried on the row so the single-select KPI card's CONDO
        // secondary block shows the real value (was absent → a false "—", A4). At 0%
        // condo it equals the overall mean; null ONLY at 100% condo (no non-condo).
        avg_assessvalue_without_unit: num(p.avg_assessvalue_without_unit),
        median_yearbuilt:   num(p.median_yearbuilt),
        yoy_log_points:     num(p.yoy_log_points),
        n_properties:       num(p.n_properties),   // parcels — for the console's vs-city slot (D3)
        pct_with_unit:      num(p.pct_with_unit),  // condo share 0–100 — the spine's % Condo column (D4); real all years post D-BE1
        // The ACTIVE metric across every year — drives the console's trend instrument (D3/C8).
        series: years.map((y) => num(gp[`${metric}_${y}`])),
        // The matched-sample YoY across every year — the trend instrument's YoY strip (C8).
        yoySeries: years.map((y) => num(gp[`yoy_log_points_${y}`])),
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
    const selected = [];
    for (const f of gjView.features) {
      const c = geometryCentroid(f.geometry);
      if (!c) continue;
      const pt = mapInst.project(c);
      if (pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2) {
        ids.push(f.properties["Neighbourhood ID"]);
        selected.push(f);
      }
    }
    setSelectedIds(ids);
    setSearchQuery(""); // a fresh box-select supersedes any name filter (D5 review — so it can't reassert on Clear)
    // Selection-fit: frame the selected area in the clear (non-chrome) map region —
    // ONCE, on this gesture, then hands-off (later year/metric/sort/dock changes
    // never refit). ≥2 also raises the dock, so reserve the console's height in the
    // padding (it's about to open) — deterministic, no waiting on the animation.
    if (ids.length >= 2) {
      setDockOpen(true);
      fitToFeatures(mapInst, selected, { reserveConsole: true });
    } else if (ids.length === 1) {
      fitToFeatures(mapInst, selected);
    }
  }

  // --- Camera: pitched HOME preset + reset (note 15 + amendment) -------------
  // HOME is a TUNED per-city pitched preset (HOME_VIEW), NOT a data-derived fit —
  // applied on load + city switch. The flat data-derived fit (fitToFeatures) is
  // KEPT for selection framing. No control interaction moves the camera: this fires
  // only on a genuine CITY change (a year/metric paint-swap leaves gj+city alone).

  // Save the live camera so a MapView REMOUNT can restore it. The no-prior-year YoY
  // excursion (earliest year + YoY) swaps MapView↔EmptyState, remounting the map and
  // changing the `map` identity; without this, the remount would re-home (a control
  // interaction moving the camera). Restored below instead.
  const lastCamRef = useRef(null);
  useEffect(() => {
    if (!map) return undefined;
    const save = () => {
      lastCamRef.current = {
        center: map.getCenter(), zoom: map.getZoom(),
        pitch: map.getPitch(), bearing: map.getBearing(),
      };
    };
    map.on("moveend", save);
    return () => { try { map.off("moveend", save); } catch { /* gone */ } };
  }, [map]);

  // Apply HOME, distinguishing the THREE reasons this effect ([map, gj, city]) runs:
  //   • city changed      → home to the new city's preset (first instant, later eased)
  //   • same city, NEW map → a remount (e.g. the no-prior-year YoY excursion): RESTORE
  //                          the saved camera, don't re-home — a remount isn't a switch
  //   • same city+map, gj  → a data reload (a future second data city's file arrives):
  //                          leave the camera alone (the city-changed run already homed)
  // Gating restore on MAP IDENTITY (not just "homedCityRef===city") is what keeps a
  // genuine A→B city switch from having its second run (B's data load) wrongly restore
  // A's camera over B. [camera-model]
  const homedCityRef = useRef(null);
  const lastMapRef = useRef(null);
  const firstHomeRef = useRef(true);
  useEffect(() => {
    if (!map || !gj) return;
    if (homedCityRef.current !== city) {
      homedCityRef.current = city;
      lastMapRef.current = map;
      applyCameraPreset(map, HOME_VIEW[city], { ease: !firstHomeRef.current });
      firstHomeRef.current = false;
    } else if (lastMapRef.current !== map) {
      lastMapRef.current = map; // same city but a new map instance = a remount → restore
      if (lastCamRef.current) { try { map.jumpTo(lastCamRef.current); } catch { /* gone */ } }
    }
  }, [map, gj, city]);

  // MapView unmounts whenever we show an empty/error state instead of it (no-prior-
  // year, fetch error, or no data). Drop mapReady so the SKELETON re-covers the next
  // remount — url stays set across the no-prior-year excursion, so the fetch effect's
  // own reset doesn't fire, and without this the remounted map would flash its flat
  // construction fallback before the camera restore applies. [camera-model]
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!url || fetchError || noPriorYear) setMapReady(false); }, [url, fetchError, noPriorYear]);

  // RESET control: context-aware single button — fit-to-SELECTION (flat) when a
  // selection exists, else return to the pitched HOME preset. Held in a ref (reads
  // fresh state) so the control is added to the map ONCE; the ref is rewritten each
  // render (the live-callback pattern MapView uses for onLoad).
  const resetRef = useRef(null);
  // eslint-disable-next-line react-hooks/refs
  resetRef.current = () => {
    if (!map) return;
    if (selectedIds.length >= 1 && gjView) {
      const set = new Set(selectedIds.map(String));
      fitToFeatures(map, gjView.features.filter((f) => set.has(String(f.properties["Neighbourhood ID"]))));
    } else {
      applyCameraPreset(map, HOME_VIEW[city], { ease: true });
    }
  };
  useEffect(() => {
    if (!map) return undefined;
    const ctrl = makeResetControl(() => resetRef.current?.());
    map.addControl(ctrl, "top-right");
    return () => { try { map.removeControl(ctrl); } catch { /* map already gone */ } };
  }, [map]);

  // Dev-only: expose the live map for console debugging (and headless camera
  // checks). import.meta.env.DEV is statically false in prod, so this is stripped.
  // Cleared on teardown so a removed instance isn't pinned on window.
  useEffect(() => {
    if (import.meta.env.DEV && map) {
      window.__paMap = map;
      return () => { try { delete window.__paMap; } catch { /* ignore */ } };
    }
    return undefined;
  }, [map]);

  // Honest area aggregate over the SELECTION (C3) — the box-selected set rolled up by
  // aggregateFeatures (the shared parcel-weighted math). Null until ≥2 are selected.
  // The aggregate reads the SELECTION channel only (selectedIds) — never brushedIds:
  // brushing stays VIEW-only (D6/D7 fence). nSelected rides alongside for the header.
  const selectionAggregate = useMemo(() => {
    if (selectedIds.length <= 1 || !gjView) return null;
    const set = new Set(selectedIds.map(String));
    const selected = gjView.features.filter(
      (f) => set.has(String(f.properties["Neighbourhood ID"]))
    );
    return { nSelected: selectedIds.length, ...aggregateFeatures(selected) };
  }, [selectedIds, gjView]);

  // City baseline (D8 item 8): the SAME honest parcel-weighted aggregate over EVERY
  // polygon, so each selection figure can be read against the whole city. Derived once
  // per loaded year (gjView is the active-year projection) — so it re-derives on a year
  // switch with the selection, never a literal. NOT a naive average of neighbourhood
  // medians: the median is a median over ALL neighbourhood medians and the mean is
  // parcel-exact, identical in basis to the selection so the delta is apples-to-apples.
  const cityBaseline = useMemo(
    () => (gjView ? aggregateFeatures(gjView.features) : null),
    [gjView]
  );

  // Scoped export (C4): the selection if any, else ALL features. Built from the
  // resident combined `gj` (every year on the feature) — pure client-side blobs.
  // Declared AFTER selectionAggregate/cityBaseline so its csv-aggregate branch reads
  // them as ordinary backward references (keeps the React Compiler's manual-memo
  // analysis happy — a forward ref into a useMemo trips preserve-manual-memoization).
  function handleExport(format) {
    if (!gj) return;
    const set = selectedIds.length ? new Set(selectedIds.map(String)) : null;
    const scoped = set
      ? gj.features.filter((f) => set.has(String(f.properties["Neighbourhood ID"])))
      : gj.features;
    const base = `property-assessment_${city}_${selectedIds.length ? `${scoped.length}-selected` : "all"}`;
    // Provenance context for the CSV sidecars — all from state, no literals. The
    // CSV bodies are pure data; provenance rides alongside as a _provenance.txt.
    //
    // The metric is named as the user SAW it, not by its internal key. The key
    // `yoy_log_points` claims "pct" of a value that is log points — the claim
    // METHODOLOGY D7 retired — so the sidecar was stating the wrong unit while
    // sitting next to a CSV whose own column already says `yoy_log_points`. The
    // label is what the map, legend and table showed, and it carries the unit.
    const meta = {
      city,
      metric: selectedMetric.label,
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
    } else if (format === "csv-aggregate") {
      // Selection SUMMARY (item 7): the honest aggregate + city comparison (the
      // item-8 figures), NOT the per-neighbourhood rows. Reads selectionAggregate /
      // cityBaseline — the SELECTION channel — never brushedIds. Only meaningful with
      // an aggregate (≥2 selected); the menu only offers it then, this guards anyway.
      if (!selectionAggregate) return;
      const csvName = `${base}_${year}_summary.csv`;
      downloadCsvWithSidecar(csvName, buildAggregateCsv(selectionAggregate, cityBaseline),
        buildProvenanceText({ ...meta, file: csvName, coverage: String(year),
          shape: "selection summary — one row per measure; selection figure vs city baseline" }));
    } else if (format === "geojson") {
      downloadText(`${base}.geojson`, buildGeoJson(scoped), "application/geo+json");
    } else if (format === "png" && map) {
      exportPng(map, `property-assessment_${city}_${year}.png`);
    }
  }

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
  // Pre-manifest shells render the bare frame (.pa-map → .pa-canvas → .canvas-wrap)
  // so the chrome doesn't reflow when the manifest resolves. No context yet (no
  // city/year/data), so the top bar + floating cluster are omitted and the message
  // centres in the canvas.
  if (manifestError) {
    return (
      <article className="content-map pa-map">
        <div className="pa-canvas">
          <div className="canvas-wrap">
            <EmptyState
              title="Could not load the data catalogue."
              body={manifestError}
            />
          </div>
        </div>
      </article>
    );
  }

  if (!manifest) {
    return (
      <article className="content-map pa-map">
        <div className="pa-canvas">
          <div className="canvas-wrap">
            <p className="map-loading">Loading data catalogue…</p>
          </div>
        </div>
      </article>
    );
  }

  const empty = url ? null : describeEmpty(manifest, city, year);

  // (Year-slider bounds + fill % moved into DataTable with the instrument — Fix 4.)

  // The S-b single-select DETAIL instrument (contract §4/C9): the right-side float,
  // shown only when the console is DOWN and exactly one neighbourhood is selected.
  // When the console is UP the detail role is consolidated into the console's rail
  // cards + header (no `detail` prop, no re-homing). null unless a single selection.
  const detailRail =
    url && selectedFeature ? (
      <InfoRail
        feature={selectedFeature}
        metric={metric}
        sparkValues={sparkValues}
        activeIndex={activeYearIndex}
        cityBaseline={cityBaseline}
        cityName={city}
        rank={tableRows.find((r) => String(r.id) === String(singleSelectedId))?.rank ?? null}
        onClear={() => setSelectedIds([])}
      />
    ) : null;

  return (
    <article className="content-map pa-map">
      {/* ===== FULL-BLEED MAP CANVAS — no reserved column in flow. The instrument
           column (left) and the console (bottom) float over the map (contract
           §3.1/§3.2); the map centre stays chrome-free. The old .pa-topbar is
           gone — the parcel count re-homes to the column footer. ===== */}
      <div className="pa-canvas">
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

          {/* ===== INSTRUMENT COLUMN (contract §3.1) — TWO stacked cards on the
              left of the full-bleed map (P1 split the old single chassis): an
              IDENTITY card (title + city switcher) and, below it, the INSTRUMENT
              chassis card (metric → tuning → legend → footer, hairline-separated
              modules). The transparent .pa-float wrapper stays (same class + width)
              so chromePadding's live left reserve still measures it
              (interactions.js:178); the two cards carry the dark surface. Identity
              ALWAYS renders so the city switcher stays reachable in the Calgary
              no-data state; the instrument chassis is gated on url. ===== */}
          <div className="pa-float pa-column">
            <section className="pa-card pa-card-identity">
              <IdentityCard cities={CITIES} city={city} onCityChange={changeCity} />
            </section>

            {url && (
              <section className="pa-card pa-card-instrument">
                {/* METRIC module — the down-state home of the metric selector. It
                    goes DORMANT in Analysis (dockOpen): the chips re-home to the
                    console header (DataTable spine), never in two places at once.
                    Same two-conditional-homes mechanic, relocated into the column. */}
                {!dockOpen && (
                  <div className="pa-col-mod pa-col-metric">
                    <SegmentedControl
                      label="Metric"
                      options={METRICS}
                      value={metric}
                      onChange={setMetric}
                    />
                  </div>
                )}

                {/* TUNING module removed from the column (Fix 4). The Year + metric-range
                    sliders re-home into the Data Table spine as ONE horizontal instrument:
                    a strip above the pull-up handle in View, the console header in Analysis.
                    Year state (sliderYear/slideYear) is passed to <DataTable> below; the
                    range keeps its TanStack wiring + the VIEW-only brush there. */}

                {/* LEGEND module — relocated from the bottom-right .pa-legend float
                    into the column (a real relocation, §4). Legend.jsx internals
                    untouched; the horizontal ramp swaps with the active metric. */}
                <div className="pa-col-mod pa-col-legend">
                  {/* D-F1 / AF-1 — restore the "Legend" module banner (was missing); uniform
                      with the Metric + ⚙ Tuning banners via the shared .pa-col-lab hook. */}
                  <span className="pa-col-lab">Legend</span>
                  <Legend
                    title={selectedMetric.label}
                    stops={stops}
                    format={selectedMetric.fmt}
                    horizontal
                    diverging={isYoy}
                  />
                </div>

                {/* FOOTER module — About & tips trigger + parcel count (re-homed
                    here from the removed .pa-topbar). The popover opens upward. */}
                <div className="pa-col-mod pa-col-foot">
                  <div className="pa-foot-line">
                    <button
                      type="button"
                      className="pa-info-btn"
                      aria-expanded={infoOpen}
                      onClick={() => setInfoOpen((o) => !o)}
                    >
                      About &amp; tips
                    </button>
                    <span className="pa-col-count">{propCount.toLocaleString()} parcels</span>
                  </div>
                  {infoOpen && (
                    <div className="pa-info-pop" role="group" aria-label="About and tips">
                      {/* Fix 4 — the canonical interaction reference: ALL interactions documented
                          once, plain English, Title Case (§2). The inline "Press T" handle hint
                          stays as the discoverable; this is the reference. */}
                      <p className="pa-info-pop-h">How to Use This Map</p>
                      <ul className="pa-info-list">
                        <li><b>Click</b> a Neighbourhood to Select It.</li>
                        <li><b>Shift + Drag</b> Across the Map to Box-Select Several at Once.</li>
                        <li>Use the <b>Search</b> (Top Right) to Find and Fly to a Neighbourhood.</li>
                        <li>Drag the <b>Year</b> Slider to Change the Year; Drag the <b>Median</b> Range to Narrow the Set to a Value Range.</li>
                        <li>Press <b>T</b> (or the <b>Data Table</b> Handle) to Open the Analyst Table.</li>
                        <li><b>Clear Filters</b> Resets the Range Filter; <b>Clear Selection</b> Deselects — Two Separate Undos.</li>
                      </ul>
                      {/* D-F3 — the honest-aggregate disclosure, re-homed here from the per-KPI
                          methodology chips (surfaced ONCE, unobtrusively; §4/§9 never stripped). */}
                      <p className="pa-box-ref">
                        Selection aggregates: <b>Mean</b> is parcel-weighted (exact);{" "}
                        <b>Median</b> (of neighbourhood medians) and <b>YoY</b> are
                        neighbourhood-weighted approximations (≈).
                      </p>
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
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* ===== SINGLE-SELECT DETAIL (S-b) — a right-side float below the nav
              stack, mounted only when exactly one neighbourhood is selected and the
              console is down. Interior anatomy re-skinned to the annex in C9. ===== */}
          {url && !dockOpen && detailRail}

          {/* UNIFIED SEARCH (D5) — the ONE search control: a magnifier peek sitting
              with the map's zoom stack (top-right). Typing filters the table live
              (setSearchQuery → DataTable's controlled globalFilter); selecting flies
              + pins the map (flyAndPinByName) and sets the exact filter. One input,
              both surfaces — coordinated views, not a brush. */}
          {url && (
            <SearchPeek
              names={names}
              value={searchQuery}
              onValueChange={setSearchQuery}
              onSelect={(name) => { flyAndPinByName(name); setSearchQuery(name); }}
            />
          )}

          {/* ===== CONSOLE FOOT — the analysis dock only. The tuning rack moved
              into the instrument column (contract §3.2), so the console now rises
              ALONE from the bottom. pointer-events:none lets map clicks pass
              through the gap around the dock. ===== */}
          <div className="pa-foot">
            {/* ANALYSIS DOCK — the handle doubles as the dock toggle (open =
                dockOpen). Analytical surface over the resident gjView; rows link
                both ways to the shared selection. Only with data loaded. */}
            {url && gjView && (
              <DataTable
                rows={tableRows}
                metric={metric}
                metricLabel={selectedMetric.label}
                cityName={city}
                metrics={METRICS}
                onMetricChange={setMetric}
                activeIndex={activeYearIndex}
                year={year}
                years={years}
                sliderYear={sliderYear}
                slideYear={slideYear}
                selectedIds={selectedIds}
                onSelectRow={selectNeighbourhood}
                onHoverRow={setHoveredRowId}
                aggregate={selectionAggregate}
                cityBaseline={cityBaseline}
                onClearSelection={() => { keepDockOnClearRef.current = true; setSelectedIds([]); }}
                onExport={handleExport}
                onBrush={setBrushedIds}
                open={dockOpen}
                onToggle={() => setDockOpen((d) => !d)}
                globalFilter={searchQuery}                 /* controlled by the unified SearchPeek (D5) */
                onGlobalFilterChange={setSearchQuery}
              />
            )}
          </div>
        </div>
    </article>
  );
}
