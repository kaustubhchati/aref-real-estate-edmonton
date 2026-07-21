// =============================================================================
// exportData.js
//
// Scoped client-side export (Felt C4) — no server, no dependency. Built from the
// RESIDENT combined data (every year is on each feature) and downloaded as blobs.
// Two analysis-ready CSV shapes, plus GeoJSON + PNG:
//   • CSV snapshot   — wide, the ACTIVE YEAR only, BARE column names (human glance
//                      / GIS join)  → buildSnapshotCsv
//   • CSV timeseries — LONG PANEL, one row per (neighbourhood × year), one column
//                      per metric (plm/Stata xtset shape)  → buildTimeseriesCsv
//   • GeoJSON        — a clip of the chosen features (full all-years properties)
//   • PNG            — the current map canvas (needs preserveDrawingBuffer)
//
// Scope is the caller's chosen feature set (selection, or all when nothing is
// selected). Filenames carry the runtime city/year (state, not literals). The CSV
// bodies are PURE data (a naive read_csv / read.csv parses them with zero ceremony);
// provenance ships alongside as a sidecar .txt — see buildProvenanceText.
// =============================================================================

import { PER_YEAR_FIELDS } from "./dataSources.js";
import { siteConfig, BASEMAP_CREDIT } from "../../config/siteConfig.js";

// Year-invariant identity columns carried once (mirrors 07b's IDENTITY_COLS).
const IDENTITY = ["Neighbourhood ID", "display_name", "district"];

// (There is no export-name mapping here any more. `yoy_log_points` used to be a
// rename applied at THIS layer, over a field the data still called yoy_pct_change.
// 07b now publishes the honest name in the combined GeoJSON itself, so the field and
// the header agree at source — and the GeoJSON export, which passes the properties
// through untouched, carries it too. One name, one place.)

// The timeseries long-panel column contract (LOCKED order): identity, the year
// key, then the per-year metrics. DERIVED from IDENTITY + PER_YEAR_FIELDS so a new
// pipeline metric flows through with no edit here (refresh-by-design). This equals
// the locked contract: Neighbourhood ID, display_name, district, year,
// polygon_state, n_properties, median_assessvalue, avall_public, sd_assessedvalue,
// median_yearbuilt, pct_with_unit, avg_assessvalue_without_unit, avg_lotsize,
// yoy_log_points.
const TIMESERIES_HEADER = [...IDENTITY, "year", ...PER_YEAR_FIELDS];

// The combined file encodes "no value" as the sentinel -999 (a suppressed nbhd, or
// no prior-year YoY) or JSON null. Map both — and any non-finite — to null so the
// CSV cell comes out EMPTY, never "-999". ONE definition; both builders use it.
const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);

