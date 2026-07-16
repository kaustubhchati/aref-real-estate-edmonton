# ============================================================
# 02b_combine_geojson.R
# AREF — Combine the per-year Dwelling-Units choropleth GeoJSONs into ONE
#   geometry-once file. The building-permits analogue of property-assessment's
#   07b_combine_geojson.R (same reshape, DU's columns).
#
# WHAT: Reshape the per-year files 02_build_permit_aggregates already wrote
#   (permit_neighbourhoods_<YYYY>.geojson) into a single combined GeoJSON: each of
#   the 407 neighbourhood features carries its geometry ONCE plus every year's
#   values as flat, year-suffixed properties (n_permits_2026, polygon_state_2012,
#   …). This is the source a year-slider + Data Console can paint-swap
#   (setPaintProperty on <metric>_<year>) and trend-read without reloading geometry.
#
# WHY a reshape (not a re-aggregate): the per-year files are already the canonical,
#   rescued, polygon-state-classified products (02). Reshaping them — rather than
#   re-deriving — makes this file provably equal to those files year-by-year and
#   keeps ALL the cleaning/rescue logic in one place (02). This script makes NO
#   data decisions.
#
# ADDITIVE: 02 still writes the per-year files and the choropleth still consumes
#   them for the point-in-time map; this builder runs ALONGSIDE and publishes the
#   combined file in addition (the Data Console's resident source).
#
# REFRESH-BY-DESIGN: years are discovered from the per-year filenames (same glob
#   03_emit_manifest uses) — no year literals. The combined output name carries no
#   year/span (literal-free, frontend-stable on rollover).
#
# PER-YEAR, NOT FOLDED: polygon_state and every metric VARY year to year (a
#   neighbourhood can be suppressed_low_n one year and aggregated another), so each
#   is namespaced _<year>; nothing is collapsed to one value per feature.
#
# IDENTITY stored ONCE (year-invariant), taken from the current (max) year: every
#   per-year file carries the same boundary-sourced identity (02 joins the one
#   boundary each year), so any year would do; max year mirrors 07b.
#
# INPUTS:
#   output/permit_geojson/permit_neighbourhoods_<YYYY>.geojson   (all years; 02)
# OUTPUT:
#   output/permit_geojson/permit_neighbourhoods_all_years.geojson (runner publishes)
# ============================================================

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)

stopifnot(dir.exists("output/permit_geojson"))

# Per-year value columns carried for EVERY year, suffixed _<year>. Mirrors 02's
# geojson transmute (the canonical schema): polygon_state + the 6 aggregate metrics.
VALUE_COLS <- c(
  "polygon_state",
  "n_permits", "total_construction_value", "median_construction_value",
  "units_added_gross", "units_demolished", "yoy_pct_permits"
)

# Year-invariant identity, stored once. Geometry + these come from the current
# (max) year's file. is_annexation_area is year-invariant (the crosswalk's
# annexation ids are the same every year) — carried as a flat identity field so
# the frontend can filter on it directly (["get","is_annexation_area"]).
IDENTITY_COLS <- c("Neighbourhood ID", "display_name", "district", "is_annexation_area")

GEOJSON_DIR <- "output/permit_geojson"
OUT_PATH    <- file.path(GEOJSON_DIR, "permit_neighbourhoods_all_years.geojson")

# Read a per-year GeoJSON and restore the canonical join-key name. GDAL/sf
# sanitize the property "Neighbourhood ID" (with a space) to "Neighbourhood.ID"
# on st_read; the per-year files, the frontend promoteId, and its
# ["get","Neighbourhood ID"] all use the SPACED name, so we restore the space.
read_year <- function(path) {
  x <- st_read(path, quiet = TRUE)
  names(x)[names(x) == "Neighbourhood.ID"] <- "Neighbourhood ID"
  x
}

