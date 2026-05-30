# ============================================================
# 02_build_permits.R   (Stage A — source -> raw -> clean -> frontend-ready)
#
# ONE refresh-focused script. Run it once per refresh; it pulls the current
# General Building Permits snapshot, cleans + groups it, and writes the two
# artifacts the frontend consumes. No year literals, no hand-editing between
# years — that is the refresh-by-design contract (CLAUDE.md refresh notes).
#
# Run from the building-permits RProj (working dir = pipeline/building-permits/).
#
# Pipeline:
#   1. Download Socrata bulk CSV (dataset 24uj-dj8v) -> data/raw/ (dated name)
#   2. Parse CONSTRUCTION_VALUE to numeric; flag coords + value
#   3. Join the curated residential/commercial grouping (latest in reference/)
#   4. Emit output/permits.geojson      (mappable points only — Stage B -> PMTiles)
#      Emit output/permits_coverage.csv (per-year mapped / no-coord / no-value)
#
# Stage B (separate, documented): tippecanoe turns the GeoJSON into PMTiles.
#
# Inputs:
#   - Edmonton Open Data, dataset 24uj-dj8v (streamed; no local input needed)
#   - data/reference/job_category_grouping_*.csv  (latest is globbed)
#
# Outputs (fixed names — frontend points at stable URLs):
#   - data/raw/General_Building_Permits_<YYYYMMDD>.csv
#   - output/permits.geojson
#   - output/permits_coverage.csv
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

dir.create("data/raw", showWarnings = FALSE, recursive = TRUE)
dir.create("output",   showWarnings = FALSE, recursive = TRUE)


# ============================================================
# 1 — Source -> raw
# ============================================================
# Socrata bulk endpoint serves the full dataset (all years). Dataset id
# 24uj-dj8v is permanent; the URL always returns the City's latest snapshot.
# No year filter exists on the bulk download — we get every year and that's
# what we want (ship all, per the locked decision).
dataset_id  <- "24uj-dj8v"
source_url  <- sprintf(
  "https://data.edmonton.ca/api/views/%s/rows.csv?accessType=DOWNLOAD",
  dataset_id
)

# Dated raw filename preserves refresh history (and data/raw is gitignored).
raw_path <- file.path("data", "raw",
                      sprintf("General_Building_Permits_%s.csv",
                              format(Sys.Date(), "%Y%m%d")))

if (!file.exists(raw_path)) {
  cat("Downloading", dataset_id, "->", raw_path, "\n")
  cat("(full dataset, ~60 MB, expect 30-90s)\n")
  download.file(source_url, destfile = raw_path, mode = "wb", quiet = FALSE)
} else {
  cat("Raw snapshot for today already exists, reusing:\n  ", raw_path, "\n")
}

permits_raw <- read_csv(raw_path, show_col_types = FALSE)
cat(sprintf("Loaded %s rows, %s columns\n",
            comma(nrow(permits_raw)), ncol(permits_raw)))

# Refresh guard: the cleaning below assumes specific column names. If the City
# renames a column, fail loudly here rather than producing a silently-wrong map.
required_cols <- c("Row ID", "YEAR", "JOB_CATEGORY", "JOB_DESCRIPTION",
                   "BUILDING_TYPE", "WORK_TYPE", "CONSTRUCTION_VALUE",
                   "ADDRESS", "LATITUDE", "LONGITUDE")
missing_cols <- setdiff(required_cols, names(permits_raw))
if (length(missing_cols) > 0) {
  stop("Source schema changed — missing expected columns: ",
       paste(missing_cols, collapse = ", "),
       "\n  Inspect the new file and update 02_build_permits.R before shipping.")
}


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
#          dropped as a filter per the locked decision), MONTH_NUMBER,
#          REPORT_PERMIT_DATE, LEGAL_DESCRIPTION, ZONING, FLOOR_AREA,
#          UNITS_ADDED (not used by this map).
permits_tidy <- permits_clean |>
  transmute(
    row_id             = `Row ID`,
    year               = as.integer(YEAR),
    job_category       = JOB_CATEGORY,
    job_description    = JOB_DESCRIPTION,
    building_type      = BUILDING_TYPE,
    work_type          = WORK_TYPE,
    construction_value = construction_value,
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
       "Run 02a_build_job_grouping.R first.")
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
  select(row_id, year, job_category, job_group, construction_value,
         building_type, work_type, address, longitude, latitude)

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
cat("\nNext (Stage B): tippecanoe output/permits.geojson -> output/permits.pmtiles\n")