# ============================================================
# 06_explore_historical_assessment.R
# AREF Open Data Centre — Property Assessment Historical
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Exploratory analysis of the historical property assessment
#   dataset after residential filtering. Designed to be re-run by
#   Olivia or any future RA to understand file shape, columns,
#   distributions, and year coverage WITHOUT any code edits.
#
# INPUTS (must exist in environment or will be read from disk):
#   pa_res  — filtered residential rows (pa_hist after R1 + R3 + value>0)
#   pa_hist — the 11-column select from prop_asses_hist (optional; for
#              comparing pre/post filter counts)
#
# OUTPUTS (printed to console + written to output/):
#   output/eda_hist_summary.txt      — capture of all cat() printouts
#   output/eda_hist_year_counts.csv  — rows per Assessment Year
#   output/eda_hist_missing.csv      — % missing per column
#   output/eda_hist_value_qtiles.csv — assessed value quantiles by year
#
# REFRESH-BY-DESIGN: no year literals anywhere. All year references
#   derive from the data itself (min/max of Assessment Year column).
# ============================================================

library(tidyverse)
library(scales)

dir.create("output", showWarnings = FALSE, recursive = TRUE)

# ============================================================
# 0. Recover filtered frame if not in environment
# ============================================================
# This block lets Olivia run the script standalone after KC's
# filtering session without re-sourcing the entire pipeline.

prop_asses_hist <- read_csv("data/raw/Property_Assessment_Data_(Historical)_20260616.csv", show_col_types = FALSE)


pa_hist<- prop_asses_hist|>select(`Account Number`,
                                  `Assessment Year`,
                                  Latitude,
                                  Longitude,
                                  `Point Location`,
                                  Neighbourhood,
                                  `Actual Year Built`,Zoning,
                                  `Lot Size`,
                                  `Assessed Value`,
                                  `Assessment Class 1`)
pa_res <- pa_hist|>filter(`Assessment Class 1`== "RESIDENTIAL",
                          !is.na(`Lot Size`),
                          `Assessed Value`!=0)
# In your original loading block, after creating pa_res, add this coercion:
pa_res <- pa_res |>
  mutate(`Assessed Value` ,
         `Lot Size`       = as.numeric(`Lot Size`),
         `Actual Year Built` = as.numeric(`Actual Year Built`),
         `Assessment Year`   = as.integer(`Assessment Year`))


# Step 1: Diagnose
cat("Class of Assessed Value:", class(prop_asses_hist$`Assessed Value`), "\n")
cat("First 10 raw values:\n")
print(head(prop_asses_hist$`Assessed Value`, 10))

# Step 2: Convert — strip $ and commas, then cast to numeric
pa_res <- pa_res |>
  mutate(`Assessed Value` = as.numeric(
    gsub("[$,]", "", `Assessed Value`)
  ))

# Step 3: Verify
cat("Class after conversion:", class(pa_res$`Assessed Value`), "\n")
cat("NA count after conversion:", sum(is.na(pa_res$`Assessed Value`)), "\n")
cat("Sample values:\n")
print(head(pa_res$`Assessed Value`, 10))
if (!exists("pa_res")) {
  stop(paste(
    "pa_res not found in environment.",
    "Run the filtering block first (prop_asses_hist -> pa_hist -> pa_res)",
    "or source 01_load_data.R before running this script."
  ))
}

# Optional: pa_hist for pre/post comparison
has_pa_hist <- exists("pa_hist")

# ============================================================
# 1. File shape — rows, columns, year span
# ============================================================

cat("=============================================================\n")
cat("AREF — Historical Property Assessment: EDA Report\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M %Z"), "\n")
cat("=============================================================\n\n")

cat("--- 1. FILE SHAPE ---\n")
cat("Filtered residential rows (pa_res):    ", format(nrow(pa_res),   big.mark = ","), "\n")
if (has_pa_hist) {
  cat("Pre-filter rows (pa_hist 11-col):      ", format(nrow(pa_hist), big.mark = ","), "\n")
  cat("Rows removed by filters:               ",
      format(nrow(pa_hist) - nrow(pa_res), big.mark = ","), "\n")
  cat("Retention rate:                        ",
      percent(nrow(pa_res) / nrow(pa_hist), accuracy = 0.1), "\n")
}
cat("Columns:                               ", ncol(pa_res), "\n")
cat("Column names:                          ", paste(names(pa_res), collapse = ", "), "\n\n")

