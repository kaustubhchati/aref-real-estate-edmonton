// =============================================================================
// PropertyAssessmentMap.jsx
//
// The Property Assessment route. Layout mirrors
// pipeline/property-assessment/scripts/09_build_choropleth.html (09).
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

import { useEffect, useMemo, useState } from "react";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import SearchInput from "../../components/SearchInput.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import {
  BASEMAP_STYLE,
  MAP_VIEW,
  STATE_STYLE,
  GREY_STATES,
  METRICS,
  YOY_STOPS,
  stopsFromScale,
  metricStops,
  choroplethFillColor,
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
  resolveDataUrl,
  describeEmpty,
} from "./dataSources.js";
import {
  useChoroplethInteractions,
  indexNamesForSearch,
} from "./interactions.js";

export default function PropertyAssessmentMap() {
  // The manifest is the source of truth for which years exist. Until it loads,
  // we show a loading state; if it fails, an error state. year is null until
  // the manifest tells us a city's default.
  const [manifest, setManifest] = useState(null);
  const [manifestError, setManifestError] = useState(null);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [year, setYear] = useState(null);
  const [metric, setMetric] = useState(METRICS[0].key);

  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  // Load the manifest once on mount. We seed the year in the SAME update as the
  // manifest so there's no frame where the manifest is loaded but no year is
  // chosen yet (which would flash an empty state). City can't have changed yet
  // — the controls only render after this resolves — so DEFAULT_CITY is right.
  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        setYear(getDefaultYear(m, DEFAULT_CITY));
      })
      .catch((err) => { if (!cancelled) setManifestError(err.message); });
    return () => { cancelled = true; };
  }, []);

  // The years this city offers, and the URL for the current selection. A year
  // the manifest doesn't list (any Calgary year today) yields url=null →
  // EmptyState. resolveDataUrl always returns a path, so the gate lives here.
  const years = getYearsForCity(manifest, city);
  const url = year != null && years.includes(year) ? resolveDataUrl(city, year) : null;

  const selectedMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  // yoy_pct_change is a signed % with no prior year for the earliest year in
  // the dataset, so that (year, metric) combination has no data to colour.
  // Derive "earliest" from the manifest's years — no year literal.
  const isYoy = metric === "yoy_pct_change";
  const earliestYear = years.length ? Math.min(...years) : null;
  const noPriorYear = isYoy && year != null && year === earliestYear;

  // Colour ramp for the current metric:
  //   yoy_pct_change     → the fixed diverging YOY_STOPS (same scale every year)
  //   median_assessvalue → its locked per-year manifest scale
  //   everything else    → quantiles computed from the loaded polygons
  // gj is null until the fetch resolves — metricStops falls back to the locked
  // STOPS until then. Memoised so its identity is stable between renders (the
  // repaint effect and the Legend both depend on it).
  const stops = useMemo(() => {
    if (metric === "yoy_pct_change") return YOY_STOPS;
    return metric === "median_assessvalue"
      ? stopsFromScale(getColourScale(manifest, city, year))
      : metricStops(gj, metric);
  }, [metric, manifest, city, year, gj]);

  // Switching city resets the year to that city's default in the same update,
  // so we never carry one city's year onto another (or onto a city with none).
  function changeCity(nextCity) {
    setCity(nextCity);
    setYear(getDefaultYear(manifest, nextCity));
  }

  // Single effect on [url]: reset all derived state, then fetch if there's a
  // real URL. When url is null we leave gj/map null and the JSX renders
  // EmptyState instead of MapView — no fetch attempted, no errors logged.
  // setMap(null) is safe even mid-flight: MapView is keyed by url, so it
  // unmounts cleanly and map.remove() inside its useEffect cleanup destroys
  // the old MapLibre instance.
  useEffect(() => {
    setMap(null);
    setGj(null);
    setFetchError(null);
    if (!url) return undefined;

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

  // Repaint the fill when the metric or its colour scale changes, WITHOUT
  // remounting the map (which would refetch the GeoJSON and reset zoom/pan).
  // MapView reads `layers` only at mount, so live updates go through
  // setPaintProperty — the mechanism MapView documents for exactly this.
  useEffect(() => {
    if (!map) return;
    try {
      // The map can be mid-teardown here: switching to the no-prior-year empty
      // state unmounts MapView without changing `url` (so `map` still points at
      // the now-removed instance). getLayer on a removed map throws; ignore it
      // — the next mounted map repaints via onLoad → this effect re-running.
      if (map.getLayer("nbhd-fill")) {
        map.setPaintProperty("nbhd-fill", "fill-color", choroplethFillColor(metric, stops));
      }
    } catch {
      /* map removed; no-op */
    }
  }, [map, metric, stops]);

  const names = useMemo(() => (gj ? indexNamesForSearch(gj) : []), [gj]);
  const flyAndPinByName = useChoroplethInteractions(map, gj, year);

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
    <article className="content-map">
      <aside className="sb" aria-label="Map sidebar">
        <h1 className="sb-title">
          {city} — residential assessment{year != null ? `, ${year}` : ""}
        </h1>
        <p className="sb-sub">
          Layer 1a-cleaned (parking + R1 + R3), neighbourhood aggregates.
          Hover any polygon for detail; click to pin.
        </p>

        <section className="sb-section">
          <OptionToggle
            label="City"
            options={CITIES}
            value={city}
            onChange={changeCity}
          />
          {/* 15 years is too many for a segmented toggle (see OptionToggle's
              own note), so the year control is a native dropdown. years comes
              straight from the manifest. */}
          <div className="sb-select-field">
            <span className="sb-select-label">Year</span>
            <select
              className="sb-select"
              aria-label="Year"
              value={year ?? ""}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {/* Which aggregate column the choropleth colours by. */}
          <div className="sb-select-field">
            <span className="sb-select-label">Metric</span>
            <select
              className="sb-select"
              aria-label="Metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="sb-section">
          <SearchInput
            label="Search neighbourhood"
            placeholder="Type a name…"
            hint={
              fetchError
                ? `Search unavailable: ${fetchError}`
                : !url
                  ? "Search will return when data lands."
                  : gj
                    ? "Press Enter to fly to it."
                    : "Loading…"
            }
            names={names}
            onSelect={flyAndPinByName}
          />
        </section>

        <section className="sb-section">
          <Legend
            title={selectedMetric.label}
            stops={stops}
            format={selectedMetric.fmt}
            greyTitle="Non-aggregated polygons"
            greyStates={GREY_STATES.map((k) => STATE_STYLE[k])}
          />
        </section>

        <p className="sb-ref">
          {selectedMetric.label} scale for {year} (
          {metric === "yoy_pct_change"
            ? "fixed diverging scale"
            : metric === "median_assessvalue"
              ? "from the manifest"
              : "computed from this year's neighbourhoods"}
          ): {stops.map((s) => `${s.label} ${selectedMetric.fmt(s.v)}`).join(" · ")}.
        </p>
      </aside>

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
          // key={url} on the boundary: a new data URL (switching cities or
          // years) remounts both the boundary — clearing any caught error so a
          // stale failure doesn't persist across selections — and MapView
          // inside it. MapLibre destroys the old map in its cleanup; the new
          // instance fires onLoad and useChoroplethInteractions reattaches.
          // The boundary keeps a WebGL/MapLibre failure from blanking the page.
          <>
            {url && !gj && <MapSkeleton />}
            <MapErrorBoundary key={url}>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={url}
                view={MAP_VIEW}
                sourceId="nbhd"
                promoteId="Neighbourhood ID"
                layers={choroplethLayers(stops, metric)}
                images={choroplethImages()}
                onLoad={setMap}
              />
            </MapErrorBoundary>
          </>
        ) : (
          <EmptyState title={empty.title} body={empty.body} />
        )}
      </div>
    </article>
  );
}
