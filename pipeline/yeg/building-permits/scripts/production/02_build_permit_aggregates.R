# ============================================================
# 02_build_permit_aggregates.R
# Purpose: per-neighbourhood RESIDENTIAL dwelling-unit permit aggregates, all
#   years (2009–2026), as one CSV + one GeoJSON choropleth frame per year.
#
# Scope: residential permits only, selected by an explicit BUILDING_TYPE string
#   whitelist (residential_types, defined in the aggregation section; matched on
#   the FULL string — the 522 code collides between "Mixed Use (522)" and
#   "Office Complex (522)"). This is NOT 02a's job-category grouping — different
#   column, different purpose; do not reuse it. Dwelling units are reported as
#   two GROSS series, never a single net:
#     units_added_gross = sum of positive UNITS_ADDED
#     units_demolished  = abs(sum of negative UNITS_ADDED on "(99) Demolition"
#                         permits) — work-type-qualified; non-demolition negative
#                         rows are excluded by design. Settled in the residential
#                         dwelling-units scope EDA (scripts/eda/).
#   yoy_pct_permits   = YoY % change in residential permit count per neighbourhood
#                         (§4, from the complete all-years count grid; NA/-100 on
#                         edges, never Inf/NaN). Backend-only because each GeoJSON
#                         is a single year.
#
# Inputs:
#   - data/raw/General_Building_Permits_<date>.csv — newest snapshot,
#     discovered automatically. Operator places the bulk General Building
#     Permits CSV in data/raw/ before running (manual download; no re-fetch).
#   - shared boundary CSV (65fr-66s6), resolved via shared_path() — see below.
#
# Outputs:
#   - output/permit_aggregates/permit_aggregates_<year>.csv  (one per year)
#   - output/permit_geojson/permit_neighbourhoods_<year>.geojson (one per year)
#   - output/permit_coverage_summary.csv  (audit log)
#   - output/dwelling_units_dropped_spanners_<snapshotdate>.csv  (audit: every
#     residential unit dropped as unplaceable — multi-neighbourhood spanners,
#     nameless rows, and oracle "drop" numbers; the rescue audit trail)
#
# Neighbourhood rescue (§3b, before aggregation): the shared rescue oracle
#   (shared_path("data","neighbourhood_rescue_oracle.csv"), READ-only) remaps
#   stranded numbers (rename/renumber/merge), drops oracle "drop" numbers, and
#   recovers NA-number rows whose comma-joined NEIGHBOURHOOD name collapses to a
#   single neighbourhood (oracle old/new name pairs unified). Genuine spanners
#   and nameless rows are dropped + logged — no assign-to-first, no duplication.
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/production/02_build_permit_aggregates.R
#
# Join key: NEIGHBOURHOOD_NUMBER (integer) in permits
#           ↔ Neighbourhood Number in boundary CSV (65fr-66s6)
# Boundary: newest City_of_Edmonton_-_Neighbourhoods_*.csv via shared_path() glob
#           (pipeline/yeg/shared/data/…; sourced via _bootstrap.R)
#
# Suppression gate: n_permits < 10 → suppressed_low_n
# (lower than assessment's N<100 — permits are sparser)
# ============================================================

library(tidyverse)
library(sf)
library(scales)

# Repo-root anchoring + path helpers (ROOT, shared_path(), …). Lets this script
# address the shared boundary by RELATIONSHIP, not a fragile ../../ hop.
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("fetch_helpers.R"))
source(shared_path("boundary_helpers.R"))

dir.create("output/permit_aggregates", showWarnings = FALSE, recursive = TRUE)
dir.create("output/permit_geojson",    showWarnings = FALSE, recursive = TRUE)

# ============================================================
# 1. Load raw permits (reuse existing snapshot — no re-download)
# ============================================================

raw_candidates <- list.files(
  "data/raw", pattern = "^General_Building_Permits_.*\\.csv$",
  full.names = TRUE
)
if (length(raw_candidates) == 0) stop("No raw permits CSV in data/raw/")
raw_path <- sort(raw_candidates, decreasing = TRUE)[1]
cat("Using snapshot:", raw_path, "\n")

