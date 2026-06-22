# ============================================================
# 07_layer2_aggregates.R
# Layer 2 — compute per-neighbourhood aggregates from the
# Layer 1a-cleaned 2026 frame.
#
# Direct port of Stata3 lines 79–92 (previous RA pipeline,
# Code_Stata_Property_assessment_edmonton_3.do). The prev RA filtered to
# residential via their confidential internal_target before aggregating; we
# filter via our PUBLIC-ONLY Layer 1a rules (parking, R1, R3). Aggregation
# logic downstream is identical — only the upstream filter differs.
#
# Inputs:
#   - data/processed/assess_2026_clean.csv  (from script 06; already has
#     lot_size, year_built, legal_description joined from Property Information)
#   - data/reference/neighbourhood_crosswalk_<YYYYMMDD>.csv (newest; the merge
#     rows drive pre-aggregation pooling — see below)
#
# Output:
#   - output/neighbourhood_aggregates_2026.csv
#     One row per neighbourhood: Neighbourhood ID, Neighbourhood, n_properties,
#     avall_public, median_assessvalue, sd_assessedvalue, median_yearbuilt,
#     pct_with_unit, avg_assessvalue_without_unit, avg_lotsize, suppressed
#
# Name-merge step (crosswalk-driven since 2026-06-22):
#   The City's 2026 boundary file (65fr-66s6) merges some neighbourhoods that
#   the assessment data still lists under two names AND two IDs — e.g.
#   HERITAGE VALLEY TOWN CENTRE (native id 5472, 15 props) and HERITAGE VALLEY
#   TOWN CENTRE AREA (NA-id, 577 props) are one polygon (5472) in the new file.
#   Left un-merged these form two group_by groups and collide on one polygon
#   downstream (caught by 08b's dup-ID guard). The crosswalk's relation=="merge"
#   rows normalise variant name + id to the canonical target BEFORE aggregation,
#   so medians/SDs are recomputed from the pooled rows — never averaged from two
#   summaries. Crosswalk is versioned/dated/sourced per CLAUDE.md §4.4/§4.7 and is
#   the single reconciliation contract (authored by the reconcile one-shot).
#
# Sanity gate (port of Stata3 lines 120–128):
#   Aggregates suppressed where n_properties < 100. The prev RA's second gate
#   (|diffprop| > 0.10) needs the confidential 2023 aggregates and is NOT
#   applied here — deferred to the Phase 2 Sanity Agent (one-time oracle read,
#   never persisted to production; CLAUDE.md §4.1).
# ============================================================
# --- Setup --------------------------------------------------
library(tidyverse)
library(scales)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("reconcile_helpers.R"))

dir.create("output", showWarnings = FALSE, recursive = TRUE)


# --- Load Layer 1a clean frame ------------------------------
clean_path <- "data/processed/assess_2026_clean.csv"
if (!file.exists(clean_path)) {
  stop("Missing: ", clean_path,
       " — run scripts/06_apply_layer1a_rules.R first.")
}

# Explicit col_types to silence the parsing warning observed in 06
# (Assessment Class 2/3 and pct columns guess as logical when
# the first few hundred rows have them empty).
assess_clean <- read_csv(
  clean_path,
  col_types = cols(
    `Account Number`        = col_double(),
    `Neighbourhood ID`      = col_character(),  # has "NA" string for new dev areas
    Neighbourhood           = col_character(),
    `Assessed Value`        = col_double(),
    `Assessment Class 1`    = col_character(),
    `Assessment Class 2`    = col_character(),
    `Assessment Class 3`    = col_character(),
    `Assessment Class % 1`  = col_double(),
    `Assessment Class % 2`  = col_double(),
    `Assessment Class % 3`  = col_double(),
    Latitude                = col_double(),
    Longitude               = col_double(),
    lot_size                = col_double(),
    year_built              = col_double(),
    `Total Gross Area`      = col_double(),
    legal_description       = col_character(),
    .default                = col_guess()
  )
)
cat(sprintf("Loaded clean frame: %s rows\n", comma(nrow(assess_clean))))

