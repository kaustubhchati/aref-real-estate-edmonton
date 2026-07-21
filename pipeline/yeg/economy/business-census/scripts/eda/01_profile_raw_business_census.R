# ============================================================
# economy/business-census/scripts/eda/01_profile_raw_business_census.R
#
# GUIDE 1 of 3 — "What is in this file?"
# ------------------------------------------------------------
# This is the first stop in a three-part decision trail over the RAW,
# business-level Edmonton Business Census (Socrata 8c4b-u4a4) — the parent of
# the pre-aggregated wh44-4bkz that the built section already ships.
#
#   01 (this file)  orients: what the file holds, and what shape it is in.
#   02              decides: which classification level we map. <- THE RULING
#   03              confirms: how the cleared columns behave across the city.
#
# The question this guide exists to set up: the file carries FIVE nested
# classification levels (sector -> subsector -> industry group -> industry ->
# NAICS). Only one can drive a choropleth. Which one? This guide does not
# answer that — it establishes what we are choosing between. 02 chooses.
#
# Read it as a walkthrough: each CHECK states what it is looking for and what
# the answer would MEAN, then shows the numbers. Nothing here cleans,
# canonicalizes, or joins — it only observes.
#
# Run context: OUT-OF-BAND EDA — not in _whirl.yaml, never in the run order.
#     source("pipeline/yeg/economy/business-census/scripts/eda/01_profile_raw_business_census.R")
#   Bootstrap-anchored, so it resolves from any cwd inside the repo.
#
# Input:   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest by glob)
#          ALREADY ON DISK — this guide never fetches.
# Outputs: NONE. Console narrative only; writes nothing to disk.
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)

# Repo-root anchoring + the path seam (ROOT, section_path(), …). No absolute
# paths: the raw dir is addressed by RELATIONSHIP, like every other script.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))


# ── 0. Column contract ──────────────────────────────────────
# Export-endpoint columns are Title Case (same as the aggregate + the boundary).

# The five nested NAICS levels, coarsest -> finest. These are the candidates
# 02 chooses between; CHECK 3 confirms all five are actually here.
NAICS_CODE_COLS <- c("Sectors Code", "Subsectors Code", "Industry Group Code",
                     "Industries Code", "NAICS Code")

# RAW-ONLY marker columns — the disambiguation guard (see CHECK 0). The
# aggregate wh44-4bkz carries NONE of these; the business-level raw file
# carries all.
RAW_MARKER_COLS <- c("objectid", "Business Name", "NAICS Code", "Sectors",
                     "Latitude", "Longitude")

# Descriptive + classification fields whose vocabularies we want to SEE.
# n_show caps the printed frequency table per field: small closed vocabularies
# print whole, the long-tailed ones print a top-N head. Data-driven so adding a
# field is one row here, not new code below.
VOCAB_COLS <- tribble(
  ~column,                 ~n_show,
  "Sectors",                    30L,   # NAICS L1 — expect ~20, closed
  "Subsectors",                 30L,   # NAICS L2
  "Industry Group",             30L,   # NAICS L3
  "Industries",                 30L,   # NAICS L4
  "NAICS Code",                 30L,   # NAICS L5 — long tail, head only
  "NAICS Description",          30L,   # L5 label — long tail, head only
  "Business Description",       30L,   # free text — long tail, head only
  "Service Or Goods",           30L,   # expect small, closed
  "Business Size",              30L    # expect small, closed (banded)
)


# ============================================================
# CHECK 0 — Are we even holding the right file?
# ============================================================
# Decides: nothing analytical — this is the gate that makes every later number
#   trustworthy. It matters because the PRE-AGGREGATED wh44-4bkz snapshots share
#   this EXACT filename stem in this EXACT directory (the production script
#   fetches them with filename_stem = "Edmonton_Business_Census"). So "newest by
#   glob" is NOT reliably the raw file — after the next production BC refresh it
#   will not be. Globbing alone would silently profile a ~545-row aggregate as if
#   it were the ~52k-row business-level file, and every conclusion downstream
#   would be wrong while looking perfectly plausible.
#
#   The fix is the same shape load_boundary() uses: glob for the file, then
#   ASSERT the contract. A wrong grab stops loudly and names the file.

raw_dir <- section_path("economy/business-census", "data", "raw")

csv_files <- list.files(raw_dir,
                        pattern    = "^Edmonton_Business_Census_\\d{8}\\.csv$",
                        full.names = TRUE)
if (length(csv_files) == 0) {
  stop("No Edmonton_Business_Census_<YYYYMMDD>.csv in ", raw_dir)
}
csv_path <- sort(csv_files, decreasing = TRUE)[1]

