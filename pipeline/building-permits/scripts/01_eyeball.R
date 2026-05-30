# ============================================================
# building-permits/scripts/01_inspect_data.R  (eyeball only — writes nothing)
# General Building Permits, Edmonton Open Data (24uj-dj8v)
# Dev snapshot: General_Building_Permits_20260529.csv
# ============================================================

library(tidyverse)
library(scales)

# --- Load local dev snapshot --------------------------------
permits_path <- "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/pipeline/building-permits/data/raw/General_Building_Permits_20260529.csv"

permits_raw <- read_csv(permits_path, show_col_types = FALSE)


# --- Shape --------------------------------------------------
cat("Rows:", comma(nrow(permits_raw)), "  Cols:", ncol(permits_raw), "\n\n")
glimpse(permits_raw)

view
# --- Column names + types, plain list -----------------------
cat("\n--- Columns ---\n")
tibble(
  column = names(permits_raw),
  type   = map_chr(permits_raw, ~ class(.x)[1]),
  n_missing = map_int(permits_raw, ~ sum(is.na(.x))),
  pct_missing = map_chr(permits_raw, ~ percent(mean(is.na(.x)), 0.1)),
  n_distinct  = map_int(permits_raw, n_distinct)
) |> print(n = Inf)


# --- Peek at a few rows transposed (easier to read wide files) ---
cat("\n--- First 3 rows (transposed) ---\n")
permits_raw |> slice_head(n = 3) |> glimpse()


# --- Coordinate columns? (point map needs lat/lon) ----------
cat("\n--- Columns that look spatial ---\n")
spatial_like <- names(permits_raw)[grepl(
  "lat|lon|long|geom|point|location|x_|y_|coord",
  names(permits_raw), ignore.case = TRUE
)]
print(spatial_like)


# --- Date columns? (year filter needs one) ------------------
cat("\n--- Columns that look like dates ---\n")
date_like <- names(permits_raw)[grepl(
  "date|year|issue|appl|complet",
  names(permits_raw), ignore.case = TRUE
)]
print(date_like)


# --- Value column? (dot size needs one) ---------------------
cat("\n--- Columns that look like a dollar value ---\n")
value_like <- names(permits_raw)[grepl(
  "value|cost|amount|constr|estimat|fee",
  names(permits_raw), ignore.case = TRUE
)]
print(value_like)


# --- Categorical filters from the Tableau spec --------------
# Tableau permits map filters on Job Category + Work Type. Find them.
cat("\n--- Columns that look like the filter categoricals ---\n")
cat_like <- names(permits_raw)[grepl(
  "job|work|type|category|class|use|permit",
  names(permits_raw), ignore.case = TRUE
)]
print(cat_like)


# --- Distribution of the most likely categorical filters ----
# (run after you see the names above; tweak the column names to the actuals)
cat("\n--- Top values of each candidate categorical ---\n")
for (col in cat_like) {
  cat("\n###", col, "\n")
  permits_raw |>
    count(.data[[col]], sort = TRUE) |>
    slice_head(n = 15) |>
    print()
}

permits_raw |>
  count(YEAR, sort = FALSE) |>
  print(n = Inf)



# ============================================================
# building-permits/scripts/01b_inspect_decisions.R  (eyeball only — writes nothing)
# Pre-cleaning checks to settle: no-coord handling, neighbourhood drop,
# value parsing, and the Home Improvement job-category drill-down.
# Assumes permits_raw is already in the environment from 01_inspect_data.R.
# If not, uncomment the read below.
# ============================================================

# if (!exists("permits_raw")) {
#   permits_raw <- read_csv(
#     "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/pipeline/building-permits/data/raw/General_Building_Permits_20260529.csv",
#     show_col_types = FALSE
#   )
# }


# ============================================================
# CHECK 1 — Coordinate-missingness by JOB_CATEGORY and by YEAR
# Decides: drop the 6.2% no-coord rows, or surface them as a count?
# If missingness is even across categories/years -> dropping is unbiased.
# If it concentrates -> dropping silently distorts the filter counts.
# ============================================================
cat("\n========== CHECK 1: no-coordinate rows ==========\n")

