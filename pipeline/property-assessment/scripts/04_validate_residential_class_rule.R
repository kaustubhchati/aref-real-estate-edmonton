# ============================================================
# 04_validate_residential_class_rule.R
# Validate the R1 residential-class filter against 2023 oracle.
#
# Rule (R1, polarity = keep):
#   Assessment Class 1 == 'RESIDENTIAL'
#   Rows where predicate is TRUE are retained for production.
#
# Inputs:
#   - data/processed/assess_2026_no_parking.csv   (post-parking public data)
#   - data/validation/edmonton_row_labels_2023.csv (oracle, no confidential xlsx)
#
# Outputs:
#   - output/r1_residential_class_validation_2023.csv  (long-format metrics)
#   - output/r1_residential_class_errors_2023.csv      (FP/FN by luc_1_desc)
#   - output/rule_scorecards_2023.csv                  (wide scoreboard, updated)
#
# Template: copy this file for future rules (R2, R3, ...).
# Change the six metadata fields below and the predicate in section PREDICATE.
# Everything else is invariant.
# ============================================================

# --- Metadata (change these six fields per rule) ------------
rule_id       <- "r1"
rule_slug     <- "residential_class"
rule_label    <- "Assessment Class 1 == 'RESIDENTIAL'"
rule_polarity <- "keep"   # keep = TRUE means retain; drop = TRUE means remove
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


# --- Load oracle (no confidential xlsx needed) --------------
oracle <- read_csv("data/validation/edmonton_row_labels_2023.csv",
                   show_col_types = FALSE)
cat("Oracle rows:", nrow(oracle), "\n")


# --- Join ---------------------------------------------------
validation <- assess_clean |>
  inner_join(oracle, by = "Account Number")

cat("Public rows:           ", nrow(assess_clean), "\n")
cat("Oracle rows:           ", nrow(oracle), "\n")
cat("Joined (intersection): ", nrow(validation), "\n\n")


# --- Predicate (change this block per rule) -----------------
# R1 keeps rows where Assessment Class 1 is RESIDENTIAL.
# Ground truth: is_5class == TRUE (canonical 5-class list from oracle).
validation <- validation |>
  mutate(pred_keep = `Assessment Class 1` == "RESIDENTIAL")


# --- Confusion matrix ---------------------------------------
# polarity = "keep":
#   pred_keep TRUE  + is_5class TRUE  -> TP
#   pred_keep TRUE  + is_5class FALSE -> FP
#   pred_keep FALSE + is_5class TRUE  -> FN
#   pred_keep FALSE + is_5class FALSE -> TN
tp <- sum(validation$pred_keep == TRUE  & validation$is_5class == TRUE)
fp <- sum(validation$pred_keep == TRUE  & validation$is_5class == FALSE)
fn <- sum(validation$pred_keep == FALSE & validation$is_5class == TRUE)
tn <- sum(validation$pred_keep == FALSE & validation$is_5class == FALSE)

precision    <- tp / (tp + fp)
recall       <- tp / (tp + fn)
f1           <- 2 * precision * recall / (precision + recall)
rows_kept    <- tp + fp
rows_dropped <- fn + tn

cat("--- Validation metrics ---\n")
cat(sprintf("TP: %d  FP: %d  FN: %d  TN: %d\n", tp, fp, fn, tn))
cat(sprintf("Precision: %s\n", percent(precision, accuracy = 0.01)))
cat(sprintf("Recall:    %s\n", percent(recall,    accuracy = 0.01)))
cat(sprintf("F1:        %s\n", percent(f1,        accuracy = 0.01)))
cat(sprintf("Rows kept (pred TRUE):     %d\n", rows_kept))
cat(sprintf("Rows dropped (pred FALSE): %d\n", rows_dropped))


# --- FP/FN breakdown by luc_1_desc -------------------------
false_positives <- validation |>
  filter(pred_keep == TRUE,  is_5class == FALSE) |>
  count(luc_1_desc, sort = TRUE)

false_negatives <- validation |>
  filter(pred_keep == FALSE, is_5class == TRUE) |>
  count(luc_1_desc, sort = TRUE)

cat("\n--- False positives (kept, should have been excluded) ---\n")
print(false_positives)

cat("\n--- False negatives (dropped, should have been kept) ---\n")
print(false_negatives)


# --- Write per-rule artefacts -------------------------------
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
  notes        = NA_character_
)

if (file.exists(board_file)) {
  existing <- read_csv(board_file,
                       col_types = cols(year = col_character(), .default = col_guess()),
                       show_col_types = FALSE)
  # Backfill missing columns when scoreboard schema is extended
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
