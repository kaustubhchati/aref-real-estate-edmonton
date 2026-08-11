# ============================================================
# 03_emit_manifest.R   (building-permits)
# Purpose: emit a manifest describing the per-year permit-neighbourhood
#   GeoJSONs that 02 produced, for the frontend's year selector. Mirrors the
#   property-assessment 09a pattern, BP-scoped (flat { years, defaultYear }).
#
# Inputs:
#   output/permit_geojson/permit_neighbourhoods_<YYYY>.geojson   (from 02)
#
# Output:
#   output/manifest.json = { "years": [...], "defaultYear": <max> }
#   (the runner publishes output/ -> website/public; this script never writes
#    public — the runner is the sole publisher.)
#
# Scans output/ (the freshly-built source), not public, per the sole-publisher
# lesson. No year literals — years come from the globbed file set.
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/production/03_emit_manifest.R
# ============================================================

# --- Download artefact facts (additive; see shared/download_facts.R) ----------
# The two CSVs this section publishes for direct download describe themselves
# here: size, rows, columns, the year span read from their own `year` column, and
# the date of the snapshot they were built from. Every field is MEASURED from the
# written file, never asserted, so the numbers cannot drift away from the data
# the way a hand-typed figure does.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("download_facts.R"))

library(jsonlite)

gj <- list.files(
  "output/permit_geojson",
  pattern = "^permit_neighbourhoods_[0-9]{4}\\.geojson$",
  full.names = FALSE
)
if (length(gj) == 0) {
  stop("No permit_neighbourhoods_<YYYY>.geojson in output/permit_geojson/ — run 02 first.")
}

years <- sort(as.integer(
  sub("^permit_neighbourhoods_([0-9]{4})\\.geojson$", "\\1", gj)
))

manifest <- list(years = years, defaultYear = max(years))

# Additive only: `years` and `defaultYear` above are untouched in name, nesting
# and type. This section reads ONE source snapshot, so one stem names it.
BP_SNAPSHOT_STEMS <- "General_Building_Permits"
manifest$downloads <- lapply(
  c("output/permits_coverage.csv", "output/permits_category_counts.csv"),
  function(rel) describe_download_artefact(
    section        = "building-permits",
    output_rel     = rel,
    raw_dir        = "data/raw",
    snapshot_stems = BP_SNAPSHOT_STEMS
  )
)

# --- Row universe, per artefact (see shared/download_facts.R) -----------------
# Each artefact gets its OWN denominator; they are not the same question.
#
# coverage.csv is one row per year the permit data covers. Its denominator is the
# year set, taken from `years` above — which comes from the per-year GeoJSONs 02
# built, NOT from the CSV being described. Two scripts reading the same snapshot
# by different paths have to agree on how many years there are; if they ever
# stop agreeing, the arithmetic check in row_universe_block stops the run.
#
# category_counts.csv is one row per (year, category) pair that OCCURRED. Its
# denominator is the full grid: every year times every category in the committed
# grouping table. Pairs with no permits are absent by construction — 01 builds
# this with count(), which emits only pairs where n > 0 (01_build_permits.R:276,
# and the comment above it says so). That is the whole point of the table: the
# frontend uses it to tell "no permits that year" apart from a broken filter. So
# the absences are the signal, not a shortfall.
grouping_path <- sort(list.files(
  "data/reference", pattern = "^job_category_grouping_[0-9]{8}\\.csv$",
  full.names = TRUE
), decreasing = TRUE)[1]
if (is.na(grouping_path)) {
  stop("No job_category_grouping_<YYYYMMDD>.csv in data/reference/ — the ",
       "category universe cannot be read, and must never be assumed.")
}
n_categories <- nrow(readr::read_csv(grouping_path, show_col_types = FALSE))

coverage_rows <- manifest$downloads[[1]]$rows
category_rows <- manifest$downloads[[2]]$rows

manifest$downloads[[1]]$rowUniverse <- row_universe_block(
  universe_size = length(years),
  rows_present  = coverage_rows,
  breakdown     = list()          # a year with permits always gets a row
)
manifest$downloads[[2]]$rowUniverse <- row_universe_block(
  universe_size = length(years) * n_categories,
  rows_present  = category_rows,
  breakdown     = list(no_permits_in_period = length(years) * n_categories - category_rows)
)

writeLines(
  toJSON(manifest, auto_unbox = TRUE, pretty = TRUE),
  "output/manifest.json"
)

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["n_years"]]      <- length(years)
RUN_METRICS[["default_year"]] <- max(years)

cat("Wrote output/manifest.json — years",
    paste(range(years), collapse = "-"),
    sprintf("(n=%d), defaultYear %d\n", length(years), max(years)))
