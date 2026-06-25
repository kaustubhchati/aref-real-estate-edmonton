# ============================================================
# 06b_parking_conf_check_historical.R
# AREF Open Data Centre — Historical Assessment Parking Validation
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Left-join 2023 confidential file onto historical pa_res
#   by Account Number across ALL years. Account Numbers that exist
#   in the confidential file carry their luc_1_desc label to every
#   year they appear in the historical file — same physical property,
#   same stall type regardless of year. Cross-check R_PARK_HIST rule
#   against luc_1_desc ground truth on all matched rows.
#
# METHODOLOGY BOUNDARY (locked):
#   Confidential file is validation oracle ONLY.
#   Used here to score precision/recall of R_PARK_HIST rule.
#   Never filters the output CSV. Never runs in production.
#
# INPUTS:
#   pa_res     — must be in environment with zone_family column
#                (built in 06a zoning classification block)
#   confidential xlsx located via AREF_CONF_PATH (env var; see _bootstrap.R conf_path)
#
# OUTPUTS:
#   output/hist_parking_conf_check.csv     — all matched rows + luc_1_desc + flags
#   output/hist_parking_luc_dist.csv       — luc_1_desc distribution flagged vs not
#   output/hist_parking_fp_breakdown.csv   — false positives by luc + neighbourhood
#   output/hist_parking_fn_breakdown.csv   — false negatives by luc + zone family
# ============================================================

library(tidyverse)
library(readxl)
library(scales)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

dir.create("output", showWarnings = FALSE, recursive = TRUE)

# ============================================================
# GUARD: pa_res + zone_family must exist in environment
# ============================================================

if (!exists("pa_res")) {
  stop(paste(
    "pa_res not found in environment.",
    "Run 06a first to load and filter the historical dataset."
  ))
}

if (!"zone_family" %in% names(pa_res)) {
  stop(paste(
    "zone_family column missing from pa_res.",
    "Run the zoning classification block in 06a first.",
    "Look for: pa_res <- pa_res |> mutate(zone_family = case_when(...))"
  ))
}

cat("pa_res rows in environment: ",
    format(nrow(pa_res), big.mark = ","), "\n\n")

# ============================================================
# 1. Load confidential file (oracle: operator-only, skipped on clean clone)
#    Oracle located via AREF_CONF_PATH in ~/.Renviron (see _bootstrap.R conf_path)
# ============================================================

