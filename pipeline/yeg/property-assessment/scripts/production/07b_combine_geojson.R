# ============================================================
# 07b_combine_geojson.R
# AREF — Combine the per-year choropleth GeoJSONs into ONE geometry-once file.
#
# WHAT: Reshape the 15 per-year files 06_geojson_current + 07_geojson_historical
#   already wrote (neighbourhoods_<YYYY>_recovered.geojson) into a single
#   combined GeoJSON: each of the 403 neighbourhood features carries its geometry
#   ONCE plus every year's values as flat, year-suffixed properties
#   (median_assessvalue_2026, polygon_state_2012, ...). This is the source a
#   year-slider can paint-swap (setPaintProperty on <metric>_<year>) without
#   reloading geometry.
#
# WHY a reshape (not a re-join): the per-year files are already the canonical,
#   rescued, polygon-state-classified products. Reshaping them — rather than
#   re-deriving aggregates/states — makes this file provably equal to those
#   files year-by-year, and keeps all the cleaning/reconciliation logic in one
#   place (04/05 + 06/07). This script makes NO data decisions.
#
# TRANSITIONAL / ADDITIVE: 06 + 07 still write the per-year files and the
#   frontend still consumes them. This builder runs ALONGSIDE them and publishes
#   the combined file in addition. When the frontend migrates to the combined
#   file, 06/07 collapse into this builder (a later cleanup step) — not now.
#
# REFRESH-BY-DESIGN: years are discovered from the per-year filenames (same glob
#   08_emit_manifest uses) — no year literals. The combined output name carries
#   no year/span (literal-free, frontend-stable on rollover).
#
# PER-YEAR, NOT FOLDED: polygon_state and every metric VARY year to year (a
#   neighbourhood can be suppressed_low_n one year and aggregated another), so
#   each is namespaced _<year>; nothing is collapsed to one value per feature.
#
# IDENTITY stored ONCE (year-invariant), taken from the current (max) year, which
#   is the only per-year file carrying shapefile_name + district (06's schema):
#   Neighbourhood ID (the locked join key), display_name, shapefile_name, district.
#
# INPUTS:
#   output/neighbourhoods_<YYYY>_recovered.geojson   (all years; 06 + 07)
# OUTPUT:
#   output/neighbourhoods_all_years.geojson          (runner publishes to public)
# ============================================================

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)

stopifnot(dir.exists("output"))

# Per-year value columns carried for EVERY year, suffixed _<year>. This mirrors
# 06_geojson_current's transmute (the canonical 2026 schema): polygon_state +
# the 9 aggregate metrics. The frontend paints 5 of the metrics + polygon_state;
# the rest feed popups. Carried in full so the combined file is schema-faithful.
VALUE_COLS <- c(
  "polygon_state",
  "n_properties", "median_assessvalue", "avall_public", "sd_assessedvalue",
  "median_yearbuilt", "pct_with_unit", "avg_assessvalue_without_unit",
  "avg_lotsize", "yoy_pct_change"
)

# PUBLISH-TIME RENAME. VALUE_COLS above are the names the per-year files (06/07)
# carry — the pipeline's own. This maps a column to the name the COMBINED file
# publishes, for the one case where the pipeline name mis-states the value:
#
#   yoy_pct_change holds log(median_now / median_prior) * 100 — log points, not a
#   percent (METHODOLOGY.md D7). The combined GeoJSON is the frontend's data
#   contract AND what a researcher downloads from the map, and it travels with no
#   legend attached to explain it, so a column called "pct_change" tells that
#   reader something the data does not support.
#
# Same principle as the handoff's yeg_ CSV rename (CLAUDE.md §6): the internal
# frame keeps its working name, the published artifact carries the honest one.
# Renamed HERE and not in 04/05 because their CSVs are the pipeline's own
# intermediates — moving those would also move the published per-nbhd download CSV,
# a separate contract. That seam is real and tracked; see the commit.
PUBLISH_NAME <- c(yoy_pct_change = "yoy_log_points")
publish_name <- function(x) {
  hit <- match(x, names(PUBLISH_NAME))
  ifelse(is.na(hit), x, unname(PUBLISH_NAME)[hit])
}

