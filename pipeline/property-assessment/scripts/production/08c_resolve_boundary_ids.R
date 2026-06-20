# ============================================================
# 08c_resolve_boundary_ids.R
# AREF — Resolve IDs 5462 / 5464 against new boundary file
# Author: Kaustubh Chati (Research Assistant, UAlberta Economics)
#
# PURPOSE: The 08b rescue table references IDs 5462 (CHAPPELLE AREA)
#   and 5464 (HERITAGE VALLEY TOWN CENTRE AREA). The new boundary file
#   (65fr-66s6, 407 rows, WKT geometry) supersedes the Jan-2023 shapefile.
#   This script checks whether those IDs exist in the new file, finds
#   their replacements if not, and prints the decision for KC to action
#   before running the historical GeoJSON pipeline.
#
# INPUTS:
#   City_of_Edmonton__Neighbourhoods_20260616.csv  — new boundary file
#   data/reference/neighbourhood_name_mappings_20260519.csv — existing rescue table
#
# OUTPUT (console only — no file written):
#   Clear GO / NO-GO verdict with replacement IDs or drop recommendation
# ============================================================

library(tidyverse)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# ============================================================
# 1. Load new boundary file
# ============================================================

boundary_path <- shared_path("data", "City_of_Edmonton_-_Neighbourhoods_20260616.csv")

if (!file.exists(boundary_path)) {
  stop(paste(
    "New boundary file not found at:", boundary_path,
    "\nDownload from: https://data.edmonton.ca/d/65fr-66s6"
  ))
}

boundary <- read_csv(boundary_path, show_col_types = FALSE)

cat("New boundary file rows: ", nrow(boundary), "\n")
cat("Columns: ", paste(names(boundary), collapse = ", "), "\n\n")

# ============================================================
# 2. Check IDs 5462 and 5464 directly
# ============================================================

ids_to_check <- c(5462L, 5464L)
names_to_check <- c("CHAPPELLE AREA", "HERITAGE VALLEY TOWN CENTRE AREA")

cat("--- Direct ID lookup ---\n")
for (i in seq_along(ids_to_check)) {
  hit <- boundary |> filter(`Neighbourhood Number` == ids_to_check[i])
  if (nrow(hit) > 0) {
    cat(sprintf("ID %d (%s): FOUND — '%s'\n",
                ids_to_check[i], names_to_check[i],
                hit$`Neighbourhood Name`[1]))
  } else {
    cat(sprintf("ID %d (%s): NOT FOUND in new boundary file\n",
                ids_to_check[i], names_to_check[i]))
  }
}

# ============================================================
# 3. Name-based search — find nearest match in new file
#    for any ID that was not found directly
# ============================================================

cat("\n--- Name-based search for missing IDs ---\n")
for (nm in names_to_check) {
  
  # Exact match first
  exact <- boundary |>
    filter(str_to_upper(`Neighbourhood Name`) == nm)
  
  if (nrow(exact) > 0) {
    cat(sprintf("'%s' → exact name match: ID %d\n",
                nm, exact$`Neighbourhood Number`[1]))
    next
  }
  
  # Partial match — first word of the name
  first_word <- str_split(nm, " ")[[1]][1]
  partial <- boundary |>
    filter(str_detect(str_to_upper(`Neighbourhood Name`),
                      fixed(first_word)))
  
  if (nrow(partial) > 0) {
    cat(sprintf("'%s' → partial matches on '%s':\n", nm, first_word))
    partial |>
      select(`Neighbourhood Number`, `Neighbourhood Name`,
             `Descriptive Name`, `Effective Start Date`) |>
      print()
  } else {
    cat(sprintf("'%s' → NO match found. Recommend DROP from rescue table.\n", nm))
  }
}

# ============================================================
# 4. Full boundary file — show all IDs in the 5400–5500 range
#    to understand what replaced the old IDs
# ============================================================

cat("\n--- Boundary IDs in range 5400–5500 ---\n")
boundary |>
  filter(`Neighbourhood Number` >= 5400,
         `Neighbourhood Number` <= 5500) |>
  select(`Neighbourhood Number`, `Neighbourhood Name`,
         `Descriptive Name`, `Effective Start Date`) |>
  arrange(`Neighbourhood Number`) |>
  print(n = 50)

# ============================================================
# 5. Load existing rescue table and show the rows to action
# ============================================================

mapping_path <- "data/reference/neighbourhood_name_mappings_20260519.csv"

if (file.exists(mapping_path)) {
  mapping <- read_csv(mapping_path, show_col_types = FALSE)
  cat("\n--- Rescue table rows referencing 5462 / 5464 ---\n")
  mapping |>
    filter(shapefile_id %in% as.character(ids_to_check)) |>
    print()
} else {
  cat("\nRescue table not found at", mapping_path,
      "— skipping existing mapping check.\n")
}

cat("\n=== DECISION REQUIRED ===\n")
cat("For each ID above:\n")
cat("  - If found with new ID: update shapefile_id in the rescue table\n")
cat("  - If no match at all:   drop the row from the rescue table\n")
cat("  - In both cases: re-date the rescue table filename before R2 runs\n")

# ============================================================
# ACTION: Update rescue table IDs 5462 → 5471, 5464 → 5472
# Run once, then proceed to 08d
# ============================================================

library(tidyverse)

old_path  <- "data/reference/neighbourhood_name_mappings_20260519.csv"
new_path  <- "data/reference/neighbourhood_name_mappings_20260617.csv"

mapping <- read_csv(old_path, show_col_types = FALSE)

# Verify the two rows before editing
cat("--- Rows to update ---\n")
mapping |>
  filter(shapefile_id %in% c(5462, 5464)) |>
  select(shapefile_name, shapefile_id, assessment_name) |>
  print()

# Apply updates
mapping_updated <- mapping |>
  mutate(
    shapefile_id = case_when(
      shapefile_id == 5462 ~ 5471,
      shapefile_id == 5464 ~ 5472,
      TRUE                 ~ shapefile_id
    ),
    shapefile_name = case_when(
      shapefile_id == 5471 ~ "CHAPPELLE",
      shapefile_id == 5472 ~ "HERITAGE VALLEY TOWN CENTRE",
      TRUE                 ~ shapefile_name
    ),
    date_curated = case_when(
      shapefile_id %in% c(5471, 5472) ~ as.Date("2026-06-17"),
      TRUE                             ~ date_curated
    )
  )

# Verify after update
cat("\n--- Updated rows ---\n")
mapping_updated |>
  filter(shapefile_id %in% c(5471, 5472)) |>
  select(shapefile_name, shapefile_id, assessment_name, date_curated) |>
  print()

# Write new dated file — never overwrite old one
write_csv(mapping_updated, new_path)
cat("\nWrote:", new_path, "\n")
cat("Old file preserved:", old_path, "\n")
cat("\nProceed to 08d_hist_aggregate.R\n")

