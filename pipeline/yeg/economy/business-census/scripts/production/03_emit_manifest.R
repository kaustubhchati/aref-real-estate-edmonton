# ============================================================
# 03_emit_manifest.R   (economy/business-census)
#
# Purpose: publish the facts the frontend needs in order to stop naming this
#   section's vintage in code — the choropleth's filename and the survey years
#   behind it.
#
# WHY THIS EXISTS: every other section already emits a manifest (property
#   assessment, building permits, amenities, zoning). Business census did not,
#   which is why its year ended up hardcoded in five places instead: the emitted
#   filename, both sides of the runner handoff, the frontend fetch URL, and
#   eleven frontend key accesses. The frontend cannot discover a vintage that
#   nothing publishes. This closes that gap rather than adding a sixth literal.
#
# WHY THE FACTS ARE READ FROM THE WRITTEN FILE, not passed along from 01:
#   a manifest that describes what a script INTENDED to write is a second source
#   of truth. This one describes the artefact that actually exists on disk, so it
#   cannot drift from it.
#
# Shape follows the established flat pattern (building-permits/03_emit_manifest.R
#   emits { years, defaultYear }); the currency fields (sourceUpdatedAt-style
#   fetchedAt, featureCount) follow amenities/zoning.
#
# Inputs:
#   output/business_census_<YYYY>.geojson   (from 01)
#
# Output:
#   output/manifest.json
#   (the runner publishes output/ -> website/public; this script never writes
#    public — the runner is the sole publisher.)
#
# Run context: from the section dir (pipeline/yeg/economy/business-census/).
# ============================================================

library(jsonlite)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# The choropleth is found by PATTERN. Its name carries the production vintage, so
# a literal here would need editing every rollover — the exact problem this file
# exists to remove.
choropleths <- list.files("output", pattern = "^business_census_[0-9]{4}\\.geojson$")
if (length(choropleths) == 0) {
  stop("No business_census_<YYYY>.geojson in output/ — run 01 first.")
}
# Zero-padded years sort lexically, so the newest name carries the newest vintage.
choropleth <- max(choropleths)
survey_year <- as.integer(sub("^business_census_([0-9]{4})\\.geojson$", "\\1", choropleth))

gj <- fromJSON(file.path("output", choropleth), simplifyVector = FALSE)
props <- lapply(gj$features, function(f) f$properties)

# The comparison vintage is not in the filename, so it is recovered from the data:
# a polygon carries prior_* values only when a comparison year existed. Reported
# as a count rather than a year, because the year itself is not recoverable from
# the artefact — see priorYear below.
n_with_prior <- sum(vapply(props, function(p) !is.null(p$prior_n_businesses), logical(1)))

# The raw snapshot the section built from, dated by fetch_socrata_snapshot().
snapshots <- list.files("data/raw",
                        pattern = "^Edmonton_Business_Census_Aggregation_[0-9]{8}\\.csv$")
fetched_at <- if (length(snapshots) == 0) NULL else {
  d <- sub("^.*_([0-9]{8})\\.csv$", "\\1", max(snapshots))
  format(as.Date(d, format = "%Y%m%d"), "%Y-%m-%d")
}

# priorYear is read back from the snapshot rather than asserted: it is the
# second-highest Survey Year, the same rule 01 applies. Omitted, never nulled,
# if the snapshot is gone — the frontend renders the comparison only when it has
# a year to name.
prior_year <- NULL
if (length(snapshots) > 0) {
  raw <- readr::read_csv(file.path("data/raw", max(snapshots)), show_col_types = FALSE,
                         col_select = "Survey Year", progress = FALSE)
  yrs <- sort(unique(as.integer(raw[["Survey Year"]])), decreasing = TRUE)
  if (length(yrs) > 1) prior_year <- yrs[2]
}

# The POINTS layer is a second published artefact of this section, on its own
# vintage. 02 already derives its year and names the file accordingly, and the
# runner publishes it by year glob — but the frontend still had to name it,
# which is the same defect the choropleth had. Describe it here so the section
# reads BOTH filenames from one place.
#
# Found by pattern, newest wins, for the same reason as the choropleth. Its
# vintage is read back from the filename rather than assumed equal to the
# choropleth's: they come from DIFFERENT source datasets (the aggregate
# wh44-4bkz and the business-level 8c4b-u4a4), and nothing guarantees the City
# advances both in the same cycle.
points <- list.files("output", pattern = "^business_census_points_[0-9]{4}\\.geojson$")
points_block <- NULL
if (length(points) > 0) {
  newest_points <- max(points)
  points_block <- list(
    file = newest_points,
    surveyYear = as.integer(
      sub("^business_census_points_([0-9]{4})\\.geojson$", "\\1", newest_points)
    )
  )
}

manifest <- list(
  section      = "business-census",
  file         = choropleth,
  surveyYear   = survey_year,
  featureCount = length(gj$features),
  polygonsWithPriorYear = n_with_prior
)
# Omitted, never nulled, when 02 has not run — the section renders the points
# view only when it has a file to name.
if (!is.null(points_block)) manifest$points <- points_block
if (!is.null(prior_year)) manifest$priorYear <- prior_year
if (!is.null(fetched_at)) manifest$fetchedAt <- fetched_at

writeLines(
  toJSON(manifest, auto_unbox = TRUE, pretty = TRUE),
  "output/manifest.json"
)

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["manifest_survey_year"]] <- survey_year
RUN_METRICS[["manifest_features"]]    <- length(gj$features)

cat(sprintf("Wrote output/manifest.json — %s, surveyYear %d, %d features\n",
            choropleth, survey_year, length(gj$features)))
