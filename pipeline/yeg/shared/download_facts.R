# =============================================================================
# download_facts.R — describe a published download artefact, from the file itself
# -----------------------------------------------------------------------------
# WHAT THIS PRODUCES
#   One list per artefact, for a section manifest's `downloads` array:
#     file        published filename (the handoff destination, not the output/ name)
#     bytes       size of the frame actually written
#     rows        data rows, header excluded
#     columns     column count
#     coverageSpan {from, to}  ONLY where the data carries a year column
#     valueSuppression         ONLY where the data carries a suppression flag
#     fetchedAt   date of the newest source snapshot the section built from
#     builtAt     when this run produced the artefact
#
# WHY EVERY FIELD IS DERIVED, NOT ASSERTED
#   These numbers exist so the download page can tell a reader what they are
#   getting before they click. A number typed into a config drifts silently the
#   moment the data changes, and nothing catches it: the live page today claims
#   the assessment file holds "407 neighbourhoods" when it holds 344. So nothing
#   here is passed in as a value. Each field is measured from the file on disk at
#   emit time, after the producing script has finished writing it.
#
# WHY coverageSpan IS CONDITIONAL
#   A span is only honest if the data says so. The permit CSVs carry a `year`
#   column, so their span is read from it. The assessment aggregate carries no
#   year column at all — its year lives in the filename — so no span is emitted
#   for it. An omitted key is the correct answer; a guessed span would look
#   exactly like a measured one.
#
# WHY THE PUBLISHED NAME COMES FROM _whirl.yaml
#   Sections write unprefixed names into output/ and the runner renames at the
#   handoff (`from:` -> `to:`). The published name therefore is not knowable
#   inside the section. Reading the handoff entry keeps ONE source of truth: if
#   the published name changes, this follows it with no edit here.
# =============================================================================

# The published basename for an output/ file, read from the runner's handoff.
# Stops if no downloads destination exists for it — a published artefact whose
# name we cannot state is a defect, not something to paper over with the local name.
published_download_name <- function(section, output_rel) {
  cfg <- yaml::read_yaml(file.path(ROOT, "_whirl.yaml"))
  entries <- cfg$sections[[section]]$handoff$files
  if (is.null(entries)) {
    stop("No handoff `files:` for section '", section, "' in _whirl.yaml")
  }
  for (entry in entries) {
    if (!grepl("^website/public/downloads/", entry$to)) next

    # A handoff entry may carry a {year} token, which the runner resolves against
    # the files on disk (see _run_engine.R, resolve_year_token). Match it the same
    # way here — as a 4-digit wildcard — and carry the year we matched into the
    # published name. Both places must understand the token, because the runner
    # decides where the file lands and this decides what we call it; they have to
    # agree, and a rollover must not need an edit in either.
    if (grepl("{year}", entry$from, fixed = TRUE)) {
      glob_from <- gsub("{year}", "????", entry$from, fixed = TRUE)
      if (grepl(utils::glob2rx(glob_from), output_rel)) {
        year <- regmatches(basename(output_rel),
                           regexpr("[0-9]{4}", basename(output_rel)))
        return(basename(gsub("{year}", year, entry$to, fixed = TRUE)))
      }
    } else if (identical(entry$from, output_rel)) {
      return(basename(entry$to))
    }
  }
  stop("No downloads handoff entry for '", output_rel, "' in section '", section,
       "'. Add one to _whirl.yaml, or drop this artefact from the manifest block.")
}

# Newest dated source snapshot, as YYYY-MM-DD.
#
# `stems` is passed per section rather than globbed, because data/raw holds more
# than the sources an artefact was built from (property-assessment keeps two live
# sources plus a historical extract). Naming them keeps the answer honest about
# WHICH snapshots this section actually reads.
newest_snapshot_date <- function(raw_dir, stems) {
  dates <- character(0)
  for (stem in stems) {
    hits <- list.files(raw_dir, pattern = paste0("^", stem, "_[0-9]{8}\\.csv$"))
    dates <- c(dates, sub(paste0("^", stem, "_([0-9]{8})\\.csv$"), "\\1", hits))
  }
  if (length(dates) == 0) return(NULL)   # caller omits the key
  format(as.Date(max(dates), format = "%Y%m%d"), "%Y-%m-%d")
}

# Span of a `year` column, or NULL when the frame has none.
# Case-insensitive because column naming is not uniform across sections.
coverage_span_of <- function(frame) {
  year_col <- names(frame)[tolower(names(frame)) == "year"]
  if (length(year_col) != 1) return(NULL)
  years <- suppressWarnings(as.integer(frame[[year_col]]))
  years <- years[!is.na(years)]
  if (length(years) == 0) return(NULL)
  list(from = min(years), to = max(years))
}

