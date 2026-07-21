# ============================================================
# economy/business-census/scripts/eda/02_profile_naics_classification.R
#
# GUIDE 2 of 3 — "Which classification level do we map?"   *** THE RULING ***
# ------------------------------------------------------------
# Guide 1 established that the raw file carries five nested classification
# levels. Only one can drive a choropleth. This guide chooses, and records why.
#
#   01              orients: what the file holds.
#   02 (this file)  decides: which level we map. <- THE RULING LIVES HERE
#   03              confirms: how the cleared columns behave across the city.
#
# The ruling, stated up front so the trail is readable in either direction:
#
#     `Sectors` and `Industry Group` are CLEARED for mapping.
#     `Industries` and `NAICS` are NOT.
#
# The four CHECKs below are the argument, in the order it has to be made:
#   CHECK 1  how granular is each level?          (the ladder we choose on)
#   CHECK 2  is the label text trustworthy?       (label-vs-code cleanliness)
#   CHECK 3  do the codes nest?                   (can one column carry all five)
#   CHECK 4  which level actually fills a map?    (granularity fit — DECISIVE)
#   CHECK 5  does finer buy spatial signal?       (why finer was rejected)
#
# SCOPE DISCIPLINE — read this before trusting any number below.
#   CHECKs 1-3 run on the WHOLE FILE, deliberately: the file pools three survey
#   waves (Guide 1, CHECK 2) and the pooling is itself a finding — it is what
#   makes the label quality look far worse than it is for the year we map.
#   CHECKs 4-5 run on the MAPPING VINTAGE ONLY (the latest wave), because that
#   is the data a map would actually be built from. Each block says which.
#
# This guide MEASURES and RULES. It does not clean, canonicalize, crossmap, or
# consult any external taxonomy — comparing against the official StatCan NAICS
# set is a later standardization track, not this one.
#
# Run context: OUT-OF-BAND EDA — not in _whirl.yaml, never in the run order.
#     source("pipeline/yeg/economy/business-census/scripts/eda/02_profile_naics_classification.R")
#
# Input:   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest by glob)
#          ALREADY ON DISK — never fetches.
# Outputs: NONE. Console narrative only; writes nothing to disk.
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))


# ── 0. The five candidates ──────────────────────────────────
# digits = the code width, which the prefix-nesting test in CHECK 3 keys on
# (2 -> 3 -> 4 -> 5 -> 6). Data-driven: every block below loops this table, so
# the five levels are always treated identically and none can be quietly
# special-cased into looking better than it is.

LEVELS <- tribble(
  ~level,           ~code_col,             ~label_col,          ~digits,
  "Sectors",        "Sectors Code",        "Sectors",           2L,
  "Subsectors",     "Subsectors Code",     "Subsectors",        3L,
  "Industry Group", "Industry Group Code", "Industry Group",    4L,
  "Industry",       "Industries Code",     "Industries",        5L,
  "NAICS",          "NAICS Code",          "NAICS Description", 6L
)

RAW_MARKER_COLS <- c("objectid", "Business Name", "NAICS Code", "Sectors",
                     "Latitude", "Longitude")


# ── 1. Load (same guarded approach as Guide 1) ──────────────
# Newest-by-glob, then assert the business-level shape — the aggregate
# wh44-4bkz shares this filename stem in this directory. See 01 CHECK 0.

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

N_FILE <- nrow(bc_raw)

# The mapping vintage = the latest wave present. Derived, never a year literal
# (CLAUDE.md §6 refresh-by-design), so this guide follows the data forward.
MAP_YEAR <- max(bc_raw$`Survey Year`, na.rm = TRUE)

cat("=============================================================\n")
cat("GUIDE 2 of 3 — Which classification level do we map?\n")
cat("Snapshot:", basename(csv_path), "\n")
cat(sprintf("Whole file: %s rows across %s waves | mapping vintage: %s\n",
            format(N_FILE, big.mark = ","),
            length(unique(bc_raw$`Survey Year`)), MAP_YEAR))
cat("=============================================================\n\n")


# ============================================================
# CHECK 1 — How granular is each level?
# ============================================================
# Decides: the shape of the choice. Each step down the hierarchy multiplies the
#   category count. That is the whole trade-off in one table — finer categories
#   are more descriptive but each holds fewer businesses, and a category with
#   few businesses cannot fill a 369-polygon map.
#
# What to look for: codes and labels should match 1:1 at a well-behaved level.
#   Where they DIVERGE, something is wrong with the text (more labels than
#   codes) or with the codes (more codes than labels) — CHECK 2 diagnoses which.
#
# SCOPE: whole file.

