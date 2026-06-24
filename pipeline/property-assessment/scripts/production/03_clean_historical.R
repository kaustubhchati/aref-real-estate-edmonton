# ============================================================
# 03_clean_historical.R
# AREF Open Data Centre — Historical Property Assessment
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Single-operator script. Load raw historical CSV,
#   apply all three validated cleaning rules, write one clean
#   CSV ready for Layer 2 neighbourhood aggregation.
#
# REFRESH-BY-DESIGN:
#   - No year literals anywhere. All year logic derives from data.
#   - Auto-discovers raw file from data/raw/ by glob pattern.
#   - One operator run handles any new year end-to-end, no code edits.
#   - Output filename is date-stamped from system date, not hardcoded.
#
# THREE RULES APPLIED (in order):
#   R1          — Keep Assessment Class 1 == "RESIDENTIAL"
#   R3          — Drop NA Lot Size (manufactured homes, leased land)
#   R_PARK_HIST — Drop parking stalls:
#                   Assessed Value < $15,000
#                   AND Lot Size < 20 m²
#                   AND zone_family in (RA, DC, OTHER, common areas)
#
# RULE PROVENANCE:
#   R1 validated F1 0.992 on 2023 oracle (script 04).
#   R3 validated F1 0.974 on 2023 oracle (script 05).
#   R_PARK_HIST validated Precision 0.9935, Recall 0.8125, F1 0.8939
#     on 2023 confidential file joined across all historical years
#     (script 06b). Recall gap explained by NA-zone 2025 data quality
#     gap and RF-family condo protection — documented in PHASE1_STATUS.md.
#
# INPUTS:
#   data/raw/Property_Assessment_Data_(Historical)_*.csv
#   (script auto-selects the most recently dated file by filename)
#
# OUTPUTS:
#   output/pa_hist_clean_<YYYYMMDD>.csv   — cleaned row-level data
#   output/pa_hist_filter_scorecard.csv   — rule-by-rule row counts
#
# YEAR COVERAGE:
#   Handled automatically. Script reports year span + per-year
#   row counts post-cleaning. No year literals in code.
# ============================================================

library(tidyverse)
library(scales)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

dir.create("output", showWarnings = FALSE, recursive = TRUE)

cat("=============================================================\n")
cat("AREF — Historical Property Assessment: Cleaning Pipeline\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M %Z"), "\n")
cat("=============================================================\n\n")

# ============================================================
# 1. Auto-discover raw file
#    Matches any Property_Assessment_Data_(Historical)_*.csv in data/raw/
#    If multiple snapshots exist, picks the most recent by filename
#    (relies on YYYYMMDD date suffix convention KC uses on download).
# ============================================================

raw_candidates <- list.files(
  path       = "data/raw",
  pattern    = "^Property_Assessment_Data_\\(Historical\\)_.*\\.csv$",
  full.names = TRUE
)

if (length(raw_candidates) == 0) {
  stop(paste(
    "No historical assessment CSV found in data/raw/.",
    "Expected filename pattern:",
    "Property_Assessment_Data_(Historical)_YYYYMMDD.csv",
    "Download from: https://data.edmonton.ca/City-Administration/",
    "Property-Assessment-Data-Historical-/qi6a-xuwt"
  ))
}

# Most recent file by filename sort (YYYYMMDD suffix makes this safe)
raw_path <- sort(raw_candidates, decreasing = TRUE)[1]
cat("Raw file selected:  ", raw_path, "\n")
cat("Total candidates:   ", length(raw_candidates), "\n\n")

# ============================================================
# 2. Load raw CSV
#    Assessed Value comes in as "$1,234,000" character — stripped below.
#    show_col_types = FALSE suppresses chatty type-guessing output.
# ============================================================

cat("Loading raw CSV — this may take 30–60 seconds for 5M+ rows...\n")
raw <- read_csv(raw_path, show_col_types = FALSE)
cat("Raw rows loaded:    ", format(nrow(raw), big.mark = ","), "\n")
cat("Raw columns:        ", ncol(raw), "\n\n")

n_raw <- nrow(raw)

