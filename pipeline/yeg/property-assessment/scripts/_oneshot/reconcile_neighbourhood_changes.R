# ============================================================
# reconcile_neighbourhood_changes.R
#   The Data Centre's single reconciliation home for neighbourhood
#   identity changes (renames, renumbers, string drift, merges,
#   annexation areas).
#
# STATUS: DEV-RUN ONE-SHOT. Lives in scripts/_oneshot/, NOT in
#   _whirl.yaml. It is NOT part of any automated refresh. The
#   routine chain only CONSUMES the newest crosswalk, never this.
#
#   FROZEN (Tier 2 · sub-concern G, 2026-07-10): the tribble below is
#   frozen to reproduce the shipped neighbourhood_crosswalk_20260622.csv
#   BYTE-FOR-BYTE, so re-running is a safe no-op — the generator is a
#   truthful record of the shipped artifact, not a stale author. (Before
#   the freeze it still wrote 8885-8888 as container_exclude and lacked
#   the HERITAGE VALLEY AREA + Lewis Farms rows; re-running would have
#   reversed the keep-and-label ruling. That drift is now closed.)
#   A GENUINE future City change bumps the out_path date literal + adds
#   the row(s); until then this reproduces 20260622 exactly.
#
# WHAT IT WRITES (and nothing else):
#   data/reference/neighbourhood_crosswalk_20260622.csv  (frozen name)
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
#                  merge | annexation_area | container_exclude
#                  (annexation_area + container_exclude carry a blank
#                   canonical_id — no survivor; container_exclude is
#                   RESERVED/unused, see the guard block.)
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
#     suffix_drift). Heritage Valley AREA (a distinct developing-area name,
#     ~1 prop) folds into 5472 the same way — also a merge (reclassified
#     from suffix_drift 2026-07-13; see its row note).
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
# ANNEXATION_AREA (kept + labelled — NOT excluded; re-dispositioned 2026-07-10)
#   8885 Edmonton South Central East   (effective_start 2020-06-01)
#   8886 Edmonton South East           (effective_start 2019-01-01)
#   8887 Edmonton South Central        (effective_start 2018-01-01)
#   8888 Edmonton South West           (effective_start 2019-01-01)
#     Standalone annexation-area tiles over the annexed-but-unsubdivided
#     south. An earlier belief held them umbrella containers to DROP;
#     directive-00b (projected-CRS intersection, 1 m² tol) FALSIFIED it —
#     0.0% overlap, zero contained neighbourhoods. Per
#     DECISION_container_universe_20260710.md they are KEPT and LABELLED
#     (relation annexation_area + the orthogonal is_annexation_area flag
#     consumers add), never dropped. canonical_* is blank (no survivor —
#     they ARE the polygon, not a remap to another id). effective_start =
#     the boundary's Effective Start Date.
#
# ------------------------------------------------------------
# RESOLVED — "Lewis Farms Industrial" 4485 -> 4261 RENUMBER (KC, 2026-07-10)
# ------------------------------------------------------------
#   The legacy rescue table mapped "Lewis Farms Industrial" to id 4485,
#   ABSENT from the current boundary. Directive-00b ratified the successor
#   against the boundary Description attributes: 4261 "Lewis Farms Business
#   Employment" (effective 2026-01-15) carries the identical "commercial or
#   industrial" Description — NOT 4260 Lewis Farms (open space/institutional,
#   a category mismatch). So 4485 gets a RENUMBER crosswalk row to 4261
#   (superseding the earlier 2026-06-22 DROP decision and the rescue oracle's
#   stale 4485 drop). Data effect is inert today (PA carries no residential
#   4485 data; BP's ~2 raw permit rows on 4485 resolve to 4261 rather than
#   dropping now that BP reads this crosswalk — Tier 2 sub-concern B).
#
# MIGRATION TRACE (proves: migrate, do not invent) — every row in the
#   three legacy mapping CSVs + the merge CSV maps to a crosswalk row:
#     mappings_*  ANTHONY HENDAY        -> row 10 (alias)
#     mappings_*  CHAPPELLE / AREA      -> rows 2 (renumber) + 3 (suffix_drift)
#     mappings_*  HERITAGE VALLEY TC    -> rows 4 (renumber) + 5 (merge)
#     mappings_*  LEWIS FARMS INDUSTRIAL-> row 16 (renumber 4485->4261)
#     mappings_*  RAPPERSWIL            -> row 7  (typo)
#     mappings_*  RIVER VALLEY WINDEMERE-> row 8  (typo)
#     mappings_*  SOUTHEAST (ANNEXED) IND-> row 11 (alias)
#     mappings_*  WESTBROOK ESTATE      -> row 9  (typo)
#     merges_*    HERITAGE VALLEY TC AREA-> row 5 (merge)
#   Also migrated from the BP rescue oracle (Tier 2): HERITAGE VALLEY AREA
#   -> row 6 (merge — reclassified from suffix_drift 2026-07-13 so PA pools it
#   pre-aggregation; see the row note), so the crosswalk is a superset of the
#   oracle's names. New facts not in any legacy file: the Oliver rename (row 1)
#   and the four annexation areas (rows 12-15).
# ============================================================

