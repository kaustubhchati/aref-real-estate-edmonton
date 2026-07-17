# Status Report — Phase 2

**Created:** June 18, 2026 (MDT)
**Author:** Kaustubh Chati
**QA gate:** Olivia
**Approval gate:** Prof. Haifang Huang
**Supersedes:** PHASE1_STATUS.md (now read-only)

Phase 2 picks up all carried-forward items from Phase 1
and adds the next-priority workstreams: remaining frontend
sections, agent pipeline, and infrastructure.

---

## 1. Carried forward from Phase 1

### Backend / pipeline
- [ ] **Layer 1b** — LISA I spatial outlier filtering.
      Inputs: `assess_2026_clean.csv`. Output: filtered
      frame with spatial outlier flag column.
- [ ] **Layer 2 — 10% divergence gate** — deferred from
      Phase 1 (requires confidential data, scoped to
      Phase 2 Sanity Agent).
- [ ] **R1 vs Assessment Class % ≥ 90 head-to-head** —
      Tableau parity check. Low priority.
- [ ] **R3b** — ~104 building-and-land manufactured home
      FNs. Probably unnecessary; confirm and close.
- [x] **08b rescue table — RESOLVED (Tier 2 canonical crosswalk).**
      CHAPPELLE AREA→5471, HERITAGE VALLEY TOWN CENTRE AREA→5472,
      HERITAGE VALLEY AREA→5472, and the 5462→5471 / 5464→5472
      renumbers (old IDs absent from the 407 boundary) are now rows
      in `neighbourhood_crosswalk_20260622.csv`, consumed by the
      current PA pipeline via `apply_crosswalk()`. The standalone
      08b rescue script is retired — restructured into 05/06 (the
      rescue oracle is no longer a live input). Verified: the
      2026-07-13 refresh ran clean on these mappings.
- [ ] **R1 scoreboard notes backfill** — rejected R1'
      variant note still missing from scoreboard CSV.
- [x] **assess_2026_with_flags.csv producer — RESOLVED.** Confirmed empirically
      = `01_load_data.R` line 280 (final write). The May-19 on-disk absence was
      stale state (the write was added to 01 after that run produced
      no_parking.csv), not a missing pipeline step. Clean sequential run lands
      both CSVs; row math reconciles (439,780 raw − 45,277 parking = 394,503
      no_parking). Retires SESSION_HANDOVER §6 gap #1 — the last validation-tier
      runtime gap.
- [x] **Script 01 production cleanup — DONE (pushed).** Trimmed ~208 lines of
      exploratory/diagnostic noise to a 77-line spine (load → coord_counts →
      parking detect → flag → persist). Dropped unused spdep + redundant
      ggplot2, removed dev.new(), dynamic plot subtitle; removed the superseded
      parkade_signature detection path (grep-proven dead before deletion);
      moved the coord-distribution EDA figure to new `scripts/eda/01b_coord_distribution.R`;
      added full header contract. Every step byte-verified output-neutral
      (both CSVs identical to baseline). Stage-C section_path() reroute
      correctly NOT done — bare-relative own-section paths are the documented
      house rule (_bootstrap.R), so 01 already conforms to siblings 06/08.
- [x] **building-permits migrated to portability pattern — DONE (7-commit campaign).**
      Bootstrap sourced; 03 boundary via shared_path(); reorg flat → production/+eda/
      (no validation tier — no oracle); header contracts + 01 name-drift fix; 01
      absolute path → raw-snapshot discovery. Then production cleanup: 02a
      standalone-run bug fixed (loads JOB_CATEGORY from raw snapshot, drops 02
      session dependency — whirl-ready); 02a diagnostics extracted to
      eda/02b_job_grouping_checks.R and production 02a narrowed to a JOB_CATEGORY-only
      read (move-before-narrow, both stopifnot gates kept in production). 02 + 03
      confirmed already lean (their prints are operational run-logging tied to writes,
      not EDA — correctly NOT split). Byte-verified throughout on deterministic 03 +
      masked-date on 02a's §4.7 contract output; 02 parse-checked (live-fetch →
      byte-cmp N/A, the standard for fetch scripts). Prereq #1 for Calgary city-layer
      now MET; whirl can glob a uniform production/ across both migrated sections.
- [x] **02a standalone-run bug — RESOLVED (fdee7bc + the 02b split).** Was: referenced
      permits_raw in-session, would fail under whirl's fresh-process orchestration. Now
      reads its own input from the raw snapshot via list.files() discovery. Whirl-readiness
      closed — no cross-process session dependency remains.
- New eda artifact: `building-permits/scripts/eda/02b_job_grouping_checks.R` — standalone,
  read-only diagnostics (mapping echo, coverage, row/category/BUILDING_TYPE/coord splits);
  reloads from disk (raw snapshot + grouping CSV); emits no contract output. The job-grouping
  exploration that previously bloated production 02a.
