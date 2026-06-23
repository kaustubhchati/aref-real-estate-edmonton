# pipeline/_run_engine.R
# -----------------------------------------------------------------------------
# Contract: run_one_section() runs ONE section — a dry-run validation OR a live
# run (fresh process per script + handoff publish) — and RETURNS a status
# contract instead of calling quit(). The caller (run_section.R) maps the
# contract to a process exit code; a future multi-section driver can call this
# in a loop without a per-section quit() aborting the whole process.
#
# This file is SOURCED, never run directly. It has NO top-level side effects.
#
# WHY a return contract, not quit():
#   The original run_section.R ended each phase with quit(status=...), which
#   terminates the whole R process. Lifting the body into a function that
#   returns instead lets a loop run PA, then BP, then aggregate.
#
# Returned contract (list):
#   section     the section name (echoed back)
#   status      "ok" | "error"
#   failed_at   the script that errored on a live run, else NA
#   phase       "dry_run" | "scripts" | "handoff" — phase the outcome came from
#   n_warnings  total warnings collected across all scripts (0L on a dry-run)
#
# Everything inside is moved VERBATIM from run_section.R (the live-run setup,
# per-script callr loop, and handoff phase). The ONLY changes are: the three
# quit() calls became return(<contract>); the hardcoded 08d/07 order check
# became a data-driven read of sec$order_invariants; and two accounting locals
# (failed_at, total_warnings) were added to populate the contract.
# -----------------------------------------------------------------------------

