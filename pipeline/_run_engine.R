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
# refresh_id (C2): NULL for the single-section caller (run_section.R) -> records
#   carry schema_version = 1L and NO refresh_id field (the frozen v1 shape). When
#   the cross-section driver (refresh.R) passes a refresh_id, records carry
#   schema_version = 2L + that refresh_id. That is the ONLY v1-vs-v2 difference.
#
# Returned contract (list):
#   section        the section name (echoed back)
#   status         "ok" | "ok_empty_output" | "error"
#   failed_at      the script that errored on a live run, else NA
#   phase          "dry_run" | "scripts" | "handoff" — phase the outcome came from
#   n_warnings     total warnings collected across all scripts (0L on a dry-run)
#   empty_outputs  cwd-relative declared outputs found missing/empty (else empty)
#
# ok_empty_output (C2): if a script's declared expected_outputs are missing or
#   zero-byte, its status becomes ok_empty_output and the chain CONTINUES (it is a
#   loud flag, like a warning — not a failure). The handoff then REFUSES to publish
#   any zero-byte source (logs handoff_skip_empty), so "surface-and-continue" never
#   silently becomes "surface-and-publish-empty".
#
# Durable run records (Tier 0): every per-script record additionally carries the
#   child's captured console output and any metrics it emitted, on SUCCESS as well
#   as on failure (previously these survived only on error). New per-script fields:
#     stdout_tail / stderr_tail  last 50 lines of the child's stdout / stderr
#     stdout_log  / stderr_log   repo-relative path to the FULL captured streams
#                                (runs/<run_id>/<script>.{out,err}.log; gitignored)
#     metrics                    named list a script opted into via RUN_METRICS
#   A script emits metrics by assigning into the pre-seeded global RUN_METRICS, e.g.
#     RUN_METRICS[["boundary_polygons"]] <- nrow(boundary_sf)
#   The runner pre-creates RUN_METRICS as an empty list in the child's global env,
#   so a script only appends; one that never touches it emits none (field omitted).
#   The handoff also emits one action="section_metrics" record per section carrying
#   published_files (a count the runner already knows). These are ADDITIVE fields:
#   schema_version still means single(1)/refresh(2) only, and render_report.R
#   null-coalesces unknown keys, so existing consumers are unaffected.
# -----------------------------------------------------------------------------

