# ============================================================
# reconcile_neighbourhood_changes.R
#   The Data Centre's single reconciliation home for neighbourhood
#   identity changes (renames, renumbers, string drift, merges,
#   annexation containers).
#
# STATUS: DEV-RUN ONE-SHOT. Lives in scripts/_oneshot/, NOT in
#   _whirl.yaml. It is NOT part of any automated refresh. Run it
#   IFF the City announces a neighbourhood change; it appends the
#   new fact(s) below and writes a NEW dated crosswalk file. The
#   routine chain only CONSUMES the newest crosswalk, never this.
#
# WHAT IT WRITES (and nothing else):
#   data/reference/neighbourhood_crosswalk_<Sys.Date()>.csv
#   Newest-by-filename-sort is authoritative (CLAUDE.md §4.4).
#
# POLICY (locked, do not re-litigate):
#   NEW-ID-WINS. The current City id/name is the survivor; the old
#   id/name is absorbed into it everywhere. Display is current name
#   only, never "(formerly X)". canonical_* = current City values;
#   variant_* = the raw id/string seen in source (assessment) data
#   or in a superseded boundary file.
#
# CROSSWALK SCHEMA (exact column order):
#   canonical_id, canonical_name, variant_id, variant_name, relation,
#   effective_start, effective_end, source, decided_by, date_curated,
#   reviewed_by, notes
#   relation enum: rename | renumber | typo | suffix_drift | alias |
#                  merge | container_exclude
#   effective_* nullable. notes is the ONLY free-text field and is
#   never load-bearing (consumers key on id/relation, never notes).
#
# ------------------------------------------------------------
# DOCUMENTED CHANGES (permanent record; every row below is sourced)
# ------------------------------------------------------------
# RENAME
#   Oliver (1150) -> Wîhkwêntôwin (1151). Council-approved rename.
#     effective_start 2025-01-01. Internal City systems updated
#     2024-10-30 (this is the date the current boundary file 65fr-66s6
#     carries as 1151's Effective Start Date). ETS updated 2024-09-01.
#     Source: Edmonton Naming Committee 2024 Annual Report
#     (eScribe DocumentId 251214). Old id 1150 is ABSENT from the
#     current boundary file (verified 2026-06-22) -> no dead-1150
#     polygon handling is needed; new-id-wins.
#
# RENUMBER (old id absent from current boundary, 1:1 to a new id)
#   Chappelle:                 5462 -> 5471
#   Heritage Valley Town Centre: 5464 -> 5472
#     Both verified: 5462 and 5464 ABSENT, 5471/5472 PRESENT in the
#     current boundary. Carried forward from the spent 08c one-shot
#     migration and the 07 merge contract. The City did not publish a
#     precise effective date for the renumber; effective_start is left
#     blank and the source records the boundary file as the evidence.
#
# MERGE (two source groups collapse onto one City polygon)
#   Heritage Valley Town Centre AREA (NA-id, ~577 props) merges into
#     Heritage Valley Town Centre (5472, ~15 props). Point-in-polygon
#     places 619/620 properties in 5472. Combined aggregates must be
#     RECOMPUTED from the pooled rows before aggregation, never
#     averaged from two summaries (this is why it is a `merge`, not a
#     `suffix_drift`: it changes which rows aggregate together).
#
# SUFFIX_DRIFT (City drops a developing-area "AREA" suffix)
#   Chappelle Area -> Chappelle (5471). Assessment data carries the
#     developing-area "AREA" suffix the City drops at finalization.
#
# TYPO (assessment-side misspelling; canonical per boundary)
#   Rapperswil      -> Rapperswill          (3370)  single-L typo
#   River Valley Windemere -> River Valley Windermere (5405)  missing R
#     (scoped to the River Valley name; distinct from WINDERMERE 5570)
#   Westbrook Estate -> Westbrook Estates    (5540)  singular typo
#
# ALIAS (different valid string, same place; not a misspelling)
#   Anthony Henday Southeast -> Anthony Henday South East (6665)
#     spacing variant; both forms valid, hence alias not typo.
#   Southeast (Annexed) Industrial -> Southeast Industrial (6690)
#     assessment inserts the "(ANNEXED)" parenthetical; canonical 6690
#     carries no parenthetical. Non-residential (industrial) area.
#
# CONTAINER_EXCLUDE (umbrella rows that are NOT real neighbourhoods)
#   8885 Edmonton South Central East
#   8886 Edmonton South East
#   8887 Edmonton South Central
#   8888 Edmonton South West
#     Annexation-container aggregation polygons in the boundary file.
#     They must be DROPPED before the spatial join so they never
#     render as no_data. canonical_* is intentionally blank (there is
#     no survivor; they are excluded, not absorbed).
#
# ------------------------------------------------------------
# RESOLVED — "Lewis Farms Industrial" DROPPED entirely (KC, 2026-06-22)
# ------------------------------------------------------------
#   The legacy rescue table mapped "Lewis Farms Industrial" to id 4485,
#   which is ABSENT from the current boundary (status was
#   `unresolved_target_missing`, i.e. it already resolved to nothing).
#   The 08b header asserts the true target is 4261 "Lewis Farms Business
#   Employment" (a new id, effective 2026-01-15, NON-RESIDENTIAL). That
#   single legacy row was simultaneously a renumber (4485->4261), a
#   rename (Industrial->Business Employment), and a reclassification to a
#   non-residential class the cleaning rules drop anyway. KC's decision:
#   DROP it entirely. It gets NO crosswalk row. Its boundary polygons
#   (4260 Lewis Farms, 4261 Lewis Farms Business Employment) remain
#   no_data by the normal non-residential path; this is correct.
#
# MIGRATION TRACE (proves: migrate, do not invent) — every row in the
#   three legacy mapping CSVs + the merge CSV maps to a crosswalk row:
#     mappings_*  ANTHONY HENDAY        -> row 9  (alias)
#     mappings_*  CHAPPELLE / AREA      -> rows 2 (renumber) + 3 (suffix_drift)
#     mappings_*  HERITAGE VALLEY TC    -> rows 4 (renumber) + 5 (merge)
#     mappings_*  LEWIS FARMS INDUSTRIAL-> DROPPED per KC 2026-06-22 (no row)
#     mappings_*  RAPPERSWIL            -> row 6  (typo)
#     mappings_*  RIVER VALLEY WINDEMERE-> row 7  (typo)
#     mappings_*  SOUTHEAST (ANNEXED) IND-> row 10 (alias)
#     mappings_*  WESTBROOK ESTATE      -> row 8  (typo)
#     merges_*    HERITAGE VALLEY TC AREA-> row 5 (merge)
#   New facts not in any legacy file: the Oliver rename (row 1) and the
#   four container excludes (rows 11-14).
# ============================================================

