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
