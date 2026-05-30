# ============================================================
# building-permits/scripts/02a_build_job_grouping.R
# Builds + applies the residential/commercial grouping for JOB_CATEGORY.
#
# Output: a reference CSV in data/reference/ with the contract:
#   - filename: job_category_grouping_<YYYYMMDD>.csv
#   - columns: job_category, group, rationale, source, date_curated, curated_by
# The grouping is a curated mapping from the 12 JOB_CATEGORY values to a new
# "job_group" column with values "residential" or "commercial". The rationale column
# explains the reasoning behind each assignment, with evidence from the 01b checks. The source
# column documents where the curator got the information (e.g. which 01b check). The date_curated
# and curated_by columns are for provenance.    

library(tidyverse)
library(scales)

ref_dir <- "data/reference"
dir.create(ref_dir, showWarnings = FALSE, recursive = TRUE)

# --- Recover permits_raw if needed --------------------------
# if (!exists("permits_raw")) {
#   permits_raw <- read_csv(
#     "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/pipeline/building-permits/data/raw/General_Building_Permits_20260529.csv",
#     show_col_types = FALSE
#   )
# }


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

cat("--- Mapping table ---\n")

job_category_grouping |>
  select(job_category, group, rationale) |>
  print(n = Inf, width = Inf)


# ============================================================
# 2 — Integrity checks on the mapping ITSELF (before applying)
# ============================================================
cat("\n--- Mapping integrity ---\n")

# Every category covered exactly once?
data_cats <- permits_raw |> distinct(JOB_CATEGORY) |> pull(JOB_CATEGORY)
map_cats  <- job_category_grouping$job_category

cat("Categories in data:    ", length(data_cats), "\n")
cat("Categories in mapping: ", length(map_cats), "\n")
cat("In data, NOT in mapping (should be none):\n");  print(setdiff(data_cats, map_cats))
cat("In mapping, NOT in data (should be none):\n");  print(setdiff(map_cats, data_cats))

cat("Any duplicate category rows in mapping (should be 0):",
    sum(duplicated(job_category_grouping$job_category)), "\n")
stopifnot(setequal(data_cats, map_cats))


# ============================================================
# 3 — Apply the mapping and verify the representative output
# ============================================================
permits_grouped <- permits_raw |>
  left_join(job_category_grouping |> select(job_category, group),
            by = c("JOB_CATEGORY" = "job_category")) |>
  rename(job_group = group)

cat("\n--- Post-join: any unmapped rows? (must be 0) ---\n")
cat(sum(is.na(permits_grouped$job_group)), "rows with NA job_group\n")
stopifnot(sum(is.na(permits_grouped$job_group)) == 0)


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
  filter(has_coord) |
  count(job_group) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  print()


# ============================================================
# 4 — Persist the reference table (the §4.7 contract)
# ============================================================
out_path <- file.path(ref_dir,
                      sprintf("job_category_grouping_%s.csv",
                              format(Sys.Date(), "%Y%m%d")))
write_csv(job_category_grouping, out_path)
cat("\nWrote:", out_path, "\n")
cat("Columns: job_category, group, rationale, source, date_curated, curated_by\n")
