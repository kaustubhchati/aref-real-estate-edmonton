# ============================================================
# 01c_residential_units_scope.R   (EDA — NOT pipeline)
#
# Settled EDA record of the RESIDENTIAL DWELLING-UNITS scope decision for the
# Permit Neighbourhoods rescope. Reads top-to-bottom as how the scope was
# settled: the full unit-bearing building-type roster, the three ambiguous edge
# types, the Mixed Use deep look, the demolition definition, the explicit
# residential classification, and the coverage it captures (overall + per year).
#
# This is EXPLORATORY. It writes no outputs, is not in the runner chain, and is
# not a pipeline rule. It is the readable justification behind whatever the
# production aggregate (03) eventually encodes. Run it by hand against the
# newest snapshot in data/raw/ to re-confirm the decision on a refresh.
#
# LOCKED METRIC DEFINITIONS (StatCan-style gross series, never a single net):
#   units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0])          dwellings added
#   units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0
#                              & WORK_TYPE == "(99) Demolition"]))  dwellings lost
#   units_net_signed  = sum(UNITS_ADDED)                           shown for the gap only
# units_demolished qualifies on the demolition work-type ON PURPOSE: 358
# non-demolition negative rows exist and are EXCLUDED; with the qualifier the
# demolished total reconciles to the City's -5,924 (verified on the 20260621
# snapshot). The bare-negative sum (6,329) overstates it.
#
# Match edge types on the FULL BUILDING_TYPE string, never the bare code:
# "Mixed Use (522)" and "Office Complex (522)" collide on 522.
# ============================================================

library(tidyverse)
library(scales)

# --- Load local dev snapshot --------------------------------
# Operator places the bulk General Building Permits CSV in data/raw/ before
# running (manual download — see 02_build_permits.R for the Socrata source).
# Discover the newest snapshot the same way 03 does, so no path is hardcoded.
raw <- list.files(
  "data/raw", pattern = "^General_Building_Permits_.*\\.csv$",
  full.names = TRUE
)
if (length(raw) == 0) stop("No raw permits CSV in data/raw/")
permits_path <- sort(raw, decreasing = TRUE)[1]
cat("Using snapshot:", permits_path, "\n")

permits_raw <- read_csv(permits_path, show_col_types = FALSE)

# --- Column guard: every column the diagnostics below read ----
# Fail loud if a future snapshot drops/renames one, rather than erroring deep in
# a block with a cryptic message.
required_cols <- c("BUILDING_TYPE", "WORK_TYPE", "UNITS_ADDED", "JOB_CATEGORY",
                   "YEAR", "NEIGHBOURHOOD", "FLOOR_AREA", "CONSTRUCTION_VALUE",
                   "JOB_DESCRIPTION")
missing_cols <- setdiff(required_cols, names(permits_raw))
if (length(missing_cols) > 0) {
  stop("Snapshot is missing required columns: ",
       paste(missing_cols, collapse = ", "))
}


# ============================================================
# 1. Full BUILDING_TYPE roster — StatCan-split (added / demolished / net)
# ============================================================
# The universe the residential-universe ruling is made against. A type is
# relevant to the units metric if EITHER gross-added OR demolished is non-zero
# (a net-only filter could hide a type whose adds and demolitions cancel).
permits_raw |>
  group_by(BUILDING_TYPE) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    units_net_signed  = sum(UNITS_ADDED, na.rm = TRUE),
    .groups = "drop"
  ) |>
  filter(units_added_gross != 0 | units_demolished != 0) |>
  arrange(desc(units_added_gross)) |>
  print(n = Inf)


# ============================================================
# 2. The three edge types — StatCan-split
# ============================================================
# Mixed Use, Malls/Office-Retail, and Office Complex are the ambiguous types:
# do they carry dwellings worth folding into the residential bucket, and do they
# also carry demolitions? Match on the full string (522 code collision).
edge_types <- c(
  "Mixed Use (522)",
  "Malls, Office/Retail (512)",
  "Office Complex (522)"
)

permits_raw |>
  filter(BUILDING_TYPE %in% edge_types) |>
  group_by(BUILDING_TYPE) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    units_net_signed  = sum(UNITS_ADDED, na.rm = TRUE),
    .groups = "drop"
  ) |>
  arrange(desc(units_added_gross)) |>
  print(n = Inf)


# ============================================================
# 3. Mixed Use (522) deep look
# ============================================================
# THE key question: can the dwelling portion of Mixed Use be routed to
# residential? Two views — by JOB_CATEGORY (where the units/demolitions live)
# and a row-level recovery view (is the residential unit count recoverable per
# permit?).
mixed_use <- permits_raw |>
  filter(BUILDING_TYPE == "Mixed Use (522)")

cat("\n=== Mixed Use (522): rows =", nrow(mixed_use),
    "| net units_added =", sum(mixed_use$UNITS_ADDED, na.rm = TRUE), "\n")