cat("========== CHECK 1: the granularity ladder (whole file) ==========\n")
ladder <- tibble(level = character(), codes = integer(), labels = integer(),
                 median_category_size = numeric())
for (i in seq_len(nrow(LEVELS))) {
  code <- as.character(bc_raw[[LEVELS$code_col[i]]])
  ladder <- bind_rows(ladder, tibble(
    level                = LEVELS$level[i],
    codes                = n_distinct(code),
    labels               = n_distinct(bc_raw[[LEVELS$label_col[i]]]),
    median_category_size = median(as.integer(table(code)))
  ))
}
print(ladder, n = Inf, width = Inf)
cat("\n  => Two levels look irregular: Sectors has MORE codes than labels, and\n")
cat("     NAICS has far MORE labels than codes. CHECK 2 explains both.\n\n")


# ============================================================
# CHECK 2 — Is the label text trustworthy?
# ============================================================
# Decides: whether a level can be grouped and displayed on its LABEL, or only on
#   its CODE. This matters concretely: if one code carries several spellings,
#   then counting by label SPLITS a real category and understates it — the map
#   would show two half-sized categories where one exists.
#
# The measurement: within each code, rows NOT carrying that code's most common
#   spelling are "misattributed" — real members a label-keyed count files
#   elsewhere. Labels are grouped EXACTLY as written (no trim, no case-fold),
#   because that fragmentation IS the thing being measured.
#
# SCOPE: whole file FIRST, then split by wave — and the split is the point.

cat("========== CHECK 2a: label fragmentation, POOLED over all waves ==========\n")
pooled <- tibble(level = character(), codes = integer(), labels = integer(),
                 labels_per_code = numeric(), pct_codes_fragmented = numeric(),
                 pct_rows_misattributed = numeric())
for (i in seq_len(nrow(LEVELS))) {
  lv <- tibble(code  = as.character(bc_raw[[LEVELS$code_col[i]]]),
               label = bc_raw[[LEVELS$label_col[i]]])
  by_code <- lv |>
    group_by(code) |>
    summarise(n = n(), n_labels = n_distinct(label),
              n_top = max(table(label)), .groups = "drop")
  frag <- by_code |> filter(n_labels > 1)
  pooled <- bind_rows(pooled, tibble(
    level                  = LEVELS$level[i],
    codes                  = nrow(by_code),
    labels                 = n_distinct(lv$label),
    labels_per_code        = round(n_distinct(lv$label) / nrow(by_code), 3),
    pct_codes_fragmented   = round(100 * nrow(frag) / nrow(by_code), 2),
    pct_rows_misattributed = round(100 * sum(frag$n - frag$n_top) / N_FILE, 3)
  ))
}
print(pooled, n = Inf, width = Inf)
cat("\n  Read naively, this says NAICS Description is a free-text DESCRIPTION\n")
cat("  column, not a controlled label set. That reading is WRONG — and 2b shows why.\n\n")

cat("========== CHECK 2b: the same measure, BY WAVE ==========\n")
# WHY this block exists: it overturns 2a. The pooled figure is an artifact of
# stacking a dirty pilot wave onto clean ones. Without this split, the guide
# would reject a level for a defect the mapping vintage does not have.
by_wave <- bc_raw |>
  group_by(`Survey Year`) |>
  summarise(rows         = n(),
            codes        = n_distinct(`NAICS Code`),
            labels       = n_distinct(`NAICS Description`),
            .groups = "drop") |>
  mutate(labels_per_code = round(labels / codes, 2))
print(by_wave, n = Inf, width = Inf)
cat("\n  => The label mess is confined to the EARLIEST wave (a sparse pilot).\n")
cat("     In the later waves — including the mapping vintage — NAICS Description\n")
cat("     is a clean 1:1 controlled vocabulary. So label quality does NOT\n")
cat("     disqualify any level for mapping. The decision has to be made on\n")
cat("     GRANULARITY instead (CHECK 4), not on text hygiene.\n\n")

