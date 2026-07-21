# ============================================================
# economy/business-census/scripts/eda/04_build_mapping_frame.R
#
# Build the MAPPING-READY CLEAN FRAME — and stop.
# ------------------------------------------------------------
# The drop-off point. Guides 01-03 ruled that `sectors` and `industry_group`
# are the columns cleared for mapping; this script materializes the analytical
# frame those columns are read from, prints it for inspection, and ends. It is
# deliberately the LAST thing that happens automatically — everything after the
# load is KC's to drive interactively.
#
# What it does, in order:
#   1. load the newest raw snapshot (guarded, same as the guides)
#   2. scope to the mapping vintage — the LATEST survey wave
#   3. keep 14 columns, renamed to snake_case; drop everything else
#   4. print shape + types + head, and stop
#
# VINTAGE — why the latest wave, and why it is derived not hardcoded:
#   The Business Census is a full-canvass administrative register, not a panel.
#   Each wave re-enumerates the city, so the latest wave IS the current state —
#   not one period in a time series. The year is taken as max(survey_year) so a
#   refresh follows the data forward with no edit here (CLAUDE.md §6/§9,
#   refresh-by-design: no year literals).
#
#   The cost of deriving it is stated openly in step 2: if the City ever
#   publishes a PARTIAL new wave, max() would silently adopt a thin year. The
#   wave table is therefore printed BEFORE the filter, and the chosen wave is
#   compared against the previous one, so a shrink is visible rather than
#   assumed away. No automatic rejection — that would be inventing a policy this
#   script has no standing to set.
#
# Run context: OUT-OF-BAND — not in _whirl.yaml, never in the run order.
#     source("pipeline/yeg/economy/business-census/scripts/eda/04_build_mapping_frame.R")
#   Leaves `bc_map` in the environment for interactive work.
#
# Input:   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest by glob)
#          ALREADY ON DISK — never fetches.
# Outputs: NONE. The frame lives in memory; nothing is written to disk, nothing
#          is published, no manifest is emitted.
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))


# ── 0. The keep-list ────────────────────────────────────────
# Source column (Title Case, as the export endpoint delivers) -> the snake_case
# name it takes in the frame. Everything not named here is dropped: business
# identity and contact fields, the survey-attribute fields, the rejected
# classification levels (subsectors / industries / naics), and the descriptive
# free-text columns.
#
# ON THE TWO *_code COLUMNS — they are NOT the same kind of key, and the
# difference is load-bearing:
#
#   industry_group_code  IS the stable key. 297 codes to 297 labels, 1:1 in the
#                        mapping vintage. Group on the code; the label is for
#                        display.
#
#   sectors_code         is NOT the aggregation key, despite the symmetry of the
#                        names. NAICS gives some sectors a code RANGE —
#                        manufacturing is 31/32/33, retail 44/45, transportation
#                        48/49 — so there are MORE sector codes than sector
#                        labels. Grouping on sectors_code SPLITS those three
#                        sectors into fragments. **Aggregate sectors on
#                        `sectors`, the label.** The code is kept because it is
#                        the NAICS-standard identifier and is useful for
#                        ordering and for joining to external NAICS tables — but
#                        it is not the grouping key at this level.
#                        (Guide 02, CHECK 2d.)
#
# This is the one place in the hierarchy where "always key on the code" inverts.

KEEP <- tribble(
  ~source,                 ~name,
  "objectid",              "objectid",               # row id (repeats across waves)
  "Survey Year",           "survey_year",            # vintage stamp — retained deliberately
  "Export",                "export",                 # survey attribute (heavily optional)
  "Hybrid Work",           "hybrid_work",            # survey attribute (heavily optional)
  "Sectors",               "sectors",                # CLEARED: choropleth fill (group on THIS)
  "Sectors Code",          "sectors_code",           # NAICS id — see note above, not the key
  "Industry Group",        "industry_group",         # CLEARED: descriptive / density layer
  "Industry Group Code",   "industry_group_code",    # the stable grouping key at this level
  "Planning District",     "district",               # planning district
  "Neighbourhood Number",  "neighbourhood_number",   # polygon join key (ID join, never name)
  "Neighbourhood Name",    "neighbourhood_name",     # label only — never the join key
  "Latitude",              "latitude",
  "Longitude",             "longitude",
  "Geometry",              "geom"
)

RAW_MARKER_COLS <- c("objectid", "Business Name", "NAICS Code", "Sectors",
                     "Latitude", "Longitude")


# ── 1. Load the newest raw snapshot ─────────────────────────
# Newest-by-glob, then assert the business-level shape — the pre-aggregated
# wh44-4bkz snapshots share this filename stem in this directory, so the newest
# file is not reliably the raw one. Full rationale in Guide 01, CHECK 0.

raw_dir <- section_path("economy/business-census", "data", "raw")

csv_files <- list.files(raw_dir,
                        pattern    = "^Edmonton_Business_Census_\\d{8}\\.csv$",
                        full.names = TRUE)
