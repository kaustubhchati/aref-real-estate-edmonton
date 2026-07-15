# ============================================================
# 04_aggregate_historical.R
# AREF — Historical neighbourhood aggregation (all years)
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: Run Stata3-equivalent Layer 2 aggregation on the
#   historical cleaned CSV for every Assessment Year present.
#   Outputs one aggregate CSV per year, schema-identical to
#   output/neighbourhood_aggregates_2026.csv from script 05.
#   Names/ids are resolved to canonical (crosswalk + boundary) BEFORE
#   aggregating (see step 3b), so each row carries the canonical
#   Neighbourhood ID and yoy is keyed on it, not on a name that a
#   rename would break.
#
# REFRESH-BY-DESIGN:
#   - Auto-discovers cleaned CSV from output/ by glob pattern.
#   - Iterates over all years found in the data — no year literals.
#   - Output filenames derived from data, not hardcoded.
#
# INPUTS:
#   output/pa_hist_clean_YYYYMMDD.csv   (from script 03_clean_historical.R)
#
# OUTPUTS (one per Assessment Year):
#   output/hist_aggregates/neighbourhood_aggregates_YYYY.csv
#
# SCHEMA per output CSV (matches script 05 output exactly):
#   Neighbourhood ID, Neighbourhood, n_properties,
#   avall_public, median_assessvalue, sd_assessedvalue,
#   median_yearbuilt, pct_with_unit,
#   avg_assessvalue_without_unit, avg_lotsize, suppressed
# ============================================================

library(tidyverse)
library(scales)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("reconcile_helpers.R"))

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
    "Run 03_clean_historical.R first."
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
# 3. Derive unit_present from Legal Description
#    The historical assessment file carries `Legal Description`
#    INLINE (03 now imports it) — Plan/Block/Lot for subdivided
#    land vs Plan/Unit for condominiums — so NO Property-Information
#    join is needed (unlike the current-year path). A `unit:` token
#    marks an individually-titled condominium parcel (incl. a single
#    Plan/Unit "bare land condominium", legally still a condo);
#    purpose-built rental stock registers as one Plan/Block/Lot title
#    with no `unit:` token, so this cleanly separates condos from
#    rental even when buildings look identical (the distinction lives
#    in land-titles registration, which the legal description reflects).
#    => pct_with_unit is the share of individually-titled condo parcels
#    in a neighbourhood — NOT "share of units in multi-family buildings".
#
#    Detection ported byte-for-byte from script 05 (the canonical
#    Stata3 port): squish -> lower -> drop space-before-colon ->
#    str_detect("unit:"). Only the source column name differs —
#    historical raw uses title-case `Legal Description`; 05 uses the
#    PI-joined snake_case legal_description. The two intermediate
#    character columns are dropped straight after so the 5M-row frame
#    stays lean through the crosswalk + matched-yoy steps below.
# ============================================================

pa_clean <- pa_clean |>
  mutate(
    legal_description_norm = `Legal Description` |>
      str_squish() |>                    # collapse internal whitespace + trim
      str_to_lower() |>                  # lowercase
      str_replace_all("plan\\s*:",  "plan:") |>
      str_replace_all("block\\s*:", "block:") |>
      str_replace_all("lot\\s*:",   "lot:") |>
      str_replace_all("unit\\s*:",  "unit:"),
    unit_present = str_detect(legal_description_norm, "unit:") &
      !is.na(legal_description_norm)
  ) |>
  select(-`Legal Description`, -legal_description_norm)

cat(sprintf("Unit-present (condo) rows: %s of %s (%s)\n\n",
            format(sum(pa_clean$unit_present, na.rm = TRUE), big.mark = ","),
            format(nrow(pa_clean), big.mark = ","),
            percent(mean(pa_clean$unit_present, na.rm = TRUE), accuracy = 0.1)))

# ============================================================
# 3b. Resolve names/ids to canonical BEFORE aggregating
#    WHY pre-aggregation: a merge must pool ROWS (medians recomputed from the
#    combined rows, never averaged from two summaries), and a rename/typo must
#    keep a neighbourhood in ONE group across years. Resolving here means every
#    year's aggregate is keyed by the canonical id the boundary + frontend use,
#    so 07_geojson_historical joins by id (no case-fold name match) and yoy is continuous across a
#    rename (OLIVER -> WÎHKWÊNTÔWIN). The historical file is name-only, so the
#    crosswalk resolves by variant_name; canonical-named rows get their id from
#    the boundary name lookup. Source: the single neighbourhood crosswalk.
# ============================================================

