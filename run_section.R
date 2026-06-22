# run_section.R
# -----------------------------------------------------------------------------
# Contract: runs ONE section's scripts in declared DEPENDENCY order, each in a
# FRESH R process, from the section's declared cwd.
#
# WHY fresh-process-per-script (callr::r):
#   A correct pipeline script depends only on its DISK inputs (files produced by
#   earlier scripts), never on objects left in an R session by a prior script.
#   Running each script in its own process via callr enforces that: no leaked
#   variables, no shared options, no cross-script session state. If a script
#   needs something a predecessor made, it must read it from disk — which is
#   exactly the contract an orchestrator (whirl/cron) will run under. A script
#   that only works when source()'d into a warm session is a bug this surfaces.
#
# WHY cwd from _whirl.yaml, not .Rproj:
#   Every script uses bare-relative own-section I/O (data/..., output/...), so
#   the working directory IS load-bearing. cwd is declared authoritatively per
#   section in _whirl.yaml and set per-process here. It is NEVER inferred from an
#   .Rproj file (economy/business-census has none; .Rproj is an RStudio marker,
#   not a run contract).
#
# WHY fail-fast:
#   The script list is dependency-ordered. If an upstream script errors, every
#   downstream script's inputs are missing or stale, so continuing produces
#   silently-wrong output. On the first error we record it, print it, and stop
#   the chain (quit status 1).
#
# Anchor: repo root (and _whirl.yaml) is located via the .aref_root sentinel,
#   so this runs from any directory inside the repo tree.
#
# Usage:
#   Rscript run_section.R <section> --dry-run   # resolve + prove, execute nothing
#   DRY_RUN=1 Rscript run_section.R <section>   # same, via env
#   Rscript run_section.R <section>             # LIVE (fresh process per script)
# -----------------------------------------------------------------------------

# --- Anchor + config ---------------------------------------------------------
REPO_ROOT <- rprojroot::find_root(rprojroot::has_file(".aref_root"))
cfg_path  <- file.path(REPO_ROOT, "_whirl.yaml")
stopifnot(file.exists(cfg_path))
cfg <- yaml::read_yaml(cfg_path)

# Shape guard: stop + report the ACTUAL shape rather than reshaping the config.
if (is.null(cfg$sections) || !is.list(cfg$sections)) {
  stop("_whirl.yaml shape mismatch: expected a top-level `sections:` map. ",
       "Found top-level keys: ", paste(names(cfg), collapse = ", "))
}

# --- Args --------------------------------------------------------------------
args    <- commandArgs(trailingOnly = TRUE)
dry_run <- ("--dry-run" %in% args) || nzchar(Sys.getenv("DRY_RUN"))
section <- args[!startsWith(args, "--")][1]
if (is.na(section)) {
  stop("Usage: Rscript run_section.R <section> [--dry-run]")
}
if (is.null(cfg$sections[[section]])) {
  stop("Section not in _whirl.yaml: ", section,
       "\n  Known sections: ", paste(names(cfg$sections), collapse = ", "))
}

sec <- cfg$sections[[section]]
if (is.null(sec$cwd) || is.null(sec$scripts)) {
  stop("_whirl.yaml shape mismatch for section '", section,
       "': expected `cwd` and `scripts` keys. Found: ",
       paste(names(sec), collapse = ", "))
}

cwd_abs <- file.path(REPO_ROOT, sec$cwd)
scripts <- unlist(sec$scripts)

