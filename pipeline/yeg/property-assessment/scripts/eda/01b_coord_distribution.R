# ============================================================
# 01b_coord_distribution.R  (EDA — NOT part of the production load)
# ------------------------------------------------------------
# Reads the SAME raw Edmonton property-assessment snapshot that
# 01_fetch_current.R pulls, and emits the rows-per-coordinate
# distribution figure. This is exploratory output only:
#   writes  output/figures/01_coord_count_distribution.png
#   touches NO data/processed/ artifact and feeds no downstream script.
# Safe to run standalone; running it never affects the production CSVs.
# ============================================================

# --- Packages ------------------------------------------------
library(tidyverse)  # dplyr, ggplot2, readr, etc.
library(scales)     # axis formatting (comma(), log scales)
library(ggthemes)
source(rprojroot::find_root_file("pipeline/yeg/property-assessment/scripts/_common/00_theme.R", criterion = rprojroot::has_file(".aref_root")))

# --- Load (same snapshot as 01_fetch_current.R) ------------------
url_assess_current <- "https://data.edmonton.ca/api/views/q7d6-ambg/rows.csv?accessType=DOWNLOAD"
assess_raw <- read_csv(url_assess_current, show_col_types = FALSE)

# --- Coordinate counts (canonical) --------------------------
coord_counts <- assess_raw |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_coord")

# --- Visualize the rows-per-coordinate distribution ---------
# Each point is a unique (lat, lon). x = how many properties share it.
# y on log scale because the distribution is heavy-tailed.
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
    subtitle = paste0("Edmonton property assessment 2026, ",
                      scales::comma(nrow(assess_raw)), " rows"),
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
