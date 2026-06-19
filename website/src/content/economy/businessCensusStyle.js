// =========================================================
// businessCensusStyle.js
//
// Visual contract for the Business Counts choropleth (Economy).
// Mirrors building-permits/permitChoroplethStyle.js exactly for
// all map chrome (basemap, layer stack, outlines, hover).
// Economy-specific: two metrics, OrRd ramp, popup rows, and the
// two-state model ("data" / "no_data" — there is no low-N
// suppression in the business census product).
//
// GeoJSON fields (from the economy business-census aggregation):
//   neighbourhood_id, display_name, civic_ward, planning_district,
//   census_state, n_businesses_2025, n_employees_2025,
//   n_businesses_2024, n_employees_2024, yoy_businesses_change,
//   yoy_employees_change, yoy_businesses_pct, yoy_employees_pct
//
// NOTE: the state field is `census_state` (values "data" / "no_data"),
// NOT `polygon_state` — the expressions below read `census_state`.
// =========================================================

export const BASEMAP_STYLE = "/styles/custom-basemap.json";

export const MAP_VIEW = {
  center: [-113.4938, 53.5461],
  zoom: 9.6,
  minZoom: 7,
  maxZoom: 17,
};

// ---- Polygon states — two-state model --------------------------------
// data:    neighbourhood has a business-census aggregate row.
// no_data: neighbourhood has no row (rural/undeveloped fringe, etc.).
// (No suppressed_low_n / non_residential / manufactured_home states —
//  the census product does not suppress, it is present or absent.)
export const STATE_STYLE = {
  data: {
    label:        "Business census data",
    fillColor:    null,
    pattern:      null,
    outlineColor: "#ffffff",
    outlineWidth: 0.4,
    outlineDash:  null,
  },
  no_data: {
    label:        "No business census data",
    fillColor:    "rgba(255,255,255,0.08)",
    pattern:      null,
    outlineColor: "#5a554c",
    outlineWidth: 0.8,
    outlineDash:  [1, 2],
  },
};

// ---- Metrics ----------------------------------------------------------
const fmtInt = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

export const METRICS = [
  { key: "n_businesses_2025", label: "Businesses (2025)", fmt: fmtInt },
  { key: "n_employees_2025",  label: "Employees (2025)",  fmt: fmtInt },
];

// ---- Colour ramp — OrRd (light → dark red-orange) ---------------------
// Both metrics use the same OrRd ramp; values are heavily right-skewed
// (businesses max ~1950, employees max ~89016) so the stop VALUES come
// from quantiles, not the colours.
//
// label is "" on every stop on purpose: these are quantile descriptors
// (min/Q25/…), not meaningful category names, and the shared Legend would
// otherwise print the descriptor as a second line bleeding behind the
// numeric stop value. Empty label → Legend renders only the formatted
// number. `key` still drives the buildStops scale lookup.
const RAMP_ORRD = [
  { key: "min",    c: "#fef0d9", label: "" },
  { key: "q25",    c: "#fdcc8a", label: "" },
  { key: "median", c: "#fc8d59", label: "" },
  { key: "q75",    c: "#e34a33", label: "" },
  { key: "max",    c: "#b30000", label: "" },
];

const METRIC_RAMP = {
  n_businesses_2025: RAMP_ORRD,
  n_employees_2025:  RAMP_ORRD,
};
const RAMP_DEFAULT = RAMP_ORRD;

// ---- Quantile helper (mirrors permit/assessment) ----------------------
function quantile(sorted, p) {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo]
    : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ---- buildStops (mirrors permit/assessment) ---------------------------
function buildStops(scale, ramp = RAMP_DEFAULT) {
  const stops = ramp.map((r) => ({
    v: scale?.[r.key], c: r.c, label: r.label,
  }));
  const finite    = stops.every((s) => Number.isFinite(s.v));
  const ascending = stops.every(
    (s, i) => i === 0 || s.v > stops[i - 1].v
  );
  return finite && ascending ? stops : null;
}

