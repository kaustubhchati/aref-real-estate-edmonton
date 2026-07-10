# ============================================================
# 01_build_permits.R   (Stage A — source -> raw -> clean -> frontend-ready)
#
# Purpose: ONE refresh-focused script. Pulls the current General Building
#   Permits snapshot, cleans + groups it, and writes the artifacts the
#   frontend consumes. No year literals, no hand-editing between years —
#   the refresh-by-design contract (CLAUDE.md refresh notes).
#
# Inputs:
#   - Edmonton Open Data, Socrata dataset 24uj-dj8v — streamed via
#     download.file() to data/raw/ (dated name). This is the legitimate
#     refresh fetch; 01 streams its own snapshot (no pre-placed file needed).
#   - latest data/reference/job_category_grouping_<date>.csv (from 01a)
#
# Outputs:
#   - output/permits.geojson             (mappable points — Stage B -> PMTiles)
#   - output/permits_coverage.csv        (per-year mapped / no-coord / no-value)
#   - output/permits_category_counts.csv (per-(year, category) counts)
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/production/01_build_permits.R
#
# Pipeline:
#   1. Download Socrata bulk CSV (dataset 24uj-dj8v) -> data/raw/ (dated name)
#   2. Parse CONSTRUCTION_VALUE to numeric; flag coords + value
#   3. Join the curated residential/commercial grouping (latest in reference/)
#   4. Emit the output artifacts listed above + the per-year served point files
#
# The point map is served as per-year GeoJSON (one file per year, thinned), built
# in section 4b2 below and published by the runner handoff — no tiling step. (The
# old tippecanoe -> PMTiles -> R2 path was retired once the per-year GeoJSON model
# landed; see git history if a high-fidelity local tile is ever wanted again.)
#
# Inputs:
#   - Edmonton Open Data, dataset 24uj-dj8v (streamed; no local input needed)
#   - data/reference/job_category_grouping_*.csv  (latest is globbed)
#
# Outputs (fixed names — frontend points at stable URLs):
#   - data/raw/General_Building_Permits_<YYYYMMDD>.csv
#   - output/permits.geojson
#   - output/permits_coverage.csv
#   - output/permits_category_counts.csv
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

# Repo-root anchoring + the shared Socrata fetch helper (export-endpoint
# discipline + the proven atomic/timeout/floors reliability layer).
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))

dir.create("data/raw", showWarnings = FALSE, recursive = TRUE)
dir.create("output",   showWarnings = FALSE, recursive = TRUE)


# ============================================================
# 1 — Source -> raw  (via the shared Socrata fetch helper)
# ============================================================
# All Socrata bulk fetches go through fetch_socrata_snapshot(): export endpoint
# only (never the 1000-row-capped /resource/ API), atomic temp-then-rename, and
# size/row/column floors checked on the temp before promotion. Dataset 24uj-dj8v
# serves the full all-years bulk download. filename_stem keeps the existing
# on-disk name (General_Building_Permits_<YYYYMMDD>.csv) that 03 globs.
# Observed baseline (General_Building_Permits_20260529.csv): 241,131 rows, ~107 MB;
# floors set to ~half — a backup truncation guard behind the atomic write.
raw_path <- fetch_socrata_snapshot(
  dataset_id    = "24uj-dj8v",
  dest_dir      = file.path("data", "raw"),
  min_rows      = 120000L,
  min_size_mb   = 50,
  required_cols = c("Row ID", "YEAR", "JOB_CATEGORY", "JOB_DESCRIPTION",
                    "BUILDING_TYPE", "WORK_TYPE", "CONSTRUCTION_VALUE",
                    "ADDRESS", "LATITUDE", "LONGITUDE"),
  filename_stem = "General_Building_Permits"
)

permits_raw <- read_csv(raw_path, show_col_types = FALSE)
cat(sprintf("Loaded %s rows, %s columns\n",
            comma(nrow(permits_raw)), ncol(permits_raw)))


# ============================================================
# 2 — Clean
# ============================================================
# Parse "$58,131" -> 58131. Strip $ and commas, then numeric. Verified in
# 01b: this parse never fails on a non-NA value (0 newly-failed rows).
permits_clean <- permits_raw |>
  mutate(
    construction_value = CONSTRUCTION_VALUE |>
      str_remove_all("[$,]") |>
      str_trim() |>
      as.numeric(),
    has_coord = !is.na(LATITUDE) & !is.na(LONGITUDE),
    # "has value" means a positive number to size a dot by. 0 and NA both
    # count as no-value (smallest dot, value shown as "—" in the popup).
    has_value = !is.na(construction_value) & construction_value > 0
  )

