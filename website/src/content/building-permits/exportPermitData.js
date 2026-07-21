// =============================================================================
// exportPermitData.js
//
// Scoped client-side export for the Dwelling Units console — the building-permits
// analogue of property-assessment/exportData.js. Built from the RESIDENT combined
// data (every year on each feature) and downloaded as blobs, no server:
//   • CSV snapshot   — wide, the ACTIVE YEAR only, BARE column names  → buildSnapshotCsv
//   • CSV timeseries — LONG PANEL, one row per (neighbourhood × year) → buildTimeseriesCsv
//   • CSV aggregate  — the selection rollup vs the city (one row per measure)
//   • GeoJSON        — a clip of the chosen features (full all-years properties)
//   • PNG            — the current map canvas (needs preserveDrawingBuffer)
// CSV bodies are PURE data; provenance ships alongside as a sidecar .txt.
// =============================================================================

import { PER_YEAR_FIELDS } from "./dataSources.js";
import { siteConfig, BASEMAP_CREDIT } from "../../config/siteConfig.js";

// Year-invariant identity columns carried once (mirrors 02b's IDENTITY_COLS, minus the
// orthogonal is_annexation_area flag which the GeoJSON export still carries per-feature).
const IDENTITY = ["Neighbourhood ID", "display_name", "district"];
const TIMESERIES_HEADER = [...IDENTITY, "year", ...PER_YEAR_FIELDS];

const num = (v) => (v == null || !Number.isFinite(+v) || +v === -999 ? null : +v);
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
// polygon_state is a STRING label; every other PER_YEAR_FIELD is numeric (sentinel-guarded).
function cellFor(field, raw) {
  return field === "polygon_state" ? csvCell(raw) : csvCell(num(raw));
}

// Provenance SIDECAR text (its own .txt, not comment rows — keeps the CSV naive-parser
// clean). All from runtime state; the source/licence/Terms URL TRAVEL with the file.
export function buildProvenanceText({ file, shape, city, metric, scope, coverage }) {
  const date = new Date().toISOString().slice(0, 10);
  const ds = siteConfig.dataSource;
  return [
    `${siteConfig.org} · ${siteConfig.centre}`,
    `dataset: Dwelling Units (Residential Building Permits)`,
    `file: ${file}`,
    `shape: ${shape}`,
    `city: ${city}`,
    `coverage: ${coverage}`,
    `scope: ${scope}`,
    `map view metric: ${metric}`,
    `exported: ${date}`,
    ``,
    `source: ${ds.name}`,
    `source url: ${ds.url}`,
    `licence: ${ds.licence}`,
    `terms of use: ${ds.termsUrl}`,
    ds.disclaimer,
  ].join("\n") + "\n";
}

// Current-year SNAPSHOT CSV: wide, single active `year`, BARE column names.
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

// Timeseries LONG-PANEL CSV: one row per (neighbourhood × year), entity-major,
// time-ascending (the plm/Stata xtset convention). Identity repeats per row by design.
export function buildTimeseriesCsv(features, years) {
  const asc = [...years].sort((a, b) => a - b);
  const lines = [TIMESERIES_HEADER.join(",")];
  for (const f of features) {
    const p = f.properties;
    const idCells = IDENTITY.map((k) => csvCell(p[k]));
    for (const y of asc) {
      lines.push([
        ...idCells,
        csvCell(y),
        ...PER_YEAR_FIELDS.map((field) => cellFor(field, p[`${field}_${y}`])),
      ].join(","));
    }
  }
  return lines.join("\n");
}

