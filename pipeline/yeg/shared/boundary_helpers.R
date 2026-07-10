# ============================================================
# boundary_helpers.R   (pipeline/yeg/shared)
# ------------------------------------------------------------
# The single, GUARDED entry point for the City neighbourhood boundary
# (Socrata 65fr-66s6) — the geometry every section's map stands on. It
# (1) makes a NEW boundary a DELIBERATE-adoption input — REUSE the last
# accepted on-disk snapshot by default; AREF_BOUNDARY_FETCH=1 pulls a new
# one through the shared fetch helper (finding 5, closing the bypass) — and
# (2) enforces the integrity contract (memo Request 4) so a truncated /
# renumbered / end-dated boundary HALTS the refresh instead of silently
# fanning out or truncating every map.
#
# Contract — invariants no legitimate City decision can violate:
#   - required columns present    (free via fetch_socrata_snapshot required_cols)
#   - non-duplicate Neighbourhood Number among active rows            -> stop
#   - non-empty geometry, dropped-row count REPORTED (never silent)
#   - row count within +/-10% of the last ACCEPTED snapshot           -> stop
#   - any populated Effective End Date (code assumes every row live)  -> stop
#   - snapshot staleness                                              -> warning
# NEVER a hard-coded 407: the accepted count is read from a tracked record.
#
# The last-accepted snapshot is boundary_accepted.json (tracked). Here it is
# READ for the tolerance/staleness gate. The DELIBERATE-adoption workflow
# (appeared/vanished id-set diff + updating the record) is Tier 3 — NOT built
# here. Seed/update the record with seed_boundary_accepted() after a human
# accepts a new snapshot.
#
# Requires: fetch_helpers.R (fetch_socrata_snapshot), jsonlite, readr, digest.
# Source order: _bootstrap.R -> fetch_helpers.R -> boundary_helpers.R
# ============================================================

REQUIRED_BOUNDARY_COLS <- c(
  "Neighbourhood Name", "Neighbourhood Number", "Effective Start Date",
  "Effective End Date", "Geometry Multipolygon"
)
BOUNDARY_ROW_TOLERANCE <- 0.10   # +/-10% of the last accepted row count (KC)
BOUNDARY_STALE_DAYS    <- 120    # warn if the snapshot is older than this

# Stable hash of the active neighbourhood-number set (order-independent).
.boundary_id_hash <- function(boundary_raw) {
  nums <- suppressWarnings(as.integer(boundary_raw[["Neighbourhood Number"]]))
  digest::digest(sort(unique(nums[!is.na(nums)])), algo = "sha256")
}

assert_boundary_contract <- function(boundary_raw, snapshot_path) {
  accepted_path <- shared_path("boundary_accepted.json")   # TRACKED record
  n <- nrow(boundary_raw)

  # 1. required columns (belt + suspenders; fetch helper also enforces on fetch)
  miss <- setdiff(REQUIRED_BOUNDARY_COLS, names(boundary_raw))
  if (length(miss))
    stop("Boundary contract: missing required column(s): ", paste(miss, collapse = ", "))

  # 2. non-duplicate active neighbourhood numbers
  nums <- suppressWarnings(as.integer(boundary_raw[["Neighbourhood Number"]]))
  dup  <- unique(nums[duplicated(nums) & !is.na(nums)])
  if (length(dup))
    stop("Boundary contract: duplicate Neighbourhood Number(s): ", paste(dup, collapse = ", "))

  # 3. non-empty geometry — REPORT the dropped-row count (never a silent filter)
  geom    <- as.character(boundary_raw[["Geometry Multipolygon"]])
  n_empty <- sum(is.na(geom) | !nzchar(trimws(geom)))
  if (n_empty > 0)
    cat(sprintf("Boundary contract: %d row(s) have empty geometry (reported; will drop).\n", n_empty))

  # 4. row count within tolerance of the last accepted snapshot (never frozen 407)
  if (file.exists(accepted_path)) {
    prev <- as.integer(jsonlite::read_json(accepted_path)$row_count)
    lo <- floor(prev * (1 - BOUNDARY_ROW_TOLERANCE))
    hi <- ceiling(prev * (1 + BOUNDARY_ROW_TOLERANCE))
    if (n < lo || n > hi)
      stop(sprintf(paste0("Boundary contract: %d rows outside +/-%.0f%% of the last accepted %d ",
                          "(band %d-%d) — a truncated export, or a boundary change the operator ",
                          "must DELIBERATELY adopt (re-seed %s after review)."),
                   n, 100 * BOUNDARY_ROW_TOLERANCE, prev, lo, hi, basename(accepted_path)))
  } else {
    cat("Boundary contract: no boundary_accepted.json yet — row-count tolerance gate skipped (seed it).\n")
  }

  # 5. Effective End Date tripwire — the pipeline assumes EVERY row is a live nbhd
  ed      <- as.character(boundary_raw[["Effective End Date"]])
  n_ended <- sum(!is.na(ed) & nzchar(trimws(ed)))
  if (n_ended > 0)
    stop(sprintf(paste0("Boundary contract: %d row(s) carry a populated Effective End Date — the ",
                        "pipeline assumes every boundary row is a LIVE neighbourhood. A retired ",
                        "neighbourhood needs a deliberate ruling (drop/remap) before it can ship."),
                 n_ended))

  # 6. staleness warning (following the City means staying current)
  d <- regmatches(basename(snapshot_path), regexpr("[0-9]{8}", basename(snapshot_path)))
  if (length(d) == 1L) {
    age <- as.integer(Sys.Date() - as.Date(d, "%Y%m%d"))
    if (!is.na(age) && age > BOUNDARY_STALE_DAYS)
      warning(sprintf(paste0("Boundary snapshot %s is %d days old (> %d) — a stale boundary is the ",
                            "likeliest way ids get stranded; refresh it."),
                      basename(snapshot_path), age, BOUNDARY_STALE_DAYS))
  }
  invisible(n)
}