# Freshness assertion (the chain's correctness depends on this). Under the
# runner, 01 fetches TODAY's snapshot before 02 runs, so the newest file here
# must be today's. If 01's fetch silently failed — or 02 is run standalone
# against a stale data/raw — this stops loud rather than aggregating yesterday's
# permits into today's published choropleth.
snapshot_date <- regmatches(basename(raw_path),
                            regexpr("[0-9]{8}", basename(raw_path)))
if (length(snapshot_date) == 0 || snapshot_date != format(Sys.Date(), "%Y%m%d")) {
  stop("newest snapshot is '", basename(raw_path), "' (date ",
       if (length(snapshot_date)) snapshot_date else "none", "), not today's (",
       format(Sys.Date(), "%Y%m%d"), ") — did 01 fetch this run? ",
       "Refusing to aggregate a stale snapshot.")
}

permits_raw <- read_csv(raw_path, show_col_types = FALSE)
cat("Raw rows:", format(nrow(permits_raw), big.mark = ","), "\n")
cat("Columns:", paste(names(permits_raw), collapse = ", "), "\n\n")

# ============================================================
# 2. Clean and type-cast
# ============================================================

permits <- permits_raw |>
  rename_with(tolower) |>
  rename_with(~ str_replace_all(., " ", "_")) |>
  mutate(
    year                  = as.integer(year),
    month_number          = as.integer(month_number),
    neighbourhood_number  = as.integer(neighbourhood_number),
    # Strip the "$" and thousands commas before parsing — CONSTRUCTION_VALUE
    # arrives as e.g. "$58,131", so a bare as.numeric() would NA every row.
    # Mirrors the parse in 01_build_permits.R.
    construction_value    = suppressWarnings(
                              as.numeric(str_remove_all(construction_value, "[$,]"))),
    units_added           = suppressWarnings(as.integer(units_added))
  ) |>
  # Keep NA-number rows here — §3b recovers those whose NEIGHBOURHOOD name
  # resolves to a single neighbourhood. Only the year floor is non-negotiable.
  filter(!is.na(year))

cat("Clean rows (has year):",
    format(nrow(permits), big.mark = ","), "\n")
cat("Years present:", paste(sort(unique(permits$year)), collapse = ", "), "\n\n")

# ============================================================
# 3. Load boundary file
# ============================================================
# Boundary via the shared guarded loader: fetch-routed through fetch_socrata_snapshot
# (finding 5, closes the one-input-bypasses-the-helper gap) + the "follow the City"
# integrity contract (dup ids, geometry, +/-10% row tolerance vs the accepted
# snapshot, Effective End Date tripwire, staleness). Returns the raw frame; the
# st_as_sf/select below and boundary_numbers/bname_tbl are unchanged.
boundary_raw <- load_boundary()

boundary_sf <- boundary_raw |>
  filter(!is.na(`Geometry Multipolygon`)) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  mutate(
    `Neighbourhood ID` = as.integer(`Neighbourhood Number`),
    display_name       = `Neighbourhood Name`,
    district           = `Planning District`
  ) |>
  select(`Neighbourhood ID`, display_name, district)

cat("Boundary polygons:", nrow(boundary_sf), "\n\n")

# Residential scope: read the curated BUILDING_TYPE classification table (01b) —
# the fail-closed analogue of 01a's JOB_CATEGORY grouping. Newest by glob; no year
# literal. Disposition is on the FULL string, never the bare code (522 collides:
# "Mixed Use (522)" residential vs "Office Complex (522)" not). The stop below halts
# on any permit BUILDING_TYPE absent from the table, so portal drift (a new/renamed
# type) demands a ruling in 01b instead of silently leaving the residential universe.
bt_class_candidates <- list.files(
  "data/reference",
  pattern    = "^building_type_classification_[0-9]{8}\\.csv$",
  full.names = TRUE
)
if (length(bt_class_candidates) == 0) {
  stop("No building_type_classification_<YYYYMMDD>.csv in data/reference/ — run ",
       "scripts/production/01b_build_building_type_classification.R first.")
}
bt_class <- read_csv(sort(bt_class_candidates, decreasing = TRUE)[1], show_col_types = FALSE)
residential_types <- bt_class |> filter(disposition == "residential") |> pull(building_type)

