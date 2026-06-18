# ============================================================
# 08_build_geojson.R
# Spatial join — attach Layer 2 aggregates to neighbourhood polygons
# and write a GeoJSON file ready for MapLibre rendering.
#
# Boundary source (changed 2026-06-17): City of Edmonton Neighbourhoods CSV
# (dataset 65fr-66s6), 407 polygons, WKT geometry in the "Geometry Multipolygon"
# column, WGS84. Lives in pipeline/_shared so every section joins to the same
# canonical geometry. Replaces the Jan-2023 EDM_neighborhood_boundary shapefile
# (402 polygons). Read via read_csv + st_as_sf(wkt=...); no shapefile sidecars.
#
# Inputs:
#   - output/neighbourhood_aggregates_2026.csv         (from script 07)
#   - ../_shared/data/.../City_of_Edmonton_-_Neighbourhoods_20260616.csv
#     (407-polygon boundary CSV, WKT/WGS84)
#   - data/processed/assess_2026_no_parking.csv        (for non-residential
#     state detection — neighbourhoods entirely eliminated by R1+R3)
#
# Outputs:
#   - output/neighbourhoods_2026_new_boundaries.geojson  (choropleth source,
#     PRE-rescue — see 08b for the rescued/recovered build the frontend consumes)
#   - output/neighbourhoods_2026_not_rendered.csv         (NA-id rows w/o polygon)
#
# Polygon render states (column `polygon_state`):
#   aggregated                    — has data, N >= 100, render coloured
#   suppressed_low_n              — has data, N < 100, render grey "suppressed"
#   non_residential               — R1+R3 emptied the neighbourhood, render grey
#   manufactured_home_community   — EVERGREEN (ID 2270), special-case grey
#   no_data                       — polygon exists but no aggregate row reaches it
#
# Design notes:
#   - Join key is `Neighbourhood ID` ↔ `Neighbourhood Number` (numeric). Stable
#     across the Oliver→Wîhkwêntôwin rename (the new file carries WÎHKWÊNTÔWIN
#     natively at id 1151; stale OLIVER id 1150 is retired from source, so the
#     old display-name override is no longer needed for that case).
#   - EVERGREEN (ID 2270) is hard-coded as its own state — Edmonton's largest
#     manufactured-home community (diagnostic in YEAR_DRIFT_FINDINGS.md §3.4).
#   - DUPLICATE-ID GUARD: after the join, the script hard-stops if any polygon
#     carries two aggregate rows (one-feature-per-polygon is required for the
#     frontend's promoteId). Added 2026-06-17 after the City's boundary merge of
#     Heritage Valley surfaced a silent fan-out; the structural merge fix lives
#     in 07 (name-merge contract), this guard is the backstop.
#   - Coordinates rounded to 6 dp (~10 cm) to trim file size; no topology
#     simplification (407 polygons stays ~2 MB).
# ============================================================

# --- Setup --------------------------------------------------
library(tidyverse)
library(sf)
library(scales)

dir.create("output", showWarnings = FALSE, recursive = TRUE)