cat("=============================================================\n")
cat("GUIDE 1 of 3 — What is in this file?\n")
cat("Snapshot:", basename(csv_path), "\n")
cat("=============================================================\n\n")

bc_raw <- read_csv(csv_path, show_col_types = FALSE)

missing_markers <- setdiff(RAW_MARKER_COLS, names(bc_raw))
if (length(missing_markers) > 0) {
  stop("This is not the RAW business-level file (8c4b-u4a4).\n",
       "  Grabbed:  ", basename(csv_path), "\n",
       "  Missing raw-only column(s): ", paste(missing_markers, collapse = ", "), "\n",
       "  The pre-aggregated wh44-4bkz snapshots share this filename stem in ",
       "this directory, so the newest file is not always the raw one.")
}
cat("Raw-file contract: OK — all business-level marker columns present.\n\n")


# ============================================================
# CHECK 1 — What are we holding? Shape, types, missingness
# ============================================================
# Decides: which columns are usable at all. A column that is 75% NA cannot
#   anchor a map layer no matter how interesting it sounds, and cardinality
#   separates a CATEGORY (a few dozen repeated values, mappable) from free
#   TEXT (tens of thousands of distinct values, not mappable).
#
# What to look for: the classification columns should be low-NA and
#   low-cardinality. The optional business attributes (Export, Hybrid Work,
#   Year Of Establishment) are expected to be heavily missing — they are
#   voluntary survey fields, not administrative ones.

cat(sprintf("Rows: %s   Columns: %s\n\n",
            format(nrow(bc_raw), big.mark = ","), ncol(bc_raw)))

profile <- tibble(
  column     = names(bc_raw),
  type       = vapply(bc_raw, function(x) class(x)[1],        character(1)),
  n_na       = vapply(bc_raw, function(x) sum(is.na(x)),      integer(1)),
  n_distinct = vapply(bc_raw, function(x) length(unique(x)),  integer(1))
) |>
  mutate(pct_na = round(100 * n_na / nrow(bc_raw), 1)) |>
  relocate(pct_na, .after = n_na)

cat("========== CHECK 1: per-column profile ==========\n")
print(profile, n = Inf)
cat("\n")


# ============================================================
# CHECK 2 — Is this ONE dataset, or several stacked?
# ============================================================
# Decides: whether any share computed over the whole file is meaningful.
#   The Business Census is a full-canvass administrative register run in waves.
#   If the file pools multiple survey years, then a "share of all rows" figure
#   silently mixes vintages of different sizes and coverage — and the mix, not
#   the city, drives the answer.
#
# This is the single most important framing fact in the file, and it is easy to
#   miss: nothing in the filename says it is multi-year.
#
# Also checked here: is objectid a stable row key? If distinct(objectid) is
#   below nrow(), the grain is NOT one-business-one-row and objectid cannot be
#   treated as a primary key across the pooled file.

cat("========== CHECK 2: survey vintages stacked in one file ==========\n")
print(bc_raw |> count(`Survey Year`, name = "rows") |>
        mutate(pct_of_file = round(100 * rows / nrow(bc_raw), 1)))

cat(sprintf("\n  objectid: %s distinct over %s rows -> %s\n",
            format(length(unique(bc_raw$objectid)), big.mark = ","),
            format(nrow(bc_raw), big.mark = ","),
            if (length(unique(bc_raw$objectid)) == nrow(bc_raw))
              "unique; safe as a row key"
            else
              "NOT unique; ids repeat across waves, so it is not a file-wide key"))
cat("\n  => Every later guide states its vintage scope explicitly, because of this.\n\n")


# ============================================================
# CHECK 3 — Is the classification hierarchy complete?
# ============================================================
# Decides: whether the choice 02 has to make even exists. The whole reason this
#   raw file is worth taking on (over the ready-made neighbourhood aggregate) is
#   the full 5-level NAICS hierarchy — sector down to 6-digit industry. If a
#   level were absent, the candidate set would shrink here.
#
# What to look for: five levels present, each strictly finer than the last
#   (distinct counts should increase monotonically down the list).

cat("========== CHECK 3: NAICS hierarchy — all five code levels ==========\n")
for (col in NAICS_CODE_COLS) {
  present <- col %in% names(bc_raw)
  cat(sprintf("  %-22s present: %-5s  distinct: %s\n",
              col, present,
              if (present) format(length(unique(bc_raw[[col]])), big.mark = ",") else "-"))
}
naics_missing <- setdiff(NAICS_CODE_COLS, names(bc_raw))
cat(if (length(naics_missing) == 0)
      "  All five levels present — five candidates for 02 to choose between.\n\n"
    else
      paste0("  MISSING: ", paste(naics_missing, collapse = ", "), "\n\n"))


