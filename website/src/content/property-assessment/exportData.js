// =============================================================================
// exportData.js
//
// Scoped client-side export (Felt C4) — no server, no dependency. All three
// formats are built from the RESIDENT combined data (every year is on the
// feature) and downloaded as blobs:
//   • CSV     — wide by year (<field>_<year>), mirroring the combined source
//   • GeoJSON — a clip of the chosen features (full all-years properties)
//   • PNG     — the current map canvas (needs preserveDrawingBuffer on the map)
//
// Scope is the caller's chosen feature set (selection, or all when nothing is
// selected). Filenames carry the runtime city/year (state, not literals).
// =============================================================================

import { PER_YEAR_FIELDS } from "./dataSources.js";

// Year-invariant identity columns carried once (mirrors 07b's IDENTITY_COLS).
const IDENTITY = ["Neighbourhood ID", "display_name", "district"];

// Quote a CSV cell only when needed (comma, quote, or newline); null → empty.
function csvCell(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Wide-by-year CSV: identity columns + <field>_<year> for every field × year.
export function buildCsv(features, years) {
  const header = [
    ...IDENTITY,
    ...years.flatMap((y) => PER_YEAR_FIELDS.map((f) => `${f}_${y}`)),
  ];
  const lines = [header.join(",")];
  for (const f of features) {
    const p = f.properties;
    const row = [
      ...IDENTITY.map((k) => csvCell(p[k])),
      ...years.flatMap((y) => PER_YEAR_FIELDS.map((fld) => csvCell(p[`${fld}_${y}`]))),
    ];
    lines.push(row.join(","));
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
  URL.revokeObjectURL(url);
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