- [ ] **building-permits .RData (112MB) on local disk** — already gitignored + never tracked
      (not a git problem). Local-disk note only; delete if reclaiming space.
- [~] **`shared/` build-out — PARTIAL.** [x] Squatting Business Census script
      relocated to pipeline/economy/business-census/ (4-commit campaign, byte-verified,
      history preserved); shared/ now base-geo-only on disk. [ ] Road / vegetation /
      speed-zone base layers (shared/'s real purpose, STRUCTURE_UPDATE Day 3/4) still
      not built. (Prereq #2 for the Calgary city-layer decision, CLAUDE.md §10 — now
      partially met: relocation half done, base-geo-layer half remains.)
- [ ] **Section output/ tracking inconsistency** — economy/business-census commits its
      output/ (geojson/csv/log, also the frontend deliverable source), while
      property-assessment + building-permits gitignore most regenerable output/. Decide a
      consistent policy. Low priority; surfaced during the Economy relocation.
- [ ] **`shared/` tracked RStudio junk** — `.RData` + `.Rhistory` committed
      under `pipeline/shared/`. Gitignore + untrack (same as the
      property-assessment `.Rhistory` cleanup item).

### Frontend — sections not yet built
- [ ] **Point layers batch** (Amenities):
      ETS Bus Stops (4vt2-8zrq), LRT Stations (j77g-ki3x),
      Police Stations (e7aq-scxv), Attractions (7yt8-7467),
      Public Libraries (jn25-zspi).
      Pattern A output: one `<layer>.pmtiles` on R2 +
      one `<layer>_coverage.csv`.
      Air Quality + Business Licences held pending
      volatility/density resolution.
- [ ] **Permit Neighbourhoods choropleth** — BUILT with full
      Property Assessment parity: custom basemap, fill/outline/
      highlight/label layer stack (pnbhd-* ids), 3 polygon states,
      300ms-delay hover popup + click-to-pin + feature-state, 4
      metrics (count / total + median construction value / units
      added) with per-metric ramps + live repaint, 2009–2026 year
      selector. 18-year GeoJSONs committed; route wired; deployed
      to the demo (eslint + build + local-dev verified). Only
      remaining: Olivia QA sign-off.
- [ ] **Zoning choropleth** — nav leaf exists, no backend
      data yet.
- [x] **Business Counts** — BUILT / live (Edmonton Business Census
      choropleth at `/economy/business-counts`; provenance note shipped).
      Refresh-by-design parity **PARKED**: its year is baked into the GeoJSON
      filename + column keys with no manifest to source it from — needs a
      backend `{surveyYear, priorYear}` emit. Spec: `docs/BC_MANIFEST_HANDBACK.md`.
- [ ] **Salary Ranges table** — city-wide non-spatial
      table under Economy. Backend not started.
- [x] **Neighbourhood Report Card** — BUILT / live (`/report-card`): sortable,
      searchable Layer-2 aggregate table. CSV filename + header year derive from
      the PA manifest (refresh-by-design). (Was "parked" — superseded.)

### Frontend — polish deferred from Phase 1
- [x] **Neighbourhood search — custom combobox: RESOLVED (was already done).**
      `SearchInput.jsx` already renders a custom `<ul role="listbox">`, NOT a
      native `<datalist>` (its header comment says so), so the cross-browser
      `<datalist>` concern this item names was retired before the item was
      written. Dark-themed 2026-07-16 (`d6e8ad5`): the input + its results
      dropdown had fallen through to SearchInput's LIGHT base styles (built for
      the Report Card page) and rendered browser-white on the dark map — both
      re-skinned to the dark-glass system, the highlighted result now takes the
      standardized petrol+teal active material, and the standalone search
      button's hover no longer washes to a white pill (it layers the lift over
      the dark fill, which the rail buttons get from their group backing).
      Scoped to `.pa-search-peek` so the Report Card's light search is untouched.
- [ ] Map fly-to easing — ease-out quad vs default linear.
- [ ] Map scrollytelling / guided tour (centrepiece per
      UIUX doc, medium effort).
- [ ] Mobile layout polish (post-v2).

---

## 2. New Phase 2 workstreams

### Aggregate-map standardization (PA is the website standard)
- [x] **Tier A — DONE.** Dwelling Units + Business Counts re-skinned onto the PA
      immersive instrument (identity column, metric SegmentedControl, right rail,
      SearchPeek, tips/attribution, single-select DetailPanel). Shared chrome lives
      in `website/src/components/`.