library(tidyverse)
source(rprojroot::find_root_file("_bootstrap.R", criterion = rprojroot::has_file(".aref_root")))

# --- Provenance constants (avoid repeating long strings per row) ---
SRC_RENAME   <- "Edmonton Naming Committee 2024 Annual Report (eScribe DocumentId 251214)"
SRC_BOUNDARY <- "City of Edmonton 2026 boundary file (dataset 65fr-66s6); 08c one-shot + 07 merge contract"
SRC_LEGACY   <- "Legacy rescue mapping neighbourhood_name_mappings_20260519.csv (sourced therein)"
SRC_HVA      <- "Migrated from the rescue oracle (neighbourhood_rescue_oracle.csv old_name for 5464->5472) as the canonical crosswalk absorbs BP's reconciliation (Tier 2)"
SRC_ANNEX    <- "City of Edmonton 2026 boundary file (dataset 65fr-66s6); disposition ratified by DECISION_container_universe_20260710.md (directive-00b spatial run, EPSG:32612)"
SRC_LEWIS    <- "City of Edmonton 2026 boundary file (dataset 65fr-66s6): 4261 LEWIS FARMS BUSINESS EMPLOYMENT (Effective Start Date 2026-01-15) is the successor to the dropped 4485 LEWIS FARMS INDUSTRIAL; ratified against the boundary Description attributes this pass (Directive 00b)"
# All four annexation rows share one source + one notes string (they differ only in id/name/effective_start).
NOTES_ANNEX  <- "Standalone annexation-area polygon in the annexed-but-unsubdivided south — geometry-confirmed NOT an umbrella (0% overlap, contains no real neighbourhoods). KEEP + LABEL (is_annexation_area), do not drop. Supersedes the prior container_exclude/umbrella characterization. effective_start = boundary Effective Start Date."

