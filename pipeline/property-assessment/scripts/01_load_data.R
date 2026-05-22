# ============================================================
# 01_load_data.R
# Pull Edmonton property assessment data from the open data portal
# and do a first inspection.
# ============================================================

# --- Packages ------------------------------------------------
library(sf)         # spatial geometry (sf objects, projections, joins)
library(spdep)      # spatial autocorrelation, weights matrices, Moran's I / LISA
library(tidyverse)  # dplyr, ggplot2, readr, etc.
library(scales)     # axis formatting (dollar(), comma(), log scales)
library(ggplot2)
library(ggthemes)
source("scripts/00_theme.R")
# --- Data sources --------------------------------------------
# Edmonton Open Data Portal — Property Assessment, current calendar year.
# Dataset ID q7d6-ambg is permanent; the URL serves the latest snapshot
# the City has published (refreshed roughly weekly during assessment season).
url_assess_current <- "https://data.edmonton.ca/api/views/q7d6-ambg/rows.csv?accessType=DOWNLOAD"


# --- Load ----------------------------------------------------
# read_csv() streams the file directly from the URL into memory.
# Expect ~400k rows. First run takes 10-30 seconds depending on connection.
assess_raw <- read_csv(url_assess_current, show_col_types = FALSE)


# --- First look ----------------------------------------------
# How big is it?
dim(assess_raw)

# What columns did we get, and what type did readr guess for each?
glimpse(assess_raw)

# Peek at the first few rows
#if(interactive())view(assess_raw)
# --- Coordinate counts (canonical) --------------------------
coord_counts <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_coord")

stopifnot(nrow(coord_counts) == n_distinct(coord_counts$Latitude,
                                           coord_counts$Longitude))
# Top 10 most-shared coordinates
head(coord_counts, 10)

# Distribution of how many rows-per-coordinate
coord_counts |>
  count(n_at_coord) |>
  arrange(desc(n))
# --- Visualize the rows-per-coordinate distribution ---------
# Each point is a unique (lat, lon). x = how many properties share it.
# y on log scale because the distribution is heavy-tailed.
dev.new()

p_coord_dist <- coord_counts |>
  count(n_at_coord, name = "n_coords") |>
  ggplot(aes(x = n_at_coord, y = n_coords)) +
  geom_segment(aes(xend = n_at_coord, yend = 1), colour = kc_pal["blue"], linewidth = 0.6) +
  geom_point(colour = kc_pal["blue"], size = 1.6)  +
  scale_x_continuous(
    trans  = "log10",
    breaks = c(1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000),
    labels = scales::comma,
    expand = expansion(mult = c(0.02, 0.02))
  ) +
  scale_y_continuous(
    trans  = "log10",
    breaks = c(1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000),
    labels = scales::comma,
    expand = expansion(mult = c(0, 0.05))
  ) +
  labs(
    title    = "Most coordinates have one row; condo towers cluster up to 1,290",
    subtitle = "Edmonton property assessment 2026, 439,769 rows",
    caption  = "Source: City of Edmonton Open Data Portal.",
    x        = "No. of Titles (Rows) within one coordinate(location)",
    y        = "Number of distinct coordinates(locations) with same title count"
  ) +
  theme_kc()

print(p_coord_dist)

dir.create("output/figures", showWarnings = FALSE, recursive = TRUE)
ggsave(
  "output/figures/01_coord_count_distribution.png",
  plot = p_coord_dist,
  width = 9, height = 5.5, dpi = 150,
  bg = "white"
)
# --- Engineer the rows-at-coordinate feature -----------------
# Join the coordinate counts back to the main table so every row
# carries its own n_at_coord. This is the first model feature
# derived from spatial context.
# What kinds of buildings sit at the highest-N coordinates?
coord_counts |>
  arrange(desc(n_at_coord)) |>
  slice_head(n = 20) |>
  left_join(
    assess_raw |>
      select(Latitude, Longitude, Neighbourhood, `Assessed Value`) |>
      group_by(Latitude, Longitude) |>
      summarise(
        neighbourhood = first(Neighbourhood),
        median_value  = median(`Assessed Value`, na.rm = TRUE),
        .groups = "drop"
      ),
    by = c("Latitude", "Longitude"))




# --- Parkade signature (rebuilt cleanly) --------------------
# For each high-n coordinate, compute the top-3-value coverage.
# Done in two steps: first compute the values per coordinate as a
# scalar summary (no list columns), then deduplicate defensively.

parkade_signature <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  inner_join(coord_counts |> filter(n_at_coord >= 20),
             by = c("Latitude", "Longitude")) |>
  group_by(Latitude, Longitude, n_at_coord) |>
  summarise(
    top3_pct = {
      tbl <- sort(table(`Assessed Value`), decreasing = TRUE)
      sum(tbl[1:min(3, length(tbl))]) / n_at_coord[1]
    },
    top1_value = as.numeric(names(sort(table(`Assessed Value`),
                                       decreasing = TRUE))[1]),
    top2_value = as.numeric(names(sort(table(`Assessed Value`),
                                       decreasing = TRUE))[2]),
    top3_value = as.numeric(names(sort(table(`Assessed Value`),
                                       decreasing = TRUE))[3]),
    .groups = "drop"
  ) |>
  distinct(Latitude, Longitude, .keep_all = TRUE)

stopifnot(nrow(parkade_signature) == n_distinct(parkade_signature$Latitude,
                                                parkade_signature$Longitude))


