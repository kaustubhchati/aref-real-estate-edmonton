# run_section.R
# -----------------------------------------------------------------------------
# THIN CALLER. Parses args, anchors the repo, loads + validates the section
# config, then hands the actual work to run_one_section() in pipeline/_run_engine.R
# and maps its returned status contract to a process exit code.
#
# The run-one-section logic (dry-run validation, the fresh-process-per-script
# loop, and the handoff publish) lives in the engine so a future multi-section
# driver can call it in a loop. The engine NEVER calls quit() — the only quit()
# is here, at top level, after a single section returns.
#
# WHY cwd from _whirl.yaml, not .Rproj:
#   Every script uses bare-relative own-section I/O (data/..., output/...), so
#   the working directory IS load-bearing. cwd is declared authoritatively per
#   section in _whirl.yaml and set per-process by the engine via callr's wd=. It
#   is NEVER inferred from an .Rproj file (economy/business-census has none).
#
# Anchor: repo root (and _whirl.yaml + the engine) is located via the .aref_root
#   sentinel, so this runs from any directory inside the repo tree.
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

# --- run_id + log path -------------------------------------------------------
# run_id groups one section invocation (same format as before). No Date.now()/
# random needed: a stable stamp from Sys.time() is fine (a runtime log, not a
# cached value). The engine creates the log dir lazily on a LIVE run only, so a
# dry-run stays side-effect-free.
run_id   <- format(Sys.time(), paste0(section, "-%Y%m%dT%H%M%S"))
log_path <- file.path(REPO_ROOT, "runs", "refresh_runs.jsonl")

# --- Dispatch to the engine, map the contract to an exit code ----------------
source(file.path(REPO_ROOT, "pipeline", "_run_engine.R"))
res <- run_one_section(section = section, sec = sec, cwd_abs = cwd_abs,
                       scripts = scripts, dry_run = dry_run,
                       log_path = log_path, run_id = run_id,
                       repo_root = REPO_ROOT)
quit(status = if (identical(res$status, "ok")) 0L else 1L)
