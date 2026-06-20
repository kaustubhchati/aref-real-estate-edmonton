# ============================================================
# 08d_hist_aggregate.R
# AREF — Historical neighbourhood aggregation (all years)
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Run Stata3-equivalent Layer 2 aggregation on the
#   historical cleaned CSV for every Assessment Year present.
#   Outputs one aggregate CSV per year, schema-identical to
#   output/neighbourhood_aggregates_2026.csv from script 07.
#
# REFRESH-BY-DESIGN:
#   - Auto-discovers cleaned CSV from output/ by glob pattern.
#   - Iterates over all years found in the data — no year literals.
#   - Output filenames derived from data, not hardcoded.
#
# INPUTS:
#   output/pa_hist_clean_YYYYMMDD.csv   (from script 07a_build_hist_clean.R)
#
# OUTPUTS (one per Assessment Year):
#   output/hist_aggregates/neighbourhood_aggregates_YYYY.csv
#
# SCHEMA per output CSV (matches script 07 output exactly):
#   Neighbourhood ID, Neighbourhood, n_properties,
#   avall_public, median_assessvalue, sd_assessedvalue,
#   median_yearbuilt, pct_with_unit,
#   avg_assessvalue_without_unit, avg_lotsize, suppressed
# ============================================================

library(tidyverse)
library(scales)

dir.create("output/hist_aggregates", showWarnings = FALSE, recursive = TRUE)

cat("=============================================================\n")
cat("AREF — Historical Neighbourhood Aggregation\n")
cat("Generated:", format(Sys.time(), "%Y-%m-%d %H:%M %Z"), "\n")
cat("=============================================================\n\n")

# ============================================================
# 1. Auto-discover clean historical CSV
# ============================================================

clean_candidates <- list.files(
  path       = "output",
  pattern    = "^pa_hist_clean_.*\\.csv$",
  full.names = TRUE
)

if (length(clean_candidates) == 0) {
  stop(paste(
    "No pa_hist_clean_*.csv found in output/.",
    "Run 07_build_hist_clean.R first."
  ))
}

clean_path <- sort(clean_candidates, decreasing = TRUE)[1]
cat("Clean CSV selected: ", clean_path, "\n\n")

# ============================================================
# 2. Load
# ============================================================

pa_clean <- read_csv(clean_path, show_col_types = FALSE)
cat("Rows loaded: ", format(nrow(pa_clean), big.mark = ","), "\n")
cat("Years present: ",
    paste(sort(unique(pa_clean$`Assessment Year`)), collapse = ", "), "\n\n")

# ============================================================
# 3. Derive unit_present from Neighbourhood column
#    WHY: The historical file does not have legal_description
#    (not in the 11-column select from prop_asses_hist).
#    Neighbourhood name alone cannot detect condos reliably.
#    We set unit_present = FALSE for all rows — this means
#    pct_with_unit will be 0% for all historical years, and
#    avg_assessvalue_without_unit = avall_public.
#    This is documented and honest: the historical file does
#    not carry the PI join columns needed for condo detection.
#    The 2026 current-year pipeline has legal_description via
#    the Property Information join — historical does not.
#
#    TODO: if a future refresh includes legal_description in
#    the historical download, replace this with the full
#    str_detect("unit:") logic from script 07.
# ============================================================

pa_clean <- pa_clean |>
  mutate(unit_present = FALSE)

cat("Note: unit_present = FALSE for all historical rows.\n")
cat("      pct_with_unit will be 0 in all historical aggregates.\n")
cat("      See script header for rationale.\n\n")

# ============================================================
# 4. Aggregate per year — iterate over all years in data
# ============================================================

years_present <- sort(unique(pa_clean$`Assessment Year`))
cat("Years to process: ", length(years_present), "\n\n")

agg_log <- tibble(
  year          = integer(),
  n_rows_in     = integer(),
  n_neighbourhoods = integer(),
  n_suppressed  = integer(),
  median_value  = double()
)

