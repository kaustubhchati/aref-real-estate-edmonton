# ============================================================
# 03_build_permit_aggregates.R
# Purpose: per-neighbourhood permit aggregates, all years (2009–2026),
#   as one CSV + one GeoJSON choropleth frame per year.
#
# Inputs:
#   - data/raw/General_Building_Permits_<date>.csv — newest snapshot,
#     discovered automatically. Operator places the bulk General Building
#     Permits CSV in data/raw/ before running (manual download; no re-fetch).
#   - shared boundary CSV (65fr-66s6), resolved via shared_path() — see below.
#
# Outputs:
#   - output/permit_aggregates/permit_aggregates_<year>.csv  (one per year)
#   - output/permit_geojson/permit_neighbourhoods_<year>.geojson (one per year)
#   - output/permit_coverage_summary.csv  (audit log)
#
# Run context: from the section dir (pipeline/building-permits/),
#   e.g. Rscript scripts/production/03_build_permit_aggregates.R
#
# Join key: NEIGHBOURHOOD_NUMBER (integer) in permits
#           ↔ Neighbourhood Number in boundary CSV (65fr-66s6)
# Boundary: shared_path("data", "City_of_Edmonton_-_Neighbourhoods_20260616.csv")
#           (pipeline/shared/data/…; sourced via _bootstrap.R)
#
# Suppression gate: n_permits < 10 → suppressed_low_n
# (lower than assessment's N<100 — permits are sparser)
# ============================================================

library(tidyverse)
library(sf)
library(scales)

# Repo-root anchoring + path helpers (ROOT, shared_path(), …). Lets this script
# address the shared boundary by RELATIONSHIP, not a fragile ../../ hop.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

dir.create("output/permit_aggregates", showWarnings = FALSE, recursive = TRUE)
dir.create("output/permit_geojson",    showWarnings = FALSE, recursive = TRUE)

# ============================================================
# 1. Load raw permits (reuse existing snapshot — no re-download)
# ============================================================

raw_candidates <- list.files(
  "data/raw", pattern = "^General_Building_Permits_.*\\.csv$",
  full.names = TRUE
)
if (length(raw_candidates) == 0) stop("No raw permits CSV in data/raw/")
raw_path <- sort(raw_candidates, decreasing = TRUE)[1]
cat("Using snapshot:", raw_path, "\n")

# Freshness assertion (the chain's correctness depends on this). Under the
# runner, 02 fetches TODAY's snapshot before 03 runs, so the newest file here
# must be today's. If 02's fetch silently failed — or 03 is run standalone
# against a stale data/raw — this stops loud rather than aggregating yesterday's
# permits into today's published choropleth.
snapshot_date <- regmatches(basename(raw_path),
                            regexpr("[0-9]{8}", basename(raw_path)))
if (length(snapshot_date) == 0 || snapshot_date != format(Sys.Date(), "%Y%m%d")) {
  stop("newest snapshot is '", basename(raw_path), "' (date ",
       if (length(snapshot_date)) snapshot_date else "none", "), not today's (",
       format(Sys.Date(), "%Y%m%d"), ") — did 02 fetch this run? ",
       "Refusing to aggregate a stale snapshot.")
}

permits_raw <- read_csv(raw_path, show_col_types = FALSE)
cat("Raw rows:", format(nrow(permits_raw), big.mark = ","), "\n")
cat("Columns:", paste(names(permits_raw), collapse = ", "), "\n\n")

# ============================================================
# 2. Clean and type-cast
# ============================================================

permits <- permits_raw |>
  rename_with(tolower) |>
  rename_with(~ str_replace_all(., " ", "_")) |>
  mutate(
    year                  = as.integer(year),
    month_number          = as.integer(month_number),
    neighbourhood_number  = as.integer(neighbourhood_number),
    # Strip the "$" and thousands commas before parsing — CONSTRUCTION_VALUE
    # arrives as e.g. "$58,131", so a bare as.numeric() would NA every row.
    # Mirrors the parse in 02_build_permits.R.
    construction_value    = suppressWarnings(
                              as.numeric(str_remove_all(construction_value, "[$,]"))),
    units_added           = suppressWarnings(as.integer(units_added))
  ) |>
  filter(!is.na(year), !is.na(neighbourhood_number))

