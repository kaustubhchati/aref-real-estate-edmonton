# ============================================================
# 09_emit_manifest.R
# AREF — Emit manifest.json for frontend year auto-discovery
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Scan website/public/data/property-assessment/ for all
#   committed GeoJSON files and emit manifest.json. The frontend
#   reads manifest.json at runtime to populate the year selector —
#   no year literals anywhere in frontend code.
#
# REFRESH-BY-DESIGN:
#   - Discovers years from filenames — no hardcoded year list
#   - Re-running after adding a new GeoJSON updates the manifest
#   - One operator command: source("scripts/09_emit_manifest.R")
#
# INPUTS:
#   website/public/data/property-assessment/neighbourhoods_YYYY_recovered.geojson
#   (all years present on disk)
#
# OUTPUT:
#   website/public/manifest.json
#
# MANIFEST CONTRACT (v1.0):
#   {
#     "version": "1.0",
#     "generated": "YYYY-MM-DD",
#     "cities": {
#       "Edmonton": {
#         "assessment": {
#           "years": [2012, 2013, ..., 2026],
#           "defaultYear": 2026,
#           "colourScaleByYear": {
#             "2026": { "min": 103500, "q25": 352625, "median": 425125,
#                       "q75": 496188, "max": 1226000 }
#           }
#         }
#       },
#       "Calgary": {
#         "assessment": {
#           "years": [],
#           "defaultYear": null,
#           "colourScaleByYear": {}
#         }
#       }
#     }
#   }
#
# WHY colour scale in manifest:
#   Historical years have lower assessed values than 2026. Static
#   stops hardcoded in choroplethStyle.js would render 2012 data
#   incorrectly. Each year's Q25/median/Q75 are computed from the
#   actual GeoJSON aggregated polygons and stored here so the
#   frontend can read per-year stops without any runtime computation.
# ============================================================

library(tidyverse)
library(jsonlite)
library(sf)

cat("=============================================================\n")
cat("AREF — Manifest Emission\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M %Z"), "\n")
cat("=============================================================\n\n")

# Run directly in console — no need to edit the script file
# Override the two path variables then source

public_dir    <- "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/website/public/data/property-assessment"
manifest_path <- "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/website/public/manifest.json"



# ============================================================
# 1. Discover GeoJSON files
# ============================================================

geojson_files <- list.files(
  path    = public_dir,
  pattern = "^neighbourhoods_[0-9]{4}_recovered\\.geojson$",
  full.names = TRUE
)

if (length(geojson_files) == 0) {
  stop("No GeoJSON files found in ", public_dir,
       "\nRun 08e_hist_build_geojson.R first.")
}

years_found <- sort(as.integer(
  str_extract(basename(geojson_files), "[0-9]{4}")
))

cat("GeoJSON files found: ", length(geojson_files), "\n")
cat("Years:               ", paste(years_found, collapse = ", "), "\n\n")

# ============================================================
# 2. Compute per-year colour scale from aggregated polygons
#    Only aggregated polygons (polygon_state == "aggregated")
#    contribute — suppressed and grey states are not coloured.
# ============================================================

colour_scale_by_year <- list()

for (yr in years_found) {
  cat(sprintf("Reading colour scale from %d...\n", yr))
  
  gj_path <- file.path(
    public_dir,
    sprintf("neighbourhoods_%d_recovered.geojson", yr)
  )
  
  gj <- st_read(gj_path, quiet = TRUE) |>
    st_drop_geometry() |>
    filter(polygon_state == "aggregated",
           !is.na(median_assessvalue))
  
  if (nrow(gj) == 0) {
    cat(sprintf("  WARNING: no aggregated polygons for %d — skipping colour scale\n", yr))
    next
  }
  
  vals <- gj$median_assessvalue
  
  colour_scale_by_year[[as.character(yr)]] <- list(
    min    = round(min(vals,                     na.rm = TRUE)),
    q25    = round(quantile(vals, 0.25,          na.rm = TRUE)),
    median = round(median(vals,                  na.rm = TRUE)),
    q75    = round(quantile(vals, 0.75,          na.rm = TRUE)),
    max    = round(max(vals,                     na.rm = TRUE)),
    n_polygons = nrow(gj)
  )
  
  cat(sprintf("  min=$%s  median=$%s  max=$%s  (n=%d)\n",
              format(colour_scale_by_year[[as.character(yr)]]$min, big.mark = ","),
              format(colour_scale_by_year[[as.character(yr)]]$median, big.mark = ","),
              format(colour_scale_by_year[[as.character(yr)]]$max, big.mark = ","),
              colour_scale_by_year[[as.character(yr)]]$n_polygons))
}

# ============================================================
# 3. Build manifest object
# ============================================================

manifest <- list(
  version      = "1.0",
  generated    = format(Sys.Date(), "%Y-%m-%d"),
  last_updated = format(Sys.Date(), "%Y-%m-%d"),
  cities       = list(
    Edmonton = list(
      assessment = list(
        years             = as.list(years_found),
        defaultYear       = max(years_found),
        colourScaleByYear = colour_scale_by_year
      )
    ),
    Calgary = list(
      assessment = list(
        years             = list(),
        defaultYear       = NULL,
        colourScaleByYear = setNames(list(), character(0))
      )
    )
  )
)

# ============================================================
# 4. Write manifest.json
# ============================================================

json_out <- toJSON(manifest, auto_unbox = TRUE, pretty = TRUE, null = "null")
write(json_out, manifest_path)

cat("\n=============================================================\n")
cat("Wrote: ", manifest_path, "\n")
cat("Years covered: ", paste(years_found, collapse = ", "), "\n")
cat("Default year: ", max(years_found), "\n")
cat("=============================================================\n")

# NOTE: 09a only EMITS the manifest (its stated purpose). Copying the 2026
# GeoJSON into website/public is the build step's job (08b output → public),
# done before running this script. A prior trailing file.copy() here pulled a
# stale output/neighbourhoods_2026_recovered.geojson (old 402-polygon boundary,
# no yoy) over the freshly built file and was removed 2026-06-18.