library(tidyverse)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# --- Provenance constants (avoid repeating long strings per row) ---
SRC_RENAME    <- "Edmonton Naming Committee 2024 Annual Report (eScribe DocumentId 251214)"
SRC_BOUNDARY  <- "City of Edmonton 2026 boundary file (dataset 65fr-66s6); 08c one-shot + 07 merge contract"
SRC_LEGACY    <- "Legacy rescue mapping neighbourhood_name_mappings_20260519.csv (sourced therein)"
SRC_CONTAINER <- "City of Edmonton 2026 boundary file (dataset 65fr-66s6): umbrella/annexation-container rows"
TODAY         <- format(Sys.Date(), "%Y-%m-%d")

# --- The crosswalk (one row per reconciliation fact) ---------
# canonical_* blank only for container_exclude (no survivor).
# variant_id blank for string-drift rows seen NA-id in assessment data.
crosswalk <- tribble(
  ~canonical_id, ~canonical_name,                ~variant_id, ~variant_name,                    ~relation,           ~effective_start, ~effective_end, ~source,        ~notes,
  # 1 RENAME
  "1151",        "WÎHKWÊNTÔWIN",                 "1150",      "OLIVER",                         "rename",            "2025-01-01",     NA,             SRC_RENAME,     "Council rename. Internal systems 2024-10-30 (= boundary Effective Start Date for 1151); ETS 2024-09-01. Old id 1150 absent from current boundary; new-id-wins.",
  # 2 RENUMBER Chappelle
  "5471",        "CHAPPELLE",                    "5462",      "CHAPPELLE",                      "renumber",          NA,               NA,             SRC_BOUNDARY,   "Old id 5462 absent from current boundary; 1:1 renumber to 5471. City did not publish a precise effective date.",
  # 3 SUFFIX_DRIFT Chappelle Area
  "5471",        "CHAPPELLE",                    NA,          "CHAPPELLE AREA",                 "suffix_drift",      NA,               NA,             SRC_LEGACY,     "Assessment carries developing-area AREA suffix; City drops it at finalization. Resolves to 5471.",
  # 4 RENUMBER Heritage Valley Town Centre
  "5472",        "HERITAGE VALLEY TOWN CENTRE",  "5464",      "HERITAGE VALLEY TOWN CENTRE",    "renumber",          NA,               NA,             SRC_BOUNDARY,   "Old id 5464 absent from current boundary; renumber to 5472.",
  # 5 MERGE Heritage Valley Town Centre Area
  "5472",        "HERITAGE VALLEY TOWN CENTRE",  NA,          "HERITAGE VALLEY TOWN CENTRE AREA","merge",            NA,               NA,             SRC_BOUNDARY,   "AREA (NA-id, ~577 props) + native TOWN CENTRE (5472, ~15) are one City polygon; point-in-polygon 619/620 in 5472. Pool rows then re-aggregate; do not average two summaries.",
  # 6 TYPO Rapperswil(l)
  "3370",        "RAPPERSWILL",                  NA,          "RAPPERSWIL",                     "typo",              NA,               NA,             SRC_LEGACY,     "Assessment single-L is the typo; canonical double-L per boundary 3370.",
  # 7 TYPO Windemere/Windermere
  "5405",        "RIVER VALLEY WINDERMERE",      NA,          "RIVER VALLEY WINDEMERE",         "typo",              NA,               NA,             SRC_LEGACY,     "Scoped to the River Valley name; distinct from WINDERMERE 5570. Assessment 'Windemere' missing the R is the typo.",
  # 8 TYPO Westbrook Estate(s)
  "5540",        "WESTBROOK ESTATES",            NA,          "WESTBROOK ESTATE",               "typo",              NA,               NA,             SRC_LEGACY,     "Assessment singular is the typo; canonical plural per boundary 5540.",
  # 9 ALIAS Anthony Henday spacing
  "6665",        "ANTHONY HENDAY SOUTH EAST",    NA,          "ANTHONY HENDAY SOUTHEAST",       "alias",             NA,               NA,             SRC_LEGACY,     "Spacing variant (Southeast vs South East); both valid, not a misspelling, hence alias.",
  # 10 ALIAS Southeast (Annexed) Industrial
  "6690",        "SOUTHEAST INDUSTRIAL",         NA,          "SOUTHEAST (ANNEXED) INDUSTRIAL", "alias",             NA,               NA,             SRC_LEGACY,     "Assessment inserts '(ANNEXED)' post-2022 annexation; canonical 6690 has no parenthetical. Non-residential (industrial).",
  # 11-14 CONTAINER_EXCLUDE (umbrella rows; canonical blank = no survivor)
  NA,            NA,                             "8885",      "EDMONTON SOUTH CENTRAL EAST",    "container_exclude", NA,               NA,             SRC_CONTAINER,  "Umbrella aggregation polygon, not a real neighbourhood; drop before join.",
  NA,            NA,                             "8886",      "EDMONTON SOUTH EAST",            "container_exclude", NA,               NA,             SRC_CONTAINER,  "Umbrella aggregation polygon, not a real neighbourhood; drop before join.",
  NA,            NA,                             "8887",      "EDMONTON SOUTH CENTRAL",         "container_exclude", NA,               NA,             SRC_CONTAINER,  "Umbrella aggregation polygon, not a real neighbourhood; drop before join.",
  NA,            NA,                             "8888",      "EDMONTON SOUTH WEST",            "container_exclude", NA,               NA,             SRC_CONTAINER,  "Umbrella aggregation polygon, not a real neighbourhood; drop before join.",
) |>
  mutate(
    decided_by   = "KC",
    date_curated = TODAY,
    reviewed_by  = NA_character_   # post-hoc verifier (Olivia), per CLAUDE.md §7
  ) |>
  # Lock the exact schema column order required by the contract.
  select(canonical_id, canonical_name, variant_id, variant_name, relation,
         effective_start, effective_end, source, decided_by, date_curated,
         reviewed_by, notes)