permits_raw <- permits_raw |>
  mutate(has_coord = !is.na(LATITUDE) & !is.na(LONGITUDE))

cat("\n--- Overall ---\n")
permits_raw |>
  count(has_coord) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  print()

cat("\n--- Missing-coord RATE by JOB_CATEGORY (sorted worst first) ---\n")
permits_raw |>
  group_by(JOB_CATEGORY) |>
  summarise(
    n          = n(),
    n_no_coord = sum(!has_coord),
    pct_no_coord = mean(!has_coord),
    .groups = "drop"
  ) |>
  arrange(desc(pct_no_coord)) |>
  mutate(pct_no_coord = percent(pct_no_coord, 0.1)) |>
  print(n = Inf)

cat("\n--- Missing-coord RATE by YEAR ---\n")
permits_raw |>
  group_by(YEAR) |>
  summarise(
    n          = n(),
    n_no_coord = sum(!has_coord),
    pct_no_coord = mean(!has_coord),
    .groups = "drop"
  ) |>
  arrange(YEAR) |>
  mutate(pct_no_coord = percent(pct_no_coord, 0.1)) |>
  print(n = Inf)


# ============================================================
# CHECK 2 — Neighbourhood last look (before dropping the field)
# Two questions:
#   (a) Is NEIGHBOURHOOD present even when coords are missing?
#       (i.e. could it ever rescue a no-coord row's location? probably not
#        usefully, since we have no centroid table — but confirm the overlap.)
#   (b) How messy is the naming universe really? (sanity for the drop)
# ============================================================
cat("\n========== CHECK 2: neighbourhood field ==========\n")

cat("\n--- Distinct NEIGHBOURHOOD / NEIGHBOURHOOD_NUMBER counts ---\n")
cat("distinct NEIGHBOURHOOD:       ", n_distinct(permits_raw$NEIGHBOURHOOD), "\n")
cat("distinct NEIGHBOURHOOD_NUMBER:", n_distinct(permits_raw$NEIGHBOURHOOD_NUMBER), "\n")

cat("\n--- Among NO-COORD rows: do they at least carry a neighbourhood? ---\n")
permits_raw |>
  filter(!has_coord) |>
  summarise(
    n_no_coord            = n(),
    n_with_nbhd_name      = sum(!is.na(NEIGHBOURHOOD)),
    n_with_nbhd_number    = sum(!is.na(NEIGHBOURHOOD_NUMBER)),
    pct_with_nbhd_name    = percent(mean(!is.na(NEIGHBOURHOOD)), 0.1)
  ) |>
  print()

cat("\n--- Do NEIGHBOURHOOD_NUMBER -> NEIGHBOURHOOD map 1:1? (drift check) ---\n")
# More than one name per number (or vice versa) = naming inconsistency.
permits_raw |>
  filter(!is.na(NEIGHBOURHOOD_NUMBER), !is.na(NEIGHBOURHOOD)) |>
  distinct(NEIGHBOURHOOD_NUMBER, NEIGHBOURHOOD) |>
  count(NEIGHBOURHOOD_NUMBER, name = "n_names_for_this_number") |>
  count(n_names_for_this_number, name = "n_numbers") |>
  print()

cat("\n--- Examples of numbers carrying >1 name (if any) ---\n")
permits_raw |>
  filter(!is.na(NEIGHBOURHOOD_NUMBER), !is.na(NEIGHBOURHOOD)) |>
  distinct(NEIGHBOURHOOD_NUMBER, NEIGHBOURHOOD) |>
  add_count(NEIGHBOURHOOD_NUMBER, name = "n_names") |>
  filter(n_names > 1) |>
  arrange(NEIGHBOURHOOD_NUMBER) |>
  print(n = 30)


# ============================================================
# CHECK 3 — CONSTRUCTION_VALUE parse sanity
# Decides Q4 NA/zero handling for dot size.
# Parse "$58,131" -> 58131, see how many fail, how many are 0, the spread.
# ============================================================
cat("\n========== CHECK 3: CONSTRUCTION_VALUE parsing ==========\n")

