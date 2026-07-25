# ============================================================
# economy/business-census/scripts/eda/04_build_mapping_frame.R
#
# ONE file, TWO parts — kept single deliberately: Part II consumes
# the frame Part I builds, and the worked derivation IS the record
# of how the shipped estimator was arrived at, ruling by ruling.
# ------------------------------------------------------------
#
#   PART I  — THE MAPPING-READY CLEAN FRAME (§0–§4).
#             Guides 01–03 ruled that `sectors` and `industry_group` are the
#             columns cleared for mapping; Part I materializes the analytical
#             frame those columns are read from, prints it for inspection,
#             and stops at a hard drop-off. Runs top-to-bottom on source();
#             leaves `bc_map` in the environment. Writes NOTHING to disk.
#
#   PART II — THE LCLQ DERIVATION (§5–§20).
#             KC's step-by-step derivation of the Local Colocation Quotient
#             on the frame: projection → neighbours → weights → observed
#             statistic → conditional permutation → FDR → sensitivity →
#             the include_self ruling → the 133-group production run.
#             Recorded RESULTS and RULINGS stay inline at the step that
#             produced them — the file doubles as the methods record.
#             Run MANUALLY, block by block, after Part I (the permutation
#             loops are heavy — the all-groups run in §16 is ~6 minutes
#             of laptop compute; see its timing block). §19 writes the
#             ONE artifact this file produces:
#                 data/output/bc_lclq_industry_group.csv
#             (the committed estimator output the website's Industry
#             Specializations view reads).
#
# CONTENTS
#   PART I  — the mapping-ready clean frame
#     §0  the keep-list (14 columns; the two *_code keys)
#     §1  load the newest raw snapshot (guarded)
#     §2  scope to the mapping vintage (latest wave)
#     §3  keep the 14 columns; drop everything else
#     §4  inspect the frame, and stop (Part I drop-off)
#   PART II — the LCLQ derivation
#     §5  projection — lat/long → UTM 12N (EPSG:26912), metres
#     §6  neighbours — kNN, k = 10 (self included at first; see §14)
#     §7  kernel weights — Gaussian, adaptive bandwidth
#     §8  neighbour matrices + the NaN-weight diagnostic
#     §9  RULING — coincident points → minimum bandwidth
#     §10 observed LCLQ — single group (Specialty food retailers)
#     §11 conditional permutation test          [+ recorded result]
#     §12 BH FDR correction                     [+ recorded result]
#     §13 k-sensitivity, k = 10/25/50           [+ recorded result]
#     §14 include_self comparison → RULING: exclude self
#     §15 group sizes — scope for the all-groups run
#     §16 all-groups run — 133 groups, shared permutations
#     §17 extract self-group (A→A) results + the two FDR scopes
#     §18 geography of clusters — the lessors finding  [+ result]
#     §19 consolidate — write bc_lclq_industry_group.csv
#     §20 lclq_all() — the estimator as a reusable unit + validation
#
# VINTAGE — why the latest wave, and why it is derived not hardcoded:
#   The Business Census is a full-canvass administrative register, not a
#   panel. Each wave re-enumerates the city, so the latest wave IS the
#   current state — not one period in a time series. The year is taken as
#   max(survey_year) so a refresh follows the data forward with no edit
#   here (CLAUDE.md §6/§9, refresh-by-design: no year literals).
#
#   The cost of deriving it is stated openly in §2: if the City ever
#   publishes a PARTIAL new wave, max() would silently adopt a thin year.
#   The wave table is therefore printed BEFORE the filter, and the chosen
#   wave is compared against the previous one, so a shrink is visible
#   rather than assumed away. No automatic rejection — that would be
#   inventing a policy this script has no standing to set.
#
# Run context: OUT-OF-BAND — not in _whirl.yaml, never in the run order.
#     source("pipeline/yeg/economy/business-census/scripts/eda/04_build_mapping_frame.R")
#   runs the WHOLE file — including Part II's ~6-minute permutation
#   compute AND the §19 CSV write. To get just the frame, run Part I
#   (§0–§4) and stop at its drop-off; Part II is written to be stepped
#   through interactively, block by block.
#
# Input:   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest by glob)
#          ALREADY ON DISK — never fetches.
# Outputs: Part I — NONE (the frame lives in memory).
#          Part II §19 — data/output/bc_lclq_industry_group.csv (the only
#          write; parameters travel in-file as columns).
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))


# ============================================================
# PART I — THE MAPPING-READY CLEAN FRAME
# ============================================================

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


# ── 4. Inspect the frame, and stop (Part I drop-off) ────────
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


# ============================================================
# PART II — THE LCLQ DERIVATION
# ============================================================
# Everything below is KC's interactive worked derivation on `bc_map`:
# run block by block, in order (later blocks consume earlier objects).
# New dependencies (sf, sfdep) load at the step that first needs them,
# so Part I stays runnable without them. Recorded RESULTS / RULINGS
# stay attached to the step that produced them.
# ============================================================

# ── 5. Projection — lat/long → UTM 12N, metres ──────────────
# The raw coordinates are EPSG:4326 (WGS84 degrees). Degrees are non-metric,
# so first transform to EPSG:26912 (UTM Zone 12N, NAD83), where coordinates
# are easting/northing in TRUE METRES — every distance computed from here on
# is in metres. Note st_as_sf() consumes longitude/latitude into the geometry
# column, so they are no longer separate fields on bc_sf.