# --- Merge split assessment-side names before aggregating ----
# The City's 2026 boundary merges neighbourhoods the assessment data lists under
# two names AND two ids (HERITAGE VALLEY TOWN CENTRE, native id 5472, ~15 props;
# HERITAGE VALLEY TOWN CENTRE AREA, NA-id, ~577 — same place, one City polygon).
# Un-merged they form two group_by groups and collide on one polygon downstream.
# Only the crosswalk's relation=="merge" rows run here, BEFORE aggregation, so
# medians/SDs are recomputed from the pooled rows (never averaged from summaries).
# The 1:1 renames/renumbers/typos/aliases/suffix-drift resolve post-aggregation
# in 08b — they do not change which rows aggregate together, so they need not run
# here. Source of truth: data/reference/neighbourhood_crosswalk_<YYYYMMDD>.csv.
assess_clean <- apply_crosswalk(assess_clean, relations = "merge")

# --- Derive unit_present (port of Stata3 lines 31–42) -------
# stritrim → strtrim → strlower → normalize "X :" spacing → strpos "unit:"
# In R: squish whitespace, lowercase, drop space before colon, detect "unit:"
assess_clean <- assess_clean |>
  mutate(
    legal_description_norm = legal_description |>
      str_squish() |>                    # collapse internal whitespace + trim
      str_to_lower() |>                  # lowercase
      str_replace_all("plan\\s*:",  "plan:") |>
      str_replace_all("block\\s*:", "block:") |>
      str_replace_all("lot\\s*:",   "lot:") |>
      str_replace_all("unit\\s*:",  "unit:"),
    unit_present = str_detect(legal_description_norm, "unit:") &
      !is.na(legal_description_norm)
  )

cat(sprintf("Unit-present rows: %s of %s (%s)\n",
            comma(sum(assess_clean$unit_present, na.rm = TRUE)),
            comma(nrow(assess_clean)),
            percent(mean(assess_clean$unit_present, na.rm = TRUE), 0.1)))


# --- Aggregate per Neighbourhood ID (Stata3 lines 79–92) -----
# Stata pattern: bys nbhd: egen X = mean(value) if unit_present==0
#                bys nbhd: egen median = median(value)
#                collapse (mean) ...
# In dplyr this is one group_by/summarise call.
#
# Filtering inside summarise uses `[unit_present == FALSE]` subsetting
# (same as Stata's "if unit_present==0" inside an egen).
nbhd_agg <- assess_clean |>
  group_by(`Neighbourhood ID`, Neighbourhood) |>
  summarise(
    n_properties                 = n(),
    avall_public                 = mean(`Assessed Value`,   na.rm = TRUE),
    median_assessvalue           = median(`Assessed Value`, na.rm = TRUE),
    sd_assessedvalue             = sd(`Assessed Value`,     na.rm = TRUE),
    median_yearbuilt             = median(year_built,        na.rm = TRUE),
    pct_with_unit                = mean(unit_present, na.rm = TRUE) * 100,
    avg_assessvalue_without_unit = mean(`Assessed Value`[unit_present == FALSE],
                                        na.rm = TRUE),
    avg_lotsize                  = mean(lot_size[unit_present == FALSE],
                                        na.rm = TRUE),
    .groups = "drop"
  )

cat(sprintf("\nAggregated to %s neighbourhoods\n", comma(nrow(nbhd_agg))))


# --- Sanity gate: suppress aggregates when N < 100 -----------
# Port of Stata3 lines 120, 123–129. The prev RA's second gate
# (|diffprop| > 0.10 vs internal) needs the confidential file and
# is deferred to Phase 2 Sanity Agent.
#
# Strategy: do NOT delete the row. Keep the neighbourhood, keep
# n_properties (the COUNT is always reportable), and set all derived
# aggregates to NA. This preserves the row for the choropleth
# (the polygon will simply colour as "data suppressed") and is
# honest about why.

n_suppressed <- sum(nbhd_agg$n_properties < 100, na.rm = TRUE)

nbhd_agg_gated <- nbhd_agg |>
  mutate(
    suppressed = n_properties < 100,
    across(
      c(avall_public, median_assessvalue, sd_assessedvalue,
        median_yearbuilt, pct_with_unit,
        avg_assessvalue_without_unit, avg_lotsize),
      ~ if_else(suppressed, NA_real_, .x)
    )
  )

