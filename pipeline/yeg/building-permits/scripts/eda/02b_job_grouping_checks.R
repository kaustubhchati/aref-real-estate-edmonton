# ============================================================
# building-permits/scripts/eda/02b_job_grouping_checks.R
# Purpose: read-only diagnostics for the JOB_CATEGORY residential/commercial
#   grouping — the distribution / cross-tab / sanity views that used to live in
#   02a. Exploratory tier: prints to console, emits NO contract artifact.
#   These are how you SEE whether the curated split holds up against the data;
#   the production gate (does the mapping cover the data?) stays in 02a.
#
# Inputs (both reloaded from disk — standalone-safe, no in-session dependency):
#   - data/raw/General_Building_Permits_<date>.csv — newest snapshot,
#     discovered automatically (operator places the bulk CSV in data/raw/).
#   - data/reference/job_category_grouping_<date>.csv — newest grouping
#     (the §4.7 contract emitted by 02a_build_job_grouping.R).
#
# Outputs:
#   - none (console inspection only)
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/eda/02b_job_grouping_checks.R
# ============================================================

library(tidyverse)
library(scales)

# --- Reload inputs from disk --------------------------------
raw_candidates <- list.files(
  "data/raw", pattern = "^General_Building_Permits_.*\\.csv$",
  full.names = TRUE
)
if (length(raw_candidates) == 0) stop("No raw permits CSV in data/raw/")
snapshot_path <- sort(raw_candidates, decreasing = TRUE)[1]
cat("Using snapshot:", snapshot_path, "\n")
permits_raw <- read_csv(snapshot_path, show_col_types = FALSE)

grouping_files <- sort(list.files(
  "data/reference", pattern = "^job_category_grouping_\\d{8}\\.csv$",
  full.names = TRUE
))
if (length(grouping_files) == 0) {
  stop("No job_category_grouping_<YYYYMMDD>.csv in data/reference/. ",
       "Run 02a_build_job_grouping.R first.")
}
grouping_path <- tail(grouping_files, 1)
cat("Using grouping table:", basename(grouping_path), "\n")
job_category_grouping <- read_csv(grouping_path, show_col_types = FALSE)


# ============================================================
# 1 — Mapping echo
# ============================================================
cat("--- Mapping table ---\n")
job_category_grouping |>
  select(job_category, group, rationale) |>
  print(n = Inf, width = Inf)


# ============================================================
# 2 — Coverage: does the mapping line up with the data's categories?
# ============================================================
# (Print-only here. The PRODUCTION gate on this — stopifnot(setequal(...)) —
#  lives in 02a and is what actually blocks a bad write.)
cat("\n--- Mapping coverage (print-only; the gate is in 02a) ---\n")
data_cats <- permits_raw |> distinct(JOB_CATEGORY) |> pull(JOB_CATEGORY)
map_cats  <- job_category_grouping$job_category
cat("Categories in data:    ", length(data_cats), "\n")
cat("Categories in mapping: ", length(map_cats), "\n")
cat("In data, NOT in mapping (should be none):\n");  print(setdiff(data_cats, map_cats))
cat("In mapping, NOT in data (should be none):\n");  print(setdiff(map_cats, data_cats))
cat("Any duplicate category rows in mapping (should be 0):",
    sum(duplicated(job_category_grouping$job_category)), "\n")


# ============================================================
# 3 — Apply the mapping and inspect the split
# ============================================================
permits_grouped <- permits_raw |>
  left_join(job_category_grouping |> select(job_category, group),
            by = c("JOB_CATEGORY" = "job_category")) |>
  rename(job_group = group)

cat("\n--- Post-join: any unmapped rows? (print-only; gate is in 02a) ---\n")
cat(sum(is.na(permits_grouped$job_group)), "rows with NA job_group\n")


# --- The split, by ROWS -------------------------------------
cat("\n--- Row split residential vs commercial ---\n")
permits_grouped |>
  count(job_group) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  print()


# --- Each category's group + its size (the audit view) ------
cat("\n--- Every category, its group, and row count ---\n")
permits_grouped |>
  count(job_group, JOB_CATEGORY, sort = TRUE) |>
  group_by(job_group) |>
  mutate(group_total = sum(n)) |>
  ungroup() |>
  arrange(desc(group_total), desc(n)) |>
  print(n = Inf)


# --- Cross-tab vs BUILDING_TYPE: does the split hold up? -----
# For each group, the top building types. Residential should be dominated by
# houses; commercial by offices/retail/warehouses. If residential shows
# offices or commercial shows houses, a mapping row is wrong.
cat("\n--- Top BUILDING_TYPE within each group (sanity) ---\n")
for (g in c("residential", "commercial")) {
  cat("\n###", g, "\n")
  permits_grouped |>
    filter(job_group == g) |>
    count(BUILDING_TYPE, sort = TRUE) |>
    mutate(pct = percent(n / sum(n), 0.1)) |>
    slice_head(n = 10) |>
    print()
}


# --- Split among MAPPABLE rows only (what the map will show) -
# The no-coord rows don't render, so verify the split also looks sane
# restricted to rows that will actually be dots.
cat("\n--- Split among rows WITH coordinates (the rendered universe) ---\n")
permits_grouped |>
  mutate(has_coord = !is.na(LATITUDE) & !is.na(LONGITUDE)) |>
  filter(has_coord) |>
  count(job_group) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  print()