// Fallback stops (businesses) used until the GeoJSON resolves.
export const BCENSUS_STOPS = buildStops(
  { min: 1, q25: 15, median: 40, q75: 110, max: 1950 },
  RAMP_ORRD
);

// Compute ramp stops from loaded GeoJSON quantiles — only "data" polygons,
// [0%, 25%, 50%, 75%, 100%]. Same pattern as permitMetricStops.
export function bcensusMetricStops(gj, metricKey) {
  const ramp = METRIC_RAMP[metricKey] ?? RAMP_DEFAULT;
  const vals = [];
  for (const f of gj?.features ?? []) {
    const p = f.properties;
    if (p?.census_state !== "data") continue;
    const v = Number(p[metricKey]);
    if (Number.isFinite(v) && v > 0) vals.push(v);
  }
  if (vals.length < 2) return BCENSUS_STOPS;
  vals.sort((a, b) => a - b);
  const ps  = [0, 0.25, 0.5, 0.75, 1];
  const raw = ramp.map((r, i) => ({
    v: quantile(vals, ps[i]), c: r.c, label: r.label,
  }));
  const stops = [];
  for (const s of raw) {
    if (stops.length === 0 || s.v > stops[stops.length - 1].v)
      stops.push(s);
  }
  return stops.length >= 2 ? stops : BCENSUS_STOPS;
}

// ---- Fill colour expression (mirrors permit/assessment) ---------------
function buildFillColourExpression(metricKey, stops) {
  const value = ["number", ["get", metricKey], 0];
  const interp = ["interpolate", ["linear"], value];
  for (const s of stops) interp.push(s.v, s.c);

  return [
    "case",
    ["==", ["get", "census_state"], "data"],    interp,
    ["==", ["get", "census_state"], "no_data"],
      STATE_STYLE.no_data.fillColor,
    "#cccccc",
  ];
}

export function bcensusFillColor(metricKey, stops) {
  return buildFillColourExpression(metricKey, stops);
}

// ---- Layer stack — bcensus-* ids (no collision with nbhd-* / pnbhd-*) -
// Source-agnostic (source filled in by MapView via `source` prop).
export function bcensusLayers(stops, metricKey = "n_businesses_2025") {
  return [
    // 1. Fill — data: ramp colour; no_data: glass
    {
      id: "bcensus-fill",
      type: "fill",
      paint: {
        "fill-color": buildFillColourExpression(metricKey, stops),
        "fill-opacity": [
          "case",
          ["==", ["get", "census_state"], "data"],
            [
              "case",
              ["boolean", ["feature-state", "hover"],   false], 0.88,
              ["boolean", ["feature-state", "pinned"],  false], 0.88,
              0.74,
            ],
          ["boolean", ["feature-state", "hover"],  false], 0.15,
          ["boolean", ["feature-state", "pinned"], false], 0.15,
          0.04,
        ],
        "fill-opacity-transition": { duration: 150, delay: 0 },
      },
    },
    // 2. Solid outline — data (white)
    {
      id: "bcensus-outline",
      type: "line",
      filter: ["==", ["get", "census_state"], "data"],
      paint: {
        "line-color": STATE_STYLE.data.outlineColor,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          7, 0.2, 10, 0.4, 13, 0.8,
        ],
      },
    },
    // 3. Dotted outline — no_data (same treatment as permit no_data)
    {
      id: "bcensus-outline-nodata",
      type: "line",
      filter: ["==", ["get", "census_state"], "no_data"],
      paint: {
        "line-color": STATE_STYLE.no_data.outlineColor,
        "line-width": STATE_STYLE.no_data.outlineWidth,
        "line-dasharray": STATE_STYLE.no_data.outlineDash,
      },
    },
    // 4. Hover / pinned highlight outline
    {
      id: "bcensus-highlight",
      type: "line",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], "#0f0f12",
          ["boolean", ["feature-state", "hover"],  false], "#2a2a30",
          "rgba(0,0,0,0)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "pinned"], false], 2.4,
          ["boolean", ["feature-state", "hover"],  false], 1.6,
          0,
        ],
      },
    },
    // 5. Neighbourhood name labels (zoom ≥ 11)
    {
      id: "bcensus-label",
      type: "symbol",
      minzoom: 11,
      layout: {
        "text-field": ["get", "display_name"],
        "text-size": 11,
        "text-font": ["Noto Sans Regular"],
        "text-max-width": 8,
        "text-anchor": "center",
      },
      paint: {
        "text-color": "#3c3728",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    },
  ];
}

