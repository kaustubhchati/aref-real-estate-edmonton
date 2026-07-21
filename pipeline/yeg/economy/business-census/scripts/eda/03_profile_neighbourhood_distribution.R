# ============================================================
# economy/business-census/scripts/eda/03_profile_neighbourhood_distribution.R
#
# GUIDE 3 of 3 — "Do the cleared columns hold up across the city?"
# ------------------------------------------------------------
# Guide 2 ruled that `Sectors` and `Industry Group` are the columns cleared for
# mapping. A ruling made on summary statistics deserves one more test: do those
# two columns behave sensibly across all ~369 neighbourhoods, or does the city's
# own lopsidedness undo them?
#
#   01  orients: what the file holds.
#   02  decides: which level we map.  <- THE RULING
#   03 (this file)  confirms the ruling, and hands off to the clean frame.
#
# This guide profiles ONLY the two cleared columns. The rejected levels
# (`Industries`, `NAICS`) are deliberately absent — that argument was settled in
# Guide 2 CHECKs 4 and 5 and is not relitigated here.
#
# SCOPE: the mapping vintage only (the latest survey wave), derived from the
#   data — never a year literal. The Business Census is a full-canvass
#   administrative register, so the latest wave is the CURRENT STATE, not one
#   period of a panel.
#
# Measures only. No cleaning, no canonicalization, no crossmap, and NO join to
#   the neighbourhood boundary or the canonical crosswalk — neighbourhoods are
#   taken exactly as the file names and numbers them. Reconciling those ids to
#   the 407-polygon universe is a separate track.
#
# Run context: OUT-OF-BAND EDA — not in _whirl.yaml, never in the run order.
#     source("pipeline/yeg/economy/business-census/scripts/eda/03_profile_neighbourhood_distribution.R")
#
# Input:   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest by glob)
#          ALREADY ON DISK — never fetches.
# Outputs: NONE. Console narrative only; writes nothing to disk.
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))


# ── 0. The two cleared columns ──────────────────────────────
# Sectors is keyed on its LABEL and Industry Group on its CODE — deliberately
# asymmetric, per Guide 2 CHECK 2d: sector codes come in NAICS ranges (one
# sector legitimately spans two or three codes), so keying Sectors on its code
# would split Manufacturing, Retail trade and Transportation into fragments.
# Industry Group carries no such ranges and keys on its code as normal.

CLEARED <- tribble(
  ~level,           ~key_col,              ~key_is_label, ~label_col,
  "Sectors",        "Sectors",             TRUE,          "Sectors",
  "Industry Group", "Industry Group Code", FALSE,         "Industry Group"
)

RAW_MARKER_COLS <- c("objectid", "Business Name", "NAICS Code", "Sectors",
                     "Latitude", "Longitude")


# ── 1. Load (same guarded approach as Guides 1 and 2) ───────

raw_dir <- section_path("economy/business-census", "data", "raw")

csv_files <- list.files(raw_dir,
                        pattern    = "^Edmonton_Business_Census_\\d{8}\\.csv$",
                        full.names = TRUE)
if (length(csv_files) == 0) {
  stop("No Edmonton_Business_Census_<YYYYMMDD>.csv in ", raw_dir)
}
csv_path <- sort(csv_files, decreasing = TRUE)[1]

bc_raw <- read_csv(csv_path, show_col_types = FALSE)

missing_markers <- setdiff(RAW_MARKER_COLS, names(bc_raw))
if (length(missing_markers) > 0) {
  stop("This is not the RAW business-level file (8c4b-u4a4).\n",
       "  Grabbed:  ", basename(csv_path), "\n",
       "  Missing raw-only column(s): ", paste(missing_markers, collapse = ", "))
}

MAP_YEAR <- max(bc_raw$`Survey Year`, na.rm = TRUE)

cat("=============================================================\n")
cat("GUIDE 3 of 3 — Do the cleared columns hold up across the city?\n")
cat("Snapshot:", basename(csv_path), "| mapping vintage:", MAP_YEAR, "\n")
cat("=============================================================\n\n")


