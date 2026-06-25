# ============================================================
# 01_build_business_census.R   (economy/business-census section)
#
# Purpose: join the Edmonton Business Census Neighbourhood Aggregation
#   (fetched Socrata snapshot) to the neighbourhood boundary and produce a
#   GeoJSON choropleth (+ flat CSV + build log) for MapLibre rendering.
#
# Run context: from the section dir (pipeline/yeg/economy/business-census/),
#   e.g. Rscript scripts/production/01_build_business_census.R
#   Bootstrap-anchored (sources _bootstrap.R); the boundary is resolved via
#   shared_path() (cross-section base geo, stays in pipeline/yeg/shared/).
#
# Source dataset: Edmonton Business Census - Neighbourhood Aggregation
#   Socrata wh44-4bkz — fetched to data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv
#   via fetch_socrata_snapshot() (export endpoint, atomic, floors); newest-by-glob.
#   Columns (export endpoint, Title Case): Neighbourhood Name, Neighbourhood Number,
#             Geometry (Polygon WKT), Survey Year, Number of Businesses, Number of Employees
#
# Year coverage in downloaded file:
#   2023 — 14 rows  (sparse pilot; excluded)
#   2024 — 167 rows (YoY comparison layer)
#   2025 — 364 rows (production year — best coverage)
#
# WHY we drop the source `geom` column:
#   The API-supplied polygon geometry does not match the canonical
#   2026 boundary file. We join on neighbourhood_number and take
#   geometry exclusively from the boundary CSV so all sections
#   render on the same polygon set.
#
# Join key: neighbourhood_number (source, string) <->
#           Neighbourhood Number (boundary, integer).
#           Both normalised to character() before joining.
#
# Polygon states (column `census_state`):
#   data    — 2025 businesses + employees present
#   no_data — polygon in boundary but absent from 2025 census
#
# PROVENANCE NOTE (must appear in frontend section header):
#   Source migrated from StatCan Business Register (Census Tract level)
#   to Edmonton Business Census (neighbourhood level, City of Edmonton
#   Open Data). Old CT-level business counts do NOT reconcile with
#   this dataset.
#
# Outputs (all under this section's output/):
#   business_census_2025.geojson   — choropleth source for MapLibre
#   business_census_2025.csv       — flat CSV for Download page
#   business_census_build_log.txt  — coverage + sanity summary
#
# HANDOFF (runner-published — this script never writes website/public):
#   The runner publishes output/business_census_2025.geojson ->
#   website/public/data/economy/business_census_2025.geojson via the
#   business-census handoff in _whirl.yaml (the sole publisher). The live
#   frontend (website/src/content/economy/BusinessCensusMap.jsx) fetches it
#   from /data/economy/business_census_2025.geojson. Refresh through the runner:
#   Rscript run_section.R business-census  (not a standalone script run).
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)
library(sf)

# ── 0. Paths + inputs ───────────────────────────────────────
# Repo-root anchoring + helpers (ROOT, shared_path(), …) and the shared Socrata
# fetch helper. Own-section files use relative paths (cwd = section root); the
# boundary is cross-section base geo, resolved via shared_path() newest-by-glob.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))

OUT_DIR <- "output"
dir.create(OUT_DIR,                  recursive = TRUE, showWarnings = FALSE)
dir.create(file.path("data", "raw"), recursive = TRUE, showWarnings = FALSE)

# Source snapshot via the shared helper: export endpoint only, atomic temp-then-
# rename to a dated raw file, size/row/column floors verified before promotion.
# Floors ~half of observed (545 rows / 2.47 MB). Refresh-by-design — zero date
# literals; the dated snapshot is accepted provenance (gitignored).
CENSUS_CSV <- fetch_socrata_snapshot(
  dataset_id    = "wh44-4bkz",
  dest_dir      = file.path("data", "raw"),
  min_rows      = 250L,
  min_size_mb   = 1,
  required_cols = c("Survey Year", "Neighbourhood Number", "Neighbourhood Name",
                    "Number of Businesses", "Number of Employees"),
  filename_stem = "Edmonton_Business_Census"
)

# Newest neighbourhood boundary snapshot by glob — same discipline PA/BP use; a
# new City boundary drops in with NO code edit (no date literal in the path).
boundary_candidates <- list.files(
  shared_path("data"),
  pattern    = "^City_of_Edmonton_-_Neighbourhoods_.*\\.csv$",
  full.names = TRUE
)
if (length(boundary_candidates) == 0) {
  stop("No neighbourhood boundary CSV in ", shared_path("data"),
       " matching City_of_Edmonton_-_Neighbourhoods_*.csv — download the latest.")
}
BOUNDARY_CSV <- sort(boundary_candidates, decreasing = TRUE)[1]

# ── 1. Load boundary ────────────────────────────────────────

cat("Loading 2026 neighbourhood boundary...\n")
boundary_raw <- read_csv(BOUNDARY_CSV, show_col_types = FALSE)
cat("  Rows loaded:", nrow(boundary_raw), "\n")

