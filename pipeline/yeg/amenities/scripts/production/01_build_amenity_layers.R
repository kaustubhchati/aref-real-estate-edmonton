# ============================================================
# 01_build_amenity_layers.R   (amenities — registry-driven emitter)
# ------------------------------------------------------------
# CONTRACT: ONE script emits EVERY amenity map layer from a committed registry.
#   Adding a fifteenth layer is a REGISTRY ROW, not a new script.
#
# For each registry row:
#   1. fetch the PARENT dataset via the shared Socrata helper (CSV export — the
#      geometry rides in a WKT column; the helper is pointed at data_id, the
#      parent, never the portal lens id).
#   2. drop rows with no geometry (COUNTED, never silently dropped — CLAUDE.md §9),
#   3. keep only the registry's renderable_cols + geometry, drop the rest,
#   4. parse the WKT geometry column -> sf (WGS84),
#   5. thin coordinates to 6 dp and emit ONE GeoJSON per layer to output/.
#
# REFRESH-BY-DESIGN: no dataset id, column, or category value is a literal here —
#   every one comes from the dated registry (a versioned contract, CLAUDE.md §4.4).
#   A new City category flows through untouched; the manifest (03) records the
#   observed domain.
#
# FAIL-CLOSED: per-row min_rows / min_size floors are STOPS (in the helper); an
#   absent geometry column STOPS that layer loudly. No silent drops, no guessed
#   geometry column (EV=`geometry`, Schools=`catchment_polygon` are why it is a
#   measured registry value, not auto-detected).
#
# Registry: data/reference/amenity_layer_registry_<YYYYMMDD>.csv (newest by glob).
# Inputs:   Edmonton Open Data (parent data_id per row), via fetch_socrata_snapshot.
# Outputs:  output/<layer_id>.geojson         (one per layer)
#           output/_amenity_build_log.csv      (per-layer counts + currency, for 03)
#
# Run: from the section dir,  Rscript scripts/production/01_build_amenity_layers.R
#   Dev/proof subset:  AMENITY_LAYERS="playgrounds,bike_routes" Rscript ...
# ============================================================

library(tidyverse)
library(sf)

# Repo-root anchoring + the shared Socrata fetch helper.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))

dir.create("data/raw", showWarnings = FALSE, recursive = TRUE)
dir.create("output",   showWarnings = FALSE, recursive = TRUE)

# Normalise a Socrata CSV-export header to snake_case. The export uses DISPLAY
# names, which vary wildly per dataset — field names (`geometry_point`), Title
# Case (`Geometry Point`, `User Category`), UPPER (`NAME`), units (`Area (m²)`),
# and plain `Multipolygon`. Normalising makes the registry's column names stable
# across that variation, so the registry references ONE canonical (snake_case)
# name and the emitted GeoJSON carries clean property keys.
norm_names <- function(x) {
  x <- tolower(x)
  x <- gsub("[^a-z0-9]+", "_", x)   # runs of non-alphanumeric -> single _
  gsub("^_+|_+$", "", x)            # strip leading/trailing _
}


# ============================================================
# 1 — Registry (newest dated file; a versioned contract, CLAUDE.md §4.4)
# ============================================================
reg_files <- sort(list.files(
  "data/reference",
  pattern = "^amenity_layer_registry_\\d{8}\\.csv$", full.names = TRUE
))
if (length(reg_files) == 0) {
  stop("No amenity_layer_registry_<YYYYMMDD>.csv in data/reference/.")
}
reg_path <- tail(reg_files, 1)
# Read every column as character — floors are parsed explicitly below, and a
# category value like "0" must never be coerced to a number.
registry <- read_csv(reg_path, show_col_types = FALSE, col_types = cols(.default = "c"))
cat(sprintf("Registry: %s  (%d layers)\n", basename(reg_path), nrow(registry)))

# Optional subset for a dev/proof run (C2 proves the emitter on one row).
subset_env <- Sys.getenv("AMENITY_LAYERS", "")
if (nzchar(subset_env)) {
  want     <- str_trim(str_split(subset_env, ",")[[1]])
  registry <- registry |> filter(layer_id %in% want)
  cat(sprintf("Subset (AMENITY_LAYERS): %s\n", paste(registry$layer_id, collapse = ", ")))
  if (nrow(registry) == 0) stop("AMENITY_LAYERS matched no registry row.")
}

fetched_at <- format(Sys.Date(), "%Y-%m-%d")


