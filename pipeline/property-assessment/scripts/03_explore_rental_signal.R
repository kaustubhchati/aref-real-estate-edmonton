# ============================================================
# 03_explore_rental_signal.R
# Section A — Load Property Information, merge with parking-cleaned
# public data, build validation references from 2023 confidential file.
#
# Inputs:
#   - assess_clean (from 01_load_data.R) — 394,492 rows, parking removed
#     OR data/processed/assess_2026_no_parking.csv on disk
#   - Property Information current year from data.edmonton.ca (dkk9-cj3x)
#   - 2023 confidential xlsx at confidential_path
#
# Outputs:
#   - assess_full: public file with Property Information features merged in
#   - data/validation/edmonton_row_labels_2023.csv — per-accountnumber labels
#   - data/validation/edmonton_neighbourhood_truth_2023.csv — per-nbhd truth
#
# IMPORTANT: confidential data is bound by data-sharing terms.
# This script touches it ONCE to build the validation references,
# then everything downstream reads from the CSVs.
# ============================================================

library(tidyverse)
library(readxl)
library(scales)

# --- Make sure output directories exist ---------------------
dir.create("data/validation",      showWarnings = FALSE, recursive = TRUE)
dir.create("output",                showWarnings = FALSE, recursive = TRUE)


# ============================================================
# A.1 — Recover assess_clean (parking-removed public data)
# ============================================================

# If 01 hasn't been run this session, load the persisted version
if (!exists("assess_clean")) {
  message("assess_clean not in env — reading from disk")
  assess_clean <- read_csv("data/processed/assess_2026_no_parking.csv",
                           show_col_types = FALSE)
}

cat("Parking-cleaned public rows:", nrow(assess_clean), "\n")

# ============================================================
# A.2 — Load Property Information (dkk9-cj3x)
# ============================================================
# Same source convention as Property Assessment, different dataset ID.
# Property Information has its own Neighbourhood / Neighbourhood ID /
# Latitude / Longitude / Suite columns that collide with Property Assessment.
# We rename Information-side duplicates with an info_ prefix at load,
# so the merged frame keeps Assessment-side fields as canonical (those
# are what the Tableau dashboard displays and what the public expects).

url_info_current <- "https://data.edmonton.ca/api/views/dkk9-cj3x/rows.csv?accessType=DOWNLOAD"

info_raw <- read_csv(url_info_current, show_col_types = FALSE) |>
  rename(
    info_Neighbourhood     = Neighbourhood,
    `info_Neighbourhood ID` = `Neighbourhood ID`,
    info_Ward              = Ward,
    info_Latitude          = Latitude,
    info_Longitude         = Longitude,
    info_Suite             = Suite,
    `info_House Number`    = `House Number`,
    `info_Street Name`     = `Street Name`,
    `info_Point Location`  = `Point Location`
  )

# Inspect
cat("\n--- Property Information ---\n")
cat("Rows:", nrow(info_raw), "  Cols:", ncol(info_raw), "\n")

# Should now have zero columns that collide with assess_clean
collisions <- intersect(names(assess_clean), names(info_raw))
cat("Columns in both files (should be just 'Account Number'):\n")
print(collisions)


# ============================================================
# A.3 — Merge Property Information into parking-cleaned data
# ============================================================
assess_full <- assess_clean |>
  left_join(info_raw, by = "Account Number")

# Left join must never fan out (one-to-one on Account Number)
stopifnot(nrow(assess_full) == nrow(assess_clean))

cat("\n--- Merged frame ---\n")
cat("Rows:", nrow(assess_full),
    " (expected:", nrow(assess_clean), ")\n")
cat("Cols:", ncol(assess_full), "\n")


# Sanity: how many rows got Information features?
# Pick any Information-only column. "Lot Size" is in the expected list below;
# if it doesn't exist under that exact name, the variant search a few lines
# down will surface what it's actually called.
info_only_cols <- setdiff(names(info_raw), names(assess_clean))
if (length(info_only_cols) > 0) {
  probe_col <- info_only_cols[1]
  n_with_info <- sum(!is.na(assess_full[[probe_col]]))
  cat("Rows with Information match (via '", probe_col, "'): ",
      n_with_info, " / ", nrow(assess_full),
      " (", scales::percent(n_with_info / nrow(assess_full), 0.1), ")\n",
      sep = "")
}
# --- Quick column presence check ----------------------------
# Stata pipeline expected these fields from Property Information.
# What got them, under what names? Print the actuals.