# --- 3a. By JOB_CATEGORY, StatCan-split ----------------------
# Shows where the demolitions a net figure would absorb actually live.
mixed_use |>
  group_by(JOB_CATEGORY) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    units_net_signed  = sum(UNITS_ADDED, na.rm = TRUE),
    .groups = "drop"
  ) |>
  arrange(desc(units_added_gross)) |>
  print(n = Inf)

# --- 3b. Row-level dwelling-recovery view --------------------
# Inspect the actual rows — units_added vs floor_area vs description — to see
# whether the residential unit count is recoverable per permit (it is not stored
# separately; the whole Mixed Use unit count is dwellings, recorded under
# Commercial Final).
mixed_use |>
  select(YEAR, NEIGHBOURHOOD, JOB_CATEGORY, WORK_TYPE,
         UNITS_ADDED, FLOOR_AREA, CONSTRUCTION_VALUE, JOB_DESCRIPTION) |>
  arrange(desc(UNITS_ADDED)) |>
  print(n = 30)


# ============================================================
# 4. Demolition cross-tab (WORK_TYPE x sign) + demolition-permit summary
# ============================================================
# Establishes the units_demolished definition. The cross-tab shows that negative
# UNITS_ADDED concentrates in "(99) Demolition"; the rest are 358 non-demolition
# negative rows (corrections / reclassifications) that the LOCKED definition
# excludes. Qualifying on the demolition work-type makes the total reconcile to
# the City's -5,924; the bare-negative sum (6,329) does not.

# --- 4a. WORK_TYPE x sign — where do negatives concentrate? --
permits_raw |>
  filter(!is.na(UNITS_ADDED), UNITS_ADDED != 0) |>
  mutate(sign = if_else(UNITS_ADDED < 0,
                        "negative (units lost)", "positive (units added)")) |>
  group_by(WORK_TYPE, sign) |>
  summarise(n = n(), units = sum(UNITS_ADDED, na.rm = TRUE), .groups = "drop") |>
  arrange(desc(abs(units))) |>
  print(n = 30)

# --- 4b. Negative rows: demolition vs non-demolition ---------
# Splits all negative rows by whether they are the demolition work-type. The
# FALSE row is the 358 excluded non-demolition negatives.
permits_raw |>
  filter(!is.na(UNITS_ADDED), UNITS_ADDED < 0) |>
  mutate(is_demolition = WORK_TYPE == "(99) Demolition") |>
  group_by(is_demolition) |>
  summarise(n_rows = n(), units = sum(UNITS_ADDED, na.rm = TRUE),
            .groups = "drop") |>
  print(n = Inf)

# --- 4c. The LOCKED demolished total -------------------------
# units_demolished = abs(sum of negative UNITS_ADDED on demolition permits).
# Expected: 4,132 demolition-permit rows, -5,924 units (abs 5,924).
demolition_summary <- permits_raw |>
  filter(WORK_TYPE == "(99) Demolition", UNITS_ADDED < 0) |>
  summarise(
    n_demolition_permits = n(),
    units_demolished     = abs(sum(UNITS_ADDED, na.rm = TRUE))
  )
cat("\n=== LOCKED units_demolished (work-type qualified) ===\n")
print(demolition_summary)


# ============================================================
# 5. Custom residential classification (BUILDING_TYPE -> res/com)
# ============================================================
# Builds the residential/commercial classification as an EXPLICIT mapping from
# full BUILDING_TYPE string -> class. Mapping is the spine on purpose: the
# roster has label variants of the same type (Apartments/Apartment, Row
# House/Row Houses, misspellings, code collisions on 110/210/522) and several
# variants carry ONLY demolitions. A canonical-string whitelist would silently
# drop those; an explicit per-string table does not.
#
# Rulings applied (edit residential_types to change any):
#   - Mixed Use (522)        -> residential  (all units are dwellings, recorded
#                               under Commercial Final; no separate dwelling
#                               sub-count, so fold-in is exact)
#   - Office Complex (522)   -> commercial   (units are office; ~0.3%)
#   - Malls/Office-Retail    -> commercial   (1 unit; noise)
#   - Collective dwellings   -> commercial   (Hotels/Motels/Nursing Homes/
#     (StatCan excl.)          Other Accommodation: not dwelling units)
# All label variants of a residential type are listed individually.

