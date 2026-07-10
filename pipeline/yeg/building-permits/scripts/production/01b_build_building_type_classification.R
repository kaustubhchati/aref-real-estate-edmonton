# ============================================================
# 01b_build_building_type_classification.R   (building-permits)
# OUT-OF-BAND re-curation tool (like 01a), NOT in the runner chain.
#
# Builds the committed BUILDING_TYPE -> residential / non_residential
# classification table that 02's fail-closed drift stop reads. It is the
# BUILDING_TYPE analogue of 01a's JOB_CATEGORY grouping: 02 halts on any
# permit BUILDING_TYPE string absent from this table (residential OR
# non_residential), so portal drift — a new or renamed type — demands a
# human ruling instead of silently leaving the residential dwelling universe.
#
# Disposition is on the FULL string, NEVER the bare code: the 522 code
# collides ("Mixed Use (522)" residential vs "Office Complex (522)" not).
#
# WHEN 02 STOPS on a new/renamed string: classify it below (residential or
# non_residential), re-run this script, commit the new dated CSV, re-run 02.
#
# Output:
#   data/reference/building_type_classification_<YYYYMMDD>.csv
#     columns: building_type, disposition, code, source, date_curated, curated_by
#
# Run context: from the section dir (pipeline/yeg/building-permits/),
#   e.g. Rscript scripts/production/01b_build_building_type_classification.R
# ============================================================

library(tidyverse)
source(rprojroot::find_root_file("_bootstrap.R",
       criterion = rprojroot::has_file(".aref_root")))

# --- Residential dwelling universe (the historical whitelist, 1:1) ----------
residential <- c(
  "Single Detached House (110)", "Single House (110)", "Single Detached Condo (115)",
  "Backyard House (110)", "Apartments (310)", "Apartment (310)", "Apartment Condos (315)",
  "Row House (330)", "Row Houses (330)", "Row House Condo (335)", "Row House Condos (335)",
  "Semi-Detached House (210)", "Semi Detached House (210)", "Semi Detached House",
  "Semi-Detached Condo (215)", "Duplex (210)", "Mobile Home (130)", "Mixed Use (522)"
)

# --- Non-residential structure / use types (excluded from the dwelling universe) ---
# The three "* Condo (215/315)" residential-code variants sit here in THIS neutral
# table (byte-neutral: they stay excluded exactly as the old whitelist excluded
# them). A follow-on reclass commit moves those three to `residential`.
non_residential <- c(
  "Animal and Plant Services (410)", "Apartment Condo (315)", "Carport (090)",
  "Clinics, Health Units (642)", "Communication Buildings (470)", "Convention Centres (536)",
  "Day Cares, Nursing Homes (650)", "Detached Deck (020)", "Detached Garage (010)",
  "Detached Greenhouse (030)", "Detached Misc. Structure (090)", "Detached Shed (040)",
  "Duplex Condo (215)", "Elementary Schools (620)", "Engineering (490)",
  "Funeral Homes (590)", "Gazebo (090)", "Government Legislative/Admin (610)",
  "Greenhouse (030)", "Hoarding (910)", "Hospitals (640)", "Hotels (530)",
  "Indoor Recreational Buildings (560)", "Laboratory/Research Centres (580)",
  "Law Enforcement/Emergency Svcs. (612)", "Libraries/Museums/Art Galleries (630)",
  "Maintenance Buildings incl Hangars (450)", "Malls, Office/Retail (512)",
  "Manufacturing Buildings (430)", "Motels (532)", "Office Buildings (520)",
  "Office Complex (522)", "Other Accommodation (534)", "Other Accomodation (534)",
  "Outdoor Recreational Buildings (562)", "Parkade (490)", "Play Structure (090)",
  "Post-secondary Institutions (624)", "Religious Buildings (660)",
  "Restaurants and Bars (540)", "Retail - Motor Vehicle (570)", "Retail and Shops (510)",
  "Secondary Schools (622)", "Semi Detached Condo (215)",
  "Service Stations, Repair Garages (572)", "Shed (040)",
  "Storage Buildings, Warehouses (460)", "Temporary Structure (099)",
  "Temporary Structures (999)", "Theatre and Performing Arts Ctrs (550)",
  "Transportation Terminals (440)", "Universities (626)", "Utility Buildings (480)"
)

classification <- bind_rows(
  tibble(building_type = residential,     disposition = "residential"),
  tibble(building_type = non_residential, disposition = "non_residential")
) |>
  mutate(
    code         = str_match(building_type, "\\((\\d+)\\)")[, 2],
    source       = "General Building Permits (24uj-dj8v): distinct BUILDING_TYPE strings, curated",
    date_curated = format(Sys.Date(), "%Y-%m-%d"),
    curated_by   = "KC"
  )

stopifnot(anyDuplicated(classification$building_type) == 0)

dir.create("data/reference", showWarnings = FALSE, recursive = TRUE)
out_path <- sprintf("data/reference/building_type_classification_%s.csv",
                    format(Sys.Date(), "%Y%m%d"))
write_csv(classification, out_path)

cat("Wrote", out_path, "\n")
cat(sprintf("  %d building types: %d residential / %d non_residential\n",
            nrow(classification),
            sum(classification$disposition == "residential"),
            sum(classification$disposition == "non_residential")))