if (length(csv_files) == 0) {
  stop("No Edmonton_Business_Census_<YYYYMMDD>.csv in ", raw_dir)
}
csv_path <- sort(csv_files, decreasing = TRUE)[1]

cat("=============================================================\n")
cat("Business Census — mapping-ready clean frame\n")
cat("Snapshot:", basename(csv_path), "\n")
cat("=============================================================\n\n")

bc_raw <- read_csv(csv_path, show_col_types = FALSE)

missing_markers <- setdiff(RAW_MARKER_COLS, names(bc_raw))
if (length(missing_markers) > 0) {
  stop("This is not the RAW business-level file (8c4b-u4a4).\n",
       "  Grabbed:  ", basename(csv_path), "\n",
       "  Missing raw-only column(s): ", paste(missing_markers, collapse = ", "), "\n",
       "  The pre-aggregated wh44-4bkz snapshots share this filename stem here.")
}

# Schema guard: every column the frame promises must exist. A City rename would
# otherwise produce a silently narrower frame that still looks valid.
missing_keep <- setdiff(KEEP$source, names(bc_raw))
if (length(missing_keep) > 0) {
  stop("Source schema changed — column(s) the frame needs are absent: ",
       paste(missing_keep, collapse = ", "),
       ". Reconcile the KEEP table against the snapshot before proceeding.")
}
cat(sprintf("Loaded %s rows x %s columns. Schema guard: OK.\n\n",
            format(nrow(bc_raw), big.mark = ","), ncol(bc_raw)))


# ── 2. Scope to the mapping vintage (latest wave) ───────────
# Printed before filtering so the choice is visible, not implicit.

cat("--- Survey waves present ---\n")
waves <- bc_raw |> count(`Survey Year`, name = "rows") |> arrange(`Survey Year`)
print(waves)

MAP_YEAR <- max(bc_raw$`Survey Year`, na.rm = TRUE)
prev_rows <- waves$rows[waves$`Survey Year` == sort(waves$`Survey Year`,
                                                    decreasing = TRUE)[2]]
this_rows <- waves$rows[waves$`Survey Year` == MAP_YEAR]

cat(sprintf("\nMapping vintage (latest wave): %s — %s rows\n",
            MAP_YEAR, format(this_rows, big.mark = ",")))
if (length(prev_rows) == 1 && !is.na(prev_rows)) {
  cat(sprintf("Previous wave: %s rows (%+.0f%% change).%s\n",
              format(prev_rows, big.mark = ","),
              100 * (this_rows - prev_rows) / prev_rows,
              if (this_rows < prev_rows)
                "  <-- SMALLER than the previous wave; confirm it is complete before relying on it."
              else ""))
}

bc_map <- bc_raw |> filter(`Survey Year` == MAP_YEAR)
cat(sprintf("\nScoped to %s: %s of %s rows (%.1f%% of the file).\n\n",
            MAP_YEAR, format(nrow(bc_map), big.mark = ","),
            format(nrow(bc_raw), big.mark = ","),
            100 * nrow(bc_map) / nrow(bc_raw)))


# ── 3. Keep the 14 columns; drop everything else ────────────
# select() by the KEEP table, then rename in one step — so the keep-list is the
# single place the frame's shape is declared.

dropped <- setdiff(names(bc_raw), KEEP$source)

bc_map <- bc_map |>
  select(all_of(KEEP$source)) |>
  rename_with(~ KEEP$name[match(.x, KEEP$source)])

cat(sprintf("--- Columns: kept %d, dropped %d ---\n", ncol(bc_map), length(dropped)))
cat("  dropped:", paste(dropped, collapse = ", "), "\n\n")


# ── 4. Inspect the frame, and stop ──────────────────────────
# Shape, types and a first look. Missingness is included because two retained
# survey attributes (export, hybrid_work) are voluntary fields and substantially
# blank — better to see that here than to discover it mid-analysis.

cat("--- glimpse(bc_map) ---\n")
glimpse(bc_map)

cat("\n--- per-column type / missingness ---\n")
print(tibble(
  column = names(bc_map),
  type   = vapply(bc_map, function(x) class(x)[1],   character(1)),
  n_na   = vapply(bc_map, function(x) sum(is.na(x)), integer(1))
) |> mutate(pct_na = round(100 * n_na / nrow(bc_map), 1)), n = Inf)

cat("\n--- head(bc_map) ---\n")
print(head(bc_map), width = Inf)

cat("\n=============================================================\n")
cat(sprintf("Frame ready: `bc_map` — %s rows x %s columns, vintage %s.\n",
            format(nrow(bc_map), big.mark = ","), ncol(bc_map), MAP_YEAR))
cat("Nothing written to disk. Drop-off point — everything after this is manual.\n")
cat("Reminder: group `sectors` on the LABEL, `industry_group` on its CODE.\n")
cat("=============================================================\n")