# ============================================================
# CHECK 4 — What do the vocabularies actually look like?
# ============================================================
# Decides: which columns read as CONTROLLED vocabularies (a fixed label set,
#   safe to display and group on) and which read as free text. That distinction
#   is what 02 measures rigorously; here we just look at the values as typed.
#
# Deliberately NOT normalized: dash variants, case drift and near-duplicate
#   labels are exactly what this pass should reveal, so nothing here tidies
#   them. useNA = "ifany" keeps blanks visible instead of quietly dropping out
#   of the vocabulary.
#
# Watch for: Business Size printing the SAME band twice under different dashes
#   (en-dash vs hyphen) — a live example of why a category has to be keyed on
#   something more stable than its text.

cat("========== CHECK 4: categorical vocabularies (raw, unnormalized) ==========\n\n")
for (i in seq_len(nrow(VOCAB_COLS))) {
  col    <- VOCAB_COLS$column[i]
  n_show <- VOCAB_COLS$n_show[i]

  if (!col %in% names(bc_raw)) {
    cat(sprintf("[%s] — COLUMN ABSENT\n\n", col))
    next
  }

  freq  <- sort(table(bc_raw[[col]], useNA = "ifany"), decreasing = TRUE)
  shown <- min(n_show, length(freq))
  cat(sprintf("[%s] %s distinct — showing %s\n",
              col, format(length(freq), big.mark = ","), shown))
  print(head(freq, n_show))
  if (length(freq) > shown) {
    cat(sprintf("  ... %s more not shown\n", format(length(freq) - shown, big.mark = ",")))
  }
  cat("\n")
}


# ============================================================
# CHECK 5 — Can every business be placed on a map?
# ============================================================
# Decides: whether a POINT layer is viable at all, and whether a coverage
#   disclosure is owed to the reader. Building Permits is the cautionary case:
#   ~36% of permits carry no usable location, so its map must state what it is
#   not showing. If this file has the same gap, every layer built on it inherits
#   the same obligation.
#
# What to look for: null counts at zero, and ranges inside the Edmonton envelope
#   (lat ~53.3-53.7, lon ~ -113.7 to -113.2). Anything outside is a geocoding
#   artifact worth seeing now. Nothing is filtered here.

cat("========== CHECK 5: coordinate coverage ==========\n")
for (col in c("Latitude", "Longitude")) {
  v <- bc_raw[[col]]
  cat(sprintf("  %-10s min: %-12s max: %-12s NA: %s (%.1f%%)\n",
              col,
              round(min(v, na.rm = TRUE), 5),
              round(max(v, na.rm = TRUE), 5),
              format(sum(is.na(v)), big.mark = ","),
              100 * sum(is.na(v)) / nrow(bc_raw)))
}

n_no_coord <- sum(is.na(bc_raw$Latitude) | is.na(bc_raw$Longitude))
cat(sprintf("  Rows missing either coordinate: %s (%.1f%%)\n",
            format(n_no_coord, big.mark = ","), 100 * n_no_coord / nrow(bc_raw)))

if ("Geometry" %in% names(bc_raw)) {
  n_geom_empty <- sum(is.na(bc_raw$Geometry) | !nzchar(trimws(bc_raw$Geometry)))
  cat(sprintf("  Rows with empty Geometry:       %s (%.1f%%)\n",
              format(n_geom_empty, big.mark = ","), 100 * n_geom_empty / nrow(bc_raw)))
}
cat(sprintf("\n  => %s\n\n",
            if (n_no_coord == 0)
              "Every business is mappable as a point. No coverage disclosure owed (unlike Building Permits)."
            else
              "Some businesses cannot be placed — a coverage note is owed on any point layer."))


# ============================================================
# WHERE THIS LEAVES THE DECISION
# ============================================================

cat("=============================================================\n")
cat("GUIDE 1 CLOSES — what we now know\n")
cat("=============================================================\n")
cat("  * The file is business-level, multi-vintage, and fully geocoded.\n")
cat("  * It carries FIVE nested classification levels, sector -> NAICS.\n")
cat("  * The label columns are visibly inconsistent in places (CHECK 4),\n")
cat("    so text alone is not yet trustworthy as a grouping key.\n")
cat("\n")
cat("  OPEN QUESTION: only ONE level can drive a choropleth. Which one?\n")
cat("  Answering that needs granularity, label quality and spatial behaviour\n")
cat("  measured against each other -> GUIDE 2 (02_profile_naics_classification.R),\n")
cat("  which carries the ruling.\n")
cat("=============================================================\n")
