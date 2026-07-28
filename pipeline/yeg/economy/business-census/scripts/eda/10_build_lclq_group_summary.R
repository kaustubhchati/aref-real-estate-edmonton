# ============================================================
# economy/business-census/scripts/eda/10_build_lclq_group_summary.R
#
# OUT-OF-BAND builder — the per-group LCLQ summary companion file the Industry
# Specializations console reads (chip eligibility gated on the group-level test;
# the sector-core line). Authorized by KC's ratification of the frontend
# adversarial audit (LCLQ_FRONTEND_ADVERSARIAL_REPORT_20260728.md, Module E.3 /
# T2-11 / T3a), 2026-07-28.
#
# Same standing as 04's §19 artifact: NOT in _whirl.yaml, never part of the
# automated refresh; run manually at each Business Census vintage after the
# estimator artifacts regenerate, and hand-committed alongside the main CSV
# (the documented refresh-by-design exception, CLAUDE.md §12 v1.17).
#
# INPUTS (all persisted evidence-programme artifacts; no recomputation):
#   scripts/eda/output/lclq_nsim9999_20260727/lclq_nsim9999_20260727.csv
#       the establishment-level classification at the production resolution
#       (9,999 permutations) — the re-shipped bc_lclq_industry_group.csv
#   scripts/eda/output/lclq_referee_checks_20260727/global_clq_by_group.csv
#       the group-level global colocation test (referee campaign M2;
#       methodology note §7.3)
#   scripts/eda/output/lclq_sector_null_9999_20260728/sector_null_9999_by_group.csv
#       sector-conditional survivor counts at 9,999 (methodology note §7.4)
#
# OUTPUT: data/output/bc_lclq_group_summary.csv — one row per tested group (133):
#   industry_group, n_in_group, n_sig, max_lclq_sig, median_lclq_sig,
#   global_clq, global_q, global_sig, n_sig_sector, k, nsim, survey_year
# max/median are the SAMPLE median/max over significant members (the note's §7.1
# convention; the view still client-computes its displayed values from the main
# CSV — this file's copies are the record). Groups with zero significant members
# carry NA in both. n_sig_sector nests inside n_sig by construction (§7.4).
#
# Author: CC (build campaign), KC ratification 2026-07-28.
# ============================================================

library(tidyverse)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

eda_out <- function(...) section_path("economy/business-census", "scripts", "eda", "output", ...)

main9   <- read_csv(eda_out("lclq_nsim9999_20260727",     "lclq_nsim9999_20260727.csv"),      show_col_types = FALSE)
glob    <- read_csv(eda_out("lclq_referee_checks_20260727", "global_clq_by_group.csv"),        show_col_types = FALSE)
sect    <- read_csv(eda_out("lclq_sector_null_9999_20260728", "sector_null_9999_by_group.csv"), show_col_types = FALSE)

stopifnot(nrow(main9) == 28381L, n_distinct(main9$industry_group) == 133L,
          nrow(glob) == 133L, nrow(sect) == 133L)

per_group <- main9 |>
  group_by(industry_group) |>
  summarise(
    n_in_group     = first(n_in_group),
    n_sig          = sum(significant),
    max_lclq_sig    = ifelse(any(significant), max(lclq[significant]), NA_real_),
    median_lclq_sig = ifelse(any(significant), median(lclq[significant]), NA_real_),
    k = first(k), nsim = first(nsim), survey_year = first(survey_year),
    .groups = "drop"
  )

out <- per_group |>
  left_join(glob |> select(industry_group, global_clq = clq_global,
                           global_q = q, global_sig = significant),
            by = "industry_group") |>
  left_join(sect |> select(industry_group, n_sig_sector = n_sig_sector_9999),
            by = "industry_group") |>
  select(industry_group, n_in_group, n_sig, max_lclq_sig, median_lclq_sig,
         global_clq, global_q, global_sig, n_sig_sector, k, nsim, survey_year) |>
  arrange(desc(n_sig))

# Join integrity: every group matched in both sources; survivors nest inside n_sig.
stopifnot(nrow(out) == 133L, !anyNA(out$global_sig), !anyNA(out$n_sig_sector),
          all(out$n_sig_sector <= out$n_sig))

out_dir <- section_path("economy/business-census", "data", "output")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
write_csv(out, file.path(out_dir, "bc_lclq_group_summary.csv"))

cat("Wrote bc_lclq_group_summary.csv:", nrow(out), "groups\n")
cat("globally significant:", sum(out$global_sig), "of 133 (expect 111)\n")
cat("groups with sector survivors:", sum(out$n_sig_sector > 0), "(expect 26); total survivors:",
    sum(out$n_sig_sector), "(expect 416)\n")
cat("spot: Specialty food retailers ->",
    with(out[out$industry_group == "Specialty food retailers", ],
         paste0("n_sig ", n_sig, ", survivors ", n_sig_sector, " (expect 96, 82)")), "\n")
cat("spot: Lessors of real estate ->",
    with(out[out$industry_group == "Lessors of real estate", ],
         paste0("n_sig ", n_sig, ", survivors ", n_sig_sector, " (expect 1207, 0)")), "\n")
