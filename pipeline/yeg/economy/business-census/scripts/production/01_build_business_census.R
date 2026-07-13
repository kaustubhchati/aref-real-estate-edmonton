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
# Annexation-area flag (column `is_annexation_area`, ORTHOGONAL to census_state):
#   TRUE on the City's four annexation-area tiles 8885-8888 (kept + labelled, not
#   dropped; they keep their natural data/no_data state). Sourced from the canonical
#   crosswalk (crosswalk_annexation_ids); ruled in DECISION_container_universe_20260710.md.
#
# Neighbourhood reconciliation (§3b): the ONE canonical crosswalk (read
#   cross-section from property-assessment, READ-only; Tier 2 — retires BC's
#   former inline ID_REMAP tribble) supplies the id remap (variant -> canonical)
#   and the annexation-area label. One table, all sections.
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
source(shared_path("boundary_helpers.R"))
source(shared_path("reconcile_helpers.R"))

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

# ── 1. Load boundary (shared guarded loader) ────────────────
# Fetch-routed through fetch_socrata_snapshot (finding 5) + the "follow the City"
# integrity contract (dup ids, geometry, +/-10% row tolerance vs the accepted
# snapshot, Effective End Date tripwire, staleness). Returns the raw frame.
cat("Loading 2026 neighbourhood boundary...\n")
boundary_raw <- load_boundary()
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

# ── 3b. ID remapping — crosswalk-derived (Tier 2: the ONE canonical table) ──
#
# WHY: neighbourhood renumbers/renames are authored ONCE in the canonical
# crosswalk, whose home is the property-assessment section; every section
# CONSUMES it, none re-derives reconciliation (reconcile_helpers.R contract).
# This RETIRES BC's former inline ID_REMAP tribble — its two renumbers
# (5462->5471 CHAPPELLE, 5464->5472 HERITAGE VALLEY TOWN CENTRE) are now two
# rows in the crosswalk, alongside the rest of the resolve vocabulary. BC reads
# the crosswalk cross-section via section_path(), exactly as BP 02 does.
#
# BC joins on neighbourhood_id, so only the id-remap (variant_id -> canonical_id)
# is needed here — no name-keyed recovery (BC has no NA-id rows). remap_vec
# rewrites any stale source id to its canonical boundary id; ids with no crosswalk
# row pass through unchanged (idempotent — a no-op on already-canonical data).
# Character throughout (BC keys are character).

cw <- load_crosswalk(section_path("property-assessment", "data", "reference"))

# variant_id -> canonical_id for every resolve relation (rename/renumber/typo/…).
remap_rows <- cw |>
  filter(relation %in% RECON_RESOLVE_RELATIONS,
         !is.na(variant_id), !is.na(canonical_id))
remap_vec <- setNames(remap_rows$canonical_id, remap_rows$variant_id)

# Annexation-area ids (8885-8888): KEPT + LABELLED via the orthogonal
# is_annexation_area flag on the polygon output (§6/§9) — not dropped, not a
# special census_state. Per DECISION_container_universe_20260710.md.
annexation_ids <- crosswalk_annexation_ids(cw)

remap_ids <- function(df) {
  df |> mutate(
    neighbourhood_id = if_else(
      neighbourhood_id %in% names(remap_vec),
      unname(remap_vec[neighbourhood_id]),
      neighbourhood_id
    )
  )
}

census_2025 <- remap_ids(census_2025)
census_2024 <- remap_ids(census_2024)

cat("ID remaps available from crosswalk (variant -> canonical):\n")
for (i in seq_len(nrow(remap_rows))) {
  cat("  ", remap_rows$variant_id[i], "->", remap_rows$canonical_id[i],
      ":", remap_rows$relation[i], remap_rows$canonical_name[i], "\n")
}
cat("Annexation-area ids (kept + labelled):",
    paste(annexation_ids, collapse = ", "), "\n\n")

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
    census_state = if_else(!is.na(n_businesses_2025), "data", "no_data"),
    # Orthogonal to census_state: the City's annexation-area tiles (8885-8888),
    # kept + labelled — they keep their natural data/no_data state and carry the
    # flag on top (§6/§9; DECISION_container_universe_20260710.md).
    is_annexation_area = neighbourhood_id %in% annexation_ids
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
  # Tier 1: fail-closed stop (was a Tier-0 warning). An unmatched census row is a
  # neighbourhood number carrying business data that matches no boundary polygon —
  # the BC twin of BP's stranded-ID stop. Halt with the id/name/count dump so a
  # human can rule it (a crosswalk row, or a boundary reconciliation). The two known
  # old ids (5462/5464) are already remapped upstream via the crosswalk (0 unmatched
  # today); the kept annexation containers 8885-8888 are valid boundary ids and do
  # NOT trip this.
  print(unmatched |> select(neighbourhood_id, source_name_2025,
                            n_businesses_2025, n_employees_2025))
  stop(nrow(unmatched), " census row(s) matched no boundary polygon (see the dump ",
       "above) — their businesses would be absent from the map. Add a crosswalk ",
       "renumber/rename row (property-assessment/data/reference) or reconcile the ",
       "boundary, then re-run. Unmatched ids: ",
       paste(unmatched$neighbourhood_id, collapse = ", "))
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
    is_annexation_area,
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

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["boundary_polygons"]] <- nrow(boundary_sf)
RUN_METRICS[["census_rows_2025"]]  <- nrow(census_2025)
RUN_METRICS[["census_rows_2024"]]  <- nrow(census_2024)
RUN_METRICS[["polygons_data"]]     <- n_data
RUN_METRICS[["polygons_no_data"]]  <- n_no_data
RUN_METRICS[["annexation_polygons"]] <- sum(joined_sf$is_annexation_area)
RUN_METRICS[["yoy_coverage"]]      <- sum(!is.na(joined_sf$yoy_businesses_pct))
RUN_METRICS[["unmatched_rows"]]    <- nrow(unmatched)
RUN_METRICS[["geojson_mb"]]        <- file_mb

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
  paste("Annexation-area flag:", sum(joined_sf$is_annexation_area), "polygons (8885-8888, kept + labelled)"),
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