# Year-invariant identity, stored once. Geometry + these come from the current
# (max) year's file. Only 06's current-year file carries shapefile_name/district;
# the historical files (07) omit them, which is why identity is sourced from the
# current year, not back-derived per year.
# is_annexation_area is likewise year-invariant (the crosswalk's annexation ids are
# the same every year) — carried here as a flat identity field so the frontend can
# filter on it directly (["get","is_annexation_area"]); without this the combiner
# drops it and the annexation outline renders nowhere on PA (Tier 2 · sub-concern E,
# closing 3d43d02's gate — 06/07 emit the flag but the combiner never carried it).
IDENTITY_COLS <- c("Neighbourhood ID", "display_name", "shapefile_name", "district",
                   "is_annexation_area")

OUT_PATH <- "output/neighbourhoods_all_years.geojson"

# Read a per-year GeoJSON and restore the canonical join-key name. GDAL/sf
# sanitize the property "Neighbourhood ID" (with a space) to "Neighbourhood.ID"
# on st_read; the per-year files, the frontend promoteId, and its
# ["get","Neighbourhood ID"] all use the SPACED name, so st_write must emit the
# space back. Only this one property carries a space — restore it explicitly.
read_year <- function(path) {
  x <- st_read(path, quiet = TRUE)
  names(x)[names(x) == "Neighbourhood.ID"] <- "Neighbourhood ID"
  x
}

# ============================================================
# 1. Discover the per-year files (same glob 08_emit_manifest uses)
# ============================================================
per_year_files <- list.files(
  "output",
  pattern    = "^neighbourhoods_[0-9]{4}_recovered\\.geojson$",
  full.names = TRUE
)
if (length(per_year_files) == 0) {
  stop("No neighbourhoods_<YYYY>_recovered.geojson in output/ — ",
       "run 06_geojson_current + 07_geojson_historical first.")
}
years <- sort(as.integer(str_extract(basename(per_year_files), "[0-9]{4}")))
max_year <- max(years)
cat(sprintf("Per-year files: %d  (years %d-%d)\n",
            length(per_year_files), min(years), max_year))

path_for <- function(yr) {
  file.path("output", sprintf("neighbourhoods_%d_recovered.geojson", yr))
}

# ============================================================
# 2. Base = geometry + identity from the current (max) year
# ============================================================
# sf keeps the geometry column sticky through select(), so the base carries the
# 403 polygons (already container-excluded + precision-set by 06) plus identity.
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
  # A mismatch means a per-year build diverged — surface it loudly.
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
    # Publish name first, THEN the year suffix — so the reader sees yoy_log_points_2026,
    # never yoy_pct_change_2026. Non-renamed columns pass through untouched.
    rename_with(~ paste0(publish_name(.x), "_", yr), all_of(VALUE_COLS))

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

# Expected: 4 identity + length(VALUE_COLS) * n_years.
expected_props <- length(IDENTITY_COLS) + length(VALUE_COLS) * length(years)
if (n_props != expected_props) {
  stop(sprintf("Property count %d != expected %d (4 identity + %d value cols x %d years)",
               n_props, expected_props, length(VALUE_COLS), length(years)))
}

# Spot-check: the current year's values survived the reshape unchanged.
cat(sprintf("Sanity: %d aggregated polygons in year %d (combined)\n",
            sum(combined[[paste0("polygon_state_", max_year)]] == "aggregated", na.rm = TRUE),
            max_year))

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["n_features"]]   <- nrow(combined)
RUN_METRICS[["n_properties"]] <- n_props
RUN_METRICS[["n_years"]]      <- length(years)
RUN_METRICS[["geojson_mb"]]   <- round(size_mb, 2)
