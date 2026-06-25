# ============================================================
# building-permits/scripts/production/01a_build_job_grouping.R
# Purpose: build + persist the curated residential/commercial grouping
#   for the 12 JOB_CATEGORY values — a §4.7 curated mapping with provenance.
#   "job_group" takes "residential" or "commercial"; rationale/source explain
#   each assignment (evidence from the 01 eyeball checks).
#
# Inputs:
#   - the 12 JOB_CATEGORY values, curated in-script as a tribble (no file
#     read — the grouping is curator knowledge, not derived from the snapshot)
#
# Outputs:
#   - data/reference/job_category_grouping_<YYYYMMDD>.csv
#     columns: job_category, group, rationale, source, date_curated, curated_by
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/production/01a_build_job_grouping.R
# ============================================================

library(tidyverse)
library(scales)

ref_dir <- "data/reference"
dir.create(ref_dir, showWarnings = FALSE, recursive = TRUE)

# --- Load JOB_CATEGORY from the raw snapshot ----------------
# Read the snapshot directly (standalone-safe: no dependency on 01's session).
# Same newest-snapshot discovery 01 and 02 use — operator places the bulk
# General Building Permits CSV in data/raw/ before running. We need ONLY the
# JOB_CATEGORY column: this script CHECKS its hardcoded grouping covers the
# categories in the data; it does not derive the grouping. (The diagnostic
# views that needed BUILDING_TYPE / LAT-LONG moved to eda/02b, so the full
# frame is no longer required here.)
raw_candidates <- list.files(
  "data/raw", pattern = "^General_Building_Permits_.*\\.csv$",
  full.names = TRUE
)
if (length(raw_candidates) == 0) stop("No raw permits CSV in data/raw/")
snapshot_path <- sort(raw_candidates, decreasing = TRUE)[1]
cat("Using snapshot:", snapshot_path, "\n")
permits_raw <- read_csv(snapshot_path, col_select = "JOB_CATEGORY",
                        show_col_types = FALSE)


# ============================================================
# 1 — The curated mapping table
# ============================================================
# group: "residential" | "commercial"
# rationale: WHY this assignment (evidence from 01b checks where relevant)
# Every one of the 12 JOB_CATEGORY values must appear exactly once.
job_category_grouping <- tribble(
  ~job_category,                         ~group,         ~rationale,
  "Home Improvement",                    "residential",  "~96% on dwellings (80% Single Detached); descriptions = basements, garages, solar, suites. 01b Check 4.",
  "Single, Semi-detached & Rowhousing",  "residential",  "Category name is explicitly residential housing forms.",
  "House Combination",                   "residential",  "House permit bundle; residential by definition.",
  "Uncovered Deck Combination",          "residential",  "Decks are residential accessory work; 01b shows house building types.",
  "Accessory Building Combination",      "residential",  "94% Detached Garage; garages attach to dwellings. 01b bonus.",
  "Other Miscellaneous Building",        "residential",  "69% Single Detached + 15% garages = residential-dominant. 01b bonus.",
  "Mobile Home Move On",                 "residential",  "Mobile/manufactured home = a dwelling. JUDGEMENT CALL — review.",
  "Commercial Final",                    "commercial",   "Explicitly commercial.",
  "Commercial Footing / Foundation",     "commercial",   "Explicitly commercial.",
  "Commercial Demolition",               "commercial",   "Explicitly commercial.",
  "Commercial Structural Framing",       "commercial",   "Explicitly commercial.",
  "Commercial Excavation",               "commercial",   "Explicitly commercial."
) |>
  mutate(
    source       = "Curated from 01b_inspect_decisions.R composition checks (BUILDING_TYPE + JOB_DESCRIPTION distributions)",
    date_curated = as.character(Sys.Date()),
    curated_by   = "KC"
  )

# ============================================================
# 2 — Integrity GATE: the mapping must cover the data's categories
# ============================================================
# The diagnostic VIEW of this (per-category prints, cross-tabs, splits) lives
# in eda/02b_job_grouping_checks.R. Production keeps only the assertion that
# blocks a bad write.
data_cats <- permits_raw |> distinct(JOB_CATEGORY) |> pull(JOB_CATEGORY)
map_cats  <- job_category_grouping$job_category
stopifnot(setequal(data_cats, map_cats))


# ============================================================
# 3 — Apply the mapping — GATE: every row must map (no NA job_group)
# ============================================================
# Per-group splits / BUILDING_TYPE cross-tabs / mappable-row views moved to
# eda/02b_job_grouping_checks.R. Production keeps only the no-unmapped gate.
permits_grouped <- permits_raw |>
  left_join(job_category_grouping |> select(job_category, group),
            by = c("JOB_CATEGORY" = "job_category")) |>
  rename(job_group = group)
stopifnot(sum(is.na(permits_grouped$job_group)) == 0)


# ============================================================
# 4 — Persist the reference table (the §4.7 contract)
# ============================================================
out_path <- file.path(ref_dir,
                      sprintf("job_category_grouping_%s.csv",
                              format(Sys.Date(), "%Y%m%d")))
write_csv(job_category_grouping, out_path)
cat("\nWrote:", out_path, "\n")
cat("Columns: job_category, group, rationale, source, date_curated, curated_by\n")