# --- BUILDING_TYPE drift stop (fail-closed; mirror 01's JOB_CATEGORY guard) -----
# Any string in the data that is neither residential nor non_residential in the
# table is UNCLASSIFIED portal drift. Halt with row + unit counts so a human rules
# it in 01b. NA building_type is left excluded (exactly as the old whitelist did) —
# not a stop. Armed but not sprung: every current string is classified today.
unclassified <- setdiff(unique(permits$building_type), bt_class$building_type)
unclassified <- unclassified[!is.na(unclassified)]
if (length(unclassified) > 0) {
  drift <- permits |>
    filter(building_type %in% unclassified) |>
    group_by(building_type) |>
    summarise(rows        = n(),
              units_added = sum(units_added[units_added > 0], na.rm = TRUE),
              .groups = "drop") |>
    arrange(desc(rows))
  print(as.data.frame(drift))
  stop(length(unclassified), " unclassified BUILDING_TYPE string(s) — neither ",
       "residential nor non_residential in the classification table. Classify each ",
       "in 01b (residential or non_residential), re-run 01b, then re-run. Strings: ",
       paste(unclassified, collapse = " | "))
}

# ============================================================
# 3b. Neighbourhood rescue (oracle number-remap + NA-name recovery)
# ============================================================
# Recover units the polygon join would otherwise silently lose, BEFORE
# aggregation, so published totals reflect the full residential universe minus
# only genuinely unplaceable permits (every one logged). The shared rescue
# oracle is READ-only and is the authority for BOTH number-remap and old/new
# NAME-pair collapsing. No assign-to-first, no duplication — that is the ruling.

norm <- function(x) toupper(trimws(x))

# --- Oracle lookups (edmonton only) ---
oracle <- read_csv(shared_path("data", "neighbourhood_rescue_oracle.csv"),
                   show_col_types = FALSE) |>
  filter(city == "edmonton")

# Number remap: rename/renumber/merge old_number -> new_number (real targets).
remap_rows <- oracle |>
  filter(resolution %in% c("rename", "renumber", "merge"), !is.na(new_number)) |>
  mutate(old_number = as.integer(old_number), new_number = as.integer(new_number))
remap_vec <- setNames(remap_rows$new_number, as.character(remap_rows$old_number))

# Drop numbers: oracle says no live polygon (e.g. 4485 Lewis Farms).
drop_numbers <- oracle |> filter(resolution == "drop") |>
  pull(old_number) |> as.integer()

# name_canon: normalized oracle name (old OR new) -> canonical new_number, so a
# comma-joined old/new pair (OLIVER, WÎHKWÊNTÔWIN) collapses to one identity.
name_canon <- c(
  setNames(remap_rows$new_number, norm(remap_rows$old_name)),
  setNames(remap_rows$new_number, norm(remap_rows$new_name))
)
name_canon <- name_canon[!is.na(names(name_canon)) & names(name_canon) != ""]

# Boundary name<->number (current names/numbers) + the set of valid numbers.
bname_tbl <- boundary_raw |>
  transmute(nm = norm(`Neighbourhood Name`), num = as.integer(`Neighbourhood Number`)) |>
  filter(!is.na(nm), !is.na(num)) |>
  distinct(nm, .keep_all = TRUE)
bname_vec        <- setNames(bname_tbl$num, bname_tbl$nm)
boundary_numbers <- sort(unique(as.integer(boundary_raw$`Neighbourhood Number`)))

# Locked gross-metric helpers, applied to an arbitrary row subset.
u_added <- function(d) sum(d$units_added[d$units_added > 0], na.rm = TRUE)
u_demo  <- function(d) abs(sum(d$units_added[d$units_added < 0 &
                          d$work_type == "(99) Demolition"], na.rm = TRUE))

# Residential universe (all neighbourhood-number states; year already filtered).
res <- permits |> filter(building_type %in% residential_types)

# --- STEP 2: stranded-number remap (rows that HAVE a number) ---
res <- res |>
  mutate(
    orig_number  = neighbourhood_number,
    remapped_to  = unname(remap_vec[as.character(neighbourhood_number)]),
    num_remapped = !is.na(orig_number) & !is.na(remapped_to),
    neighbourhood_number = if_else(num_remapped, remapped_to, orig_number)
  )