for (yr in years_present) {
  
  cat(sprintf("--- Processing %d ---\n", yr))
  
  yr_data <- pa_clean |> filter(`Assessment Year` == yr)
  cat(sprintf("  Rows: %s\n", format(nrow(yr_data), big.mark = ",")))
  
  # --- Aggregate (Stata3 formula, script 07 port) -----------
  nbhd_agg <- yr_data |>
    group_by(`Neighbourhood`, .drop = FALSE) |>
    summarise(
      n_properties                 = n(),
      avall_public                 = mean(`Assessed Value`,            na.rm = TRUE),
      median_assessvalue           = median(`Assessed Value`,          na.rm = TRUE),
      sd_assessedvalue             = sd(`Assessed Value`,              na.rm = TRUE),
      median_yearbuilt             = median(`Actual Year Built`,       na.rm = TRUE),
      pct_with_unit                = mean(unit_present, na.rm = TRUE) * 100,
      avg_assessvalue_without_unit = mean(`Assessed Value`[!unit_present],
                                          na.rm = TRUE),
      avg_lotsize                  = mean(`Lot Size`[!unit_present],   na.rm = TRUE),
      .groups = "drop"
    )
  
  # --- N<100 suppression gate (Stata3 lines 120-128) --------
  nbhd_agg <- nbhd_agg |>
    mutate(
      suppressed = n_properties < 100,
      across(
        c(avall_public, median_assessvalue, sd_assessedvalue,
          median_yearbuilt, pct_with_unit,
          avg_assessvalue_without_unit, avg_lotsize),
        ~ if_else(suppressed, NA_real_, .x)
      )
    )
  
  n_supp <- sum(nbhd_agg$suppressed)
  med_val <- median(nbhd_agg$median_assessvalue, na.rm = TRUE)
  
  cat(sprintf("  Neighbourhoods: %d  |  Suppressed (N<100): %d  |  Median value: $%s\n",
              nrow(nbhd_agg), n_supp,
              format(round(med_val), big.mark = ",")))
  
  # --- Write year CSV ---------------------------------------
  out_path <- sprintf("output/hist_aggregates/neighbourhood_aggregates_%d.csv", yr)
  write_csv(nbhd_agg, out_path)
  cat(sprintf("  Wrote: %s\n\n", out_path))
  
  # --- Log --------------------------------------------------
  agg_log <- bind_rows(agg_log, tibble(
    year             = yr,
    n_rows_in        = nrow(yr_data),
    n_neighbourhoods = nrow(nbhd_agg),
    n_suppressed     = n_supp,
    median_value     = med_val
  ))
}

# ============================================================
# 5. Year-over-year change — second pass over the written CSVs
#    The per-year loop above processes years independently, so
#    yoy can't be computed inside it. Read all aggregates back,
#    compute the per-neighbourhood median yoy % change, and write
#    the new yoy_pct_change column back into each year's CSV.
# ============================================================

all_agg <- map_dfr(years_present, function(yr) {
  read_csv(sprintf("output/hist_aggregates/neighbourhood_aggregates_%d.csv", yr),
           show_col_types = FALSE) |>
    mutate(year = yr)
}) |>
  arrange(Neighbourhood, year) |>
  group_by(Neighbourhood) |>
  mutate(yoy_pct_change = (median_assessvalue - lag(median_assessvalue))
         / lag(median_assessvalue) * 100) |>
  ungroup()

for (yr in years_present) {
  yr_data <- all_agg |> filter(year == yr) |> select(-year)
  write_csv(yr_data,
    sprintf("output/hist_aggregates/neighbourhood_aggregates_%d.csv", yr))
}

cat(sprintf("yoy_pct_change written back into all %d aggregate CSVs.\n\n",
            length(years_present)))

# ============================================================
# 6. Summary log
# ============================================================

cat("=============================================================\n")
cat("Aggregation complete — summary:\n\n")
print(agg_log, n = Inf)

write_csv(agg_log, "output/hist_aggregates/aggregation_log.csv")
cat("\nWrote: output/hist_aggregates/aggregation_log.csv\n")
cat("=============================================================\n")