# ============================================================
# 2. Year coverage
# ============================================================

cat("--- 2. YEAR COVERAGE ---\n")

year_counts <- pa_res |>
  count(`Assessment Year`, name = "n_rows") |>
  arrange(`Assessment Year`) |>
  mutate(pct_of_total = percent(n_rows / sum(n_rows), accuracy = 0.1))

print(year_counts, n = Inf)
cat("\n")
cat("Earliest year:", min(pa_res$`Assessment Year`), "\n")
cat("Latest year:  ", max(pa_res$`Assessment Year`), "\n")
cat("Years present:", n_distinct(pa_res$`Assessment Year`), "\n\n")

write_csv(year_counts, "output/eda_hist_year_counts.csv")
cat("Wrote: output/eda_hist_year_counts.csv\n\n")

# ============================================================
# 3. Missing values — % NA per column
# ============================================================

cat("--- 3. MISSING VALUES (% NA per column) ---\n")

missing_summary <- pa_res |>
  summarise(across(everything(), ~ mean(is.na(.)) * 100)) |>
  pivot_longer(everything(), names_to = "column", values_to = "pct_missing") |>
  arrange(desc(pct_missing))

print(missing_summary, n = Inf)
cat("\n")

write_csv(missing_summary, "output/eda_hist_missing.csv")
cat("Wrote: output/eda_hist_missing.csv\n\n")

# ============================================================
# 4. Assessed Value distribution — global + by year
# ============================================================

cat("--- 4. ASSESSED VALUE: GLOBAL DISTRIBUTION ---\n")

value_global <- pa_res |>
  summarise(
    n      = n(),
    min    = min(`Assessed Value`,            na.rm = TRUE),
    p25    = quantile(`Assessed Value`, 0.25, na.rm = TRUE),
    median = median(`Assessed Value`,         na.rm = TRUE),
    mean   = mean(`Assessed Value`,           na.rm = TRUE),
    p75    = quantile(`Assessed Value`, 0.75, na.rm = TRUE),
    p95    = quantile(`Assessed Value`, 0.95, na.rm = TRUE),
    max    = max(`Assessed Value`,            na.rm = TRUE)
  )

print(value_global)
cat("\n")

cat("--- 4b. ASSESSED VALUE QUANTILES BY YEAR ---\n")

value_by_year <- pa_res |>
  group_by(`Assessment Year`) |>
  summarise(
    n      = n(),
    min    = min(`Assessed Value`,            na.rm = TRUE),
    p25    = quantile(`Assessed Value`, 0.25, na.rm = TRUE),
    median = median(`Assessed Value`,         na.rm = TRUE),
    mean   = mean(`Assessed Value`,           na.rm = TRUE),
    p75    = quantile(`Assessed Value`, 0.75, na.rm = TRUE),
    p95    = quantile(`Assessed Value`, 0.95, na.rm = TRUE),
    max    = max(`Assessed Value`,            na.rm = TRUE),
    .groups = "drop"
  ) |>
  arrange(`Assessment Year`)

print(value_by_year, n = Inf)
cat("\n")

write_csv(value_by_year, "output/eda_hist_value_qtiles.csv")
cat("Wrote: output/eda_hist_value_qtiles.csv\n\n")

# ============================================================
# 5. Neighbourhood coverage
# ============================================================

cat("--- 5. NEIGHBOURHOOD COVERAGE ---\n")

nbhd_counts <- pa_res |>
  count(Neighbourhood, name = "n_rows") |>
  arrange(desc(n_rows))

cat("Distinct neighbourhoods:               ", nrow(nbhd_counts), "\n")
cat("Top 10 by row count:\n")
print(slice_head(nbhd_counts, n = 10))
cat("\n")
cat("Bottom 10 by row count (low-N risk):\n")
print(slice_tail(nbhd_counts, n = 10))
cat("\n")

# ============================================================
# 6. Zoning — top codes overall and per-year stability
# ============================================================

cat("--- 6. ZONING: TOP CODES ---\n")

zoning_counts <- pa_res |>
  count(Zoning, name = "n_rows") |>
  arrange(desc(n_rows)) |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.1))

cat("Distinct zoning codes:  ", nrow(zoning_counts), "\n")
cat("Top 15:\n")
print(slice_head(zoning_counts, n = 15))
cat("\n")

