# ============================================================
# 05_validate_manufactured_homes_rule.R
# Validate the R3 manufactured-homes drop rule against 2023 oracle.
#
# Rule (r3, polarity = drop):
#   is.na(lot_size) from Property Information join (dkk9-cj3x)
#   Rows where predicate is TRUE are REMOVED from production.
#
# Signal: manufactured homes on leased land carry no registered lot_size
# in the Property Information dataset. Single-family detached and all
# canonical residential titles have a positive lot_size.
#
# Structural limitation: "Manufactured home (building and land)" titles
# sit on owned land and therefore have a lot_size. These 104 rows are
# structural false negatives — not catchable by this predicate.
# A separate R3b rule would be needed to address them.
# [OPEN] R3b: lot_size > 0, value ~$78k, year_built low → target building-and-land MFHs.
#
# Inputs:
#   - data/processed/assess_2026_no_parking.csv    (post-parking public data)
#   - data/raw/property_info_2026_20260519.csv      (Property Information, dkk9-cj3x)
#   - data/validation/edmonton_row_labels_2023.csv  (oracle)
#
# Outputs (§6.2 naming):
#   - output/r3_manufactured_homes_validation_2023.csv
#   - output/r3_manufactured_homes_errors_2023.csv
#   - output/rule_scorecards_2023.csv (scoreboard updated)
# ============================================================

# --- Metadata -----------------------------------------------
rule_id       <- "r3"
rule_slug     <- "manufactured_homes"
rule_label    <- "is.na(lot_size) [Property Information join, dkk9-cj3x]"
rule_polarity <- "drop"
year_tag      <- "2023"

# --- Setup --------------------------------------------------
dir.create("output", showWarnings = FALSE, recursive = TRUE)
library(tidyverse)
library(scales)


# --- Load parking-cleaned public data -----------------------
if (!exists("assess_clean")) {
  message("assess_clean not in env — reading from disk")
  assess_clean <- read_csv("data/processed/assess_2026_no_parking.csv",
                           show_col_types = FALSE)
}
cat("Public rows (post-parking):", nrow(assess_clean), "\n")


# --- Apply R1 filter (pipeline ordering: R1 runs before R3) -
assess_r1 <- assess_clean |>
  filter(`Assessment Class 1` == "RESIDENTIAL")
cat("Rows after R1 filter (Assessment Class 1 == RESIDENTIAL):", nrow(assess_r1), "\n\n")


# --- Load Property Information (dkk9-cj3x) ------------------
# Columns colliding with assessment side are renamed info_ (§4.1).
# Unique columns used here: lot_size, Total Gross Area, year_built.
info_path <- "data/raw/property_info_2026_20260519.csv"
info_raw  <- read_csv(info_path, show_col_types = FALSE)
cat("Property Information rows:", nrow(info_raw), "\n")

info_clean <- info_raw |>
  rename(
    info_neighbourhood    = Neighbourhood,
    info_neighbourhood_id = `Neighbourhood ID`,
    info_ward             = Ward,
    info_latitude         = Latitude,
    info_longitude        = Longitude,
    info_suite            = Suite,
    info_house_number     = `House Number`,
    info_street_name      = `Street Name`,
    info_point_location   = `Point Location`
  ) |>
  select(`Account Number`, lot_size,
         total_gross_area = `Total Gross Area`,
         year_built)


# --- Join assessment + Property Information -----------------
assess_full <- assess_r1 |>
  left_join(info_clean, by = "Account Number")

cat("Rows after join:", nrow(assess_full), "\n")
cat("Rows with NA lot_size:", sum(is.na(assess_full$lot_size)), "\n\n")


# --- Load oracle --------------------------------------------
oracle <- read_csv("data/validation/edmonton_row_labels_2023.csv",
                   show_col_types = FALSE)
cat("Oracle rows:", nrow(oracle), "\n")


# --- Join to oracle -----------------------------------------
validation <- assess_full |>
  inner_join(oracle, by = "Account Number")

cat("Public rows (post-R1):    ", nrow(assess_full), "\n")
cat("Oracle rows:              ", nrow(oracle), "\n")
cat("Joined (intersection):    ", nrow(validation), "\n\n")


# --- Ground truth: manufactured home Luc 1 descriptions -----
# Enumerated from 2023 confidential Luc 1 Description column (script 03).
# "building only"       = leased land, no lot_size → catchable by this rule.
# "building and land"   = owned land, has lot_size → structural FN for this rule.
manufactured_descriptions <- c(
  "Manufactured home (building only)",
  "Manufactured home (building and land)"
)

validation <- validation |>
  mutate(is_mfh_conf = luc_1_desc %in% manufactured_descriptions)

cat("Confidential MFH rows (all types):    ", sum(validation$is_mfh_conf), "\n")
cat("  building only (catchable):           ",
    sum(validation$luc_1_desc == "Manufactured home (building only)", na.rm = TRUE), "\n")
cat("  building and land (structural FN):   ",
    sum(validation$luc_1_desc == "Manufactured home (building and land)", na.rm = TRUE), "\n\n")


# --- Predicate (R3: drop rows where lot_size is NA) ---------
validation <- validation |>
  mutate(pred_drop = is.na(lot_size))