// Selection SUMMARY CSV: the box-selection's aggregate vs the city baseline — one row per
// measure, raw rounded numbers (analysis-ready). Reads the passed aggregate objects only.
export function buildAggregateCsv(aggregate, cityBaseline) {
  const a = aggregate || {};
  const cb = cityBaseline || {};
  const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
  const share = (s, c) => (s == null || c == null || c === 0 ? null : (s / c) * 100);   // % of city
  const pp = (s, c) => (s == null || c == null ? null : (s - c) * 100);                 // YoY: fractions → pp
  const nbhds = (x) => (x.nReportable != null ? x.nReportable + (x.nSuppressed ?? 0) + (x.nExcluded ?? 0) : null);
  const rows = [
    ["measure", "selection", "city", "delta", "delta_unit", "basis"],
    ["neighbourhoods", nbhds(a), nbhds(cb), null, "", "count"],
    ["reportable", a.nReportable, cb.nReportable, null, "", "count"],
    ["suppressed", a.nSuppressed, cb.nSuppressed, null, "", "count"],
    ["no_data", a.nExcluded, cb.nExcluded, null, "", "count"],
    ["permits", a.sumPermits, cb.sumPermits, r2(share(a.sumPermits, cb.sumPermits)), "pct_share_of_city", "exact"],
    ["construction_value", a.sumConstructionValue, cb.sumConstructionValue,
      r2(share(a.sumConstructionValue, cb.sumConstructionValue)), "pct_share_of_city", "exact"],
    ["units_added", a.sumUnitsAdded, cb.sumUnitsAdded, r2(share(a.sumUnitsAdded, cb.sumUnitsAdded)), "pct_share_of_city", "exact"],
    ["units_demolished", a.sumUnitsDemolished, cb.sumUnitsDemolished, r2(share(a.sumUnitsDemolished, cb.sumUnitsDemolished)), "pct_share_of_city", "exact"],
    ["net_units", a.netUnits, cb.netUnits, null, "", "exact"],
    ["median_construction_value", r2(a.medianOfMedianCV), r2(cb.medianOfMedianCV),
      null, "", "median of neighbourhood medians (approx)"],
    ["yoy_permits_pct", r2(a.areaYoYPermits != null ? a.areaYoYPermits * 100 : null),
      r2(cb.areaYoYPermits != null ? cb.areaYoYPermits * 100 : null),
      r2(pp(a.areaYoYPermits, cb.areaYoYPermits)), "percentage_points", "exact (Σthis/Σprev)"],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

// A GeoJSON FeatureCollection of the chosen features (full all-years properties) + the
// source/Terms as top-level foreign members so the licence travels with the file.
export function buildGeoJson(features) {
  const ds = siteConfig.dataSource;
  return JSON.stringify({
    type: "FeatureCollection",
    attribution: `${ds.name} · ${ds.licence}. ${ds.termsUrl}`,
    metadata: {
      source: ds.name, source_url: ds.url, licence: ds.licence,
      terms_of_use: ds.termsUrl, disclaimer: ds.disclaimer,
      produced_by: `${siteConfig.org} · ${siteConfig.centre}`,
    },
    features,
  });
}

function triggerDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Download a text blob under `filename`.
export function downloadText(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A CSV + its provenance sidecar as TWO files (name.csv + name_provenance.txt).
export function downloadCsvWithSidecar(csvName, csvText, provText) {
  downloadText(csvName, csvText, "text/csv;charset=utf-8");
  const provName = csvName.replace(/\.csv$/, "_provenance.txt");
  setTimeout(() => downloadText(provName, provText, "text/plain;charset=utf-8"), 150);
}

// The current map view as a PNG with the attribution BURNED IN (map must be created with
// preserveDrawingBuffer). map.getCanvas() is the WebGL buffer only — MapLibre's attribution
// is a DOM overlay, so a raw toDataURL ships zero credit; we composite the strip on.
export function exportPng(map, filename) {
  const src = map.getCanvas();
  const w = src.width, h = src.height;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const ctx = out.getContext("2d");
  ctx.drawImage(src, 0, 0);

  const ds = siteConfig.dataSource;
  const lines = [BASEMAP_CREDIT, `Data: ${ds.name} · ${ds.licence}`, ds.termsUrl];
  const scale = w / (map.getContainer().clientWidth || w) || 1;
  const fs = Math.round(11 * scale);
  const pad = Math.round(6 * scale);
  const lh = Math.round(fs * 1.4);
  ctx.font = `${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const barH = lines.length * lh + pad;
  ctx.fillStyle = "rgba(13,14,16,0.66)";
  ctx.fillRect(0, h - barH, w, barH);
  ctx.fillStyle = "rgba(245,246,247,0.96)";
  lines.forEach((ln, i) => ctx.fillText(ln, pad, h - barH + pad / 2 + lh * (i + 0.5)));

  triggerDownload(out.toDataURL("image/png"), filename);
}