# ============================================================
# 7. Lot Size — structural NA check
# ============================================================

cat("--- 7. LOT SIZE (post-filter: should be 0 NA) ---\n")

cat("NA in Lot Size:  ", sum(is.na(pa_res$`Lot Size`)),
    "(expected 0 — R3 removed manufactured homes)\n\n")

cat("Lot Size quantiles:\n")
print(quantile(pa_res$`Lot Size`, probs = c(0, .25, .5, .75, .95, 1), na.rm = TRUE))
cat("\n")

# ============================================================
# 8. Actual Year Built — distribution
# ============================================================

cat("--- 8. ACTUAL YEAR BUILT ---\n")

cat("NA in Actual Year Built:  ", sum(is.na(pa_res$`Actual Year Built`)),
    sprintf("(%.1f%%)\n", mean(is.na(pa_res$`Actual Year Built`)) * 100))

built_dist <- pa_res |>
  filter(!is.na(`Actual Year Built`)) |>
  summarise(
    min    = min(`Actual Year Built`),
    p25    = quantile(`Actual Year Built`, 0.25),
    median = median(`Actual Year Built`),
    mean   = round(mean(`Actual Year Built`), 1),
    p75    = quantile(`Actual Year Built`, 0.75),
    max    = max(`Actual Year Built`)
  )
print(built_dist)
cat("\n")

# ============================================================
# 9. Coordinate completeness — lat/lon
# ============================================================

cat("--- 9. COORDINATE COMPLETENESS ---\n")

n_no_lat  <- sum(is.na(pa_res$Latitude))
n_no_lon  <- sum(is.na(pa_res$Longitude))
n_no_both <- sum(is.na(pa_res$Latitude) & is.na(pa_res$Longitude))

cat("Missing Latitude:        ", format(n_no_lat,  big.mark = ","),
    sprintf("(%.2f%%)\n", n_no_lat  / nrow(pa_res) * 100))
cat("Missing Longitude:       ", format(n_no_lon,  big.mark = ","),
    sprintf("(%.2f%%)\n", n_no_lon  / nrow(pa_res) * 100))
cat("Missing both:            ", format(n_no_both, big.mark = ","),
    sprintf("(%.2f%%)\n", n_no_both / nrow(pa_res) * 100))
cat("\n")

# ============================================================
# 10. Assessment Class 1 check — residual contamination
# ============================================================

cat("--- 10. ASSESSMENT CLASS 1 RESIDUAL CHECK ---\n")
cat("(After R1 filter — should be 100% RESIDENTIAL)\n\n")

class_counts <- pa_res |>
  count(`Assessment Class 1`, name = "n_rows") |>
  arrange(desc(n_rows)) |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01))

print(class_counts, n = Inf)
cat("\n")

# ============================================================
# 11. EDA complete
# ============================================================

cat("=============================================================\n")
cat("EDA complete. Outputs written to output/\n")
cat("Files: eda_hist_summary.txt (if sink was used), eda_hist_year_counts.csv,\n")
cat("       eda_hist_missing.csv, eda_hist_value_qtiles.csv\n")
cat("=============================================================\n")


# ============================================================
# PARKING RULE — inspect flagged rows BEFORE removal
# ============================================================

# Step 1: Build coordinate counts
coord_counts_hist <- pa_res |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_coord")

# Step 2: Join counts + flag (do NOT remove yet)
pa_res_flagged <- pa_res |>
  left_join(coord_counts_hist, by = c("Latitude", "Longitude")) |>
  mutate(
    n_at_coord = replace_na(n_at_coord, 1L),
    is_parking = n_at_coord >= 3 & !is.na(Latitude)
  )

# Step 3: View flagged only
parking_only <- pa_res_flagged |>
  filter(is_parking) |>
  arrange(Latitude, Longitude, `Assessment Year`)

cat("Flagged parking rows:      ", format(nrow(parking_only), big.mark = ","), "\n")
cat("Distinct coordinates:      ", 
    format(n_distinct(paste(parking_only$Latitude, parking_only$Longitude)), big.mark = ","), "\n")
cat("Distinct neighbourhoods:   ", format(n_distinct(parking_only$Neighbourhood), big.mark = ","), "\n\n")

