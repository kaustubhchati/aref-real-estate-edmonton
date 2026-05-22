# ============================================================
# 08_build_geojson.R
# Spatial join — attach Layer 2 aggregates to neighbourhood polygons
# and write a GeoJSON file ready for MapLibre rendering.
#
# Inputs:
#   - output/neighbourhood_aggregates_2026.csv         (from script 07)
#   - .../Data/Reference shapefile/Data_Reference_shapefile_EDM_neighborhood_boundary.shp
#     plus its .shx, .dbf, .prj companions
#     (Jan 2023 City of Edmonton shapefile, 402 polygons, WGS84)
#   - data/processed/assess_2026_no_parking.csv        (for non-residential
#     state detection — neighbourhoods entirely eliminated by R1+R3)
#
# Outputs:
#   - output/neighbourhoods_2026.geojson               (choropleth source)
#   - output/neighbourhoods_2026_not_rendered.csv      (NA-id developing areas
#     with aggregates but no polygon to render)
#
# Polygon render states (column `polygon_state`):
#   aggregated                    — has data, N >= 100, render coloured
#   suppressed_low_n              — has data, N < 100, render grey "suppressed"
#   non_residential               — R1+R3 emptied the neighbourhood, render grey
#   manufactured_home_community   — EVERGREEN (ID 2270), special-case grey
#   no_data                       — polygon exists but no rows reach it at all
#                                   (unusual; usually means a name in the
#                                   shapefile that no longer has an ID match)
#
# Design notes:
#   - Join key is `Neighbourhood ID` ↔ `neighbourh` (numeric). Stable across
#     the Oliver→Wîhkwêntôwin rename and against case/spacing drift in names.
#   - EVERGREEN (ID 2270) is hard-coded as its own state. The diagnostic that
#     resolved it (May 19 2026: all 647 R1-survivors had NA lot_size, median
#     value $50,500, median area 106 sqm — Edmonton's largest manufactured
#     home community) is documented in YEAR_DRIFT_FINDINGS.md §3.4.
#   - Coordinates are rounded to 6 decimal places (~10 cm precision) to
#     reduce GeoJSON file size without visible loss at choropleth zoom.
#   - Topology simplification is NOT applied. For 402 polygons the file
#     stays under ~3 MB which is fine for inline-HTML demos.
#
# TODO (post-Friday):
#   - relocate shapefile under the project's data/ tree for portability
#   - consider 2026 boundary shapefile once UAlberta Library data services
#     identifies the canonical current source
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

dir.create("output", showWarnings = FALSE, recursive = TRUE)


# --- Path config --------------------------------------------
# Absolute path to the 2023 shapefile. Marked TODO above for cleanup.
shapefile_path <- "data/raw/EDM_neighborhood_boundary.shp"

if (!file.exists(shapefile_path)) {
  stop("Shapefile not found at: ", shapefile_path,
       "\n  Check that .shp/.shx/.dbf/.prj all live in the same folder",
       "\n  with the same base name.")
}


# --- Load aggregates ----------------------------------------
agg_path <- "output/neighbourhood_aggregates_2026.csv"
if (!file.exists(agg_path)) {
  stop("Missing: ", agg_path, " — run scripts/07_layer2_aggregates.R first.")
}

aggregates <- read_csv(
  agg_path,
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
cat(sprintf("Loaded %s aggregate rows\n", comma(nrow(aggregates))))


# --- Identify non-residential neighbourhoods ----------------
# These are IDs present in the post-parking frame but eliminated entirely
# by R1+R3. They have polygons in the shapefile but no aggregate row.
# Detection: set-difference of (post-parking IDs) vs (aggregates IDs).
post_parking <- read_csv(
  "data/processed/assess_2026_no_parking.csv",
  col_types = cols(`Neighbourhood ID` = col_character(),
                   .default = col_guess())
)

ids_in_data       <- unique(post_parking$`Neighbourhood ID`)
ids_in_aggregates <- unique(aggregates$`Neighbourhood ID`)
non_residential_ids <- setdiff(ids_in_data, ids_in_aggregates)
# Drop the "NA" string from this set — NA-id is a different case
non_residential_ids <- non_residential_ids[non_residential_ids != "NA"]

cat(sprintf("Non-residential neighbourhood IDs (R1+R3 emptied): %d\n",
            length(non_residential_ids)))


# --- Load shapefile -----------------------------------------
nbhd_polygons <- st_read(shapefile_path, quiet = TRUE)

# Cast neighbourh to character integer (drops the trailing .0 from float repr)
# to match the character-keyed Neighbourhood ID in our data.
nbhd_polygons <- nbhd_polygons |>
  mutate(`Neighbourhood ID` = as.character(as.integer(neighbourh)))

cat(sprintf("Loaded shapefile: %s polygons, CRS = %s\n",
            comma(nrow(nbhd_polygons)),
            st_crs(nbhd_polygons)$Name %||% "unknown"))


# --- Join aggregates onto polygons --------------------------
# Left join so we keep every polygon, even those without aggregate data.
joined <- nbhd_polygons |>
  left_join(aggregates, by = "Neighbourhood ID")


# --- Classify each polygon's render state -------------------
# Order matters: manufactured_home_community check before non_residential,
# because EVERGREEN's ID would otherwise fall into non_residential.
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
    # Display name override: 2023 shapefile says OLIVER, current data says
    # WÎHKWÊNTÔWIN. Prefer the assessment-data name when present.
    display_name = coalesce(Neighbourhood, name)
  )

