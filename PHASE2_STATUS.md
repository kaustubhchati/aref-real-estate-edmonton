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
- [ ] **08b rescue table** — CHAPPELLE AREA → ID 5471,
      HERITAGE VALLEY TOWN CENTRE AREA → ID 5472 in new
      407-polygon boundary. Old IDs 5462/5464 no longer
      exist. Resolve before next pipeline refresh.
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
- [ ] **`shared/` not built out as a base-geo section** — currently holds only
      the canonical boundary CSV (correct) + a squatting Business Census script
      (`01_yeg_business_nbgh_agg.R`) that belongs in a future Economy section,
      not shared. Road / vegetation / speed-zone base layers — its real purpose
      (STRUCTURE_UPDATE Day 3/4) — not yet built. On relocating the business
      script: it hand-rolls `SHARED <- … + file.path()` instead of
      `shared_path()`; route through the helper when it moves. (Prereq #2 for
      the Calgary city-layer decision, CLAUDE.md §10 v1.3.)
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
- [ ] **Business Counts** — migrated from StatCan to
      Edmonton Business Census (neighbourhood level).
      Requires explicit provenance note on ship.
- [ ] **Salary Ranges table** — city-wide non-spatial
      table under Economy. Backend not started.
- [ ] **Neighbourhood Report Card** — parked. Map +
      functionality unresolved.

### Frontend — polish deferred from Phase 1
- [ ] Neighbourhood search — custom combobox replacing
      native `<datalist>` (inconsistent cross-browser).
- [ ] Map fly-to easing — ease-out quad vs default linear.
- [ ] Map scrollytelling / guided tour (centrepiece per
      UIUX doc, medium effort).
- [ ] Mobile layout polish (post-v2).

---

## 2. New Phase 2 workstreams

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

### Boundary file migration (in progress)
- [ ] Scripts 08 + 08b fully migrated to new
      City of Edmonton Neighbourhoods CSV (65fr-66s6,
      407 rows). Parallel non-destructive GeoJSONs
      confirmed. Resolve 08b rescue table IDs (above).
- [ ] Mature Neighbourhoods CSV (111-row subset) —
      add as boolean attribute lookup only, not boundary.

### Repository / infrastructure
- [ ] Add Olivia (Write) + Prof as GitHub collaborators.
- [ ] Transfer repo ownership to Prof or UAlberta org.
- [ ] Branch protection on main once Olivia is reviewing.
- [ ] Confirm LICENSE holder with Prof.

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
  PMTiles on R2, interactive legend, standard popup.
- Permit Neighbourhoods choropleth — built (full assessment
  parity), deployed to demo; awaiting Olivia QA sign-off.
- Download page — `/download` serves 3 cleaned CSVs
  (2026 neighbourhood aggregates + permit category counts +
  permit coverage) from `website/public/downloads/`,
  data-driven from `siteConfig.downloads`.
- Cloudflare Pages (demo) + R2 (tiles) infrastructure.
- React + Vite + MapLibre + PMTiles stack (locked).
- Tippecanoe recipe locked:
  `-r1 --no-tile-size-limit --no-feature-limit`.
- Neighbourhood join: always on Neighbourhood ID,
  never on name (name drift is the documented failure).
- Refresh-by-design: no year literals anywhere in
  frontend; manifest.json drives year auto-discovery.

---

## 4. Immediate next actions (priority order)

1. Resolve 08b rescue table (CHAPPELLE / HERITAGE VALLEY IDs) — blocks next
   pipeline refresh.
2. ~~Migrate building-permits to the portability pattern~~ — **DONE** (7-commit
   campaign; see Backend/pipeline above). Both sections now expose a uniform
   `production/` + `eda/`. Calgary city-layer prereq #1 MET.
3. **Build out `shared/` as a base-geo section** — road / vegetation / speed-zone
   reference layers; relocate the squatting Business Census script to an Economy
   section (route it through `shared_path()` on the move). Calgary city-layer
   prereq #2 (CLAUDE.md §10 v1.3).
4. **Whirl orchestration layer** — now unblocked: both migrated sections expose a
   uniform `production/` for whirl to glob, and 02a's standalone fix removed the
   last cross-process session dependency. Report-side prerequisite.
5. Point layers batch — R pipeline first, then Pattern A frontend (one CC
   session per layer).
6. Permit Neighbourhoods choropleth — Olivia QA sign-off (built, deployed to demo).
7. Add collaborators + branch protection.
8. Layer 1b (LISA I) — stretch goal before agent work.
9. Begin Sanity Agent scaffolding.

---

*Next update: after first Phase 2 milestone ships.*
*Maintained by Kaustubh Chati*
