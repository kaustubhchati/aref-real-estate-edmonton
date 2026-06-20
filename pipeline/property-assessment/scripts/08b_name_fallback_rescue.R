# ============================================================
# 08b_name_fallback_rescue.R
# Rescue NA-id aggregate rows by matching them to polygons via a hand-curated,
# version-controlled name→ID mapping table, then re-run the 08 spatial join.
#
# Boundary source (changed 2026-06-17): City of Edmonton Neighbourhoods CSV
# (65fr-66s6), 407 polygons, WKT/WGS84, in pipeline/shared. Replaces the
# Jan-2023 shapefile. Read via read_csv + st_as_sf(wkt=...).
#
# Inputs:
#   - output/neighbourhood_aggregates_2026.csv               (from script 07)
#   - ../shared/data/.../City_of_Edmonton_-_Neighbourhoods_20260616.csv
#   - data/processed/assess_2026_no_parking.csv              (non-residential check)
#   - data/reference/neighbourhood_name_mappings_20260617.csv (curated mappings,
#     7 rows; date in filename — latest is authoritative, CLAUDE.md §4.4)
#
# Outputs:
#   - output/neighbourhoods_2026_recovered_new_boundaries.geojson  (the choropleth
#     source the FRONTEND consumes — rescued build, supersedes 08's pre-rescue file)
#   - output/neighbourhoods_2026_not_rendered_recovered.csv         (unresolved rows)
#   - output/name_mapping_audit_log_<date>.csv                      (audit trail)
#
# What this does:
#   1. Load the curated mapping table (7 mappings as of 2026-06-17).
#   2. For each NA-id aggregate row, resolve a Neighbourhood ID via assessment_name.
#   3. Substitute the resolved ID; re-run the 08 spatial-join + state logic.
#   4. Write a rescued GeoJSON (parallel to 08's pre-rescue output) + audit log.
#
# Two validation guards (both added 2026-06-17 after real failures in development):
#   - TARGET-EXISTS: a mapping is only "rescued" if its resolved_id actually
#     exists in the boundary file. A mapped-but-missing target → status
#     "unresolved_target_missing", not a false success. (Caught Chappelle/Heritage
#     Valley/Lewis Farms IDs that the 2026 file renumbered.)
#   - DUPLICATE-ID: hard-stop if any polygon carries two aggregate rows after the
#     join (one-feature-per-polygon required by the frontend promoteId).
#
# 2026 boundary reconciliation (resolved this refresh, evidence in the audit log
# and the mapping CSV `source` column):
#   - CHAPPELLE        5462 → 5471  (1:1 renumber)
#   - LEWIS FARMS INDUSTRIAL → 4261 (reclassified to Business Employment;
#                                    point-in-polygon 100/103)
#   - HERITAGE VALLEY TOWN CENTRE   merged 15+577 → 592 at id 5472 in script 07
#     (no longer rescued here — native id after the 07 name-merge)
#
# Mapping is explicit, never fuzzy (CLAUDE.md §4.7). New NA-id rows in a future
# refresh that aren't in the table stay unresolved and surface for human review.
# This script is the operational prototype of the Phase-2 Sanity Agent's
# cross-product reconciliation capability.
#
# Polygons that stay no_data BY DESIGN (legitimately zero-residential per City):
#   - EDMONTON RESEARCH & DEVELOPMENT PARK (6190) — industrial/research zone
#   - LEWIS FARMS (4260)                          — parent, properties sit in 4261
#   - PLACE LARUE (4400)                          — 0-pop commercial zone
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

stopifnot(dir.exists("output"))


# --- Path config --------------------------------------------
boundary_path <- "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/pipeline/shared/data/City_of_Edmonton_-_Neighbourhoods_20260616.csv"
aggregates_path <- "output/neighbourhood_aggregates_2026.csv"
post_parking_path <- "data/processed/assess_2026_no_parking.csv"
mapping_path <- "data/reference/neighbourhood_name_mappings_20260617.csv"

# Hard fail with actionable errors if any input is missing
for (p in c(boundary_path, aggregates_path, post_parking_path, mapping_path)) {
  if (!file.exists(p)) stop("Missing input: ", p)
}


# --- Load mapping table (the curated artifact) --------------
mapping <- read_csv(
  mapping_path,
  col_types = cols(
    shapefile_name  = col_character(),
    shapefile_id    = col_character(),
    assessment_name = col_character(),
    reason          = col_character(),
    source          = col_character(),
    date_curated    = col_date(),
    curated_by      = col_character()
  )
)