cat("========== CHECK 2c: worst offending code per level (whole file) ==========\n")
# Kept because it makes the pooled defect concrete rather than abstract — and
# because the offenders are visibly hand-entry drift (typos), not taxonomy
# variants, which is what pins the cause to the pilot wave.
for (i in seq_len(nrow(LEVELS))) {
  lv <- tibble(code  = as.character(bc_raw[[LEVELS$code_col[i]]]),
               label = bc_raw[[LEVELS$label_col[i]]])
  multi <- lv |> distinct(code, label) |> count(code, name = "n_labels") |>
    filter(n_labels > 1) |> arrange(desc(n_labels))
  cat(sprintf("  %-16s codes carrying >1 spelling: %s\n",
              LEVELS$level[i], nrow(multi)))
  if (nrow(multi) > 0) {
    worst <- multi$code[1]
    cat(sprintf("    worst: code %s with %d spellings\n", worst, multi$n_labels[1]))
    print(lv |> filter(code == worst) |> count(label, sort = TRUE, name = "n"), n = 6)
  }
}
cat("\n")

cat("========== CHECK 2d: the Sectors inversion — MORE codes than labels ==========\n")
# Decides: which key to group Sectors on — and it is the OPPOSITE of every other
#   level. NAICS assigns some sectors a RANGE of codes (manufacturing, retail and
#   transportation each span two or three). One label therefore legitimately maps
#   to several codes. Grouping Sectors on its CODE would split those sectors into
#   fragments; grouping on its LABEL is correct.
#   This is the one place the usual "always key on the code" rule inverts, so it
#   is called out explicitly rather than left to be rediscovered.
print(bc_raw |> filter(`Survey Year` == MAP_YEAR) |>
        count(Sectors, `Sectors Code`) |>
        group_by(Sectors) |>
        filter(n_distinct(`Sectors Code`) > 1) |>
        summarise(codes = paste(sort(`Sectors Code`), collapse = ", "),
                  rows  = sum(n), .groups = "drop"),
      n = Inf, width = Inf)
cat("\n  => AGGREGATE SECTORS ON THE LABEL, not the code. Industry Group has no\n")
cat("     such ranges and is keyed on its code as normal.\n\n")


# ============================================================
# CHECK 3 — Do the codes nest? Can ONE column carry all five levels?
# ============================================================
# Decides: how much has to be stored. NAICS codes are hierarchical by
#   construction — a 6-digit code should begin with its 5-digit parent, which
#   should begin with its 4-digit parent, and so on. If that holds, storing the
#   finest code alone is sufficient: every coarser level is a prefix away, and
#   the hierarchy stays consistent by construction instead of by trusting five
#   parallel columns to agree.
#
# What to look for: violations at or near zero in the mapping vintage. A handful
#   of bad rows are real-world data errors, not a broken taxonomy — the block
#   prints them so they can be judged rather than assumed.
#
# SCOPE: by wave, so the pilot's breakage does not contaminate the verdict.

cat("========== CHECK 3: prefix rollup integrity, BY WAVE ==========\n")
for (yr in sort(unique(bc_raw$`Survey Year`))) {
  d <- bc_raw |> filter(`Survey Year` == yr)
  n6 <- as.character(d$`NAICS Code`)
  cat(sprintf("  %s | rows %7s | ->Industry %4s bad | ->IndGroup %4s bad | ->Subsector %4s bad\n",
              yr, format(nrow(d), big.mark = ","),
              sum(substr(n6, 1, 5) != as.character(d$`Industries Code`)),
              sum(substr(n6, 1, 4) != as.character(d$`Industry Group Code`)),
              sum(substr(n6, 1, 3) != as.character(d$`Subsectors Code`))))
}

cat(sprintf("\n  Violations in the mapping vintage (%s), listed so they can be judged:\n", MAP_YEAR))
print(bc_raw |> filter(`Survey Year` == MAP_YEAR,
                       substr(as.character(`NAICS Code`), 1, 4) !=
                         as.character(`Industry Group Code`)) |>
        select(`Business Name`, `NAICS Code`, `NAICS Description`,
               `Industry Group Code`, `Industry Group`),
      width = Inf)
cat("\n  => In the mapping vintage the rollup is effectively exact. The residual\n")
cat("     rows are individual mis-filings at the City's end (the code and the\n")
cat("     assigned group disagree about the same business), not a taxonomy fault.\n")
cat("     CONSEQUENCE: the finest code is sufficient storage — every coarser\n")
cat("     level derives from a prefix. Storage and DISPLAY are separate\n")
cat("     questions, and CHECK 4 answers the display one.\n\n")


