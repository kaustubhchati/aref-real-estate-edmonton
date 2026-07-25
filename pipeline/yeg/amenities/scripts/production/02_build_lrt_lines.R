# ============================================================
# 02_build_lrt_lines.R   (amenities — LRT route lines, Family N)
# ------------------------------------------------------------
# CONTRACT: emit the LRT ROUTE-LINE geometry so the Public Transportation map reads as a
#   NETWORK, not loose station dots (D3). Source: the ETS GTFS Route Shapes (Socrata
#   7f8n-igfx — the DEDUPLICATED line source; the Trips dataset ctwr-tvrd carries the same
#   geometry one-row-per-trip at 250 MB and is the WRONG source, recon correction 2026-07-25).
#   The feed carries LRT (route_type=0: Capital 021R, Metro 022R, Valley 023R) — §4 gate.
#
# LINE COLOUR is HAND-ASSIGNED from Edmonton's official system map into a dated, sourced
#   crosswalk (data/reference/lrt_line_colours_<date>.csv) — the GTFS feed does NOT publish
#   route_color (the halo-directive A4 claim was withdrawn; D3 remedy). The crosswalk's hexes
#   are flagged APPROXIMATE — verify against the official map (a one-line edit if wrong).
#
# Inputs:  Edmonton Open Data 7f8n-igfx via fetch_socrata_snapshot; the colours crosswalk.
# Output:  output/lrt_lines.geojson  (route_id · line · colour · shape_id + MultiLineString)
# Run: from the section dir, Rscript scripts/production/02_build_lrt_lines.R
# ============================================================

library(tidyverse)
library(sf)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))

dir.create("data/raw", showWarnings = FALSE, recursive = TRUE)
dir.create("output",   showWarnings = FALSE, recursive = TRUE)

DATA_ID  <- "7f8n-igfx"          # ETS GTFS Route Shapes (line geometry)
GEOM_COL <- "geometry_line"

norm_names <- function(x) { x <- tolower(x); x <- gsub("[^a-z0-9]+", "_", x); gsub("^_+|_+$", "", x) }

# --- Colours crosswalk (newest dated; sourced to the system map) ------------
xw_files <- sort(list.files("data/reference", pattern = "^lrt_line_colours_\\d{8}\\.csv$", full.names = TRUE))
if (length(xw_files) == 0) stop("No lrt_line_colours_<YYYYMMDD>.csv in data/reference/.")
xw <- read_csv(tail(xw_files, 1), show_col_types = FALSE)
cat(sprintf("Colours: %s  (%d LRT routes)\n", basename(tail(xw_files, 1)), nrow(xw)))

# --- Fetch the route shapes (whole dataset; we filter to the LRT routes) -----
raw_path <- fetch_socrata_snapshot(
  dataset_id = DATA_ID, dest_dir = file.path("data", "raw"),
  min_rows = 100L, min_size_mb = 0.5, required_cols = NULL, filename_stem = "lrt_route_shapes"
)
raw <- read_csv(raw_path, show_col_types = FALSE)
names(raw) <- norm_names(names(raw))
if (!GEOM_COL %in% names(raw)) stop(sprintf("Route shapes: geometry column '%s' absent.", GEOM_COL))

# --- Filter to the LRT routes + join line + colour --------------------------
lrt <- raw |>
  filter(route_id %in% xw$route_id) |>
  left_join(xw |> select(route_id, line, colour), by = "route_id")

n_unmatched <- sum(is.na(lrt$colour))
if (n_unmatched > 0) stop(n_unmatched, " LRT shape(s) have a route_id not in the colours crosswalk.")
if (nrow(lrt) == 0) stop("No LRT shapes matched the crosswalk route_ids — the feed schema may have changed.")

# drop rows with no geometry (counted), keep the render fields + geometry, parse WKT, thin
gvals <- as.character(lrt[[GEOM_COL]])
lrt   <- lrt[!is.na(gvals) & nzchar(trimws(gvals)), , drop = FALSE]
keep  <- intersect(c("route_id", "line", "colour", "shape_id"), names(lrt))
lrt   <- lrt[, c(keep, GEOM_COL), drop = FALSE]
lrt_sf <- st_as_sf(lrt, wkt = GEOM_COL, crs = 4326)

out_path <- "output/lrt_lines.geojson"
if (file.exists(out_path)) file.remove(out_path)
st_write(lrt_sf, out_path, driver = "GeoJSON", layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)
emit_kb <- round(file.info(out_path)$size / 1024, 1)

if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["lrt_shapes"]] <- nrow(lrt_sf)
RUN_METRICS[["lrt_lines_kb"]] <- emit_kb

cat(sprintf("\nLRT lines: %d shapes across %d lines  %.1f KB\n",
            nrow(lrt_sf), length(unique(lrt_sf$line)), emit_kb))
print(lrt_sf |> st_drop_geometry() |> count(line))