# --- Dry run: prove cwd + path existence + order, NO side effects ------------
if (dry_run) {
  cat(sprintf("=== DRY RUN: section '%s' ===\n", section))
  cat(sprintf("(a) resolved cwd: %s   [dir exists: %s]\n",
              cwd_abs, dir.exists(cwd_abs)))
  cat("(b) scripts (declared order, resolved path, exists):\n")
  all_ok <- TRUE
  for (i in seq_along(scripts)) {
    ok <- file.exists(file.path(cwd_abs, scripts[i]))
    all_ok <- all_ok && ok
    cat(sprintf("    %2d. %-50s  exists: %s\n", i, scripts[i], ok))
  }
  cat(sprintf("(c) execution order (DEPENDENCY, not numeric):\n      %s\n",
              paste(basename(scripts), collapse = " -> ")))
  i08d <- match("scripts/production/08d_hist_aggregate.R",  scripts)
  i07  <- match("scripts/production/07_layer2_aggregates.R", scripts)
  ord_ok <- !is.na(i08d) && !is.na(i07) && i08d < i07
  cat(sprintf("      08d before 07? %s  (08d at #%s, 07 at #%s)\n",
              ord_ok, i08d, i07))
  cat(sprintf("RESULT: all scripts exist = %s ; order invariant held = %s\n",
              all_ok, ord_ok))
  quit(status = if (all_ok && ord_ok) 0L else 1L)
}

# --- Live run: fresh process per script, JSONL run log, fail-fast ------------
log_dir  <- file.path(REPO_ROOT, "runs")
dir.create(log_dir, showWarnings = FALSE, recursive = TRUE)
log_path <- file.path(log_dir, "refresh_runs.jsonl")

# run_id groups one section invocation. No Date.now()/random needed: a stable
# stamp from Sys.time() is fine here (this is a runtime log, not a cached value).
run_id <- format(Sys.time(), paste0(section, "-%Y%m%dT%H%M%S"))

append_record <- function(rec) {
  line <- jsonlite::toJSON(rec, auto_unbox = TRUE, null = "null")
  cat(line, "\n", file = log_path, sep = "", append = TRUE)
}

cat(sprintf("=== LIVE RUN: section '%s' (run_id=%s) ===\n", section, run_id))
cat(sprintf("    cwd: %s\n    log: %s\n\n", cwd_abs, log_path))

failed <- FALSE
for (i in seq_along(scripts)) {
  script_rel <- scripts[i]
  script_abs <- file.path(cwd_abs, script_rel)
  started_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
  t0 <- Sys.time()
  status <- "ok"; message <- ""

  cat(sprintf("[%d/%d] %s ... ", i, length(scripts), script_rel))

  # Fresh process. wd = section cwd so the script's bare-relative paths resolve.
  # tryCatch turns a child failure into a record, not a thrown exception.
  out <- tryCatch(
    {
      r <- callr::r(
        func   = function(s) source(s, echo = FALSE),
        args   = list(s = script_abs),
        wd     = cwd_abs,
        stdout = "|", stderr = "|", spinner = FALSE
      )
      list(status = "ok", message = "")
    },
    error = function(e) list(status = "error", message = conditionMessage(e))
  )
  status <- out$status; message <- out$message
  duration_secs <- round(as.numeric(difftime(Sys.time(), t0, units = "secs")), 2)

  # finally-equivalent: build + persist the record no matter what, so it
  # survives an interrupt between scripts.
  rec <- list(
    run_id        = run_id,
    section       = section,
    script        = script_rel,
    status        = status,
    message       = message,
    started_at    = started_at,
    duration_secs = duration_secs
  )
  tryCatch(append_record(rec), finally = NULL)

  if (status == "ok") {
    cat(sprintf("ok (%.1fs)\n", duration_secs))
  } else {
    cat("ERROR\n")
    cat(sprintf("\nFAIL-FAST: '%s' errored after %.1fs:\n  %s\n",
                script_rel, duration_secs, message))
    cat("Chain is dependency-ordered — downstream scripts NOT run.\n")
    failed <- TRUE
    break
  }
}

if (failed) quit(status = 1L)
cat(sprintf("\nAll %d scripts completed ok.\n", length(scripts)))