# --- Confusion matrix (polarity = drop) ----------------------
# pred_drop TRUE  + is_mfh_conf TRUE  -> TP (correctly flagged for removal)
# pred_drop TRUE  + is_mfh_conf FALSE -> FP (wrongly flagged)
# pred_drop FALSE + is_mfh_conf TRUE  -> FN (missed manufactured homes)
# pred_drop FALSE + is_mfh_conf FALSE -> TN (correctly retained)
tp <- sum(validation$pred_drop == TRUE  & validation$is_mfh_conf == TRUE)
fp <- sum(validation$pred_drop == TRUE  & validation$is_mfh_conf == FALSE)
fn <- sum(validation$pred_drop == FALSE & validation$is_mfh_conf == TRUE)
tn <- sum(validation$pred_drop == FALSE & validation$is_mfh_conf == FALSE)

precision    <- tp / (tp + fp)
recall       <- tp / (tp + fn)
f1           <- 2 * precision * recall / (precision + recall)
rows_kept    <- tp + fp   # rows flagged for removal
rows_dropped <- fn + tn   # rows flowing to production

cat("--- Validation metrics ---\n")
cat(sprintf("TP: %d  FP: %d  FN: %d  TN: %d\n", tp, fp, fn, tn))
cat(sprintf("Precision: %s\n", percent(precision, accuracy = 0.01)))
cat(sprintf("Recall:    %s\n", percent(recall,    accuracy = 0.01)))
cat(sprintf("F1:        %s\n", percent(f1,        accuracy = 0.01)))
cat(sprintf("Rows flagged for removal (pred TRUE):    %d\n", rows_kept))
cat(sprintf("Rows flowing to production (pred FALSE): %d\n", rows_dropped))


# --- FP/FN breakdown ----------------------------------------
false_positives <- validation |>
  filter(pred_drop == TRUE,  is_mfh_conf == FALSE) |>
  count(luc_1_desc, sort = TRUE)

false_negatives <- validation |>
  filter(pred_drop == FALSE, is_mfh_conf == TRUE) |>
  count(luc_1_desc, sort = TRUE)

cat("\n--- False positives (flagged, oracle says not manufactured home) ---\n")
print(false_positives)

cat("\n--- False negatives (oracle says MFH, not flagged) ---\n")
cat("Expected: ~104 rows of type 'building and land' (structural FN)\n")
print(false_negatives)


# --- Write per-rule artefacts (§6.2 naming) -----------------
val_file   <- sprintf("output/%s_%s_validation_%s.csv", rule_id, rule_slug, year_tag)
err_file   <- sprintf("output/%s_%s_errors_%s.csv",     rule_id, rule_slug, year_tag)
board_file <- sprintf("output/rule_scorecards_%s.csv",  year_tag)

validation_summary <- tibble(
  rule_id    = rule_id,
  rule_slug  = rule_slug,
  rule_label = rule_label,
  year       = year_tag,
  metric     = c("precision", "recall", "f1",
                 "true_pos", "false_pos", "false_neg", "true_neg",
                 "rows_scored"),
  value      = c(precision, recall, f1,
                 tp, fp, fn, tn,
                 nrow(validation))
)
write_csv(validation_summary, val_file)
cat("\nWrote:", val_file, "\n")

bind_rows(
  false_positives |> mutate(error_type = "false_positive"),
  false_negatives |> mutate(error_type = "false_negative")
) |>
  mutate(rule_id = rule_id, rule_slug = rule_slug) |>
  select(rule_id, rule_slug, luc_1_desc, n, error_type) |>
  write_csv(err_file)
cat("Wrote:", err_file, "\n")


# --- Update scoreboard (remove-then-append, never overwrite) -
# See CLAUDE.md §7.3: this is the only acceptable scoreboard update pattern.
scoreboard_row <- tibble(
  rule_id      = rule_id,
  rule_slug    = rule_slug,
  rule_label   = rule_label,
  polarity     = rule_polarity,
  year         = year_tag,
  precision    = precision,
  recall       = recall,
  f1           = f1,
  true_pos     = tp,
  false_pos    = fp,
  false_neg    = fn,
  true_neg     = tn,
  rows_scored  = nrow(validation),
  rows_kept    = rows_kept,
  rows_dropped = rows_dropped,
  notes        = paste(
    "Removes manufactured homes on leased land via NA lot_size",
    "(Property Information join, dkk9-cj3x). Ground truth: 2 Luc 1 strings",
    "(building only + building and land). Structural FNs: ~104 rows of type",
    "'building and land' own their lot and have lot_size > 0 — not catchable",
    "by this predicate. See [OPEN] R3b for a follow-on rule targeting those."
  )
)

if (file.exists(board_file)) {
  existing <- read_csv(board_file,
                       col_types = cols(year = col_character(), .default = col_guess()),
                       show_col_types = FALSE)
  for (col in setdiff(names(scoreboard_row), names(existing))) {
    message(sprintf("Scoreboard migration: adding column '%s'", col))
    existing[[col]] <- NA
  }
  updated <- existing |>
    filter(rule_id != !!rule_id) |>
    bind_rows(scoreboard_row)
} else {
  updated <- scoreboard_row
}

write_csv(updated, board_file)
cat("Wrote:", board_file, sprintf("(%d rules)\n", nrow(updated)))