# ============================================================
# 3. Select columns
#    Keep only the 11 fields used downstream. Dropping unused
#    columns now keeps memory manageable on 5M+ row frames.
# ============================================================

pa_hist <- raw |>
  select(
    `Account Number`,
    `Assessment Year`,
    Latitude,
    Longitude,
    `Point Location`,
    Neighbourhood,
    `Actual Year Built`,
    Zoning,
    `Lot Size`,
    `Assessed Value`,
    `Assessment Class 1`
  )

# ============================================================
# 4. Type coercions
#    Assessed Value: strip "$" and "," before as.numeric().
#    Lot Size:       may also have formatting characters.
#    Assessment Year: integer for grouping.
#    Actual Year Built: numeric (has NAs — expected).
# ============================================================

pa_hist <- pa_hist |>
  mutate(
    `Assessed Value`   = as.numeric(gsub("[$,]", "", `Assessed Value`)),
    `Lot Size`         = as.numeric(gsub("[$,]", "", `Lot Size`)),
    `Assessment Year`  = as.integer(`Assessment Year`),
    `Actual Year Built`= as.numeric(`Actual Year Built`)
  )

# Coercion verification — warn if unexpected NAs introduced
n_na_value <- sum(is.na(pa_hist$`Assessed Value`))
n_na_lot   <- sum(is.na(pa_hist$`Lot Size`))

if (n_na_value > 0) {
  warning(n_na_value, " NA in Assessed Value after coercion — ",
          "likely non-numeric strings in raw file. Inspect raw_path.")
}

cat("--- Type coercion check ---\n")
cat("NA in Assessed Value after coercion: ", n_na_value, "\n")
cat("NA in Lot Size after coercion:       ", n_na_lot,   "\n")
cat("Assessment Year range:               ",
    min(pa_hist$`Assessment Year`, na.rm = TRUE), "–",
    max(pa_hist$`Assessment Year`, na.rm = TRUE), "\n\n")

# ============================================================
# 5. R1 — Keep Assessment Class 1 == "RESIDENTIAL"
#    Validated F1 0.992 on 2023 oracle (script 04).
# ============================================================

n_pre_r1 <- nrow(pa_hist)

pa_r1 <- pa_hist |>
  filter(`Assessment Class 1` == "RESIDENTIAL")

n_post_r1  <- nrow(pa_r1)
n_drop_r1  <- n_pre_r1 - n_post_r1

cat("--- R1: Keep RESIDENTIAL ---\n")
cat("Rows before: ", format(n_pre_r1,  big.mark = ","), "\n")
cat("Rows after:  ", format(n_post_r1, big.mark = ","), "\n")
cat("Rows dropped:", format(n_drop_r1, big.mark = ","),
    "(", percent(n_drop_r1 / n_pre_r1, accuracy = 0.01), ")\n\n")

# ============================================================
# 6. R3 — Drop NA Lot Size (manufactured homes / leased land)
#    Validated F1 0.974 on 2023 oracle (script 05).
#    is.na(Lot Size) is a STRUCTURAL signal — manufactured homes
#    do not own their land so no lot size is recorded.
#    Also drop Assessed Value == 0 (data entry errors).
# ============================================================

n_pre_r3 <- nrow(pa_r1)

pa_r3 <- pa_r1 |>
  filter(
    !is.na(`Lot Size`),
    `Assessed Value` > 0,
    !is.na(`Assessed Value`)
  )

n_post_r3  <- nrow(pa_r3)
n_drop_r3  <- n_pre_r3 - n_post_r3

cat("--- R3: Drop NA Lot Size + zero/NA Assessed Value ---\n")
cat("Rows before: ", format(n_pre_r3,  big.mark = ","), "\n")
cat("Rows after:  ", format(n_post_r3, big.mark = ","), "\n")
cat("Rows dropped:", format(n_drop_r3, big.mark = ","),
    "(", percent(n_drop_r3 / n_pre_r3, accuracy = 0.01), ")\n\n")

# ============================================================
# 7. Zone family classification
#    Required for R_PARK_HIST zone condition.
#    CRITICAL ORDER: RSF and RSL before generic ^RS catch.
#    RSL is a pre-2023 Residential Small Lot zone — NOT the
#    post-2023 RS zone. grepl("^RS") would miscapture it.
# ============================================================