library(sf)

bc_sf <- bc_map |>
  st_as_sf(coords = c("longitude", "latitude"), crs = 4326) |>
  st_transform(26912)

st_crs(bc_sf)$epsg
st_bbox(bc_sf)

# Observed bbox (metres): xmin/xmax are easting (east–west position),
# ymin/ymax are northing (north–south) — which is the whole point of the
# transform.
#   width:  348,715 − 320,221 = 28,494 m ≈ 28.5 km east–west
#   height: 5,954,368 − 5,913,258 = 41,110 m ≈ 41 km north–south
# So Edmonton's business footprint spans roughly 28 km wide by 41 km tall.


# ── 6. Neighbours — kNN, k = 10 ─────────────────────────────
# st_knn() finds each business's k nearest neighbours by Euclidean distance
# in the projected plane. Returns a list of length 29,894 — one entry per
# business, each holding the ROW INDICES of its k neighbours, e.g.
#   nb[[1]]  555 2462 4411 8432 8717 10011 12311 24144 24355 25554
# is the index set of business 1's 10 nearest neighbours.
# include_self() puts the business ITSELF into its own neighbourhood —
# adopted here because the canonical sfdep chain wraps it; interrogated and
# ultimately OVERTURNED in §14 (the ruling: exclude self).

library(sfdep)

k <- 10
nb <- include_self(st_knn(bc_sf, k = k))
length(nb)
nb[[1]]

knn_dists <- st_nb_dists(bc_sf, nb)

summary(sapply(knn_dists, max))

# Observed: the distribution of "how far away is my 10th nearest neighbour"
# across all businesses, in metres —
#     Min. 1st Qu.  Median    Mean 3rd Qu.    Max.
#     0.00   41.86   74.35  114.19  123.50 7248.56
# The median (~74 m) is the typical neighbourhood radius — roughly a city
# block. The max (~7.3 km) is a fringe business whose 10th neighbour is
# kilometres away (farmland, maybe) — this is where the adaptive bandwidth
# (§7) earns its keep.


# ── 7. Kernel weights — Gaussian, adaptive ──────────────────
# nb decided WHICH businesses are in each neighbourhood; the kernel decides
# HOW MUCH each one contributes. Gaussian means weight falls off smoothly
# with distance, so the nearest of your 10 counts heavily and the 10th
# counts little — formally, weights proportion the effect of each neighbour
# on the target point.
#
# adaptive = TRUE sets each business's bandwidth from its OWN kNN distances,
# so a downtown shop with neighbours 40 m out and a fringe shop with
# neighbours 1 km out are each scaled to their own local context rather than
# to a single citywide distance.

wt <- st_kernel_weights(nb, bc_sf, "gaussian", adaptive = TRUE)
length(wt)
wt[[1]]

# Observed, wt[[1]]:
#   1.720335 2.380756 2.146450 1.838008 2.364927 1.652842 2.334607 2.464220 1.778296 1.520347

# Spot-check one neighbourhood: neighbour index, its distance from the
# target point (not sorted in any order), and its weight — when sorted by
# distance, the weights descend cleanly, as a kernel should.

d1 <- st_nb_dists(bc_sf, nb)[[1]]

data.frame(
  neighbour = nb[[1]],
  dist_m    = round(d1, 1),
  weight    = round(wt[[1]], 4)
)


# ── 8. Neighbour matrices + the NaN-weight diagnostic ───────
# The NEIGHBOUR STRUCTURE is built once and reused by every permutation:
#   idx[i, ]     = row indices of business i's neighbourhood (self + k nearest)
#   wt_norm[i, ] = matching weights, each row normalized to sum to 1,
#                  so the numerator is a dot product: sum(w_tilde * f)
# Geometry never changes — only labels get shuffled later.

idx <- do.call(rbind, nb)

wt_norm <- do.call(rbind, wt)
wt_norm <- wt_norm / rowSums(wt_norm)
dim(idx)
dim(wt_norm)

max(abs(rowSums(wt_norm) - 1))

idx[1, ]
round(wt_norm[1, ], 4)

# DIAGNOSTIC — trace the NaN rows (kept: this trace is the evidence behind
# the §9 ruling). Which rows have NaN weights, what do their neighbour
# distances look like, are their coordinates literally identical, and where
# / what trades are they?

bad <- which(is.na(rowSums(wt_norm)))
length(bad)
bad[1:5]
i <- bad[1]

wt[[i]]
st_nb_dists(bc_sf, nb)[[i]]

table(sapply(bad, function(i) sum(st_nb_dists(bc_sf, nb)[[i]] == 0)))

coords <- st_coordinates(bc_sf)
stacks <- coords[bad, ]
nrow(unique(stacks))

bc_map[bad, ] |>
  count(neighbourhood_name, district, sort = TRUE)
bc_map[bad, ] |>
  count(industry_group, sort = TRUE) |>
  head(10)


# ── 9. RULING — coincident points → minimum bandwidth ───────
# The diagnostic found 124 businesses at 6 addresses (towers/malls): all 11
# neighbour distances are 0, so the adaptive bandwidth collapses to 0 and
# the Gaussian kernel returns NaN (0/0).
# RULING: impose a minimum bandwidth. Keeps the real coordinates, keeps
# these businesses in the analysis, and does not fabricate positions.
# Consequence: a fully-stacked neighbourhood becomes uniform weights.

