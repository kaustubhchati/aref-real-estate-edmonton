# CLAUDE.md

> **Version: v1.7 — authoritative. Supersedes all prior versions (v0.1–v1.6).**
> This is the single source of project context for every Claude Code session — read it first.
> If any other note, comment, or older doc frames *the website* as an "agent-driven platform,"
> that framing is **retired** — see §1.
> Owner / **builder**: KC (Research Assistant, UAlberta) — direct-push authority to `main` (§7).
> Verifier: Olivia (post-hoc review, §7). Supervisor: Prof. Haifang Huang.
> Last updated: 2026-06-25. Phase 1 is **CLOSED** (see PHASE1_STATUS.md, now archive);
> current open work tracked in **PHASE2_STATUS.md**.

---

## 0. How to read this file

This is a system prompt loaded into every Claude Code session, not human documentation.
Every claim here is treated as authoritative. Editing rules:

1. **Truth or `[OPEN]`** — every claim is verified or flagged `[OPEN]`. No optimistic placeholders.
2. **Short over comprehensive** — verbosity is expensive forever.
3. **Labeled sections** — each is independently loadable ("load §3 and §6").

---

## 1. What this is — and what it is NOT

The current deliverable is a **free-tier, static website** that replicates the public
*Open Data Centre for Alberta Urban Real Estate* site (`realestatedata.srv.ualberta.ca`) —
the ~14 Tableau Public dashboards rebuilt as our own maps and pages, plus more later —
**fed by an R data pipeline.**

It is **NOT** a live, agent-driven platform. No server, no runtime database, no API. The larger
agentic platform (PostgreSQL/PostGIS, FastAPI, the six-agent design) is a **parked future
direction — do not build it, do not assume it, do not propose it as the website's architecture.**

Two parts, different natures:

- `pipeline/` — **backend.** R, runs on the laptop at refresh time, produces data files. Never deploys.
- `website/` — **frontend.** React + Vite + PMTiles, builds to static files, deploys.

Research infrastructure, not a commercial product. Users: Prof. Huang's group, partner
researchers, the public. Bar: "researchers and the public can rely on it" — not five-nines uptime.

**Out of scope — do not implement or propose:** commercial productization / Model D (parked
future idea only); user accounts, auth, paywalls; a runtime DB/server/API for the site;
real-time updates beyond source-API cadence; row-level predictive modelling (the previous RA's
random forest is discarded).

---

## 2. Locked architecture (decided May 2026 — do not relitigate)

- **Backend = the existing R pipeline, unchanged.** Layer 1a (parking / R1 / R3) + Layer 2
  aggregates. No rewrite to SQL/Python; not called at runtime.
- **Frontend = React + Vite + PMTiles**, MapLibre carried over. Build **one component and one
  map at a time.**
- **No database, no server for the site.** SQL is not needed (build-time only, optional).
- **Deploy = git push** to the host (UAlberta hosting is git-capable, push-based, like Cloudflare).
  Only `website/` builds and deploys; `pipeline/` stays on the laptop.
- **GitHub = source of truth;** the host gets built artifacts only.
- **Displayed identity is placeholdered** in `siteConfig.js` (§6) — no real
  university / centre / professor / author strings baked into pages yet.