with_num    <- res |> filter(!is.na(orig_number))
num_dropped <- with_num |> filter(neighbourhood_number %in% drop_numbers)
with_num    <- with_num |> filter(!(neighbourhood_number %in% drop_numbers))

# --- STEP 3: NA-number name recovery (rows with NA number) ---
# Resolve one NEIGHBOURHOOD string to a single neighbourhood_number or a
# drop-reason. Canonical key per comma-part = oracle new_number (if the part is
# an oracle name) else the normalized name; distinct keys decide the outcome.
resolve_na_name <- function(nm) {
  if (is.na(nm) || trimws(nm) == "") return(c(num = NA, reason = "nameless"))
  parts <- norm(str_split(nm, ",")[[1]])
  parts <- parts[parts != ""]
  keys  <- unique(vapply(parts, function(p)
    if (p %in% names(name_canon)) as.character(name_canon[[p]]) else p,
    character(1)))
  if (length(keys) != 1) return(c(num = NA, reason = "spanner"))
  k <- keys[1]
  if (grepl("^[0-9]+$", k)) {
    num <- as.integer(k)
  } else if (k %in% names(bname_vec)) {
    num <- as.integer(bname_vec[[k]])
  } else {
    return(c(num = NA, reason = "single_no_boundary_match"))
  }
  if (!(num %in% boundary_numbers))
    return(c(num = NA, reason = "single_target_not_in_boundary"))
  c(num = num, reason = "recovered")
}

na_rows <- res |> filter(is.na(orig_number))
if (nrow(na_rows) > 0) {
  resolved <- lapply(na_rows$neighbourhood, resolve_na_name)
  na_rows$assigned_number <- suppressWarnings(as.integer(vapply(resolved, `[[`, character(1), "num")))
  na_rows$drop_reason     <- vapply(resolved, `[[`, character(1), "reason")
} else {
  na_rows$assigned_number <- integer(0)
  na_rows$drop_reason     <- character(0)
}

na_recovered <- na_rows |> filter(drop_reason == "recovered") |>
  mutate(neighbourhood_number = assigned_number)
na_dropped   <- na_rows |> filter(drop_reason != "recovered")

# --- Final residential set for aggregation (every row now has a valid number) ---
permits_res <- bind_rows(
  with_num     |> select(-orig_number, -remapped_to),
  na_recovered |> select(-orig_number, -remapped_to, -assigned_number, -drop_reason)
)

# --- Dropped-rows audit log (every dropped unit, row-level) ---
dropped_log <- bind_rows(
  num_dropped |> transmute(reason = "oracle_drop", year, orig_number,
                           neighbourhood, building_type, work_type, units_added),
  na_dropped  |> transmute(reason = drop_reason, year, orig_number,
                           neighbourhood, building_type, work_type, units_added)
)
dropped_path <- sprintf("output/dwelling_units_dropped_spanners_%s.csv", snapshot_date)
write_csv(dropped_log, dropped_path)

# --- Rescue report (numbers, not narrative) ---
cat("=============================================================\n")
cat("Neighbourhood rescue:\n")
cat(sprintf("  residential universe:    added=%d demo=%d (rows %s)\n",
            u_added(res), u_demo(res), format(nrow(res), big.mark = ",")))
cat(sprintf("  recovered_from_stranded: added=%d demo=%d\n",
            u_added(filter(permits_res, num_remapped)),
            u_demo(filter(permits_res, num_remapped))))
cat(sprintf("  recovered_from_NA:       added=%d demo=%d (rows %d)\n",
            u_added(na_recovered), u_demo(na_recovered), nrow(na_recovered)))
cat(sprintf("  dropped TOTAL:           added=%d demo=%d (rows %d) -> %s\n",
            u_added(dropped_log), u_demo(dropped_log), nrow(dropped_log), dropped_path))
dropped_log |>
  group_by(reason) |>
  summarise(rows  = n(),
            added = sum(units_added[units_added > 0], na.rm = TRUE),
            demo  = abs(sum(units_added[units_added < 0 &
                        work_type == "(99) Demolition"], na.rm = TRUE)),
            .groups = "drop") |>
  arrange(desc(added)) |> print()
cat("=============================================================\n\n")