wt_norm[bad, ] <- 1 / ncol(wt_norm)
max(abs(rowSums(wt_norm) - 1))


# ── 10. Observed LCLQ — single group ────────────────────────
# Vectorized over all businesses at once:
#   nbr_lab[i,j] = industry group of business i's j-th neighbour
#   f            = indicator: 1 if that neighbour is the target group
#   numerator    = rowSums(w_tilde * f) = weighted share of the neighbourhood
#   expected     = N_B / (N - 1), the citywide baseline
# First worked group: Specialty food retailers (266 businesses).

labels <- bc_map$industry_group

nbr_lab <- matrix(labels[idx], nrow = nrow(idx))

grp <- "Specialty food retailers"

numerator <- rowSums(wt_norm * (nbr_lab == grp))
expected  <- sum(labels == grp, na.rm = TRUE) / (length(labels) - 1)

lclq_obs <- numerator / expected
expected

summary(lclq_obs[labels == grp])

system.time(rowSums(wt_norm * (nbr_lab == grp)))

# Check the extremes — where do the very high in-group scores sit?

bc_map[labels == grp & lclq_obs > 50, ] |>
  count(neighbourhood_name, sort = TRUE) |>
  head(8)


# ── 11. Conditional permutation test ────────────────────────
# Shuffle LABELS across businesses; hold LOCATIONS fixed.
#   -> idx and wt_norm never change: Edmonton's business geography is
#      preserved in every shuffle, only "what trade sits where" is broken.
#   -> tests concentration CONDITIONAL on the observed point pattern.
# Expected share is constant under shuffling, so numerators are compared
# directly and the division happens once at the end.
# p = (count_ge + 1) / (nsim + 1) — the +1s prevent reporting p = 0.

set.seed(1)
nsim <- 999

count_ge <- integer(nrow(idx))

for (s in seq_len(nsim)) {
  lab_perm <- sample(labels)
  num_perm <- rowSums(wt_norm * (matrix(lab_perm[idx], nrow = nrow(idx)) == grp))
  count_ge <- count_ge + (num_perm >= numerator)
}

p_sim <- (count_ge + 1) / (nsim + 1)

in_grp <- labels == grp

summary(p_sim[in_grp])

sum(in_grp & p_sim <= 0.05)

bc_map[in_grp & p_sim <= 0.05, ] |>
  count(neighbourhood_name, sort = TRUE) |>
  head(8)

# ------------------------------------------------------------
# RESULT — Specialty food retailers, k = 10, nsim = 999
# ------------------------------------------------------------
# OBSERVED (lclq_obs, specialty-food shops only):
#   expected share = 0.0089  (266 of 29,893 businesses citywide)
#   min 4.5 | median 5.8 | mean 28.9 | max 103.2
#   Mean >> median => bimodal. Roughly half sit near 5-6 (a same-trade
#   neighbour or two, scattered); a large tail sits near 60-100 (dense
#   tight clusters). Every shop scores >= 4.5, i.e. specialty food
#   clusters citywide -- the test separates strong from moderate, not
#   clustered from not-clustered.
#
# SIGNIFICANCE (p_sim, specialty-food shops only):
#   min 0.001 | 1st Qu 0.001 | median 0.083 | max 0.115
#   >=25% of shops sit at the p-floor: NO shuffle out of 999 ever
#   reproduced their concentration.
#   116 of 266 shops significant at p <= 0.05.
#
# GEOGRAPHY (significant shops):
#   STRATHCONA 71 + STRATHCONA INDUSTRIAL PARK 25 = 96 of 116.
#   Remainder scattered in 2-4s (Summerlea, Leger, Belvedere, McCauley...).
#   => Old Strathcona is Edmonton's specialty-food cluster; the adjacent
#      industrial park is likely the wholesale/supply end of the same
#      agglomeration.
#
# VALIDATION:
#   Independent Python implementation (equirectangular projection,
#   unweighted k=10, 199 perms) found ~72 Scona points in tight clusters.
#   This chain (UTM 26912, Gaussian adaptive kernel, include_self, 999
#   perms) gives 66 + 8 = 74 on the magnitude cut. Two separate code
#   paths converging => the estimator chain is behaving.
#
# SIGNIFICANCE EARNS ITS KEEP:
#   magnitude cut (lclq > 50):  Strathcona 66 / Ind. Park  8
#   significance cut (p<=0.05): Strathcona 71 / Ind. Park 25
#   The Industrial Park TRIPLES. Those are moderate-LCLQ but
#   statistically solid businesses that an arbitrary magnitude
#   threshold discards. Significance finds signal magnitude misses.
#
# OPEN AT THIS POINT (1-3 resolved in later steps; 4 is a standing
# limitation):
#   1. NO FDR CORRECTION yet. 116 tests at alpha=0.05 => ~6 expected
#      false positives, and that is ONE group of 297. BH correction
#      mandatory before any multi-group run.            -> §12
#   2. include_self inflates everything. Each business guarantees
#      itself one match (~1/11 of its own numerator). Suspicious
#      evidence: max p is only 0.115 -- a genuinely unclustered
#      category should show p-values spread toward 1.0. Derive the
#      (N_B-1)/(N-1) algebra and re-check this distribution.  -> §14
#   3. k = 10 unjustified. Sensitivity across k (10/25/50).    -> §13
#   4. Coincident points: 124 businesses at 6 addresses (towers/
#      malls) given uniform weights. Geocoding resolution is the
#      BUILDING, not the unit -- vertical concentration is invisible
#      to a 2-D method. Limitation, not fixable by bandwidth choice.
# ------------------------------------------------------------