cat(sprintf("Sanity gate (N < 100): %s neighbourhoods suppressed\n",
            comma(n_suppressed)))


# --- Diagnostic: NA-ID rows (new development areas) ----------
# Memory entry #22: 12 named neighbourhoods carry Neighbourhood ID == "NA"
# (new developments like Chappelle Area, Rapperswil, etc.). These will
# appear as a single grouped row in the output with ID="NA" — keep them
# in the CSV but flag them as boundary-file-not-available.
na_id_block <- nbhd_agg_gated |> filter(`Neighbourhood ID` == "NA")
if (nrow(na_id_block) > 0) {
  cat("\n--- NA-id rows (no polygon in 2023 shapefile) ---\n")
  cat(sprintf("These %s 'neighbourhood' groups have no boundary file yet:\n",
              nrow(na_id_block)))
  print(na_id_block |>
          select(Neighbourhood, n_properties) |>
          arrange(desc(n_properties)),
        n = 20)
}


# --- Write the aggregates -----------------------------------
out_path <- "output/neighbourhood_aggregates_2026.csv"
write_csv(nbhd_agg_gated, out_path)

cat(sprintf("\nWrote: %s\n", out_path))
cat(sprintf("Rows: %s neighbourhoods (incl. %s NA-id developing areas)\n",
            comma(nrow(nbhd_agg_gated)),
            nrow(na_id_block)))


# --- Year-over-year change: 2026 vs 2025 --------------------
# Match the historical pipeline's yoy_pct_change (08d) so the 2026 production
# aggregate carries the same column. yoy is keyed on canonical_id, NOT name, so a
# rename (e.g. OLIVER -> WÎHKWÊNTÔWIN) no longer nulls the change across the
# rename year. The 2025 historical aggregate already carries canonical ids (08d
# resolves them). The 2026 aggregate's NA-id variants (e.g. CHAPPELLE AREA) are
# not resolved until 08b, so we resolve a TEMP canonical key here purely for the
# join — the row's own id stays untouched and 08b sets it canonically. yoy still
# only exists where both years cleared the N<100 gate (2025 medians are gated).
prev_path <- "output/hist_aggregates/neighbourhood_aggregates_2025.csv"
if (file.exists(prev_path)) {
  prev_2025 <- read_csv(prev_path, show_col_types = FALSE) |>
    transmute(.canon_id = as.character(`Neighbourhood ID`),
              median_2025 = median_assessvalue) |>
    filter(!is.na(.canon_id))

  # Temp canonical key for the 2026 side (does not mutate the output ids).
  canon_id_2026 <- nbhd_agg_gated |>
    select(`Neighbourhood ID`, Neighbourhood) |>
    apply_crosswalk() |>
    pull(`Neighbourhood ID`)
  stopifnot(length(canon_id_2026) == nrow(nbhd_agg_gated))

  nbhd_agg_gated <- nbhd_agg_gated |>
    mutate(.canon_id = canon_id_2026) |>
    left_join(prev_2025, by = ".canon_id") |>
    mutate(yoy_pct_change = (median_assessvalue - median_2025) / median_2025 * 100) |>
    select(-.canon_id, -median_2025)
  write_csv(nbhd_agg_gated, out_path)
  cat(sprintf("Added yoy_pct_change (2026 vs 2025, keyed on canonical_id); %s neighbourhoods have a value. Re-wrote %s\n",
              comma(sum(!is.na(nbhd_agg_gated$yoy_pct_change))), out_path))
} else {
  warning("2025 historical aggregate not found at ", prev_path,
          " — yoy_pct_change not added. Run 08d first.")
}


# --- Summary print -----------------------------------------
cat("\n--- Aggregate summary (gated, non-suppressed neighbourhoods only) ---\n")
nbhd_agg_gated |>
  filter(!suppressed, `Neighbourhood ID` != "NA") |>
  summarise(
    n_neighbourhoods            = n(),
    median_n_properties         = median(n_properties),
    median_of_medians           = median(median_assessvalue, na.rm = TRUE),
    min_median                  = min(median_assessvalue,    na.rm = TRUE),
    max_median                  = max(median_assessvalue,    na.rm = TRUE),
    mean_pct_with_unit          = mean(pct_with_unit,        na.rm = TRUE)
  ) |>
  print()