# Business Census (Business Counts) — Manifest Handback (PARKED)

**Status:** parked, pending a **backend** emit. Backend is frozen, so no action
now. This note preserves the spec so the next BC refresh can unblock parity.

The year-hardcode cleanup (2026-06) brought BP point-map, ReportCard, and the
Download page to refresh-by-design parity (years/filenames sourced from
backend manifests). **Business Census was carved out** because it cannot be made
manifest-driven from the frontend without a backend signal.

## Why BC can't be fixed frontend-side

The survey year (currently **2025**) is baked into **two** coupled places:

1. The GeoJSON **filename** — `data/economy/business_census_2025.geojson`.
2. The **column keys** — `n_businesses_2025`, `n_employees_2025`, plus the
   prior-year `n_businesses_2024` / `n_employees_2024` used for the YoY row.

The column keys *alone* could be derived by introspecting the loaded GeoJSON's
properties. **But the filename is a chicken-and-egg blocker**: you must fetch the
file to read its columns, yet the filename carries the very year you're trying to
discover. There is **no BC manifest** in `public/data/economy/` (only the
GeoJSON), so the frontend has no signal for the year. Introspecting columns while
still hardcoding the filename would 404 next year — i.e. "faking it." So BC is
parked, not forced.

## The minimal backend emit that unblocks it

Emit a BC manifest alongside the GeoJSON (e.g. `data/economy/manifest.json`),
flat like the BP manifest (BC is single-survey-year, no year axis):

```jsonc
{ "surveyYear": 2025, "priorYear": 2024 }
```

- `surveyYear` → frontend builds the filename `business_census_${surveyYear}.geojson`
  and the current metric keys `n_businesses_${surveyYear}` / `n_employees_${surveyYear}`
  and labels `"Businesses (${surveyYear})"`.
- `priorYear` → the YoY row key `n_businesses_${priorYear}` and label.

Most explicit alternative (lets the backend own the labels):
```jsonc
{ "metrics": [{ "key": "n_businesses_2025", "label": "Businesses (2025)" },
              { "key": "n_employees_2025",  "label": "Employees (2025)" }],
  "priorYear": 2024 }
```

## Frontend parity work, ready once the emit lands

Mirror the PA/BP pattern (`loadManifest` → derive). Sites to convert (all the
`2025`/`2024` literals found in recon):

- `economy/businessCensusStyle.js` — `METRICS` keys+labels (66–67), `METRIC_RAMP`
  keys (91–92), `bcensusLayers` default `metricKey` (168), popup keys+labels
  (312–345, incl. prior-year `n_businesses_2024`).
- `economy/BusinessCensusMap.jsx` — `DATA_URL` filename (43; already
  `assetUrl`-wrapped, just needs the year templated), `document.title` (107),
  the `<h1>` (294), sidebar hover keys+labels (335–340), provenance "survey year
  2025" (354).

All other rollover-stale literals in the app were closed in the 2026-06 cleanup;
BC is the only parked section.