# Step 4: Sample — one cluster to eyeball
cat("--- Sample cluster (top coordinate by row count) ---\n")
parking_only |>
  group_by(Latitude, Longitude) |>
  slice_head(n = 3) |>
  ungroup() |>
  slice_head(n = 9) |>
  select(Neighbourhood, `Assessment Year`, Latitude, Longitude,
         `Assessed Value`, n_at_coord) |>
  print()
# ============================================================
# PARKING RULE v2 — count per coordinate WITHIN each year
# Cap: coordinate must have >= 3 accounts AND
#      median assessed value at that coord < $20,000
# ============================================================

# Step 1: Coordinate counts WITHIN year
coord_counts_hist <- pa_res |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  group_by(`Assessment Year`, Latitude, Longitude) |>
  summarise(
    n_at_coord     = n(),
    median_val     = median(`Assessed Value`, na.rm = TRUE),
    .groups = "drop"
  )

# Step 2: Flag — cluster within year AND low assessed value
pa_res_flagged <- pa_res |>
  left_join(coord_counts_hist, by = c("Assessment Year", "Latitude", "Longitude")) |>
  mutate(
    n_at_coord = replace_na(n_at_coord, 1L),
    is_parking = n_at_coord >= 3 &
      !is.na(Latitude) &
      median_val < 20000
  )

# Step 3: Inspect
parking_only <- pa_res_flagged |> filter(is_parking)

cat("Flagged parking rows:      ", format(nrow(parking_only),        big.mark = ","), "\n")
cat("Distinct coordinates:      ",
    format(n_distinct(paste(parking_only$Latitude, parking_only$Longitude)), big.mark = ","), "\n")
cat("Distinct neighbourhoods:   ", format(n_distinct(parking_only$Neighbourhood), big.mark = ","), "\n\n")

# Step 4: Sample cluster
cat("--- Sample cluster ---\n")
parking_only |>
  group_by(Latitude, Longitude) |>
  slice_head(n = 3) |>
  ungroup() |>
  slice_head(n = 9) |>
  select(Neighbourhood, `Assessment Year`, Latitude, Longitude,
         `Assessed Value`, n_at_coord, median_val) |>
  print()

# Step 5: Value distribution of flagged rows — sanity check
cat("\n--- Assessed value distribution of flagged rows ---\n")
print(quantile(parking_only$`Assessed Value`, 
               probs = c(0, .25, .5, .75, .95, 1), na.rm = TRUE))

cat("n_at_coord distribution (within-year coordinate counts):\n")
print(quantile(pa_res_flagged$n_at_coord, 
               probs = c(0, .25, .5, .75, .90, .95, .99, 1), na.rm = TRUE))

cat("\nn_at_coord = 1:   ", format(sum(pa_res_flagged$n_at_coord == 1), big.mark = ","), "\n")
cat("n_at_coord = 2:   ", format(sum(pa_res_flagged$n_at_coord == 2), big.mark = ","), "\n")
cat("n_at_coord = 3-5: ", format(sum(pa_res_flagged$n_at_coord %in% 3:5), big.mark = ","), "\n")
cat("n_at_coord 6-10:  ", format(sum(pa_res_flagged$n_at_coord %in% 6:10), big.mark = ","), "\n")
cat("n_at_coord > 10:  ", format(sum(pa_res_flagged$n_at_coord > 10), big.mark = ","), "\n")


# Lot size distribution for low-value rows
pa_res |>
  filter(`Assessed Value` < 20000) |>
  summarise(
    n           = n(),
    min_lot     = min(`Lot Size`, na.rm = TRUE),
    p25_lot     = quantile(`Lot Size`, 0.25, na.rm = TRUE),
    median_lot  = median(`Lot Size`, na.rm = TRUE),
    p75_lot     = quantile(`Lot Size`, 0.75, na.rm = TRUE),
    p95_lot     = quantile(`Lot Size`, 0.95, na.rm = TRUE),
    max_lot     = max(`Lot Size`, na.rm = TRUE)
  ) |>
  print()

# Cross-tab: value band vs lot size band
pa_res |>
  filter(`Assessed Value` < 20000) |>
  mutate(lot_band = case_when(
    `Lot Size` < 20          ~ "<20 m²",
    `Lot Size` < 50          ~ "20-50 m²",
    `Lot Size` < 100         ~ "50-100 m²",
    `Lot Size` < 200         ~ "100-200 m²",
    TRUE                     ~ "200m²+"
  )) |>
  count(lot_band, name = "n_rows") |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.1)) |>
  arrange(lot_band) |>
  print()