# --- Classification table: every dwelling-bearing string -> residential ---
# Anything in permits_raw NOT listed here is treated as commercial.
residential_types <- c(
  # Single detached + variants/codes
  "Single Detached House (110)", "Single House (110)",
  "Single Detached Condo (115)", "Backyard House (110)",
  # Apartments + variants
  "Apartments (310)", "Apartment (310)",
  "Apartment Condos (315)",
  # Row housing + variants
  "Row House (330)", "Row Houses (330)",
  "Row House Condo (335)", "Row House Condos (335)",
  # Semi-detached / duplex + variants
  "Semi-Detached House (210)", "Semi Detached House (210)",
  "Semi Detached House", "Semi-Detached Condo (215)", "Duplex (210)",
  # Manufactured
  "Mobile Home (130)",
  # Mixed use (folded in per ruling)
  "Mixed Use (522)"
)

permits_class <- permits_raw |>
  mutate(
    res_class = if_else(BUILDING_TYPE %in% residential_types,
                        "residential", "commercial")
  )

# --- REFRESH GUARD: stop if a future year brings an unmapped dwelling type --
# Any BUILDING_TYPE NOT in residential_types is treated commercial. If such a
# type carries units, it may be a new label variant that should be residential.
# Surface them so the ruling is explicit, never silent.
unmapped_with_units <- permits_class |>
  filter(res_class == "commercial") |>
  group_by(BUILDING_TYPE) |>
  summarise(
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    .groups = "drop"
  ) |>
  filter(units_added_gross != 0 | units_demolished != 0) |>
  arrange(desc(units_added_gross))

cat("\n=== COMMERCIAL types that still carry units (review these) ===\n")
print(unmapped_with_units, n = Inf)


# ============================================================
# 6. Coverage split — residential vs commercial (n_permits, units, pcts)
# ============================================================
# What share of permits, units added, and units demolished does the custom
# residential filter capture?
split_summary <- permits_class |>
  group_by(res_class) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    .groups = "drop"
  ) |>
  mutate(
    pct_permits    = percent(n_permits / sum(n_permits), accuracy = 0.1),
    pct_added      = percent(units_added_gross / sum(units_added_gross), accuracy = 0.1),
    pct_demolished = percent(units_demolished / sum(units_demolished), accuracy = 0.1)
  )

cat("\n=== COVERAGE SPLIT: residential vs commercial ===\n")
print(split_summary, n = Inf)

# --- 6a. The residential bucket, broken out by type ----------
# What's actually inside the residential category, so membership is auditable.
# Sums here should reconcile to the residential row above.
cat("\n=== RESIDENTIAL bucket contents, by type ===\n")
permits_class |>
  filter(res_class == "residential") |>
  group_by(BUILDING_TYPE) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    .groups = "drop"
  ) |>
  arrange(desc(units_added_gross)) |>
  print(n = Inf)

# --- 6b. Residential totals — the headline numbers -----------
cat("\n=== RESIDENTIAL totals (these are the metric numbers) ===\n")
permits_class |>
  filter(res_class == "residential") |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE))
  ) |>
  print()


# ============================================================
# 7. Per-year split — residential vs commercial, added / demolished
# ============================================================
# Final coverage check before committing residential-only units. Confirms the
# split holds across YEARS, not just in aggregate. Watch for any year where
# commercial's share of units_added_gross spikes — a single large
# mixed-use-miscoded or institutional project could distort one year.
# (Uses permits_class from section 5.)
per_year_split <- permits_class |>
  group_by(YEAR, res_class) |>
  summarise(
    n_permits         = n(),
    units_added_gross = sum(UNITS_ADDED[UNITS_ADDED > 0], na.rm = TRUE),
    units_demolished  = abs(sum(UNITS_ADDED[UNITS_ADDED < 0], na.rm = TRUE)),
    .groups = "drop"
  )

# Long view: one row per year per class (includes per-year permit counts)
cat("\n=== PER-YEAR, LONG (year x class) ===\n")
per_year_split |>
  arrange(YEAR, res_class) |>
  print(n = Inf)

# Wide view: residential vs commercial side by side, with the commercial share
# of added units (the number that justifies dropping it)
cat("\n=== PER-YEAR, WIDE (commercial share of added units) ===\n")
per_year_split |>
  pivot_wider(
    names_from  = res_class,
    values_from = c(n_permits, units_added_gross, units_demolished),
    values_fill = 0
  ) |>
  mutate(
    comm_pct_added = percent(
      units_added_gross_commercial /
        (units_added_gross_residential + units_added_gross_commercial),
      accuracy = 0.1
    )
  ) |>
  arrange(YEAR) |>
  select(
    YEAR,
    res_added  = units_added_gross_residential,
    comm_added = units_added_gross_commercial,
    comm_pct_added,
    res_demo   = units_demolished_residential,
    comm_demo  = units_demolished_commercial
  ) |>
  print(n = Inf)

# Residential-only, per year — the actual published series
cat("\n=== RESIDENTIAL-ONLY per year (the metric) ===\n")
per_year_split |>
  filter(res_class == "residential") |>
  select(YEAR, n_permits, units_added_gross, units_demolished) |>
  arrange(YEAR) |>
  print(n = Inf)