// ---- Popup HTML -------------------------------------------------------
function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;",
      '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Signed percent for the YoY row: "+50%" green, "−12.4%" red.
// Returns null when the value is missing so the row is dropped entirely.
function fmtSignedPct(v) {
  if (v == null || !Number.isFinite(+v)) return null;
  const n = +v;
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";       // U+2212 minus
  const a = Math.abs(n);
  const num = a % 1 === 0 ? String(a) : a.toFixed(1);
  return `${sign}${num}%`;
}
function pctColor(v) {
  const n = +v;
  return n > 0 ? "#1a7a3a" : n < 0 ? "#c0392b" : "var(--text)";
}

const fmtIntPopup = (v) =>
  v == null || !Number.isFinite(+v) ? "—"
  : Math.round(+v).toLocaleString();

const PROVENANCE =
  "Source: Edmonton Business Census. Geography changed from StatCan " +
  "Census Tracts; figures not comparable to prior dashboard.";

export function buildBusinessCensusPopupHtml(p, pinned) {
  const name     = p.display_name ?? "—";
  // planning_district is the primary geography label; fall back to civic_ward.
  const district = p.planning_district ?? p.civic_ward ?? null;

  const parts = [
    `<div class="pop-name">${escapeHtml(name)}</div>`,
  ];
  if (district) {
    parts.push(`<div class="pop-district">${escapeHtml(district)}</div>`);
  }

  if (p.census_state === "data") {
    // Headline — businesses (2025).
    parts.push(
      `<div class="pop-row headline">` +
        `<span class="pop-k">Businesses (2025)</span>` +
        `<span class="pop-v">${fmtIntPopup(p.n_businesses_2025)}</span>` +
      `</div>`
    );
    // Detail — employees (2025).
    parts.push(
      `<div class="pop-row">` +
        `<span class="pop-k">Employees (2025)</span>` +
        `<span class="pop-v">${fmtIntPopup(p.n_employees_2025)}</span>` +
      `</div>`
    );
    // Detail — businesses (2024), only when present.
    if (p.n_businesses_2024 != null) {
      parts.push(
        `<div class="pop-row">` +
          `<span class="pop-k">Businesses (2024)</span>` +
          `<span class="pop-v">${fmtIntPopup(p.n_businesses_2024)}</span>` +
        `</div>`
      );
    }
    // Detail — YoY %, signed + coloured, only when present.
    const yoy = fmtSignedPct(p.yoy_businesses_pct);
    if (yoy != null) {
      parts.push(
        `<div class="pop-row">` +
          `<span class="pop-k">Year-over-year</span>` +
          `<span class="pop-v" style="color:${pctColor(p.yoy_businesses_pct)}">` +
            `${yoy}</span>` +
        `</div>`
      );
    }
  } else {
    parts.push(
      `<div class="pop-reason">No business census data recorded for ` +
        `this neighbourhood.</div>`
    );
  }

  // Provenance note — small muted text at the bottom of every popup.
  parts.push(`<div class="pop-reason">${escapeHtml(PROVENANCE)}</div>`);

  if (pinned) {
    parts.push(
      `<div class="pop-pinned-hint">Click map to dismiss</div>`
    );
  }
  return parts.join("");
}