# --- STEP 4: stranded-ID stop (fail-closed; mirror the JOB_CATEGORY guard) -----
# Every row in permits_res now carries a neighbourhood_number, but the rescue only
# GUARANTEES a boundary polygon for oracle-known remaps/recoveries. A number that
# is valid-looking yet in NEITHER the boundary NOR the oracle (the next City
# renumber before a reconciliation update) would enter the aggregates CSV and then
# vanish in the boundary left_join below with no audit trace. Halt instead, with
# the evidence a human needs to rule it (a crosswalk renumber/drop — the path 4485
# took). boundary_numbers is the current boundary universe; the oracle's remap
# targets ARE boundary numbers and its drops are already removed, so a non-empty
# setdiff is a genuinely unreconciled id. Armed but not sprung: 0 stranded today.
# TIER 2 SEAM: once BP consumes the canonical crosswalk, widen this universe to
# boundary UNION crosswalk-known so a *ruled* id does not trip the stop.
stranded <- setdiff(unique(permits_res$neighbourhood_number), boundary_numbers)
if (length(stranded) > 0) {
  strand_dump <- permits_res |>
    filter(neighbourhood_number %in% stranded) |>
    group_by(neighbourhood_number) |>
    summarise(rows             = n(),
              units_added      = sum(units_added[units_added > 0], na.rm = TRUE),
              units_demolished = abs(sum(units_added[units_added < 0 &
                                     work_type == "(99) Demolition"], na.rm = TRUE)),
              .groups = "drop") |>
    arrange(desc(rows))
  print(as.data.frame(strand_dump))
  stop(length(stranded), " stranded neighbourhood number(s) in neither the boundary ",
       "nor the oracle — they would vanish from the map silently. IDs: ",
       paste(stranded, collapse = ", "),
       ". Add a renumber/drop ruling to the reconciliation table and re-run.")
}

# ============================================================
# 4. Aggregate per year
# ============================================================

years <- sort(unique(permits_res$year))
build_log <- tibble()

# ------------------------------------------------------------
# Cross-year YoY % change in RESIDENTIAL permit count, per neighbourhood.
# Each per-year GeoJSON is independent and the browser has no prior year, so YoY
# must be a backend column. Computed from the COMPLETE all-years count grid up
# front — NOT back-read from the per-year GeoJSONs (mirrors the PA rule: a
# cross-year quantity is derived from a complete in-memory frame, never from
# already-written outputs).
#
# count() yields only present (n>=1) neighbourhood-years; the grid is completed
# with 0 for absent cells, which is what makes the edge cases well-defined.
# Edge rules (never Inf/NaN):
#   prev is NA  (first year in range / no prior-year row)     -> NA
#   prev == 0   (no prior-year residential permits)            -> NA  (jump from 0)
#   current == 0 with prev > 0  (a real drop to zero)          -> -100
#   else  100 * (n - prev) / prev,  rounded to 1 dp
# Keyed by Neighbourhood ID + year; joined into each year's boundary frame below
# (purely additive — n_permits, polygon_state and every other field unchanged).
yoy_tbl <- permits_res |>
  count(neighbourhood_number, year, name = "n_permits") |>
  complete(neighbourhood_number, year = years, fill = list(n_permits = 0)) |>
  group_by(neighbourhood_number) |>
  arrange(year, .by_group = TRUE) |>
  mutate(
    prev = lag(n_permits),
    yoy_pct_permits = case_when(
      is.na(prev)    ~ NA_real_,
      prev == 0      ~ NA_real_,
      n_permits == 0 ~ -100,
      TRUE           ~ round(100 * (n_permits - prev) / prev, 1)
    )
  ) |>
  ungroup() |>
  transmute(`Neighbourhood ID` = neighbourhood_number, year, yoy_pct_permits)

