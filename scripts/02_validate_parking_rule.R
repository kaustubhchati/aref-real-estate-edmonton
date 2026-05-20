# ============================================================
# 02_validate_parking_rule.R
# Validate the public-data parking-detection rule against
# 2023 confidential labels.
#
# Rule (parking, polarity = drop):
#   n_at_coord >= 20 AND Assessed Value <= 80000 AND value repeats >= 10x at coord
#   Rows where predicate is TRUE are REMOVED from production.
#
# NOTE: This script opens the confidential xlsx directly because the
# oracle CSVs (built by script 03) were constructed post-parking-removal
# and therefore do not contain parking rows. The xlsx access here is the
# single authorised exception to the §7.1 rule — the parking rule cannot
# be scored against the oracle CSVs alone.
#
# Inputs:
#   - assess_with_flag (from env) OR data/processed/assess_2026_with_flags.csv
#   - confidential xlsx at confidential_path
#
# Outputs (§6.2 naming):
#   - output/parking_condo_parking_value_cluster_validation_2023.csv
#   - output/parking_condo_parking_value_cluster_errors_2023.csv
#   - output/rule_scorecards_2023.csv  (scoreboard updated)
# ============================================================

# --- Metadata -----------------------------------------------
rule_id       <- "parking"
rule_slug     <- "condo_parking_value_cluster"
rule_label    <- "n_at_coord >= 20 AND Assessed Value <= 80000 AND value repeats >= 10x at coord"
rule_polarity <- "drop"
year_tag      <- "2023"

# --- Setup --------------------------------------------------
dir.create("output", showWarnings = FALSE, recursive = TRUE)
library(tidyverse)
library(readxl)
library(scales)
source("scripts/00_theme.R")


# --- Recover assess_with_flag if not in env -----------------
if (!exists("assess_with_flag")) {
  message("assess_with_flag not in env — reading from disk")
  assess_with_flag <- read_csv("data/processed/assess_2026_with_flags.csv",
                               show_col_types = FALSE)
}
cat("Public rows (pre-filter, with flag):", nrow(assess_with_flag), "\n")
cat("Flagged as parking:                 ",
    sum(assess_with_flag$is_parking), "\n\n")


# --- Load 2023 confidential file ----------------------------
# Adjust path to wherever the file lives on your machine.
confidential_path <- "/Users/kaustubhchati/Desktop/RA/conf_2023_test.xlsx"

conf_2023 <- read_excel(confidential_path, skip = 3)
glimpse(conf_2023)

conf_2023 |>
  count(`Primary Mbc Code`, sort = TRUE) |>
  filter(n < 500) |>
  print(n = 100)

conf_2023 |>
  count(`Luc 1 Description`, sort = TRUE) |>
  print(n = 30)


# --- Ground truth: parking Luc 1 descriptions ---------------
# Enumerated from 2023 confidential Luc 1 Description column.
# These are the three types the dashboard should always exclude.
parking_descriptions <- c(
  "Residential condominium parking stall",
  "Accessory structure in residential condominium complex",
  "Non-residential condominium parking stall"
)

conf_2023_clean <- conf_2023 |>
  transmute(
    acc_id_clean    = as.numeric(`Acc Id`),
    luc_1_desc      = `Luc 1 Description`,
    is_parking_conf = `Luc 1 Description` %in% parking_descriptions
  ) |>
  filter(!is.na(acc_id_clean))

cat("Confidential rows:          ", nrow(conf_2023_clean), "\n")
cat("Confidential parking rows:  ", sum(conf_2023_clean$is_parking_conf), "\n\n")


# --- Join public data + flag to confidential labels ---------
validation <- assess_with_flag |>
  inner_join(conf_2023_clean, by = c("Account Number" = "acc_id_clean"))

cat("Public rows:           ", nrow(assess_with_flag), "\n")
cat("Confidential rows:     ", nrow(conf_2023_clean), "\n")
cat("Joined (intersection): ", nrow(validation), "\n\n")


# --- Confusion matrix ----------------------------------------
# polarity = "drop":
#   is_parking TRUE  + is_parking_conf TRUE  -> TP (correctly flagged for removal)
#   is_parking TRUE  + is_parking_conf FALSE -> FP (wrongly flagged)
#   is_parking FALSE + is_parking_conf TRUE  -> FN (missed parking)
#   is_parking FALSE + is_parking_conf FALSE -> TN (correctly retained)
validation |>
  count(is_parking, is_parking_conf) |>
  mutate(pct = percent(n / sum(n), accuracy = 0.01)) |>
  arrange(desc(n))

tp <- sum(validation$is_parking == TRUE  & validation$is_parking_conf == TRUE)
fp <- sum(validation$is_parking == TRUE  & validation$is_parking_conf == FALSE)
fn <- sum(validation$is_parking == FALSE & validation$is_parking_conf == TRUE)
tn <- sum(validation$is_parking == FALSE & validation$is_parking_conf == FALSE)

precision    <- tp / (tp + fp)
recall       <- tp / (tp + fn)
f1           <- 2 * precision * recall / (precision + recall)
rows_kept    <- tp + fp   # rows flagged for removal (pred TRUE)
rows_dropped <- fn + tn   # rows NOT flagged = production-bound

cat("--- Validation metrics ---\n")
cat(sprintf("TP: %d  FP: %d  FN: %d  TN: %d\n", tp, fp, fn, tn))
cat(sprintf("Precision: %s\n", percent(precision, accuracy = 0.01)))
cat(sprintf("Recall:    %s\n", percent(recall,    accuracy = 0.01)))
cat(sprintf("F1:        %s\n", percent(f1,        accuracy = 0.01)))
cat(sprintf("Rows flagged for removal (pred TRUE):  %d\n", rows_kept))
cat(sprintf("Rows flowing to production (pred FALSE): %d\n", rows_dropped))


# --- FP/FN breakdown ----------------------------------------
false_positives <- validation |>
  filter(is_parking == TRUE,  is_parking_conf == FALSE) |>
  count(luc_1_desc, sort = TRUE)

false_negatives <- validation |>
  filter(is_parking == FALSE, is_parking_conf == TRUE) |>
  count(luc_1_desc, sort = TRUE)

cat("\n--- False positives (flagged, confidential says not parking) ---\n")
print(false_positives)

cat("\n--- False negatives (confidential says parking, we missed) ---\n")
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
    "Detects condo parking stalls via spatial+value clustering.",
    "Ground truth: 3 Luc 1 strings (Residential/Non-residential",
    "condominium parking stall, Accessory structure in residential",
    "condominium complex). FPs include manufactured homes that share",
    "the value-clustering signature.",
    "NOTE: scored against confidential xlsx directly (oracle CSVs",
    "were built post-parking-removal and omit parking rows)."
  )
)

if (file.exists(board_file)) {
  existing <- read_csv(board_file, show_col_types = FALSE)
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
