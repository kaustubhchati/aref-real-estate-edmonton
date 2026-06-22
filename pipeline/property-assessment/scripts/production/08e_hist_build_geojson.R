# ============================================================
# 08e_hist_build_geojson.R
# AREF — Build one GeoJSON per historical Assessment Year
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Spatial join each historical year's neighbourhood
#   aggregates against the new City of Edmonton boundary file
#   (65fr-66s6, 407 rows, WKT geometry, WGS84). Outputs one
#   GeoJSON per year, named neighbourhoods_YYYY_recovered.geojson,
#   written to output/ (uniform name shared with the current-year file).
#   Publishing to website/public/ is the runner's handoff job, not this
#   script's — the runner is the sole publisher.
#
# REFRESH-BY-DESIGN:
#   - Iterates over all CSVs found in output/hist_aggregates/
#   - Year extracted from filename — no year literals
#   - New year: drop aggregate CSV, script picks it up
#
# PREREQUISITE:
#   - 08c_resolve_boundary_ids.R must have been run and
#     its decisions actioned in the rescue table
#   - 08d_hist_aggregate.R must have run successfully
#
# INPUTS:
#   output/hist_aggregates/neighbourhood_aggregates_YYYY.csv (all years)
#   data/raw/City_of_Edmonton__Neighbourhoods_20260616.csv   (new boundary)
#   data/reference/neighbourhood_name_mappings_<date>.csv   (rescue table)
#
# OUTPUTS:
#   output/neighbourhoods_YYYY_recovered.geojson   (runner publishes to public)
#   output/hist_geojson_build_log.csv  — year-by-year polygon state counts
# ============================================================

library(tidyverse)
library(sf)
library(scales)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# Historical GeoJSONs land in output/ (the section's build dir, same place 08b
# writes the current-year file). Publishing output/ -> website/public is the
# runner's handoff job now, NOT this script's — keeps the runner the sole
# publisher. Filename pattern (neighbourhoods_<YYYY>_recovered.geojson) is
# unchanged, so all years share one uniform output location + name.
out_dir <- "output"
dir.create(out_dir,           showWarnings = FALSE, recursive = TRUE)

cat("=============================================================\n")
cat("AREF — Historical GeoJSON Build\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M %Z"), "\n")
cat("=============================================================\n\n")

# ============================================================
# 1. Load new boundary file
#    Join key: Neighbourhood Number (integer) matches
#    Neighbourhood ID in aggregate CSVs.
# ============================================================

boundary_path <- shared_path("data", "City_of_Edmonton_-_Neighbourhoods_20260616.csv")

if (!file.exists(boundary_path)) {
  stop("Boundary file not found: ", boundary_path)
}

boundary_raw <- read_csv(boundary_path, show_col_types = FALSE)
cat("Boundary rows loaded: ", nrow(boundary_raw), "\n")

# Parse WKT geometry — CRS is WGS84 per dataset documentation
boundary_sf <- boundary_raw |>
  filter(!is.na(`Geometry Multipolygon`)) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  mutate(
    `Neighbourhood ID` = as.character(`Neighbourhood Number`),
    display_name       = `Neighbourhood Name`
  ) |>
  select(`Neighbourhood ID`, display_name,
         `Neighbourhood Name`, `Civic Ward`, `Planning District`)

cat("Boundary polygons after WKT parse: ", nrow(boundary_sf), "\n\n")

# ============================================================
# 2. Load rescue table (most recent by filename date suffix)
# ============================================================

rescue_candidates <- list.files(
  path       = "data/reference",
  pattern    = "^neighbourhood_name_mappings_.*\\.csv$",
  full.names = TRUE
)

if (length(rescue_candidates) == 0) {
  warning("No rescue table found in data/reference/. NA-id rows will not be rescued.")
  mapping <- tibble(
    shapefile_id    = character(),
    assessment_name = character()
  )
} else {
  rescue_path <- sort(rescue_candidates, decreasing = TRUE)[1]
  cat("Rescue table: ", rescue_path, "\n\n")
  mapping <- read_csv(rescue_path, show_col_types = FALSE)
}

# ============================================================
# 3. Auto-discover aggregate CSVs
# ============================================================

agg_candidates <- list.files(
  path       = "output/hist_aggregates",
  pattern    = "^neighbourhood_aggregates_[0-9]{4}\\.csv$",
  full.names = TRUE
)

if (length(agg_candidates) == 0) {
  stop("No aggregate CSVs found in output/hist_aggregates/. Run 08d first.")
}

cat("Aggregate CSVs found: ", length(agg_candidates), "\n\n")

# ============================================================
# 4. Build log frame
# ============================================================

build_log <- tibble(
  year              = integer(),
  n_aggregated      = integer(),
  n_suppressed      = integer(),
  n_non_residential = integer(),
  n_no_data         = integer(),
  geojson_path      = character(),
  file_size_mb      = double()
)

# ============================================================
# 5. Process each year
# ============================================================

EVERGREEN_ID <- "2270"   # Manufactured home community — stable across bylaws

