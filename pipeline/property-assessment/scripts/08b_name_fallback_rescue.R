# ============================================================
# 08b_name_fallback_rescue.R
# Rescue NA-id aggregate rows by matching them to no_data polygons
# via a hand-curated, version-controlled name mapping table.
#
# Inputs:
#   - output/neighbourhood_aggregates_2026.csv               (from script 07)
#   - data/raw/EDM_neighborhood_boundary.shp + companions    (Jan 2023 shapefile)
#   - data/processed/assess_2026_no_parking.csv              (non-residential check)
#   - data/reference/neighbourhood_name_mappings_20260519.csv (curated mappings,
#                                                              date in filename)
#
# Outputs:
#   - output/neighbourhoods_2026_recovered.geojson           (corrected choropleth)
#   - output/neighbourhoods_2026_not_rendered_recovered.csv  (truly orphan rows)
#   - output/name_mapping_audit_log_<date>.csv               (audit trail)
#
# What this script does:
#   1. Loads the curated mapping table (8 mappings as of 2026-05-19)
#   2. For each NA-id aggregate row, looks up the shapefile_id via
#      assessment_name match in the mapping table
#   3. Substitutes the resolved ID into the aggregates frame
#   4. Re-runs the spatial join logic from script 08
#   5. Writes a parallel GeoJSON (not overwriting 08's output)
#   6. Writes an audit log showing which mappings fired
#
# Design intent:
#   The mapping table is the Phase-2 Sanity Agent's contract. It is
#   versioned, self-documenting (reason + source per row), and
#   produced by human research with named provenance. Future refreshes
#   will append rows here; the Sanity Agent will read this same file.
#
#   This script does NOT do fuzzy matching. Every mapping is explicit.
#   If a new NA-id row appears in a future refresh that's not in the
#   mapping table, it stays unresolved and surfaces as a no_data
#   polygon for human review.
#
# Polygons that stay no_data BY DESIGN (not addressable by this script):
#   - OLIVER (id 1150)        : historical/secondary boundary, the active
#                               Wîhkwêntôwin polygon at id 1151 joins fine
#   - WINDERMERE AREA (5575)  : umbrella structure-plan container, 6 sub-
#                               neighbourhoods carry the properties
#   - EDM RESEARCH & DEV PARK : industrial/research zone, zero residential
#     (6190)                    by City designation
#   - PLACE LARUE (4400)      : 0-residential-population commercial zone
#                               per City 2014 + 2019 census
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

stopifnot(dir.exists("output"))


# --- Path config --------------------------------------------
shapefile_path <- "data/raw/EDM_neighborhood_boundary.shp"
aggregates_path <- "output/neighbourhood_aggregates_2026.csv"
post_parking_path <- "data/processed/assess_2026_no_parking.csv"
mapping_path <- "data/reference/neighbourhood_name_mappings_20260519.csv"

# Hard fail with actionable errors if any input is missing
for (p in c(shapefile_path, aggregates_path, post_parking_path, mapping_path)) {
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
    suppressed                    = col_logical()
  )
)
cat(sprintf("\nLoaded %s aggregate rows\n", comma(nrow(aggregates))))

# Two flavours of NA: literal "NA" string and real NA
na_id_rows <- aggregates |>
  filter(is.na(`Neighbourhood ID`) | `Neighbourhood ID` == "NA")
cat(sprintf("NA-id aggregate rows to attempt rescue: %d\n", nrow(na_id_rows)))


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
    status = if_else(is.na(resolved_id), "unresolved", "rescued")
  )

n_rescued <- sum(audit_log$status == "rescued")
n_unresolved <- sum(audit_log$status == "unresolved")

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

nbhd_polygons <- st_read(shapefile_path, quiet = TRUE) |>
  mutate(`Neighbourhood ID` = as.character(as.integer(neighbourh)))

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
    display_name = coalesce(Neighbourhood, name)
  )

state_summary <- joined |>
  st_drop_geometry() |>
  count(polygon_state, sort = TRUE)

cat("\n--- Polygon state breakdown (RECOVERED) ---\n")
print(state_summary)


# --- Identify truly orphan polygons -------------------------
# These are no_data polygons even after rescue. By design, includes:
#   OLIVER 1150, WINDERMERE AREA 5575, EDM R&D PARK 6190, PLACE LARUE 4400
remaining_no_data <- joined |>
  st_drop_geometry() |>
  filter(polygon_state == "no_data") |>
  select(`Neighbourhood ID`, shapefile_name = name, district)

cat(sprintf("\nPolygons that remain no_data: %d\n", nrow(remaining_no_data)))
cat("(these are legitimately empty by City designation — see header comments)\n")
print(remaining_no_data)


# --- Write outputs ------------------------------------------
# Trim to display columns (same as script 08)
geojson_ready <- joined |>
  transmute(
    `Neighbourhood ID`           = `Neighbourhood ID`,
    display_name                 = display_name,
    shapefile_name               = name,
    district                     = district,
    polygon_state                = polygon_state,
    n_properties                 = n_properties,
    median_assessvalue           = median_assessvalue,
    avall_public                 = avall_public,
    sd_assessedvalue             = sd_assessedvalue,
    median_yearbuilt             = median_yearbuilt,
    pct_with_unit                = pct_with_unit,
    avg_assessvalue_without_unit = avg_assessvalue_without_unit,
    avg_lotsize                  = avg_lotsize
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
