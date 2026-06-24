# ============================================================
# 08b_name_fallback_rescue.R
# Build the current-year (2026) neighbourhood choropleth GeoJSON: resolve each
# aggregate row's id/name to the canonical City value via the crosswalk, drop
# annexation-container umbrella rows, then spatial-join to the boundary polygons
# and classify render states. This is the SOLE current-year builder (the former
# pre-rescue 08_build_geojson.R was removed 2026-06-22 — it did a redundant join
# whose output the frontend never consumed).
#
# Boundary source: City of Edmonton Neighbourhoods CSV (65fr-66s6), 407 polygons,
# WKT/WGS84, in pipeline/shared. Read via read_csv + st_as_sf(wkt=...).
#
# Inputs:
#   - output/neighbourhood_aggregates_2026.csv               (from script 07)
#   - shared_path("data") City_of_Edmonton_-_Neighbourhoods_*.csv  (boundary, newest by glob)
#   - data/processed/assess_2026_no_parking.csv              (non-residential check)
#   - data/reference/neighbourhood_crosswalk_<YYYYMMDD>.csv  (newest; the single
#     reconciliation contract, authored by the reconcile one-shot, CLAUDE.md §4.4)
#
# Outputs:
#   - output/neighbourhoods_2026_recovered.geojson  (the choropleth source the
#     FRONTEND consumes; uniform neighbourhoods_<YYYY>_recovered.geojson name
#     shared with the historical years)
#   - output/neighbourhoods_2026_not_rendered_recovered.csv  (unresolved NA-id rows)
#   - output/name_mapping_audit_log_<date>.csv               (audit trail, pruned to 2)
#
# What this does:
#   1. Load the 2026 aggregates + the boundary polygons.
#   2. Drop container_exclude umbrella rows (8885-8888) from both.
#   3. Resolve variant id/name -> canonical via apply_crosswalk (NEW-ID-WINS):
#      rename, renumber, typo, suffix_drift, alias, merge. Unmatched rows stay
#      as-is and surface in the audit log.
#   4. Spatial-join + classify render states; write the GeoJSON + audit log.
#
# DUPLICATE-ID guard: hard-stop if any polygon carries two aggregate rows after
#   the join (one-feature-per-polygon is required by the frontend promoteId).
#
# Polygons that stay no_data BY DESIGN (legitimately zero-residential per City):
#   - EDMONTON RESEARCH & DEVELOPMENT PARK (6190) — industrial/research zone
#   - LEWIS FARMS (4260) / LEWIS FARMS BUSINESS EMPLOYMENT (4261) — non-residential
#     (the legacy "Lewis Farms Industrial" rescue was dropped per KC 2026-06-22)
#   - PLACE LARUE (4400)                          — 0-pop commercial zone
#   (Oliver/id-1150 is NOT here: 1150 is absent from the current boundary; the
#    rename to WÎHKWÊNTÔWIN/1151 is a crosswalk row, new-id-wins.)
# ============================================================

source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))
source(shared_path("reconcile_helpers.R"))

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

stopifnot(dir.exists("output"))


# --- Path config --------------------------------------------
# Locate the newest neighbourhood boundary snapshot by glob — the same
# sort(decreasing=TRUE)[1] discipline 07a/08d use for their inputs, so a new City
# boundary drops in with no code edit. The real on-disk name uses "_-_".
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
aggregates_path <- "output/neighbourhood_aggregates_2026.csv"
post_parking_path <- "data/processed/assess_2026_no_parking.csv"

# Hard fail with actionable errors if any input is missing
for (p in c(boundary_path, aggregates_path, post_parking_path)) {
  if (!file.exists(p)) stop("Missing input: ", p)
}


# --- Load aggregates ----------------------------------------
aggregates <- read_csv(
  aggregates_path,
  col_types = cols(
    `Neighbourhood ID`            = col_character(),
    Neighbourhood                 = col_character(),
    n_properties                  = col_integer(),
    avall_public                  = col_double(),
    median_assessvalue            = col_double(),
    sd_assessedvalue              = col_double(),
    median_yearbuilt              = col_double(),
    pct_with_unit                 = col_double(),
    avg_assessvalue_without_unit  = col_double(),
    avg_lotsize                   = col_double(),
    suppressed                    = col_logical(),
    yoy_pct_change                = col_double()
  )
)
cat(sprintf("\nLoaded %s aggregate rows\n", comma(nrow(aggregates))))


# --- Load boundary polygons ---------------------------------
nbhd_polygons <- read_csv(boundary_path, show_col_types = FALSE) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  st_set_geometry("geometry") |>
  mutate(`Neighbourhood ID` = as.character(as.integer(`Neighbourhood Number`)))


