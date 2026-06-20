# ============================================================
# 06_apply_layer1a_rules.R
# Apply validated Layer 1a rules (parking → R1 → R3) to the
# post-parking public data and persist a single clean output frame.
#
# This is the FIRST script in the project that produces production-
# shaped output rather than validation artefacts. It is the prototype
# for the Ingest Agent's rule chain (see PHASE1_STATUS.md §6).
#
# Pipeline:
#   1. Read parking-cleaned assessment data  (394,492 rows expected)
#   2. Apply R1: keep `Assessment Class 1` == "RESIDENTIAL"
#   3. Join Property Information for lot_size, year_built, Total Gross Area,
#      legal_description (needed downstream for pct_with_unit aggregate)
#   4. Apply R3: drop rows with NA lot_size
#   5. Write assess_2026_clean.csv
#
# Inputs:
#   - data/processed/assess_2026_no_parking.csv   (from script 01, 394,492 rows)
#   - data/raw/property_info_2026_20260519.csv    (Property Information snapshot)
#
# Output:
#   - data/processed/assess_2026_clean.csv        (~338,944 rows expected)
#
# Acceptance: row count must match scoreboard expectations.
#   - Post-R1 (no PI join): 341,154 rows
#   - Post-R3 (with PI):    338,944 rows
#   These are the numbers in output/rule_scorecards_2023.csv.
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(scales)

dir.create("data/processed", showWarnings = FALSE, recursive = TRUE)


# --- Load post-parking frame --------------------------------
parking_clean_path <- "data/processed/assess_2026_no_parking.csv"
if (!file.exists(parking_clean_path)) {
  stop("Missing: ", parking_clean_path, " — run scripts/01_load_data.R first.")
}

assess_post_parking <- read_csv(parking_clean_path, show_col_types = FALSE)
cat(sprintf("Loaded post-parking frame: %s rows\n",
            comma(nrow(assess_post_parking))))

# Soft drift check: log if input size has shifted from scoreboard baseline.
# Edmonton open data refreshes ~weekly; small drift is normal.
.input_baseline <- 394492
.input_delta    <- nrow(assess_post_parking) - .input_baseline
if (.input_delta != 0) {
  message(sprintf(
    "Input drift: %s rows (%+d vs scoreboard baseline %s)",
    scales::comma(nrow(assess_post_parking)),
    .input_delta,
    scales::comma(.input_baseline)
  ))
}
# --- Apply R1: keep Assessment Class 1 == 'RESIDENTIAL' -----
n_before_r1 <- nrow(assess_post_parking)

assess_post_r1 <- assess_post_parking |>
  filter(`Assessment Class 1` == "RESIDENTIAL")

n_dropped_r1 <- n_before_r1 - nrow(assess_post_r1)
cat(sprintf("After R1 (keep RESIDENTIAL): %s rows  (dropped %s)\n",
            comma(nrow(assess_post_r1)),
            comma(n_dropped_r1)))

# Scoreboard expects: 341,154 kept, 30,090 dropped at this stage.
# Allow some tolerance since 2026 data may have shifted slightly.
# Soft drift check vs scoreboard. Drift here is expected because the
# input universe grows over time (new Account Numbers registered by
# the City). What matters is whether R1's PRECISION held on the
# oracle-overlap rows — that check happens later via the oracle join.
.r1_baseline <- 341154
.r1_delta    <- nrow(assess_post_r1) - .r1_baseline
.r1_pct      <- .r1_delta / .r1_baseline
if (abs(.r1_pct) > 0.10) {
  warning(sprintf(
    "R1 row count drifted >10%% from scoreboard (%s vs %s, %+s).",
    scales::comma(nrow(assess_post_r1)),
    scales::comma(.r1_baseline),
    scales::percent(.r1_pct, 0.1)
  ))
} else if (.r1_delta != 0) {
  message(sprintf(
    "R1 kept %s rows (%+d vs baseline %s, %s)",
    scales::comma(nrow(assess_post_r1)),
    .r1_delta,
    scales::comma(.r1_baseline),
    scales::percent(.r1_pct, 0.01)
  ))
}

# --- Load Property Information for R3 + downstream join -----
info_path <- "data/raw/property_info_2026_20260519.csv"
if (!file.exists(info_path)) {
  stop("Missing: ", info_path,
       " — the Property Information snapshot is required for R3 and",
       " for downstream Layer 2 aggregation. Pull the dkk9-cj3x dataset",
       " from data.edmonton.ca and save to this path.")
}

