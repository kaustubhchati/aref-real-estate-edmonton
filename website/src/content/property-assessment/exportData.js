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
// selected). Filenames + provenance carry the runtime city/year (state, not
// literals). Both CSVs lead with a #-comment provenance block — see provenanceHeader.
// =============================================================================

import { PER_YEAR_FIELDS } from "./dataSources.js";
import { siteConfig } from "../../config/siteConfig.js";

// Year-invariant identity columns carried once (mirrors 07b's IDENTITY_COLS).
const IDENTITY = ["Neighbourhood ID", "display_name", "district"];

// The timeseries long-panel column contract (LOCKED order): identity, the year
// key, then the per-year metrics. DERIVED from IDENTITY + PER_YEAR_FIELDS so a new
// pipeline metric flows through with no edit here (refresh-by-design). This equals
// the locked contract: Neighbourhood ID, display_name, district, year,
// polygon_state, n_properties, median_assessvalue, avall_public, sd_assessedvalue,
// median_yearbuilt, pct_with_unit, avg_assessvalue_without_unit, avg_lotsize,
// yoy_pct_change.
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

// Leading provenance rows, #-prefixed, all from runtime state (no literals).
// NOTE: "#" is NOT a default comment char in pandas.read_csv / readr::read_csv /
// read.csv — consumers must pass comment="#" to skip these (flagged for KC).
function provenanceHeader({ city, metric, scope }, coverage) {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `# ${siteConfig.org} — ${siteConfig.centre}`,
    `# dataset: Property Assessment`,
    `# city: ${city}`,
    `# coverage: ${coverage}`,
    `# scope: ${scope}`,
    `# map view metric: ${metric}`,
    `# exported: ${date} (read with comment="#")`,
  ].join("\n");
}

// Current-year SNAPSHOT CSV: wide, single active `year`, BARE column names (no
// _YYYY suffix) — the human-glance / GIS-join shape. One row per neighbourhood:
// identity cells, then each PER_YEAR_FIELD pulled for `year` (numeric fields
// sentinel-guarded → empty when suppressed; polygon_state is a label).
export function buildSnapshotCsv(features, year, meta) {
  const header = [...IDENTITY, ...PER_YEAR_FIELDS];
  const lines = [provenanceHeader(meta, String(year)), header.join(",")];
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
export function buildTimeseriesCsv(features, years, meta) {
  const asc = [...years].sort((a, b) => a - b);
  const span = asc.length ? `${asc[0]}–${asc[asc.length - 1]}` : "";
  const lines = [provenanceHeader(meta, span), TIMESERIES_HEADER.join(",")];
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

// A GeoJSON FeatureCollection of exactly the chosen features (full properties).
export function buildGeoJson(features) {
  return JSON.stringify({ type: "FeatureCollection", features });
}

// Download a text blob under `filename`.
export function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  triggerDownload(url, filename);
  // Defer the revoke off the click tick — revoking synchronously can abort the
  // download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Export the current map view as a PNG. Requires the map to have been created
// with preserveDrawingBuffer:true (PA passes it) — otherwise the canvas is blank.
// Throws (SecurityError) only if a basemap tile tainted the canvas; MapLibre sets
// CORS on tiles, so the CARTO basemap is safe.
export function exportPng(map, filename) {
  const url = map.getCanvas().toDataURL("image/png");
  triggerDownload(url, filename);
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
