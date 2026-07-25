# Amenity layer registry — the contract

`amenity_layer_registry_<YYYYMMDD>.csv` is the single, versioned, human-readable source of every
amenity map layer. `01_build_amenity_layers.R` loops it — **adding a layer is a row here, not a new
script.** Version by date (a new dated file supersedes the old; `CLAUDE.md` §4.4).

## Columns

| Column | Meaning |
|---|---|
| `layer_id` | stable slug; the emitted file is `output/<layer_id>.geojson` and the raw snapshot stem |
| `label` | human title for the manifest / frontend |
| `listed_id` | the id as it appears on the Open Data portal (kept for provenance) |
| `data_id` | **the id the pipeline actually fetches** — see below |
| `geometry_type` | point / multipolygon / multiline (documentary) |
| `geometry_column` | the WKT column name in the CSV export — **measured per row, never guessed** |
| `category_field` | the one nominal field the frontend colours by; **empty = single-symbol layer** |
| `renderable_cols` | pipe-separated (`\|`) list of properties to keep; everything else is dropped |
| `min_rows` | truncation floor (≈ half the observed count) — a hard stop in the fetch helper |
| `min_size_kb` | size floor for the downloaded CSV (secondary guard; `min_rows` is primary) |

## Why `listed_id` ≠ `data_id` (the load-bearing recon finding)

8 of the portal-listed ids are Socrata **visualization lenses** (`displayType=visualization_canvas_map`)
with **zero own columns** — they export an empty shell and their `rows.csv` is empty. The real data
lives in the lens's `modifyingViewUid` **parent**. The pipeline MUST fetch `data_id` (the parent),
never `listed_id`. Recording both keeps the finding in the artefact, not lost to a filename.

## Why `geometry_column` is explicit (measured, not guessed)

Most Edmonton datasets name the WKT column `geometry_<type>`, **but two do not**: EV Charging uses
`geometry`, and School Catchments uses `catchment_polygon`. Auto-detecting at runtime would have
failed both — so the column is a measured registry value and the emitter never guesses it.

## Not here

Zoning (Z1 Zoning Bylaw, Z2 Overlays) is **not** in this registry — it lives in `pipeline/yeg/zoning/`
with dedicated scripts, because its 156-code→family grouping and its `n_unmapped` bylaw-amendment
guard are bespoke and must not block amenity publication (a fail-closed zoning stop must not take
thirteen amenity layers down with it).