// Quote a CSV cell only when needed (comma, quote, or newline); null → empty.
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One per-year field → a CSV cell. polygon_state is a STRING label (passes through
// csvCell); every other PER_YEAR_FIELD is numeric (sentinel-guarded → empty when
// suppressed/missing).
function cellFor(field, raw) {
  return field === "polygon_state" ? csvCell(raw) : csvCell(num(raw));
}

// Provenance text for the SIDECAR file (its own .txt, NOT comment rows inside the
// CSV) — so the CSV bodies stay naive-parser-clean for the panel consumer (pandas /
// readr / read.csv all parse "#" as data by default). Plain text, no "#" prefixes.
// All from runtime state (no literals). The `file` + `shape` lines keep the sidecar
// self-explanatory if it ever gets separated from its CSV.
export function buildProvenanceText({ file, shape, city, metric, scope, coverage }) {
  const date = new Date().toISOString().slice(0, 10);
  const ds = siteConfig.dataSource;
  return [
    `${siteConfig.org} · ${siteConfig.centre}`,
    `dataset: Property Assessment`,
    `file: ${file}`,
    `shape: ${shape}`,
    `city: ${city}`,
    `coverage: ${coverage}`,
    `scope: ${scope}`,
    `map view metric: ${metric}`,
    `exported: ${date}`,
    ``,
    // Source + licence — TRAVELS with the distribution (Open Data Terms' distribution
    // clause: include this URL for the Terms). Attribution to the City is requested (not
    // required) by the Terms; the Terms URL is the hard obligation. This notice PASSES the
    // City's Terms through — it adds no further restriction of any kind (the Terms forbid it).
    `source: ${ds.name}`,
    `source url: ${ds.url}`,
    `licence: ${ds.licence}`,
    `terms of use: ${ds.termsUrl}`,
    ds.disclaimer,
  ].join("\n") + "\n";
}

// Current-year SNAPSHOT CSV: wide, single active `year`, BARE column names (no
// _YYYY suffix) — the human-glance / GIS-join shape. One row per neighbourhood:
// identity cells, then each PER_YEAR_FIELD pulled for `year` (numeric fields
// sentinel-guarded → empty when suppressed; polygon_state is a label).
export function buildSnapshotCsv(features, year) {
  const header = [...IDENTITY, ...PER_YEAR_FIELDS];
  const lines = [header.join(",")];
  for (const f of features) {
    const p = f.properties;
    lines.push([
      ...IDENTITY.map((k) => csvCell(p[k])),
      ...PER_YEAR_FIELDS.map((field) => cellFor(field, p[`${field}_${year}`])),
    ].join(","));
  }
  return lines.join("\n");
}

// Timeseries LONG-PANEL CSV: one row per (neighbourhood × year), one column per
// metric (NOT fully melted), in the locked TIMESERIES_HEADER order. Identity
// columns repeat on every row by design (year-invariant — correct for a panel,
// not redundant). ENTITY-MAJOR, time-ascending: all of a neighbourhood's years
// together, oldest→newest, then the next neighbourhood (the plm/Stata xtset
// convention — do NOT interleave by year). Sentinel/non-finite → empty cell, so the
// panel is cleanly unbalanced-where-missing.
export function buildTimeseriesCsv(features, years) {
  const asc = [...years].sort((a, b) => a - b);
  const lines = [TIMESERIES_HEADER.join(",")];
  for (const f of features) {            // entity-major (outer loop = neighbourhood)
    const p = f.properties;
    const idCells = IDENTITY.map((k) => csvCell(p[k]));
    for (const y of asc) {               // time-ascending within the entity
      lines.push([
        ...idCells,
        csvCell(y),
        ...PER_YEAR_FIELDS.map((field) => cellFor(field, p[`${field}_${y}`])),
      ].join(","));
    }
  }
  return lines.join("\n");
}

// Selection SUMMARY CSV (item 7): the box-selection's honest aggregate read against
// the city baseline — a SMALL, tidy table (one row per measure), distinct from the
// per-neighbourhood row/timeseries exports. Mirrors the item-8 aggregate cards: the
// count breakdown, then the value measures with the selection figure, the city
// baseline, and the delta on the SAME honest basis (level deltas relative, YoY in
// percentage points, parcels as a share of city). Values are raw numbers rounded for
// legibility (NOT display-formatted), so the CSV stays analysis-ready; an empty cell
// means no value. Reads the passed-in aggregate/baseline only — no parcel re-math here.
export function buildAggregateCsv(aggregate, cityBaseline) {
  const a = aggregate || {};
  const cb = cityBaseline || {};
  const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  const rel = (s, c) => (s == null || c == null || c === 0 ? null : ((s - c) / c) * 100); // relative %
  const pp = (s, c) => (s == null || c == null ? null : s - c);                            // percentage points
  const share = (s, c) => (s == null || c == null || c === 0 ? null : (s / c) * 100);      // % of city
  // City neighbourhood total = the three state counts (only when all are present).
  const cityNbhds =
    cb.nReportable != null && cb.nSuppressed != null && cb.nExcluded != null
      ? cb.nReportable + cb.nSuppressed + cb.nExcluded
      : null;
  const rows = [
    ["measure", "selection", "city", "delta", "delta_unit", "basis"],
    ["neighbourhoods", a.nSelected, cityNbhds, null, "", "count"],
    ["reportable", a.nReportable, cb.nReportable, null, "", "count"],
    ["suppressed", a.nSuppressed, cb.nSuppressed, null, "", "count"],
    ["non_residential_or_no_data", a.nExcluded, cb.nExcluded, null, "", "count"],
    ["total_parcels", a.totalParcels, cb.totalParcels,
      r2(share(a.totalParcels, cb.totalParcels)), "pct_share_of_city", "exact"],
    ["mean_assessed", r2(a.parcelMean), r2(cb.parcelMean),
      r2(rel(a.parcelMean, cb.parcelMean)), "relative_pct", "parcel-weighted (exact)"],
    ["median_assessed", r2(a.medianOfMedians), r2(cb.medianOfMedians),
      r2(rel(a.medianOfMedians, cb.medianOfMedians)), "relative_pct", "median of neighbourhood medians (approx)"],
    // Log points, not percent (METHODOLOGY.md D7) — so the delta_unit is log_points
    // too: the gap between two log-point figures is log points, never "percentage
    // points" (which is the gap between two PERCENTAGES).
    ["yoy_log_points", r2(a.areaYoY), r2(cb.areaYoY),
      r2(pp(a.areaYoY, cb.areaYoY)), "log_points", "parcel-weighted (approx)"],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

// A GeoJSON FeatureCollection of exactly the chosen features (full properties). Carries
// the source + Terms URL as top-level foreign members (RFC 7946 §6.1 permits them) so the
// licence travels with this distributed data file — `attribution` (the one-line credit many
// GIS tools surface) plus a structured `metadata` block. The features themselves are passed
// through UNTOUCHED (data content frozen; this only ADDS a notice). No further restriction
// is introduced — the notice passes the City's Terms through.
export function buildGeoJson(features) {
  const ds = siteConfig.dataSource;
  return JSON.stringify({
    type: "FeatureCollection",
    attribution: `${ds.name} · ${ds.licence}. ${ds.termsUrl}`,
    metadata: {
      source: ds.name,
      source_url: ds.url,
      licence: ds.licence,
      terms_of_use: ds.termsUrl,
      disclaimer: ds.disclaimer,
      produced_by: `${siteConfig.org} · ${siteConfig.centre}`,
    },
    features,
  });
}

// Download a text blob under `filename`.
export function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  triggerDownload(url, filename);
  // Defer the revoke off the click tick — revoking synchronously can abort the
  // download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Deliver a CSV + its provenance sidecar as TWO files. Sequential anchor-clicks
// (via downloadText) with a small gap so a browser doesn't collapse/throttle the
// rapid double-download. The sidecar name = the CSV name with .csv -> _provenance.txt,
// so the pair always sorts adjacent and shares the base (incl. the scoped suffix).
// (Modern browsers may show a one-time per-origin "download multiple files" prompt —
// no zip dependency for two tiny text files.)
export function downloadCsvWithSidecar(csvName, csvText, provText) {
  downloadText(csvName, csvText, "text/csv;charset=utf-8");
  const provName = csvName.replace(/\.csv$/, "_provenance.txt");
  setTimeout(() => downloadText(provName, provText, "text/plain;charset=utf-8"), 150);
}

// Export the current map view as a PNG — with the attribution BURNED IN. Requires the map
// to have been created with preserveDrawingBuffer:true (PA passes it) — otherwise the
// canvas is blank. Throws (SecurityError) only if a basemap tile tainted the canvas;
// MapLibre sets CORS on tiles, so the CARTO basemap is safe (drawing it onto a 2D canvas
// preserves that non-taint).
//
// WHY WE COMPOSITE: map.getCanvas() is the WebGL drawing buffer ONLY. MapLibre's
// attribution is a separate DOM overlay, NOT part of that canvas, so a raw toDataURL()
// ships an image with ZERO credit. That is a compliance gap for CARTO/OSM (whose licences
// REQUIRE the credit on the displayed map) and for the City source. We draw the map, then
// a legible attribution strip carrying the CARTO/OSM credit + the City source + the Terms
// URL, and export the composite.
export function exportPng(map, filename) {
  const src = map.getCanvas();
  const w = src.width, h = src.height;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const ds = siteConfig.dataSource;
  const lines = [
    BASEMAP_CREDIT,                                  // legally required, verbatim
    `Data: ${ds.name} · ${ds.licence}`,
    ds.termsUrl,                                     // the Terms URL travels with the image
  ];
  // Scale the text to the export's device-pixel size (getCanvas() is at DPR) so it reads
  // the same on HiDPI as on standard displays.
  const scale = w / (map.getContainer().clientWidth || w) || 1;
  const fs = Math.round(11 * scale);
  const pad = Math.round(6 * scale);
  const lh = Math.round(fs * 1.4);
  ctx.font = `${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const barH = lines.length * lh + pad;
  ctx.fillStyle = "rgba(13,14,16,0.66)";            // --shell @ 66% — legible over any basemap
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = "rgba(245,246,247,0.96)";         // --tx
  lines.forEach((ln, i) => ctx.fillText(ln, pad, h - barH + pad / 2 + lh * (i + 0.5)));

  triggerDownload(out.toDataURL("image/png"), filename);
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
