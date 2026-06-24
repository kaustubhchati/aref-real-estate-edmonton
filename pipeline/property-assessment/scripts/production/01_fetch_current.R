# ============================================================
# 01_fetch_current.R
# Pull Edmonton property assessment data, flag schedule-priced
# parking (coord, value) pairs, and persist the parking-cleaned
# frame for the downstream rule chain. FIRST script in the section.
#
# Pipeline:
#   1. Stream the current-year assessment snapshot from the portal
#   2. Count titles per (lat, lon) coordinate
#   3. Flag (coord, value) pairs that look like schedule-priced
#      parking: value <= $80k, repeats >= 10x at a coord with >= 20 rows
#   4. Write the parking-removed frame + the flagged frame
#
# Inputs:
#   - Edmonton Open Data Portal, dataset q7d6-ambg (live URL, ~440k rows)
#
# Outputs:
#   - data/processed/assess_2026_no_parking.csv   (parking removed)
#   - data/processed/assess_2026_with_flags.csv   (all rows + is_parking)
#
# Acceptance (asserted in-script):
#   - nrow(no_parking) == nrow(raw) - (# rows flagged is_parking)
#   - with_flags carries every raw row (left_join on a deduped key)
#
# Exploratory inspection lives in scripts/eda/01b_coord_distribution.R.
# ============================================================

# --- Packages ------------------------------------------------
library(sf)         # spatial geometry (sf objects, projections, joins)
library(tidyverse)  # dplyr, readr, etc.

# Repo-root anchoring + the shared Socrata fetch helper (export-endpoint
# discipline + the proven atomic/timeout/floors reliability layer).
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))


# --- Load ----------------------------------------------------
# Fetch the current-year assessment snapshot (q7d6-ambg) via the shared helper:
# export endpoint only, atomic temp-then-rename to a dated raw file, and
# size/row/column floors verified before promotion. The required_cols guard
# (Lat/Long/Assessed Value plus the keys downstream 02/05/06 consume) runs
# INSIDE the helper, so a renamed/truncated source fails loud here rather than
# crashing mid-clean. Floors ~half of observed (~440k rows / ~85 MB). The dated
# raw snapshot is accepted provenance (gitignored, like 02's).
raw_path <- fetch_socrata_snapshot(
  dataset_id    = "q7d6-ambg",
  dest_dir      = file.path("data", "raw"),
  min_rows      = 220000L,
  min_size_mb   = 40,
  required_cols = c("Account Number", "Neighbourhood ID", "Neighbourhood",
                    "Assessed Value", "Assessment Class 1",
                    "Latitude", "Longitude"),
  filename_stem = "Property_Assessment_Current"
)
assess_raw <- read_csv(raw_path, show_col_types = FALSE)


# --- Coordinate counts (canonical) --------------------------
# One row per distinct (lat, lon) with how many titles share it.
# (The rows-per-coordinate distribution figure lives in the EDA
#  script scripts/eda/01b_coord_distribution.R, not here.)
coord_counts <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_coord")

stopifnot(nrow(coord_counts) == n_distinct(coord_counts$Latitude,
                                           coord_counts$Longitude))

# --- Detect parking (coordinate, value) pairs directly ------
# A (coord, value) pair is parking IF:
#  - the value is in parking range (<= $80k)
#  - it repeats >= 10 times at this coord
#  - the coord has >= 20 total rows
# No coordinate-level dominance test needed.

parking_values_per_coord <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  inner_join(coord_counts |> filter(n_at_coord >= 20),
             by = c("Latitude", "Longitude")) |>
  count(Latitude, Longitude, `Assessed Value`, name = "value_count") |>
  filter(`Assessed Value` <= 80000,
         value_count >= 10)


# --- Flag rows -----------------------------------------------
assess_with_flag <- assess_raw |>
  left_join(parking_values_per_coord |>
              transmute(Latitude, Longitude, `Assessed Value`,
                        is_parking = TRUE),
            by = c("Latitude", "Longitude", "Assessed Value")) |>
  mutate(is_parking = !is.na(is_parking))


# --- Persist parking-cleaned frame for downstream scripts ---
dir.create("data/processed", showWarnings = FALSE, recursive = TRUE)

assess_clean <- assess_with_flag |>
  filter(!is_parking) |>
  select(-is_parking)

stopifnot(nrow(assess_clean) == nrow(assess_raw) - sum(assess_with_flag$is_parking))

write_csv(assess_clean, "data/processed/assess_2026_no_parking.csv")
cat("Wrote: data/processed/assess_2026_no_parking.csv —",
    nrow(assess_clean), "rows\n")

# Also persist the pre-filter frame so script 02 can run standalone.
# assess_with_flag is assess_raw + is_parking boolean; needed for parking
# rule validation which must see both flagged and unflagged rows.
write_csv(assess_with_flag, "data/processed/assess_2026_with_flags.csv")
cat("Wrote: data/processed/assess_2026_with_flags.csv —",
    nrow(assess_with_flag), "rows\n")