cat("Clean rows (has year + neighbourhood_number):",
    format(nrow(permits), big.mark = ","), "\n")
cat("Years present:", paste(sort(unique(permits$year)), collapse = ", "), "\n\n")

# ============================================================
# 3. Load boundary file
# ============================================================

boundary_path <- shared_path("data", "City_of_Edmonton_-_Neighbourhoods_20260616.csv")

boundary_raw <- read_csv(boundary_path, show_col_types = FALSE)

boundary_sf <- boundary_raw |>
  filter(!is.na(`Geometry Multipolygon`)) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  mutate(
    `Neighbourhood ID` = as.integer(`Neighbourhood Number`),
    display_name       = `Neighbourhood Name`,
    district           = `Planning District`
  ) |>
  select(`Neighbourhood ID`, display_name, district)

cat("Boundary polygons:", nrow(boundary_sf), "\n\n")

# ============================================================
# 4. Aggregate per year
# ============================================================

years <- sort(unique(permits$year))
build_log <- tibble()

for (yr in years) {
  cat(sprintf("--- Year %d ---\n", yr))

  yr_permits <- permits |> filter(year == yr)
  cat(sprintf("  Permits: %s\n", format(nrow(yr_permits), big.mark = ",")))

  # Aggregate per neighbourhood
  agg <- yr_permits |>
    group_by(neighbourhood_number) |>
    summarise(
      n_permits                  = n(),
      total_construction_value   = sum(construction_value, na.rm = TRUE),
      median_construction_value  = median(construction_value, na.rm = TRUE),
      units_added_total          = sum(units_added, na.rm = TRUE),
      .groups = "drop"
    ) |>
    rename(`Neighbourhood ID` = neighbourhood_number)

  # Suppression gate: n_permits < 10
  agg <- agg |>
    mutate(suppressed = n_permits < 10)

  cat(sprintf("  Neighbourhoods with permits: %d\n", nrow(agg)))
  cat(sprintf("  Suppressed (n<10): %d\n", sum(agg$suppressed)))

  # Write CSV
  csv_path <- sprintf("output/permit_aggregates/permit_aggregates_%d.csv", yr)
  write_csv(agg, csv_path)

  # Spatial join
  joined <- boundary_sf |>
    left_join(agg, by = "Neighbourhood ID") |>
    mutate(
      polygon_state = case_when(
        is.na(n_permits)          ~ "no_data",
        suppressed                ~ "suppressed_low_n",
        TRUE                      ~ "aggregated"
      )
    )

  # Transmute to display columns only
  geojson_ready <- joined |>
    transmute(
      `Neighbourhood ID`         = `Neighbourhood ID`,
      display_name               = display_name,
      district                   = district,
      polygon_state              = polygon_state,
      n_permits                  = n_permits,
      total_construction_value   = total_construction_value,
      median_construction_value  = median_construction_value,
      units_added_total          = units_added_total
    ) |>
    st_set_precision(1e6) |>
    st_make_valid()

  geojson_path <- sprintf(
    "output/permit_geojson/permit_neighbourhoods_%d.geojson", yr)
  if (file.exists(geojson_path)) file.remove(geojson_path)
  st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)

  file_mb <- round(file.info(geojson_path)$size / 1024^2, 2)
  cat(sprintf("  Wrote: %s (%.2f MB)\n\n", geojson_path, file_mb))

  build_log <- bind_rows(build_log, tibble(
    year               = yr,
    n_permits          = nrow(yr_permits),
    n_neighbourhoods   = nrow(agg),
    n_suppressed       = sum(agg$suppressed),
    n_aggregated       = sum(!agg$suppressed),
    n_no_data          = sum(joined$polygon_state == "no_data"),
    geojson_path       = basename(geojson_path),
    file_size_mb       = file_mb
  ))
}

# ============================================================
# 5. Write build log
# ============================================================

write_csv(build_log, "output/permit_coverage_summary.csv")
cat("=============================================================\n")
cat("Permit aggregate build complete.\n")
print(build_log, n = Inf)
cat("=============================================================\n")
