# render_report.R
# -----------------------------------------------------------------------------
# Layer 1: DETERMINISTIC HTML report renderer for the pipeline run log
# (runs/refresh_runs.jsonl). No LLM, no knitr/Pandoc, no external assets — pure
# base R + jsonlite (parse) + yaml (resolve a section's cwd for code slices).
# Self-contained HTML with an inline <style> block.
#
# CONTRACT — the renderer READS status, never COMPUTES it. Every per-record pill
# shows the record's verbatim `status` string. The only derived value is each
# run's ROLLUP tier (for the header/index colour), taken as the max tier across
# the run's verbatim statuses — error > {ok_with_warnings, ok_empty_output,
# skipped_empty} > ok. It never overrides what a record says about itself.
#
# Output (all under runs/reports/, which is gitignored):
#   report_<TS>__<key>.html   one self-contained report per run (deterministic name)
#   index.html                all runs, newest-first, status pill + link
#
# Grouping: records are grouped by refresh_id if present, else run_id — so a
#   cross-section refresh (one refresh_id, many run_ids) is one report, and a
#   single-section run (a run_id, no refresh_id) is its own report.
#
# Usage:
#   Rscript render_report.R          # standalone: render all runs incrementally
#   source("render_report.R"); render_all(repo_root)   # from refresh.R (wire-in)
# -----------------------------------------------------------------------------

`%||%` <- function(a, b) if (is.null(a)) b else a

# === HTML + formatting helpers ===============================================

# Escape verbatim text (warnings, error output, code) so it cannot break the
# page or inject markup. base R only.
esc <- function(x) {
  x <- as.character(x)
  x <- gsub("&", "&amp;",  x, fixed = TRUE)
  x <- gsub("<", "&lt;",   x, fixed = TRUE)
  x <- gsub(">", "&gt;",   x, fixed = TRUE)
  x <- gsub('"', "&quot;", x, fixed = TRUE)
  x <- gsub("'", "&#39;",  x, fixed = TRUE)
  x
}

# A run's TS is the "<YYYYMMDD>T<HHMMSS>" stamp embedded in its grouping key.
key_ts <- function(key) {
  m <- regmatches(key, regexpr("[0-9]{8}T[0-9]{6}", key))
  if (length(m) && nzchar(m)) m else "00000000T000000"
}
fmt_ts <- function(ts) {
  if (!grepl("^[0-9]{8}T[0-9]{6}$", ts)) return(ts)
  sprintf("%s-%s-%s %s:%s:%s",
          substr(ts, 1, 4), substr(ts, 5, 6), substr(ts, 7, 8),
          substr(ts, 10, 11), substr(ts, 12, 13), substr(ts, 14, 15))
}
fmt_dur <- function(secs) {
  secs <- as.numeric(secs)
  if (!is.finite(secs)) return("-")
  if (secs < 60) return(sprintf("%.1fs", secs))
  sprintf("%dm %02ds", secs %/% 60, round(secs %% 60))
}

# Deterministic per-run filename: TS prefix (so a directory listing sorts
# chronologically) + the sanitised grouping key. Same run -> same name, which is
# what lets the incremental pass skip an already-rendered run.
run_filename <- function(key) {
  sprintf("report_%s__%s.html", key_ts(key), gsub("[^A-Za-z0-9._-]", "_", key))
}

# === Status -> tier / colour (READ-ONLY) =====================================
# tier: 1 OK (green), 2 WARN (amber), 3 ERROR (red). Used for the rollup colour
# only; per-record pills always print the verbatim status string.
status_tier <- function(status) {
  if (is.null(status))                                              return(1L)
  if (identical(status, "error"))                                  return(3L)
  if (status %in% c("ok_with_warnings", "ok_empty_output", "skipped_empty")) return(2L)
  1L
}
TIER_BG    <- c("#2e7d32", "#ef6c00", "#c62828")  # green / amber / red
TIER_LABEL <- c("OK", "WARN", "ERROR")

# Pill colour per VERBATIM status string (white text on all).
status_bg <- function(status) {
  if (is.null(status)) return("#757575")
  switch(status,
    ok               = "#2e7d32",
    ok_with_warnings = "#b26a00",
    ok_empty_output  = "#c75300",
    skipped_empty    = "#c75300",
    error            = "#c62828",
    "#757575")
}
pill <- function(status) {
  sprintf('<span class="pill" style="background:%s">%s</span>',
          status_bg(status), esc(status %||% "?"))
}

