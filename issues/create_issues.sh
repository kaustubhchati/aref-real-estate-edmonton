#!/usr/bin/env bash
# =============================================================================
# create_issues.sh
#
# Creates the 8 refresh-by-design issues via the GitHub CLI, in dependency
# order, then rewrites the placeholder cross-references (#1 … #8) in each body
# to the REAL issue numbers GitHub assigns (your repo already has ~7 issues,
# so the manifest issue will NOT be #1).
#
# Run from this folder, after `gh auth login` and after the `refresh-by-design`
# label exists. Other labels referenced (architecture, pipeline, frontend,
# docs, data-source) are created here if missing.
#
#   chmod +x create_issues.sh
#   ./create_issues.sh
#
# It prints a placeholder→real number map at the end so you can eyeball it.
# =============================================================================
set -euo pipefail

# --- Titles (placeholder number → title) ------------------------------------
declare -A TITLE=(
  [1]="Define and emit manifest.json (the keystone)"
  [2]="Backend: remove hardcoded 2026 from pipeline filenames"
  [3]="Backend: mark the oracle year (2023) as deliberately frozen"
  [4]="Backend: stop pinning Property Information to a dated manual filename"
  [5]="Backend: resolve the pinned Jan-2023 boundary shapefile"
  [6]="Frontend: drive dataSources.js from the manifest, not literals"
  [7]="Frontend: stop hardcoding period-specific copy and the colour scale"
  [8]="Frontend: give ReportCard the same (city, year) seam as the map"
)

# --- Labels per issue (space-separated; each becomes a --label flag) --------
declare -A LABELS=(
  [1]="refresh-by-design architecture"
  [2]="refresh-by-design pipeline"
  [3]="refresh-by-design pipeline docs"
  [4]="refresh-by-design pipeline"
  [5]="refresh-by-design pipeline data-source"
  [6]="refresh-by-design frontend"
  [7]="refresh-by-design frontend"
  [8]="refresh-by-design frontend"
)

# Creation order: keystone first so its real number is known before the
# dependent bodies are created.
ORDER=(1 2 3 4 5 6 7 8)

# --- Ensure referenced labels exist (no-op if already there) ----------------
for lbl in refresh-by-design architecture pipeline frontend docs data-source; do
  gh label create "$lbl" >/dev/null 2>&1 || true
done

# --- Create, capturing real numbers -----------------------------------------
declare -A REAL          # placeholder number -> real issue number

map_refs () {            # rewrite #1..#8 placeholders to real numbers, longest first
  local text="$1"
  # Replace in descending order so "#1" doesn't clobber "#10+" (none here, but safe).
  for p in 8 7 6 5 4 3 2 1; do
    if [[ -n "${REAL[$p]:-}" ]]; then
      text="${text//#$p/#${REAL[$p]}}"
    fi
  done
  printf '%s' "$text"
}

for p in "${ORDER[@]}"; do
  body_file="$(printf '%02d.md' "$p")"
  raw_body="$(cat "$body_file")"
  fixed_body="$(map_refs "$raw_body")"

  # Build --label flags
  label_flags=()
  for l in ${LABELS[$p]}; do label_flags+=(--label "$l"); done

  echo ">> Creating placeholder #$p: ${TITLE[$p]}"
  url="$(printf '%s' "$fixed_body" | gh issue create \
        --title "${TITLE[$p]}" \
        "${label_flags[@]}" \
        --body-file -)"
  echo "   -> $url"

  # Extract trailing number from the URL (…/issues/NN)
  REAL[$p]="${url##*/}"
done

echo
echo "=== placeholder -> real issue number ==="
for p in "${ORDER[@]}"; do
  printf '  #%s  ->  #%s   %s\n' "$p" "${REAL[$p]}" "${TITLE[$p]}"
done
echo
echo "Cross-references inside the bodies were rewritten to the real numbers above."
echo "Spot-check the keystone (manifest) issue and its dependents in the web UI."