boundary_sf <- boundary_raw |>
  filter(!is.na(`Geometry Multipolygon`)) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  mutate(
    neighbourhood_id  = as.character(`Neighbourhood Number`),
    display_name      = `Neighbourhood Name`,
    civic_ward        = `Civic Ward`,
    planning_district = `Planning District`
  ) |>
  select(neighbourhood_id, display_name, civic_ward, planning_district)

cat("  Polygons parsed:", nrow(boundary_sf), "\n\n")

# ── 2. Load Business Census snapshot ────────────────────────

cat("Loading Business Census CSV...\n")
census_raw <- read_csv(CENSUS_CSV, show_col_types = FALSE)
cat("  Rows loaded:", nrow(census_raw), "\n")
cat("  Columns:", paste(names(census_raw), collapse = ", "), "\n")
cat("  Years present:", paste(sort(unique(census_raw$survey_year)), collapse = ", "), "\n\n")

# ── 3. Split into production (2025) and comparison (2024) ───

# WHY character coercion: Socrata exports neighbourhood_number as
# string; boundary uses integer-valued character. Explicit cast on
# both sides prevents silent NA from type mismatch.

census_2025 <- census_raw |>
  filter(`Survey Year` == 2025) |>
  transmute(
    neighbourhood_id  = as.character(`Neighbourhood Number`),
    source_name_2025  = `Neighbourhood Name`,
    n_businesses_2025 = as.integer(`Number of Businesses`),
    n_employees_2025  = as.numeric(`Number of Employees`)
  )

census_2024 <- census_raw |>
  filter(`Survey Year` == 2024) |>
  transmute(
    neighbourhood_id  = as.character(`Neighbourhood Number`),
    n_businesses_2024 = as.integer(`Number of Businesses`),
    n_employees_2024  = as.numeric(`Number of Employees`)
  )

cat("2025 rows:", nrow(census_2025), "\n")
cat("2024 rows:", nrow(census_2024), "\n\n")

# ── 3b. ID remapping — stale neighbourhood_numbers in source ────────────────
#
# WHY: the 2026 boundary file (65fr-66s6) renumbered two neighbourhoods
# that the Business Census still reports under their old IDs.
# Remapping here keeps all downstream logic (join, guard, sanity) clean.
#
# Evidence: step 7 unmatched check surfaced both IDs on first run (2026-06-19).
# Cross-reference: same remaps applied in 08b for property assessment data.
#
# Table: old_id -> new_id  (boundary 2026 canonical)
#   5462 CHAPPELLE                -> 5471  (1:1 renumber in 2026 file)
#   5464 HERITAGE VALLEY TOWN CENTRE -> 5472  (merged into combined polygon)
#
# If a future refresh surfaces new unmatched IDs, add rows here and note
# the evidence source in the comment.

ID_REMAP <- tribble(
  ~old_id,  ~new_id,  ~note,
  "5462",   "5471",   "Chappelle renumbered 5462->5471 in 2026 boundary",
  "5464",   "5472",   "Heritage Valley Town Centre merged to 5472 in 2026 boundary"
)

remap_ids <- function(df, remap) {
  for (i in seq_len(nrow(remap))) {
    df <- df |> mutate(
      neighbourhood_id = if_else(
        neighbourhood_id == remap$old_id[i],
        remap$new_id[i],
        neighbourhood_id
      )
    )
  }
  df
}

census_2025 <- remap_ids(census_2025, ID_REMAP)
census_2024 <- remap_ids(census_2024, ID_REMAP)

cat("ID remaps applied:\n")
for (i in seq_len(nrow(ID_REMAP))) {
  cat("  ", ID_REMAP$old_id[i], "->", ID_REMAP$new_id[i], ":", ID_REMAP$note[i], "\n")
}
cat("\n")

# ── 4. YoY metrics ──────────────────────────────────────────

# Left join: 2025 rows without a 2024 match keep NA yoy fields.
# Frontend renders those polygons with base metrics but no change indicator.

census_joined <- census_2025 |>
  left_join(census_2024, by = "neighbourhood_id") |>
  mutate(
    yoy_businesses_change = n_businesses_2025 - n_businesses_2024,
    yoy_employees_change  = n_employees_2025  - n_employees_2024,
    yoy_businesses_pct = if_else(
      !is.na(n_businesses_2024) & n_businesses_2024 > 0,
      round((n_businesses_2025 - n_businesses_2024) / n_businesses_2024 * 100, 1),
      NA_real_
    ),
    yoy_employees_pct = if_else(
      !is.na(n_employees_2024) & n_employees_2024 > 0,
      round((n_employees_2025 - n_employees_2024) / n_employees_2024 * 100, 1),
      NA_real_
    )
  )

cat("YoY coverage:", sum(!is.na(census_joined$n_businesses_2024)),
    "/", nrow(census_joined), "neighbourhoods have 2024 comparison\n\n")