# --- Handoff phase: publish output/ -> website/public ------------------------
# Only reached on FULL script success (fail-fast above). The runner is the SOLE
# writer of website/public. Two GENERIC, config-driven copy mechanisms a section
# may declare (Way A — copy files that PHYSICALLY EXIST; never parse a manifest's
# structure to decide what to copy):
#   glob:  [{src_dir, dest_dir, pattern}]  copy every match in src_dir -> dest_dir
#          (same filename; src_dir != dest_dir gives a directory remap).
#   files: [{from, to}]                    copy specific files (CSVs, the manifest).
# A LEGACY manifest-year-driven path (PA's original shape) is kept verbatim and
# runs only when the block declares `geojson_pattern`, so PA stays byte-identical.
# Each copy logs a JSONL record (action="handoff_copy").
hf <- sec$handoff
if (!is.null(hf)) {
  cat("\n=== HANDOFF: publish output/ -> website/public ===\n")
  hf_failed <- FALSE

  # Generic copy: ensure dest dir, copy, log the record. Returns TRUE on success.
  copy_one <- function(from, to) {
    dir.create(dirname(to), showWarnings = FALSE, recursive = TRUE)
    ok <- file.exists(from) && file.copy(from, to, overwrite = TRUE)
    append_record(list(run_id = run_id, section = section,
                       action = "handoff_copy", from = from, to = to,
                       status = if (ok) "ok" else "error"))
    cat(sprintf("  [%s] %s -> %s\n", if (ok) "ok" else "error",
                basename(from), dirname(to)))
    ok
  }

  # --- Way A: glob (directory copy, optional remap) ---------------------------
  if (!is.null(hf$glob)) {
    for (g in hf$glob) {
      src_abs <- file.path(cwd_abs, g$src_dir)
      matches <- list.files(src_abs, pattern = utils::glob2rx(g$pattern),
                            full.names = FALSE)
      for (f in matches) {
        if (!copy_one(file.path(src_abs, f),
                      file.path(REPO_ROOT, g$dest_dir, f))) hf_failed <- TRUE
      }
    }
  }

  # --- Way A: files (specific from -> to: CSVs, the manifest file) -----------
  if (!is.null(hf$files)) {
    for (cp in hf$files) {
      if (!copy_one(file.path(cwd_abs, cp$from),
                    file.path(REPO_ROOT, cp$to))) hf_failed <- TRUE
    }
  }

  # --- LEGACY manifest-year path (PA) — unchanged; runs only with geojson_pattern
  if (!is.null(hf$geojson_pattern)) {
    manifest_src <- file.path(cwd_abs, hf$manifest)
    if (!file.exists(manifest_src)) {
      stop("handoff: manifest not found at ", manifest_src,
           " — 09a must emit it before the handoff.")
    }
    man <- jsonlite::read_json(manifest_src)

    # Years from EVERY city in the manifest (no year/city literals).
    years <- integer(0)
    for (city in names(man$cities)) {
      ya <- man$cities[[city]]$assessment$years
      if (!is.null(ya)) years <- c(years, unlist(ya))
    }
    years <- sort(unique(years))

    dest_dir <- file.path(REPO_ROOT, hf$dest_dir)
    dir.create(dest_dir, showWarnings = FALSE, recursive = TRUE)

    for (yr in years) {
      fname <- gsub("\\{year\\}", as.character(yr), hf$geojson_pattern)
      from  <- file.path(cwd_abs, hf$geojson_src_dir, fname)
      to    <- file.path(dest_dir, fname)
      ok    <- file.exists(from) && file.copy(from, to, overwrite = TRUE)
      st    <- if (ok) "ok" else "error"
      if (!ok) hf_failed <- TRUE
      append_record(list(run_id = run_id, section = section,
                         action = "handoff_copy", from = from, to = to, status = st))
      cat(sprintf("  [%s] %s -> public\n", st, fname))
    }

    # Publish the manifest itself.
    man_to <- file.path(REPO_ROOT, hf$manifest_dest)
    ok <- file.copy(manifest_src, man_to, overwrite = TRUE)
    st <- if (ok) "ok" else "error"
    if (!ok) hf_failed <- TRUE
    append_record(list(run_id = run_id, section = section,
                       action = "handoff_copy", from = manifest_src, to = man_to, status = st))
    cat(sprintf("  [%s] manifest.json -> public\n", st))
    cat(sprintf("Handoff published %d year(s) + manifest to public.\n", length(years)))
  }

  if (hf_failed) {
    cat("\nHANDOFF FAILED — a copy did not complete (see records above).\n")
    quit(status = 1L)
  }
  cat("Handoff complete.\n")
}

cat(sprintf("\nDone. Log: %s\n", log_path))
