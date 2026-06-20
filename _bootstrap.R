# =============================================================================
# _bootstrap.R — repo-root path anchoring for the AREF pipeline
# -----------------------------------------------------------------------------
# WHY: every script previously used hardcoded absolute paths, which break on any
# other machine. This file resolves the repo root from a sentinel file and
# provides path helpers so scripts address files by RELATIONSHIP, not by literal.
#
# HOW: source this near the top of any pipeline script:
#     source(rprojroot::find_root_file("_bootstrap.R",
#            criterion = rprojroot::has_file(".aref_root")))
#
# Sourcing has NO side effects beyond defining ROOT and the helpers below.
#
# Addressing rules (see docs/STRUCTURE.md):
#   own-section file  -> relative path, e.g. "output/foo.csv" (cwd = section root)
#   shared resource   -> shared_path("boundaries/foo.csv")
#   another section   -> section_path("building-permits", "output/foo.csv")
#   website handoff   -> website_path("public/data/foo.geojson")  [handoff scripts only]
# =============================================================================

# ROOT: absolute path to the repository root, found by walking up to the
# .aref_root sentinel. Uses rprojroot (the maintained primitive) rather than a
# hand-rolled directory walk, and ignores section-level .Rproj markers.
ROOT <- rprojroot::find_root(rprojroot::has_file(".aref_root"))

# --- Path helpers ------------------------------------------------------------
# Each joins its argument(s) onto the correct base. file.path() keeps them
# OS-portable (no hardcoded slashes).

# shared_path(): a resource shared across sections (e.g. neighbourhood boundaries)
shared_path <- function(...) file.path(ROOT, "pipeline", "shared", ...)

# section_path(): a file inside a NAMED section (cross-section reference)
section_path <- function(section, ...) file.path(ROOT, "pipeline", section, ...)

# website_path(): a target in the frontend tree — use ONLY in designated
# handoff scripts, never in ordinary pipeline scripts
website_path <- function(...) file.path(ROOT, "website", ...)