# Newest neighbourhood boundary snapshot by glob — same sort(decreasing=TRUE)[1]
# discipline 03/04 use for their inputs; a new City boundary drops in with no
# code edit. The real on-disk name uses "_-_".
boundary_candidates <- list.files(
  shared_path("data"),
  pattern    = "^City_of_Edmonton_-_Neighbourhoods_.*\\.csv$",
  full.names = TRUE
)
if (length(boundary_candidates) == 0) {
  stop("No neighbourhood boundary CSV in ", shared_path("data"),
       " matching City_of_Edmonton_-_Neighbourhoods_*.csv — download the latest ",
       "City of Edmonton Neighbourhoods snapshot and save it there.")
}
boundary_path <- sort(boundary_candidates, decreasing = TRUE)[1]
boundary_lookup <- read_csv(boundary_path, show_col_types = FALSE) |>
  transmute(boundary_id = as.character(as.integer(`Neighbourhood Number`)),
            join_name   = str_to_upper(`Neighbourhood Name`))

pa_clean <- pa_clean |>
  mutate(`Neighbourhood ID` = NA_character_) |>
  apply_crosswalk() |>                                  # variant name -> canonical id+name
  # Fill ids for canonical-named rows the crosswalk did not touch, via boundary name.
  mutate(join_name = str_to_upper(Neighbourhood)) |>
  left_join(boundary_lookup, by = "join_name") |>
  mutate(`Neighbourhood ID` = coalesce(`Neighbourhood ID`, boundary_id)) |>
  select(-join_name, -boundary_id)

# Drop annexation-container umbrella rows (8885-8888) so they never aggregate.
exclude_ids <- crosswalk_exclude_ids()
n_before_excl <- nrow(pa_clean)
pa_clean <- pa_clean |> filter(!`Neighbourhood ID` %in% exclude_ids)
cat(sprintf("Resolved to canonical ids; dropped %s container rows (%s).\n\n",
            format(n_before_excl - nrow(pa_clean), big.mark = ","),
            if (length(exclude_ids)) paste(exclude_ids, collapse = ", ") else "none"))

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
  
  # --- Aggregate (Stata3 formula, script 05 port) -----------
  # Group by canonical (id, name): same id always carries the same canonical
  # name post-resolution, so this pools merged/renamed rows into one correct row.
  nbhd_agg <- yr_data |>
    group_by(`Neighbourhood ID`, `Neighbourhood`, .drop = FALSE) |>
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
# 5. Year-over-year change — MATCHED-SAMPLE (constant composition), LOG change
#    The change is computed over parcels present in BOTH years (matched by
#    Account Number), not by differencing two full-population medians. New builds
#    entering the roll and demolitions/teardowns leaving therefore do NOT
#    masquerade as price change — the documented composition correction
#    (RPPI Handbook mix-adjustment; StatCan matched-model; FHFA "same physical
#    units"). The LEVEL median per year (above) stays FULL-POPULATION — only this
#    cross-year change is matched. Keyed on canonical Neighbourhood ID so a rename
#    (OLIVER -> WÎHKWÊNTÔWIN) stays one continuous series, and an account in the
#    same canonical neighbourhood both years is the matched pair.
#
#    Expressed as a LOG change: ln(median_Y / median_Yprev) * 100. Log is
#    symmetric about 0 (an x% rise and its offsetting fall have equal magnitude)
#    and additive across periods — the scale repeat-sales / Case-Shiller estimate
#    on. For small changes it ≈ the raw percent; it tames the long right tail of
#    raw percent (unbounded above, floored at -100%). Displayed on the same
#    diverging ramp until the scale-refit step.
# ============================================================

# One value per (canonical nbhd, account, year): median over any duplicate rows.
acct_year <- pa_clean |>
  group_by(`Neighbourhood ID`, `Account Number`, `Assessment Year`) |>
  summarise(.val = median(`Assessed Value`, na.rm = TRUE), .groups = "drop")

