# ============================================================
# 01_build_zoning.R   (zoning — base zones, grouped to families)
# ------------------------------------------------------------
# CONTRACT: fetch the Zoning Bylaw geographical data (Socrata fixa-tstc — the
#   PARENT of the ruwn-htv8 portal lens), parse the WKT polygons, GROUP the 156
#   nominal zone codes into ~10 legible families via a curated, dated crosswalk,
#   thin, and emit output/zoning_bylaw.geojson. Zoning is a NOMINAL-CLASS polygon
#   layer, not a value choropleth — the map fills by `zone_family`.
#
# THE n_unmapped STOP IS THE POINT OF THIS SCRIPT (CLAUDE.md §4.7, same shape as
#   building-permits' job_category guard): a zone code not in the crosswalk HALTS
#   the run loudly, so a Zoning Bylaw amendment (a new code) is curated by a human
#   rather than silently mis-coloured or dropped. The crosswalk is human-gated
#   curation (§4.6) — see data/reference/README_zoning_crosswalk.md.
#
# Crosswalk: data/reference/zoning_family_crosswalk_<YYYYMMDD>.csv (newest by glob).
# Inputs:   Edmonton Open Data fixa-tstc, via fetch_socrata_snapshot.
# Outputs:  output/zoning_bylaw.geojson
#           output/_log_zoning_bylaw.csv   (per-layer counts + currency, for 03)
# Run: from the section dir, Rscript scripts/production/01_build_zoning.R
# ============================================================

library(tidyverse)
library(sf)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))

dir.create("data/raw", showWarnings = FALSE, recursive = TRUE)
dir.create("output",   showWarnings = FALSE, recursive = TRUE)

# --- Source dataset + floors (single-source section, like building-permits) ---
DATA_ID     <- "fixa-tstc"           # parent of the ruwn-htv8 portal lens
GEOM_COL    <- "geometry_multipolygon"
MIN_ROWS    <- 5000L                 # ~half the ~11.5k observed (truncation guard)
MIN_SIZE_MB <- 2                     # secondary guard; rows is primary

# Normalise the CSV-export display header to snake_case (same rule as amenities;
# fixa-tstc already exports lowercase field names, so this is identity here, but
# keeps the script robust to a display-name change).
norm_names <- function(x) {
  x <- tolower(x)
  x <- gsub("[^a-z0-9]+", "_", x)
  gsub("^_+|_+$", "", x)
}

# ============================================================
# 1 — Fetch + parse
# ============================================================
raw_path <- fetch_socrata_snapshot(
  dataset_id    = DATA_ID,
  dest_dir      = file.path("data", "raw"),
  min_rows      = MIN_ROWS,
  min_size_mb   = MIN_SIZE_MB,
  required_cols = NULL,               # geometry asserted post-normalisation
  filename_stem = "zoning_bylaw"
)
raw <- read_csv(raw_path, show_col_types = FALSE)
names(raw) <- norm_names(names(raw))
n_in <- nrow(raw)
if (!GEOM_COL %in% names(raw)) {
  stop(sprintf("Zoning: geometry column '%s' absent from the snapshot.", GEOM_COL))
}

# Drop rows with no geometry (counted, never silently dropped — CLAUDE.md §9).
gvals     <- as.character(raw[[GEOM_COL]])
has_geom  <- !is.na(gvals) & nzchar(trimws(gvals))
n_without <- sum(!has_geom)
raw       <- raw[has_geom, , drop = FALSE]

# ============================================================
# 2 — Group 156 codes -> families via the curated crosswalk (the n_unmapped stop)
# ============================================================
xw_files <- sort(list.files(
  "data/reference",
  pattern = "^zoning_family_crosswalk_\\d{8}\\.csv$", full.names = TRUE
))
if (length(xw_files) == 0) {
  stop("No zoning_family_crosswalk_<YYYYMMDD>.csv in data/reference/.")
}
xw_path <- tail(xw_files, 1)
xw <- read_csv(xw_path, show_col_types = FALSE, col_types = cols(.default = "c"))
cat(sprintf("Crosswalk: %s  (%d codes)\n", basename(xw_path), nrow(xw)))
if ("status" %in% names(xw) && any(xw$status != "RATIFIED")) {
  message("NOTE: crosswalk is PROPOSED (not yet RATIFIED) — families are provisional ",
          "until KC ratifies (README_zoning_crosswalk.md).")
}

zoned <- raw |>
  left_join(xw |> select(zoning, zone_family = family), by = "zoning")

# THE GUARD: any zone code absent from the crosswalk halts the run loudly.
n_unmapped <- sum(is.na(zoned$zone_family))
if (n_unmapped > 0) {
  unmapped <- zoned |> filter(is.na(zone_family)) |> count(zoning, sort = TRUE)
  print(unmapped)
  stop(n_unmapped, " polygon(s) carry a zoning code not in the crosswalk (see above). ",
       "The City amended the Zoning Bylaw — add the new code(s) to a new ",
       "zoning_family_crosswalk_<today>.csv (family sourced from the bylaw) and re-run.")
}

# ============================================================
# 3 — Keep renderable columns + geometry; parse WKT; thin; emit
# ============================================================
keep     <- intersect(c("id", "zoning", "description", "dc2_sub_area", "zone_family"),
                      names(zoned))
zoned    <- zoned[, c(keep, GEOM_COL), drop = FALSE]
zoning_sf <- st_as_sf(zoned, wkt = GEOM_COL, crs = 4326)

out_path <- "output/zoning_bylaw.geojson"
if (file.exists(out_path)) file.remove(out_path)
st_write(zoning_sf, out_path, driver = "GeoJSON",
         layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)

n_emit   <- nrow(zoning_sf)
emit_kb  <- round(file.info(out_path)$size / 1024, 1)
families <- sort(unique(zoning_sf$zone_family))

# ============================================================
# 4 — Build log (03_emit_manifest reads output/_log_*.csv)
# ============================================================
tibble(
  layer_id         = "zoning_bylaw",
  file             = "zoning_bylaw.geojson",
  label            = "Zoning Bylaw",
  geometry_type    = "multipolygon",
  source_dataset   = DATA_ID,
  category_field   = "zone_family",
  features_in      = n_in,
  features_emit    = n_emit,
  without_geometry = n_without,
  emit_kb          = emit_kb,
  categories       = paste(families, collapse = "|"),
  fetched_at       = format(Sys.Date(), "%Y-%m-%d")
) |> write_csv("output/_log_zoning_bylaw.csv")

# --- Run metrics (Tier 0) ----------------------------------------------------
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["zoning_polygons"]] <- n_emit
RUN_METRICS[["zone_families"]]   <- length(families)
RUN_METRICS[["without_geometry"]] <- n_without
RUN_METRICS[["emit_kb"]]         <- emit_kb

cat(sprintf("\nZoning: in=%d emitted=%d no_geometry=%d  %.1f KB  families=%d\n",
            n_in, n_emit, n_without, emit_kb, length(families)))
cat("Families:", paste(families, collapse = ", "), "\n")