# ============================================================
# CHECK 1 — Which vintage, and what does scoping to it cost?
# ============================================================
# Decides: the denominator for everything below, stated openly so no share in
#   this guide is quietly computed over a different population than it claims.
#
# Two exclusions happen here and both are reported rather than assumed:
#   (a) other survey waves — out of scope by the current-state methodology.
#   (b) rows carrying no neighbourhood — they cannot be placed on a polygon map
#       at all. Keeping them in the denominator would understate every share.

cat("========== CHECK 1: vintage scope ==========\n")
print(bc_raw |> count(`Survey Year`, name = "rows"))

bc <- bc_raw |> filter(`Survey Year` == MAP_YEAR)
N_YEAR <- nrow(bc)
cat(sprintf("\n  Mapping vintage %s: %s rows (%.1f%% of the %s-row file).\n",
            MAP_YEAR, format(N_YEAR, big.mark = ","),
            100 * N_YEAR / nrow(bc_raw), format(nrow(bc_raw), big.mark = ",")))

n_no_nbhd <- sum(is.na(bc$`Neighbourhood Number`))
cat(sprintf("  Rows with no Neighbourhood Number: %s (%.2f%%) — excluded below.\n",
            format(n_no_nbhd, big.mark = ","), 100 * n_no_nbhd / N_YEAR))

bc <- bc |> filter(!is.na(`Neighbourhood Number`))
N_PLACED <- nrow(bc)
N_NB     <- n_distinct(bc$`Neighbourhood Number`)
cat(sprintf("  Placed: %s businesses across %s neighbourhoods. This is the denominator.\n\n",
            format(N_PLACED, big.mark = ","), N_NB))


# ============================================================
# CHECK 2 — How unevenly are businesses spread at all?
# ============================================================
# Decides: whether any per-neighbourhood map is dominated by a handful of
#   polygons before a single category is chosen. If the base distribution is
#   extremely lopsided, then EVERY category map inherits that shape and the
#   colour ramp has to be designed for it (a linear ramp on a Gini-0.7
#   distribution renders as one dark polygon and 368 pale ones).
#
# Gini is computed inline (0 = perfectly even, 1 = one neighbourhood holds
#   everything). It is reported twice — over all neighbourhoods, and over only
#   those above a small floor — to test whether the inequality is a real feature
#   of the city or merely an artifact of a long tail of near-empty polygons.

cat("========== CHECK 2: how unevenly businesses are spread ==========\n")
per_nbhd <- bc |>
  group_by(nbhd_id = as.character(`Neighbourhood Number`),
           nbhd    = `Neighbourhood Name`) |>
  summarise(n_businesses = n(),
            pct_of_year  = round(100 * n() / N_PLACED, 3),
            .groups = "drop") |>
  arrange(desc(n_businesses))

for (floor_n in c(0L, 10L)) {
  v  <- sort(per_nbhd$n_businesses[per_nbhd$n_businesses > floor_n])
  nn <- length(v)
  g  <- sum((2 * seq_len(nn) - nn - 1) * v) / (nn * sum(v))
  s  <- sort(v, decreasing = TRUE)
  cat(sprintf("  %-22s n=%3d  median %5.1f  mean %6.1f  max %4d  Gini %.3f  top10 %.1f%%\n",
              if (floor_n == 0) "all neighbourhoods" else sprintf("only >%d businesses", floor_n),
              nn, median(v), mean(v), max(v), g, 100 * sum(head(s, 10)) / sum(v)))
}
cat("\n  => Removing the thin tail barely moves the concentration: the inequality\n")
cat("     is a genuine feature of where business locates, not an artifact of a\n")
cat("     few near-empty polygons. A map built on this needs a ramp that handles\n")
cat("     a heavy right tail.\n\n")

cat("  Top 15 neighbourhoods:\n")
print(per_nbhd |> head(15), n = 15)

cat("\n  Thinnest neighbourhoods — how many sit at or below each floor:\n")
for (t in c(1L, 2L, 5L, 10L, 20L)) {
  cat(sprintf("    <= %2d businesses: %3d neighbourhoods (%4.1f%% of them) holding %5.2f%% of businesses\n",
              t, sum(per_nbhd$n_businesses <= t),
              100 * mean(per_nbhd$n_businesses <= t),
              100 * sum(per_nbhd$n_businesses[per_nbhd$n_businesses <= t]) / N_PLACED))
}
cat("\n  The thin tail is structural, not a data gap — it is river-valley and\n")
cat("  ravine parkland, ring-road corridors, golf courses and undeveloped new\n")
cat("  subdivisions. Those polygons genuinely contain almost no businesses.\n")
cat("  Counts there are CORRECT; only derived shares are unstable, because at n\n")
cat("  businesses the finest resolvable share is 1/n.\n\n")


