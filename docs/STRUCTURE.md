# Repository Structure & Architecture Contract

**Author:** Kaustubh Chati (KC) — sole origin author
**Status of this document:** Ratified architecture decisions. Sections marked **[TARGET]** describe the intended end state and are **not yet implemented** as of this writing; sections marked **[CURRENT]** describe what exists today.
**Purpose:** Single source of truth for how this repository is organized, how paths resolve, how the pipeline is run, and why. Read this before adding a section, refreshing a year, or moving the repo to a new machine.

---

## 1. What this repository is

A monorepo containing an R data pipeline (backend) and a React/Vite/MapLibre frontend (the AREF Open Data Centre). The pipeline runs locally on an operator's machine and produces small outputs committed to the repo; the frontend is deployed separately. Raw data is gitignored. This document governs the **pipeline + repo structure**; frontend build/deploy is documented elsewhere.

## 2. Top-level layout [TARGET]

```
<repo root>/
  .aref_root              # empty sentinel file; marks the repo root for path anchoring
  _bootstrap.R            # defines ROOT and path helpers; sourced at the top of every R script
  _whirl.yaml             # pipeline run-order config (consumed by the orchestrator)
  refresh.R               # entry point: run the ENTIRE pipeline end-to-end
  run_section.R           # entry point: run ONE section (argument: section name)
  new_section.R           # entry point: scaffold a NEW section skeleton (argument: name)
  renv.lock               # single lockfile for the whole repo
  runs/                   # pipeline run logs + summary report (mostly gitignored)
    .gitkeep
    summary.html          # latest run summary (the ONLY run artifact committed)
  pipeline/
    <section>/            # one folder per section (e.g. property-assessment, building-permits)
      <section>.Rproj
      scripts/            # numbered R scripts for this section
      data/
        raw/              # immutable source data (gitignored)
        processed/        # derived data
        reference/        # lookup tables, concordances
        validation/       # validation oracles / truth files
      output/             # this section's final outputs
    shared/               # resources shared across sections (e.g. boundary CSV)
  website/                # frontend (consumes pipeline outputs via explicit handoff)
  docs/                   # this document and other repo documentation
```

## 3. Path anchoring [TARGET]

**Problem this solves:** every script previously used hardcoded absolute paths (`/Users/.../`), which break on any other machine. The repo must run from a clean clone on a second machine.

**Mechanism:**
- An empty sentinel file `.aref_root` lives at the repo root.
- `_bootstrap.R` resolves the root with `rprojroot::find_root_file(criterion = rprojroot::has_file(".aref_root"))` and defines path helpers.
- Every R script sources `_bootstrap.R` near the top, before any path is used.

**Why `rprojroot` and not `here`:** each section has its own `.Rproj`, which `here` treats as the nearest project root — so `here()` resolves to the *section*, not the repo root, shadowing it. `rprojroot` with an explicit `.aref_root` criterion walks past the section `.Rproj` to the true repo root. `rprojroot::find_root` is the maintained primitive for exactly this upward search; we do not hand-roll a directory walk.

## 4. Addressing rules [TARGET]

When a script needs a path, choose by relationship:

| Target | Rule |
|---|---|
| A file in the script's **own section** | Relative path: `"output/..."`, `"data/raw/..."` (cwd is the section root) |
| A **shared** resource | `shared_path("...")` helper |
| A file in **another section** | `section_path("<section>", "...")` helper |
| A **website** handoff target | `website_path("...")` helper — **only** in designated handoff scripts |

**Launch contract:** every script assumes the working directory is its section root. RStudio satisfies this via the section `.Rproj`. The orchestrator/VM satisfies it per-section. The bootstrap resolves the repo root regardless of cwd; only relative own-section paths depend on the cwd being the section root.

## 5. Canonical section skeleton [TARGET]

Every section has the identical structure (including empty dirs with `.gitkeep`): `scripts/`, `data/{raw,processed,reference,validation}/`, `output/`. `new_section.R` scaffolds exactly this. `raw/` is immutable source and gitignored; `processed/` is derived and reproducible.

## 6. Pipeline ↔ website seam [TARGET]

The pipeline **never writes into `website/` directly** except through the runner's handoff step (the sole publisher). Each section writes final outputs to its own `output/`; the handoff copies them to the website. **Published CSVs are renamed at copy time** to the locked standard `yeg_<section>[_per_nbhd]_<dataYear>.csv` (span variant for historical) — see CLAUDE.md §6: the `output/` frame stays **unprefixed** (internal), the published copy carries the `yeg_` city prefix. GeoJSONs and other artifacts are copied unchanged. (This publish-time rename **supersedes** the earlier "no rename bridge" rule, which predated the city-prefix naming standard.)

> Sections live under a city container: `pipeline/yeg/<section>/` (Edmonton). `shared_path()`/`section_path()` anchor at `pipeline/yeg/`; `website_path()` is city-agnostic (the site is not city-nested yet).

## 7. Orchestration & run entry points [TARGET]

The repo root is the active orchestration layer. Three thin entry points share one underlying run wrapper:

- **`refresh.R`** — runs the entire pipeline. Run order is defined in `_whirl.yaml` (each step = a section, plus any shared prerequisite first and the website handoff last). Within a step, scripts are discovered by globbing the section's `scripts/` directory — **no script-name or year literals** (refresh-by-design).
- **`run_section.R <section>`** — re-runs a single section (the "I changed code here" path).
- **`new_section.R <name>`** — scaffolds a new section's skeleton and adds a step stub to `_whirl.yaml`. This is a generator, not a run.

**Engine:** `whirl` (CRAN) executes the scripts and produces per-script logs plus a summary report. We do not use `make` or `targets`: the sections form a near-linear refresh with no dependency DAG worth tracking, so a build-automation tool would be over-engineering. The shared run wrapper pins `whirl`'s summary output to `runs/summary.html`.

## 8. Run logs [TARGET]

All run logs and the summary report land in the root-level `runs/` folder (consolidated, easy to find, doubles as a dossier artifact). The heavy per-script HTML logs are gitignored; only the latest `runs/summary.html` is committed.

`.gitignore` block (the wildcard-on-contents form is required — git cannot re-include a file under a fully excluded directory):

```
runs/*
!runs/.gitkeep
!runs/summary.html
```

## 9. Dependency management [ADOPTED 2026-06-21]

A single `renv.lock` at the repo root covers the whole repo (orchestrator + all sections). Sections do not have separate lockfiles — they share one package set, and one root environment lets the orchestrator and section scripts run under the same library. `.Rprofile` auto-activates renv (`source("renv/activate.R")`), so every `Rscript` invocation from the repo runs under the private library `renv/library/` (gitignored by renv; never committed). The lockfile is an **implicit** snapshot — it records only code-referenced packages and their recursive closure (the evaluated-and-dropped `whirl` is excluded; the runner's `callr`/`jsonlite`/`yaml` and the pipeline's `sf`/`rprojroot`/`tidyverse` are captured). Refresh it with `renv::snapshot(type = "implicit")` after adding a package; restore a clone with `renv::restore()`.

## 10. Refresh-by-design (locked principle)

Every script is written so one operator refresh handles a new year end-to-end with no code edits: scripts auto-discover inputs by glob, derive year spans from the data, and date-stamp outputs from `Sys.Date()`. No year literals anywhere. The orchestration layer preserves this by globbing `scripts/` rather than naming scripts.

## 11. Methodology boundary (locked principle)

The confidential file is a validation oracle only — it scores precision/recall of public-data rules and never runs in production. It lives in a section's `data/validation/` and is never an input to a production output.