# ── 12. BH FDR correction ───────────────────────────────────
# 266 tests at alpha=0.05 => ~13 false positives expected by chance.
# Benjamini-Hochberg controls the FALSE DISCOVERY RATE: the expected
# proportion of flagged findings that are spurious.
#   - sort p ascending; rank i of m tests
#   - threshold for rank i is (i/m) * alpha  -> lenient at the top,
#     tightening down the ranks
# Correct across the 266 in-group tests only -- the tests actually run
# and interpreted, not all 29,894 rows.
# Bonferroni rejected: at 266 tests alpha becomes 0.00019, below the
# p-floor of 0.001, so it would discard every finding.

p_adj <- rep(NA_real_, length(p_sim))
p_adj[in_grp] <- p.adjust(p_sim[in_grp], method = "BH")

sum(in_grp & p_sim <= 0.05)
sum(in_grp & p_adj <= 0.05, na.rm = TRUE)

summary(p_adj[in_grp])

bc_map[in_grp & p_adj <= 0.05, ] |>
  count(neighbourhood_name, sort = TRUE) |>
  head(8)

# ------------------------------------------------------------
# RESULT — BH FDR, Specialty food retailers, k = 10, nsim = 999
# ------------------------------------------------------------
# Corrected across the 266 in-group tests only (the tests actually run
# and interpreted), NOT across all 29,894 rows.
#
#   significant BEFORE correction (p_sim  <= 0.05): 116
#   significant AFTER  correction (p_adj  <= 0.05): 116
#   ZERO findings lost.
#
#   p_adj: min 0.00286 | median 0.11075 | max 0.11500
#   (BH lifted the floor 0.001 -> 0.00286; still far below 0.05)
#
# WHY NOTHING DROPPED — the p-distribution is bimodal, not spread:
#   ~25% of shops sit at the p-floor; the rest jump to ~0.08-0.115.
#   Almost nothing sits NEAR the 0.05 threshold, so there were no
#   marginal significant cases to knock out. That gap between the two
#   modes is what a clean separation of cluster / non-cluster looks
#   like. A category with genuinely ambiguous clustering would lose
#   findings here.
#
# GEOGRAPHY UNCHANGED under correction:
#   STRATHCONA 71 + STRATHCONA INDUSTRIAL PARK 25 = 96 of 116
#   remainder in 2-4s (Summerlea, Leger, Belvedere, Callingwood S.,
#   Ellerslie, McCauley)
#
# => Old Strathcona is Edmonton's specialty-food cluster, and the
#    finding is FDR-controlled at 5%.
#
# STILL OPEN:
#   - include_self inflation (max p only 0.115; an unclustered category
#     should spread toward 1.0) -- derive (N_B-1)/(N-1) and re-check  -> §14
#   - k = 10 still unjustified; sensitivity check next               -> §13
#   - 296 other industry groups not yet run; correction scope will
#     need restating for a multi-group run (within-group vs
#     across-all)                                                    -> §17
# ------------------------------------------------------------


# ── 13. k-sensitivity — k = 10 / 25 / 50 ────────────────────
# A robustness check, NOT parameter optimization. k declares the SCALE of
# "local"; there is no true k to converge on and no objective function to
# optimize against. Choosing k by which value yields the most significant
# findings would be p-hacking.
# PURPOSE: show the Strathcona cluster is not an artifact of k = 10.
# Each k rebuilds neighbours + weights from scratch (different neighbours
# -> different bandwidths -> different weights), so the coincident-point
# fix (§9) must be reapplied each time.

k_test <- c(10, 25, 50)

for (kk in k_test) {

  nb_k  <- include_self(st_knn(bc_sf, k = kk))
  wt_k  <- st_kernel_weights(nb_k, bc_sf, "gaussian", adaptive = TRUE)

  idx_k <- do.call(rbind, nb_k)
  w_k   <- do.call(rbind, wt_k)
  w_k   <- w_k / rowSums(w_k)
  w_k[is.na(rowSums(w_k)), ] <- 1 / ncol(w_k)

  num_k <- rowSums(w_k * (matrix(labels[idx_k], nrow = nrow(idx_k)) == grp))

  set.seed(1)
  cnt_k <- integer(nrow(idx_k))
  for (s in seq_len(nsim)) {
    lp <- sample(labels)
    np <- rowSums(w_k * (matrix(lp[idx_k], nrow = nrow(idx_k)) == grp))
    cnt_k <- cnt_k + (np >= num_k)
  }

  p_k   <- (cnt_k + 1) / (nsim + 1)
  padj  <- rep(NA_real_, length(p_k))
  padj[in_grp] <- p.adjust(p_k[in_grp], method = "BH")

  sig <- in_grp & padj <= 0.05

  cat("\n--- k =", kk, "---\n")
  cat("significant (BH<=0.05):", sum(sig, na.rm = TRUE), "of", sum(in_grp), "\n")
  cat("median LCLQ in group:", round(median(num_k[in_grp] / expected), 2), "\n")
  print(head(count(bc_map[sig, ], neighbourhood_name, sort = TRUE), 4))
}