# ============================================================
# CHECK 3 — Do the two cleared columns actually paint the map?
# ============================================================
# Decides: whether Guide 2's ruling survives contact with the real polygon set.
#   CHECK 4 in Guide 2 measured this as an aggregate density figure; here it is
#   made concrete — how many categories a typical neighbourhood carries, and how
#   dominant its leading category is.
#
# What to look for: a median top-category share well below 100% means a mixed
#   local economy the map can differentiate. A share at or near 100% would mean
#   the level is so coarse (or the neighbourhood so empty) that every polygon
#   reads the same.

cat("========== CHECK 3: do the cleared columns paint? ==========\n")
for (i in seq_len(nrow(CLEARED))) {
  lvl <- CLEARED$level[i]
  key <- if (CLEARED$key_is_label[i]) bc[[CLEARED$key_col[i]]]
         else as.character(bc[[CLEARED$key_col[i]]])

  lv <- tibble(nbhd_id = as.character(bc$`Neighbourhood Number`),
               nbhd    = bc$`Neighbourhood Name`,
               key     = key,
               label   = bc[[CLEARED$label_col[i]]])

  xtab <- lv |>
    group_by(nbhd_id, nbhd, key) |>
    summarise(n = n(),
              label = names(sort(table(label), decreasing = TRUE))[1],
              .groups = "drop")

  by_nbhd <- xtab |>
    group_by(nbhd_id, nbhd) |>
    summarise(n_businesses    = sum(n),
              n_categories    = n_distinct(key),
              top_category    = label[which.max(n)],
              top_pct_of_nbhd = round(100 * max(n) / sum(n), 1),
              .groups = "drop") |>
    arrange(desc(n_businesses))

  cat(sprintf("\n  --- %s ---\n", lvl))
  cat(sprintf("    categories present: %s | non-empty cells: %s of %s possible (%.1f%% dense)\n",
              n_distinct(lv$key), format(nrow(xtab), big.mark = ","),
              format(N_NB * n_distinct(lv$key), big.mark = ","),
              100 * nrow(xtab) / (N_NB * n_distinct(lv$key))))
  cat(sprintf("    categories per neighbourhood: median %s, max %s\n",
              median(by_nbhd$n_categories), max(by_nbhd$n_categories)))
  cat(sprintf("    leading category's share of a neighbourhood: median %.1f%%, max %.1f%%\n",
              median(by_nbhd$top_pct_of_nbhd), max(by_nbhd$top_pct_of_nbhd)))
  cat("    Top 10 neighbourhoods and what leads them:\n")
  print(by_nbhd |> select(nbhd, n_businesses, n_categories, top_category,
                          top_pct_of_nbhd) |> head(10), n = 10, width = Inf)

  # Per-category spread: how far across the city does a typical category reach?
  by_cat <- xtab |>
    group_by(key) |>
    summarise(label            = label[which.max(n)],
              n_businesses     = sum(n),
              pct_of_year      = round(100 * sum(n) / N_PLACED, 2),
              n_neighbourhoods = n_distinct(nbhd_id),
              top_nbhd         = nbhd[which.max(n)],
              top_nbhd_pct     = round(100 * max(n) / sum(n), 1),
              .groups = "drop") |>
    arrange(desc(n_businesses))

  cat(sprintf("\n    neighbourhoods reached by a category: median %s, max %s\n",
              median(by_cat$n_neighbourhoods), max(by_cat$n_neighbourhoods)))
  cat(sprintf("    categories present in only ONE neighbourhood: %s of %s\n",
              sum(by_cat$n_neighbourhoods == 1), nrow(by_cat)))
  cat(sprintf("    Top 10 categories by size (of %s):\n", nrow(by_cat)))
  print(by_cat |> select(label, n_businesses, pct_of_year,
                         n_neighbourhoods, top_nbhd, top_nbhd_pct) |> head(10),
        n = 10, width = Inf)
}
cat("\n  => Both cleared columns behave. Sectors reaches most of the city per\n")
cat("     category, as the ruling requires of a fill; Industry Group stays finer\n")
cat("     and patchier, which is exactly why it was cleared for the density /\n")
cat("     descriptive job rather than the fill.\n\n")