# --- Path config --------------------------------------------
# New 2026 boundary source: City of Edmonton Neighbourhoods CSV (65fr-66s6),
# 407 polygons, WKT geometry in the "Geometry Multipolygon" column, WGS84.
# Lives in _shared so every section joins to the same canonical geometry.
# Replaces the Jan-2023 EDM_neighborhood_boundary shapefile (402 polygons).
boundary_path <- "/Users/kaustubhchati/Desktop/RA/aref_property_assessment/pipeline/shared/data/City_of_Edmonton_-_Neighbourhoods_20260616.csv"
file.exists(boundary_path)                       # TRUE or fix the path
names(read_csv(boundary_path, n_max = 0))        # confirm "Geometry Multipolygon" present
if (!file.exists(boundary_path)) {
  stop("Boundary CSV not found at: ", boundary_path,
       "\n  Expected the City Neighbourhoods CSV in pipeline/_shared/data/neighbourhoods/.")
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
    suppressed                    = col_logical(),
    yoy_pct_change                = col_double()
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


# --- Load boundary CSV + build sf from WKT ------------------
# read_csv then st_as_sf on the WKT column. crs=4326 because the City serves
# lon/lat WGS84 (same CRS the assessment Latitude/Longitude use). No shapefile
# sidecars needed — the geometry is inline WKT text.
boundary_raw <- read_csv(boundary_path, show_col_types = FALSE)

nbhd_polygons <- boundary_raw |>
  st_as_sf(wkt = "Geometry Multipolygon", crs = 4326) |>
  # Join key: Neighbourhood Number (numeric) -> character, matching our
  # character-keyed Neighbourhood ID. Same ID-join contract as the shapefile's
  # `neighbourh`; only the column name changed.
  mutate(`Neighbourhood ID` = as.character(as.integer(`Neighbourhood Number`)))
sum(is.na(nbhd_polygons$`Neighbourhood ID`))   # expect 0
nrow(nbhd_polygons)                             # expect 407
cat(sprintf("Loaded boundary CSV: %s polygons, CRS = %s\n",
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
    display_name = coalesce(Neighbourhood, `Neighbourhood Name`)
  )

state_summary <- joined |>
  st_drop_geometry() |>
  count(polygon_state, sort = TRUE)

cat("\n--- Polygon state breakdown ---\n")
print(state_summary)

#duplicate handler 
dup_ids <- joined$`Neighbourhood ID`[duplicated(joined$`Neighbourhood ID`)]
if (length(dup_ids) > 0) {
  print(joined |> st_drop_geometry() |> filter(`Neighbourhood ID` %in% dup_ids))
  stop("Duplicate Neighbourhood IDs after join: ", paste(unique(dup_ids), collapse = ", "))
}
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
  )


# --- Round coordinates to 6 decimal places ------------------
# Reduces file size meaningfully without visible precision loss
# at any zoom MapLibre will use for a city-wide choropleth.
geojson_ready <- st_set_precision(geojson_ready, 1e6) |>
  st_make_valid()


# --- Write GeoJSON ------------------------------------------
geojson_path <- "output/neighbourhoods_2026_new_boundaries.geojson"
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
    st_drop_geometry() |>
    filter(polygon_state == "aggregated") |>
    pull(median_assessvalue)
  
  cat(sprintf("\nChoropleth colour-scale domain (median_assessvalue):\n"))
  cat(sprintf("  Min: $%s\n", comma(round(min(agg_vals, na.rm = TRUE)))))
  cat(sprintf("  Q25: $%s\n", comma(round(quantile(agg_vals, 0.25, na.rm = TRUE)))))
  cat(sprintf("  Med: $%s\n", comma(round(median(agg_vals, na.rm = TRUE)))))
  cat(sprintf("  Q75: $%s\n", comma(round(quantile(agg_vals, 0.75, na.rm = TRUE)))))
  cat(sprintf("  Max: $%s\n", comma(round(max(agg_vals, na.rm = TRUE)))))
}


setdiff(aggregates$`Neighbourhood ID`, nbhd_polygons$`Neighbourhood ID`) |> length()   # 1, the NA
aggregates |> filter(is.na(`Neighbourhood ID`) | `Neighbourhood ID` == "NA")           # see what that NA row holds

aggregates |> filter(`Neighbourhood ID` %in% c("5462","5464"))   # expect 0 rows
joined |> st_drop_geometry() |>
  filter(`Neighbourhood ID` %in% c("5462","5464")) |>
  select(`Neighbourhood ID`, `Neighbourhood Name`, polygon_state, n_properties)
joined |> st_drop_geometry() |>
  filter(`Neighbourhood ID` %in% c("1150","1151")) |>
  select(`Neighbourhood ID`, `Neighbourhood Name`, display_name, polygon_state)
