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

# Edmonton has a REAL zone code "NA" (Natural Areas — 99 polygons). readr's default
# na strings coerce both that code AND a blank cell to R NA, and left_join matches
# NA to NA — so a blank code would silently inherit Natural Areas' family instead of
# tripping the guard (fail-open). Re-read ONLY the code column with NA disabled and
# splice it in by row order: "NA" survives as a literal join key, while a genuinely
# blank code stays "" — unmapped — and halts at the guard below.
zoning_literal <- read_csv(raw_path, col_select = "zoning",
                           col_types = cols(zoning = "c"), na = character(),
                           show_col_types = FALSE)$zoning
stopifnot(length(zoning_literal) == nrow(raw))
raw$zoning <- trimws(zoning_literal)

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
# na = character(): the crosswalk's "NA" row (Natural Areas) must survive as a
# literal code, matching the literal re-read of the raw side above.
xw <- read_csv(xw_path, show_col_types = FALSE, col_types = cols(.default = "c"),
               na = character())
cat(sprintf("Crosswalk: %s  (%d codes)\n", basename(xw_path), nrow(xw)))
if ("status" %in% names(xw) && any(xw$status != "RATIFIED")) {
  message("NOTE: crosswalk is PROPOSED (not yet RATIFIED) — families are provisional ",
          "until KC ratifies (README_zoning_crosswalk.md).")
}
# Crosswalk sanity (fail-closed): every row needs a non-blank code + family, and
# codes must be unique — a malformed crosswalk halts here, never mis-joins.
if (any(!nzchar(trimws(xw$zoning))) || any(!nzchar(trimws(xw$family)))) {
  stop("Crosswalk has blank zoning/family cells — fix the crosswalk CSV.")
}
if (anyDuplicated(xw$zoning) > 0) {
  stop("Crosswalk has duplicate zoning codes — fix the crosswalk CSV.")
}

# na_matches = "never": belt-and-braces — with literal keys neither side carries
# R NA, but "never" guarantees a missing key can only ever fall to the guard.
zoned <- raw |>
  left_join(xw |> select(zoning, zone_family = family), by = "zoning",
            na_matches = "never")

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
# Per-family polygon counts, aligned with `families` (both alphabetical) — the
# manifest's categoryCounts, so the legend can order families by count.
fam_counts <- zoning_sf |> st_drop_geometry() |> count(zone_family) |> arrange(zone_family)

# ============================================================
# 3b — Family-boundary dissolve (the z12–14 rung of the zoom ladder,
#      docs/design/zoning_zoom_ladder_three_states.svg): one MULTILINESTRING per
#      family — the outline of each family's merged mass. Parcel edges WITHIN a
#      family disappear in the union, so the frontend can draw between-family
#      boundaries at district zoom without drawing every parcel edge.
# ============================================================
bnd_path <- "output/zoning_family_boundaries.geojson"
# The union runs in a PLANAR CRS (UTM 12N — Edmonton's zone): the source data has
# self-crossing loops that s2's spherical validity rejects even after a planar
# st_make_valid, and a city-scale dissolve is a planar operation anyway. Transform
# back to 4326 for the emit.
fam_bounds <- zoning_sf |>
  st_transform(32612) |>
  st_make_valid() |>
  # make_valid can return GEOMETRYCOLLECTIONs (polygon + sliver line/point parts);
  # keep only the polygonal parts — st_boundary rejects collections.
  st_collection_extract("POLYGON") |>
  group_by(zone_family) |>
  summarise(.groups = "drop") |>
  st_boundary() |>
  st_transform(4326)
if (file.exists(bnd_path)) invisible(file.remove(bnd_path))
st_write(fam_bounds, bnd_path, driver = "GeoJSON",
         layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)
bnd_kb <- round(file.info(bnd_path)$size / 1024, 1)

# ============================================================
# 4 — Build log (03_emit_manifest reads output/_log_*.csv)
# ============================================================
tibble(
  layer_id         = c("zoning_bylaw", "zoning_family_boundaries"),
  file             = c("zoning_bylaw.geojson", "zoning_family_boundaries.geojson"),
  label            = c("Zoning Bylaw", "Zoning Family Boundaries"),
  geometry_type    = c("multipolygon", "multilinestring"),
  source_dataset   = DATA_ID,
  category_field   = c("zone_family", ""),
  features_in      = c(n_in, n_emit),
  features_emit    = c(n_emit, nrow(fam_bounds)),
  without_geometry = c(n_without, 0L),
  emit_kb          = c(emit_kb, bnd_kb),
  categories       = c(paste(families, collapse = "|"), ""),
  category_counts  = c(paste(fam_counts$n, collapse = "|"), ""),
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