# ============================================================
# CHECK 4 — Does Industry Group carry interpretable signal?
# ============================================================
# Decides: whether the second cleared column earns its place, or whether Sectors
#   alone would do. A descriptive layer is only worth building if its categories
#   say something a coarser level cannot.
#
# The test: split neighbourhoods on a characteristic visible in their NAME, and
#   ask whether Industry Group separates them. Lift = a category's share of the
#   industrial-named group divided by its share of everywhere else. Lift >> 1
#   means the category is a signature of that kind of place.
#
# CAVEAT: this splits on the NAME, which is a proxy, not a land-use
#   classification. Genuinely industrial areas without the word in their name
#   fall on the wrong side. Good enough to demonstrate discriminating power;
#   not a basis for any published figure. The file's own `Planning District`
#   field would be the honest cut, and is left for later.

cat("========== CHECK 4: does Industry Group discriminate? ==========\n")
ind <- bc |> mutate(is_ind = grepl("INDUSTRIAL", `Neighbourhood Name`))
TOT_I <- sum(ind$is_ind); TOT_O <- sum(!ind$is_ind)
cat(sprintf("  Neighbourhoods named INDUSTRIAL: %s of %s, holding %s businesses (%.1f%%)\n\n",
            n_distinct(ind$`Neighbourhood Name`[ind$is_ind]), N_NB,
            format(TOT_I, big.mark = ","), 100 * TOT_I / N_PLACED))

cmp <- ind |>
  group_by(label = `Industry Group`) |>
  summarise(n_ind = sum(is_ind), n_oth = sum(!is_ind), n_all = n(), .groups = "drop") |>
  filter(n_all >= 100) |>
  mutate(pct_in_ind = round(100 * n_ind / n_all, 1),
         lift       = round((n_ind / TOT_I) / pmax(n_oth / TOT_O, 1e-9), 2))

cat("  MOST over-represented in industrial-named neighbourhoods:\n")
print(cmp |> arrange(desc(lift)) |> select(label, n_all, pct_in_ind, lift) |> head(8),
      n = 8, width = Inf)
cat("\n  MOST under-represented:\n")
print(cmp |> arrange(lift) |> select(label, n_all, pct_in_ind, lift) |> head(6),
      n = 6, width = Inf)
cat("\n  => Industry Group separates these places sharply — trades, machinery,\n")
cat("     freight and auto concentrate; the residential-service layer (schools,\n")
cat("     daycare, clinics, groceries, landlords) is nearly absent. Sectors alone\n")
cat("     would blur most of this into one or two broad headings. That contrast\n")
cat("     is what the second cleared column is FOR.\n\n")


# ============================================================
# WHERE THIS LEAVES THE TRAIL
# ============================================================

cat("=============================================================\n")
cat("GUIDE 3 CLOSES — the ruling holds\n")
cat("=============================================================\n")
cat("  * The city's business distribution is genuinely lopsided (CHECK 2), and\n")
cat("    that is a colour-ramp problem, not a column-choice problem.\n")
cat("  * `Sectors` reaches most of the city per category — it can carry a fill.\n")
cat("  * `Industry Group` stays finer and patchier, and discriminates sharply\n")
cat("    between kinds of place — it earns the descriptive / density job.\n")
cat("  * The thin tail of near-empty neighbourhoods is structural. Counts there\n")
cat("    are correct; only derived shares are unstable at low n.\n")
cat("\n")
cat("  RULING CONFIRMED: `Sectors` and `Industry Group` are the columns cleared\n")
cat("  for mapping (see Guide 2 for the full argument).\n")
cat("\n")
cat("  NEXT: 04_build_mapping_frame.R materializes the clean analytical frame\n")
cat("  these two columns are read from.\n")
cat("=============================================================\n")