# ============================================================
# 1. Discover the per-year files (same glob 03_emit_manifest uses)
# ============================================================
per_year_files <- list.files(
  GEOJSON_DIR,
  pattern    = "^permit_neighbourhoods_[0-9]{4}\\.geojson$",
  full.names = TRUE
)
if (length(per_year_files) == 0) {
  stop("No permit_neighbourhoods_<YYYY>.geojson in ", GEOJSON_DIR,
       " — run 02_build_permit_aggregates.R first.")
}
years <- sort(as.integer(str_extract(basename(per_year_files), "[0-9]{4}")))
max_year <- max(years)
cat(sprintf("Per-year files: %d  (years %d-%d)\n",
            length(per_year_files), min(years), max_year))

path_for <- function(yr) {
  file.path(GEOJSON_DIR, sprintf("permit_neighbourhoods_%d.geojson", yr))
}

# ============================================================
# 2. Base = geometry + identity from the current (max) year
# ============================================================
base_sf <- read_year(path_for(max_year))
missing_identity <- setdiff(IDENTITY_COLS, names(base_sf))
if (length(missing_identity) > 0) {
  stop("Current-year file ", basename(path_for(max_year)),
       " is missing identity column(s): ", paste(missing_identity, collapse = ", "))
}
combined <- base_sf |> select(all_of(IDENTITY_COLS))
base_ids <- combined$`Neighbourhood ID`
cat(sprintf("Base (year %d): %d features, geometry + %d identity cols\n",
            max_year, nrow(combined), length(IDENTITY_COLS)))

# ============================================================
# 3. Join each year's values as <col>_<year>
# ============================================================
for (yr in years) {
  attrs <- read_year(path_for(yr)) |> st_drop_geometry()

  missing_value <- setdiff(c("Neighbourhood ID", VALUE_COLS), names(attrs))
  if (length(missing_value) > 0) {
    stop("Year ", yr, " file is missing column(s): ",
         paste(missing_value, collapse = ", "))
  }

  # ID-set parity guard: every year must describe the same polygons as the base.
  if (!setequal(attrs$`Neighbourhood ID`, base_ids)) {
    only_year <- setdiff(attrs$`Neighbourhood ID`, base_ids)
    only_base <- setdiff(base_ids, attrs$`Neighbourhood ID`)
    stop(sprintf(
      "Year %d Neighbourhood ID set differs from the base (%d) year. only-in-%d: %s | only-in-base: %s",
      yr, max_year, yr,
      if (length(only_year)) paste(only_year, collapse = ",") else "(none)",
      if (length(only_base)) paste(only_base, collapse = ",") else "(none)"))
  }

  year_tbl <- attrs |>
    select(`Neighbourhood ID`, all_of(VALUE_COLS)) |>
    rename_with(~ paste0(.x, "_", yr), all_of(VALUE_COLS))

  combined <- combined |> left_join(year_tbl, by = "Neighbourhood ID")
}

# ============================================================
# 4. Write the combined GeoJSON
# ============================================================
if (file.exists(OUT_PATH)) file.remove(OUT_PATH)
st_write(combined, OUT_PATH, driver = "GeoJSON", quiet = TRUE)

n_props <- ncol(st_drop_geometry(combined))
size_mb <- file.info(OUT_PATH)$size / 1024 / 1024
cat(sprintf("\nWrote %s (%.2f MB, %d features, %d properties/feature)\n",
            OUT_PATH, size_mb, nrow(combined), n_props))

# Expected: identity + VALUE_COLS * n_years.
expected_props <- length(IDENTITY_COLS) + length(VALUE_COLS) * length(years)
if (n_props != expected_props) {
  stop(sprintf("Property count %d != expected %d (%d identity + %d value cols x %d years)",
               n_props, expected_props, length(IDENTITY_COLS),
               length(VALUE_COLS), length(years)))
}

# Spot-check: the current year's values survived the reshape unchanged.
cat(sprintf("Sanity: %d aggregated polygons in year %d (combined)\n",
            sum(combined[[paste0("polygon_state_", max_year)]] == "aggregated", na.rm = TRUE),
            max_year))

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["n_features"]]   <- nrow(combined)
RUN_METRICS[["n_properties"]] <- n_props
RUN_METRICS[["n_years"]]      <- length(years)
RUN_METRICS[["geojson_mb"]]   <- round(size_mb, 2)