# --- Drop annexation-container umbrella rows ----------------
# crosswalk relation=="container_exclude" (ids 8885-8888): aggregation polygons
# that are NOT real neighbourhoods. Drop them from BOTH the boundary and any
# aggregate rows attributed to them, BEFORE the join, so they never render.
exclude_ids <- crosswalk_exclude_ids()
n_poly_before <- nrow(nbhd_polygons)
nbhd_polygons <- nbhd_polygons |> filter(!`Neighbourhood ID` %in% exclude_ids)
aggregates    <- aggregates    |> filter(!`Neighbourhood ID` %in% exclude_ids)
cat(sprintf("Container-excluded %d umbrella polygon(s): %s\n",
            n_poly_before - nrow(nbhd_polygons),
            if (length(exclude_ids)) paste(exclude_ids, collapse = ", ") else "(none)"))


# --- Resolve variant id/name -> canonical via the crosswalk -
# Replaces the old hand-curated rescue table. apply_crosswalk rewrites old-id and
# variant-name rows (rename, renumber, typo, suffix_drift, alias, merge) to the
# canonical City id+name; NEW-ID-WINS. Rows with no crosswalk row are left
# untouched (e.g. genuinely new NA-id developing areas) and surface in the audit
# log as unresolved. Same row count — only id/name change.
aggregates_rescued <- apply_crosswalk(aggregates)
stopifnot(nrow(aggregates_rescued) == nrow(aggregates))


# --- Audit log: what the crosswalk changed ------------------
# Compare pre/post element-wise (apply_crosswalk preserves row order + count).
id_before   <- coalesce(aggregates$`Neighbourhood ID`, "NA")
id_after    <- coalesce(aggregates_rescued$`Neighbourhood ID`, "NA")
name_before <- aggregates$Neighbourhood
name_after  <- aggregates_rescued$Neighbourhood
audit_log <- tibble(
  assessment_name = name_before,
  resolved_name   = name_after,
  resolved_id     = id_after,
  n_properties_in_aggregate = aggregates$n_properties,
  status = case_when(
    id_before != id_after | name_before != name_after ~ "resolved",
    id_after == "NA"                                   ~ "unresolved_no_mapping",
    TRUE                                               ~ "unchanged"
  )
)
n_rescued    <- sum(audit_log$status == "resolved")
n_unresolved <- sum(audit_log$status == "unresolved_no_mapping")

cat(sprintf("\n--- Crosswalk resolution ---\n"))
cat(sprintf("Resolved:            %d\n", n_rescued))
cat(sprintf("Unresolved (NA-id):  %d\n", n_unresolved))
cat(sprintf("Unchanged:           %d\n", sum(audit_log$status == "unchanged")))


# --- Re-run spatial join (same logic as script 08) ----------
post_parking <- read_csv(
  post_parking_path,
  col_types = cols(`Neighbourhood ID` = col_character(),
                   .default = col_guess())
)
ids_in_data <- unique(post_parking$`Neighbourhood ID`)
ids_in_aggregates <- unique(aggregates_rescued$`Neighbourhood ID`)
non_residential_ids <- setdiff(ids_in_data, ids_in_aggregates)
non_residential_ids <- non_residential_ids[non_residential_ids != "NA"]

joined <- nbhd_polygons |>
  left_join(aggregates_rescued, by = "Neighbourhood ID")

EVERGREEN_ID <- "2270"

joined <- joined |>
  mutate(
    polygon_state = case_when(
      `Neighbourhood ID` == EVERGREEN_ID ~ "manufactured_home_community",
      `Neighbourhood ID` %in% non_residential_ids ~ "non_residential",
      !is.na(suppressed) & suppressed ~ "suppressed_low_n",
      !is.na(n_properties) & n_properties >= 100 ~ "aggregated",
      TRUE ~ "no_data"
    ),
    display_name = coalesce(Neighbourhood, `Neighbourhood Name`)
  )

state_summary <- joined |>
  st_drop_geometry() |>
  count(polygon_state, sort = TRUE)

cat("\n--- Polygon state breakdown (RECOVERED) ---\n")
print(state_summary)

#duplicate handler
dup_ids <- joined$`Neighbourhood ID`[duplicated(joined$`Neighbourhood ID`)]
if (length(dup_ids) > 0) {
  print(joined |> st_drop_geometry() |> filter(`Neighbourhood ID` %in% dup_ids))
  stop("Duplicate Neighbourhood IDs after join: ", paste(unique(dup_ids), collapse = ", "))
}
# --- Identify truly orphan polygons -------------------------
# These are no_data polygons even after crosswalk resolution. By design, includes
# legitimately zero-residential areas: EDM R&D PARK 6190, LEWIS FARMS 4260/4261,
# PLACE LARUE 4400. (Oliver/1150 is not here — see header.)
remaining_no_data <- joined |>
  st_drop_geometry() |>
  filter(polygon_state == "no_data") |>
  # remaining_no_data block:
  select(`Neighbourhood ID`, shapefile_name = `Neighbourhood Name`, district = `Planning District`)

