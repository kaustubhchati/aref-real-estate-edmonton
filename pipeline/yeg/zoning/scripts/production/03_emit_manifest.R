# ============================================================
# 03_emit_manifest.R   (zoning — no-year currency manifest)
# ------------------------------------------------------------
# CONTRACT: emit the manifest the frontend reads to discover the zoning layers,
#   the family domain + per-family counts (legend), and their CURRENCY +
#   COVERAGE — the amenities no-year pattern (their 03), driven by the build log
#   01 wrote. (02 is intentionally unused: it is RESERVED for the deferred Z2
#   overlays emitter — v1.1, dataset 6w3s-58pv — so the manifest stays 03,
#   matching the amenities / building-permits convention.)
#
# REFRESH-BY-DESIGN (D2), no-year form: no data literal lives in the frontend.
#   Per layer the manifest carries `fetchedAt` (our snapshot date) and
#   `sourceUpdatedAt` (the City's own rowsUpdatedAt) as the CURRENCY signal,
#   plus the family domain with per-family counts. A bylaw amendment that adds
#   a family (via a new ratified crosswalk) flows through with no code edit.
#
# BUILT FROM output/, never assumptions: it iterates the build log and asserts
#   each layer's GeoJSON physically EXISTS in output/ before describing it.
#
# sourceUpdatedAt: a ONE-field metadata read of the dataset's rowsUpdatedAt
#   (the amenities 03 pattern, KC ruling B 2026-07-25). NOT the §4.8 bulk fetch —
#   fail-soft: unreachable -> null, fetchedAt still dates the snapshot.
#
# Inputs:  output/_log_zoning_bylaw.csv (from 01) + output/<layer>.geojson
# Output:  output/manifest.json
# Run: from the section dir, Rscript scripts/production/03_emit_manifest.R
# ============================================================

library(jsonlite)

log_path <- "output/_log_zoning_bylaw.csv"
if (!file.exists(log_path)) {
  stop("No output/_log_zoning_bylaw.csv — run 01_build_zoning.R first.")
}
bl <- read.csv(log_path, stringsAsFactors = FALSE, colClasses = "character")

# One-field metadata read: the City's rowsUpdatedAt for a dataset (fail-soft).
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
  row   <- bl[i, ]
  gpath <- file.path("output", row$file)
  # BUILT-FROM-output/ guard: skip (loudly) any log row whose GeoJSON is absent.
  if (!file.exists(gpath) || file.size(gpath) == 0) {
    warning(sprintf("Manifest: %s has no non-empty GeoJSON in output/ — omitted.",
                    row$layer_id))
    next
  }
  cats <- row$categories
  cats <- if (is.na(cats) || !nzchar(cats)) character(0) else strsplit(cats, "\\|")[[1]]
  # Parallel counts (alphabetical, same order as cats) -> a {family: count} object.
  cnts <- row$category_counts
  cnts <- if (is.na(cnts) || !nzchar(cnts)) integer(0) else as.integer(strsplit(cnts, "\\|")[[1]])
  categoryCounts <- if (length(cats) && length(cnts) == length(cats))
    setNames(as.list(cnts), cats) else setNames(list(), character(0))
  # Planar area share per family (EPSG:26912, from 01) — count is what the data
  # says; area is what the eye sees. The legend shows both.
  shrs <- if ("category_area_pct" %in% names(row)) row$category_area_pct else NA_character_
  shrs <- if (is.na(shrs) || !nzchar(shrs)) numeric(0) else as.numeric(strsplit(shrs, "\\|")[[1]])
  categoryAreaShare <- if (length(cats) && length(shrs) == length(cats))
    setNames(as.list(shrs), cats) else setNames(list(), character(0))

  layers[[length(layers) + 1L]] <- list(
    id              = row$layer_id,
    file            = row$file,
    label           = row$label,
    geometry        = row$geometry_type,
    sourceDatasetId = row$source_dataset,
    sourceUpdatedAt = source_updated_at(row$source_dataset),
    fetchedAt       = row$fetched_at,
    rawSnapshot     = if ("raw_snapshot" %in% names(row)) row$raw_snapshot else NA_character_,
    featureCount    = as.integer(row$features_emit),
    categoryField   = row$category_field,   # "" for the boundaries file
    categories      = I(cats),              # I() -> always a JSON array
    categoryCounts  = categoryCounts,       # {family: polygon count}
    categoryAreaShare = categoryAreaShare,  # {family: planar area %}
    coverage        = list(
      withGeometry    = as.integer(row$features_emit),
      withoutGeometry = as.integer(row$without_geometry)
    )
  )
}

if (length(layers) == 0) stop("Manifest: no layers with a GeoJSON in output/.")

manifest <- list(
  section     = "zoning",
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
  cat(sprintf("  %-26s feat=%-6d cats=%-3d src=%s fetched=%s\n",
              L$id, L$featureCount, length(L$categories),
              ifelse(is.na(L$sourceUpdatedAt), "NA", L$sourceUpdatedAt), L$fetchedAt))
}