- [x] **Tier B — DU analyst Data Console DONE (2026-07-16, `4819f55`→`af9ab1d`;
      CLAUDE §12 v1.12).** DU backend UNFROZEN: `02b_combine_geojson.R` emits the
      combined all-years file (mirrors PA 07b; wired into `_whirl.yaml`). Frontend on
      PA's combined-file model + the full console (@tanstack table, KPI rail,
      distribution, Year + metric-range sliders, trend, District facet → dim,
      box-select, CSV/GeoJSON/PNG export). Reuse = **extract-by-copy** — console leaves
      lifted to `components/`, **PA `DataTable.jsx` byte-identical**; the PA de-dup is a
      DEFERRED follow-up. `@tanstack` scope widened PA→PA+DU (§9). Aggregate =
      reportable-only.
- [ ] **PA console de-dup (deferred).** Rewire PA's `DataTable.jsx`/
      `PropertyAssessmentMap.jsx` to import the shared `components/` leaves and delete
      the inline defs; gate on a PA behavior-identity check. Off the DU critical path.
- Business Counts stays **view-only** (single survey year — no console).

### Agent pipeline
- [ ] **Sanity Agent** — N≥100 gate, YoY ±10% jump
      detection, spatial neighbour check. Olivia owns
      ongoing operation.
- [ ] **Refresh Report Agent** — structured output on
      each pipeline run.
- [ ] **Narrative Agent** — plain-language summary of
      each refresh for sidebar/download.
- [ ] **Watchdog Agent** — monitors source dataset
      update timestamps.
- [ ] **Insight Agent** — flags notable changes.
- [ ] **Digest Agent** — weekly summary email.
- [ ] Agent runs table — `agent_runs` logging
      (in/out/tools/tokens/cost/duration) from day one.

### Evaluation remediation — hardening program (post-eval 2026-07-08)
Tiered remediation from the July 2026 evaluation. Tier 0 (durable
run records) shipped (`e67a658`).
- [x] **Tier 2 — container-universe reconciliation: COMPLETE
      end-to-end (2026-07-13, `3d43d02`→`c6b3d93`).** The
      three-encoding / three-universe finding is closed. 8885–8888
      are kept-and-labelled **annexation areas** (relation
      `annexation_area` + orthogonal `is_annexation_area` flag),
      not dropped — geometry-confirmed standalone tiles, not
      umbrella containers (directive-00b; ruling
      `DECISION_container_universe_20260710.md`). All three
      sections (PA/BP/BC) reconcile through **one canonical
      crosswalk** on **one 407-polygon universe** (rescue oracle
      retired), and the flag now **renders** — teal annexation
      outline + legend row on every map (first `greyStates` pass,
      also closing finding 13f) + an About-page methods line.
      Flag-driven, no hardcoded ids. Two latent cross-section bugs
      fixed en route (HVA `suffix_drift`→`merge` `e6265f8`; `07b`
      combiner carries the flag `e7e23e7`). BP/PA data also advanced
      to the 2026-07-13 snapshot.
- [ ] Tiers 1, 3–5 — remain open (see hardening notes).

### Boundary file migration
- [x] **407-boundary migration DONE.** The PA pipeline reads the
      407-row City of Edmonton Neighbourhoods CSV (65fr-66s6) via
      the guarded `load_boundary()`. The old 08/08b build+rescue
      scripts were restructured into 05/06/07 (there is no 08b);
      rescue IDs resolved through the canonical crosswalk (above),
      and the 403→407 annexation universe shipped 2026-07-13 (Tier 2).
- [ ] Mature Neighbourhoods CSV (111-row subset) —
      add as boolean attribute lookup only, not boundary.
      [STILL OPEN — not yet wired; independent of the boundary migration.]

### Repository / infrastructure
- [ ] Add Olivia (Write) + Prof as GitHub collaborators.
- [ ] Transfer repo ownership to Prof or UAlberta org.
- [ ] Branch protection on main once Olivia is reviewing.
- [ ] Confirm LICENSE holder with Prof.
- [ ] **`yeg_` output prefix** (CLAUDE.md §10 Calgary prereq) — apply at the
      multi-section handoff rollout (building-permits + economy), NOT before.
      Needs its own frontend-inclusive blast-radius grep (frontend loads
      GeoJSONs by name). Setting it once across all sections at rollout is
      cheaper than per-section now.
- [ ] **Refresh-run JSONL schema reconciliation** — `run_section.R` emits
      run records to `runs/refresh_runs.jsonl` (run_id, section, script,
      status, message, started_at, duration_secs, + handoff_copy records).
      Reconcile this shape against `schemas/refresh_report.v1.json` so the
      Refresh Report agent consumes it without a translation layer. Also decide
      stdout-capture depth (currently message:"" on success — capture per-script
      operational prints?).

---

## 3. What is locked / stable entering Phase 2

