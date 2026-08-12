# ============================================================
# 08_emit_manifest.R
# AREF — Emit manifest.json for frontend year auto-discovery
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Scan output/ for the freshly-built per-year GeoJSON files and
#   emit manifest.json describing them. The frontend
#   reads manifest.json at runtime to populate the year selector —
#   no year literals anywhere in frontend code.
#
# REFRESH-BY-DESIGN:
#   - Discovers years from filenames — no hardcoded year list
#   - Re-running after adding a new GeoJSON updates the manifest
#   - One operator command: source("scripts/08_emit_manifest.R")
#
# INPUTS:
#   output/neighbourhoods_YYYY_recovered.geojson
#   (all years freshly built by 07_geojson_historical/06_geojson_current this run)
#
# OUTPUT:
#   output/manifest.json   (the runner publishes it to website/public/manifest.json)
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

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# Run directly in console — no need to edit the script file
# Override the two path variables then source

# Scan the freshly-built GeoJSONs in output/ (NOT public) so the manifest
# describes what THIS run produced — the runner publishes output/ -> public
# afterward. Reading public here would describe the PREVIOUS run (stale).
# The manifest is likewise written to output/ and published by the runner's
# handoff, keeping the runner the sole writer of website/public.
public_dir    <- "output"
manifest_path <- "output/manifest.json"



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
       "\nRun 07_geojson_historical.R first.")
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
    # Tier 0: a real warning() survives a successful unattended run (a bare cat()
    # is discarded with the child's stdout) and tips ok_with_warnings.
    warning(sprintf("no aggregated polygons for %d — skipping colour scale", yr))
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
# 3b. Download artefact facts (additive; see shared/download_facts.R)
# ============================================================
# The neighbourhood aggregate this section publishes for direct download
# describes itself here: size, rows, columns, and the snapshot date it was built
# from. Every field is MEASURED from the written file rather than asserted, so it
# cannot drift away from the data — the live page currently states "407
# neighbourhoods" for a file holding 344, which is exactly that drift.
#
# NO coverageSpan is emitted for this artefact, deliberately. It carries no year
# column; its year lives only in the filename. A span read from a filename would
# be a guess wearing the same clothes as a measured fact, so the key is omitted.
#
# The aggregate is found by PATTERN, not by name: its filename carries the data
# year, and a literal here would need editing every rollover.
source(shared_path("download_facts.R"))
# The SAME constant the aggregation step gated on. Sourced rather than retyped:
# a threshold published from a second copy could drift from the rule that ran,
# and would look authoritative while doing it.
source("scripts/production/_suppression_rule.R")

aggregate_files <- list.files(
  "output",
  pattern = "^neighbourhood_aggregates_[0-9]{4}\\.csv$",
  full.names = FALSE
)
if (length(aggregate_files) == 0) {
  stop("No neighbourhood_aggregates_<YYYY>.csv in output/ — run 05 first.")
}
# Newest by the year in the name; the current-year aggregate is what is published.
current_aggregate <- aggregate_files[which.max(as.integer(
  sub("^neighbourhood_aggregates_([0-9]{4})\\.csv$", "\\1", aggregate_files)
))]

# This section reads TWO live source snapshots (the assessment roll and the
# property-information extract), so both stems are named. Per KC's ruling the
# recorded vintage is the NEWEST of them.
PA_SNAPSHOT_STEMS <- c("Property_Assessment_Current", "Property_Information_Current")

manifest$downloads <- list(
  describe_download_artefact(
    section        = "property-assessment",
    output_rel     = file.path("output", current_aggregate),
    raw_dir        = "data/raw",
    snapshot_stems = PA_SNAPSHOT_STEMS,
    # What the suppression rule counts, and the minimum it requires. Stated so
    # the download page can explain masking without typing the number itself.
    threshold_column  = "n_properties",
    minimum_to_report = SUPPRESSION_MIN_PROPERTIES
  )
)

# --- Row universe: why the aggregate holds the neighbourhoods it holds --------
# The denominator is the CITY BOUNDARY, read through the guarded loader so the
# accepted-snapshot contract applies here too. Never a constant: the whole reason
# this block exists is that a hardcoded "407" was published against a 344-row
# file, and nothing caught it.
#
# Each absent neighbourhood is assigned to exactly ONE mechanism, decided by
# where in the chain it disappears. The classification is positional, not
# guessed — a neighbourhood is put in a class because it IS or IS NOT in a frame
# we can read, and row_universe_block refuses to publish unless the classes
# account for every absent row.
#
#   absent_from_source_snapshot          the City's assessment roll has no row
#                                        for it at all this vintage
#   no_residential_class_row             it has rows, none Assessment Class 1 ==
#                                        RESIDENTIAL (02_clean_current.R:71)
#   no_lot_size_after_join               it has residential rows, but every one
#                                        lost its lot_size in the Property
#                                        Information join, so R3 dropped them
#                                        (02_clean_current.R:181-182)
#   merged_into_canonical_neighbourhood  it survives cleaning, then the crosswalk
#                                        folds it into another neighbourhood
#                                        (05_aggregate_current.R:96)
#
# Paths are found by PATTERN. The intermediate frames carry the data year in
# their names, and a literal here would need editing every rollover.
newest_matching <- function(dir, pattern) {
  hits <- list.files(dir, pattern = pattern, full.names = TRUE)
  if (length(hits) == 0) {
    stop("08: no file matching ", pattern, " in ", dir,
         " — the row universe cannot be derived, and must not be assumed.")
  }
  sort(hits, decreasing = TRUE)[1]
}