permits_val <- permits_raw |>
  mutate(
    construction_value_num = CONSTRUCTION_VALUE |>
      str_remove_all("[$,]") |>
      str_trim() |>
      as.numeric()
  )

cat("\n--- Parse outcome ---\n")
permits_val |>
  summarise(
    n_total          = n(),
    n_raw_NA         = sum(is.na(CONSTRUCTION_VALUE)),
    n_parsed_NA      = sum(is.na(construction_value_num)),
    n_newly_failed   = sum(is.na(construction_value_num) & !is.na(CONSTRUCTION_VALUE)),
    n_zero           = sum(construction_value_num == 0, na.rm = TRUE),
    n_positive       = sum(construction_value_num > 0, na.rm = TRUE),
    n_negative       = sum(construction_value_num < 0, na.rm = TRUE)
  ) |>
  glimpse()

cat("\n--- Any rows where parse FAILED but raw was non-NA? (would mean junk format) ---\n")
permits_val |>
  filter(is.na(construction_value_num) & !is.na(CONSTRUCTION_VALUE)) |>
  count(CONSTRUCTION_VALUE, sort = TRUE) |>
  slice_head(n = 15) |>
  print()

cat("\n--- Distribution of POSITIVE construction values (dot-size domain) ---\n")
permits_val |>
  filter(construction_value_num > 0) |>
  summarise(
    min    = min(construction_value_num),
    q10    = quantile(construction_value_num, 0.10),
    q25    = quantile(construction_value_num, 0.25),
    median = median(construction_value_num),
    q75    = quantile(construction_value_num, 0.75),
    q90    = quantile(construction_value_num, 0.90),
    q99    = quantile(construction_value_num, 0.99),
    max    = max(construction_value_num)
  ) |>
  mutate(across(everything(), ~ dollar(round(.x)))) |>
  glimpse()

cat("\n--- Value missingness interacts with coords? (no-value AND no-coord overlap) ---\n")
permits_val |>
  mutate(has_coord = !is.na(LATITUDE) & !is.na(LONGITUDE),
         has_value = construction_value_num > 0 & !is.na(construction_value_num)) |>
  count(has_coord, has_value) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  print()


# ============================================================
# CHECK 4 — Home Improvement drill-down
# You asked: within JOB_CATEGORY == "Home Improvement", what are the
# JOB_DESCRIPTION values and their counts? Tells us what that 59k bucket
# actually contains (and whether it's res-ish, com-ish, or genuinely mixed).
# ============================================================
cat("\n========== CHECK 4: Home Improvement composition ==========\n")

hi <- permits_raw |> filter(JOB_CATEGORY == "Home Improvement")

cat("\n--- Home Improvement total rows ---\n")
cat(comma(nrow(hi)), "rows\n")

cat("\n--- Top 30 JOB_DESCRIPTION within Home Improvement ---\n")
hi |>
  count(JOB_DESCRIPTION, sort = TRUE) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  slice_head(n = 30) |>
  print(n = 30)

cat("\n--- Home Improvement by BUILDING_TYPE (is it on houses or shops?) ---\n")
hi |>
  count(BUILDING_TYPE, sort = TRUE) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  slice_head(n = 15) |>
  print(n = 15)

cat("\n--- Home Improvement by WORK_TYPE ---\n")
hi |>
  count(WORK_TYPE, sort = TRUE) |>
  mutate(pct = percent(n / sum(n), 0.1)) |>
  slice_head(n = 15) |>
  print(n = 15)


# ============================================================
# (Bonus) Same one-line composition for the OTHER two ambiguous buckets,
# so the res/com question is fully informed if you revisit it.
# ============================================================
cat("\n========== BONUS: other ambiguous buckets, by BUILDING_TYPE ==========\n")

for (jc in c("Other Miscellaneous Building", "Accessory Building Combination")) {
  cat("\n###", jc, "— top BUILDING_TYPE\n")
  permits_raw |>
    filter(JOB_CATEGORY == jc) |>
    count(BUILDING_TYPE, sort = TRUE) |>
    mutate(pct = percent(n / sum(n), 0.1)) |>
    slice_head(n = 10) |>
    print()
}