INLINE_CSS <- '
  body { font: 14px/1.5 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         margin: 0; padding: 0 0 40px; color: #1a1a1a; background: #fafafa; }
  .wrap { max-width: 980px; margin: 0 auto; padding: 0 18px; }
  .band { color: #fff; padding: 16px 18px; }
  .band h1 { margin: 0 0 6px; font-size: 18px; }
  .band .meta { font-size: 13px; opacity: .95; }
  .band .meta b { font-weight: 600; }
  a { color: #1565c0; text-decoration: none; }
  a:hover { text-decoration: underline; }
  h2 { font-size: 15px; margin: 26px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { color: #555; font-weight: 600; border-bottom: 1px solid #ccc; }
  td.script { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .pill { display: inline-block; color: #fff; border-radius: 10px;
          padding: 1px 9px; font-size: 11px; font-weight: 600; white-space: nowrap; }
  .bartrack { background: #eceff1; width: 220px; height: 10px; border-radius: 5px; }
  .bar { background: #90caf9; height: 10px; border-radius: 5px; }
  .warnrow td { background: #fff8e1; }
  .warnrow pre { margin: 2px 0; white-space: pre-wrap; word-break: break-word;
                 font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  .fail { background: #fdecea; border: 1px solid #f5c6cb; border-radius: 4px;
          padding: 10px; margin: 4px 0; }
  .fail .lbl { font-weight: 600; color: #8a1f1f; margin-top: 6px; }
  pre.block { background: #2b2b2b; color: #eaeaea; padding: 10px; border-radius: 4px;
              overflow-x: auto; white-space: pre; font-family: ui-monospace, Menlo, Consolas, monospace;
              font-size: 12px; line-height: 1.45; }
  pre.code .hit { background: #5a1d1d; display: inline-block; width: 100%; }
  .handoff { font-size: 13px; }
  .skip { color: #c75300; font-weight: 600; }
  .foot { color: #888; font-size: 12px; margin-top: 30px; }
'

html_doc <- function(title, body) {
  paste0(
    "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>", esc(title), "</title><style>", INLINE_CSS, "</style></head><body>\n",
    body,
    "\n</body></html>\n"
  )
}

# === Record access ===========================================================

read_records <- function(jsonl_path) {
  lines <- readLines(jsonl_path, warn = FALSE)
  lines <- lines[nzchar(trimws(lines))]
  lapply(lines, function(l) jsonlite::fromJSON(l, simplifyVector = TRUE))
}
group_key <- function(rec) rec$refresh_id %||% rec$run_id
warns_of  <- function(rec) { w <- rec$warnings; if (is.null(w)) character(0) else as.character(unlist(w)) }
errline_of <- function(rec) {
  el <- rec$error_line
  if (is.null(el) || length(el) != 1L || is.na(el)) return(NULL)
  as.integer(el)
}

# === Code-region slice (failure block) =======================================
# ±8 lines around error_line, read from the ACTUAL script (path = section cwd in
# _whirl.yaml + the script's relative path). Returns NULL when error_line is null
# (NO guess), or a "(source not available)" note if the file can't be read.
code_slice <- function(repo_root, cfg, section, script, error_line) {
  if (is.null(error_line)) return(NULL)                       # null line -> omit, never guess
  sec <- cfg$sections[[section]]
  if (is.null(sec) || is.null(sec$cwd) || is.null(script)) return(NULL)
  path <- file.path(repo_root, sec$cwd, script)
  if (!file.exists(path)) return(paste0("(source not available: ", esc(path), ")"))
  lines <- tryCatch(readLines(path, warn = FALSE), error = function(e) NULL)
  if (is.null(lines)) return(paste0("(source unreadable: ", esc(path), ")"))
  el <- error_line
  lo <- max(1L, el - 8L); hi <- min(length(lines), el + 8L)
  if (lo > length(lines)) return(paste0("(error_line ", el, " past end of file)"))
  rows <- vapply(lo:hi, function(i) {
    txt <- sprintf("%5d | %s", i, esc(lines[i]))
    if (i == el) sprintf('<span class="hit">%s</span>', txt) else txt
  }, character(1))
  paste0('<pre class="block code">', paste(rows, collapse = "\n"), "</pre>")
}

failure_block <- function(repo_root, cfg, rec) {
  parts <- c('<div class="fail">')
  parts <- c(parts, sprintf('<div class="lbl">error message</div><pre class="block">%s</pre>',
                            esc(rec$message %||% "")))
  if (!is.null(rec$error_call))
    parts <- c(parts, sprintf('<div class="lbl">error_call</div><pre class="block">%s</pre>',
                              esc(rec$error_call)))
  el <- errline_of(rec)
  parts <- c(parts, sprintf('<div class="lbl">error_line</div><div>%s</div>',
                            if (is.null(el)) "<i>null (no line recovered)</i>" else as.character(el)))
  if (!is.null(rec$stderr_tail))
    parts <- c(parts, sprintf('<div class="lbl">stderr_tail</div><pre class="block">%s</pre>',
                              esc(rec$stderr_tail)))
  slice <- code_slice(repo_root, cfg, rec$section, rec$script, el)
  if (!is.null(slice))
    parts <- c(parts, sprintf('<div class="lbl">source &plusmn;8 around line %s</div>%s',
                              as.character(el), slice))
  c(parts, "</div>")
}

# === Per-run report ==========================================================

# Lightweight metadata (used by both the renderer and the index for skipped
# runs): rollup tier, sections, timestamps, counts.
run_meta <- function(key, recs) {
  is_hf   <- vapply(recs, function(r) !is.null(r$action), logical(1))
  scripts <- recs[!is_hf]
  statuses <- c(vapply(scripts, function(r) r$status %||% "ok", character(1)),
                vapply(recs[is_hf], function(r) r$status %||% "ok", character(1)))
  list(
    key      = key,
    file     = run_filename(key),
    ts       = key_ts(key),
    ts_disp  = fmt_ts(key_ts(key)),
    sections = unique(vapply(scripts, function(r) r$section %||% "?", character(1))),
    rollup   = if (length(statuses)) max(vapply(statuses, status_tier, integer(1))) else 1L,
    n_script = length(scripts)
  )
}

render_one_run <- function(key, recs, repo_root, cfg, reports_dir) {
  meta    <- run_meta(key, recs)
  is_hf   <- vapply(recs, function(r) !is.null(r$action), logical(1))
  scripts <- recs[!is_hf]
  handoff <- recs[is_hf]
  maxdur  <- max(vapply(scripts, function(r) as.numeric(r$duration_secs %||% 0), numeric(1)), 1)
  wall    <- {
    starts <- vapply(scripts, function(r) r$started_at %||% NA_character_, character(1))
    durs   <- vapply(scripts, function(r) as.numeric(r$duration_secs %||% 0), numeric(1))
    pt <- suppressWarnings(as.POSIXct(starts, format = "%Y-%m-%dT%H:%M:%S%z", tz = "UTC"))
    if (length(pt) && !any(is.na(pt))) as.numeric(difftime(max(pt + durs), min(pt), units = "secs"))
    else sum(durs)                                            # fall back to compute-time
  }

  # --- header band -----------------------------------------------------------
  body <- c(sprintf('<div class="band" style="background:%s"><div class="wrap">',
                    TIER_BG[meta$rollup]))
  body <- c(body, sprintf('<h1>%s &mdash; %s</h1>', TIER_LABEL[meta$rollup], esc(key)))
  body <- c(body, sprintf(paste0('<div class="meta"><b>sections:</b> %s &nbsp;|&nbsp; ',
                                 '<b>scripts:</b> %d &nbsp;|&nbsp; <b>wall-clock:</b> %s ',
                                 '&nbsp;|&nbsp; <b>started:</b> %s</div>'),
                          esc(paste(meta$sections, collapse = ", ")), meta$n_script,
                          fmt_dur(wall), esc(meta$ts_disp)))
  body <- c(body, '</div></div>', '<div class="wrap">',
            '<p><a href="index.html">&larr; all runs</a></p>')

  # --- per-section script tables ---------------------------------------------
  for (s in meta$sections) {
    srecs <- Filter(function(r) (r$section %||% "?") == s, scripts)
    body <- c(body, sprintf('<h2>%s</h2>', esc(s)))
    body <- c(body, '<table><tr><th>script</th><th>status</th><th>duration</th><th>&nbsp;</th></tr>')
    for (r in srecs) {
      dur  <- as.numeric(r$duration_secs %||% 0)
      barw <- round(dur / maxdur * 220)
      body <- c(body, sprintf(
        paste0('<tr><td class="script">%s</td><td>%s</td><td>%s</td>',
               '<td><div class="bartrack"><div class="bar" style="width:%dpx"></div></div></td></tr>'),
        esc(basename(r$script %||% "?")), pill(r$status), fmt_dur(dur), barw))
      # warning rows: each warning verbatim
      ws <- warns_of(r)
      if (length(ws)) {
        wlines <- paste(sprintf('<pre>%s</pre>', esc(ws)), collapse = "")
        body <- c(body, sprintf('<tr class="warnrow"><td colspan="4">%s</td></tr>', wlines))
      }
      # failure block for an error record
      if (identical(r$status, "error")) {
        fb <- paste(failure_block(repo_root, cfg, r), collapse = "\n")
        body <- c(body, sprintf('<tr><td colspan="4">%s</td></tr>', fb))
      }
    }
    body <- c(body, '</table>')
  }

  # --- handoff summary -------------------------------------------------------
  published <- sum(vapply(handoff, function(r)
    identical(r$action, "handoff_copy") && identical(r$status, "ok"), logical(1)))
  skipped <- Filter(function(r) identical(r$action, "handoff_skip_empty"), handoff)
  body <- c(body, '<h2>handoff</h2>', '<div class="handoff">')
  body <- c(body, sprintf('<div><b>%d</b> file(s) published to website/public.</div>', published))
  if (length(skipped)) {
    body <- c(body, sprintf('<div class="skip">&#9888; %d file(s) SKIPPED (zero-byte, NOT published):</div><ul>',
                            length(skipped)))
    for (r in skipped) body <- c(body, sprintf('<li class="skip">%s</li>', esc(basename(r$from %||% "?"))))
    body <- c(body, '</ul>')
  }
  body <- c(body, '</div>')

  body <- c(body, '<p class="foot">Generated by render_report.R (Layer 1, deterministic).</p>',
            '</div>')

  out <- file.path(reports_dir, meta$file)
  writeLines(html_doc(paste0("run ", key), paste(body, collapse = "\n")), out)
  meta
}

# === Index ===================================================================

render_index <- function(metas, reports_dir) {
  ord   <- order(vapply(metas, function(m) m$ts, character(1)), decreasing = TRUE)
  metas <- metas[ord]
  body  <- c('<div class="band" style="background:#37474f"><div class="wrap">',
             '<h1>Pipeline run reports</h1>',
             sprintf('<div class="meta">%d run(s), newest first</div>', length(metas)),
             '</div></div>', '<div class="wrap">',
             '<table><tr><th>status</th><th>run</th><th>sections</th><th>started</th><th>report</th></tr>')
  for (m in metas) {
    body <- c(body, sprintf(
      paste0('<tr><td><span class="pill" style="background:%s">%s</span></td>',
             '<td class="script">%s</td><td>%s</td><td>%s</td>',
             '<td><a href="%s">view</a></td></tr>'),
      TIER_BG[m$rollup], TIER_LABEL[m$rollup], esc(m$key),
      esc(paste(m$sections, collapse = ", ")), esc(m$ts_disp), esc(m$file)))
  }
  body <- c(body, '</table>',
            '<p class="foot">Generated by render_report.R (Layer 1, deterministic).</p>', '</div>')
  writeLines(html_doc("Pipeline run reports", paste(body, collapse = "\n")),
             file.path(reports_dir, "index.html"))
}

# === Orchestrator ============================================================
# Incremental: a run whose report file already exists is NOT re-rendered (its
# meta is still collected so the index includes it). The index ALWAYS regenerates.
render_all <- function(repo_root,
                       jsonl_path  = file.path(repo_root, "runs", "refresh_runs.jsonl"),
                       reports_dir = file.path(repo_root, "runs", "reports"),
                       incremental = TRUE) {
  dir.create(reports_dir, showWarnings = FALSE, recursive = TRUE)
  cfg     <- yaml::read_yaml(file.path(repo_root, "_whirl.yaml"))
  records <- read_records(jsonl_path)
  if (!length(records)) { message("render_report: no records."); return(invisible(list())) }

  keys  <- vapply(records, group_key, character(1))
  order_keys <- unique(keys)                                  # appearance order
  metas <- list()
  rendered <- 0L; skipped <- 0L
  for (k in order_keys) {
    recs <- records[keys == k]
    fpath <- file.path(reports_dir, run_filename(k))
    if (incremental && file.exists(fpath)) {
      metas[[k]] <- run_meta(k, recs); skipped <- skipped + 1L
    } else {
      metas[[k]] <- render_one_run(k, recs, repo_root, cfg, reports_dir); rendered <- rendered + 1L
    }
  }
  render_index(metas, reports_dir)
  message(sprintf("render_report: %d run(s) -> %d rendered, %d already present; index regenerated.",
                  length(order_keys), rendered, skipped))
  invisible(metas)
}

# === Standalone entry ========================================================
# Run only when invoked as `Rscript render_report.R` (the --file arg names this
# file). When SOURCED by refresh.R (whose --file is refresh.R), nothing auto-runs
# — the caller invokes render_all() itself.
.this_file <- function() {
  ca <- commandArgs(trailingOnly = FALSE)
  m  <- grep("^--file=", ca, value = TRUE)
  if (length(m)) basename(sub("^--file=", "", m[1])) else ""
}
if (identical(.this_file(), "render_report.R")) {
  repo_root <- rprojroot::find_root(rprojroot::has_file(".aref_root"))
  render_all(repo_root = repo_root)
}
