# ============================================================
# 02_build_business_census_points.R   (economy/business-census section)
#
# Purpose: emit ONE points GeoJSON of the Business Census mapping vintage —
#   one feature per business, for a MapLibre point map. This is the point-map
#   sibling of 01_build_business_census.R (which builds the neighbourhood
#   CHOROPLETH). It reads the raw business-level snapshot, scopes to the latest
#   survey wave, derives a display colour key, and writes the GeoJSON. That is
#   all — no analysis, no recomputation.
#
# STANDING RULE — the Business Census production line stays LEAN.
#   The LCLQ estimator, the permutation test, and every other analysis live in
#   scripts/eda/ and NEVER run at refresh. Only GeoJSON builders enter
#   production. There is deliberately NO LCLQ, NO permutations, and NO sfdep in
#   this script: it reads the raw snapshot, filters, derives colour_key, emits.
#   (Contrast eda/04_build_mapping_frame.R, whose LCLQ block is EDA-only.)
#
# Run context: from the section dir (pipeline/yeg/economy/business-census/),
#   e.g. Rscript scripts/production/02_build_business_census_points.R
#   Bootstrap-anchored (sources _bootstrap.R). WIRED into _whirl.yaml
#   (business-census section) as a READ-ONLY build step after 01. Refresh:
#     Rscript run_section.R business-census
#
# INPUT — MANUALLY PLACED, already on disk (this script NEVER fetches):
#   data/raw/Edmonton_Business_Census_<YYYYMMDD>.csv  (newest-by-glob)
#   The RAW business-level file (Socrata 8c4b-u4a4, ~52k rows / ~26 MB). It is
#   KC-curated (not fetched), so a CURRENT snapshot must be on disk before a
#   refresh — see the MANUAL PREREQUISITE note in _whirl.yaml. 01's aggregate
#   (wh44-4bkz) now fetches to a DISTINCT stem (Edmonton_Business_Census_
#   Aggregation_<date>.csv), so newest-by-glob no longer collides with it; the
#   raw-marker guard below stays as a content backstop against a wrong file.
#
# VINTAGE — the latest survey wave, derived not hardcoded:
#   The Business Census is a full-canvass administrative register, not a panel;
#   each wave re-enumerates the city, so the latest wave IS the current state.
#   MAP_YEAR = max(survey_year), so a refresh follows the data forward with no
#   edit here (CLAUDE.md §6/§9, refresh-by-design: no year literals). Cost of
#   deriving it: a PARTIAL new wave would be silently adopted — so the wave table
#   is printed and a shrink vs the previous wave is flagged, not assumed away.
#
# GEOMETRY: one Point per business from longitude / latitude, EPSG:4326.
#
# PROPERTIES CARRIED (kept minimal — this file is large; ~30k features):
#   objectid              business row id (unique within a wave)
#   sectors               NAICS sector LABEL (raw; may be null — see colour_key)
#   industry_group        industry-group LABEL
#   industry_group_code   industry-group CODE (the stable 1:1 key at this level)
#   neighbourhood_number  polygon id (may be null for a few off-grid points)
#   neighbourhood_name    label only
#   district              planning district (may be null with the above)
#   colour_key            display bucket — see below
#
# colour_key — the ONLY derived field:
#   * Sectors are ranked by business count IN THE VINTAGE, grouped on the LABEL
#     (`sectors`), never on sectors_code — NAICS gives some sectors a code RANGE
#     (manufacturing 31/32/33, retail 44/45, transport 48/49), so the code would
#     SPLIT them. (eda guide 02, CHECK 2d.) The ranking is derived from the data;
#     no sector name is hardcoded.
#   * Top 10 sectors by count -> keep their own label as colour_key.
#   * All remaining sectors -> collapse to the single value "Other".
#   * A NULL / blank sector -> the explicit value "Unclassified", NEVER "Other".
#     A missing classification and a genuine tail sector are different things and
#     must stay distinguishable (the count is reported).
#
# OUTPUT (this section's output/ ONLY — the runner is the sole publisher to
#   website/public, CLAUDE.md §2; this script writes NOTHING to public):
#   output/business_census_points_<YYYY>.geojson   (<YYYY> = derived vintage)
#
# ------------------------------------------------------------
# RENDERING INTENT (for the frontend point mount — travels with the artifact):
#   * UNIFORM circles at every zoom — constant radius, constant shape. No
#     proportional sizing, no clustering, no heatmap, no zoom-varying symbology.
#   * Colour driven by colour_key: 10 named sectors + "Other" (+ "Unclassified"
#     only if any null-sector businesses exist in a future wave).
#   * ALL businesses in the vintage render; nothing is filtered out for display
#     (a business with no coordinates cannot be a point and is reported, not
#     silently dropped — today that count is 0).
#
# ------------------------------------------------------------
# FLAGS RAISED (not resolved here — for KC review):
#   [1] 10 colours EXCEEDS the ~7 reliably-distinguishable ceiling for
#       categorical maps. KC asked for 10 deliberately, to evaluate; built as
#       specified. Some pairs may be hard to separate; the count may be revised
#       after review. Do NOT silently reduce it.
#   [2] NAME COLLISION: the collapse bucket "Other" sits alongside a top-10
#       NAMED sector literally called "Other services (except public
#       administration)". On a legend these read as two near-identical rows. The
#       directive specified "Other" verbatim, so it is kept — but the collision
#       is real and is re-warned at runtime. A disambiguated collapse label
#       (e.g. "Other sectors") would resolve it; KC's call.
#   [3] Null-sector businesses are bucketed as "Unclassified" (see above). Today
#       the count is 0; the branch is defensive for future waves.
#
# Author: KC (kaustubhchati@ualberta.ca)
# ============================================================