# --- Contract guards ----------------------------------------
# relation must be in the enum, and every non-exclude row needs a
# canonical_id (the survivor). Fail loud rather than write a bad table.
RELATION_ENUM <- c("rename", "renumber", "typo", "suffix_drift",
                   "alias", "merge", "container_exclude")
bad_rel <- setdiff(unique(crosswalk$relation), RELATION_ENUM)
if (length(bad_rel) > 0) stop("Unknown relation(s): ", paste(bad_rel, collapse = ", "))

missing_canon <- crosswalk |>
  filter(relation != "container_exclude", is.na(canonical_id))
if (nrow(missing_canon) > 0) {
  print(missing_canon)
  stop("Non-exclude rows missing canonical_id (every survivor needs an id).")
}

# --- Optional reality check against the current boundary -----
# WHY: the crosswalk only makes sense if its canonical_ids actually
# exist in the boundary and its renumber/rename variant_ids are gone
# (new-id-wins). Guarded by file.exists so the one-shot still runs
# without the 2.7 MB boundary present. Warnings only, never fatal.
# Newest boundary snapshot by glob (no date literal); "" when none present, so the
# OPTIONAL file.exists() guard below self-skips and this one-shot still runs
# without the 2.7 MB boundary on disk. Real on-disk name uses "_-_".
boundary_candidates <- sort(list.files(
  shared_path("data"),
  pattern    = "^City_of_Edmonton_-_Neighbourhoods_.*\\.csv$",
  full.names = TRUE
), decreasing = TRUE)
boundary_path <- if (length(boundary_candidates)) boundary_candidates[1] else ""
if (file.exists(boundary_path)) {
  boundary_ids <- read_csv(boundary_path, show_col_types = FALSE) |>
    transmute(id = as.character(as.integer(`Neighbourhood Number`))) |>
    pull(id)

  canon_missing <- crosswalk |>
    filter(!is.na(canonical_id), !canonical_id %in% boundary_ids) |>
    pull(canonical_id)
  if (length(canon_missing) > 0)
    warning("canonical_id(s) NOT in current boundary: ",
            paste(unique(canon_missing), collapse = ", "))

  old_present <- crosswalk |>
    filter(relation %in% c("rename", "renumber"),
           !is.na(variant_id), variant_id %in% boundary_ids) |>
    pull(variant_id)
  if (length(old_present) > 0)
    warning("rename/renumber old id(s) STILL present in boundary (expected absent): ",
            paste(unique(old_present), collapse = ", "))

  cat("Boundary reality check ran (",
      length(boundary_ids), " ids).\n", sep = "")
} else {
  cat("Boundary file not found; skipped the optional reality check.\n")
}

# --- Write the dated crosswalk ------------------------------
out_path <- sprintf("data/reference/neighbourhood_crosswalk_%s.csv",
                    format(Sys.Date(), "%Y%m%d"))
write_csv(crosswalk, out_path, na = "")   # na="" so nullable fields are blank, not "NA"

# --- Report -------------------------------------------------
cat(sprintf("\nWrote %s (%d rows)\n", out_path, nrow(crosswalk)))
cat("\n--- Per-relation tally ---\n")
crosswalk |> count(relation, name = "rows") |> arrange(desc(rows)) |> print()
cat("\n--- Full crosswalk ---\n")
crosswalk |>
  select(canonical_id, canonical_name, variant_id, variant_name, relation) |>
  print(n = Inf)
cat("\nNote: LEWIS FARMS INDUSTRIAL was DROPPED entirely (KC, 2026-06-22) -",
    "no crosswalk row; its boundary polygons stay no_data via the normal path.\n")