# Snake_case the fields the frontend will read; drop everything dead.
# Dropped: PERMIT_NUMBER (100% NA), COUNT (always 1), BIA (96% NA),
#          Occupancy Date (90% NA), LOCATION / Geometry Point (redundant with
#          LAT/LON), NEIGHBOURHOOD* (different universe from our polygons —
#          dropped as a filter per the locked decision),
#          REPORT_PERMIT_DATE, LEGAL_DESCRIPTION, ZONING, FLOOR_AREA.
# Kept for the map: month_number (drives the month filter), job_description and
#          units_added (popup detail / future use). These three ride alongside
#          the original set into the tile (see the -y allowlist below).
permits_tidy <- permits_clean |>
  transmute(
    row_id             = `Row ID`,
    year               = as.integer(YEAR),
    month_number       = as.integer(MONTH_NUMBER),
    job_category       = JOB_CATEGORY,
    job_description    = JOB_DESCRIPTION,
    building_type      = BUILDING_TYPE,
    work_type          = WORK_TYPE,
    construction_value = construction_value,
    units_added        = UNITS_ADDED,
    address            = ADDRESS,
    latitude           = LATITUDE,
    longitude          = LONGITUDE,
    has_coord          = has_coord,
    has_value          = has_value
  )


# ============================================================
# 3 — Join the curated residential/commercial grouping
# ============================================================
# Glob the latest grouping table so a future refresh needs NO edit here.
# The contract is versioned by date in the filename (CLAUDE.md §4.4).
grouping_files <- sort(list.files(
  "data/reference",
  pattern = "^job_category_grouping_\\d{8}\\.csv$",
  full.names = TRUE
))
if (length(grouping_files) == 0) {
  stop("No job_category_grouping_<YYYYMMDD>.csv in data/reference/. ",
       "Run 01a_build_job_grouping.R first.")
}
grouping_path <- tail(grouping_files, 1)   # most recent by date-sorted name
cat("Using grouping table:", basename(grouping_path), "\n")

grouping <- read_csv(grouping_path, show_col_types = FALSE) |>
  select(job_category, job_group = group)

permits_grouped <- permits_tidy |>
  left_join(grouping, by = "job_category")

# Refresh safety net: if the City ever adds a category not in the grouping
# table, it lands here as NA — fail loudly so a human curates it rather than
# the map silently mis-colouring or dropping rows (CLAUDE.md §4.7).
n_unmapped <- sum(is.na(permits_grouped$job_group))
if (n_unmapped > 0) {
  unmapped <- permits_grouped |>
    filter(is.na(job_group)) |>
    count(job_category, sort = TRUE)
  print(unmapped)
  stop(n_unmapped, " rows have a job_category not in the grouping table ",
       "(see above). Add the new category to a new ",
       "job_category_grouping_<today>.csv in data/reference/ and re-run.")
}


# ============================================================
# 4a — Coverage table (per-year mapped / no-coord / no-value)
# ============================================================
# The map renders only has_coord rows. This table is how the frontend tells
# the user honestly: "N permits this year aren't on the map (no coordinates
# yet)." The no-coord share spikes in recent years (City geocoding lag), so
# this surface is REQUIRED, not cosmetic — verified in 01b Check 1.
coverage <- permits_grouped |>
  group_by(year) |>
  summarise(
    n_total    = n(),
    n_mapped   = sum(has_coord),
    n_no_coord = sum(!has_coord),
    n_no_value = sum(has_coord & !has_value),   # mappable but unsizable
    .groups = "drop"
  ) |>
  mutate(pct_no_coord = round(n_no_coord / n_total, 4)) |>
  arrange(year)

write_csv(coverage, "output/permits_coverage.csv")
cat("\nWrote output/permits_coverage.csv\n")
print(coverage, n = Inf)


# ============================================================
# 4b — Frontend-ready GeoJSON (mappable points only)
# ============================================================
# Only has_coord rows become features. construction_value stays raw numeric
# (NA for no-value rows) — the frontend style file owns the value->radius
# transform (log/quantile), exactly as choroplethStyle.js owns the colour
# ramp. We do NOT bake styling into the data.
points <- permits_grouped |>
  filter(has_coord) |>
  select(row_id, year, month_number, job_category, job_group,
         construction_value, building_type, work_type,
         job_description, units_added, address,
         longitude, latitude)

cat(sprintf("\nMappable points: %s of %s rows\n",
            comma(nrow(points)), comma(nrow(permits_grouped))))

permits_sf <- st_as_sf(points,
                       coords = c("longitude", "latitude"),
                       crs = 4326)

geojson_path <- "output/permits.geojson"
if (file.exists(geojson_path)) file.remove(geojson_path)
st_write(permits_sf, geojson_path, driver = "GeoJSON", quiet = TRUE)