library(tidyverse)
library(sf)

# Repo-root anchoring + path helpers (ROOT, section_path(), …). No fetch helper
# is sourced: this script does not fetch (the raw snapshot is already on disk).
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

dir.create("output", recursive = TRUE, showWarnings = FALSE)


# ── 0. The keep-list ────────────────────────────────────────
# Source column (Title Case, as the export endpoint delivers) -> the snake_case
# name it takes in the frame. This is the one place the carried shape is
# declared. survey_year is kept only to scope the vintage (dropped before write);
# longitude/latitude are consumed into geometry. Everything not named is dropped.
# Mirrors eda/04_build_mapping_frame.R's keep-list, pared to what a POINT needs
# (no export/hybrid_work survey attributes, no sectors_code — not carried).
KEEP <- tribble(
  ~source,                 ~name,
  "objectid",              "objectid",
  "Survey Year",           "survey_year",           # vintage scope only (not carried)
  "Sectors",               "sectors",               # colour_key is derived from THIS (label)
  "Industry Group",        "industry_group",
  "Industry Group Code",   "industry_group_code",   # stable 1:1 key at this level
  "Planning District",     "district",
  "Neighbourhood Number",  "neighbourhood_number",
  "Neighbourhood Name",    "neighbourhood_name",
  "Longitude",             "longitude",             # -> geometry
  "Latitude",              "latitude"               # -> geometry
)

# Columns that only the RAW business-level file has — used to reject a
# pre-aggregated wh44-4bkz snapshot grabbed by the shared filename stem.
RAW_MARKER_COLS <- c("objectid", "Business Name", "NAICS Code", "Sectors",
                     "Latitude", "Longitude")

TOP_N              <- 10L            # sectors that keep their own colour_key
OTHER_LABEL        <- "Other"        # tail-sector collapse bucket (FLAG [2])
UNCLASSIFIED_LABEL <- "Unclassified" # explicit null/blank-sector bucket (FLAG [3])


# ── 1. Load the newest raw snapshot (guarded) ───────────────
raw_dir <- file.path("data", "raw")
csv_files <- list.files(raw_dir,
                        pattern    = "^Edmonton_Business_Census_\\d{8}\\.csv$",
                        full.names = TRUE)
if (length(csv_files) == 0) {
  stop("No Edmonton_Business_Census_<YYYYMMDD>.csv in ", raw_dir,
       ". Fetch a snapshot first (via 01_build_business_census.R or the runner).")
}
csv_path <- sort(csv_files, decreasing = TRUE)[1]

cat("=============================================================\n")
cat("Business Census — points GeoJSON builder\n")
cat("Snapshot:", basename(csv_path), "\n")
cat("=============================================================\n\n")

bc_raw <- read_csv(csv_path, show_col_types = FALSE)

# Raw-marker guard: is this the RAW business-level file, not the aggregation?
missing_markers <- setdiff(RAW_MARKER_COLS, names(bc_raw))
if (length(missing_markers) > 0) {
  stop("This is not the RAW business-level file (8c4b-u4a4).\n",
       "  Grabbed:  ", basename(csv_path), "\n",
       "  Missing raw-only column(s): ", paste(missing_markers, collapse = ", "), "\n",
       "  Place a current 8c4b-u4a4 export as Edmonton_Business_Census_<YYYYMMDD>.csv ",
       "(01's aggregate now uses a distinct _Aggregation_ stem, so it won't collide).")
}

# Schema guard: every source column the keep-list promises must exist. A City
# rename would otherwise produce a silently narrower frame that still looks valid.
missing_keep <- setdiff(KEEP$source, names(bc_raw))
if (length(missing_keep) > 0) {
  stop("Source schema changed — column(s) the builder needs are absent: ",
       paste(missing_keep, collapse = ", "),
       ". Reconcile the KEEP table against the snapshot before proceeding.")
}
cat(sprintf("Loaded %s rows x %s columns. Guards: OK.\n\n",
            format(nrow(bc_raw), big.mark = ","), ncol(bc_raw)))