expected_info_fields <- c(
  "Lot Size",
  "Year Built",
  "Total Gross Area",
  "Zoning",
  "Legal Description",
  "Suite",
  "Garage"
)

cat("\n--- Expected Information fields presence check ---\n")
for (col in expected_info_fields) {
  present <- col %in% names(assess_full)
  cat(if (present) "  found:    " else "  MISSING:  ", col, "\n", sep = "")
}

# If a field is missing under the expected name, check for variants
cat("\n--- Variant search for any missing fields ---\n")
for (col in expected_info_fields) {
  if (!(col %in% names(assess_full))) {
    keyword <- tolower(strsplit(col, " ")[[1]][1])
    matches <- names(assess_full)[grepl(keyword, names(assess_full),
                                        ignore.case = TRUE)]
    cat("  '", col, "' missing — similar columns: ",
        paste(matches, collapse = ", "), "\n", sep = "")
  }
}


# ============================================================
# A.4 — Reload confidential file with full column set
# ============================================================
# Yesterday's 02_validate_parking_rule.R kept only acc_id_clean + luc_1_desc.
# For row-level oracle we also want: Luc 1 Percent, Primary Mbc Code,
# Mill Class 1, Actual Zone, Total Asmt — useful for richer labelling
# and aggregate-level truth.

confidential_path <- "/Users/kaustubhchati/Desktop/RA/conf_2023_test.xlsx"

# read_excel will throw type-guessing warnings for col O/P — ignorable.
conf_full <- read_excel(confidential_path, skip = 3)
cat("\nConfidential raw rows:", nrow(conf_full), "\n")


# --- Build per-row confidential snapshot --------------------
# Cast types deliberately. Acc Id must be numeric to join.

conf_clean <- conf_full |>
  transmute(
    acc_id          = as.numeric(`Acc Id`),
    luc_1_desc      = `Luc 1 Description`,
    luc_1_pct       = as.numeric(`Luc 1 Percent`),
    primary_mbc     = `Primary Mbc Code`,
    mill_class_1    = `Mill Class 1`,
    actual_zone     = `Actual Zone`,
    total_asmt_conf = as.numeric(`Total Asmt`),
    nbhd_desc_conf  = `Nghb Description`
  ) |>
  filter(!is.na(acc_id))

cat("Confidential cleaned rows:", nrow(conf_clean), "\n")


# ============================================================
# A.5 — Derive is_5class flag (Stata 2 lines 161-169 logic)
# ============================================================
# The 5 target Luc 1 strings are what the previous RA's pipeline
# treated as "real residential title" — the rows whose averages
# the dashboard displays. is_5class = TRUE means a clean residential
# title; FALSE means contamination (rental, accessory, vacant, etc).

target_luc <- c(
  # target 1
  "Single-family, detached house",
  # target 2
  "Semi-detached residence in duplex",
  # target 3
  "Row house condominium",
  # target 4
  "Lowrise condominium",
  "Highrise condominium",
  # target 5
  "Residential bare land condominium (land and building)",
  "Carriage home condominium",
  "Semi-detached residence in multiplex (four and more)",
  "Semi-detached residence in triplex",
  "Duplex",
  "Fourplex",
  "Triplex"
)

conf_with_label <- conf_clean |>
  mutate(
    is_5class = luc_1_desc %in% target_luc,
    is_parking_conf = luc_1_desc %in% c(
      "Residential condominium parking stall",
      "Accessory structure in residential condominium complex",
      "Non-residential condominium parking stall"
    )
  )

# Quick distribution check
cat("\n--- Confidential row label distribution ---\n")

conf_with_label |>
  count(is_5class, is_parking_conf) |>
  mutate(pct = scales::percent(n / sum(n), accuracy = 0.1)) |>
  arrange(desc(n)) |>
  print()


# ============================================================
# A.6 — Join confidential labels into parking-cleaned public data
# ============================================================
# Use inner join to get the 415,555-ish overlap (minus 45,277 parking
# rows already dropped from assess_clean). Roughly 370k rows expected.

assess_full_labelled <- assess_full |>
  inner_join(conf_with_label,
             by = c("Account Number" = "acc_id"))

cat("\n--- Labelled, parking-cleaned, Information-merged frame ---\n")
cat("Rows:", nrow(assess_full_labelled), "\n")
cat("(public parking-cleaned:", nrow(assess_clean), ")\n")
cat("(confidential labelled: ", nrow(conf_with_label), ")\n")

# Label distribution in the joined frame
cat("\n--- is_5class distribution in joined frame ---\n")
assess_full_labelled |>
  count(is_5class) |>
  mutate(pct = scales::percent(n / sum(n), accuracy = 0.1)) |>
  print()