# Confirm the exact population at the combined threshold
pa_res |>
  summarise(
    total              = n(),
    flagged            = sum(`Assessed Value` < 20000 & `Lot Size` < 20, na.rm = TRUE),
    pct_flagged        = percent(mean(`Assessed Value` < 20000 & `Lot Size` < 20, na.rm = TRUE), 0.01)
  ) |>
  print()

# Neighbourhood check — should be downtown/inner-city parkade locations
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20) |>
  count(Neighbourhood, name = "n") |>
  arrange(desc(n)) |>
  slice_head(n = 15) |>
  print()

# Year stability — should be consistent across years
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20) |>
  count(`Assessment Year`, name = "n_rows") |>
  arrange(`Assessment Year`) |>
  print()


# ============================================================
# ZONING FILTER DIAGNOSTIC
# Goal: understand zone distribution and whether RF/RA prefix
#       alone can serve as a parking filter proxy
# ============================================================

# 1. All zoning codes in the dataset — full distribution
zoning_all <- pa_res |>
  count(Zoning, name = "n_rows") |>
  arrange(desc(n_rows)) |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01))

cat("--- All zoning codes (top 30) ---\n")
print(slice_head(zoning_all, n = 30))

# Fix zone_family — RSL was being miscaptured by ^RS regex
pa_res <- pa_res |>
  mutate(zone_family = case_when(
    Zoning == "RSL"          ~ "RSL (residential small lot)",
    grepl("^RF",  Zoning)    ~ "RF (low density residential)",
    grepl("^RS",  Zoning)    ~ "RS (post-2023 small scale)",
    grepl("^RSF", Zoning)    ~ "RSF (post-2023 flex)",
    grepl("^RA",  Zoning)    ~ "RA (apartment)",
    grepl("^RR",  Zoning)    ~ "RR (rural residential)",
    grepl("^RMH", Zoning)    ~ "RMH (mobile home)",
    grepl("^RPL", Zoning)    ~ "RPL (planned lot)",
    grepl("^DC",  Zoning)    ~ "DC (direct control)",
    is.na(Zoning)             ~ "NA",
    TRUE                      ~ "OTHER"
  ))

# Verify RSL is now separated
pa_res |>
  count(zone_family, name = "n_rows") |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
  arrange(desc(n_rows)) |>
  print()

# Re-run the flagged rows zone breakdown with corrected labels
cat("\n--- Corrected zone family of low-value + small-lot flagged rows ---\n")
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20) |>
  count(zone_family, name = "n_rows") |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
  arrange(desc(n_rows)) |>
  print()

# 3. Key question: what zone are the low-value small-lot rows in?
cat("\n--- Zone family of low-value (<$20K) + small lot (<20m²) rows ---\n")
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20) |>
  count(zone_family, name = "n_rows") |>
  mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
  arrange(desc(n_rows)) |>
  print()

# 4. By year — does zone regime shift show up cleanly?
cat("\n--- Zone family by Assessment Year ---\n")
pa_res |>
  count(`Assessment Year`, zone_family, name = "n_rows") |>
  arrange(`Assessment Year`, desc(n_rows)) |>
  print(n = Inf)


# ============================================================
# Assessed value distribution within $20K — RA zone lots only
# Lot size < 20 m² (stall-sized) to isolate parking candidates
# ============================================================

pa_res |>
  filter(zone_family == "RA (apartment)",
         `Lot Size` < 20) |>
  mutate(value_band = case_when(
    `Assessed Value` == 0          ~ "0 (zero)",
    `Assessed Value` < 1000        ~ "$1 - $999",
    `Assessed Value` < 2000        ~ "$1,000 - $1,999",
    `Assessed Value` < 3000        ~ "$2,000 - $2,999",
    `Assessed Value` < 4000        ~ "$3,000 - $3,999",
    `Assessed Value` < 5000        ~ "$4,000 - $4,999",
    `Assessed Value` < 7500        ~ "$5,000 - $7,499",
    `Assessed Value` < 10000       ~ "$7,500 - $9,999",
    `Assessed Value` < 12500       ~ "$10,000 - $12,499",
    `Assessed Value` < 15000       ~ "$12,500 - $14,999",
    `Assessed Value` < 17500       ~ "$15,000 - $17,499",
    `Assessed Value` < 20000       ~ "$17,500 - $19,999",
    TRUE                           ~ "$20,000+"           # should be 0 — sanity check
  )) |>
  count(value_band, name = "n_rows") |>
  mutate(pct = scales::percent(n_rows / sum(n_rows), accuracy = 0.1)) |>
  arrange(value_band) |>
  print(n = Inf)

