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

import { useEffect, useMemo, useRef, useState } from "react";

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
import { fmtNumber } from "../../utils/format.js";
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
  // Pattern B — hovered neighbourhood properties for the sidebar stat panel.
  const [hoveredFeature, setHoveredFeature] = useState(null);

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

  const names = useMemo(() => (gjView ? indexNamesForSearch(gjView) : []), [gjView]);
  const flyAndPinByName = useChoroplethInteractions(map, gjView, year, setHoveredFeature);

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
    // manifest in deps: the <aside ref={sbRef}> only exists after the manifest
    // loads (early returns gate it), so re-run once the sidebar actually mounts
    // and sbRef.current is non-null.
  }, [manifest]);

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
      <aside ref={sbRef} className="sb" aria-label="Map sidebar">
        {/* Fixed-width holder so content never reflows as .sb animates its width — see .sb-inner in index.css. */}
        <div className="sb-inner">
        <div className="sb-header">
          <p className="eyebrow">Properties & Land</p>
          <h1 className="sb-title">
            {city} — {year}
          </h1>
          <p className="sb-sub">
            {propCount.toLocaleString()} Layer 1a-cleaned residential
            properties, neighbourhood aggregates. Hover any polygon for
            detail; click to pin.
          </p>
        </div>

        <section className="sb-section">
          {/* opt-toggle-gel wrapper gives the segmented control its gel track +
              raised active pill (see .opt-toggle-gel in index.css). */}
          <div className="opt-toggle-gel">
            <OptionToggle
              label="City"
              options={CITIES}
              value={city}
              onChange={changeCity}
            />
          </div>
          {/* Year is a range slider (matches the Building Permits point-map
              slider). The thumb drives the SAME paint swap the dropdown drove,
              just live — slideYear commits to `year`, which the repaint effect
              turns into the setPaintProperty colour swap. min/max come from the
              manifest year list (no literals); years are contiguous so step = 1
              maps every position to a real year. sliderYear is the live drag
              position (instant thumb + readout); `year` follows on a throttle. */}
          <div className="sb-select-field">
            <span className="sb-select-label">
              Year <strong className="sb-year-value">{sliderYear ?? year ?? "…"}</strong>
            </span>
            {year != null && (
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
            )}
          </div>
          {/* Which aggregate column the choropleth colours by. */}
          <div className="sb-select-field">
            <span className="sb-select-label">Metric</span>
            <select
              className="sb-select"
              aria-label="Metric"
              data-default={metric === METRICS[0].key ? "true" : "false"}
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
            placeholder="Search neighbourhood…"
            hint={
              fetchError
                ? `Search unavailable: ${fetchError}`
                : !url
                  ? "Search will return when data lands."
                  : gj
                    ? "Enter a name and press Return to fly to it."
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
            discrete={isYoy}
          />
        </section>

        {/* Pattern B — live hover stat panel: name + selected metric + N props. */}
        {!hoveredFeature ? (
          <section className="sb-section sb-hover-panel sb-hover-empty">
            <p className="sb-hover-hint">Hover a neighbourhood to see its stats</p>
          </section>
        ) : hoveredFeature.polygon_state === "aggregated" ? (
          <section className="sb-section sb-hover-panel">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <div className="sb-hover-rows">
              <div className="sb-hover-row">
                <span className="sb-hover-k">{selectedMetric.label}</span>
                <span className="sb-hover-v">{selectedMetric.fmt(hoveredFeature[metric])}</span>
              </div>
              <div className="sb-hover-row">
                <span className="sb-hover-k">N properties</span>
                <span className="sb-hover-v">{fmtNumber(hoveredFeature.n_properties)}</span>
              </div>
            </div>
          </section>
        ) : (
          <section className="sb-section sb-hover-panel sb-hover-muted">
            <p className="sb-hover-name">{hoveredFeature.display_name}</p>
            <p className="sb-hover-district sb-hover-state">No data</p>
          </section>
        )}

        <div className="sb-ref">
          <p>
            {selectedMetric.label}, {city} {year}.
            Layer 1a-cleaned residential properties.
          </p>
          <p>Data last updated: {manifest?.last_updated ?? "—"}</p>
          {/* Identity-reconciliation note: the pipeline absorbs old neighbourhood
              identities into their current one and shows the current name in every
              year, so a user reading a neighbourhood's history under a new name (or
              a suppressed 2024 value) has a plain-language explanation + the
              regulatory source. Persistent footnote — reuses .sb-ref styling. */}
          <p>
            Some neighbourhoods have been renamed or renumbered by the City of
            Edmonton. Their full history is shown under the current name. For
            example, Oliver was renamed Wîhkwêntôwin, effective 1 January 2025;
            values before this date are shown under Wîhkwêntôwin. Figures around
            the 2024 transition may be limited or suppressed where data is below
            reporting thresholds.{" "}
            <a
              href="https://www.edmonton.ca/city_government/city_organization/naming-committee"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}
            >
              City of Edmonton Naming Committee
            </a>.
          </p>
        </div>
        </div>{/* /sb-inner */}
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