# ============================================================
# CHECK 4 — Which level actually FILLS a map?   *** DECISIVE ***
# ============================================================
# Decides: the ruling. A choropleth works by picking one category and colouring
#   every neighbourhood by its value. That only reads as a map if the chosen
#   category is PRESENT in most neighbourhoods. If the median category appears
#   in a couple of dozen polygons out of ~369, selecting it paints a near-empty
#   city — technically correct, useless to look at.
#
# The measures, and why each one matters:
#   density_pct    share of (neighbourhood x category) cells that are non-empty.
#                  The single best proxy for "will a map look populated".
#   med_nbhds_per_cat  how many neighbourhoods a typical category reaches.
#   cats_lt10_pct  share of categories with <10 businesses IN THE WHOLE CITY —
#                  these can never render meaningfully anywhere.
#   cells_ge5_pct  share of non-empty cells holding >=5 businesses; low values
#                  mean the map is mostly 1s and 2s, which is noise, not pattern.
#   cats_for_50pct how few categories carry half the data (concentration).
#
# SCOPE: mapping vintage only, neighbourhood-placed rows only.

cat("========== CHECK 4: choropleth fit by level (mapping vintage) ==========\n")
map_rows <- bc_raw |> filter(`Survey Year` == MAP_YEAR, !is.na(`Neighbourhood Number`))
N_MAP <- nrow(map_rows)
N_NB  <- n_distinct(map_rows$`Neighbourhood Number`)
cat(sprintf("  %s placed businesses across %s neighbourhoods\n\n",
            format(N_MAP, big.mark = ","), N_NB))

fit <- tibble(level = character(), categories = integer(), density_pct = numeric(),
              med_cat_size = numeric(), med_nbhds_per_cat = numeric(),
              cats_lt10_pct = numeric(), cells_ge5_pct = numeric(),
              cats_for_50pct = integer())
for (i in seq_len(nrow(LEVELS))) {
  # Sectors is keyed on its LABEL (CHECK 2d); every other level on its code.
  key <- if (LEVELS$level[i] == "Sectors") map_rows[[LEVELS$label_col[i]]]
         else as.character(map_rows[[LEVELS$code_col[i]]])
  v     <- tibble(nb = as.character(map_rows$`Neighbourhood Number`), key = key)
  cells <- v |> count(nb, key, name = "n")
  cats  <- v |> count(key, name = "n")
  fit <- bind_rows(fit, tibble(
    level             = LEVELS$level[i],
    categories        = nrow(cats),
    density_pct       = round(100 * nrow(cells) / (N_NB * nrow(cats)), 1),
    med_cat_size      = median(cats$n),
    med_nbhds_per_cat = median((v |> distinct(nb, key) |> count(key))$n),
    cats_lt10_pct     = round(100 * mean(cats$n < 10), 1),
    cells_ge5_pct     = round(100 * mean(cells$n >= 5), 1),
    cats_for_50pct    = which(cumsum(sort(cats$n, decreasing = TRUE)) / N_MAP >= 0.5)[1]
  ))
}
print(fit, n = Inf, width = Inf)
cat("\n  => The ladder collapses fast. At the finest levels the median category\n")
cat("     reaches single-digit neighbourhoods and roughly half the categories\n")
cat("     hold under 10 businesses citywide — those cannot be mapped.\n")
cat("     Sectors is the only level dense enough that ANY chosen category still\n")
cat("     paints most of the city; Industry Group is the finest level that keeps\n")
cat("     most businesses inside renderable categories.\n\n")


# ============================================================
# CHECK 5 — Does going FINER buy spatial signal?
# ============================================================
# Decides: whether the rejected levels earn their place on a DIFFERENT job —
#   a density / clustering layer, where coverage across polygons does not matter
#   but spatial tightness does. If splitting a category revealed sub-clusters in
#   distinct places, the finer level would be worth keeping for that purpose.
#
# The measure: standard distance — the spatial standard deviation of a
#   category's points, in km. SMALL means tightly clustered; large means spread
#   citywide. Compared against the all-business baseline, so the number reads as
#   "tighter than the city as a whole" rather than in the abstract.
#
# Restricted to categories with enough points to have a meaningful centroid;
#   tiny categories produce unstable, flattering distances.
#
# CAVEAT, stated because it bounds the conclusion: standard distance measures
#   spread around ONE centre, so a category concentrated in two distinct places
#   scores as "scattered" despite being genuinely clustered. It is a fair
#   RELATIVE comparison across levels (the bias applies equally to all), but it
#   understates bimodal categories in absolute terms.
#
# SCOPE: mapping vintage only.