for (agg_path in sort(agg_candidates)) {
  
  # Extract year from filename
  yr <- as.integer(str_extract(basename(agg_path), "[0-9]{4}"))
  cat(sprintf("--- Year %d ---\n", yr))
  
  # Load aggregates
  aggregates <- read_csv(agg_path, show_col_types = FALSE)
  
  # Apply rescue table to NA-id rows before join
  if ("Neighbourhood ID" %in% names(aggregates)) {
    na_rows <- aggregates |> filter(is.na(`Neighbourhood ID`) |
                                      `Neighbourhood ID` == "NA")
  } else {
    # Historical aggregates grouped on Neighbourhood name — need ID lookup
    na_rows <- tibble()
  }
  
  # If aggregates have Neighbourhood name but no ID, join boundary to get ID
  # (historical file doesn't carry Neighbourhood ID directly)
  # If aggregates have Neighbourhood name but no ID, join boundary to get ID.
  # WHY case normalisation: assessment data uses ALL CAPS neighbourhood names;
  # boundary file uses Title Case. Direct string match would miss every row.
  # Normalise both to upper, join, then drop the helper column.
  if (!"Neighbourhood ID" %in% names(aggregates)) {
    boundary_lookup <- boundary_sf |>
      st_drop_geometry() |>
      select(`Neighbourhood ID`, `Neighbourhood Name`) |>
      mutate(join_name = str_to_upper(`Neighbourhood Name`))
    
    aggregates <- aggregates |>
      mutate(join_name = str_to_upper(Neighbourhood)) |>
      left_join(boundary_lookup, by = "join_name") |>
      select(-join_name, -`Neighbourhood Name`)
  }
  
  # Non-residential detection: neighbourhoods present in boundary but
  # absent from aggregates after cleaning
  non_residential_ids <- setdiff(
    boundary_sf$`Neighbourhood ID`,
    aggregates$`Neighbourhood ID`[!is.na(aggregates$`Neighbourhood ID`)]
  )
  
  # Spatial join: left join so every polygon is retained
  joined <- boundary_sf |>
    left_join(
      aggregates |> filter(!is.na(`Neighbourhood ID`) &
                             `Neighbourhood ID` != "NA"),
      by = "Neighbourhood ID"
    )
  
  # Assign polygon states
  joined <- joined |>
    mutate(
      polygon_state = case_when(
        `Neighbourhood ID` == EVERGREEN_ID        ~ "manufactured_home_community",
        `Neighbourhood ID` %in% non_residential_ids ~ "non_residential",
        !is.na(suppressed) & suppressed            ~ "suppressed_low_n",
        !is.na(n_properties) & n_properties >= 100 ~ "aggregated",
        TRUE                                        ~ "no_data"
      )
    )
  
  # Select columns for GeoJSON output — schema matches 2026 production file
  geojson_ready <- joined |>
    transmute(
      `Neighbourhood ID`           = `Neighbourhood ID`,
      display_name                 = display_name,
      polygon_state                = polygon_state,
      n_properties                 = n_properties,
      median_assessvalue           = median_assessvalue,
      avall_public                 = avall_public,
      sd_assessedvalue             = sd_assessedvalue,
      median_yearbuilt             = median_yearbuilt,
      pct_with_unit                = pct_with_unit,
      avg_assessvalue_without_unit = avg_assessvalue_without_unit,
      avg_lotsize                  = avg_lotsize,
      yoy_pct_change               = yoy_pct_change
    ) |>
    st_set_precision(1e6) |>
    st_make_valid()
  
  # Write GeoJSON
  geojson_path <- file.path(
    out_dir,
    sprintf("neighbourhoods_%d_recovered.geojson", yr)
  )
  if (file.exists(geojson_path)) file.remove(geojson_path)
  st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)
  
  file_mb <- round(file.info(geojson_path)$size / 1024 / 1024, 2)
  
  state_counts <- joined |>
    st_drop_geometry() |>
    count(polygon_state)
  
  get_n <- function(state) {
    v <- state_counts$n[state_counts$polygon_state == state]
    if (length(v) == 0) 0L else v
  }
  
  cat(sprintf("  aggregated=%d  suppressed=%d  non_res=%d  no_data=%d  | %.2f MB\n",
              get_n("aggregated"), get_n("suppressed_low_n"),
              get_n("non_residential"), get_n("no_data"), file_mb))
  cat(sprintf("  Wrote: %s\n\n", geojson_path))
  
  build_log <- bind_rows(build_log, tibble(
    year              = yr,
    n_aggregated      = get_n("aggregated"),
    n_suppressed      = get_n("suppressed_low_n"),
    n_non_residential = get_n("non_residential"),
    n_no_data         = get_n("no_data"),
    geojson_path      = basename(geojson_path),   # filename only — out_dir is absolute, keep the log portable
    file_size_mb      = file_mb
  ))
}

write_csv(build_log, "output/hist_geojson_build_log.csv")
cat("Wrote: output/hist_geojson_build_log.csv\n")
cat("\n=============================================================\n")
cat("GeoJSON build complete.\n")
print(build_log |> select(year, n_aggregated, n_suppressed, n_no_data, file_size_mb),
      n = Inf)
cat("=============================================================\n")