- **Orchestration = a thin in-repo runner (`run_section.R`), cwd-per-section,
  one fresh process per script.** The runner reads section config from
  `_whirl.yaml` (cwd + dependency-ordered script list), cds into each section's
  declared cwd, and runs each script in a fresh R process via `callr` so a
  script's correctness depends only on its disk inputs, never on session state.
  The authoritative cwd is the YAML's declared section path, NEVER `.Rproj`
  (an editor marker). Within a section, script order is the dependency order
  declared in the YAML, not numeric filename order (e.g. PA runs 08d before 07
  so 07's yoy backref populates). Verified live across all 9 PA scripts.
- **The runner is the SOLE publisher to `website/public/`.** Pipeline scripts
  write ONLY to their section's `output/`. After all of a section's scripts
  succeed, the runner publishes by copying the files that PHYSICALLY EXIST in
  `output/` (Way A: a `glob` copy supporting a directory remap, plus `files`
  fixed-file copies for CSVs and the section's manifest) to `website/public/`
  (identity copy), logging each to `runs/refresh_runs.jsonl`. It does not parse a
  manifest to decide what to copy. (PA's original manifest-year-driven path is
  retained behind a guard.) No pipeline script may write to public — that
  coupling is what produced silent current-year staleness, now removed.
- **Manifest shape follows source structure; each section emits its own.** Every
  section writes its own `manifest.json` to its own per-section public path (no
  global merged manifest, matching the Way-A handoff which copies each section's
  manifest as a fixed file). Single-source sections emit a flat
  `{years, defaultYear}` manifest (e.g. building-permits). Multi-source sections
  emit a richer manifest (e.g. property-assessment: a nested cities/section
  structure with per-year colour scales, spanning current and historical raw
  sources in one year range). The frontend reads each section's manifest in its
  own shape. This is a generative rule, not a per-section exception: a future
  section's manifest shape is determined by whether it has one raw source or
  several.

---

## 3. Repository layout

Pipeline and frontend are both organised **by section**, with the *same section names on both
sides*: `pipeline/<section>/` mirrors `website/src/content/<section>/`.

```
aref-real-estate/                # main folder = the repo (one clone = everything)
│
├─ README.md                     # what it is + how to run/deploy — first read for a new RA
├─ CLAUDE.md                     # this file (authoritative)
├─ PHASE1_STATUS.md              # pipeline state: rules, coverage, acceptance, open items
├─ REFRESH_NOTES.md              # quarterly refresh log Olivia reviews
│
├─ pipeline/                     # BACKEND — R, runs on the laptop, never deploys
│   ├─ yeg/                      #   EDMONTON city container — city WRAPS section (§2/§10).
│   │   │                        #   Sections live UNDER the city; shared/ is city-scoped.
│   │   ├─ shared/               #     CITY-WIDE BASE-GEO SECTION: reference geometry whose
│   │   │                        #     OUTPUTS feed many sections — neighbourhood boundary (the
│   │   │                        #     canonical ID-join geometry), road network, vegetation,
│   │   │                        #     speed zones. A data section (fetch→process→emit), NOT a
│   │   │                        #     helper library. Reached via shared_path(). City-bound.
│   │   │                        #     Base-geo-ONLY on disk now (boundary + Mature
│   │   │                        #     Neighbourhoods); no orphaned scripts.
│   │   ├─ property-assessment/  #     BUILT — Layer 1a + 2, historical backfill, manifest
│   │   │   ├─ scripts/          #       01_load … 09_build
│   │   │   ├─ data/             #       raw/  processed/  validation/  reference/
│   │   │   └─ output/           #       this section's products: GeoJSON / PMTiles / CSVs
│   │   ├─ building-permits/     #     BUILT — point PMTiles (R2) + neighbourhood aggregates
│   │   ├─ economy/              #     ECONOMY section — neighbourhood-level economic data
│   │   │   └─ business-census/  #       BUILT — Business Census choropleth; scripts/ data/ output/
│   │   ├─ crime/                #     (added when built)
│   │   └─ …
│   └─ yyc/                      #   CALGARY placeholder (.gitkeep only). Wired in the
│                                #   Calgary-introduction campaign — §10. No contents yet.
│
├─ website/                      # FRONTEND — React + Vite, the deployable unit
│   ├─ public/data/              #   built data the site serves (copied from each section's
│   │                            #   pipeline output; subfolder by section)
│   ├─ src/
│   │   ├─ config/siteConfig.js  #   identity + nav, in ONE place (placeholders)
│   │   ├─ shell/                #   SCAFFOLD: Header, Nav, Footer, Layout — reused everywhere
│   │   ├─ components/           #   shared blocks: MapView, Legend, Tooltip, DownloadButton
│   │   └─ content/              #   ADDITIONS: one folder per section (mirrors pipeline/)
│   │       ├─ property-assessment/
│   │       ├─ building-permits/
│   │       ├─ crime/
│   │       ├─ report-card/
│   │       └─ pages/            #   Home, About, Download, Feedback (simple text pages)
│   ├─ index.html
│   ├─ package.json
│   └─ vite.config.js
│
└─ docs/                         # prof flowchart, cost-saving doc, onboarding
```

**Rules the structure enforces**

- Three top folders, three jobs: `pipeline/` makes data (local only), `website/` is the
  deployable app, `docs/` is handover/prof material.
- **Sections mirror across the repo.** `pipeline/<city>/<section>/` ↔ `website/src/content/<section>/`.
  The city layer (`yeg/`) is on the **pipeline** side only; the frontend tree + the
  `website/public/data/` handoff stay flat (un-citied) until a second city ships — same
  deferral as the `yeg_`/`yyc_` output prefixes (§10). Edmonton sections resolve through
  `shared_path()`/`section_path()`, which anchor at `pipeline/yeg/` (see `_bootstrap.R`).
- **Each pipeline section is self-contained** (`scripts/ data/ output/`) and runs its own
  fetch → clean → aggregate → output. Cross-section base geometry — the neighbourhood
  boundary especially, plus road / vegetation / speed-zone reference layers — lives in
  `pipeline/yeg/shared/`, emitted once for all sections to consume. `shared/` is a data section
  (shared outputs), not a helper library; its scope is one city (so it is city-scoped → under `yeg/`).
- Backend → frontend handoff is one copy: a section's `output/` → `website/public/data/`.
- Restricted/confidential inputs live **only** in a section's `data/` (`raw/` or `validation/`)
  and are **gitignored** — never committed, never deployed.
- **Fit note:** only create folders for sections that exist. Built today, all under
  `pipeline/yeg/`: `property-assessment`, `building-permits`, `economy/business-census`, plus
  the `pipeline/yeg/shared/` base-geo section (boundary + Mature Neighbourhoods only;
  road/vegetation layers pending). `pipeline/yyc/` exists as an empty Calgary placeholder
  (`.gitkeep` only) — no section folders until Calgary is wired (§10). Copy the pattern per new
  section — no empty stubs.

---

## 4. Pipeline invariants (backend) — in force

These bind every pipeline script. (Carried from the validated phase-1 methodology.)

- **4.1 Public-data rules only in production.** Production cleaning rules reference only public
  columns. Confidential data (the 2023 oracle xlsx, any future confidential snapshot) is used
  **once, at validation time**, to score precision/recall — it never enters production.
  Violating this is a blocker.
- **4.2 Eval-first.** No rule ships without a scorecard on disk plus a row in
  `output/rule_scorecards_<year>.csv`. Unscored = doesn't exist for production.
- **4.3 Year-invariant rules.** Thresholds are domain-justified constants (e.g. parking's
  $80,000 cap) or recomputed from the year being cleaned — never memorized from the 2023 oracle.
  The oracle scores rules; it does not parameterize them.
- **4.4 Versioned contracts.** Anything other components consume (canonical 5-class list,
  scoreboard schema, reference tables) is version-/date-stamped. Changing a contract = new
  version + deprecation note. Silent in-place edits are blockers.
- **4.5 Audit traceability.** Every artifact records what produced it (rule_id, year;
  `date_curated`/`curated_by` on reference rows).
- **4.6 Human-gated promotion.** No cleaned data reaches a public surface without explicit human
  review — even at 100% oracle scores. For the website, that human is **KC**: as the builder with
  direct-push authority (§7), KC's own review before pushing to `main` satisfies this gate. A
  future RA who is not KC still routes through Olivia's PR review before merge.
- **4.7 Cross-product reconciliation via curated mappings.** When two City products disagree on
  a name/ID, reconcile through explicit, sourced, dated mapping tables under `data/reference/` —
  never fuzzy matching or silent auto-correction. Non-destructive (`_recovered` artifacts).
  Established example: `neighbourhood_name_mappings_20260519.csv` (8 mappings).
- **4.8 Socrata fetches go through the shared helper.** All bulk fetches call
  `pipeline/yeg/shared/fetch_helpers.R::fetch_socrata_snapshot()`. Download-to-disk model: each fetch
  writes a dated raw snapshot to the section's `data/raw/` (provenance record), then reads it.
  Export endpoint only (`rows.csv?accessType=DOWNLOAD`); the `/resource/` query endpoint is never
  used because it silently caps at 1000 rows. Reliability is built in: a curl stall-detect handle
  (abort below 100 B/s for 60s) plus a 1200s absolute backstop, atomic temp-then-promote (a failed
  download never persists under the dated name), and size/row/required-column floors verified on
  the temp before promotion. Callers pass per-dataset floors and a `filename_stem` so each section
  keeps its own on-disk snapshot name. Do not hand-roll fetches; do not stream URLs straight to
  memory.

---

## 5. Pipeline state (validated)

Three rules validated at F1 ≥ 0.97 (parking 0.989, R1 0.992, R3 0.974); Layer 2 aggregates
ported from Stata3; spatial join + name-fallback rescue complete. The 2026 pipeline ships
365,406 rows.

**Temporal asymmetry:** rules validate on the 2023 oracle, run on 2026+ public data; F1 ≥ 0.97
across the 3-year gap is the year-invariance contract (§4.3). Layer 2 aggregates from 2026 data
will **not** numerically match the previous RA's 2023 outputs — that's expected, not a defect.

→ Numbers, coverage math, colour-scale domain, polygon states, and the cross-product naming
finding live in **PHASE1_STATUS.md**.

---

## 6. Website build (frontend)

**Shell vs content.**
- **Shell** = `Layout`, `Header`, `Nav`, `Footer`. Built once, wraps every page. Reads all
  displayed identity from `siteConfig.js`.
- **Content** = one self-contained folder per section under `content/`. Adding a section
  (e.g. crime) = add one folder; nothing else moves.
- **`siteConfig.js`** = the single source of identity + navigation. All org-specific strings are
  placeholders here, never hardcoded in components:

```js
export const siteConfig = {
  org:    "{University Name}",
  centre: "{Data Centre Name}",
  dept:   "{Department}",
  funder: "{Funder}",
  nav:    [ /* the section tree below */ ],
};
```

**Nav tree** (from the live site; `map` = data/map page, `page` = text/utility):
Home `page` · Data Collection → Neighbourhood Profile `map` · Properties & Property Assessment →
Properties `map`, **Property Assessment `map` (first milestone)** · Building Activity → Dwelling
Units `map`, Construction & Improvement `map` · Real Estate Market Activity → Land Transfers `map`
· Amenities → Air Quality / Community Services / Crime / Public School / Public Transportation
`map` ×5 · Businesses → Business Licences / Business Counts `map` ×2 · Neighbourhood Report Card
`tables` · Download `page` · Research Competition `page` · About Us `page` · Feedback `page`.
Footer (funder line, data partners, territorial acknowledgment, logo, copyright) — all from `siteConfig`.

**Built / live (2026-06):** Property Assessment `map` (5-metric choropleth), Construction &
Improvement `map` (Building Permits point map), plus an **added** Permit Neighbourhoods `map`
(neighbourhood choropleth, under Building Activity — our addition, not on the live source site),
and the Download `page` (serves 3 cleaned CSVs from `public/downloads/`, `siteConfig.downloads`).
Everything else remains a placeholder.

**Legibility standard — VERY IMPORTANT.** This code is maintained by people learning web dev
(Olivia) and inherited by future RAs. **Legibility beats cleverness, always.**
- The bar: *as sophisticated as the least-experienced maintainer can follow, and no more.*
- Match complexity to the problem — these are simple problems (maps, toggles, tooltips,
  downloads). Don't over-engineer. Real structure (a shared `MapView`) is welcome *because* it
  makes the code clearer; cleverness the problem didn't ask for is not.
- Patterns to follow in every file (worked reference example:
  `pipeline/yeg/property-assessment/scripts/production/09_build_choropleth.html`):
  header comment stating the file's contract; `// ===` section banners; data-driven tables
  (`STOPS`, `STATE_STYLE`, `POPUP_ROWS`) consumed by loops; small named single-purpose functions;
  comments explain the **why**, not the what; honest surfaced errors; plain readable code over clever.
- If Olivia can read a file and follow it, it's clean enough. If she can't, it isn't — even if it works.

**Data flow.**
```
Edmonton Open Data → (quarterly, on laptop) pipeline/yeg/<section>/ fetch→clean→aggregate
  → pipeline/yeg/<section>/output/ (GeoJSON / PMTiles / CSVs)
  → copied to website/public/data/<section>/ → Vite build → website/dist/ → git push → host
```
The Edmonton portal is touched **only at refresh time** on the laptop, never on a visit.
**Fit note:** the neighbourhood choropleth is 407 polygons (City of Edmonton Neighbourhoods CSV
65fr-66s6, adopted as the boundary source — §10) — load it as plain GeoJSON. Reserve PMTiles for
high-volume layers (parcel-level properties, permit points) where it earns its keep.

**Published-output CSV naming standard — LOCKED (the contract all sections conform to).**
Web-served CSVs (the copies under `website/public/`) are named:
- current-year:    `yeg_<section>[_per_nbhd]_<dataYear>.csv`
- historical span: `yeg_<section>[_per_nbhd]_<minYear>-<maxYear>.csv`

Rules: the `yeg_` city prefix is on **published** artifacts ONLY — a section's `output/` frames
stay **unprefixed** (internal, keep their `YYYYMMDD`/working names). `_per_nbhd` marks a
per-neighbourhood aggregate. Year / span endpoints reflect the **data**, never invented literals.
This is a **publish-time rename**: the runner's handoff `to:` carries the standard name while
`from:`/`output/` keep the internal name — which **supersedes** the older "no rename bridge"
line in `docs/STRUCTURE.md`. Applied here to PA's served aggregate
(`yeg_property-assessment_per_nbhd_2026.csv`, was `neighbourhood_aggregates_2026.csv`); other
sections (e.g. BP's `permits_*` CSVs) conform as they are standardized. The `yeg_` prefix is the
city token — the Calgary `yyc_` prefix builds on the same rule when Calgary ships (§10).
(Programmatic year-derivation in the handoff name is a per-section follow-up: the handoff `files:`
list does not yet template the year, so PA's published name currently mirrors the existing
year literal in its `from:` path.)

---

## 7. How we work — team & handoff

- **KC** is the **builder** and has **direct-push authority to `main`** — KC may commit and push
  to `main` without a prior review or preview by anyone else. This is the owner's standing
  decision (2026-06-19); a session does not need to ask before pushing when KC is driving.
- **Olivia** (PhD candidate, learning web dev) is the verifier. Her review is no longer a
  *blocking gate* on KC's pushes — it now happens **post-hoc** (review the pushed commit / live
  site) and is still how she stays current and catches issues. She reviews for **(1)** data
  correctness, **(2)** does the map look right, **(3)** can she read it.
- When a future RA (not KC) builds, fall back to the branch → PR → Olivia-review → merge flow —
  direct-push is KC's authority, not a blanket relaxation for everyone.
- Keep `README.md` and `REFRESH_NOTES.md` current. Everything must be **clone-and-run** for a
  future RA — no laptop-only magic, no undocumented steps. Generated code is reviewed like any
  other; it is never a black box.
- Git: small focused commits (what + why); one concern per push; never commit raw/restricted
  data, secrets, `dist/`, or `node_modules/`.

---

## 8. First milestone — the live clone

> **✅ ACHIEVED (2026-06).** The live clone shipped and went well beyond one map: the
> Property Assessment choropleth (5 metrics, per-metric palettes, gradient legend, full
> popup), the Building Permits point map, and an added Permit Neighbourhoods choropleth —
> all on the shared shell + custom basemap, deployed to Cloudflare Pages. Final Phase-1
> frontend state is in **PHASE1_STATUS.md §11–§12**. The original step list is kept below
> for the historical record.

Goal: a navigable shell with **one** working map, committed and deployed.

1. Scaffold the folder structure (§3) and a Vite + React app in `website/`.
2. Build `siteConfig.js` with placeholder identity + the nav tree (§6).
3. Build the shell — `Layout`, `Header`, `Nav`, `Footer` — reading from `siteConfig`.
4. Build shared components: `MapView`, `Legend`, `Tooltip`.
5. Port the **Property Assessment choropleth** from
   `pipeline/yeg/property-assessment/scripts/production/09_build_choropleth.html` into
   `website/src/content/property-assessment/`. Match its behaviour: choropleth fill on
   `median_assessvalue`; hover + click-to-pin popups; neighbourhood search (fly-to); the locked
   colour scale (PHASE1_STATUS §5); the five polygon states (aggregated / suppressed N<100 /
   non-residential / manufactured-home community / no-data). Clean up the dead unreachable branch
   in `09`'s `flyToName` while porting.
6. Stub the other nav pages (Home, About, Download, Feedback) so the site is navigable.
7. Commit in small steps; open a PR for Olivia.

Result: the **live clone** — shell + one real map — the proof the frame works.

---

## 9. Negative rules — do NOT

**Pipeline**
- Reopen the confidential xlsx outside `…/03_explore_rental_signal.R`. (§4.1 — one-time oracle; use the validation CSVs.)
- Write rule predicates that reference confidential columns. (§4.1 — derive a public-side signal.)
- Silently overwrite scoreboard rows. (§4.5 — remove-by-`rule_id`-then-append.)
- Hardcode oracle-year-specific thresholds. (§4.3.)
- Edit `data/reference/` or contract files in place. (§4.4 — version/date-stamp a new file.)
- Invoke the previous RA's pipeline. (Reference only; reuse only the documented inheritances.)
- Auto-resolve cross-product names with fuzzy matching. (§4.7 — surface to the human queue.)
- Write to `website/public/` from a pipeline script. (§2 — scripts write to
  `output/`; the runner is the sole publisher. A script writing public is the
  staleness bug that motivated the publish layer.)
- Key the runner's cwd off `.Rproj`. (§2 — `.Rproj` is an editor marker; the
  YAML's declared section path is authoritative.)
- Reorder a section's runner steps to match numeric filenames. (§2 — the YAML
  carries dependency order; PA's 08d precedes 07 by design.)
- Add an explicit `layer`/`name` to an `st_write` solely to force a byte-match
  on a GeoJSON rename. (Renaming a GDAL GeoJSON changes its embedded layer-name
  line by construction; the correct verification standard is data-identical
  MODULO that line, not literal byte-identity. Do not edit write logic to chase
  a literal match.)

**Website**
- Rewrite the R pipeline. (§2.)
- Hardcode org / university / professor / author names — `siteConfig` only. (§6.)
- Add a runtime database, server, or API. (§1.)
- Introduce stacks beyond React + Vite + PMTiles + MapLibre (+ Recharts for charts). (§2.)
- Duplicate cross-section base geometry (boundary, road/vegetation layers) into sections — it lives in `pipeline/yeg/shared/`. (§3.)
- Over-engineer, or merge code Olivia can't read. (§6.)

**Both**
- Propose commercial features, paid tiers, or Model D. (§1 — parked future idea, hard scope boundary now.)

---

## 10. `[OPEN]`

| `[OPEN]` | Resolve by | Status |
|---|---|---|
| Reconcile the colour-scale source reference (live page cites `PHASE1_STATUS.md §5`; confirm) | Before locking the React map | ✅ **Resolved** — per-year manifest scales + per-metric palettes locked (PHASE1 §12) |
| Calgary: mirror Edmonton pipeline or use the RE-prefix filter? | Calgary work start | ✅ **Resolved (decision; execution blocked on prereqs)** — NOT a duplicate `pipeline/`. Edmonton city-coupling is shallow (dataset IDs, boundary CSV, special-entity list, oracle = config; rules key on column concepts, not Edmonton identifiers). Decision: **city wraps section** (`pipeline/<city>/<section>/`); each city carries its **own** `shared/` base-geo section (cities share no base layers, so no cross-city shared geo); rule-bearing sections parameterize by a per-city config (IDs / boundary / special entities / oracle-present); **outputs carry `yeg_`/`yyc_` prefixes** so both cities coexist in `data/processed/` + website handoff — but the prefixes are **DEFERRED to the Calgary-introduction campaign**: until a second city exists there is no namespace collision to disambiguate, so outputs and frontend paths stay unprefixed; the prefixes land across all sections at once when the second city is wired, not ahead of it. The validation tier already self-skips via `conf_path()` when a city has no oracle (no new code). **Blocked on, in order:** (1) building-permits migration finished; (2) `shared/` built out (road/vegetation layers in; the squatting Business Census script relocated to an Economy section); (3) Calgary schema inspected (column-concept map + numeric-ID boundary join confirmed). **— UPDATE 2026-06-25 (v1.7): the city-container STRUCTURE has landed.** All Edmonton sections moved under `pipeline/yeg/` (+ empty `pipeline/yyc/` Calgary placeholder); `shared_path`/`section_path` (`_bootstrap.R`), `_whirl.yaml` cwds, `.gitignore`, and in-code paths repointed; the full chain runs byte-identical post-move; §3 tree now shows the city layer (so the §0-rule-1 "don't write it until it's on disk" gate is satisfied — it now IS). The published-output CSV **naming standard** (the `yeg_` prefix contract) is locked + applied to PA's served aggregate (§6). Still DEFERRED until Calgary DATA lands: the `yeg_`/`yyc_` prefix on the *remaining* published artifacts (per-year geojsons, BP CSVs), frontend + `website/public/data/` city-nesting, the per-city config, and the Calgary schema inspection itself. |
| Identify canonical 2026 boundary shapefile (UAlberta Library data services) | Parallel track | ✅ **Resolved** — City of Edmonton Neighbourhoods CSV (`65fr-66s6`, 407 rows, WKT/WGS84) adopted as the boundary source; 08/08b read `read_csv` + `st_as_sf` |
| R3b: optional catch for ~104 "building and land" manufactured-home FNs | Before R4, probably unnecessary | ↗ Carried to Phase 2 (low priority) |
| Scoreboard schema columns (`dataset`, `city`, `layer`, …) for multi-section scoring | Before second section's rules | Open |
| `renv.lock` referenced in workflow but absent on disk (no renv/ either) | Before relying on clone-and-run reproducibility | ✅ **Resolved (2026-06-21)** — renv adopted via `renv::init` + **implicit** snapshot (117 pkgs, code-referenced closure). Dropped `whirl` removed first and excluded from the lockfile; runner deps (`callr`/`jsonlite`/`yaml`) + pipeline deps (`sf`/`rprojroot`/`tidyverse`) captured. `.Rprofile` auto-activates the private library; PA runner resolves under it (dry-run exit 0). `docs/STRUCTURE.md §9` flipped `[TARGET]`→`[ADOPTED]`. Note: pre-existing `units`/`Rcpp` version skew in the source library (runtime-harmless — live runs work) makes a forced re-`snapshot` validate-fail; the init lockfile is the snapshot of record. |

---

## 11. Context-loading guidance

| Task | Load |
|---|---|
| Building/reviewing a website component | §2, §3, §6, §7, §9 |
| Writing/reviewing a pipeline rule script | §4, §5, §9 |
| Aggregation / spatial-join / reference tables | §4, §5 |
| Scope question ("should we build X?") | §1, §9 |
| First build session | §2, §3, §6, §8 |
| Unfamiliar contributor — full context | all |

When in doubt, load §2 (locked architecture) and §9 (negative rules) — the load-bearing constraints.

---

## 12. When to revise + change log

Revise when: a locked decision changes (§2), a new section is wired (§3), a new rule is validated
(§5), a negative rule changes (§9), or an `[OPEN]` resolves (§10).

- **v1.7 (2026-06-25)** — **Edmonton city container created — the Calgary-introduction
  campaign's structural foundation (§10).** All Edmonton sections (`property-assessment`,
  `building-permits`, `economy`, `shared`) `git mv`'d under `pipeline/yeg/` (history preserved);
  empty `pipeline/yyc/` (`.gitkeep`) added as the Calgary placeholder. Repointed: `_bootstrap.R`
  `shared_path()`/`section_path()` (now anchor `pipeline/yeg/…`; `website_path()` unchanged —
  the site does not move), both `_whirl.yaml` cwds, the `.gitignore` anchored data-protection
  patterns (verified still ignoring raw/output at the new paths), two EDA/validation
  `find_root_file` code paths, and in-code/comment path strings. **Published-output CSV naming
  standard LOCKED** (§6): `yeg_<section>[_per_nbhd]_<dataYear>.csv` (span variant for
  historical), `yeg_` on published artifacts only, `output/` frames stay unprefixed — a
  publish-time rename that **supersedes** `docs/STRUCTURE.md`'s old "no rename bridge" line;
  applied to PA's served aggregate (`neighbourhood_aggregates_2026.csv` →
  `yeg_property-assessment_per_nbhd_2026.csv`, ReportCard + siteConfig + handoff `to:` repointed,
  content byte-identical). **Byte-identity gate:** full PA+BP chain + Business Census re-run
  post-move; BP (46 files) and Business Census + PA current-year/2024-25 outputs byte-identical;
  relocation proven computation-neutral. PA historical 2012-2023 outputs differ run-to-run due to
  a **pre-existing, location-independent `readr`/`vroom` multi-threaded parse nondeterminism** on
  the 5.5M-row historical CSV (two reads of the SAME file at the SAME path give `identical=FALSE`,
  `all.equal=TRUE` — float-epsilon noise; NOT a relocation effect, NOT introduced here — flagged
  for a future single-thread-read fix). §3 tree + rules + Fit note now show the city layer;
  §10 Calgary row updated. Structural + naming only — no pipeline data logic changed.