pa_r3 <- pa_r3 |>
  mutate(zone_family = case_when(
    Zoning == "RSL"          ~ "RSL (residential small lot)",
    grepl("^RSF", Zoning)    ~ "RSF (post-2023 flex)",
    grepl("^RS",  Zoning)    ~ "RS (post-2023 small scale)",
    grepl("^RF",  Zoning)    ~ "RF (low density residential)",
    grepl("^RA",  Zoning)    ~ "RA (apartment)",
    grepl("^RR",  Zoning)    ~ "RR (rural residential)",
    grepl("^RMH", Zoning)    ~ "RMH (mobile home)",
    grepl("^RPL", Zoning)    ~ "RPL (planned lot)",
    grepl("^DC",  Zoning)    ~ "DC (direct control)",
    is.na(Zoning)             ~ "NA",
    TRUE                      ~ "OTHER"
  ))

# ============================================================
# 8. R_PARK_HIST — Drop parking stalls
#
# RULE:
#   Assessed Value < $15,000
#   AND Lot Size < 20 m²
#   AND zone_family in (RA, DC, OTHER)
#
# THRESHOLD RATIONALE:
#   $15K boundary: parking price ladder confirmed at $500–$14K
#   from value repetition analysis across 14 years. Rows at
#   $15K–$20K (Oliver, Glastonbury, Boyle Street) are legitimate
#   low-value inner-city condos — retained.
#
# LOT SIZE RATIONALE:
#   A single parking stall is 14–18 m². RF5/RF6 condos have
#   proportional footprint shares (legitimately <20 m²) but are
#   genuine residential — excluded by zone condition below.
#
# ZONE RATIONALE:
#   RA = apartment towers (primary stall source, 55% of flagged rows).
#   DC = mixed-use towers with parking (23%).
#   OTHER = commercial zones (10%) — non-residential context.
#   RF family deliberately excluded — protects RF5/RF6 condos
#     in Oliver, Terra Losa, Ramsay Heights.
#   NA zone deliberately excluded — conservative; 2025 data
#     quality gap. Known residual: ~41K parking stalls in NA-zone
#     2025 rows not caught by this rule (documented in PHASE1_STATUS.md).
#
# PARKING DESCRIPTIONS (from 06b validation):
#   Common area types added based on 06b FP analysis — common areas
#   are not dwelling units and should not appear in residential data.
#
# VALIDATED METRICS (script 06b, 2023 oracle, all years):
#   Precision 0.9935 | Recall 0.8125 | F1 0.8939
#   FP rate 0.05% — below 1% stopping threshold.
# ============================================================

n_pre_park <- nrow(pa_r3)

pa_r3 <- pa_r3 |>
  mutate(is_parking_hist =
           `Assessed Value` < 15000 &
           `Lot Size` < 20 &
           zone_family %in% c(
             "RA (apartment)",
             "DC (direct control)",
             "OTHER"
           )
  )

n_flagged_park <- sum(pa_r3$is_parking_hist)

cat("--- R_PARK_HIST: Parking stall removal ---\n")
cat("Rows before:     ", format(n_pre_park,     big.mark = ","), "\n")
cat("Rows flagged:    ", format(n_flagged_park, big.mark = ","),
    "(", percent(n_flagged_park / n_pre_park, accuracy = 0.01), ")\n")

# Zone breakdown of what gets removed — audit trail
cat("\nFlagged rows by zone family:\n")
pa_r3 |>
  filter(is_parking_hist) |>
  count(zone_family, name = "n") |>
  mutate(pct = percent(n / sum(n), accuracy = 0.01)) |>
  arrange(desc(n)) |>
  print()

# Apply removal
pa_clean <- pa_r3 |>
  filter(!is_parking_hist) |>
  select(-is_parking_hist, -zone_family)

n_post_park <- nrow(pa_clean)
n_drop_park <- n_pre_park - n_post_park

