# ============================================================
# 00_theme.R
# Project plotting theme + colour palette.
# Source this at the top of any plotting script:
#   source("scripts/00_theme.R")
# ============================================================

library(ggplot2)
library(ggthemes)

# --- Palette -------------------------------------------------
# Aligned with the building-block decomp palette KC has been using.
# Categorical: use kc_pal[1] for the primary series, [2] for contrast,
# [3] for a third category. Avoid all four at once unless needed.
kc_pal <- c(
  blue   = "#08306b",
  red    = "#cb181d",
  green  = "#238b45",
  amber  = "#cc7a00"
)

# Sequential ramps for continuous fills (e.g. choropleth maps later)
kc_seq_blue  <- c("#deebf7", "#9ecae1", "#4292c6", "#2171b5", "#08306b")
kc_seq_red   <- c("#fee0d2", "#fcae91", "#fb6a4a", "#cb181d", "#67000d")

# --- Theme ---------------------------------------------------
theme_kc <- function(base_size = 12) {
  theme_economist_white(base_size = base_size) +
    theme(
      plot.title    = element_text(face = "bold", margin = margin(b = 4)),
      plot.subtitle = element_text(colour = "darkgrey", size = base_size - 3,
                                   margin = margin(b = 8)),
      plot.caption  = element_text(face = "italic", hjust = 1,
                                   colour = "darkgrey", size = base_size - 4),
      
      axis.text.x  = element_text(face = "bold"),
      axis.ticks   = element_line(),
      axis.title.y = element_text(margin = margin(r = 10)),
      
      panel.grid.minor   = element_blank(),
      panel.grid.major.x = element_blank(),
      
      plot.margin = unit(c(0.5, 1, 0.5, 0.5), "cm"),
      
      legend.position      = "bottom",
      legend.justification = "center",
      legend.spacing.y     = unit(6, "pt")
    )
}
