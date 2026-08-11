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
    if (identical(entry$from, output_rel) &&
        grepl("^website/public/downloads/", entry$to)) {
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

  fetched <- newest_snapshot_date(raw_dir, snapshot_stems)
  if (!is.null(fetched)) facts$fetchedAt <- fetched

  facts
}
