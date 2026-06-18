// =============================================================================
// PermitChoroplethMap.jsx
//
// The Building Permits NEIGHBOURHOOD CHOROPLETH route ("Permit Neighbourhoods").
// Layout mirrors property-assessment/PropertyAssessmentMap.jsx: a .sb sidebar of
// controls beside a full-bleed .canvas-wrap holding a shared MapView.
//
// Differences from PropertyAssessmentMap:
//   • Edmonton only — no city toggle.
//   • A METRIC toggle (Permit count vs Total construction value) repaints the
//     fill live via setPaintProperty — no remount, same GeoJSON.
//   • A YEAR <select> swaps the GeoJSON file (one per year, 2009–2026); that DOES
//     remount the map (key={url}), like assessment switching years.
//   • No neighbourhood search (deferred for this section).
//
// Data: /data/building-permits/permit-neighbourhoods/permit_neighbourhoods_<year>.geojson
// =============================================================================

import { useEffect, useMemo, useState } from "react";

import MapView from "../../components/MapView.jsx";
import Legend from "../../components/Legend.jsx";
import OptionToggle from "../../components/OptionToggle.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import MapErrorBoundary from "../../components/MapErrorBoundary.jsx";
import MapSkeleton from "../../components/MapSkeleton.jsx";
import {
  MAP_VIEW,
  BASEMAP_STYLE,
  METRICS,
  DEFAULT_METRIC,
  STATE_STYLE,
  GREY_STATES,
  permitChoroplethLayers,
  buildFillExpression,
} from "./permitChoroplethStyle.js";
import { useChoroplethInteractions } from "./interactions.js";

// Years with a built GeoJSON (see permit-neighbourhoods/). Newest-first so the
// <select> opens on recent years; 2026 is the default. Adding a year is a
// pipeline-only change (a new file) plus one entry here.
const YEARS = [
  2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018,
  2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010, 2009,
];
const DEFAULT_YEAR = 2026;

const FILL_LAYER_ID = "permit-nbhd-fill";

// Match the .sb collapse transition (index.css) so we resize the map only after
// the sidebar has finished shrinking/growing.
const SIDEBAR_TRANSITION_MS = 220;

// One file per year at a stable path; year is the only thing that varies.
function dataUrl(year) {
  return `/data/building-permits/permit-neighbourhoods/permit_neighbourhoods_${year}.geojson`;
}

export default function PermitChoroplethMap() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [metric, setMetric] = useState(DEFAULT_METRIC);
  const [map, setMap] = useState(null);
  const [gj, setGj] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const url = dataUrl(year);

  // Hide/show the sidebar; resize the map once the width transition completes.
  function toggleSidebar() {
    setCollapsed((v) => !v);
    if (map) setTimeout(() => map.resize(), SIDEBAR_TRANSITION_MS);
  }

  // Switch the selected metric by its label (what OptionToggle hands back).
  function changeMetric(label) {
    const next = METRICS.find((m) => m.label === label);
    if (next) setMetric(next);
  }

  // Fetch the year's GeoJSON for the interactions layer (geometry for fly-to;
  // MapView loads the same URL into the map source itself). Resets on year
  // change. setMap(null) is safe mid-flight: MapView is keyed by url, so it
  // unmounts cleanly and map.remove() destroys the old instance.
  useEffect(() => {
    // Reset-on-url-change is intentional: clear the stale map + data the instant
    // the year (url) changes, before the new fetch resolves, so the previous
    // year's polygons never flash under the new selection. Same documented
    // pattern as PropertyAssessmentMap; the rule flags synchronous setState in
    // an effect but it is safe and deliberate here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(null);
    setGj(null);
    setFetchError(null);

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

  // Repaint the fill when the metric changes, WITHOUT remounting (which would
  // refetch and reset zoom/pan). MapView reads `layers` only at mount, so live
  // updates go through setPaintProperty.
  useEffect(() => {
    if (!map) return;
    try {
      // The map can be mid-teardown (year switch unmounts MapView); getLayer on
      // a removed map throws — ignore it, the next mount repaints via onLoad.
      if (map.getLayer(FILL_LAYER_ID)) {
        map.setPaintProperty(FILL_LAYER_ID, "fill-color", buildFillExpression(metric));
      }
    } catch {
      /* map removed; no-op */
    }
  }, [map, metric]);

  // Hover + click-to-pin interactions; re-installs when the metric changes so a
  // freshly-opened popup headlines the selected metric.
  useChoroplethInteractions(map, gj, metric);

  // Legend ramp rows want a `label` per stop; use the metric's own formatter so
  // the label reads as the value (Legend then hides the redundant "· label").
  const legendStops = useMemo(
    () => metric.stops.map((s) => ({ v: s.v, c: s.c, label: metric.format(s.v) })),
    [metric]
  );
  const greyStates = GREY_STATES.map((k) => STATE_STYLE[k]);

  return (
    <article className="content-map">
      <aside className={`sb${collapsed ? " collapsed" : ""}`} aria-label="Map sidebar">
        <div className="sb-header">
          <p className="eyebrow">Building Activity</p>
          <h1 className="sb-title">
            Edmonton — building permits by neighbourhood
          </h1>
          <p className="sb-sub">
            Permit activity aggregated to 407 neighbourhoods. Colour = selected
            metric. Hover to preview, click to pin. N&lt;10 suppressed.
          </p>
        </div>

        <section className="sb-section">
          {/* 18 years is too many for a segmented toggle (see OptionToggle's
              own note), so the year control is a native dropdown. */}
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
          {/* Two metrics — a segmented toggle. Repaints the fill live. */}
          <OptionToggle
            label="Metric"
            options={METRICS.map((m) => m.label)}
            value={metric.label}
            onChange={changeMetric}
          />
        </section>

        <section className="sb-section">
          <Legend
            title={metric.label}
            stops={legendStops}
            format={metric.format}
            greyTitle="Non-aggregated polygons"
            greyStates={greyStates}
          />
        </section>

        <div className="sb-ref">
          <p>Source: City of Edmonton Open Data (24uj-dj8v).</p>
          <p>Aggregated by neighbourhood · N&lt;10 suppressed.</p>
        </div>
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

        {fetchError ? (
          <EmptyState
            title="Could not load data"
            body={`The ${year} permit aggregates failed to load. Try refreshing or selecting a different year.`}
          />
        ) : (
          // key={url} remounts MapView on a year change: MapLibre destroys the
          // old map in cleanup, the new instance fires onLoad, and the metric
          // effect + interactions reattach. The boundary keeps a WebGL/MapLibre
          // failure from blanking the page.
          <>
            {!gj && <MapSkeleton />}
            <MapErrorBoundary key={url}>
              <MapView
                className="canvas"
                basemapStyle={BASEMAP_STYLE}
                geojsonUrl={url}
                view={MAP_VIEW}
                sourceId="permit-nbhd"
                promoteId="Neighbourhood ID"
                layers={permitChoroplethLayers(metric)}
                onLoad={setMap}
              />
            </MapErrorBoundary>
          </>
        )}
      </div>
    </article>
  );
}