# ============================================================
# 2 — Per-layer emit
# ============================================================
build_log <- list()
for (i in seq_len(nrow(registry))) {
  r <- registry[i, ]
  cat(sprintf("\n[%d/%d] %s  (data_id=%s, %s)\n",
              i, nrow(registry), r$layer_id, r$data_id, r$geometry_type))

  # 2a. fetch the PARENT via the shared helper. required_cols is NULL: the
  #     helper checks the RAW display-name header, but our registry uses the
  #     NORMALISED name — so the geometry-column presence is asserted below,
  #     AFTER normalisation (fail-closed). Floors: rows is the primary
  #     truncation guard; size (kb->mb) is the secondary.
  raw_path <- fetch_socrata_snapshot(
    dataset_id    = r$data_id,
    dest_dir      = file.path("data", "raw"),
    min_rows      = as.integer(r$min_rows),
    min_size_mb   = as.numeric(r$min_size_kb) / 1024,
    required_cols = NULL,
    filename_stem = r$layer_id
  )
  raw <- read_csv(raw_path, show_col_types = FALSE)
  names(raw) <- norm_names(names(raw))   # display headers -> canonical snake_case
  n_in <- nrow(raw)

  gcol <- r$geometry_column
  if (!gcol %in% names(raw)) {
    stop(sprintf("Layer %s: geometry column '%s' absent from the snapshot.",
                 r$layer_id, gcol))
  }

  # 2b. drop rows with no geometry — COUNTED for the coverage disclosure, never
  #     silently dropped (CLAUDE.md §9). (School Catchments carry ~14% blank.)
  gvals     <- as.character(raw[[gcol]])
  has_geom  <- !is.na(gvals) & nzchar(trimws(gvals))
  n_without <- sum(!has_geom)
  raw       <- raw[has_geom, , drop = FALSE]

  # 2c. keep only the registry's renderable columns (that exist) + geometry.
  keep <- str_trim(str_split(r$renderable_cols, "\\|")[[1]])
  keep <- intersect(keep, names(raw))
  raw  <- raw[, c(keep, gcol), drop = FALSE]

  # 2d. parse the WKT column -> sf, WGS84 (Socrata serves EPSG:4326; crs= sets it).
  layer_sf <- st_as_sf(raw, wkt = gcol, crs = 4326)

  # 2e. thin coordinates to 6 dp (~0.1 m, below web-zoom resolution) + emit.
  out_path <- file.path("output", paste0(r$layer_id, ".geojson"))
  if (file.exists(out_path)) file.remove(out_path)
  st_write(layer_sf, out_path, driver = "GeoJSON",
           layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)

  n_emit  <- nrow(layer_sf)
  emit_kb <- round(file.info(out_path)$size / 1024, 1)

  # Observed category domain + counts — drives the legend downstream (empty if the
  # layer has no category_field: a legal single-symbol layer). categories stays
  # ALPHABETICAL (stable legend order); the parallel counts let the frontend pick a
  # top-N + Other collapse for a domain that overflows the palette (rec_facilities).
  cats <- character(0); cnts <- integer(0)
  cf   <- r$category_field
  if (!is.na(cf) && nzchar(cf) && cf %in% names(layer_sf)) {
    vals    <- as.character(layer_sf[[cf]])
    present <- !is.na(vals) & nzchar(vals)
    cats    <- sort(unique(vals[present]))
    cnts    <- as.integer(table(factor(vals[present], levels = cats)))
  }

  cat(sprintf("   in=%d  emitted=%d  no_geometry=%d  %.1f KB  categories=%d\n",
              n_in, n_emit, n_without, emit_kb, length(cats)))

  build_log[[length(build_log) + 1L]] <- tibble(
    layer_id         = r$layer_id,
    file             = paste0(r$layer_id, ".geojson"),
    label            = r$label,
    geometry_type    = r$geometry_type,
    source_dataset   = r$data_id,
    category_field   = if (is.na(cf)) "" else cf,
    features_in      = n_in,
    features_emit    = n_emit,
    without_geometry = n_without,
    emit_kb          = emit_kb,
    categories       = paste(cats, collapse = "|"),
    category_counts  = paste(cnts, collapse = "|"),   # parallel to categories (alphabetical)
    fetched_at       = fetched_at
  )
}


# ============================================================
# 3 — Build log (03_emit_manifest reads this; NEVER the registry alone)
# ============================================================
log_df <- bind_rows(build_log)
write_csv(log_df, "output/_amenity_build_log.csv")
cat(sprintf("\nWrote output/_amenity_build_log.csv (%d layers)\n", nrow(log_df)))


# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["layers_emitted"]]   <- nrow(log_df)
RUN_METRICS[["features_total"]]   <- sum(log_df$features_emit)
RUN_METRICS[["without_geometry"]] <- sum(log_df$without_geometry)
RUN_METRICS[["geojson_total_kb"]] <- round(sum(log_df$emit_kb), 1)


cat("\n--- Amenity layer build summary ---\n")
print(log_df |> select(layer_id, features_in, features_emit, without_geometry, emit_kb),
      n = Inf)
cat(sprintf("Total emitted GeoJSON: %.1f MB across %d layer(s)\n",
            sum(log_df$emit_kb) / 1024, nrow(log_df)))