run_one_section <- function(section, sec, cwd_abs, scripts, dry_run,
                            log_path, run_id, repo_root, refresh_id = NULL) {

  REPO_ROOT <- repo_root   # the moved handoff paths are written against REPO_ROOT

  # Resolve a year token in an expected_outputs declaration against the files on
  # disk. Two tokens, because the two ends of a year range mean different things:
  #
  #   {year}        the NEWEST match. For a script that writes the current year
  #                 (05's aggregate, 06's choropleth), this is its own product.
  #   {oldestYear}  the OLDEST match. 07 builds the historical range, and 06 has
  #                 already written the current year into the SAME filename
  #                 pattern by the time 07's guard runs — so "newest" there would
  #                 check 06's file, not 07's. The oldest year is unambiguously
  #                 07's, and it is data-derived (nothing hardcodes the start).
  #
  # WHY THIS MATTERS: a literal year here does not fail at rollover, it goes
  # QUIET. The declared file still exists from last year, so the guard passes
  # while checking a file this run never wrote. A guard that silently stops
  # guarding is worse than one that breaks loudly.
  #
  # No match leaves the token in the path, so the guard reports it missing —
  # which is the correct answer when a script produced nothing.
  resolve_declared_year <- function(cwd_abs, p) {
    token <- if (grepl("{oldestYear}", p, fixed = TRUE)) "{oldestYear}"
             else if (grepl("{year}", p, fixed = TRUE)) "{year}"
             else return(p)
    glob_name <- gsub(token, "????", basename(p), fixed = TRUE)
    hits <- list.files(file.path(cwd_abs, dirname(p)),
                       pattern = utils::glob2rx(glob_name))
    if (length(hits) == 0) return(p)
    chosen <- if (identical(token, "{oldestYear}")) min(hits) else max(hits)
    year   <- regmatches(chosen, regexpr("[0-9]{4}", chosen))
    if (length(year) != 1L) return(p)
    gsub(token, year, p, fixed = TRUE)
  }

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
                failed_at = NA, phase = "dry_run", n_warnings = 0L,
                empty_outputs = character(0)))
  }

  # --- Live run: fresh process per script, JSONL run log, fail-fast ----------
  dir.create(dirname(log_path), showWarnings = FALSE, recursive = TRUE)

  # Schema/refresh stamping is centralized here so every record is consistent and
  # the call sites stay clean (they build records WITHOUT schema_version):
  #   refresh_id NULL -> schema_version = 1L only         (v1, single-section)
  #   refresh_id set  -> schema_version = 2L + refresh_id  (v2, cross-section)
  # The v1 byte shape is unchanged: schema_version is prepended in the same place
  # and key order as before.
  schema_ver <- if (is.null(refresh_id)) 1L else 2L
  append_record <- function(rec) {
    rec  <- if (is.null(refresh_id)) c(list(schema_version = schema_ver), rec)
            else      c(list(schema_version = schema_ver, refresh_id = refresh_id), rec)
    line <- jsonlite::toJSON(rec, auto_unbox = TRUE, null = "null")
    cat(line, "\n", file = log_path, sep = "", append = TRUE)
  }

  cat(sprintf("=== LIVE RUN: section '%s' (run_id=%s) ===\n", section, run_id))
  cat(sprintf("    cwd: %s\n    log: %s\n\n", cwd_abs, log_path))

  failed                <- FALSE
  failed_at             <- NA_character_   # contract: which script errored
  total_warnings        <- 0L              # contract: warnings across all scripts
  any_empty             <- FALSE           # contract: any expected output empty?
  section_empty_outputs <- character(0)    # cwd-relative empty paths (report)
  section_empty_set     <- character(0)    # normalized-absolute (handoff guard)
  for (i in seq_along(scripts)) {
    script_rel <- scripts[i]
    script_abs <- file.path(cwd_abs, script_rel)
    started_at <- format(Sys.time(), "%Y-%m-%dT%H:%M:%S%z")
    t0 <- Sys.time()
    status <- "ok"; message <- ""
    warns <- character(0)
    error_line <- NULL; error_call <- NULL
    run_metrics <- NULL

    # Durable capture (Tier 0): the child's stdout/stderr are redirected to per-run
    # files so cat()/print() (stdout) and message() (stderr) diagnostics survive a
    # SUCCESSFUL run, not only a failure. run_id namespaces the dir; the basename
    # keeps each file human-scannable. runs/ is gitignored -> laptop-durable (the
    # committed refresh history is the Tier-4 digest, not these files).
    capture_dir <- file.path(dirname(log_path), run_id)
    dir.create(capture_dir, showWarnings = FALSE, recursive = TRUE)
    out_log <- file.path(capture_dir, paste0(basename(script_rel), ".out.log"))
    err_log <- file.path(capture_dir, paste0(basename(script_rel), ".err.log"))

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
            # Pre-seed the metrics sink so a script only APPENDS (no per-script
            # boilerplate): RUN_METRICS[["key"]] <- value. Read it back after
            # source; a script that never touches it emits an empty list.
            assign("RUN_METRICS", list(), envir = globalenv())
            warns <- character(0)
            withCallingHandlers(
              source(s, echo = FALSE),
              warning = function(w) {
                warns[[length(warns) + 1L]] <<- conditionMessage(w)
                invokeRestart("muffleWarning")
              }
            )
            m <- tryCatch(get("RUN_METRICS", envir = globalenv()),
                          error = function(.) list())
            list(warnings = warns, metrics = m)
          },
          args   = list(s = script_abs),
          wd     = cwd_abs,
          error  = "stack",
          stdout = out_log, stderr = err_log, spinner = FALSE
        )
        w <- as.character(r$warnings)
        list(status      = if (length(w)) "ok_with_warnings" else "ok",
             message     = "", warnings = w, metrics = r$metrics,
             error_line  = NULL, error_call = NULL, stderr_fallback = NULL)
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
        # The captured stdout/stderr FILES already hold the child's output up to the
        # crash (read below, after the tryCatch). e$stdout is a last-resort fallback
        # only if that file is empty (a failure before any output flushed); last 50
        # lines, re-joined. Read $stderr first, then fall back to $stdout.
        st <- tryCatch({
          txt <- e$stderr
          if (is.null(txt) || all(!nzchar(txt))) txt <- e$stdout
          if (is.null(txt) || all(!nzchar(txt))) NULL
          else {
            ln <- strsplit(paste(txt, collapse = "\n"), "\n", fixed = TRUE)[[1]]
            paste(utils::tail(ln, 50L), collapse = "\n")
          }
        }, error = function(.) NULL)
        list(status      = "error", message = conditionMessage(e),
             warnings    = character(0),  # a thrown child discards its return value
             metrics     = NULL,
             error_line  = el, error_call = ec, stderr_fallback = st)
      }
    )
    status <- out$status; message <- out$message; warns <- out$warnings
    error_line <- out$error_line; error_call <- out$error_call
    run_metrics <- out$metrics

    # Read the captured streams (BOTH success and error). Tail = last 50 lines (a
    # script's summary block clusters at the end); the full stream stays in the
    # sibling .log. On error, fall back to callr's in-memory tail if the file is
    # empty, so the error path records at least as much as it did before.
    read_tail <- function(p, n = 50L) {
      if (!file.exists(p)) return(NULL)
      ln <- tryCatch(readLines(p, warn = FALSE), error = function(.) NULL)
      if (is.null(ln) || !length(ln)) return(NULL)
      paste(utils::tail(ln, n), collapse = "\n")
    }
    stdout_tail <- read_tail(out_log)
    stderr_tail <- read_tail(err_log)
    if (is.null(stderr_tail)) stderr_tail <- out$stderr_fallback
    total_warnings <- total_warnings + length(warns)   # ADDED: contract accounting

    # Expected-outputs guard (C2): after a NON-error script, assert each declared
    # output exists AND is non-empty. Any missing/empty -> ok_empty_output (the
    # chain still CONTINUES, per the surface-and-continue ruling); the handoff
    # below refuses to publish the empty file. Absent declaration -> no check.
    empties_here <- character(0)
    if (status != "error") {
      decl <- sec$expected_outputs[[script_rel]]
      if (!is.null(decl)) {
        for (p in unlist(decl)) {
          p  <- resolve_declared_year(cwd_abs, p)
          ap <- file.path(cwd_abs, p)
          if (!file.exists(ap) || file.size(ap) == 0) empties_here <- c(empties_here, p)
        }
        if (length(empties_here)) {
          status                <- "ok_empty_output"
          any_empty             <- TRUE
          section_empty_outputs <- c(section_empty_outputs, empties_here)
          section_empty_set     <- c(section_empty_set,
                                     normalizePath(file.path(cwd_abs, empties_here),
                                                   mustWork = FALSE))
        }
      }
    }

    duration_secs <- round(as.numeric(difftime(Sys.time(), t0, units = "secs")), 2)

    # finally-equivalent: build + persist the record no matter what, so it
    # survives an interrupt between scripts. schema_version pins the JSONL shape;
    # warnings is I()-wrapped so it ALWAYS serializes as a JSON array (a length-1
    # vector would otherwise auto_unbox to a bare string).
    rec <- list(
      run_id        = run_id,
      section       = section,
      script        = script_rel,
      status        = status,
      message       = message,
      warnings      = I(warns),
      metrics       = if (length(run_metrics)) run_metrics else NULL,
      error_line    = error_line,
      error_call    = error_call,
      stdout_tail   = stdout_tail,
      stderr_tail   = stderr_tail,
      stdout_log    = sub(paste0(REPO_ROOT, "/"), "", out_log, fixed = TRUE),
      stderr_log    = sub(paste0(REPO_ROOT, "/"), "", err_log, fixed = TRUE),
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
    } else if (status == "ok_empty_output") {
      cat(sprintf("ok! EMPTY OUTPUT [%s] (%.1fs)  -- flagged, chain continues, NOT published\n",
                  paste(empties_here, collapse = ", "), duration_secs))
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
                n_warnings = total_warnings,
                empty_outputs = section_empty_outputs))
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
    hf_failed  <- FALSE
    n_published <- 0L   # successful file.copy count -> section_metrics (Tier 0)

    # Generic copy with the PUBLISH-BOUNDARY zero-byte guard (C2). A source that
    # is zero-byte (or a declared output the expected-outputs guard already
    # flagged) is NOT published: it logs handoff_skip_empty and returns TRUE so
    # the handoff continues (surface-and-continue; the prior good published file
    # stays in place, untouched). A MISSING source that was NOT flagged is still a
    # hard error, exactly as before. Records are built WITHOUT schema_version
    # (append_record stamps it).
    copy_one <- function(from, to) {
      exists  <- file.exists(from)
      zero    <- exists && file.size(from) == 0
      flagged <- normalizePath(from, mustWork = FALSE) %in% section_empty_set
      if (zero || (flagged && !exists)) {
        append_record(list(run_id = run_id, section = section,
                           action = "handoff_skip_empty", from = from, to = to,
                           status = "skipped_empty"))
        cat(sprintf("  [skip-empty] %s  (zero-byte; NOT published)\n", basename(from)))
        return(TRUE)
      }
      if (!exists) {
        append_record(list(run_id = run_id, section = section,
                           action = "handoff_copy", from = from, to = to,
                           status = "error"))
        cat(sprintf("  [error] %s  (source missing)\n", basename(from)))
        return(FALSE)
      }
      dir.create(dirname(to), showWarnings = FALSE, recursive = TRUE)
      ok <- file.copy(from, to, overwrite = TRUE)
      append_record(list(run_id = run_id, section = section,
                         action = "handoff_copy", from = from, to = to,
                         status = if (ok) "ok" else "error"))
      cat(sprintf("  [%s] %s -> %s\n", if (ok) "ok" else "error",
                  basename(from), dirname(to)))
      if (isTRUE(ok)) n_published <<- n_published + 1L
      ok
    }

    # Resolve a {year} token in a files: entry against what is ON DISK.
    #
    # WHY: an artefact whose published name carries the data year (property
    # assessment's aggregate) cannot name that year literally here. The literal
    # has to be edited every rollover, and until someone does, the handoff looks
    # for last year's file, finds nothing, and publishes nothing — silently, on
    # the one artefact a reader downloads by hand.
    #
    # The token is resolved from the files that exist, taking the newest year
    # present, and the SAME year is substituted into the destination so the
    # published name keeps its locked yeg_<section>_<dataYear> form. Way A is
    # preserved: this still copies a file that physically exists and still never
    # reads a manifest to decide what to copy.
    #
    # An entry without the token is returned untouched, so every other section's
    # handoff behaves exactly as before.
    resolve_year_token <- function(cp) {
      if (!grepl("{year}", cp$from, fixed = TRUE)) return(cp)

      # `????` is this file's existing convention for a 4-digit year (see the BP
      # glob); glob2rx escapes the rest of the name for us.
      glob_name <- gsub("{year}", "????", basename(cp$from), fixed = TRUE)
      dir_abs   <- file.path(cwd_abs, dirname(cp$from))
      hits      <- list.files(dir_abs, pattern = utils::glob2rx(glob_name))
      if (length(hits) == 0) {
        stop("handoff: {year} in '", cp$from, "' matched no file in ", dirname(cp$from),
             ". The producing script must write it before the handoff runs.")
      }

      # Zero-padded years sort lexically, so the newest name carries the newest year.
      newest <- max(hits)
      found  <- regmatches(newest, gregexpr("[0-9]{4}", newest))[[1]]
      if (length(found) != 1L) {
        stop("handoff: cannot tell which 4-digit run is the year in '", newest,
             "' (found ", length(found), "). Rename the artefact or publish it ",
             "with a literal from/to entry.")
      }
      list(from = gsub("{year}", found, cp$from, fixed = TRUE),
           to   = gsub("{year}", found, cp$to,   fixed = TRUE))
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
        cp <- resolve_year_token(cp)
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

      # Per-year geojson copies route through copy_one so the zero-byte publish
      # guard applies here too — this is the exact path that produced the original
      # empty-file incident. copy_one logs handoff_copy / handoff_skip_empty.
      for (yr in years) {
        fname <- gsub("\\{year\\}", as.character(yr), hf$geojson_pattern)
        from  <- file.path(cwd_abs, hf$geojson_src_dir, fname)
        to    <- file.path(dest_dir, fname)
        if (!copy_one(from, to)) hf_failed <- TRUE
      }

      # Publish the manifest itself (also through copy_one's guard).
      man_to <- file.path(REPO_ROOT, hf$manifest_dest)
      if (!copy_one(manifest_src, man_to)) hf_failed <- TRUE
      cat(sprintf("Handoff published %d year(s) + manifest to public.\n", length(years)))
    }

    if (hf_failed) {
      cat("\nHANDOFF FAILED — a copy did not complete (see records above).\n")
      return(list(section = section, status = "error",
                  failed_at = NA, phase = "handoff",
                  n_warnings = total_warnings,
                  empty_outputs = section_empty_outputs))
    }
    # Per-section published-file count — a metric the runner already knows (no
    # script edit). Its own record, keyed by action, so per-script metrics stay
    # per-script. (Rendering deferred to the Tier-3 triage surface.)
    append_record(list(run_id = run_id, section = section,
                       action = "section_metrics", status = "ok",
                       metrics = list(published_files = n_published)))
    cat(sprintf("Handoff complete (%d file(s) published).\n", n_published))
  }

  cat(sprintf("\nDone. Log: %s\n", log_path))
  return(list(section = section,
              status = if (any_empty) "ok_empty_output" else "ok",
              failed_at = NA, phase = phase, n_warnings = total_warnings,
              empty_outputs = section_empty_outputs))
}