# ── 2. Scope to the mapping vintage (latest wave) ───────────
# Printed before filtering so the choice is visible; a shrink vs the previous
# wave is flagged (a partial new wave would otherwise be adopted silently).
cat("--- Survey waves present ---\n")
waves <- bc_raw |> count(`Survey Year`, name = "rows") |> arrange(`Survey Year`)
print(waves)

MAP_YEAR <- as.integer(max(bc_raw$`Survey Year`, na.rm = TRUE))
this_rows <- waves$rows[waves$`Survey Year` == MAP_YEAR]
prev_years <- sort(waves$`Survey Year`[waves$`Survey Year` < MAP_YEAR], decreasing = TRUE)
if (length(prev_years) >= 1) {
  prev_rows <- waves$rows[waves$`Survey Year` == prev_years[1]]
  cat(sprintf("\nVintage %s: %s rows.  Previous wave %s: %s rows (%+.0f%%).%s\n",
              MAP_YEAR, format(this_rows, big.mark = ","),
              prev_years[1], format(prev_rows, big.mark = ","),
              100 * (this_rows - prev_rows) / prev_rows,
              if (this_rows < prev_rows)
                "  <-- SMALLER than the previous wave; confirm it is complete before relying on it."
              else ""))
}

bc_map <- bc_raw |>
  filter(`Survey Year` == MAP_YEAR) |>
  select(all_of(KEEP$source)) |>
  rename_with(~ KEEP$name[match(.x, KEEP$source)]) |>
  mutate(
    # Integer-valued identifiers -> integer, so the GeoJSON writes clean values
    # (99145, not 99145.0). Codes here are 4-digit with no leading zeros.
    objectid             = as.integer(objectid),
    neighbourhood_number = as.integer(neighbourhood_number),
    industry_group_code  = as.integer(industry_group_code)
  )
cat(sprintf("\nScoped to %s: %s businesses.\n\n",
            MAP_YEAR, format(nrow(bc_map), big.mark = ",")))


# ── 3. Coordinates — a point needs both ─────────────────────
# All businesses render, but a business with no coordinates cannot BE a point.
# Drop-and-report (never silent). Today this is 0; kept for future waves.
n_before   <- nrow(bc_map)
bc_map     <- bc_map |> filter(!is.na(longitude), !is.na(latitude))
n_no_coord <- n_before - nrow(bc_map)
cat(sprintf("Coordinates: %s businesses have a point; %s dropped (no lat/long).\n\n",
            format(nrow(bc_map), big.mark = ","), format(n_no_coord, big.mark = ",")))


# ── 4. Derive colour_key ────────────────────────────────────
# Rank sectors by business count in the vintage, grouped on the LABEL (never the
# code — see header). Top 10 keep their label; the rest collapse to "Other"; a
# null/blank sector becomes "Unclassified" (kept distinct from "Other").
sector_rank <- bc_map |>
  filter(!is.na(sectors), str_trim(sectors) != "") |>
  count(sectors, name = "n", sort = TRUE)

top_sectors <- head(sector_rank$sectors, TOP_N)

# Honest-surface guard: a genuine count tie straddling the top-10 boundary would
# hand the last NAMED slot to one sector over another by dplyr's tie order
# (alphabetical) — no business meaning. Surface it rather than let an arbitrary
# pick pass silently. (No tie in the current vintage: rank 10 and 11 differ.)
if (nrow(sector_rank) > TOP_N &&
    sector_rank$n[TOP_N] == sector_rank$n[TOP_N + 1]) {
  cat(sprintf(paste0("\n!! Boundary tie: ranks %d and %d both have %s businesses",
                     " — the last named slot is chosen by alphabetical tie-order,",
                     " not by count. Confirm the split before relying on it.\n"),
              TOP_N, TOP_N + 1, format(sector_rank$n[TOP_N], big.mark = ",")))
}

bc_map <- bc_map |>
  mutate(
    .blank_sector = is.na(sectors) | str_trim(sectors) == "",
    colour_key = case_when(
      .blank_sector            ~ UNCLASSIFIED_LABEL,
      sectors %in% top_sectors ~ sectors,
      TRUE                     ~ OTHER_LABEL
    )
  )

n_unclassified <- sum(bc_map$.blank_sector)
n_top   <- sum(bc_map$colour_key %in% top_sectors)
n_other <- sum(bc_map$colour_key == OTHER_LABEL)
bc_map  <- bc_map |> select(-.blank_sector)