# How many rows carry a masked value, or NULL when the frame has no suppression
# flag. Case-insensitive, for the same reason coverage_span_of is.
#
# WHY THIS IS A SEPARATE BLOCK FROM rowUniverse, and must stay one: a suppressed
# row is PRESENT in the file, with its measures withheld. An absent row is not in
# the file at all. In the assessment aggregate today those are 64 rows and 63
# rows — close enough in size to invite exactly the wrong reading. Reported
# together they would tell someone that 127 neighbourhoods are missing, when 64
# of them are right there carrying a name and a property count, and only their
# values are withheld. Two different facts about the data, so two blocks.
#
# WHY NO THRESHOLD IS EMITTED: the rule that decides suppression lives in the
# producing script (05_aggregate_current.R), not in the artefact. It could only
# get here by being typed a second time, and a threshold that disagreed with the
# one that actually ran would be worse than none. So this block says how much is
# masked, never why. If the page needs the "why", the rule has to travel from the
# script that owns it — a different change to this one.
value_suppression_of <- function(frame) {
  flag_col <- names(frame)[tolower(names(frame)) == "suppressed"]
  if (length(flag_col) != 1) return(NULL)   # caller omits the key
  flag <- frame[[flag_col]]

  # Fail closed on both ways this can go wrong. A count is only publishable if
  # every row answered the question, and answered it TRUE or FALSE.
  if (!is.logical(flag)) {
    stop("value_suppression_of: column '", flag_col, "' parsed as ",
         class(flag)[1], ", not logical. A suppression flag that is not ",
         "TRUE/FALSE cannot be counted honestly.")
  }
  if (anyNA(flag)) {
    stop("value_suppression_of: column '", flag_col, "' holds ", sum(is.na(flag)),
         " NA value(s). Every row is either suppressed or it is not; an unknown ",
         "must not be published as either.")
  }

  # The two counts are exhaustive by construction (no NA survives the check
  # above), so they sum to the artefact's own `rows` and the page can state a
  # share without a second number arriving from anywhere else.
  list(
    flagColumn     = flag_col,
    rowsSuppressed = as.integer(sum(flag)),
    rowsReported   = as.integer(sum(!flag))
  )
}

# Assemble the row-universe block: how many rows the artefact COULD have held,
# how many it does, and why the rest are missing.
#
# WHY THIS EXISTS: the download page said the assessment file covered "407
# neighbourhoods" when it holds 344. The gap was real, but nothing anywhere
# stated a cause, so a reader could not tell a deliberate exclusion from a
# defect. This block makes the artefact account for its own row count.
#
# WHY THE CALLER SUPPLIES THE BREAKDOWN: the mechanisms are not shared. A
# neighbourhood is absent from the assessment aggregate for reasons that have no
# analogue in a permit-category grid. A common vocabulary imposed across both
# would name things that are not the same thing, so each section classifies its
# own absences and passes the counts in.
#
# The arithmetic is CHECKED, not asserted: if the breakdown does not account for
# every absent row, this stops rather than publishing a total that does not add
# up. A number on a public page that fails its own sum is worse than no number.
row_universe_block <- function(universe_size, rows_present, breakdown) {
  if (!is.numeric(universe_size) || length(universe_size) != 1 || is.na(universe_size)) {
    stop("row_universe_block: universe_size must be a single number, read at ",
         "runtime from its canonical source — never a constant.")
  }
  rows_absent <- as.integer(universe_size) - as.integer(rows_present)
  if (rows_absent < 0) {
    stop("row_universe_block: the artefact holds more rows (", rows_present,
         ") than its universe (", universe_size, "). The universe is wrong.")
  }
  if (sum(unlist(breakdown)) != rows_absent) {
    stop("row_universe_block: absence breakdown sums to ", sum(unlist(breakdown)),
         " but ", rows_absent, " rows are absent. Every absent row must be ",
         "assigned to a mechanism.")
  }
  list(
    universeSize     = as.integer(universe_size),
    rowsPresent      = as.integer(rows_present),
    rowsAbsent       = rows_absent,
    # An array of objects, not a named map: reason codes are data, and a JSON
    # object would invite the frontend to hardcode one of them as a key.
    absenceBreakdown = unname(lapply(names(breakdown), function(code) {
      list(reason_code = code, count = as.integer(breakdown[[code]]))
    }))
  )
}

# Assemble the block for one artefact. `output_rel` is the path the producing
# script wrote, relative to the section root.
describe_download_artefact <- function(section, output_rel, raw_dir, snapshot_stems) {
  if (!file.exists(output_rel)) {
    stop("Cannot describe '", output_rel, "': it does not exist. ",
         "The producing script must run before the manifest emitter.")
  }
  frame <- readr::read_csv(output_rel, show_col_types = FALSE, progress = FALSE)

  facts <- list(
    file    = published_download_name(section, output_rel),
    bytes   = as.integer(file.size(output_rel)),
    rows    = nrow(frame),
    columns = ncol(frame),
    builtAt = format(Sys.Date(), "%Y-%m-%d")
  )

  # Conditional fields: present only where derivable. Never nulled, never
  # placeholdered — the reader of the manifest can tell absence from zero.
  span <- coverage_span_of(frame)
  if (!is.null(span)) facts$coverageSpan <- span

  suppression <- value_suppression_of(frame)
  if (!is.null(suppression)) facts$valueSuppression <- suppression

  fetched <- newest_snapshot_date(raw_dir, snapshot_stems)
  if (!is.null(fetched)) facts$fetchedAt <- fetched

  facts
}