# ------------------------------------------------------------
# RESULT — k-sensitivity, Specialty food retailers, nsim = 999, BH FDR
# ------------------------------------------------------------
#   k    significant   median LCLQ   STRATHCONA   STRATH. IND. PARK
#   10     116 / 266       5.81          71              25
#   25     135 / 266       6.16          72              25
#   50     113 / 266       3.52          72              25
#
# STRATHCONA IS SCALE-INVARIANT: 71 -> 72 -> 72, and the Industrial
# Park is 25 at EVERY k. A finding that survives a 5x change in the
# scale parameter is not an artifact of the neighbourhood definition.
#
# MEDIAN LCLQ BEHAVES AS THEORY PREDICTS:
#   The fall at k=50 is DILUTION -- wider neighbourhoods reach past the
#   cluster into ordinary commercial mix, so the weighted same-trade
#   share drops.
#   The slight RISE at k=25 suggests the cluster's natural extent is a
#   bit wider than 10 neighbours: widening to 25 captures more of the
#   cluster before dilution sets in. This is a hint about the
#   phenomenon's scale -- NOT a reason to switch k (see below).
#
# TWO KINDS OF CLUSTER VISIBLE:
#   STRATHCONA  - tight, scale-invariant (unchanged across all k)
#   SUMMERLEA   - 4 -> 11 -> 9: looser concentration, too diffuse to
#                 register at block scale, clearer as k widens
#   LEGER       - steady at 3
#
# SIGNIFICANT COUNTS FLUCTUATE WITHOUT TRENDING (116/135/113).
# Correct pattern. A monotonic climb with k would suggest larger
# neighbourhoods were MANUFACTURING significance; instead it peaks at
# 25 and falls back.
#
# k REMAINS A JUDGEMENT CALL — this check does NOT select k.
#   k declares the SCALE of "local". There is no true k to converge on
#   and no objective function to optimise against (no ground-truth
#   cluster labels). Choosing the k with the most significant findings
#   would be p-hacking.
#   k = 10 is chosen because the median 10th-neighbour distance is
#   ~74 m -- roughly a city block -- which matches the block-scale
#   agglomeration being claimed.
#
# DEFENSIBLE STATEMENT:
#   "Old Strathcona is Edmonton's specialty-food cluster. The finding
#    is FDR-controlled at 5% and stable across k = 10, 25 and 50 --
#    71-72 significant businesses at every scale tested."
# ------------------------------------------------------------


# ── 14. include_self comparison → RULING: exclude self ──────
# Diagnostic first, ruling after the numbers.
# WITH self:    neighbourhood = k+1, business counts ITSELF as a
#               guaranteed same-category match at the kernel peak.
#               w_ii ~ 0.047 / expected 0.0089 ~ 5.3 of "free" LCLQ.
#               Observed median was 5.81 -> almost the entire median
#               score may be self.
# WITHOUT self: neighbourhood = k genuine neighbours; weights
#               renormalise so real neighbours carry more share.
# WATCH THE p-DISTRIBUTION, not the magnitudes. A correct null should
# let non-clustering businesses spread toward p = 1.0. The current
# p-max of 0.115 (nothing fails to look clustered) is the symptom.

nb_ns <- st_knn(bc_sf, k = k)
wt_ns <- st_kernel_weights(nb_ns, bc_sf, "gaussian", adaptive = TRUE)

idx_ns <- do.call(rbind, nb_ns)
w_ns   <- do.call(rbind, wt_ns)
w_ns   <- w_ns / rowSums(w_ns)
w_ns[is.na(rowSums(w_ns)), ] <- 1 / ncol(w_ns)

num_ns <- rowSums(w_ns * (matrix(labels[idx_ns], nrow = nrow(idx_ns)) == grp))

set.seed(1)
cnt_ns <- integer(nrow(idx_ns))
for (s in seq_len(nsim)) {
  lp <- sample(labels)
  np <- rowSums(w_ns * (matrix(lp[idx_ns], nrow = nrow(idx_ns)) == grp))
  cnt_ns <- cnt_ns + (np >= num_ns)
}
p_ns <- (cnt_ns + 1) / (nsim + 1)

padj_ns <- rep(NA_real_, length(p_ns))
padj_ns[in_grp] <- p.adjust(p_ns[in_grp], method = "BH")

cat("--- LCLQ (in-group) ---\n")
print(summary((numerator / expected)[in_grp]))
print(summary((num_ns   / expected)[in_grp]))

cat("\n--- raw p (in-group) ---\n")
print(summary(p_sim[in_grp]))
print(summary(p_ns[in_grp]))

cat("\n--- significant after BH ---\n")
cat("with self:   ", sum(in_grp & p_adj    <= 0.05, na.rm = TRUE), "\n")
cat("without self:", sum(in_grp & padj_ns  <= 0.05, na.rm = TRUE), "\n")

print(head(count(bc_map[in_grp & padj_ns <= 0.05, ], neighbourhood_name, sort = TRUE), 5))