cat(sprintf("\nPolygons that remain no_data: %d\n", nrow(remaining_no_data)))
cat("(these are legitimately empty by City designation — see header comments)\n")
print(remaining_no_data)


# --- Write outputs ------------------------------------------
# Trim to display columns (same as script 08)
geojson_ready <- joined |>
  transmute(
    `Neighbourhood ID`           = `Neighbourhood ID`,
    display_name                 = display_name,
    shapefile_name               = `Neighbourhood Name`,
    district                     = `Planning District`,
    polygon_state                = polygon_state,
    n_properties                 = n_properties,
    median_assessvalue           = median_assessvalue,
    avall_public                 = avall_public,
    sd_assessedvalue             = sd_assessedvalue,
    median_yearbuilt             = median_yearbuilt,
    pct_with_unit                = pct_with_unit,
    avg_assessvalue_without_unit = avg_assessvalue_without_unit,
    avg_lotsize                  = avg_lotsize,
    yoy_pct_change               = yoy_pct_change
  ) |>
  st_set_precision(1e6) |>
  st_make_valid()

geojson_path <- "output/neighbourhoods_2026_recovered.geojson"
if (file.exists(geojson_path)) file.remove(geojson_path)
st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)

geojson_size <- file.info(geojson_path)$size
cat(sprintf("\nWrote %s (%.2f MB, %d polygons)\n",
            geojson_path,
            geojson_size / 1024 / 1024,
            nrow(geojson_ready)))


# Truly orphan aggregate rows (no crosswalk row resolves them). Status vocabulary
# is "resolved" / "unresolved_no_mapping" / "unchanged"; only the unresolved
# NA-id rows are orphans worth surfacing for human review.
not_rendered_recovered <- audit_log |>
  filter(status == "unresolved_no_mapping")
not_rendered_path <- "output/neighbourhoods_2026_not_rendered_recovered.csv"
write_csv(not_rendered_recovered, not_rendered_path)
cat(sprintf("Wrote %s (%d unresolved rows)\n",
            not_rendered_path, nrow(not_rendered_recovered)))


# Audit log (dated). Keep only resolved/unresolved rows — "unchanged" is the
# ~390 untouched neighbourhoods, not interesting for an audit trail.
audit_path <- sprintf("output/name_mapping_audit_log_%s.csv",
                      format(Sys.Date(), "%Y%m%d"))
audit_log |> filter(status != "unchanged") |> write_csv(audit_path)
cat(sprintf("Wrote %s (%d resolved/unresolved rows)\n",
            audit_path, sum(audit_log$status != "unchanged")))

# Prune dated audit logs to the newest 2 (output hygiene; see _bootstrap.R).
pruned <- prune_dated_files("output", "^name_mapping_audit_log_\\d{8}\\.csv$", keep = 2L)
if (length(pruned)) cat(sprintf("Pruned %d old audit log(s).\n", length(pruned)))


# --- Final run summary --------------------------------------
cat("\n--- Run summary ---\n")
cat(sprintf("Crosswalk rows applied: %d\n", nrow(load_crosswalk())))
cat(sprintf("Container-excluded:     %d\n", length(exclude_ids)))
cat(sprintf("Resolved to canonical:  %d\n", n_rescued))
cat(sprintf("Unresolved (NA-id):     %d\n", n_unresolved))
cat(sprintf("Total polygons:         %d\n", nrow(joined)))
cat(sprintf("  aggregated:           %d\n",
            sum(joined$polygon_state == "aggregated")))
cat(sprintf("  non_residential:      %d\n",
            sum(joined$polygon_state == "non_residential")))
cat(sprintf("  suppressed_low_n:     %d\n",
            sum(joined$polygon_state == "suppressed_low_n")))
cat(sprintf("  manufactured_home:    %d\n",
            sum(joined$polygon_state == "manufactured_home_community")))
cat(sprintf("  no_data (legitimate): %d\n",
            sum(joined$polygon_state == "no_data")))


# --- Choropleth colour-scale domain -------------------------
# Same logic as script 08, in case the rescue shifted the distribution
agg_vals <- joined |>
  st_drop_geometry() |>
  filter(polygon_state == "aggregated") |>
  pull(median_assessvalue)

cat(sprintf("\nChoropleth colour-scale domain (median_assessvalue):\n"))
cat(sprintf("  Min:    $%s\n", comma(round(min(agg_vals, na.rm = TRUE)))))
cat(sprintf("  Q25:    $%s\n", comma(round(quantile(agg_vals, 0.25, na.rm = TRUE)))))
cat(sprintf("  Median: $%s\n", comma(round(median(agg_vals, na.rm = TRUE)))))
cat(sprintf("  Q75:    $%s\n", comma(round(quantile(agg_vals, 0.75, na.rm = TRUE)))))
cat(sprintf("  Max:    $%s\n", comma(round(max(agg_vals, na.rm = TRUE)))))