if (file.exists(conf_path())) {

  confidential_path <- conf_path()

  # read_excel throws type-guessing warnings for col O/P — ignorable
  conf_raw <- read_excel(confidential_path, skip = 3)
  cat("Confidential raw rows: ", format(nrow(conf_raw), big.mark = ","), "\n")

  # ============================================================
  # 2. Build confidential labels frame
  #    Parking descriptions enumerated from script 02 and 03
  # ============================================================

  parking_descriptions <- c(
    "Residential condominium parking stall",
    "Accessory structure in residential condominium complex",
    "Non-residential condominium parking stall"
  )

  conf_clean <- conf_raw |>
    transmute(
      acc_id_clean    = as.numeric(`Acc Id`),
      luc_1_desc      = `Luc 1 Description`,
      is_parking_conf = `Luc 1 Description` %in% parking_descriptions
    ) |>
    filter(!is.na(acc_id_clean))

  cat("Confidential cleaned rows:  ",
      format(nrow(conf_clean), big.mark = ","), "\n")
  cat("Confidential parking rows:  ",
      format(sum(conf_clean$is_parking_conf), big.mark = ","), "\n\n")

  # ============================================================
  # 3. Deduplicate confidential on acc_id_clean
  #    Account Numbers should be unique in the 2023 file.
  #    If duplicates exist, keep first — same property, same label.
  # ============================================================

  n_conf_raw <- nrow(conf_clean)

  conf_clean <- conf_clean |>
    distinct(acc_id_clean, .keep_all = TRUE)

  n_dupes <- n_conf_raw - nrow(conf_clean)

  if (n_dupes > 0) {
    cat("Duplicate acc_ids removed from confidential: ", n_dupes, "\n\n")
  } else {
    cat("No duplicate acc_ids in confidential file.\n\n")
  }

  # ============================================================
  # 4. Apply R_PARK_HIST flag to pa_res
  #
  # RULE: Assessed Value < $15,000
  #       AND Lot Size < 20 m²
  #       AND zone_family in (RA, DC, OTHER)
  #
  # Threshold rationale: parking price ladder confirmed at $500–$14K
  # from value repetition analysis. $15K–$20K rows (Oliver, Glastonbury,
  # Boyle Street) are legitimate low-value inner-city condos — retained.
  # RF family excluded — RF5/RF6 condo proportional lots protected.
  # NA zone excluded — conservative; 2025 data quality gap accepted.
  # ============================================================

  pa_res_flagged <- pa_res |>
    mutate(is_parking_hist =
             `Assessed Value` < 15000 &
             `Lot Size` < 20 &
             zone_family %in% c("RA (apartment)",
                                "DC (direct control)",
                                "OTHER")
    )

  cat("--- R_PARK_HIST flag summary ---\n")
  cat("Total rows:          ",
      format(nrow(pa_res_flagged),                    big.mark = ","), "\n")
  cat("Flagged as parking:  ",
      format(sum(pa_res_flagged$is_parking_hist),     big.mark = ","), "\n")
  cat("Pct flagged:         ",
      percent(mean(pa_res_flagged$is_parking_hist),   accuracy = 0.01), "\n\n")

  # ============================================================
  # 5. Left join confidential onto pa_res — ALL years
  #
  # WHY left join, not inner:
  #   Keep all historical rows. Rows with no confidential match
  #   get NA in luc_1_desc — this is expected for new properties
  #   (2024–2025) that didn't exist in the 2023 confidential file.
  #
  # WHY all years, not just 2023:
  #   Account Numbers are stable identifiers. A parking stall
  #   assessed as acc_id 12345 in 2023 is the same stall in 2015.
  #   Restricting to 2023 would discard 13 years of valid signal.
  # ============================================================

  pa_joined <- pa_res_flagged |>
    left_join(conf_clean,
              by = c("Account Number" = "acc_id_clean"))

  # Join diagnostic — left join must not fan out
  n_before <- nrow(pa_res_flagged)
  n_after  <- nrow(pa_joined)
  n_fanout <- n_after - n_before

  cat("--- Join diagnostic ---\n")
  cat("Rows before join:  ", format(n_before,  big.mark = ","), "\n")
  cat("Rows after join:   ", format(n_after,   big.mark = ","), "\n")
  cat("Fan-out rows:      ", format(n_fanout,  big.mark = ","), "\n\n")

  if (n_fanout > 0) {
    warning("Unexpected fan-out after deduplication — investigate conf_clean.")
  }

  # ============================================================
  # 6. Coverage — how many rows got a confidential match?
  # ============================================================

  n_matched   <- sum(!is.na(pa_joined$luc_1_desc))
  n_unmatched <- sum( is.na(pa_joined$luc_1_desc))

  cat("--- Confidential join coverage (all years) ---\n")
  cat("Rows with luc_1_desc match:  ",
      format(n_matched,   big.mark = ","), "\n")
  cat("Rows without match (NA):     ",
      format(n_unmatched, big.mark = ","), "\n")
  cat("Overall match rate:          ",
      percent(n_matched / nrow(pa_joined), accuracy = 0.1), "\n\n")

  # Match rate by year — expect 2023 highest; pre/post years match via
  # shared Account Numbers for stable properties; 2024–2025 new-builds drop
  cat("--- Match rate by Assessment Year ---\n")
  pa_joined |>
    group_by(`Assessment Year`) |>
    summarise(
      n_rows    = n(),
      n_matched = sum(!is.na(luc_1_desc)),
      match_pct = percent(n_matched / n_rows, accuracy = 0.1),
      .groups   = "drop"
    ) |>
    arrange(`Assessment Year`) |>
    print(n = Inf)

  # ============================================================
  # 7. Validation frame — all rows with a confidential match
  # ============================================================

  validation <- pa_joined |>
    filter(!is.na(luc_1_desc))

  cat("\nValidation frame (all matched rows): ",
      format(nrow(validation), big.mark = ","), "rows\n\n")

  # ============================================================
  # 8. Confusion matrix
  #
  # Polarity = DROP (parking rows should be removed):
  #   is_parking_hist TRUE  + is_parking_conf TRUE  -> TP
  #   is_parking_hist TRUE  + is_parking_conf FALSE -> FP (legit rows wrongly flagged)
  #   is_parking_hist FALSE + is_parking_conf TRUE  -> FN (parking missed by rule)
  #   is_parking_hist FALSE + is_parking_conf FALSE -> TN
  # ============================================================

  cat("--- Confusion matrix: R_PARK_HIST vs confidential ---\n")

  conf_matrix <- validation |>
    count(is_parking_hist, is_parking_conf) |>
    mutate(
      verdict = case_when(
        is_parking_hist  & is_parking_conf  ~ "TP",
        is_parking_hist  & !is_parking_conf ~ "FP",
        !is_parking_hist & is_parking_conf  ~ "FN",
        TRUE                                ~ "TN"
      ),
      pct = percent(n / sum(n), accuracy = 0.01)
    )

  print(conf_matrix)

  # Safe cell extraction — handle zero-count cells gracefully
  get_cell <- function(df, ph, pc) {
    val <- df$n[df$is_parking_hist == ph & df$is_parking_conf == pc]
    if (length(val) == 0) 0L else val
  }

  tp <- get_cell(conf_matrix, TRUE,  TRUE)
  fp <- get_cell(conf_matrix, TRUE,  FALSE)
  fn <- get_cell(conf_matrix, FALSE, TRUE)
  tn <- get_cell(conf_matrix, FALSE, FALSE)

  precision <- tp / (tp + fp)
  recall    <- tp / (tp + fn)
  f1        <- 2 * precision * recall / (precision + recall)

  cat("\n--- Validation metrics ---\n")
  cat(sprintf("TP: %s  FP: %s  FN: %s  TN: %s\n",
              format(tp, big.mark = ","), format(fp, big.mark = ","),
              format(fn, big.mark = ","), format(tn, big.mark = ",")))
  cat("Precision: ", round(precision, 4), "\n")
  cat("Recall:    ", round(recall,    4), "\n")
  cat("F1:        ", round(f1,        4), "\n\n")

  # ============================================================
  # 9. Luc 1 Description distributions
  # ============================================================

  cat("--- Luc 1 descriptions of FLAGGED rows (is_parking_hist = TRUE) ---\n")
  luc_flagged <- validation |>
    filter(is_parking_hist) |>
    count(luc_1_desc, name = "n_rows") |>
    mutate(pct = percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
    arrange(desc(n_rows))

  print(luc_flagged, n = Inf)

  cat("\n--- Luc 1 descriptions of FALSE POSITIVES ---\n")
  cat("(flagged by rule, but confidential says NOT parking)\n")
  fp_breakdown <- validation |>
    filter(is_parking_hist, !is_parking_conf) |>
    count(luc_1_desc, Neighbourhood, name = "n_rows") |>
    arrange(desc(n_rows))

  print(fp_breakdown, n = 20)

  cat("\n--- Luc 1 descriptions of FALSE NEGATIVES ---\n")
  cat("(confidential says parking, but rule MISSED)\n")
  fn_breakdown <- validation |>
    filter(!is_parking_hist, is_parking_conf) |>
    count(luc_1_desc, zone_family, name = "n_rows") |>
    arrange(desc(n_rows))

  print(fn_breakdown, n = Inf)

  # ============================================================
  # 10. Write outputs
  # ============================================================

  # 10a: Full matched frame — all rows with luc_1_desc
  hist_parking_check <- validation |>
    select(`Account Number`, `Assessment Year`, Neighbourhood,
           Zoning, zone_family,
           `Assessed Value`, `Lot Size`,
           is_parking_hist, is_parking_conf, luc_1_desc)

  write_csv(hist_parking_check,
            "output/hist_parking_conf_check.csv")
  cat("Wrote: output/hist_parking_conf_check.csv —",
      format(nrow(hist_parking_check), big.mark = ","), "rows\n")

  # 10b: Luc distribution — flagged vs unflagged side by side
  luc_dist <- validation |>
    group_by(is_parking_hist, luc_1_desc) |>
    summarise(n_rows = n(), .groups = "drop") |>
    group_by(is_parking_hist) |>
    mutate(pct_within_group = percent(n_rows / sum(n_rows),
                                      accuracy = 0.01)) |>
    ungroup() |>
    arrange(is_parking_hist, desc(n_rows))

  write_csv(luc_dist,
            "output/hist_parking_luc_dist.csv")
  cat("Wrote: output/hist_parking_luc_dist.csv\n")

  # 10c: False positives
  write_csv(fp_breakdown,
            "output/hist_parking_fp_breakdown.csv")
  cat("Wrote: output/hist_parking_fp_breakdown.csv\n")

  # 10d: False negatives
  write_csv(fn_breakdown,
            "output/hist_parking_fn_breakdown.csv")
  cat("Wrote: output/hist_parking_fn_breakdown.csv\n")

  cat("\n=============================================================\n")
  cat("06b complete.\n")
  cat("Key outputs:\n")
  cat("  hist_parking_conf_check.csv  — full matched frame for Olivia review\n")
  cat("  hist_parking_luc_dist.csv    — luc distribution flagged vs unflagged\n")
  cat("  hist_parking_fp_breakdown.csv — false positives by luc + neighbourhood\n")
  cat("  hist_parking_fn_breakdown.csv — false negatives by luc + zone family\n")
  cat("=============================================================\n")

} else {
  message("Confidential oracle not found (AREF_CONF_PATH unset) — skipping historical parking conf-check. Expected on a clean clone; set AREF_CONF_PATH in ~/.Renviron to run it.")
}