# ------------------------------------------------------------
# RULING — EXCLUDE SELF. include_self() was inflating the estimator.
# ------------------------------------------------------------
# DIAGNOSTIC (Specialty food retailers, k = 10, nsim = 999, BH FDR):
#
#   LCLQ (in-group)      min     1stQ   median    mean    3rdQ     max
#     WITH self         4.548   5.239   5.809   28.890  57.694  103.181
#     WITHOUT self      0.000   0.000   0.000   24.680  54.770  102.670
#
#   raw p (in-group)     min     1stQ   median    mean    3rdQ     max
#     WITH self         0.001   0.001   0.0825  0.0537  0.0950   0.115
#     WITHOUT self      0.001   0.001   1.0000  0.5679  1.0000   1.000
#
# THE p-DISTRIBUTION IS THE PROOF, NOT THE MAGNITUDES:
#   WITH self, p maxes at 0.115 -- i.e. the estimator claimed EVERY
#   specialty-food business in Edmonton showed some clustering. Not
#   plausible. Self-inclusion imposed a FLOOR of significance that had
#   nothing to do with geography.
#   WITHOUT self, median p = 1.0: over half the shops show no
#   clustering at all -- correct, since most of the 266 are scattered
#   with no same-trade neighbour nearby. THIS is what a correct null
#   looks like.
#
# ARITHMETIC CONFIRMS THE MECHANISM (predicted before running):
#   w_ii ~ 0.047 normalised; expected share 0.0089
#   -> 0.047 / 0.0089 ~ 5.3 of "free" LCLQ from self alone
#   -> observed WITH-self median was 5.81
#   -> WITHOUT-self median is 0.00
#   So for a typical shop the ENTIRE with-self score was self-presence.
#   The estimator was reporting "I exist" as evidence of clustering.
#
# THE FINDING SURVIVES — self inflated the PERIPHERY, not the CORE:
#   significant (BH<=0.05):  116 with self  ->   98 without
#   STRATHCONA:               71            ->   69
#   STRATHCONA IND. PARK:     25            ->   21
#   90 of the 98 remain in the Strathcona pair. Losing 18 marginal
#   businesses while the centre holds is exactly the signature of
#   removing an artifact rather than removing signal.
#
# SPECIFICATION — the package contradicts itself; formula + data agree:
#   Published estimator sums over j != i, with baseline N_B/(N-1);
#   the (N-1) already excludes self from the denominator's universe.
#   sfdep's EXAMPLE wraps include_self(), but sfdep's own weights
#   documentation says the kernel weights list should NOT include self.
#   Formula says exclude. Diagnostic says exclude. -> EXCLUDE.
#
# CONSEQUENCE TO CARRY FORWARD:
#   A business with no same-trade neighbour now scores LCLQ = 0, p = 1.
#   Correct and honest -- but it means >50% of specialty-food shops are
#   simply NOT IN A CLUSTER. On any map these must render as a distinct
#   "no cluster" state, never as weak shading, or the map re-introduces
#   the exact inflation this ruling removed.
#
# nb/wt used from here on:  nb_ns / wt_ns  (st_knn WITHOUT include_self)
# ------------------------------------------------------------


# ── 15. Group sizes — scope for the all-groups run ──────────
# How many industry groups are even testable? Size distribution, the count
# clearing each candidate floor, and the share of businesses a >= 30 floor
# retains.

grp_sizes <- sort(table(labels), decreasing = TRUE)

length(grp_sizes)
summary(as.integer(grp_sizes))

sapply(c(10, 20, 30, 50, 100), function(m) sum(grp_sizes >= m))

sum(grp_sizes[grp_sizes >= 30]) / length(labels)


# ── 16. All-groups run — 133 groups, shared permutations ────
# 133 industry groups with >= 30 businesses.
# Geometry is category-independent: idx_ns / w_ns built ONCE (§14).
# ONE set of 999 shuffles scored against ALL groups -- the null is the
# same random relabelling whatever category you ask about. Turns
# 133 x 999 shuffles into 999.
# Numerators compared directly; expected share is constant per group
# under shuffling, so divide once at the end.

MIN_N  <- 30
groups <- names(grp_sizes)[grp_sizes >= MIN_N]
G      <- length(groups)
N      <- length(labels)

nbr_lab_ns <- matrix(labels[idx_ns], nrow = nrow(idx_ns))

obs_num <- matrix(0, nrow = N, ncol = G, dimnames = list(NULL, groups))
for (g in seq_len(G)) {
  obs_num[, g] <- rowSums(w_ns * (nbr_lab_ns == groups[g]))
}

set.seed(1)
cnt <- matrix(0L, nrow = N, ncol = G, dimnames = list(NULL, groups))

for (s in seq_len(nsim)) {
  lp      <- sample(labels)
  lp_nbr  <- matrix(lp[idx_ns], nrow = nrow(idx_ns))
  for (g in seq_len(G)) {
    np <- rowSums(w_ns * (lp_nbr == groups[g]))
    cnt[, g] <- cnt[, g] + (np >= obs_num[, g])
  }
}

p_all <- (cnt + 1) / (nsim + 1)

# Timing of ONE shuffle scored against all 133 groups (the loop above is
# 999 of these — ~6 minutes of laptop compute).

system.time({
  lp     <- sample(labels)
  lp_nbr <- matrix(lp[idx_ns], nrow = nrow(idx_ns))
  for (g in seq_len(G)) rowSums(w_ns * (lp_nbr == groups[g]))
})