# load_boundary — the guarded boundary entry point every section uses. REUSE is the
#   default: a new City boundary is a DELIBERATE-adoption input (memo Req 4), so the
#   refresh reuses the last accepted on-disk snapshot rather than auto-following the
#   City every run (which could pull an un-ratified delta that strands ids). Set
#   AREF_BOUNDARY_FETCH=1 to deliberately PULL a new snapshot through the shared
#   Socrata helper (finding 5). Tier 3's id-set-diff will add the delta ratification.
# Returns the RAW boundary frame; the caller does its own st_as_sf / select.
load_boundary <- function(fetch = identical(Sys.getenv("AREF_BOUNDARY_FETCH", "0"), "1")) {
  dir <- shared_path("data")
  if (fetch) {
    message("load_boundary: AREF_BOUNDARY_FETCH=1 — deliberately PULLING a new boundary ",
            "snapshot via the Socrata helper (adoption ratified per memo Req 4).")
    path <- fetch_socrata_snapshot(
      dataset_id    = "65fr-66s6",
      dest_dir      = dir,
      min_rows      = 300,          # ~3/4 of the ~407 universe — gross-truncation floor
      min_size_mb   = 1,
      required_cols = REQUIRED_BOUNDARY_COLS,
      filename_stem = "City_of_Edmonton_-_Neighbourhoods"
    )
  } else {
    cands <- list.files(dir, pattern = "^City_of_Edmonton_-_Neighbourhoods_.*\\.csv$",
                        full.names = TRUE)
    if (length(cands) == 0)
      stop("load_boundary: no accepted boundary snapshot in ", dir,
           " — pull one with AREF_BOUNDARY_FETCH=1.")
    path <- sort(cands, decreasing = TRUE)[1]
  }
  raw <- readr::read_csv(path, show_col_types = FALSE)
  assert_boundary_contract(raw, path)
  attr(raw, "boundary_snapshot_path") <- path
  raw
}

# seed_boundary_accepted — write the tracked last-accepted record. Run by a human
# AFTER reviewing/adopting a snapshot (Tier 1 seeds today's; Tier 3 automates the
# id-set-diff adoption that calls this).
seed_boundary_accepted <- function(boundary_raw, snapshot_path) {
  d <- regmatches(basename(snapshot_path), regexpr("[0-9]{8}", basename(snapshot_path)))
  rec <- list(
    snapshot      = basename(snapshot_path),
    snapshot_date = if (length(d)) d else NA_character_,
    row_count     = nrow(boundary_raw),
    id_set_sha256 = .boundary_id_hash(boundary_raw),
    accepted_on   = format(Sys.Date(), "%Y-%m-%d"),
    accepted_by   = "KC"
  )
  jsonlite::write_json(rec, shared_path("boundary_accepted.json"),
                       auto_unbox = TRUE, pretty = TRUE)
  invisible(rec)
}