# Report the ranking + colour_key assignment so the collapse is auditable.
cat("--- Sector ranking by business count (vintage); colour_key assignment ---\n")
report <- sector_rank |>
  mutate(
    rank       = row_number(),
    # pct = share of ALL mapped businesses (matches the summary lines below); with
    # null-sector rows present in a future wave the classified shares sum to <100.
    pct        = round(100 * n / nrow(bc_map), 2),
    # Same top_sectors / OTHER_LABEL as the case_when above, so this printed mirror
    # stays in lockstep with the assigned data by construction. sector_rank is
    # blank-filtered, so no Unclassified branch is needed here.
    colour_key = if_else(sectors %in% top_sectors, sectors, OTHER_LABEL)
  ) |>
  select(rank, sectors, n, pct, colour_key)
print(report, n = Inf, width = Inf)

cat(sprintf("\nTop %d (named):   %s businesses (%.1f%%)\n",
            TOP_N, format(n_top, big.mark = ","), 100 * n_top / nrow(bc_map)))
cat(sprintf("Collapsed to \"%s\": %s businesses (%.1f%%), from %d tail sectors\n",
            OTHER_LABEL, format(n_other, big.mark = ","),
            100 * n_other / nrow(bc_map), max(nrow(sector_rank) - TOP_N, 0)))
cat(sprintf("\"%s\" (null/blank sector): %s businesses\n",
            UNCLASSIFIED_LABEL, format(n_unclassified, big.mark = ",")))

# FLAG [2] re-warned at runtime: does a NAMED colour_key start with "Other"?
if (any(startsWith(top_sectors, "Other"))) {
  cat("\n!! FLAG [2]: a top-10 NAMED sector begins with \"Other\" (\"",
      top_sectors[startsWith(top_sectors, "Other")][1],
      "\"),\n   which reads near-identically to the \"", OTHER_LABEL,
      "\" collapse bucket on a legend.\n   Kept as specified; consider a ",
      "disambiguated collapse label. See header FLAG [2].\n", sep = "")
}


# ── 5. Build the point GeoJSON ──────────────────────────────
# Carry only the 8 declared properties (+ the two coord columns, consumed into
# geometry). Column order matches the directive. COORDINATE_PRECISION=6 (~0.1 m,
# below any web-zoom resolution) keeps the file lean, same as the BP point files.
points <- bc_map |>
  transmute(
    objectid, sectors, industry_group, industry_group_code,
    neighbourhood_number, neighbourhood_name, district, colour_key,
    longitude, latitude
  )

points_sf <- st_as_sf(points, coords = c("longitude", "latitude"), crs = 4326)

out_path <- file.path("output", sprintf("business_census_points_%d.geojson", MAP_YEAR))
if (file.exists(out_path)) file.remove(out_path)
st_write(points_sf, out_path, driver = "GeoJSON",
         layer_options = "COORDINATE_PRECISION=6", quiet = TRUE)

file_mb <- round(file.info(out_path)$size / 1024 / 1024, 2)
cat(sprintf("\nWrote %s\n  %s features, %.2f MB\n",
            out_path, format(nrow(points_sf), big.mark = ","), file_mb))
if (file_mb >= 25) {
  cat("  !! ", file_mb, " MB is at/over Cloudflare Pages' 25 MiB per-file cap ",
      "— this file cannot ship as a Pages asset as-is.\n", sep = "")
} else if (file_mb >= 12) {
  cat("  !  ", file_mb, " MB is large for a single inline GeoJSON — under the ",
      "25 MiB cap, but watch first-paint. Flag for KC.\n", sep = "")
}


# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working
# (this script is not wired into the runner yet).
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["vintage"]]        <- MAP_YEAR
RUN_METRICS[["businesses"]]     <- nrow(bc_map)
RUN_METRICS[["features"]]       <- nrow(points_sf)
RUN_METRICS[["no_coord"]]       <- n_no_coord
RUN_METRICS[["named_sectors"]]  <- length(top_sectors)
RUN_METRICS[["other_count"]]    <- n_other
RUN_METRICS[["unclassified"]]   <- n_unclassified
RUN_METRICS[["geojson_mb"]]     <- file_mb


# ── 6. Run summary ──────────────────────────────────────────
cat("\n--- Run summary ---\n")
cat(sprintf("Snapshot:     %s\n", basename(csv_path)))
cat(sprintf("Vintage:      %s\n", MAP_YEAR))
cat(sprintf("Businesses:   %s (%s no-coord, dropped)\n",
            format(nrow(bc_map), big.mark = ","), format(n_no_coord, big.mark = ",")))
cat(sprintf("colour_key:   %d named + \"%s\"%s\n",
            length(top_sectors), OTHER_LABEL,
            if (n_unclassified > 0) sprintf(" + \"%s\"", UNCLASSIFIED_LABEL) else ""))
cat(sprintf("Output:       %s (%.2f MB)\n", out_path, file_mb))
cat("Done.\n")