run_one_section <- function(section, sec, cwd_abs, scripts, dry_run,
                            log_path, run_id, repo_root) {

  REPO_ROOT <- repo_root   # the moved handoff paths are written against REPO_ROOT

  # --- Dry run: prove cwd + path existence + order, NO side effects -----------
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
    # Order invariants are DATA-DRIVEN from the section config: each {before,
    # after} pair must appear in that order in `scripts`. An absent key => no
    # invariant => passes — which is what un-breaks non-PA sections (they carry
    # no such pairs). This replaces the former hardcoded PA 08d-before-07 match,
    # whose literal script names made every other section's dry run mis-fail.
    invs   <- sec$order_invariants
    ord_ok <- TRUE
    if (!is.null(invs)) {
      for (inv in invs) {
        ib     <- match(inv$before, scripts)
        ia     <- match(inv$after,  scripts)
        ok_inv <- !is.na(ib) && !is.na(ia) && ib < ia
        ord_ok <- ord_ok && ok_inv
        cat(sprintf("      %s before %s? %s  (%s at #%s, %s at #%s)\n",
                    basename(inv$before), basename(inv$after), ok_inv,
                    basename(inv$before), ib, basename(inv$after), ia))
      }
    }
    cat(sprintf("RESULT: all scripts exist = %s ; order invariant held = %s\n",
                all_ok, ord_ok))
    return(list(section   = section,
                status    = if (all_ok && ord_ok) "ok" else "error",
                failed_at = NA, phase = "dry_run", n_warnings = 0L))
  }

  # --- Live run: fresh process per script, JSONL run log, fail-fast ----------
  dir.create(dirname(log_path), showWarnings = FALSE, recursive = TRUE)

  append_record <- function(rec) {
    line <- jsonlite::toJSON(rec, auto_unbox = TRUE, null = "null")
    cat(line, "\n", file = log_path, sep = "", append = TRUE)
  }

  cat(sprintf("=== LIVE RUN: section '%s' (run_id=%s) ===\n", section, run_id))
  cat(sprintf("    cwd: %s\n    log: %s\n\n", cwd_abs, log_path))

  failed         <- FALSE
  failed_at      <- NA_character_      # contract: which script errored
  total_warnings <- 0L                 # contract: warnings across all scripts
  for (i in seq_along(scripts)) {
    script_rel <- scripts[i]
    script_abs <- file.path(cwd_abs, script_rel)
    started_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
    t0 <- Sys.time()
    status <- "ok"; message <- ""
    warns <- character(0)
    error_line <- NULL; error_call <- NULL; stderr_tail <- NULL

    cat(sprintf("[%d/%d] %s ... ", i, length(scripts), script_rel))

    # Fresh process. wd = section cwd so the script's bare-relative paths resolve.
    # The payload (a) sets keep.source = TRUE so srcrefs survive into the error
    # stack, and (b) installs a calling handler that COLLECTS each warning message
    # then muffles it, returning the collected vector. Muffling only suppresses the
    # warning's PRINTING; it never changes a value the script computes, so outputs
    # stay byte-identical (proven by the byte-neutrality gate). error = "stack"
    # preserves the child call stack on the error object for best-effort detail.
    # tryCatch turns a child failure into a record, not a thrown exception.
    out <- tryCatch(
      {
        r <- callr::r(
          func   = function(s) {
            options(keep.source = TRUE)
            warns <- character(0)
            withCallingHandlers(
              source(s, echo = FALSE),
              warning = function(w) {
                warns[[length(warns) + 1L]] <<- conditionMessage(w)
                invokeRestart("muffleWarning")
              }
            )
            list(warnings = warns)
          },
          args   = list(s = script_abs),
          wd     = cwd_abs,
          error  = "stack",
          stdout = "|", stderr = "|", spinner = FALSE
        )
        w <- as.character(r$warnings)
        list(status      = if (length(w)) "ok_with_warnings" else "ok",
             message     = "", warnings = w,
             error_line  = NULL, error_call = NULL, stderr_tail = NULL)
      },
      error = function(e) {
        # Best-effort failure detail from callr's PRESERVED stack (error="stack").
        # Each extraction is independently guarded: an unrecoverable field becomes
        # NULL, never a wrong value. We read the structured dump.frames call labels
        # names(e$stack) — R's own "<file>#<line>: <call>" annotations — NOT raw
        # stderr text. The deepest (last) frame is where the error originated.
        # VERSION COUPLING: this parse depends on callr's error class rlib_error_3_0
        # exposing names(e$stack) in that "<file>#<line>: <call>" label format. If a
        # callr upgrade changes the class or the label shape, error_line/error_call
        # degrade to NULL — this parser is the first suspect.
        lbl <- tryCatch(utils::tail(names(e$stack), 1L), error = function(.) NULL)
        el <- tryCatch({
          m <- regmatches(lbl, regexec("#(\\d+): ", lbl))[[1]]
          if (length(m) == 2L) as.integer(m[2]) else NULL
        }, error = function(.) NULL)
        ec <- tryCatch({
          # Only return a call when the "#<line>: " prefix ACTUALLY matched; sub()
          # would otherwise return lbl unchanged, leaking a raw stack label as if it
          # were a recovered call. No prefix -> NULL, which pairs with el above (both
          # key on the same "#<digits>: " presence, so error_call is NULL whenever
          # error_line is NULL).
          if (is.null(lbl) || !nzchar(lbl)) NULL
          else if (grepl("#\\d+: ", lbl)) sub("^[^#]*#\\d+: ", "", lbl)
          else NULL
        }, error = function(.) NULL)
        # stderr_tail: the subprocess's diagnostic output tail. This callr version
        # carries no $stderr field — the captured output lands in $stdout — so read
        # $stderr first, then fall back to $stdout; last 20 lines, re-joined.
        st <- tryCatch({
          txt <- e$stderr
          if (is.null(txt) || all(!nzchar(txt))) txt <- e$stdout
          if (is.null(txt) || all(!nzchar(txt))) NULL
          else {
            ln <- strsplit(paste(txt, collapse = "\n"), "\n", fixed = TRUE)[[1]]
            paste(utils::tail(ln, 20L), collapse = "\n")
          }
        }, error = function(.) NULL)
        list(status      = "error", message = conditionMessage(e),
             warnings    = character(0),  # a thrown child discards its return value
             error_line  = el, error_call = ec, stderr_tail = st)
      }
    )
    status <- out$status; message <- out$message; warns <- out$warnings
    error_line <- out$error_line; error_call <- out$error_call
    stderr_tail <- out$stderr_tail
    total_warnings <- total_warnings + length(warns)   # ADDED: contract accounting
    duration_secs <- round(as.numeric(difftime(Sys.time(), t0, units = "secs")), 2)

    # finally-equivalent: build + persist the record no matter what, so it
    # survives an interrupt between scripts. schema_version pins the JSONL shape;
    # warnings is I()-wrapped so it ALWAYS serializes as a JSON array (a length-1
    # vector would otherwise auto_unbox to a bare string).
    rec <- list(
      schema_version = 1L,
      run_id        = run_id,
      section       = section,
      script        = script_rel,
      status        = status,
      message       = message,
      warnings      = I(warns),
      error_line    = error_line,
      error_call    = error_call,
      stderr_tail   = stderr_tail,
      started_at    = started_at,
      duration_secs = duration_secs
    )
    tryCatch(append_record(rec), finally = NULL)

    # Three-state: error fails the chain fast; ok and ok_with_warnings both
    # continue, the latter printed distinctly so warnings are visible on the run.
    if (status == "error") {
      cat("ERROR\n")
      cat(sprintf("\nFAIL-FAST: '%s' errored after %.1fs:\n  %s\n",
                  script_rel, duration_secs, message))
      cat("Chain is dependency-ordered — downstream scripts NOT run.\n")
      failed    <- TRUE
      failed_at <- script_rel                          # ADDED: contract accounting
      break
    } else if (status == "ok_with_warnings") {
      cat(sprintf("ok* (%d warning%s) (%.1fs)\n",
                  length(warns), if (length(warns) == 1L) "" else "s", duration_secs))
    } else {
      cat(sprintf("ok (%.1fs)\n", duration_secs))
    }
  }

  if (failed) {
    return(list(section = section, status = "error",
                failed_at = failed_at, phase = "scripts",
                n_warnings = total_warnings))
  }
  cat(sprintf("\nAll %d scripts completed ok.\n", length(scripts)))

  phase <- "scripts"   # advances to "handoff" if a handoff block runs below

  # --- Handoff phase: publish output/ -> website/public ----------------------
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
    phase <- "handoff"
    cat("\n=== HANDOFF: publish output/ -> website/public ===\n")
    hf_failed <- FALSE

    # Generic copy: ensure dest dir, copy, log the record. Returns TRUE on success.
    copy_one <- function(from, to) {
      dir.create(dirname(to), showWarnings = FALSE, recursive = TRUE)
      ok <- file.exists(from) && file.copy(from, to, overwrite = TRUE)
      append_record(list(schema_version = 1L, run_id = run_id, section = section,
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
        append_record(list(schema_version = 1L, run_id = run_id, section = section,
                           action = "handoff_copy", from = from, to = to, status = st))
        cat(sprintf("  [%s] %s -> public\n", st, fname))
      }

      # Publish the manifest itself.
      man_to <- file.path(REPO_ROOT, hf$manifest_dest)
      ok <- file.copy(manifest_src, man_to, overwrite = TRUE)
      st <- if (ok) "ok" else "error"
      if (!ok) hf_failed <- TRUE
      append_record(list(schema_version = 1L, run_id = run_id, section = section,
                         action = "handoff_copy", from = manifest_src, to = man_to, status = st))
      cat(sprintf("  [%s] manifest.json -> public\n", st))
      cat(sprintf("Handoff published %d year(s) + manifest to public.\n", length(years)))
    }

    if (hf_failed) {
      cat("\nHANDOFF FAILED — a copy did not complete (see records above).\n")
      return(list(section = section, status = "error",
                  failed_at = NA, phase = "handoff",
                  n_warnings = total_warnings))
    }
    cat("Handoff complete.\n")
  }

  cat(sprintf("\nDone. Log: %s\n", log_path))
  return(list(section = section, status = "ok",
              failed_at = NA, phase = phase, n_warnings = total_warnings))
}