cat(sprintf("Loaded %d name mappings (curated %s by %s)\n\n",
            nrow(mapping),
            unique(mapping$date_curated),
            paste(unique(mapping$curated_by), collapse = ", ")))
cat("--- Mapping table contents ---\n")
mapping |> select(shapefile_name, shapefile_id, assessment_name, reason) |> print(n = Inf)


# --- Load aggregates and identify NA-id rows ----------------
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

# Two flavours of NA: literal "NA" string and real NA
na_id_rows <- aggregates |>
  filter(is.na(`Neighbourhood ID`) | `Neighbourhood ID` == "NA")
cat(sprintf("NA-id aggregate rows to attempt rescue: %d\n", nrow(na_id_rows)))

nbhd_polygons <- read_csv(boundary_path, show_col_types = FALSE) |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  st_set_geometry("geometry") |>
  mutate(`Neighbourhood ID` = as.character(as.integer(`Neighbourhood Number`)))
# --- Apply the mapping --------------------------------------
# Left-join NA-id rows against mapping by assessment_name.
# If a match: rewrite Neighbourhood ID with the resolved shapefile_id.
# If no match: leave NA so the polygon stays no_data (audit log will surface).
rescued <- na_id_rows |>
  left_join(
    mapping |> select(assessment_name, resolved_id = shapefile_id, reason),
    by = c("Neighbourhood" = "assessment_name")
  )

# Build audit log
audit_log <- rescued |>
  transmute(
    assessment_name = Neighbourhood,
    n_properties_in_aggregate = n_properties,
    resolved_to_shapefile_id = resolved_id,
    mapping_reason = reason,
    target_exists = resolved_id %in% nbhd_polygons$`Neighbourhood ID`,
    status = case_when(
      is.na(resolved_id)                                      ~ "unresolved_no_mapping",
      !(resolved_id %in% nbhd_polygons$`Neighbourhood ID`)    ~ "unresolved_target_missing",
      TRUE                                                    ~ "rescued"
    )
  )

n_rescued    <- sum(audit_log$status == "rescued")
n_unresolved <- sum(audit_log$status != "rescued")

cat(sprintf("\n--- Rescue results ---\n"))
cat(sprintf("Successfully rescued:  %d\n", n_rescued))
cat(sprintf("Unresolved (no map):   %d\n", n_unresolved))


# --- Rebuild aggregates with rescued IDs --------------------
aggregates_rescued <- aggregates |>
  left_join(
    rescued |> select(Neighbourhood, resolved_id),
    by = "Neighbourhood"
  ) |>
  mutate(
    `Neighbourhood ID` = coalesce(resolved_id, `Neighbourhood ID`)
  ) |>
  select(-resolved_id)

# Sanity: same row count, just IDs filled in
stopifnot(nrow(aggregates_rescued) == nrow(aggregates))


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
# These are no_data polygons even after rescue. By design, includes:
#   OLIVER 1150, WINDERMERE AREA 5575, EDM R&D PARK 6190, PLACE LARUE 4400
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

geojson_path <- "output/neighbourhoods_2026_recovered_new_boundaries.geojson"
if (file.exists(geojson_path)) file.remove(geojson_path)
st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)

geojson_size <- file.info(geojson_path)$size
cat(sprintf("\nWrote %s (%.2f MB, %d polygons)\n",
            geojson_path,
            geojson_size / 1024 / 1024,
            nrow(geojson_ready)))


# Truly orphan aggregate rows (no rescue available)
not_rendered_recovered <- audit_log |>
  filter(status == "unresolved")
not_rendered_path <- "output/neighbourhoods_2026_not_rendered_recovered.csv"
write_csv(not_rendered_recovered, not_rendered_path)
cat(sprintf("Wrote %s (%d unresolved rows)\n",
            not_rendered_path, nrow(not_rendered_recovered)))


# Audit log
audit_path <- sprintf("output/name_mapping_audit_log_%s.csv",
                      format(Sys.Date(), "%Y%m%d"))
write_csv(audit_log, audit_path)
cat(sprintf("Wrote %s (%d audit rows)\n", audit_path, nrow(audit_log)))


# --- Final run summary --------------------------------------
cat("\n--- Run summary ---\n")
cat(sprintf("Mappings curated:       %d (in mapping CSV)\n", nrow(mapping)))
cat(sprintf("NA-id rows attempted:   %d\n", nrow(na_id_rows)))
cat(sprintf("Successfully rescued:   %d\n", n_rescued))
cat(sprintf("Unresolved:             %d\n", n_unresolved))
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