# --- The crosswalk (one row per reconciliation fact) ---------
# FROZEN to the shipped neighbourhood_crosswalk_20260622.csv (Tier 2 · sub-concern
# G). Row order, per-row date_curated (2026-06-22 seed vs 2026-07-10 Tier-2 rows),
# and every value reproduce that file so re-running this one-shot is a byte-identical
# no-op — the generator is now a truthful record of the shipped artifact, not a stale
# author that would reverse the keep-and-label ruling.
# canonical_* blank only for annexation_area rows (no survivor — kept + labelled, not
# a remap). variant_id blank for string-drift/typo/alias/merge rows seen NA-id in
# assessment data. date_curated is per row (no Sys.Date() stamp — this is frozen).
crosswalk <- tribble(
  ~canonical_id, ~canonical_name,                ~variant_id, ~variant_name,                    ~relation,         ~effective_start, ~effective_end, ~source,      ~date_curated, ~notes,
  # 1 RENAME
  "1151",        "WÎHKWÊNTÔWIN",                 "1150",      "OLIVER",                         "rename",          "2025-01-01",     NA,             SRC_RENAME,   "2026-06-22",  "Council rename. Internal systems 2024-10-30 (= boundary Effective Start Date for 1151); ETS 2024-09-01. Old id 1150 absent from current boundary; new-id-wins.",
  # 2 RENUMBER Chappelle
  "5471",        "CHAPPELLE",                    "5462",      "CHAPPELLE",                      "renumber",        NA,               NA,             SRC_BOUNDARY, "2026-06-22",  "Old id 5462 absent from current boundary; 1:1 renumber to 5471. City did not publish a precise effective date.",
  # 3 SUFFIX_DRIFT Chappelle Area
  "5471",        "CHAPPELLE",                    NA,          "CHAPPELLE AREA",                 "suffix_drift",    NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Assessment carries developing-area AREA suffix; City drops it at finalization. Resolves to 5471.",
  # 4 RENUMBER Heritage Valley Town Centre
  "5472",        "HERITAGE VALLEY TOWN CENTRE",  "5464",      "HERITAGE VALLEY TOWN CENTRE",    "renumber",        NA,               NA,             SRC_BOUNDARY, "2026-06-22",  "Old id 5464 absent from current boundary; renumber to 5472.",
  # 5 MERGE Heritage Valley Town Centre Area
  "5472",        "HERITAGE VALLEY TOWN CENTRE",  NA,          "HERITAGE VALLEY TOWN CENTRE AREA","merge",          NA,               NA,             SRC_BOUNDARY, "2026-06-22",  "AREA (NA-id, ~577 props) + native TOWN CENTRE (5472, ~15) are one City polygon; point-in-polygon 619/620 in 5472. Pool rows then re-aggregate; do not average two summaries.",
  # 6 MERGE Heritage Valley Area (Tier 2: crosswalk absorbs the BP oracle name; MUST be
  #   a merge, not suffix_drift — see the reclassification note below)
  "5472",        "HERITAGE VALLEY TOWN CENTRE",  NA,          "HERITAGE VALLEY AREA",           "merge",           NA,               NA,             SRC_HVA,      "2026-07-13",  "Building-permit + assessment source data carry the developing-area name 'HERITAGE VALLEY AREA' (distinct from 'HERITAGE VALLEY TOWN CENTRE AREA'); the oracle mapped it to 5472. Added so the crosswalk is a true superset of the oracle's names and BP's NA-name recovery does not regress on 'HERITAGE VALLEY TOWN CENTRE, HERITAGE VALLEY AREA' pairs. Reclassified suffix_drift -> merge 2026-07-13 (KC): PA 05 pools merge rows PRE-aggregation (line 96, before group_by) but applies the full crosswalk POST-aggregation (line 184); as suffix_drift this 1-property group survived aggregation then collapsed onto 5472, colliding with the 592-prop merged group -> dup-ID stop in 06. As a merge it pools pre-aggregation like HERITAGE VALLEY TOWN CENTRE AREA. BP name recovery is unchanged (merge is in the resolve set crosswalk_name_canon reads).",
  # 7 TYPO Rapperswil(l)
  "3370",        "RAPPERSWILL",                  NA,          "RAPPERSWIL",                     "typo",            NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Assessment single-L is the typo; canonical double-L per boundary 3370.",
  # 8 TYPO Windemere/Windermere
  "5405",        "RIVER VALLEY WINDERMERE",      NA,          "RIVER VALLEY WINDEMERE",         "typo",            NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Scoped to the River Valley name; distinct from WINDERMERE 5570. Assessment 'Windemere' missing the R is the typo.",
  # 9 TYPO Westbrook Estate(s)
  "5540",        "WESTBROOK ESTATES",            NA,          "WESTBROOK ESTATE",               "typo",            NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Assessment singular is the typo; canonical plural per boundary 5540.",
  # 10 ALIAS Anthony Henday spacing
  "6665",        "ANTHONY HENDAY SOUTH EAST",    NA,          "ANTHONY HENDAY SOUTHEAST",       "alias",           NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Spacing variant (Southeast vs South East); both valid, not a misspelling, hence alias.",
  # 11 ALIAS Southeast (Annexed) Industrial
  "6690",        "SOUTHEAST INDUSTRIAL",         NA,          "SOUTHEAST (ANNEXED) INDUSTRIAL", "alias",           NA,               NA,             SRC_LEGACY,   "2026-06-22",  "Assessment inserts '(ANNEXED)' post-2022 annexation; canonical 6690 has no parenthetical. Non-residential (industrial).",
  # 12-15 ANNEXATION_AREA (kept + labelled; canonical blank = no survivor, not a remap)
  # Re-dispositioned from container_exclude per DECISION_container_universe_20260710.md
  # (directive-00b: standalone tiles, 0.0% overlap). effective_start = boundary Effective Start Date.
  NA,            NA,                             "8885",      "EDMONTON SOUTH CENTRAL EAST",    "annexation_area", "2020-06-01",     NA,             SRC_ANNEX,    "2026-07-10",  NOTES_ANNEX,
  NA,            NA,                             "8886",      "EDMONTON SOUTH EAST",            "annexation_area", "2019-01-01",     NA,             SRC_ANNEX,    "2026-07-10",  NOTES_ANNEX,
  NA,            NA,                             "8887",      "EDMONTON SOUTH CENTRAL",         "annexation_area", "2018-01-01",     NA,             SRC_ANNEX,    "2026-07-10",  NOTES_ANNEX,
  NA,            NA,                             "8888",      "EDMONTON SOUTH WEST",            "annexation_area", "2019-01-01",     NA,             SRC_ANNEX,    "2026-07-10",  NOTES_ANNEX,
  # 16 RENUMBER Lewis Farms (4485 -> 4261; supersedes the rescue oracle's stale drop, Directive 00b)
  "4261",        "LEWIS FARMS BUSINESS EMPLOYMENT","4485",    "LEWIS FARMS INDUSTRIAL",         "renumber",        "2026-01-15",     NA,             SRC_LEWIS,    "2026-07-10",  "4485 (2023 shapefile 'Lewis Farms Industrial', non-residential, Description 'largely commercial or industrial in nature') is absent from the 2026 boundary; the City published 4261 LEWIS FARMS BUSINESS EMPLOYMENT with the identical 'commercial or industrial' Description as its employment-area successor -- NOT 4260 LEWIS FARMS (open space / institutional, a category mismatch). Supersedes the rescue oracle's stale 4485 drop. Data effect: inert today (BP consumes the rescue oracle, which still drops 4485; PA consumes this crosswalk but carries no residential 4485 data). The ~2 raw BP permit rows on 4485 resolve to 4261 instead of dropping once Tier 2 migrates BP onto this crosswalk and retires the oracle drop.",
) |>
  mutate(
    decided_by   = "KC",
    reviewed_by  = NA_character_   # post-hoc verifier (Olivia), per CLAUDE.md §7
  ) |>
  # Lock the exact schema column order required by the contract.
  select(canonical_id, canonical_name, variant_id, variant_name, relation,
         effective_start, effective_end, source, decided_by, date_curated,
         reviewed_by, notes)