# ============================================================
# A.7 — Write row-level validation reference CSV
# ============================================================
# Smallest useful row-level oracle: account number, label, raw Luc desc.
# Future scripts (rental rule, etc.) read this to score precision/recall.

row_labels <- assess_full_labelled |>
  transmute(
    `Account Number`,
    is_5class,
    is_parking_conf,
    luc_1_desc,
    primary_mbc,
    luc_1_pct
  )

write_csv(row_labels, "data/validation/edmonton_row_labels_2023.csv")
cat("\nWrote: data/validation/edmonton_row_labels_2023.csv —",
    nrow(row_labels), "rows\n")


# ============================================================
# A.8 — Write per-neighbourhood ground-truth CSV
# ============================================================
# If the A.2 rename worked, assess_full_labelled has a single
# canonical `Neighbourhood` column from the Property Assessment file.
# If it didn't, we'll have Neighbourhood.x / Neighbourhood.y and need
# to pick .x (Assessment-side). Detect and branch.

nbhd_col <- if ("Neighbourhood" %in% names(assess_full_labelled)) {
  "Neighbourhood"
} else if ("Neighbourhood.x" %in% names(assess_full_labelled)) {
  warning("Neighbourhood collision detected — A.2 rename missed a column. ",
          "Using Neighbourhood.x (Assessment-side).")
  "Neighbourhood.x"
} else {
  stop("No Neighbourhood column found in assess_full_labelled.")
}

nbhd_truth <- assess_full_labelled |>
  filter(is_5class) |>
  group_by(.data[[nbhd_col]]) |>
  summarise(
    n_5class_rows         = n(),
    mean_assessed_value   = mean(`Assessed Value`, na.rm = TRUE),
    median_assessed_value = median(`Assessed Value`, na.rm = TRUE),
    sd_assessed_value     = sd(`Assessed Value`, na.rm = TRUE),
    .groups = "drop"
  ) |>
  rename(Neighbourhood = !!nbhd_col)

write_csv(nbhd_truth, "data/validation/edmonton_neighbourhood_truth_2023.csv")
cat("Wrote: data/validation/edmonton_neighbourhood_truth_2023.csv —",
    nrow(nbhd_truth), "neighbourhoods\n")

# Quick sanity check on the output
cat("\n--- First 10 neighbourhoods (alphabetical) ---\n")
nbhd_truth |>
  arrange(Neighbourhood) |>
  slice_head(n = 10) |>
  print()

cat("\n--- 5 largest neighbourhoods by N ---\n")
nbhd_truth |>
  arrange(desc(n_5class_rows)) |>
  slice_head(n = 5) |>
  print()
# ============================================================
# Section B — Profile contamination in public features
#
# Inputs (in env from Section A):
#   - assess_full_labelled: 371,244 rows
#
# Output: stdout only — exploratory, no files written
# ============================================================
# --- Section B prep: snake_case aliases for ergonomic referencing ---
assess_full_labelled <- assess_full_labelled |>
  mutate(
    lot_size          = `Lot Size`,
    year_built        = `Year Built`,
    total_gross_area  = `Total Gross Area`,
    zoning            = Zoning,
    legal_description = `Legal Description`
  )
# --- B.1 — What's in the contamination? ---------------------
cat("\n=== B.1 — Luc 1 inventory of contamination (non-5class rows) ===\n")
contamination_inventory <- assess_full_labelled |>
  filter(!is_5class) |>
  count(luc_1_desc, sort = TRUE) |>
  mutate(pct = scales::percent(n / sum(n), accuracy = 0.1))

print(contamination_inventory, n = 30)

cat("\nTotal contamination rows:",
    sum(contamination_inventory$n), "\n")
cat("Distinct Luc 1 types in contamination:",
    nrow(contamination_inventory), "\n")


# --- B.2 — Public-side numeric feature contrast --------------
cat("\n=== B.2 — Numeric features by is_5class ===\n")

# Note the mixed quoting — TitleCase needs backticks, snake_case doesn't
numeric_features <- c("Assessed Value", "Total Gross Area", "lot_size", "year_built")

for (col in numeric_features) {
  cat("\n---", col, "---\n")
  result <- assess_full_labelled |>
    group_by(is_5class) |>
    summarise(
      n         = n(),
      n_missing = sum(is.na(.data[[col]])),
      median    = median(.data[[col]], na.rm = TRUE),
      q25       = quantile(.data[[col]], 0.25, na.rm = TRUE),
      q75       = quantile(.data[[col]], 0.75, na.rm = TRUE),
      .groups   = "drop"
    )
  print(result)
}

