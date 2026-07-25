# ============================================================
# 03_emit_manifest.R   (amenities — no-year currency manifest)
# ------------------------------------------------------------
# CONTRACT: emit the manifest the frontend reads to discover the amenity layers,
#   their category domains (legend), and their CURRENCY + COVERAGE — the no-year
#   analogue of the PA/BP year manifests. (02 is intentionally unused: there is
#   no aggregate step; the manifest is 03 to mirror the building-permits
#   convention where 03 is always the manifest.)
#
# REFRESH-BY-DESIGN (D2), generalised to a layer with NO year axis: no data
#   literal lives in the frontend. In place of a year the manifest carries, per
#   layer, `fetchedAt` (our snapshot date) and `sourceUpdatedAt` (the City's own
#   last-updated timestamp) as the CURRENCY signal, plus the observed category
#   domain and the coverage counts. A new City category / a changed count / a new
#   update date all flow through with no code edit.
#
# BUILT FROM output/, never the registry alone: it iterates the build log 01
#   wrote and asserts each layer's GeoJSON physically EXISTS in output/ before
#   describing it — so it can never describe a file that was not written.
#
# sourceUpdatedAt (KC ruling B, 2026-07-25): a ONE-field metadata read of the
#   dataset's rowsUpdatedAt. This is NOT the §4.8 bulk data fetch (that stays in
#   the helper) — it is the only way to honour the City's own currency timestamp,
#   which the frozen helper does not expose. Fail-soft: unreachable -> null, and
#   fetchedAt still carries the currency.
#
# Inputs:  output/_amenity_build_log.csv (from 01) + output/<layer>.geojson
# Output:  output/manifest.json
# Run: from the section dir, Rscript scripts/production/03_emit_manifest.R
# ============================================================

library(jsonlite)

log_path <- "output/_amenity_build_log.csv"
if (!file.exists(log_path)) {
  stop("No output/_amenity_build_log.csv — run 01_build_amenity_layers.R first.")
}
bl <- read.csv(log_path, stringsAsFactors = FALSE, colClasses = "character")

# One-field metadata read: the City's rowsUpdatedAt for a dataset (KC ruling B).
# curl (the same library the fetch helper uses) so SSL/proxy behave identically.
# Fail-soft: any failure -> NA (manifest carries null; fetchedAt still dates it).
source_updated_at <- function(data_id, domain = "data.edmonton.ca") {
  url <- sprintf("https://%s/api/views/%s.json", domain, data_id)
  resp <- tryCatch(curl::curl_fetch_memory(url), error = function(e) NULL)
  if (is.null(resp) || resp$status_code != 200) return(NA_character_)
  meta <- tryCatch(jsonlite::fromJSON(rawToChar(resp$content)), error = function(e) NULL)
  ts <- if (is.null(meta)) NULL else meta$rowsUpdatedAt
  if (is.null(ts) || is.na(ts)) return(NA_character_)
  format(as.POSIXct(as.numeric(ts), origin = "1970-01-01", tz = "UTC"), "%Y-%m-%d")
}

layers <- list()
for (i in seq_len(nrow(bl))) {
  row  <- bl[i, ]
  gpath <- file.path("output", row$file)
  # BUILT-FROM-output/ guard: skip (loudly) any log row whose GeoJSON is absent.
  if (!file.exists(gpath) || file.size(gpath) == 0) {
    warning(sprintf("Manifest: %s has no non-empty GeoJSON in output/ — omitted.",
                    row$layer_id))
    next
  }
  cats <- row$categories
  cats <- if (is.na(cats) || !nzchar(cats)) character(0) else strsplit(cats, "\\|")[[1]]
  # Parallel counts (alphabetical, same order as cats) -> a {category: count} object.
  cnts <- row$category_counts
  cnts <- if (is.na(cnts) || !nzchar(cnts)) integer(0) else as.integer(strsplit(cnts, "\\|")[[1]])
  categoryCounts <- if (length(cats) && length(cnts) == length(cats))
    setNames(as.list(cnts), cats) else setNames(list(), character(0))
  # Display labels (D9) -> {raw: label}; residual flags (D5) -> the raw values that grey + sort last.
  labs <- row$category_labels
  labs <- if (is.na(labs) || !nzchar(labs)) character(0) else strsplit(labs, "\\|")[[1]]
  categoryLabels <- if (length(cats) && length(labs) == length(cats))
    setNames(as.list(labs), cats) else setNames(list(), character(0))
  resid <- row$category_residual
  resid <- if (is.na(resid) || !nzchar(resid)) integer(0) else as.integer(strsplit(resid, "\\|")[[1]])
  residualCategories <- if (length(cats) && length(resid) == length(cats)) cats[resid == 1L] else character(0)

  layers[[length(layers) + 1L]] <- list(
    id              = row$layer_id,
    file            = row$file,
    label           = row$label,
    geometry        = row$geometry_type,
    sourceDatasetId = row$source_dataset,
    sourceUpdatedAt = source_updated_at(row$source_dataset),   # KC ruling B
    fetchedAt       = row$fetched_at,
    featureCount    = as.integer(row$features_emit),
    categoryField   = row$category_field,   # "" for a single-symbol layer
    categories      = I(cats),              # I() -> always a JSON array
    categoryCounts  = categoryCounts,       # {category: count} — for a top-N + Other collapse
    categoryLabels  = categoryLabels,       # {raw: display label} (D9)
    residualCategories = I(residualCategories),   # raw values that render grey + sort last (D5)
    coverage        = list(
      withGeometry    = as.integer(row$features_emit),
      withoutGeometry = as.integer(row$without_geometry)
    )
  )
}

if (length(layers) == 0) stop("Manifest: no layers with a GeoJSON in output/.")

manifest <- list(
  section     = "amenities",
  generatedAt = format(Sys.Date(), "%Y-%m-%d"),
  layers      = layers
)

writeLines(
  toJSON(manifest, auto_unbox = TRUE, pretty = TRUE, null = "null"),
  "output/manifest.json"
)

# --- Run metrics (Tier 0) ----------------------------------------------------
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["manifest_layers"]] <- length(layers)

cat(sprintf("Wrote output/manifest.json (%d layers)\n", length(layers)))
for (L in layers) {
  cat(sprintf("  %-22s feat=%-6d cats=%-3d cover=%d/%d  src=%s fetched=%s\n",
              L$id, L$featureCount, length(L$categories),
              L$coverage$withGeometry,
              L$coverage$withGeometry + L$coverage$withoutGeometry,
              ifelse(is.na(L$sourceUpdatedAt), "NA", L$sourceUpdatedAt), L$fetchedAt))
}