# ── 5. Duplicate-ID guard ────────────────────────────────────
# One-feature-per-polygon is required by MapLibre promoteId.
# A duplicated neighbourhood_id would silently fan-out the join.

dupes <- census_joined |> count(neighbourhood_id) |> filter(n > 1)
if (nrow(dupes) > 0) {
  stop(
    "DUPLICATE neighbourhood_id in census data — cannot produce valid GeoJSON.\n",
    "Affected IDs: ", paste(dupes$neighbourhood_id, collapse = ", ")
  )
}
cat("Duplicate-ID guard: OK\n")

# ── 6. Spatial join to boundary ─────────────────────────────

joined_sf <- boundary_sf |>
  left_join(census_joined, by = "neighbourhood_id") |>
  mutate(
    census_state = if_else(!is.na(n_businesses_2025), "data", "no_data")
  )

n_data    <- sum(joined_sf$census_state == "data")
n_no_data <- sum(joined_sf$census_state == "no_data")

cat("\nPolygon coverage:\n")
cat("  data:    ", n_data,    "\n")
cat("  no_data: ", n_no_data, "\n")
cat("  total:   ", nrow(joined_sf), "\n\n")

# ── 7. Sanity: 2025 rows with no matching polygon ───────────

unmatched <- census_joined |>
  anti_join(st_drop_geometry(boundary_sf), by = "neighbourhood_id")

if (nrow(unmatched) > 0) {
  cat("WARNING:", nrow(unmatched),
      "census rows found no matching boundary polygon:\n")
  print(unmatched |> select(neighbourhood_id, source_name_2025, n_businesses_2025))
  cat("\n")
} else {
  cat("Sanity check: all 2025 rows matched to a polygon. OK\n\n")
}

# ── 8. Metric range report ───────────────────────────────────

cat("Metric ranges (2025 data polygons):\n")
cat("  businesses: min =", min(joined_sf$n_businesses_2025, na.rm = TRUE),
    " max =", max(joined_sf$n_businesses_2025, na.rm = TRUE), "\n")
cat("  employees:  min =", min(joined_sf$n_employees_2025,  na.rm = TRUE),
    " max =", max(joined_sf$n_employees_2025,  na.rm = TRUE), "\n\n")

# ── 9. Select output columns and write GeoJSON ──────────────

geojson_ready <- joined_sf |>
  transmute(
    neighbourhood_id,
    display_name,
    civic_ward,
    planning_district,
    census_state,
    n_businesses_2025,
    n_employees_2025,
    n_businesses_2024,
    n_employees_2024,
    yoy_businesses_change,
    yoy_employees_change,
    yoy_businesses_pct,
    yoy_employees_pct
  ) |>
  st_set_precision(1e6) |>
  st_make_valid()

geojson_path <- file.path(OUT_DIR, "business_census_2025.geojson")
if (file.exists(geojson_path)) file.remove(geojson_path)
st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)
file_mb <- round(file.info(geojson_path)$size / 1024 / 1024, 3)
cat("GeoJSON written:", geojson_path, "(", file_mb, "MB)\n")

# ── 10. Flat CSV for Download page ───────────────────────────

csv_path <- file.path(OUT_DIR, "business_census_2025.csv")
geojson_ready |>
  st_drop_geometry() |>
  write_csv(csv_path)
cat("CSV written:    ", csv_path, "\n")

# ── 11. Build log ────────────────────────────────────────────

log_lines <- c(
  paste("Build date:          ", format(Sys.time(), "%Y-%m-%d %H:%M %Z")),
  paste("Source file:          Edmonton_Business_Census_-_Neighbourhood_Aggregation_20260619.csv"),
  paste("Boundary file:        City_of_Edmonton_-_Neighbourhoods_20260616.csv (407 polygons)"),
  paste("Production year:      2025"),
  paste("Comparison year:      2024"),
  "---",
  paste("2025 census rows:    ", nrow(census_2025)),
  paste("2024 census rows:    ", nrow(census_2024)),
  paste("Polygons — data:     ", n_data),
  paste("Polygons — no_data:  ", n_no_data),
  paste("YoY coverage:        ", sum(!is.na(joined_sf$yoy_businesses_pct)), "neighbourhoods"),
  paste("Unmatched 2025 rows: ", nrow(unmatched)),
  paste("GeoJSON size (MB):   ", file_mb),
  "---",
  "PROVENANCE NOTE:",
  "  Source migrated from StatCan Business Register (Census Tract level)",
  "  to Edmonton Business Census (neighbourhood level, City of Edmonton Open Data).",
  "  Old CT-level business counts do NOT reconcile with this dataset.",
  "  Frontend must display: 'Source changed from StatCan Census Tracts to",
  "  Edmonton neighbourhood-level Business Census. Figures are not comparable.'"
)

log_path <- file.path(OUT_DIR, "business_census_build_log.txt")
writeLines(log_lines, log_path)
cat("Build log:       ", log_path, "\n\nDone.\n")