- Three Layer 1a rules at F1 ≥ 0.97 (parking, R1, R3).
  Ship-ready, deterministic, temporally stable.
- Layer 2 aggregation formulas (8 columns, N<100
  suppression, Stata3 equivalence confirmed).
- 407-polygon boundary (65fr-66s6) as source of truth.
  ID-based join is the locked join strategy.
- Property Assessment choropleth — production, live,
  per-metric palettes, gradient legend, full popup.
- Building Permits point map — production, live,
  per-year GeoJSON (PMTiles/R2 tiler retired, §12 v1.10),
  interactive legend, standard popup.
- Permit Neighbourhoods choropleth — built (full assessment
  parity), deployed to demo; awaiting Olivia QA sign-off.
- Download page — `/download` serves 3 cleaned CSVs (PA neighbourhood
  aggregates + permit category counts + permit coverage) from
  `website/public/downloads/`. Labels / filenames / coverage spans are
  manifest-resolved at render (no year literals); `siteConfig.downloads`
  holds year-free token skeletons.
- **Host: Cloudflare Pages (current).** VM build DEFERRED until VM specs arrive;
  resume = bare-server analysis fed real specs (cert→server choice,
  local-FS→atomic-flip, egress→basemap/upgrades). (R2 tiles retired with the tiler
  — BP points are per-year GeoJSON now; CLAUDE.md §12 v1.10.)
- Host-portable serve target: `VITE_BASE_PATH` (deploy base + router basename),
  `_redirects` / nginx `try_files` SPA fallback, and one base-resolution seam
  (`src/utils/assetUrl.js`) routing every runtime asset fetch — Cloudflare-Pages
  defaults, subpath deploy works end-to-end.
- React + Vite + MapLibre stack (locked; PMTiles retired, §12 v1.10).
- Neighbourhood join: always on Neighbourhood ID,
  never on name (name drift is the documented failure).
- Refresh-by-design (frontend): no year literals in PA, Building Permits (point
  + choropleth), Report Card, or Download — each section's `manifest.json` drives
  year / filename / span auto-discovery. One parked exception: Business Counts
  (needs a backend manifest emit — `docs/BC_MANIFEST_HANDBACK.md`).
- Orchestration: thin callr runner, sole-publisher model, proven live on PA.
  Pipeline scripts → output/ only; runner publishes output/ → public/ per the
  manifest. cwd-per-section (YAML, not .Rproj); dependency order (08d-before-07).
- PA GeoJSON output naming normalized: uniform `neighbourhoods_<YYYY>_recovered.geojson`
  for all years (current + historical), all in output/. Handoff is an identity copy.

---

## 4. Immediate next actions (priority order)

1. ~~Resolve 08b rescue table (CHAPPELLE / HERITAGE VALLEY IDs) — blocks next
   pipeline refresh.~~ — **DONE (Tier 2).** Folded into the canonical crosswalk
   (`neighbourhood_crosswalk_20260622.csv`); 08b retired into 05/06. The
   2026-07-13 refresh ran clean, so it no longer blocks anything.
2. ~~Migrate building-permits to the portability pattern~~ — **DONE** (7-commit
   campaign; see Backend/pipeline above). Both sections now expose a uniform
   `production/` + `eda/`. Calgary city-layer prereq #1 MET.
3. **Build out `shared/` as a base-geo section** — ~~relocate the squatting Business
   Census script to an Economy section~~ **DONE** (now `economy/business-census/`,
   path-anchored via `shared_path()`); remaining: road / vegetation / speed-zone base
   layers. Calgary city-layer prereq #2 (CLAUDE.md §10) now **partially met** —
   relocation half done, base-geo-layer half remains.
4. **Orchestration layer — DONE, proven live on PA.** Built a thin `callr`-based
   runner (`run_section.R` + `_whirl.yaml`), NOT whirl (evaluated and dropped —
   see CLAUDE.md v1.5). One fresh process per script; cwd-per-section from YAML;
   dependency order (08d-before-07). The runner is the sole publisher to
   `website/public/` — pipeline scripts write only to `output/`. Live PA run:
   9 scripts + 15-year handoff, all ok; yoy populated (277/345); current-year
   staleness closed; manifest now built from output/ (fixed a stale-2026 scale
   bug). Next: replicate the runner pattern to building-permits + economy.
5. Point layers batch — R pipeline first, then Pattern A frontend (one CC
   session per layer).
6. Permit Neighbourhoods choropleth — Olivia QA sign-off (built, deployed to demo).
7. Add collaborators + branch protection.
8. Layer 1b (LISA I) — stretch goal before agent work.
9. Begin Sanity Agent scaffolding.

---

*Next update: after first Phase 2 milestone ships.*
*Maintained by Kaustubh Chati*