# ============================================================
# Assessed value repetition ranking — RA zone, lot < 20 m²
# Which specific values cluster at the same coordinate?
# Expectation: $4K, $5K, $8K, $12K are parkade stall price points
# ============================================================

pa_res |>
  filter(zone_family == "RA (apartment)",
         `Lot Size` < 20,
         `Assessed Value` < 20000) |>
  group_by(Latitude, Longitude, `Assessed Value`) |>
  summarise(
    n_repeats     = n(),
    n_years       = n_distinct(`Assessment Year`),
    neighbourhood = first(Neighbourhood),
    .groups = "drop"
  ) |>
  # Rank by how many times the exact value repeats at that coordinate
  arrange(desc(n_repeats)) |>
  slice_head(n = 50) |>
  select(neighbourhood, Latitude, Longitude,
         `Assessed Value`, n_repeats, n_years) |>
  print(n = 50)

# Which assessed values are most repeated city-wide in RA small-lot rows?
pa_res |>
  filter(zone_family == "RA (apartment)",
         `Lot Size` < 20,
         `Assessed Value` < 20000) |>
  group_by(`Assessed Value`) |>
  summarise(
    n_rows        = n(),
    n_coords      = n_distinct(paste(Latitude, Longitude)),
    n_neighbourhoods = n_distinct(Neighbourhood),
    top_neighbourhood = names(sort(table(Neighbourhood), decreasing = TRUE))[1],
    .groups = "drop"
  ) |>
  arrange(desc(n_rows)) |>
  slice_head(n = 30) |>
  print(n = 30)

# ============================================================
# Write parking value repetition results to CSV
# ============================================================

# Result 1: coordinate-level repetition
coord_repetition <- pa_res |>
  filter(zone_family == "RA (apartment)",
         `Lot Size` < 20,
         `Assessed Value` < 20000) |>
  group_by(Latitude, Longitude, `Assessed Value`) |>
  summarise(
    n_repeats     = n(),
    n_years       = n_distinct(`Assessment Year`),
    neighbourhood = first(Neighbourhood),
    .groups = "drop"
  ) |>
  arrange(desc(n_repeats))

write_csv(coord_repetition,
          "output/parking_coord_repetition_RA.csv")
cat("Wrote: output/parking_coord_repetition_RA.csv —",
    nrow(coord_repetition), "rows\n")

# Result 2: city-wide value frequency
value_frequency <- pa_res |>
  filter(zone_family == "RA (apartment)",
         `Lot Size` < 20,
         `Assessed Value` < 20000) |>
  group_by(`Assessed Value`) |>
  summarise(
    n_rows            = n(),
    n_coords          = n_distinct(paste(Latitude, Longitude)),
    n_neighbourhoods  = n_distinct(Neighbourhood),
    top_neighbourhood = names(sort(table(Neighbourhood),
                                   decreasing = TRUE))[1],
    .groups = "drop"
  ) |>
  arrange(desc(n_rows))

write_csv(value_frequency,
          "output/parking_value_frequency_RA.csv")
cat("Wrote: output/parking_value_frequency_RA.csv —",
    nrow(value_frequency), "rows\n")
# Lock the threshold at $15,000 — confirm final flagged count
pa_res |>
  mutate(is_parking_hist =
           `Assessed Value` < 15000 &
           `Lot Size` < 20 &
           zone_family %in% c("RA (apartment)",
                              "DC (direct control)",
                              "OTHER")
  ) |>
  summarise(
    total   = n(),
    flagged = sum(is_parking_hist, na.rm = TRUE),
    pct     = scales::percent(mean(is_parking_hist, na.rm = TRUE), 0.01),
    # Confirm nothing above $15K gets caught
    above_15k_flagged = sum(is_parking_hist & `Assessed Value` >= 15000,
                            na.rm = TRUE)
  ) |>
  print()
