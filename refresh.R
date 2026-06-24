# refresh.R
# -----------------------------------------------------------------------------
# CROSS-SECTION DRIVER (v2). Runs EVERY section in _whirl.yaml under ONE
# refresh_id, in declaration order, isolating each behind tryCatch so one
# section's failure does not abort the rest. Uses the SAME engine as the
# single-section caller (run_section.R) — the only difference is that records
# emitted here carry schema_version = 2L + refresh_id (v2). run_section.R stays
# v1 (no refresh_id); that field is the sole v1-vs-v2 distinction.
#
# Usage:
#   Rscript refresh.R              # LIVE: run all sections
#   Rscript refresh.R --dry-run    # validate all sections, execute nothing
#
# Exit: 1 if ANY section ended in a status other than ok / ok_with_warnings /
#   ok_empty_output. ok_empty_output is surface-and-continue: it is printed
#   LOUDLY in the summary but does NOT by itself fail the refresh (the empty file
#   was flagged and withheld from publish, not shipped).
# -----------------------------------------------------------------------------

REPO_ROOT <- rprojroot::find_root(rprojroot::has_file(".aref_root"))
cfg <- yaml::read_yaml(file.path(REPO_ROOT, "_whirl.yaml"))
if (is.null(cfg$sections) || !is.list(cfg$sections)) {
  stop("_whirl.yaml shape mismatch: expected a top-level `sections:` map. ",
       "Found top-level keys: ", paste(names(cfg), collapse = ", "))
}

args     <- commandArgs(trailingOnly = TRUE)
dry_run  <- ("--dry-run" %in% args) || nzchar(Sys.getenv("DRY_RUN"))
log_path <- file.path(REPO_ROOT, "runs", "refresh_runs.jsonl")

# One refresh_id stamps every record from every section this invocation.
refresh_id <- format(Sys.time(), "refresh-%Y%m%dT%H%M%S")

source(file.path(REPO_ROOT, "pipeline", "_run_engine.R"))

cat(sprintf("=== REFRESH (%s)%s — %d section(s), declaration order ===\n",
            refresh_id, if (dry_run) " [DRY RUN]" else "", length(cfg$sections)))

ACCEPTABLE <- c("ok", "ok_with_warnings", "ok_empty_output")

# --- Run every section; one failure does not stop the rest -------------------
results <- list()
for (section in names(cfg$sections)) {
  cat(sprintf("\n----- section: %s -----\n", section))
  res <- tryCatch({
    sec <- cfg$sections[[section]]
    if (is.null(sec$cwd) || is.null(sec$scripts)) {
      stop("section '", section, "' missing `cwd`/`scripts` in _whirl.yaml")
    }
    cwd_abs <- file.path(REPO_ROOT, sec$cwd)
    scripts <- unlist(sec$scripts)
    run_id  <- format(Sys.time(), paste0(section, "-%Y%m%dT%H%M%S"))
    run_one_section(section = section, sec = sec, cwd_abs = cwd_abs,
                    scripts = scripts, dry_run = dry_run,
                    log_path = log_path, run_id = run_id,
                    repo_root = REPO_ROOT, refresh_id = refresh_id)
  }, error = function(e) {
    # An uncaught stop() (e.g. the handoff manifest-missing guard) is recorded as
    # a section error and the loop CONTINUES to the next section.
    cat(sprintf("  !! section '%s' aborted: %s\n", section, conditionMessage(e)))
    list(section = section, status = "error", failed_at = NA, phase = "uncaught",
         n_warnings = 0L, empty_outputs = character(0))
  })
  results[[section]] <- res
}

# --- Per-section summary table ----------------------------------------------
cat("\n\n=== REFRESH SUMMARY ===\n")
cat(sprintf("%-22s %-17s %-9s %-6s %s\n",
            "section", "status", "phase", "warns", "empty_outputs"))
cat(strrep("-", 80), "\n", sep = "")
any_fail  <- FALSE
any_empty <- FALSE
for (section in names(results)) {
  r    <- results[[section]]
  eo   <- if (length(r$empty_outputs)) paste(r$empty_outputs, collapse = ",") else "-"
  flag <- ""
  if (!r$status %in% ACCEPTABLE) { any_fail  <- TRUE; flag <- "  <== FAIL" }
  if (identical(r$status, "ok_empty_output")) {
    any_empty <- TRUE; flag <- "  <== EMPTY OUTPUT (flagged, NOT published)"
  }
  cat(sprintf("%-22s %-17s %-9s %-6s %s%s\n",
              section, r$status, r$phase, r$n_warnings, eo, flag))
}
if (any_empty) {
  cat("\nNOTE: ok_empty_output section(s) completed but withheld empty outputs from",
      "publish.\n      The refresh did NOT fail on this — but it needs a human look.\n")
}
cat(sprintf("\nrefresh_id: %s\nlog: %s\n", refresh_id, log_path))

# --- Layer 1: render this run's report + regenerate the index ----------------
# POST-PUBLICATION and ADDITIVE: render_all() writes only to runs/reports/, never
# the pipeline outputs or the JSONL — so it cannot perturb what the sections just
# produced. The just-finished run's report does not exist yet, so the incremental
# renderer renders it (and any not-yet-rendered run) and always rebuilds index.html.
# Wrapped so a render failure can never fail an otherwise-successful refresh.
tryCatch({
  source(file.path(REPO_ROOT, "render_report.R"))
  render_all(repo_root = REPO_ROOT)
}, error = function(e) cat(sprintf("  [report] render skipped: %s\n", conditionMessage(e))))

quit(status = if (any_fail) 1L else 0L)