# ── 17. Extract self-group (A→A) results + FDR scopes ───────
# p_all[i, g] is only meaningful when business i BELONGS to group g.
# Pull each business's p-value and LCLQ from its OWN group's column.
# Businesses in excluded groups (n < 30) get NA -- untested, not
# "not clustered".
# Two candidate FDR scopes computed side by side: BH within each group
# vs BH across all tested businesses (the ruling is in §18's result).

col_of <- match(labels, groups)
tested <- !is.na(col_of)

sel <- cbind(which(tested), col_of[tested])

exp_share <- setNames(as.integer(grp_sizes[groups]) / (N - 1), groups)

res_all <- tibble(
  row            = which(tested),
  industry_group = labels[tested],
  n_in_group     = as.integer(grp_sizes[labels[tested]]),
  lclq           = obs_num[sel] / exp_share[col_of[tested]],
  p_raw          = p_all[sel]
)

res_all$p_within <- ave(res_all$p_raw, res_all$industry_group,
                        FUN = function(p) p.adjust(p, method = "BH"))

res_all$p_across <- p.adjust(res_all$p_raw, method = "BH")
nrow(res_all)

cat("significant, within-group BH:", sum(res_all$p_within <= 0.05), "\n")
cat("significant, across-all  BH:", sum(res_all$p_across <= 0.05), "\n")

# Cross-checks: the worked group reproduces the standalone run; the top
# groups by significant members; and a first look at the lessors pattern.

res_all |>
  filter(industry_group == grp) |>
  summarise(n = n(),
            sig_within = sum(p_within <= 0.05),
            sig_across = sum(p_across <= 0.05))
res_all |>
  filter(p_across <= 0.05) |>
  count(industry_group, sort = TRUE) |>
  head(15)

res_all |>
  filter(industry_group == "Lessors of real estate", p_across <= 0.05) |>
  mutate(nbhd = bc_map$neighbourhood_name[row]) |>
  count(nbhd, sort = TRUE) |>
  head(8)


# ── 18. Geography of significant clusters — lessors ─────────
# All groups vs. lessors-excluded, side by side. If the ranking is
# stable between them, lessors are not distorting the map and no
# category ruling is needed. If it inverts, they are.

sig <- res_all |>
  filter(p_across <= 0.05) |>
  mutate(nbhd = bc_map$neighbourhood_name[row])

cat("--- ALL GROUPS ---\n")
print(sig |> count(nbhd, sort = TRUE) |> head(15))

cat("\n--- LESSORS EXCLUDED ---\n")
print(sig |>
        filter(industry_group != "Lessors of real estate") |>
        count(nbhd, sort = TRUE) |> head(15))
sig |>
  count(nbhd, lessor = industry_group == "Lessors of real estate") |>
  tidyr::pivot_wider(names_from = lessor, values_from = n, values_fill = 0) |>
  rename(other = `FALSE`, lessors = `TRUE`) |>
  mutate(total = other + lessors,
         pct_lessor = round(100 * lessors / total)) |>
  arrange(desc(total)) |>
  head(15)

# ------------------------------------------------------------
# RESULT — all-groups run: 133 groups (n >= 30), k = 10, no self,
#          nsim = 999, BH FDR
# ------------------------------------------------------------
# SCOPE:
#   MIN_N = 30 -> 133 of 297 groups tested (45% of groups)
#   but those cover 95% of all businesses. Median group size is 24,
#   1stQ is 5, min is 1 -- over a quarter of groups are too small to
#   produce a stable permutation distribution. Excluding untestable
#   groups up front is scope declaration, not cherry-picking; it also
#   stops them consuming FDR budget from groups that CAN say something.
#   28,381 businesses tested.
#
# VALIDATION — the loop reproduces the single-group run EXACTLY:
#   Specialty food, within-group BH: 98 here, 98 standalone.
#   The shared-permutation optimisation (one set of 999 shuffles scored
#   against ALL groups) changed the speed, not the statistics.
#
# FDR SCOPE RULING -> ACROSS-ALL:
#   within-group BH: 4,315 significant
#   across-all  BH: 4,226 significant
#   The stricter correction costs only 89 findings (~2%); specialty
#   food goes 98 -> 96. Cheap because the distribution is bimodal --
#   real clusters sit at the p-floor, far from the threshold, so
#   tightening it barely touches them.
#   ADOPT ACROSS-ALL: the deliverable is ONE map making ONE combined
#   claim, so it is one family of tests. Stronger claim, negligible cost.
#
# SCALE: 4,226 of 28,381 significant (~15%). Roughly 1 business in 7
#   sits in a statistically significant same-trade cluster. Substantial
#   enough to map, not so large as to be trivially true.
#
# TOP GROUPS BY SIGNIFICANT MEMBERS:
#   Lessors of real estate 1196 | Restaurants 676 | Personal care 251
#   Automotive repair 242 | Clothing retail 206 | Legal services 118
#   Physicians 99 | Other health practitioners 96 | Specialty food 96
#   Civic/social orgs 73 | Auto dealers 63 | Freight trucking 56
#   -> Recognisable urban economics: retail agglomeration, auto rows,
#      professional precincts, industrial land, institutional siting.
#
# THE LESSORS FINDING — TWO SPATIAL ECONOMIES, NOT A DEFECT:
#   "Lessors of real estate" tops the list at 1,196, concentrated in
#   the inner apartment ring. Per-neighbourhood lessor share:
#     WESTWOOD           100%   |  SUMMERLEA                 0%
#     CENTRAL MCDOUGALL   83%   |  STRATHCONA IND. PARK      0%
#     QUEEN MARY PARK     70%   |  SOUTH EDMONTON COMMON     0%
#     BOYLE STREET        70%   |  DOWNTOWN                 16%
#     WEST JASPER PLACE   67%   |  STRATHCONA               36%
#     WÎHKWÊNTÔWIN        60%   |
#   These landlord entities genuinely co-locate -- but the pattern is
#   inherited from RESIDENTIAL BUILT FORM (where the rental stock is),
#   NOT from agglomeration economies. No customers comparison-shop
#   between landlords.
#   RULING: NO category exclusion. The data separates itself -- the
#   lessor share per neighbourhood IS the discriminator between rental
#   signature and commercial agglomeration. Carry it as a neighbourhood
#   attribute. Excluding would discard a real signal; keeping it
#   unlabelled would mislead.
#   Only surfaced by running the FULL set -- testing specialty food
#   alone would never have exposed it.
#
# VIZ DEPENDENCY LOGGED:
#   "Lessors of real estate" is exactly the label a reader misreads as
#   commercial activity. The map must use industry_group_description
#   (or equivalent) so clusters read in plain terms. The cluster layer
#   is therefore a concrete consumer of the text-standardisation track.
# ------------------------------------------------------------