# --- Contract guards ----------------------------------------
# relation must be in the enum, and every SURVIVOR row needs a canonical_id.
# Two relations carry a blank canonical_id (no survivor): annexation_area (kept +
# labelled, not a remap — the shipped disposition) and container_exclude (a true
# drop; RESERVED, unused today but kept in the enum so the reserved API stays
# valid — mirrors reconcile_helpers.R). Fail loud rather than write a bad table.
RELATION_ENUM <- c("rename", "renumber", "typo", "suffix_drift",
                   "alias", "merge", "annexation_area", "container_exclude")
NO_SURVIVOR   <- c("annexation_area", "container_exclude")
bad_rel <- setdiff(unique(crosswalk$relation), RELATION_ENUM)
if (length(bad_rel) > 0) stop("Unknown relation(s): ", paste(bad_rel, collapse = ", "))

missing_canon <- crosswalk |>
  filter(!relation %in% NO_SURVIVOR, is.na(canonical_id))
if (nrow(missing_canon) > 0) {
  print(missing_canon)
  stop("Survivor rows missing canonical_id (every remap survivor needs an id).")
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

# --- Write the crosswalk (FROZEN date) ----------------------
# Pinned to 20260622, NOT Sys.Date(): this one-shot is frozen to reproduce the
# shipped crosswalk byte-for-byte (Tier 2 · sub-concern G), so it must write the
# same filename the routine chain consumes rather than mint a new-dated file. A
# GENUINE future City change bumps this date literal + adds the row(s) below.
out_path <- "data/reference/neighbourhood_crosswalk_20260622.csv"
write_csv(crosswalk, out_path, na = "")   # na="" so nullable fields are blank, not "NA"

# --- Report -------------------------------------------------
cat(sprintf("\nWrote %s (%d rows)\n", out_path, nrow(crosswalk)))
cat("\n--- Per-relation tally ---\n")
crosswalk |> count(relation, name = "rows") |> arrange(desc(rows)) |> print()
cat("\n--- Full crosswalk ---\n")
crosswalk |>
  select(canonical_id, canonical_name, variant_id, variant_name, relation) |>
  print(n = Inf)
cat("\nNote: LEWIS FARMS INDUSTRIAL 4485 -> 4261 renumber (KC, 2026-07-10),",
    "superseding the earlier drop; 8885-8888 are annexation_area (kept + labelled).\n")