for (yr in years) {
  cat(sprintf("--- Year %d ---\n", yr))

  # permits_res is already residential + rescued (valid neighbourhood_number).
  yr_permits <- permits_res |> filter(year == yr)
  cat(sprintf("  Residential permits: %s\n", format(nrow(yr_permits), big.mark = ",")))

  # Aggregate per neighbourhood
  agg <- yr_permits |>
    group_by(neighbourhood_number) |>
    summarise(
      n_permits                  = n(),
      total_construction_value   = sum(construction_value, na.rm = TRUE),
      median_construction_value  = median(construction_value, na.rm = TRUE),
      units_added_gross          = sum(units_added[units_added > 0], na.rm = TRUE),
      units_demolished           = abs(sum(units_added[units_added < 0 &
                                     work_type == "(99) Demolition"], na.rm = TRUE)),
      .groups = "drop"
    ) |>
    rename(`Neighbourhood ID` = neighbourhood_number)

  # Suppression gate: n_permits < 10
  agg <- agg |>
    mutate(suppressed = n_permits < 10)

  cat(sprintf("  Neighbourhoods with permits: %d\n", nrow(agg)))
  cat(sprintf("  Suppressed (n<10): %d\n", sum(agg$suppressed)))

  # Write CSV
  csv_path <- sprintf("output/permit_aggregates/permit_aggregates_%d.csv", yr)
  write_csv(agg, csv_path)

  # Spatial join
  joined <- boundary_sf |>
    left_join(agg, by = "Neighbourhood ID") |>
    mutate(
      polygon_state = case_when(
        is.na(n_permits)          ~ "no_data",
        suppressed                ~ "suppressed_low_n",
        TRUE                      ~ "aggregated"
      )
    ) |>
    # Attach this year's YoY % (additive; n_permits / polygon_state untouched).
    # A neighbourhood that dropped to zero this year is no_data here but still
    # carries yoy_pct_permits = -100 for the frontend's %YoY view.
    left_join(yoy_tbl |> filter(year == yr) |> select(-year),
              by = "Neighbourhood ID")

  # Transmute to display columns only
  geojson_ready <- joined |>
    transmute(
      `Neighbourhood ID`         = `Neighbourhood ID`,
      display_name               = display_name,
      district                   = district,
      polygon_state              = polygon_state,
      n_permits                  = n_permits,
      total_construction_value   = total_construction_value,
      median_construction_value  = median_construction_value,
      units_added_gross          = units_added_gross,
      units_demolished           = units_demolished,
      yoy_pct_permits            = yoy_pct_permits
    ) |>
    st_set_precision(1e6) |>
    st_make_valid()

  geojson_path <- sprintf(
    "output/permit_geojson/permit_neighbourhoods_%d.geojson", yr)
  if (file.exists(geojson_path)) file.remove(geojson_path)
  st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)

  file_mb <- round(file.info(geojson_path)$size / 1024^2, 2)
  cat(sprintf("  Wrote: %s (%.2f MB)\n\n", geojson_path, file_mb))

  build_log <- bind_rows(build_log, tibble(
    year               = yr,
    n_permits          = nrow(yr_permits),
    n_neighbourhoods   = nrow(agg),
    n_suppressed       = sum(agg$suppressed),
    n_aggregated       = sum(!agg$suppressed),
    n_no_data          = sum(joined$polygon_state == "no_data"),
    geojson_path       = basename(geojson_path),
    file_size_mb       = file_mb
  ))
}

# ============================================================
# 5. Write build log
# ============================================================

write_csv(build_log, "output/permit_coverage_summary.csv")

# --- Run metrics (Tier 0: durable per-run counts the runner persists to JSONL) ---
# RUN_METRICS is the runner-provided sink; the guard keeps standalone runs working.
if (!exists("RUN_METRICS")) RUN_METRICS <- list()
RUN_METRICS[["boundary_polygons"]]      <- nrow(boundary_sf)
RUN_METRICS[["residential_rows"]]       <- nrow(res)
RUN_METRICS[["residential_added"]]      <- u_added(res)
RUN_METRICS[["residential_demolished"]] <- u_demo(res)
RUN_METRICS[["recovered_from_NA_rows"]] <- nrow(na_recovered)
RUN_METRICS[["dropped_rows"]]           <- nrow(dropped_log)
RUN_METRICS[["dropped_added"]]          <- u_added(dropped_log)
RUN_METRICS[["dropped_demolished"]]     <- u_demo(dropped_log)
RUN_METRICS[["n_years"]]                <- length(years)
RUN_METRICS[["per_year"]]               <- build_log

cat("=============================================================\n")
cat("Permit aggregate build complete.\n")
print(build_log, n = Inf)
cat("=============================================================\n")