# --- Filter to confirmed parkades ---------------------------
parkade_coords <- parkade_signature |>
  filter(
    top3_pct >= 0.80,            # values are schedule-like (uniform)
    top1_value <= 80000          # AND the values are parking-sized, not unit-sized
  )

# --- Neighbourhood lookup -----------------------------------
coord_neighbourhood <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  distinct(Latitude, Longitude, Neighbourhood) |>
  group_by(Latitude, Longitude) |>
  slice(1) |>
  ungroup() |>
  rename(neighbourhood = Neighbourhood)


# --- Diagnostic ---------------------------------------------
parkade_coords |>
  arrange(desc(n_at_coord)) |>
  slice_head(n = 20) |>
  left_join(coord_neighbourhood, by = c("Latitude", "Longitude")) |>
  mutate(top_values = paste(scales::dollar(top1_value),
                            scales::dollar(top2_value),
                            scales::dollar(top3_value),
                            sep = ", ")) |>
  select(neighbourhood, n_at_coord, top3_pct, top_values)




# --- Detect parking (coordinate, value) pairs directly ------
# A (coord, value) pair is parking IF:
#  - the value is in parking range (<= $80k)
#  - it repeats >= 10 times at this coord
#  - the coord has >= 20 total rows
# No coordinate-level dominance test needed.

parking_values_per_coord <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  inner_join(coord_counts |> filter(n_at_coord >= 20),
             by = c("Latitude", "Longitude")) |>
  count(Latitude, Longitude, `Assessed Value`, name = "value_count") |>
  filter(`Assessed Value` <= 80000,
         value_count >= 10)


# --- Flag rows -----------------------------------------------
assess_with_flag <- assess_raw |>
  left_join(parking_values_per_coord |>
              transmute(Latitude, Longitude, `Assessed Value`,
                        is_parking = TRUE),
            by = c("Latitude", "Longitude", "Assessed Value")) |>
  mutate(is_parking = !is.na(is_parking))


# --- Diagnostic 1: overall flagged fraction ----------------
assess_with_flag |>
  count(is_parking) |>
  mutate(pct = scales::percent(n / sum(n), accuracy = 0.01))


# --- Diagnostic 2: top 20 flagged (coord, value) pairs -----
parking_values_per_coord |>
  arrange(desc(value_count)) |>
  slice_head(n = 20) |>
  left_join(coord_neighbourhood, by = c("Latitude", "Longitude")) |>
  select(neighbourhood, `Assessed Value`, value_count)


# --- Diagnostic 3: example coord, what got flagged vs not --
# Pick the biggest parkade coordinate and see what survived
big_parkade <- parking_values_per_coord |>
  arrange(desc(value_count)) |>
  slice_head(n = 1)

assess_with_flag |>
  semi_join(big_parkade, by = c("Latitude", "Longitude")) |>
  count(`Assessed Value`, is_parking, name = "n") |>
  arrange(desc(n)) |>
  slice_head(n = 15)
# --- Persist parking-cleaned frame for downstream scripts ---
dir.create("data/processed", showWarnings = FALSE, recursive = TRUE)

assess_clean <- assess_with_flag |>
  filter(!is_parking) |>
  select(-is_parking)

stopifnot(nrow(assess_clean) == nrow(assess_raw) - sum(assess_with_flag$is_parking))


manual_checks <- tribble(
  ~neighbourhood,        ~value,
  "GARNEAU",              14500,
  "QUEEN MARY PARK",        500,
  "WESTMOUNT",             1000,
  "PEMBINA",               7500,
  "DOWNTOWN",             18500,
  "EMPIRE PARK",            500
)

# Look them up in the flagged set
parking_values_per_coord |>
  left_join(coord_neighbourhood, by = c("Latitude", "Longitude")) |>
  inner_join(manual_checks,
             by = c("neighbourhood", "Assessed Value" = "value")) |>
  arrange(neighbourhood, `Assessed Value`)

assess_raw |>
  filter(`Assessed Value` == 500, !is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_500") |>
  left_join(coord_counts, by = c("Latitude", "Longitude")) |>
  left_join(coord_neighbourhood, by = c("Latitude", "Longitude")) |>
  arrange(desc(n_at_500)) |>
  slice_head(n = 20)


# Sample 10 flagged rows from different parkade coordinates
flagged_sample <- assess_with_flag |>
  filter(is_parking) |>
  group_by(Latitude, Longitude) |>
  slice_head(n = 1) |>             # one row per coordinate
  ungroup() |>
  left_join(coord_neighbourhood, by = c("Latitude", "Longitude")) |>
  arrange(desc(`Assessed Value`)) |>  # mix of price tiers
  slice_head(n = 10) |>
  select(neighbourhood, `Account Number`, Suite, `House Number`,
         `Street Name`, `Assessed Value`,
         `Assessment Class 1`, `Assessment Class % 1`)

flagged_sample
write_csv(assess_clean, "data/processed/assess_2026_no_parking.csv")
cat("Wrote: data/processed/assess_2026_no_parking.csv —",
    nrow(assess_clean), "rows\n")

# Also persist the pre-filter frame so script 02 can run standalone.
# assess_with_flag is assess_raw + is_parking boolean; needed for parking
# rule validation which must see both flagged and unflagged rows.
write_csv(assess_with_flag, "data/processed/assess_2026_with_flags.csv")
cat("Wrote: data/processed/assess_2026_with_flags.csv —",
    nrow(assess_with_flag), "rows\n")