# ── 19. Consolidate — write bc_lclq_industry_group.csv ──────
# Persist the result table ONLY. obs_num / p_all / cnt (29,894 x 133
# each) are NOT saved: large and exactly reconstructible from the same
# seed in ~6 min.
# CSV over RDS deliberately -- this artifact exists to be read by other
# things, so inspectability beats compactness at this size.
# Parameters travel WITH the data: a table of p-values with no record
# of k / nsim / self-exclusion is a trap for a future reader.

out_dir <- section_path("economy/business-census", "data", "output")
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

lclq_out <- res_all |>
  mutate(
    objectid           = bc_map$objectid[row],
    neighbourhood_name = bc_map$neighbourhood_name[row],
    district           = bc_map$district[row],
    sectors            = bc_map$sectors[row],
    significant        = p_across <= 0.05,
    k                  = k,
    nsim               = nsim,
    include_self       = FALSE,
    min_group_n        = MIN_N,
    fdr_scope          = "across_all",
    survey_year        = MAP_YEAR
  ) |>
  select(objectid, survey_year, sectors, industry_group, n_in_group,
         neighbourhood_name, district,
         lclq, p_raw, p_within, p_across, significant,
         k, nsim, include_self, min_group_n, fdr_scope)

write_csv(lclq_out, file.path(out_dir, "bc_lclq_industry_group.csv"))


# ── 20. lclq_all() — the estimator as a reusable unit ───────
# Takes a PREBUILT neighbour structure (idx, w) and returns one row
# per tested business. Does NOT build neighbours internally: geometry
# is category-independent and rebuilding it per call would undo the
# whole efficiency argument.
# Self-exclusion is a property of the idx/w passed in, not an argument
# here -- build with st_knn() WITHOUT include_self() (§14 ruling).

lclq_all <- function(labels, idx, w, nsim = 999, min_n = 30, seed = 1) {

  N     <- length(labels)
  sizes <- table(labels)
  grps  <- names(sizes)[sizes >= min_n]
  G     <- length(grps)

  nbr <- matrix(labels[idx], nrow = nrow(idx))

  obs <- matrix(0, nrow = N, ncol = G, dimnames = list(NULL, grps))
  for (g in seq_len(G)) obs[, g] <- rowSums(w * (nbr == grps[g]))

  set.seed(seed)
  cnt <- matrix(0L, nrow = N, ncol = G, dimnames = list(NULL, grps))
  for (s in seq_len(nsim)) {
    lp  <- sample(labels)
    lpn <- matrix(lp[idx], nrow = nrow(idx))
    for (g in seq_len(G)) {
      cnt[, g] <- cnt[, g] + (rowSums(w * (lpn == grps[g])) >= obs[, g])
    }
  }

  p   <- (cnt + 1) / (nsim + 1)
  col <- match(labels, grps)
  ok  <- !is.na(col)
  sel <- cbind(which(ok), col[ok])
  exp_share <- as.integer(sizes[grps]) / (N - 1)

  tibble(
    row            = which(ok),
    industry_group = labels[ok],
    n_in_group     = as.integer(sizes[labels[ok]]),
    lclq           = obs[sel] / exp_share[col[ok]],
    p_raw          = p[sel]
  ) |>
    mutate(p_across = p.adjust(p_raw, method = "BH"))
}

# Validation: the function reproduces the §16/§17 in-line run exactly
# (same seed, same structure). The unnamed comparison is the operative
# one — res_all$lclq inherits names from the setNames()'d exp_share it
# is divided by (§17), while the function's exp_share is unnamed, so
# all.equal on the named vector reports a names diff even when every
# value matches.

chk <- lclq_all(labels, idx_ns, w_ns, nsim = nsim, min_n = MIN_N)

nrow(chk)
sum(chk$p_across <= 0.05)

all.equal(chk$lclq, res_all$lclq)
all.equal(chk$p_across, res_all$p_across)
all.equal(unname(chk$lclq), unname(res_all$lclq))