- **v1.6 (2026-06-21)** — Three decisions from the fetch-SOP + frontend-prep work
  recorded. §4.8: all Socrata bulk fetches go through the shared
  `fetch_socrata_snapshot()` (download-to-disk, export endpoint only, reliability
  built in: curl stall+timeout handle, atomic temp-then-promote, size/row/column
  floors); both PA's 01 and BP's 02 retrofitted. §10 Calgary row: `yeg_`/`yyc_`
  prefixes **deferred** to the Calgary-introduction campaign (unprefixed until a
  second city exists). §2: manifest shape follows source structure (flat
  `{years, defaultYear}` for single-source like building-permits, richer nested
  shape for multi-source like property-assessment), each section emits its own at
  its own per-section path, no global merge. Also aligned §2's sole-publisher
  bullet to the committed Way-A handoff (glob + fixed-file copy; does not parse
  the manifest; PA's legacy manifest-year path retained behind a guard). Doc-only.
- **v1.5 (2026-06-21)** — Orchestration layer built and proven live on PA.
  whirl was evaluated and DROPPED (config-driven with its own schema,
  renv-coupled, parallel-by-default, HTML-only logging that mismatched the
  agent's JSONL need); replaced by a thin `callr`-based runner (`run_section.R`
  + `_whirl.yaml`). New invariants (§2): cwd-per-section authoritative from YAML
  not `.Rproj`; dependency order not numeric (PA 08d-before-07); one fresh
  process per script; the runner is the SOLE publisher to `website/public/`,
  pipeline scripts write only to `output/`. Campaign: 08b output renamed to the
  uniform `neighbourhoods_<YYYY>_recovered.geojson` (dropping the transitional
  `_new_boundaries` suffix; fixes a manual-copy name/content mismatch); 08e
  redirected public→output/ (14 years byte-identical); 09a re-sourced to read
  output/ not stale public (fixed a manifest-staleness circularity — the live
  2026 colour scale was being computed from a stale file). All edits
  destination/source/name-only, byte-verified on contents. Three §9 negative
  rules added incl. the GDAL-rename verification standard. No data logic changed.
- **v1.4 (2026-06-21)** — New section wired: `pipeline/economy/business-census/`
  (Business Census choropleth) relocated out of `pipeline/shared/` — git-mv with
  history preserved, path-anchored (bootstrap + shared_path boundary), byte-verified.
  shared/ is now a clean base-geo-only section on disk (boundary + Mature
  Neighbourhoods), matching the v1.3 scope correction. Frontend untouched (decoupled
  via committed website/public copy; same output filename). §3 tree + Fit note updated.
  Resolves part of the Calgary prereq #2 (shared/ build-out: squatting script relocated).
- **v1.3 (2026-06-21)** — `shared/` scope corrected: it is a **city-wide base-geo data
  section** (boundary + road/vegetation/speed-zone reference layers, shared *outputs*), not a
  helper library — §3 tree comment, §3 enforce-rule, §3 Fit note, and the §9 "duplicate shared
  pieces" negative rule all reworded to match. §10 Calgary item **resolved**: city-wraps-section
  + per-city config + `yeg_`/`yyc_` output prefixes + oracle self-skip; execution blocked on
  building-permits migration, shared/ build-out, and Calgary schema inspection. No code or
  architecture changed on disk — doc-alignment only.
- **v1.2 (2026-06-19)** — Workflow change: KC is the **builder** with **direct-push authority to
  `main`** — may commit and push without prior preview/review by others (owner's standing
  decision). §7 rewritten: Olivia's review moves from blocking gate to **post-hoc**; the
  branch → PR → review flow now applies to non-KC contributors only. §4.6 updated so KC's
  pre-push review satisfies the human-promotion gate. Header `Owner` line and version bumped.
- **v1.1 (2026-06-18)** — Phase 1 closed. Marked §8 first-milestone ✅ achieved (Property
  Assessment + Building Permits point map + added Permit Neighbourhoods choropleth + Download
  page, all live on Cloudflare Pages). §3: building-permits now built. §6: boundary 402 → 407
  (City of Edmonton Neighbourhoods `65fr-66s6`); added a "built / live" nav note. §10: resolved
  the colour-scale and boundary-shapefile `[OPEN]`s, carried R3b to Phase 2. Fixed §3/§9 to use
  the correct shared dir name `pipeline/shared/` (was `_shared/`). Added PHASE2_STATUS.md as the
  live-status doc.
- **v1.0 (2026-05-21)** — Consolidated authority. Corrected framing: the website is a free-tier
  static replication, NOT an agentic platform (agentic platform reclassified as parked future).
  Added website build spec (React/Vite/PMTiles, shell/content, `siteConfig`, legibility standard),
  per-section repo layout, team/handoff model, first-milestone steps. Pipeline invariants (§4) and
  negative rules (§9) carried forward from v0.3. Supersedes v0.1–v0.3.