cat("========== CHECK 5: spatial tightness by level (mapping vintage) ==========\n")
MIN_PTS <- 50L
geo <- map_rows |>
  mutate(y_km = Latitude * 111.32,
         x_km = Longitude * 111.32 * cos(Latitude * pi / 180))
baseline <- sqrt(var(geo$x_km) + var(geo$y_km))
cat(sprintf("  Citywide baseline standard distance: %.2f km\n", baseline))
cat(sprintf("  (categories with >= %d businesses only)\n\n", MIN_PTS))

tight <- tibble(level = character(), viable_cats = integer(),
                pct_biz_in_viable = numeric(), median_sd_km = numeric(),
                tightest_sd_km = numeric())
for (i in seq_len(nrow(LEVELS))) {
  key <- if (LEVELS$level[i] == "Sectors") geo[[LEVELS$label_col[i]]]
         else as.character(geo[[LEVELS$code_col[i]]])
  z <- geo |>
    mutate(key = key) |>
    group_by(key) |>
    filter(n() >= MIN_PTS) |>
    summarise(n = n(), sd_km = sqrt(var(x_km) + var(y_km)), .groups = "drop")
  tight <- bind_rows(tight, tibble(
    level             = LEVELS$level[i],
    viable_cats       = nrow(z),
    pct_biz_in_viable = round(100 * sum(z$n) / N_MAP, 1),
    median_sd_km      = round(median(z$sd_km), 2),
    tightest_sd_km    = round(min(z$sd_km), 2)
  ))
}
print(tight, n = Inf, width = Inf)
cat("\n  => Going finer does NOT tighten the clusters — median dispersion stops\n")
cat("     improving (and drifts the wrong way) below Industry Group, while the\n")
cat("     share of businesses sitting inside a viable category keeps falling.\n")
cat("     The finer taxonomy is subdividing categories that already occupy the\n")
cat("     SAME places. There is no hidden spatial structure below Industry Group\n")
cat("     to go and find, so the finer levels are not rescued by this job either.\n\n")


# ============================================================
# THE RULING
# ============================================================

cat("=============================================================\n")
cat("*** RULING — columns cleared for mapping ***\n")
cat("=============================================================\n")
cat("  CLEARED:  `Sectors`         — the choropleth fill.\n")
cat("            `Industry Group`  — the descriptive / density layer.\n")
cat("  NOT CLEARED: `Industries`, `NAICS`.\n")
cat("\n")
cat("  WHY SECTORS FILLS THE MAP (CHECK 4)\n")
cat("    It is the only level where selecting a category still colours most of\n")
cat("    the city. No sector is too small to render, and ~20 categories is a\n")
cat("    usable selector where hundreds is not.\n")
cat("    NOTE: aggregate it on the LABEL, not the code (CHECK 2d) — sector codes\n")
cat("    come in ranges and would split Manufacturing / Retail / Transportation.\n")
cat("\n")
cat("  WHY INDUSTRY GROUP IS THE SECOND TARGET (CHECKs 4 + 5)\n")
cat("    It is the finest level that keeps most businesses inside renderable\n")
cat("    categories, AND the point at which spatial tightness stops improving.\n")
cat("    It is where the interpretable signal lives — describable trades and\n")
cat("    services, not abstractions — without paying for detail that adds nothing.\n")
cat("\n")
cat("  WHY INDUSTRIES / NAICS WERE REJECTED (CHECKs 4 + 5)\n")
cat("    Not for label quality — CHECK 2b cleared them for the mapping vintage.\n")
cat("    They were rejected on GRANULARITY: at those levels the median category\n")
cat("    reaches single-digit neighbourhoods, ~half of all categories hold under\n")
cat("    10 businesses citywide, and the map is mostly empty cells. CHECK 5 shows\n")
cat("    the split buys no compensating spatial detail. Their remaining use is as\n")
cat("    stored detail to filter on (CHECK 3: the finest code derives the rest),\n")
cat("    never as the aggregation unit.\n")
cat("\n")
cat("  VINTAGE CAVEAT\n")
cat("    This ruling is made on the mapping vintage. The earliest wave fails both\n")
cat("    the label test (CHECK 2b) and the rollup test (CHECK 3) and would need\n")
cat("    its own reconciliation before it could share this path.\n")
cat("\n")
cat("  NEXT: GUIDE 3 (03_profile_neighbourhood_distribution.R) checks the two\n")
cat("  cleared columns actually behave across all neighbourhoods.\n")
cat("=============================================================\n")