cat("\nRows after:      ", format(n_post_park, big.mark = ","), "\n")
cat("Rows dropped:    ", format(n_drop_park,  big.mark = ","),
    "(", percent(n_drop_park / n_pre_park, accuracy = 0.01), ")\n\n")

# ============================================================
# 9. Post-cleaning diagnostics
# ============================================================

cat("--- Post-cleaning year coverage ---\n")
year_summary <- pa_clean |>
  group_by(`Assessment Year`) |>
  summarise(
    n_rows         = n(),
    median_value   = median(`Assessed Value`, na.rm = TRUE),
    pct_of_total   = percent(n() / nrow(pa_clean), accuracy = 0.1),
    .groups        = "drop"
  ) |>
  arrange(`Assessment Year`)

print(year_summary, n = Inf)
cat("\n")
cat("Year span:   ",
    min(pa_clean$`Assessment Year`, na.rm = TRUE), "–",
    max(pa_clean$`Assessment Year`, na.rm = TRUE), "\n")
cat("Total years: ",
    n_distinct(pa_clean$`Assessment Year`), "\n\n")

# Residual contamination check — stopping threshold <= 1%
cat("--- Residual contamination check (threshold <= 1%) ---\n")
residual_pct <- mean(pa_clean$`Assessed Value` < 1000, na.rm = TRUE)
cat("Pct rows with Assessed Value < $1,000: ",
    percent(residual_pct, accuracy = 0.001), "\n")

if (residual_pct > 0.01) {
  warning("Residual contamination ABOVE 1% threshold — review before proceeding.")
} else {
  cat("PASS — below 1% stopping threshold.\n\n")
}

# ============================================================
# 10. Write outputs
# ============================================================

# Date stamp from system date — REFRESH-BY-DESIGN, no hardcoded dates
run_date   <- format(Sys.Date(), "%Y%m%d")
clean_path <- sprintf("output/pa_hist_clean_%s.csv", run_date)

write_csv(pa_clean, clean_path)
cat("Wrote: ", clean_path, "—",
    format(nrow(pa_clean), big.mark = ","), "rows,",
    ncol(pa_clean), "columns\n")

# Prune dated clean files to the newest 2 (each is ~500 MB; see _bootstrap.R).
pruned <- prune_dated_files("output", "^pa_hist_clean_\\d{8}\\.csv$", keep = 2L)
if (length(pruned)) cat("Pruned", length(pruned), "old pa_hist_clean file(s).\n")

# Filter scorecard — one row per rule, for Olivia QA review
scorecard <- tibble(
  rule         = c("R1", "R3", "R_PARK_HIST"),
  description  = c(
    "Keep Assessment Class 1 == RESIDENTIAL",
    "Drop NA Lot Size + zero/NA Assessed Value (manufactured homes)",
    "Drop parking stalls: value<$15K + lot<20m² + RA/DC/OTHER zone"
  ),
  validated_f1 = c(0.992, 0.974, 0.894),
  rows_in      = c(n_raw,      n_pre_r3,   n_pre_park),
  rows_out     = c(n_post_r1,  n_post_r3,  n_post_park),
  rows_dropped = c(n_drop_r1,  n_drop_r3,  n_drop_park),
  pct_dropped  = c(
    percent(n_drop_r1   / n_raw,      accuracy = 0.01),
    percent(n_drop_r3   / n_pre_r3,   accuracy = 0.01),
    percent(n_drop_park / n_pre_park, accuracy = 0.01)
  ),
  run_date     = run_date
)

write_csv(scorecard, "output/pa_hist_filter_scorecard.csv")
cat("Wrote: output/pa_hist_filter_scorecard.csv\n")

cat("\n=============================================================\n")
cat("Cleaning complete.\n")
cat("Clean rows:  ", format(nrow(pa_clean), big.mark = ","), "\n")
cat("Year span:   ",
    min(pa_clean$`Assessment Year`, na.rm = TRUE), "–",
    max(pa_clean$`Assessment Year`, na.rm = TRUE), "\n")
cat("Output:      ", clean_path, "\n")
cat("QA gate:     output/pa_hist_filter_scorecard.csv → Olivia\n")
cat("=============================================================\n")