state_summary <- joined |>
  st_drop_geometry() |>
  count(polygon_state, sort = TRUE)

cat("\n--- Polygon state breakdown ---\n")
print(state_summary)


# --- Sanity checks ------------------------------------------
# Every polygon should have exactly one state.
stopifnot(all(!is.na(joined$polygon_state)))

# Aggregated count should equal (n_aggregates - n_suppressed - n_evergreen).
n_aggregated_expected <- sum(!aggregates$suppressed & 
                              aggregates$`Neighbourhood ID` != EVERGREEN_ID &
                              aggregates$`Neighbourhood ID` != "NA",
                            na.rm = TRUE)
n_aggregated_actual <- sum(joined$polygon_state == "aggregated")
cat(sprintf("Aggregated polygons: %d (expected %d)\n",
            n_aggregated_actual, n_aggregated_expected))


# --- NA-id rows: write separately for the demo callout -------
# These are aggregate rows (developing neighbourhoods) without polygons.
# They never appear in the GeoJSON; the demo renders them as a list.
not_rendered <- aggregates |>
  filter(`Neighbourhood ID` == "NA") |>
  arrange(desc(n_properties))

not_rendered_path <- "output/neighbourhoods_2026_not_rendered.csv"
write_csv(not_rendered, not_rendered_path)
cat(sprintf("\nWrote %s (%d developing neighbourhoods)\n",
            not_rendered_path, nrow(not_rendered)))


# --- Trim columns for the GeoJSON ---------------------------
# Keep only what the choropleth and tooltip need. Shapefile-side fields
# like `name`, `descriptiv`, `district` are display-useful; the rest
# (date_effec, time_effec, etc.) are legacy ArcGIS administrative
# columns that bloat the file with no display value.
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
  )


# --- Round coordinates to 6 decimal places ------------------
# Reduces file size meaningfully without visible precision loss
# at any zoom MapLibre will use for a city-wide choropleth.
geojson_ready <- st_set_precision(geojson_ready, 1e6) |>
  st_make_valid()


# --- Write GeoJSON ------------------------------------------
geojson_path <- "output/neighbourhoods_2026.geojson"
# Remove existing file if present — st_write won't overwrite by default
if (file.exists(geojson_path)) file.remove(geojson_path)

st_write(geojson_ready, geojson_path, driver = "GeoJSON", quiet = TRUE)

geojson_size <- file.info(geojson_path)$size
cat(sprintf("\nWrote %s (%s MB, %d polygons)\n",
            geojson_path,
            round(geojson_size / 1024 / 1024, 2),
            nrow(geojson_ready)))


# --- Run summary --------------------------------------------
cat("\n--- Run summary ---\n")
summary_tbl <- tibble(
  output                     = c(geojson_path, not_rendered_path),
  rows                       = c(nrow(geojson_ready), nrow(not_rendered)),
  purpose                    = c(
    "Polygons + aggregates for choropleth",
    "Aggregate rows for areas without polygons"
  )
)
print(summary_tbl)

cat("\nPolygon state distribution:\n")
print(state_summary)

if ("aggregated" %in% state_summary$polygon_state) {
  agg_vals <- joined |>
    st_drop_geometry() |>list.files("/Users/kaustubhchati/Desktop", 
           pattern = "\\.shp$", 
           recursive = TRUE, 
           full.names = TRUE)
    filter(polygon_state == "aggregated") |>
    pull(median_assessvalue)
  
  cat(sprintf("\nChoropleth colour-scale domain (median_assessvalue):\n"))
  cat(sprintf("  Min: $%s\n", comma(round(min(agg_vals, na.rm = TRUE)))))
  cat(sprintf("  Q25: $%s\n", comma(round(quantile(agg_vals, 0.25, na.rm = TRUE)))))
  cat(sprintf("  Med: $%s\n", comma(round(median(agg_vals, na.rm = TRUE)))))
  cat(sprintf("  Q75: $%s\n", comma(round(quantile(agg_vals, 0.75, na.rm = TRUE)))))
  cat(sprintf("  Max: $%s\n", comma(round(max(agg_vals, na.rm = TRUE)))))
}