# --- B.3 — Assessment Class 1 vs is_5class -------------------
# The most important categorical check. If "OTHER RESIDENTIAL" is mostly
# in contamination and "RESIDENTIAL" is mostly in is_5class, this is THE
# rental-detection signal yesterday's hypothesis predicted.

cat("\n=== B.3 — Assessment Class 1 by is_5class ===\n")
assess_full_labelled |>
  count(is_5class, `Assessment Class 1`) |>
  pivot_wider(names_from = is_5class, values_from = n, values_fill = 0) |>
  rename(contam_FALSE = `FALSE`, clean_TRUE = `TRUE`) |>
  mutate(
    total = contam_FALSE + clean_TRUE,
    pct_contam = scales::percent(
      contam_FALSE / total, accuracy = 0.1
    )
  ) |>
  arrange(desc(total)) |>
  print()


# --- B.4 — Zoning by is_5class (top 15 zones) ---------------
cat("\n=== B.4 — zoning by is_5class (top 15 by volume) ===\n")
assess_full_labelled |>
  filter(!is.na(zoning)) |>
  count(is_5class, zoning) |>
  pivot_wider(names_from = is_5class, values_from = n, values_fill = 0) |>
  rename(contam = `FALSE`, clean = `TRUE`) |>
  mutate(
    total = contam + clean,
    pct_contam = round(contam / total, 3)
  ) |>
  arrange(desc(total)) |>
  slice_head(n = 15) |>
  print()


# --- B.5 — Value per square metre (mvalue_psm) --------------
cat("\n=== B.5 — Value per sqm by is_5class ===\n")
mvalue_check <- assess_full_labelled |>
  filter(`Total Gross Area` > 0, !is.na(`Total Gross Area`)) |>
  mutate(mvalue_psm = `Assessed Value` / `Total Gross Area`) |>
  group_by(is_5class) |>
  summarise(
    n          = n(),
    median_psm = median(mvalue_psm, na.rm = TRUE),
    q10_psm    = quantile(mvalue_psm, 0.10, na.rm = TRUE),
    q25_psm    = quantile(mvalue_psm, 0.25, na.rm = TRUE),
    q75_psm    = quantile(mvalue_psm, 0.75, na.rm = TRUE),
    q90_psm    = quantile(mvalue_psm, 0.90, na.rm = TRUE),
    .groups    = "drop"
  )
print(mvalue_check)


# --- B.6 — unit_present derived from legal_description -------
cat("\n=== B.6 — unit_present by is_5class ===\n")
assess_full_labelled |>
  mutate(
    legal_low = tolower(legal_description),
    unit_present = !is.na(legal_low) & grepl("unit:", legal_low, fixed = TRUE)
  ) |>
  count(is_5class, unit_present) |>
  pivot_wider(names_from = is_5class, values_from = n, values_fill = 0) |>
  rename(contam = `FALSE`, clean = `TRUE`) |>
  mutate(pct_contam = round(contam / (contam + clean), 3)) |>
  print()


# --- B.7 — Top 5 contaminant Luc types: public-side profile ---
# Drill into the dominant contamination types. If one of them shows
# a public-side signal that's near-100% within that type, that's
# basically a hand-written rule waiting to be ratified.

cat("\n=== B.7 — Top 5 contaminant Luc types: public-side profile ===\n")

top_contam_types <- contamination_inventory |>
  slice_head(n = 5) |>
  pull(luc_1_desc)

for (luc_type in top_contam_types) {
  cat("\n---", luc_type, "---\n")
  assess_full_labelled |>
    filter(luc_1_desc == luc_type) |>
    summarise(
      n              = n(),
      median_value   = median(`Assessed Value`, na.rm = TRUE),
      median_area    = median(`Total Gross Area`, na.rm = TRUE),
      median_lot     = median(lot_size, na.rm = TRUE),
      pct_oresid     = round(mean(`Assessment Class 1` == "OTHER RESIDENTIAL",
                                  na.rm = TRUE), 3),
      pct_resid      = round(mean(`Assessment Class 1` == "RESIDENTIAL",
                                  na.rm = TRUE), 3),
      pct_unit_legal = round(mean(grepl("unit:", tolower(legal_description),
                                        fixed = TRUE), na.rm = TRUE), 3),
      pct_with_zone  = round(mean(!is.na(zoning)), 3)
    ) |>
    print()
}

