# ============================================================
# 04_emit_manifest.R   (building-permits)
# Purpose: emit a manifest describing the per-year permit-neighbourhood
#   GeoJSONs that 03 produced, for the frontend's year selector. Mirrors the
#   property-assessment 09a pattern, BP-scoped (flat { years, defaultYear }).
#
# Inputs:
#   output/permit_geojson/permit_neighbourhoods_<YYYY>.geojson   (from 03)
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
#   e.g. Rscript scripts/production/04_emit_manifest.R
# ============================================================

library(jsonlite)

gj <- list.files(
  "output/permit_geojson",
  pattern = "^permit_neighbourhoods_[0-9]{4}\\.geojson$",
  full.names = FALSE
)
if (length(gj) == 0) {
  stop("No permit_neighbourhoods_<YYYY>.geojson in output/permit_geojson/ — run 03 first.")
}

years <- sort(as.integer(
  sub("^permit_neighbourhoods_([0-9]{4})\\.geojson$", "\\1", gj)
))

manifest <- list(years = years, defaultYear = max(years))

writeLines(
  toJSON(manifest, auto_unbox = TRUE, pretty = TRUE),
  "output/manifest.json"
)

cat("Wrote output/manifest.json — years",
    paste(range(years), collapse = "-"),
    sprintf("(n=%d), defaultYear %d\n", length(years), max(years)))