geojson_mb <- file.info(geojson_path)$size / 1024 / 1024
cat(sprintf("Wrote %s (%.1f MB, %s features)\n",
            geojson_path, geojson_mb, comma(nrow(points))))


# ============================================================
# 4b2 — Served points artifacts (one GeoJSON PER YEAR)
# ============================================================
# WHY: the point map is being standardized OFF PMTiles onto the per-year GeoJSON
# model the BP neighbourhood choropleth already uses — one file per year, the
# slider swaps the source (setData) on a year change. PER YEAR, not one all-years
# file, because the all-years points are ~105 MB — over Cloudflare Pages' 25 MiB
# per-file cap (STRUCTURE_UPDATE.md: dense layers never ship as one inline
# GeoJSON, which is exactly why the point map was a PMTiles on R2). Each year is
# ~3-7 MB, comfortably under the cap, and ~12-16k features keeps the browser light.
#
# Each file is the same mappable points as permits.geojson above, THINNED:
#   * coordinates rounded to 6 dp (~0.1 m, below any web-zoom resolution) via the
#     GeoJSON driver's COORDINATE_PRECISION layer option, and
#   * properties pruned to the eight the frontend renders (`year` kept so the
#     filter/legend can read it; the rest drive paint / popup / month + value
#     filters). row_id, job_category and units_added are dropped — the point map
#     reads none (job_category and units_added are choropleth/aggregate fields).
# permits.geojson above is now a full-detail LOCAL archive (all 11 props, full
# precision) — no longer tiled (the tippecanoe/PMTiles/R2 path is retired). The
# runner publishes these per-year files to website/public via the _whirl.yaml GLOB
# handoff — the point map's served artifacts (it was a hand-built PMTiles on R2
# before). No year literals: the loop iterates the years PRESENT in the data; the
# slider reads the same {years, defaultYear} manifest 03 emits.
points_dir <- "output/permit_points"
if (dir.exists(points_dir)) unlink(points_dir, recursive = TRUE)
dir.create(points_dir, showWarnings = FALSE)

served_cols <- c("year", "month_number", "job_group", "construction_value",
                 "building_type", "work_type", "job_description", "address")
point_years <- sort(unique(permits_sf$year))
for (yr in point_years) {
  one_year  <- permits_sf[permits_sf$year == yr, served_cols]
  out_year  <- file.path(points_dir, sprintf("permit_points_%d.geojson", yr))
  st_write(one_year, out_year, driver = "GeoJSON",
           layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)
}
cat(sprintf("Wrote %d per-year point files to %s/ (%s..%s, %s features total)\n",
            length(point_years), points_dir,
            min(point_years), max(point_years), comma(nrow(permits_sf))))


# ============================================================
# 4c — Per-(year, job_category) counts (frontend empty-state)
# ============================================================
# WHY: several job_category values are legacy taxonomy with GENUINELY ZERO
# permits in recent years. The frontend's year × category filter can land on
# such a pair and render an empty map; this table lets it say "No permits in
# this category for <year>" — distinguishing a real empty selection from a
# broken one. Counted from permits_grouped (ALL permits), not the mapped subset:
# whether the category exists that year is independent of whether rows have
# coordinates. count() emits only pairs that occur (n > 0); the frontend treats
# any absent pair as zero. No year/category literals — both come from the data.
category_counts <- permits_grouped |>
  count(year, job_category, name = "n") |>
  arrange(year, desc(n))

write_csv(category_counts, "output/permits_category_counts.csv")
cat(sprintf("\nWrote output/permits_category_counts.csv (%s pairs)\n",
            comma(nrow(category_counts))))


# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["total_rows"]]        <- nrow(permits_grouped)
RUN_METRICS[["mapped_points"]]     <- nrow(points)
RUN_METRICS[["not_mapped"]]        <- sum(!permits_grouped$has_coord)
RUN_METRICS[["point_years"]]       <- length(point_years)
RUN_METRICS[["category_pairs"]]    <- nrow(category_counts)
RUN_METRICS[["points_geojson_mb"]] <- round(geojson_mb, 1)


# ============================================================
# Run summary
# ============================================================
cat("\n--- Run summary ---\n")
cat(sprintf("Raw snapshot:   %s\n", raw_path))
cat(sprintf("Grouping table: %s\n", basename(grouping_path)))
cat(sprintf("Total rows:     %s\n", comma(nrow(permits_grouped))))
cat(sprintf("Mapped points:  %s (%.1f%%)\n",
            comma(nrow(points)),
            100 * nrow(points) / nrow(permits_grouped)))
cat(sprintf("Not mapped:     %s (no coordinates)\n",
            comma(sum(!permits_grouped$has_coord))))
cat(sprintf("Category pairs: %s -> output/permits_category_counts.csv\n",
            comma(nrow(category_counts))))