info_raw <- read_csv(info_path, show_col_types = FALSE)
cat(sprintf("Loaded Property Information: %s rows\n",
            comma(nrow(info_raw))))

# Rename only the fields that collide with the assessment side (info_ prefix
# per §4.1 column convention). Keep the unique PI fields un-prefixed so
# downstream scripts can use them directly:
#   - lot_size            → R3 predicate + Layer 2 avg_lotsize
#   - year_built          → Layer 2 median_yearbuilt
#   - `Total Gross Area`  → Layer 2 area-based aggregates (if needed)
#   - legal_description   → Layer 2 pct_with_unit (grepl "unit:")
info_for_join <- info_raw |>
  rename(
    info_neighbourhood     = Neighbourhood,
    `info_Neighbourhood ID` = `Neighbourhood ID`,
    info_ward              = Ward,
    info_latitude          = Latitude,
    info_longitude         = Longitude,
    info_suite             = Suite,
    `info_House Number`    = `House Number`,
    `info_Street Name`     = `Street Name`,
    `info_Point Location`  = `Point Location`
  ) |>
  select(`Account Number`,
         lot_size,
         year_built,
         `Total Gross Area`,
         legal_description,
         garage,
         zoning,
         starts_with("info_"))


# --- Join Property Information onto post-R1 frame -----------
assess_post_r1_joined <- assess_post_r1 |>
  left_join(info_for_join, by = "Account Number")

# Left join must not fan out
stopifnot(nrow(assess_post_r1_joined) == nrow(assess_post_r1))

n_with_info <- sum(!is.na(assess_post_r1_joined$lot_size))
cat(sprintf("Post-R1 + PI join: %s rows  (%s with valid lot_size)\n",
            comma(nrow(assess_post_r1_joined)),
            comma(n_with_info)))


# --- Apply R3: drop rows with NA lot_size -------------------
n_before_r3 <- nrow(assess_post_r1_joined)

assess_clean <- assess_post_r1_joined |>
  filter(!is.na(lot_size))

n_dropped_r3 <- n_before_r3 - nrow(assess_clean)
cat(sprintf("After R3 (drop NA lot_size): %s rows  (dropped %s)\n",
            comma(nrow(assess_clean)),
            comma(n_dropped_r3)))

# Soft drift check vs scoreboard.
.r3_baseline <- 338944
.r3_delta    <- nrow(assess_clean) - .r3_baseline
.r3_pct      <- .r3_delta / .r3_baseline
if (abs(.r3_pct) > 0.10) {
  warning(sprintf(
    "R3 row count drifted >10%% from scoreboard (%s vs %s, %+s).",
    scales::comma(nrow(assess_clean)),
    scales::comma(.r3_baseline),
    scales::percent(.r3_pct, 0.1)
  ))
} else if (.r3_delta != 0) {
  message(sprintf(
    "R3 final %s rows (%+d vs baseline %s, %s)",
    scales::comma(nrow(assess_clean)),
    .r3_delta,
    scales::comma(.r3_baseline),
    scales::percent(.r3_pct, 0.01)
  ))
}

# --- Write the clean frame ----------------------------------
clean_path <- "data/processed/assess_2026_clean.csv"
write_csv(assess_clean, clean_path)

cat(sprintf("\nWrote: %s\n", clean_path))
cat(sprintf("Final row count: %s\n", comma(nrow(assess_clean))))
cat(sprintf("Total drop from raw post-parking: %s rows (%s)\n",
            comma(n_before_r1 - nrow(assess_clean)),
            percent((n_before_r1 - nrow(assess_clean)) / n_before_r1, 0.1)))


# --- Summary table for the run log --------------------------
cat("\n--- Layer 1a pipeline summary ---\n")
summary_tbl <- tibble(
  stage           = c("post_parking_input", "after_R1_keep",  "after_R3_drop"),
  rule_polarity   = c(NA,                    "keep",            "drop"),
  rows            = c(394492,                nrow(assess_post_r1), nrow(assess_clean)),
  rows_dropped    = c(NA,                    n_dropped_r1,      n_dropped_r3),
  scoreboard_target = c(394492, 341154, 338944),
  delta_vs_target = c(0,
                      nrow(assess_post_r1) - 341154,
                      nrow(assess_clean)   - 338944)
)
print(summary_tbl)