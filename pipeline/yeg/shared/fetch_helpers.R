# ============================================================
# fetch_helpers.R   (pipeline/yeg/shared)
# ------------------------------------------------------------
# WHY: every Socrata bulk fetch in this repo goes through ONE helper, so the
# export-endpoint discipline and the proven reliability layer cannot be bypassed
# or re-derived per section.
#   - Export-endpoint discipline: always hit the dataset EXPORT endpoint
#     (/api/views/<id>/rows.csv?accessType=DOWNLOAD), NEVER the /resource/ API
#     (which silently caps at 1000 rows). The URL is built internally so no
#     caller can construct the capped endpoint.
#   - Reliability layer (extracted from the proven building-permits 02 fetch):
#     stall + absolute timeouts; atomic temp-then-rename (a present dated file
#     ALWAYS means a complete, verified download — never a partial a later run
#     would reuse); size / row / column floors checked on the temp BEFORE it is
#     promoted to the dated name.
#
# Self-contained: no globals, everything via args, returns the verified path,
# no side effect beyond writing that one file. Source via shared_path():
#   source(shared_path("fetch_helpers.R"))
# Requires: curl, readr (both in renv.lock).
# ============================================================

# Build the Socrata EXPORT url. Internal so callers never construct URLs — the
# /resource/ (1000-row-cap) endpoint cannot leak in.
.build_socrata_export_url <- function(domain, dataset_id) {
  sprintf("https://%s/api/views/%s/rows.csv?accessType=DOWNLOAD", domain, dataset_id)
}

# fetch_socrata_snapshot — download + verify a full Socrata dataset to a dated
# CSV, atomically. Returns the path to the verified snapshot.
#
# Args:
#   dataset_id       Socrata dataset id (e.g. "24uj-dj8v"). Single non-empty string.
#   dest_dir         directory the dated snapshot is written into.
#   min_rows         minimum acceptable row count (truncation floor).
#   min_size_mb      minimum acceptable file size in MB (truncation floor).
#   required_cols    NULL, or a character vector of columns that MUST be present
#                    (schema-drift guard); checked on the downloaded file.
#   filename_stem    NULL (-> "General_Socrata_<dataset_id>") or a stem string;
#                    the dated file is "<stem>_<YYYYMMDD>.csv". Lets each caller
#                    keep its own on-disk name (BP keeps General_Building_Permits,
#                    which 03 globs — do not change it).
#   domain           Socrata host (default "data.edmonton.ca").
#   stall_bytes_sec  abort if the transfer drops below this many bytes/sec ...
#   stall_seconds    ... for this many consecutive seconds (stall detection).
#   absolute_timeout hard ceiling for the whole transfer, in seconds.
fetch_socrata_snapshot <- function(dataset_id,
                                   dest_dir,
                                   min_rows,
                                   min_size_mb,
                                   required_cols    = NULL,
                                   filename_stem    = NULL,
                                   domain           = "data.edmonton.ca",
                                   stall_bytes_sec  = 100,
                                   stall_seconds    = 60,
                                   absolute_timeout = 1200) {

  # --- Validate the call before any network work ------------------------------
  stopifnot(
    is.character(dataset_id), length(dataset_id) == 1L, nzchar(dataset_id),
    is.character(dest_dir),   length(dest_dir) == 1L,
    is.numeric(min_rows),     length(min_rows) == 1L,    min_rows > 0,
    is.numeric(min_size_mb),  length(min_size_mb) == 1L, min_size_mb > 0
  )
  if (!is.null(required_cols) && !is.character(required_cols)) {
    stop("required_cols must be NULL or a character vector.", call. = FALSE)
  }

  # --- Resolve the export URL + dated dest path -------------------------------
  url <- .build_socrata_export_url(domain, dataset_id)
  if (is.null(filename_stem)) filename_stem <- paste0("General_Socrata_", dataset_id)
  dest_path <- file.path(
    dest_dir, sprintf("%s_%s.csv", filename_stem, format(Sys.Date(), "%Y%m%d"))
  )

  # --- Reuse guard: a present dated file is complete (atomic write below) ------
  if (file.exists(dest_path)) {
    message("Snapshot for today already exists (complete via atomic write), reusing:\n  ",
            dest_path)
    return(dest_path)
  }

  dir.create(dest_dir, showWarnings = FALSE, recursive = TRUE)
  tmp <- paste0(dest_path, ".part")

  # --- Download to temp. The handle enforces a stall limit (abort if transfer
  #     stays below stall_bytes_sec for stall_seconds) and an absolute timeout.
  #     curl_download raises on non-success HTTP and removes the temp on an
  #     incomplete transfer (native atomic/cleanup); we also unlink defensively. -
  h <- curl::new_handle(low_speed_limit = stall_bytes_sec,
                        low_speed_time  = stall_seconds,
                        timeout         = absolute_timeout)
  tryCatch(
    curl::curl_download(url, tmp, handle = h, mode = "wb"),
    error = function(e) {
      if (file.exists(tmp)) unlink(tmp)
      stop("Socrata fetch failed for ", dataset_id, " (", domain, "): ",
           conditionMessage(e), call. = FALSE)
    }
  )

  # --- Verify on the temp BEFORE promoting ------------------------------------
  fail <- function(msg) { unlink(tmp); stop(msg, call. = FALSE) }

  size_mb <- file.size(tmp) / 1024^2
  if (size_mb < min_size_mb) {
    fail(sprintf("download is %.1f MB (< %g MB floor) — truncated; partial discarded.",
                 size_mb, min_size_mb))
  }

  df <- readr::read_csv(tmp, show_col_types = FALSE)
  if (nrow(df) < min_rows) {
    fail(sprintf("download has %s rows (< %s floor) — truncated/drift; partial discarded.",
                 format(nrow(df), big.mark = ","), format(min_rows, big.mark = ",")))
  }

  if (!is.null(required_cols)) {
    missing_cols <- setdiff(required_cols, names(df))
    if (length(missing_cols) > 0) {
      fail(paste0("Source schema changed — missing expected columns: ",
                  paste(missing_cols, collapse = ", "), ". Partial discarded."))
    }
  }

  # --- Promote: a present dated file now means complete + verified ------------
  file.rename(tmp, dest_path)
  message(sprintf("Fetched + verified: %s rows -> %s",
                  format(nrow(df), big.mark = ","), dest_path))
  return(dest_path)
}