# Distinct numeric neighbourhood ids in a CSV, optionally restricted to the
# residential class. Reads only the columns it needs; these frames are ~100 MB.
neighbourhood_ids <- function(path, residential_only = FALSE) {
  cols <- if (residential_only) c("Neighbourhood ID", "Assessment Class 1") else "Neighbourhood ID"
  frame <- readr::read_csv(path, col_select = all_of(cols),
                           col_types = readr::cols(.default = readr::col_character()),
                           progress = FALSE)
  if (residential_only) {
    frame <- frame[!is.na(frame[["Assessment Class 1"]]) &
                     toupper(frame[["Assessment Class 1"]]) == "RESIDENTIAL", ]
  }
  ids <- suppressWarnings(as.integer(frame[["Neighbourhood ID"]]))
  sort(unique(ids[!is.na(ids)]))
}

source(shared_path("boundary_helpers.R"))
universe_ids <- {
  b <- load_boundary()
  ids <- suppressWarnings(as.integer(b[["Neighbourhood Number"]]))
  sort(unique(ids[!is.na(ids)]))
}

raw_snapshot <- newest_matching("data/raw", "^Property_Assessment_Current_[0-9]{8}\\.csv$")
clean_frame  <- newest_matching("data/processed", "^assess_[0-9]{4}_clean\\.csv$")

artefact_ids <- neighbourhood_ids(file.path("output", current_aggregate))
raw_ids      <- neighbourhood_ids(raw_snapshot)
raw_res_ids  <- neighbourhood_ids(raw_snapshot, residential_only = TRUE)
clean_ids    <- neighbourhood_ids(clean_frame)

# The arithmetic below only means anything if the artefact is a SUBSET of the
# universe: rowsPresent counts what the file holds, rowsAbsent is a set
# difference, and the two only reconcile when nothing in the file sits outside
# the boundary. That is true today, but it is a property of the data, not a
# guarantee — so assert it rather than assume it. A neighbourhood in the
# aggregate that the City's boundary does not contain is a reconciliation
# failure worth stopping for, not a rounding error to absorb.
outside_universe <- setdiff(artefact_ids, universe_ids)
if (length(outside_universe) > 0) {
  stop("08: the aggregate holds ", length(outside_universe),
       " neighbourhood id(s) absent from the boundary universe (",
       paste(utils::head(outside_universe, 10), collapse = ", "),
       "). The artefact and its denominator disagree; publishing a total that ",
       "does not add up would hide that.")
}

absent <- setdiff(universe_ids, artefact_ids)
absence_counts <- list(
  absent_from_source_snapshot         = length(setdiff(absent, raw_ids)),
  no_residential_class_row            = length(setdiff(intersect(absent, raw_ids), raw_res_ids)),
  no_lot_size_after_join              = length(setdiff(intersect(absent, raw_res_ids), clean_ids)),
  merged_into_canonical_neighbourhood = length(intersect(absent, clean_ids))
)
# Omit a mechanism that accounted for nothing this vintage rather than publishing
# a zero — a zero reads as "we checked and it happens", which is a different claim.
absence_counts <- absence_counts[unlist(absence_counts) > 0]

manifest$downloads[[1]]$rowUniverse <- row_universe_block(
  universe_size = length(universe_ids),
  rows_present  = length(artefact_ids),
  breakdown     = absence_counts
)
cat(sprintf("Row universe: %d of %d neighbourhoods present; %d absent (%s)\n",
            length(artefact_ids), length(universe_ids), length(absent),
            paste(sprintf("%s=%d", names(absence_counts), unlist(absence_counts)),
                  collapse = ", ")))

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["n_years"]]         <- length(years_found)
RUN_METRICS[["n_colour_scales"]] <- length(colour_scale_by_year)
RUN_METRICS[["default_year"]]    <- max(years_found)

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

# NOTE: 08_emit_manifest only EMITS the manifest (its stated purpose). Copying the 2026
# GeoJSON into website/public is the build step's job (06_geojson_current output → public),
# done before running this script. A prior trailing file.copy() here pulled a
# stale output/neighbourhoods_2026_recovered.geojson (old 402-polygon boundary,
# no yoy) over the freshly built file and was removed 2026-06-18.