# For each account, its value in the IMMEDIATELY prior year (NA if last year is a
# gap); the matched set for (nbhd, year) is the accounts with a value in both.
# matched yoy = % change of the median over that constant set.
#
# UNRESOLVED IDS ARE DROPPED FIRST. A row whose name matched neither the crosswalk
# nor the boundary keeps `Neighbourhood ID` = NA (step 3b above). R's group_by()
# collapses EVERY NA key into ONE group, so without this filter every unresolved
# neighbourhood pools into a single matched set — and the join below then hands
# that one pooled number back to each of them (dplyr matches NA to NA by default).
# That is how GLENRIDDING AREA, MCCONACHIE AREA and RURAL SOUTH EAST all came to
# report the same 2014 change of 15.3668. An unresolved id names no neighbourhood
# to compute a change FOR, so it gets NA — never a number borrowed from elsewhere.
# See docs/recon/YOY_TAIL_MECHANISM_20260715.md §3-§E.
matched_yoy <- acct_year |>
  filter(!is.na(`Neighbourhood ID`)) |>
  arrange(`Neighbourhood ID`, `Account Number`, `Assessment Year`) |>
  group_by(`Neighbourhood ID`, `Account Number`) |>
  mutate(.val_prev = if_else(`Assessment Year` - lag(`Assessment Year`) == 1L,
                             lag(.val), NA_real_)) |>
  ungroup() |>
  filter(!is.na(.val_prev)) |>
  group_by(`Neighbourhood ID`, year = `Assessment Year`) |>
  summarise(.matched_yoy = log(median(.val, na.rm = TRUE) / median(.val_prev, na.rm = TRUE)) * 100,
            n_matched = n(), .groups = "drop")

# FAIL-CLOSED GUARD: the matched table must carry RESOLVED ids only.
# Unreachable on a healthy run — the filter above guarantees it. It exists so that
# if that filter is ever dropped, or a new unresolved-id path appears upstream, the
# run STOPS loudly instead of silently pooling every unresolved neighbourhood into
# one group and giving each a change that belongs to none of them. Silent collapse
# on an NA group key is the failure class; this is the tripwire. Same pattern as
# the JOB_CATEGORY / stranded-id stops.
if (anyNA(matched_yoy$`Neighbourhood ID`)) {
  stop("matched_yoy carries an NA `Neighbourhood ID`. Unresolved ids would pool ",
       "into ONE group and each inherit the pooled change (they name no ",
       "neighbourhood to compute a change for). Resolve the id upstream (step 3b) ",
       "or exclude it. See docs/recon/YOY_TAIL_MECHANISM_20260715.md §3-§E.")
}

all_agg <- map_dfr(years_present, function(yr) {
  read_csv(sprintf("output/hist_aggregates/neighbourhood_aggregates_%d.csv", yr),
           show_col_types = FALSE) |>
    mutate(year = yr)
}) |>
  # .yoy_key only for ordering/suppression; .join_id (string) joins to the matched
  # table without altering the written `Neighbourhood ID` column's type.
  mutate(.yoy_key  = coalesce(as.character(`Neighbourhood ID`), Neighbourhood),
         .join_id  = as.character(`Neighbourhood ID`)) |>
  # na_matches = "never": an aggregate row with an unresolved id (.join_id = NA)
  # must match NOTHING. dplyr's DEFAULT is na_matches = "na" — NA joins to NA —
  # which was the second half of the pooling bug (the filter above is the first).
  # Either alone stops it; both together state the intent at the line where the
  # hazard actually lives, so a future reader sees it here too.
  left_join(matched_yoy |>
              transmute(.join_id = as.character(`Neighbourhood ID`), year, .matched_yoy),
            by = c(".join_id", "year"), na_matches = "never") |>
  arrange(.yoy_key, year) |>
  group_by(.yoy_key) |>
  # Preserve the suppression gate EXACTLY: yoy exists only where this year's and
  # the prior year's medians are both shown (median is NA when N<100-suppressed or
  # first year), so the NA pattern is identical to the old full-pop yoy. Only the
  # VALUE changes (matched vs full-pop differenced) for non-suppressed years.
  mutate(yoy_pct_change = if_else(
    is.na(median_assessvalue) | is.na(lag(median_assessvalue)),
    NA_real_, .matched_yoy)) |>
  ungroup() |>
  select(-.yoy_key, -.join_id, -.matched_yoy)

for (yr in years_present) {
  yr_data <- all_agg |> filter(year == yr) |> select(-year)
  write_csv(yr_data,
    sprintf("output/hist_aggregates/neighbourhood_aggregates_%d.csv", yr))
}

cat(sprintf("Matched-sample yoy_pct_change written back into all %d aggregate CSVs.\n\n",
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

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["n_years"]]  <- length(years_present)
RUN_METRICS[["per_year"]] <- agg_log