# =============================================================================
# reconcile_helpers.R — consume the neighbourhood crosswalk
# -----------------------------------------------------------------------------
# WHY: neighbourhood identity changes (renames, renumbers, typos, suffix drift,
# aliases, merges, annexation-container exclusions) are authored ONCE, by hand,
# in the dev-run one-shot (scripts/_oneshot/reconcile_neighbourhood_changes.R),
# into a single dated crosswalk CSV. The routine chain must only CONSUME that
# crosswalk, never re-derive reconciliation. These helpers are that consumer,
# shared so 07 / 08b / 08e / 08d all resolve identically (one rule, one place).
#
# Source it like the fetch helper:
#     source(shared_path("reconcile_helpers.R"))
#
# CROSSWALK (newest dated file wins, CLAUDE.md §4.4). Columns used here:
#   canonical_id, canonical_name, variant_id, variant_name, relation
# POLICY: NEW-ID-WINS. canonical_* is the survivor; variant_* is the old/raw
# id or string seen in source data. Resolution rewrites variant -> canonical.
# =============================================================================

# All six "resolve" relations. container_exclude is handled separately (it is a
# drop, not a remap) via crosswalk_exclude_ids().
RECON_RESOLVE_RELATIONS <- c("rename", "renumber", "typo",
                             "suffix_drift", "alias", "merge")

# load_crosswalk(): read the newest dated crosswalk. ref_dir defaults to the
# section-relative data/reference (resolves against the runner's section cwd).
# Everything read as character: ids are character throughout this pipeline.
load_crosswalk <- function(ref_dir = "data/reference") {
  files <- sort(list.files(
    ref_dir,
    pattern    = "^neighbourhood_crosswalk_\\d{8}\\.csv$",
    full.names = TRUE
  ))
  if (length(files) == 0) {
    stop("No neighbourhood_crosswalk_<YYYYMMDD>.csv in ", ref_dir,
         " — run scripts/_oneshot/reconcile_neighbourhood_changes.R first.")
  }
  readr::read_csv(tail(files, 1), show_col_types = FALSE,
                  col_types = readr::cols(.default = "c"))
}

# apply_crosswalk(): rewrite a frame's `Neighbourhood ID` / `Neighbourhood`
# from variant to canonical. Two passes, both idempotent:
#   1) old-id match  — rows whose id equals a variant_id   (rename, renumber)
#   2) variant-name match — rows whose name equals a variant_name (all relations
#      that carry a name, which is every resolve relation). This is what lets a
#      NAME-keyed frame (the historical aggregates) resolve too: e.g. "OLIVER"
#      matches the rename row's variant_name and becomes WÎHKWÊNTÔWIN / 1151.
# coalesce() keeps the existing value when no crosswalk row matches, so calling
# this on already-canonical data is a no-op.
apply_crosswalk <- function(df,
                            cw        = load_crosswalk(),
                            relations = RECON_RESOLVE_RELATIONS) {
  stopifnot(all(c("Neighbourhood ID", "Neighbourhood") %in% names(df)))
  active <- dplyr::filter(cw, relation %in% relations)

  by_id <- active |>
    dplyr::filter(!is.na(variant_id)) |>
    dplyr::select(variant_id, canonical_id, canonical_name)
  by_name <- active |>
    dplyr::filter(!is.na(variant_name)) |>
    dplyr::select(variant_name, canonical_id, canonical_name)

  # Guard: a duplicated variant key would fan the join out (one source row ->
  # many). The crosswalk must be 1:1 on each key; fail loud if not.
  if (anyDuplicated(by_id$variant_id))
    stop("crosswalk has duplicate variant_id; resolution would fan out.")
  if (anyDuplicated(by_name$variant_name))
    stop("crosswalk has duplicate variant_name; resolution would fan out.")

  df |>
    # 1) old-id match (rename, renumber): match the OLD id, take canonical.
    dplyr::left_join(by_id, by = c("Neighbourhood ID" = "variant_id")) |>
    dplyr::mutate(
      Neighbourhood      = dplyr::coalesce(canonical_name, Neighbourhood),
      `Neighbourhood ID` = dplyr::coalesce(canonical_id,   `Neighbourhood ID`)
    ) |>
    dplyr::select(-canonical_id, -canonical_name) |>
    # 2) variant-string match (typo, suffix_drift, alias, merge, and the
    #    rename/renumber rows' own names for name-keyed frames).
    dplyr::left_join(by_name, by = c("Neighbourhood" = "variant_name")) |>
    dplyr::mutate(
      `Neighbourhood ID` = dplyr::coalesce(canonical_id,   `Neighbourhood ID`),
      Neighbourhood      = dplyr::coalesce(canonical_name, Neighbourhood)
    ) |>
    dplyr::select(-canonical_id, -canonical_name)
}

# crosswalk_exclude_ids(): the ids to DROP before any join (annexation-container
# umbrella rows that are not real neighbourhoods). Character vector, possibly
# empty.
crosswalk_exclude_ids <- function(cw = load_crosswalk()) {
  cw |>
    dplyr::filter(relation == "container_exclude") |>
    dplyr::pull(variant_id)
}
