# CLAUDE.md

> **Version: v1.19 — authoritative. Supersedes all prior versions (v0.1–v1.18).**
> This is the single source of project context for every Claude Code session — read it first.
> If any other note, comment, or older doc frames *the website* as an "agent-driven platform,"
> that framing is **retired** — see §1.
> Owner / **builder**: KC (Research Assistant, UAlberta) — direct-push authority to `main` (§7).
> Verifier: Olivia (post-hoc review, §7). Supervisor: Prof. Haifang Huang.
> Last updated: 2026-07-30. Phase 1 is **CLOSED** (see PHASE1_STATUS.md, now archive);
> current open work tracked in **PHASE2_STATUS.md**. Tier 2 (container-universe reconciliation)
> is **CLOSED** end-to-end (§12 v1.11). The frontend matured substantially since v1.15
> (§12 v1.16–v1.20): navigation moved to an **off-canvas drawer** and displayed identity is now
> **REAL** (no longer placeholdered — §2/§6); the BP point map was redesigned (incandescent
> heat→dots on a shared land-use basemap palette); the Economy group gained the **Business Census
> points section** ("Businesses and Industry Specializations" + the LCLQ finding); and **Amenities
> shipped** — a registry-driven backend (13 published layers) with a live frontend (8 point layers
> across 4 consolidated view-selector sections). **Zoning** shipped end-to-end (§12 v1.19) and its
> View 1 frontend then **matured across six directive passes (§12 v1.20)**: a whole-city home
> camera, selection-inversion highlighting, a **proportional legend strip** (area band with in-chip
> percentages + an absolute two-tone chip emphasis, on the dark console shade), a **two-stage right
> rail** (absent at rest → hover header → pinned card), the sentence-case "of Edmonton" readout, a
> hardened hover chain, and full DESIGN_SYSTEM compliance. The **built-in attribution went COMPACT ⓘ
> on every map** (v1.20, superseding PA's always-visible strip — DESIGN_SYSTEM §6 amended). Live at
> `/properties/zoning` (View 1 of a ratified two-view section; Overlays = v1.1).

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
- `website/` — **frontend.** React + Vite, builds to static files, deploys.

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
- **Frontend = React + Vite**, MapLibre carried over (map layers served as whole GeoJSON — per-year
  where there's a year axis; PMTiles retired, §12 v1.10). Build **one component and one map at a time.**
- **No database, no server for the site.** SQL is not needed (build-time only, optional).
- **Deploy = git push** to the host (UAlberta hosting is git-capable, push-based, like Cloudflare).
  Only `website/` builds and deploys; `pipeline/` stays on the laptop.
- **The serve target is configuration, not assumption** (the VM-readiness campaign, §6/§12 v1.9).
  The deploy base + router basename (`VITE_BASE_PATH`) and the SPA fallback
  (`website/public/_redirects` / an nginx `try_files` snippet) are
  env-configurable with in-code Cloudflare-Pages defaults, so the current deploy is unchanged.
  Every hand-issued runtime asset fetch (data, downloads, `manifest.json`, basemap style) routes
  through **one base-resolution seam**, `website/src/utils/assetUrl.js` (joins the path to
  `import.meta.env.BASE_URL`; a no-op at base `/`) — the frontend analogue of the backend's
  sole-publisher seam. A subpath deploy (`VITE_BASE_PATH=/realestate/`) works end-to-end.
- **GitHub = source of truth;** the host gets built artifacts only.
- **Displayed identity is REAL, and lives only in `siteConfig.js`** (§6; populated 2026-07-20,
  §12 v1.16): `org` = University of Alberta, `dept` = Department of Economics, `centre` /
  `centreFull` = Open Data Centre (for Alberta Urban Real Estate), `funder` = Alberta Real Estate
  Foundation, plus a UAlberta territorial acknowledgment and named data partners. The rule is
  unchanged — identity is centralized in `siteConfig`, never hardcoded in components (§9) — only
  the values are no longer placeholders.
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
│   │   │   └─ output/           #       this section's products: GeoJSON / CSVs
│   │   ├─ building-permits/     #     BUILT — point GeoJSON (per-year) + neighbourhood aggregates
│   │   ├─ economy/              #     ECONOMY section — neighbourhood-level economic data
│   │   │   └─ business-census/  #       BUILT — TWO maps: neighbourhood choropleth (01, wh44-4bkz)
│   │   │                        #       + per-business points (02, 8c4b-u4a4); LCLQ finding CSV via
│   │   │                        #       eda/04 (out-of-band, hand-committed). scripts/ data/ output/
│   │   ├─ amenities/            #     BUILT — 13 published layers (12 registry + lrt_lines) from ONE
│   │   │                        #       registry-driven emitter (amenity_layer_registry) + a no-year
│   │   │                        #       currency manifest → public/data/amenities/. Frontend LIVE:
│   │   │                        #       8 point layers, 4 view-selector sections (§6).
│   │   ├─ zoning/               #     BUILT end-to-end — zone polygons + family-boundary dissolve +
│   │   │                        #       no-year manifest; RATIFIED 156→10 crosswalk; frontend LIVE.
│   │   └─ …
│   └─ yyc/                      #   CALGARY placeholder (.gitkeep only). Wired in the
│                                #   Calgary-introduction campaign — §10. No contents yet.
│
├─ website/                      # FRONTEND — React + Vite, the deployable unit
│   ├─ public/data/              #   built data the site serves (copied from each section's
│   │                            #   pipeline output; subfolder by section)
│   ├─ src/
│   │   ├─ config/siteConfig.js  #   REAL identity + nav, in ONE place (§6; no longer placeholders)
│   │   ├─ shell/                #   SCAFFOLD: Header, Drawer (off-canvas nav), Footer, Layout
│   │   ├─ components/           #   shared blocks: MapView, Legend, Tooltip, DownloadButton
│   │   └─ content/              #   ADDITIONS: one folder per section (mirrors pipeline/)
│   │       ├─ property-assessment/
│   │       ├─ building-permits/
│   │       ├─ economy/          #   business-census (2 maps: counts choropleth + census points)
│   │       ├─ amenities/        #   generic point/network/density maps + AmenitySection selector
│   │       ├─ report-card/
│   │       └─ pages/            #   Home, About, Research Competition, Download (text pages)
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
  `pipeline/yeg/`: `property-assessment`, `building-permits`, `economy/business-census`,
  `amenities` (registry-driven backend, 13 layers published), `zoning` (backend build + ratified
  family crosswalk; frontend pending), plus the `pipeline/yeg/shared/` base-geo section (boundary
  + Mature Neighbourhoods only; road/vegetation layers pending). `pipeline/yyc/` exists as an empty
  Calgary placeholder (`.gitkeep` only) — no section folders until Calgary is wired (§10). Copy the
  pattern per new section — no empty stubs.

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
- **Shell** = `Layout`, `Header`, **`Drawer`** (the off-canvas nav — the horizontal `Nav` bar was
  retired 2026-07-20, §12 v1.16), `Footer`. Built once, wraps every page. Reads all displayed
  identity from `siteConfig.js`.
- **Content** = one self-contained folder per section under `content/`. Adding a section
  = add one folder; nothing else moves.
- **`siteConfig.js`** = the single source of identity + navigation, still centralized here and
  never hardcoded in components (§9) — but the values are now **REAL** (populated 2026-07-20,
  §12 v1.16), no longer placeholders:

```js
export const siteConfig = {
  org:        "University of Alberta",
  dept:       "Department of Economics",
  centre:     "Open Data Centre",
  centreFull: "Open Data Centre for Alberta Urban Real Estate",
  funder:     "Alberta Real Estate Foundation",
  nav:        [ /* the section tree below */ ],
};
```

**Nav tree** (the CURRENT `siteConfig.nav`, rebuilt from the live-site tree 2026-07; `map` =
data/map page, `tables`/`page` = utility). Navigation is a single **off-canvas left drawer**
(`shell/Drawer.jsx`, opened by a Header hamburger) — there is no horizontal nav bar (§12 v1.16):
Home `page` · **Properties & Land** → Property Assessment `map` (live), Zoning `map` (live; two-view section, Overlays v1.1), Land
Titles `map` (soon) · **Building Activity** → Dwelling Units `map` (live), Building Permits `map`
(live; route held at `/activity/construction-improvement`) · **Economy** → Businesses and Industry
Specializations `map` (live; route `/economy/business-census`), Business Counts `map` (live),
Business Licences `map` (soon), Labour Market `map` (soon) · **Amenities** → Public Transportation
`map` (live), Parks and Recreation `map` (live), Police Stations `map` (live), EV Charging Stations
`map` (live) · Neighbourhood Report Card `tables` (live) · Download `page` · Research Competition
`page` · About Us `page`. Footer (funder line, data partners, territorial acknowledgment, logo,
copyright) — all from `siteConfig`. (Retired vs the old live-site tree: the Data Collection group +
Neighbourhood Profile; Real Estate Market Activity + Land Transfers; the old Amenities 5-leaf list
— Air Quality / Community Services / Crime / Public School; and the Feedback page.)

**Built / live (2026-07):** twelve live surfaces. **Maps:** Property Assessment `map` (5-metric
choropleth), Dwelling Units `map` (Permit Neighbourhoods choropleth + analyst Data Console),
Building Permits `map` (per-year point map — incandescent heat→dots, §12 v1.16), Business Counts
`map` (Business Census neighbourhood choropleth), Businesses and Industry Specializations `map` (the
Business Census points section — 2 views: the census points + the LCLQ Industry Specializations
finding, §12 v1.17), and the four **Amenities** maps — Public Transportation (Bus Stops + LRT
Network views), Parks and Recreation (Playgrounds / Spray Parks / Recreation Facilities / Track
Sports Fields views), Police Stations, EV Charging Stations (§12 v1.18), and Zoning `map`
(the categorical FAMILY fill — 10 ratified families in an algorithmically DERIVED banded palette
[all real hues, no patterns], zoom ladder, a proportional legend strip + two-stage rail +
selection inversion; §12 v1.19→v1.20). **Tables/pages:**
Neighbourhood Report Card `tables`, Download `page` (3 cleaned CSVs from `public/downloads/`,
`siteConfig.downloads`), plus the Home / About / Research Competition text pages. The three
aggregate maps + the BP point map share ONE captured home camera (§12 v1.15). Land Titles,
Business Licences, and Labour Market are `soon` placeholders.

**Host-portable + refresh-by-design (2026-06, the VM-readiness campaign — §12 v1.9).** The serve
target is now config (§2) and a new data year needs no frontend edit:
- **Host-decoupled.** SPA fallback shipped (`website/public/_redirects` + an nginx `try_files`
  doc); deploy base + router basename → `VITE_BASE_PATH` (default `/`). All have in-code defaults
  reproducing the Cloudflare Pages deploy — see README. (The R2 PMTiles-origin seam was removed
  with the tiler, §12 v1.10.)
- **One base-resolution seam.** Every hand-issued runtime fetch (data, downloads, `manifest.json`,
  basemap style) goes through `website/src/utils/assetUrl.js` (joins to `import.meta.env.BASE_URL`;
  no-op at `/`), making a subpath deploy fully work (verified headless under `/realestate/`). The
  basemap style URL is consolidated once in `website/src/components/basemapStyle.js` (was four
  duplicate literals).
- **Manifest-driven parity.** Following PA, the Building Permits point-map slider, the Report Card
  table, and the Download page now source years / filenames / spans from the backend-emitted
  manifests — zero year literals that 404 or mislabel on rollover (each proven by a simulated
  next-year manifest advancing the UI with no code edit). **Business Counts is the one parked
  exception**: its year is baked into the GeoJSON filename AND its column keys with no manifest to
  source it from, so it needs a backend `{surveyYear, priorYear}` emit (frozen backend). Handback
  spec: `docs/BC_MANIFEST_HANDBACK.md`.

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
  → pipeline/yeg/<section>/output/ (GeoJSON / CSVs)
  → copied to website/public/data/<section>/ → Vite build → website/dist/ → git push → host
```
The Edmonton portal is touched **only at refresh time** on the laptop, never on a visit.
**Fit note:** the neighbourhood choropleth is 407 polygons (City of Edmonton Neighbourhoods CSV
65fr-66s6, adopted as the boundary source — §10) — load it as plain GeoJSON. (PMTiles is retired,
§12 v1.10; every layer, including the permit points, now ships as per-year GeoJSON.)

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
- Introduce stacks beyond React + Vite + MapLibre (+ Recharts for charts; + `@tanstack/react-table`,
  headless — the analyst Data Console. Originally scoped to PA (KC's closing decision 2026-06-27);
  **scope widened to PA + Dwelling Units** when DU adopted the console (§12 v1.12, KC 2026-07-16).
  A third section reusing the shared console leaves is in-scope; a NEW stack is not.)
  Everything else stays hand-rolled. Vendored open-licence static **assets** (the Lucide icon set;
  Maki 8.2.0 CC0 glyph PNGs in `public/icons/`, §12 v1.18) are assets, not stacks — allowed. (§2.)
- Duplicate cross-section base geometry (boundary, road/vegetation layers) into sections — it lives in `pipeline/yeg/shared/`. (§3.)
- Over-engineer, or merge code Olivia can't read. (§6.)
- Reintroduce a year literal in a frontend section (filename, label, metric key, span). Source the
  year from the section's `manifest.json`, the PA/BP way. (§6 — refresh-by-design; the one parked
  exception, Business Counts, is tracked in `docs/BC_MANIFEST_HANDBACK.md`.)
- Hardcode the serve host, or a root-absolute runtime asset path that bypasses the base. The serve
  target is env config (`VITE_BASE_PATH`); runtime fetches go through
  `assetUrl`. (§2/§6.)

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

- **v1.20 (2026-07-30)** — **Zoning View 1 matured across six directive passes; the attribution
  went compact site-wide; DESIGN_SYSTEM §5/§6 amended. Shipped + PUSHED (`71abd88`→`5dd2d9d`).**
  Frontend-only (no pipeline data logic changed). **(1) Home camera** — a whole-city KC-ratified
  frame (annexed boundary + St. Albert / Sherwood Park / Big Lake in view, scale 3 km) lives in
  `components/mapCamera.js` as `ZONING_HOME_VIEW`; the reset control + `?zone=` deep link both land
  on it (the deep link no longer flies to the zone — with §2 inversion the pinned zone is the sole
  figure, locatable from the city frame). **(2) Selection inversion** — pinning a zone drops every
  other to the isolate neutral so the selected zone is the sole figure (hover-lift + commitment
  casing); hover cannot repaint while pinned. **(3) Proportional legend strip**
  (`ZoningLegendStrip.jsx`) REPLACED the bottom data console (that console was built then reverted):
  a single AREA band (chips ∝ area share, in-chip percentages with per-chip ink derived from fill
  luminance), family labels below (measured hide-not-drift, ratified "and" names), a hover/isolate/
  select **readout as a sentence** ("Residential class: 30.6% of Edmonton, 5,255 zones" — KC
  sentence-case ruling), and an **ABSOLUTE two-tone chip emphasis** (light `#faf6ec` + near-black
  `#141018` casing ring + lift) that holds at both lightness extremes where the old relative dimming
  failed. On the **dark console shade** (`--glass-panel-fill`, DS §1.1 — reverting a pass-12
  light-cream deviation). **(4) Two-stage right rail** (`ZoningRail.jsx`, extract-by-copy of the BC
  rail frame): ABSENT at rest → stage 1 hover (swatch · family · neighbourhood) → stage 2 pinned
  (the byte-identical header expands downward + zone code large in mono, description, dc2 sub-area
  when populated, area, family share, copy-link); three-way dismissal. **(5) Attribution → COMPACT
  ⓘ on ALL SIX maps** — the built-in `AttributionControl` runs `compact:true` everywhere (MapView
  removes MapLibre-5.x's init `-show` to start collapsed + a click-outside collapse), a dark-glass ⓘ
  chip that expands to the credit string on click. Supersedes PA's always-visible strip;
  licence-compliant (present + discoverable). **(6) Hover-chain hardening** (a real-GPU bug batch):
  the emphasised chip's `z-index:2` stole the pointer from the hit layer → a mouseleave/mouseenter
  **colouring loop** (fixed: band `pointer-events:none`); per-button leave fired in the 2px hit
  seams → a **full-palette flash** (fixed: clear on the container, not the buttons); a chip click
  while pinned **silently armed isolate** that sprang on dismiss (fixed: click clears the pin +
  isolates); and a fast sweep fired 28 full-layer fill-colour repaints → an **animation cascade**
  (fixed: the map preview is debounced to the cursor's rest — 28→4 paints). **(7) DESIGN_SYSTEM
  compliance** — the dark-shade revert, the §1.5 type floor (strip 10.5/10px → `--t-2xs`), on-scale
  tokens (rail code 21px → `--t-xl`), §2 Title-Case rail chrome + `tabular-nums` readout, §6 teal
  focus rings, and **DESIGN_SYSTEM §5 amended** to ratify the zoning building-fill carve-out (the
  height-tiered translucent achromatic fill is compliant reference texture, not the outline-only
  default) and **§6's attribution standard is superseded** by the compact-everywhere change. All
  verified headless (Playwright + colour science); memory: `zoning-section-shipped.md`.
- **v1.19 (2026-07-29)** — **Zoning shipped end-to-end — the site's first categorical polygon
  fill, on a generic standard proven on schools first.** **Backend hardening:** the NA fail-open
  closed (`01_build_zoning.R`: Edmonton's real zone code `NA` (Natural Areas, 99 polygons) now
  survives as a LITERAL join key on both sides; a blank code becomes unmapped and HALTS —
  proven by an A/B on the same snapshot (exactly 99 property deltas, null→"NA", 0 other changes)
  and a guard-trip on a doctored copy). 01 also emits a **family-boundary dissolve**
  (`zoning_family_boundaries.geojson`, 10 MULTILINESTRINGs, planar UTM-12N union) + per-family
  counts in the build log; NEW `03_emit_manifest.R` (amenities no-year pattern: sourceUpdatedAt /
  fetchedAt / featureCount / per-family counts; 02 reserved for Z2). **zoning is the FIFTH runner
  section** (`_whirl.yaml`; handoff → `website/public/data/zoning/`, 3 files, sole-publisher).
  **DESIGN_SYSTEM §1.4 gained the categorical POLYGON-FILL law** (convention hues · inverse-area
  emphasis · patterns for governance categories; supersedes nothing for points — QUALITATIVE_12
  stands for marks). **Generic standard:** `components/categoricalPolygon.js` (two-layer
  flat+pattern construction, 8×8 hatch/dot ImageData factories) + `CategoricalPolygonLegend.jsx`,
  proven on the published school catchments at the URL-only scratch route
  `/dev/categorical-polygon-proof` BEFORE zoning consumed them. **Frontend:** `/properties/zoning`
  is LIVE — `ZoningSection.jsx` (AmenitySection-pattern shell; ratified TWO views: "Zones" now,
  "Overlays" v1.1 with `6w3s-58pv` UNFETCHED; selector chrome suppressed at one view; camera
  preserved across views via a shell-owned cameraRef) mounting `ZoningZonesMap.jsx` (view-named —
  the BC naming-trap lesson). Palette + zoom ladder are EXTRACTED from the two ratified SVGs in
  `docs/design/` (the single source): 8 flat family fills + DC hatch + AJ dots; no line layers
  below z12; dissolved family boundaries z12–14; family-TINTED parcel hairlines z15+ (never grey);
  per-instance `applyZoningGround` (land-use muted to `#faf7ef`, water + WHITE streets promoted
  over the fill — applyDeepenedGround precedent, contained). `basemapTheme.js` DATA_LAYER regex
  gained `zoning-|catpoly-`. Working core verified frozen (PA/amenities render their own hues,
  zero errors). METHODOLOGY **D8** (156→10 via ratified crosswalk; fail-closed). Shipped
  `34cd8c2`→`d468bb2` (+ the records commit). Palette measurements (ΔE / CVD / moiré / adjacency)
  reported to KC for ratification with the build report.
- **v1.18 (2026-07-27)** — **Amenities shipped end-to-end (registry-driven backend + live
  frontend); Zoning backend built.** **Backend:** ONE registry-driven emitter
  (`pipeline/yeg/amenities/scripts/production/01_build_amenity_layers.R`, driven by
  `data/reference/amenity_layer_registry_20260727.csv`) emits **12** layers; a second emitter
  (`02_build_lrt_lines.R`) adds the LRT route lines — **13 published GeoJSONs** in
  `website/public/data/amenities/` under ONE **no-year currency manifest** (`03_emit_manifest.R`;
  per-layer `sourceUpdatedAt` / `fetchedAt` / `featureCount` / category counts). Registry rows carry
  the per-layer rules: `keep_where` (bus stops → boardable `location_type=0` only, 6,882→6,673),
  `dedup_key` (playgrounds one-per-playground 659→431; LRT platform-siblings 54→29),
  `category_field`, `family`, renderable-column whitelist, size/row floors. Layers span point (bus,
  LRT stops, police, playgrounds, EV, recreation facilities, spray parks, track sports fields),
  polygon (parks, vegetation, school catchments), and line (bike routes); wired into `_whirl.yaml`
  (runner is sole publisher). **Frontend LIVE:** 8 point layers across **4 consolidated
  view-selector sections** — Public Transportation (Bus Stops density + LRT Network views), Parks
  and Recreation (Playgrounds / Spray Parks / Recreation Facilities / Track Sports Fields views),
  and standalone Police Stations + EV Charging. `AmenitySection.jsx` is the PA-selector pattern
  (`?view=` URL, `SECTIONS` table); the generic maps are `AmenityPointMap` (categorical top-N+Other
  discs, hover-grow, selection pulse, dark casing), `AmenityNetworkMap` (LRT route lines in official
  ETS colours + station nodes), and `AmenityDensityMap` (bus cluster→point across zoom, clusters
  coloured by operator). **Glyph is a 2nd data channel** (DESIGN_SYSTEM §1.4): where a category has
  iconography, colour + a cream **Maki 8.2.0 CC0** glyph (`public/icons/`) both carry it, else colour
  carries category and one glyph names the layer. Categorical **`QUALITATIVE_12`** palette LAW (grey
  residual sorts last, 12-hue cap, per-layer identity hue on the selector chips). Retired per-layer
  routes redirect into the sections; the polygon layers (parks / vegetation / schools) + bike routes
  are published but not yet nav-surfaced. **Zoning:** backend build only — `01_build_zoning.R` emits
  `zoning_bylaw.geojson` (11,516 polygons) joined to a **RATIFIED** 156-code→10-family crosswalk
  (`zoning_family_crosswalk_20260725.csv`; stops loudly on an unmapped code, §4.7); no frontend map
  yet (nav leaf `soon`, no published data). Shipped `126cd1a`→`c10a054`.
- **v1.17 (2026-07-24)** — **Economy gains the Business Census points section — "Businesses and
  Industry Specializations" + the LCLQ finding.** The one pipeline section
  `pipeline/yeg/economy/business-census/` now feeds **two** maps at two routes: the older
  neighbourhood choropleth (**Business Counts**, `/economy/business-counts`, `BusinessCensusMap.jsx`,
  from the pre-aggregated `wh44-4bkz`) and the NEW points section (**Businesses and Industry
  Specializations**, `/economy/business-census`, `BusinessCensusSection.jsx`, from the raw
  business-level `8c4b-u4a4`). **Naming trap (documented so it is not mis-edited):**
  `BusinessCensusMap.jsx` serves the *Business Counts* route; `BusinessCensusSection.jsx` serves the
  *Business Census* route. **Backend:** `02_build_business_census_points.R` reads a MANUALLY-placed
  raw snapshot (never fetches — a raw-marker guard stops if the aggregate is grabbed) and emits
  `business_census_points_2025.geojson` (29,894 businesses; 8 props; `colour_key` = top-10 sector +
  Other), wired into `_whirl.yaml` after 01. **The section is TWO views** (an earlier third view was
  removed 2026-07-24): View 1 "Business Census" (the data — points coloured by sector, donut-wheel
  legend, composition console, right InfoRail, a client-side KDE dominance surface) and View 2
  "Industry Specializations" (a finding — the LCLQ result: only estimator-tested businesses drawn,
  prominent=significant / faint=non-significant, ranked industry chips + a reporting-convention
  readout). **LCLQ** (Local Colocation Quotient — observed÷expected citywide share; kNN k=10 with
  self EXCLUDED, Gaussian adaptive kernel, 999-sim conditional permutation, BH-FDR across-all, min
  group 30; `significant` = q≤0.05, a categorical gate; strength = the LCLQ multiplier) is computed
  **OUT-OF-BAND** in `eda/04_build_mapping_frame.R` (~6-min permutation, NOT in the runner) and
  shipped as the git-committed `bc_lclq_industry_group.csv` (28,381 tested, 133 groups, 4,226
  significant). **Refresh-by-design exception:** the LCLQ CSV is a hand-committed EDA artifact — the
  runner handoff copies only the two GeoJSONs, so a normal refresh does NOT regenerate or republish
  it. The Economy consoles are hand-rolled (NOT `@tanstack` — the §9 note governs PA + DU only).
  Shipped `825f138`→`2aa830d`.
- **v1.16 (2026-07-20)** — **Frontend platform matured: off-canvas nav drawer + real identity +
  home rework, BP point-map redesign, a shared land-use basemap palette, and code-split/perf.**
  All frontend-only; no pipeline data logic changed. **(1) Navigation → off-canvas drawer.** The
  horizontal nav bar (`Nav.jsx`) and `EdgeReveal.jsx` were deleted; navigation is now a single
  accessible left **`Drawer.jsx`** (portaled, focus-trapped, scrim/Esc close, cream/green/gold
  UAlberta palette) opened by a Header hamburger, on every route. The Header shows the UAlberta
  Shield + an org/dept lockup; the full site name lives in the reworked **Home** hero (hero + 3-stat
  strip + auto-looping demo tiles + a nav-derived category grid + funder block). **Feedback was
  removed entirely** (nav item, `/feedback` route + page, `siteConfig.contact`, its CSS). **(2)
  Displayed identity is now REAL** (§2/§6): `siteConfig` carries University of Alberta / Department
  of Economics / Open Data Centre for Alberta Urban Real Estate / Alberta Real Estate Foundation +
  a territorial acknowledgment + named data partners — still centralized, no longer placeholders.
  **Nav-tree restructure:** groups renamed (Properties & Property Assessment → Properties & Land;
  Businesses → Economy), new `soon` leaves added (Zoning, Land Titles, Labour Market), old leaves
  removed (Neighbourhood Profile, Land Transfers, Crime, Air Quality, Community Services, Public
  School). **(3) BP point-map redesign** (`content/building-permits/permitStyle.js`): a scale-tiered
  representation — two single-hue **incandescent** heatmaps (dark-crust→bright-core, shoulder-heavy)
  below z11, a cross-fade across z11→z12, value-sized categorical dots above (radius peaks at z14
  then shrinks toward building zoom); the city interior is quieted by a warm-greige figure-ground
  tint clipped to a dissolved single-polygon Edmonton boundary (`public/geo/edmonton_boundary.geojson`).
  The BP console now mirrors PA — two-card Identity + Instrument column with an Edmonton/Calgary
  switcher + S-E gating, a bottom Year+Month tuning bay (debounced), a nav stack, and a fixed right
  `PermitInforail` (replacing floating popups). **(4) Shared land-use basemap palette** — ONE seam,
  `components/basemapTheme.js::colourFor`, applied at runtime by `applyAppleClassic` in the shared
  `MapView` for **every** map (PA/DU/BC/BP): a muted, convention-hued, luminance-laddered, CVD-safe
  palette that now paints previously-unpainted CARTO classes (residential / commercial / industrial /
  institutional land use, farmland, wetland, recreation, protected area, quarry, aerodrome) at all
  zooms. NOTE: the `custom-basemap.json` `fill-color` literals are placeholder fallbacks the theme
  OVERRIDES — the authoritative palette is `basemapTheme.js` (a reader trusting the JSON hex would be
  wrong). On the choropleths, `suppressed_low_n` / `no_data` states now fill with a grey wash (was
  near-white glass) so peripheral industrial areas no longer whiteout. **(5) Code-split + perf:** the
  four maps + Report Card are `React.lazy` in own chunks (`lazyWithReload` recovers from a stale-chunk
  404 after a deploy); MapLibre's CSS is imported before `index.css` in `main.jsx` (a cascade-order
  fix — it had been collapsing maps to 0 height); precompress (`.br`/`.gz`) + cache headers for the
  nginx VM (README). Shipped `3cc8bdd`→`7259d76` (+ later nav-pruning through `c10a054`).
- **v1.15 (2026-07-17)** — **BP points: clipping fix + year-swap cross-fade + slider debounce. PA
  home is a hand-ratified CAPTURED camera (not a fit), now the ONE camera PA/DU/BC/BP share.** The
  polish the BP-points recon deferred to "separate rulings" (v1.14), plus the PA home resolution.
  **(1) BP year swap RECREATES the source, never `setData`.** `setData` on a live GeoJSON source
  corrupts its tiles at high zoom (large circles clipped to crescents at tile edges);
  `removeSource`+`addSource` forces a clean re-tile. MapView's swap effect snapshots the source's
  layers (with their live `setFilter`, via `getStyle`), drops+re-adds the source, re-attaches at
  the same anchor. **(2) A genuine year→year CROSS-FADE wraps it** (new
  `components/crossFadeSource.js`): a throwaway GHOST holds the outgoing year and fades out while
  the recreated canonical fades in — overlapping, so the map is never empty of points. rAF-driven,
  RAMP-PRESERVING (folds the fade factor into the zoom-interpolate's OUTPUT STOPS — a zoom
  interpolate is illegal inside `["*",…]`), `--ease`/`DUR_SLOW` timing, reduced-motion aware,
  token-guarded interrupts (no orphaned ghosts). **(3) Year-slider DEBOUNCE** — `year` (live
  readout) vs `loadedYear` (250 ms, drives the load), so a fast drag loads once at rest.
  **(4) PA home = a hand-ratified CAPTURED camera.** v1.13's padded fit overshot twice (the city
  floating in rural emptiness); KC hand-found the framing on the live map (pan the city under the
  tuning bay, keep the pitch; zoom dialled visually to 10.3 at KC's ~900px window) and it is
  captured verbatim — `{ center: [-113.4927, 53.4862], zoom: 10.3, pitch: 18, bearing: 0 }` —
  applied via `applyCameraPreset` on load + no-selection reset (`fitToHome`/`developedSouthLat`
  removed). NOT refresh-by-design: a literal camera won't track data-extent changes (re-dial to
  re-capture) — a deliberate carve-out from the §6 literal-free rule (a camera is a design
  constant, not a year/data literal). **(5) ONE camera, four maps.** `components/mapCamera.js` is
  the SINGLE SOURCE (resolves the deferred de-dup): PA re-exports `HOME_VIEW` from it, DU + BC
  already imported it, and the BP POINT map (previously a flat `MAP_VIEW`, no pitched home) now
  lands on it in `onLoad` — change it once, all four follow. BP has NO camera reset (its "reset"
  is the value-tier filter); PA/DU/BC recentre via the rail button. Shipped `bf2f6ec` (PA
  home+labels, BP cross-fade, value-honesty) + `1bd8451` (camera unification).
- **v1.14 (2026-07-17)** — **Building Permits points — value-honesty: no-value exclusion +
  filter-aware disclosure (the POINT-map standard zoning/amenities/business-licences inherit).**
  Frontend-only correctness fix from the BP-points recon. **(1) No-value permits are EXCLUDED,
  not compensated.** ~36–39% of mapped permits have no `construction_value` (JSON null); the old
  `["number", get, 0]` coalesce laundered them into the `<$10k` tier. Killed the `0` fallback in
  the radius expression and the value-tier filter clause, and added an UNCONDITIONAL exclusion —
  `["!=", ["get","construction_value"], ["literal", null]]` — as `buildPermitFilter`'s first
  clause AND the layer's base `filter`. Verified on the live map: `["get"]` returns null for the
  null-then-stripped key so `!=`/null drops exactly the nulls and KEEPS a legitimate `0` (48 in
  2023); **`["has"]` does NOT work** (returns true for the stripped key). **Self-healing:** a
  City-backfilled value stops being null and renders with no code change — no baked exclusion
  list, the filter evaluates the data as loaded. Backend/files unchanged (values are being
  backfilled; the file stays complete, the map decides what it can render). **(2) The coverage
  note is now ONE combined, filter-aware statement** — headlines the true SHOWN count (counted
  from the loaded features + live filter, recomputes on type/month/tier), then both involuntary
  exclusions at year scope: no map location (the geocoding cliff, kept with its %) and no
  construction value (counted from the file, since the CSV's `n_no_value` overlaps `n_no_coord`
  and can't resolve coords∩value). Clean decomposition (2023: 8,819 shown + 288 no-coord + 4,985
  no-value = 14,092). Also removed a dead `VALUE_BUCKETS[].radius` field (never read); the legend
  `TIER_RADII` vs map tier-multiplier scales stay separate by purpose (flagged, not unified).
  Not in scope (separate rulings): the clipping bug, year-slider debounce, heatmap→circles, the
  radius taper, halo standardization.
- **v1.13 (2026-07-17)** — **PA neighbourhood labels are district-balanced (the standard the other
  aggregate maps inherit); the PA home-view was reworked here but SUPERSEDED same-day (→ v1.15).**
  **(1) Labels balanced BY DISTRICT.** `buildCentroidPoints` assigned the zoom-density tier by
  GLOBAL area rank, which flooded the overview with the largest polygons (the big southern
  neighbourhoods) and left the north/centre blank. Now it ranks by area **within each of the 15
  districts** and gives each a per-district quota per tier (low ~z11 = top ⌈8%⌉, 1–3/district;
  mid ~z12.5 = top ⌈30%⌉; all ~z14) — so tier-1 spreads across all 15 districts (94% of the N-S
  extent) at the same ~33-label budget. The tier text-size STEP thresholds (z11/z12.5), the
  collision handling, and the reportable FILTER (suppressed stay suppressed — a separate per-year
  `setFilter`) are all unchanged. Shipped (`bf2f6ec`). **(2) Home view — a padded `fitToHome` fit
  (fitBounds to the data extent with chrome-aware padding) was built here, but it OVERSHOT (the
  city floating in rural emptiness, ~z9); it is SUPERSEDED by v1.15's hand-ratified CAPTURED
  camera (`fitToHome`/`developedSouthLat` removed).** One lasting artifact: the label layer
  `minzoom` dropped 9→8.5 (for the fit's low landing) — kept, harmless at the z10.3 captured home.
- **v1.12 (2026-07-16)** — **Dwelling Units gains the full analyst Data Console — and the DU
  backend was UNFROZEN to feed it.** The aggregate-map standardization (v-note memory
  `agg-map-standardization`) is complete: after DU + Business Counts were re-skinned onto the PA
  immersive instrument (Tier A), **DU received PA's full Analysis-mode console (Tier B)** — the
  `@tanstack` table (5 columns + trend sparkline), the KPI rail (Permits · Construction Value w/
  median ≈ · Net Units · YoY · Distribution histogram), the Year + metric-range sliders, the trend
  instrument, District facet → map dim, box-select, and scoped CSV/GeoJSON/PNG export.
  **Backend (unfrozen for DU):** `pipeline/yeg/building-permits/scripts/production/02b_combine_geojson.R`
  (mirrors PA's 07b) reshapes the 18 per-year files into ONE combined all-years file
  (`permit_neighbourhoods_all_years.geojson`, 407×130 props) — a pure reshape (verified 0
  mismatches), wired into `_whirl.yaml` (`01→02→02b→03`) + the handoff. **Frontend strategy (c) —
  extract-by-copy:** the domain-agnostic console leaves were lifted to `components/`
  (`consoleControls.jsx`, `consoleTable.js`, `geometry.js`, + relocated `DistributionStrip`/
  `TrendInstrument`/`ExportMenu`/`portalTarget`); PA's `DataTable.jsx` is **byte-identical**
  (verified: zero `content/property-assessment/` diff across the console commits), the PA de-dup
  deferred to a separate concern. DU is now on PA's combined-file model (year = paint swap). §9:
  the `@tanstack` scope widened PA → **PA + DU**. Aggregate scope = REPORTABLE-only (the KPI
  matches the map + table + distribution; city 2026 = 6,258 permits). Business Counts stays
  view-only (single survey year — no console). Shipped `4819f55`→`af9ab1d`.
- **v1.11 (2026-07-13)** — **Tier 2 (container-universe reconciliation) COMPLETE end-to-end —
  the three-encoding / three-universe finding is closed in the data AND on the maps.** The four
  annexation-area polygons (8885–8888) are **kept and labelled**, not dropped: geometry-confirmed
  standalone annexation tiles, not umbrella containers (directive-00b spatial run; ruling
  `DECISION_container_universe_20260710.md`). **Backend:** all three sections (property-assessment,
  building-permits, business-census) now reconcile neighbourhood identity through **one canonical
  crosswalk** (`pipeline/yeg/property-assessment/data/reference/neighbourhood_crosswalk_20260622.csv`,
  generated by the frozen `_oneshot/reconcile_neighbourhood_changes.R`); the rescue oracle is
  retired as a live input. Every section ships **one 407-polygon universe** carrying an orthogonal
  `is_annexation_area` flag (relation `annexation_area`; `crosswalk_exclude_ids()` reserved but
  empty). **Frontend:** the flag renders as a distinct **annexation outline** (teal `#12a8bd`,
  dash `[4,2]`) composed *on top of* each polygon's data-state (a data polygon keeps its fill AND
  gains the border — annexation is orthogonal, never a state value), plus a categorical **legend
  row** on all three maps (the first time any map passes `greyStates` — also surfaces the
  previously-legend-absent states, finding 13f) and an About-page methods line. Refresh-by-design:
  entirely flag-driven, **no hardcoded 8885–8888 anywhere in the frontend**. Shipped across
  sub-concerns A–G (`3d43d02`→`c6b3d93`). **Two latent cross-section bugs surfaced + fixed:** a
  crosswalk row added for BP (`HERITAGE VALLEY AREA` `suffix_drift`) broke PA's post-aggregation
  dedup on 5472 → reclassified to `merge` (`e6265f8`); PA's year-combiner `07b` dropped any
  non-identity field → now carries `is_annexation_area` in `IDENTITY_COLS` (`e7e23e7`). Lesson: a
  crosswalk change affects ALL sections — re-run BC/BP/PA, not just the one edited. The BP/PA
  refreshes also advanced current data to the 2026-07-13 snapshot (documented in the data commits).
- **v1.10 (2026-06-29)** — **BP point map standardized onto per-year GeoJSON; the tiler subsystem
  retired; governance docs brought into the repo.** The Building Permits permit-point map — the
  last tiled layer — moved off PMTiles onto the per-year GeoJSON model the choropleth already uses
  (`permit_points_<year>.geojson` per year, thinned to 6-dp coords + the 8 rendered props; the
  slider swaps the source via `setData` on the shared `MapView`). **Removed:** the hand-run
  tippecanoe Stage B, go-pmtiles, the R2 tile host, the `VITE_PMTILES_BASE` seam, the `pmtiles` npm
  dep + protocol handler, and the bespoke `PermitMapView` mount. **PMTiles therefore drops from the
  §2/§9 locked stack** (now React + Vite + MapLibre). Chosen because per-year files (max ~7.7 MB)
  fit Cloudflare Pages' 25 MiB per-file cap and keep feature counts light, whereas one all-years
  points file (~105 MB) cannot be a Pages asset — the original reason the points were tiles on R2.
  Verified end-to-end by a full `refresh.R` (all 3 sections `ok`; 18 `permit_points`
  `handoff_copy` records). **Governance:** the serve-only-VM ADR is now tracked and `METHODOLOGY.md`
  (reviewer-facing *why*) was added. **VM build DEFERRED** until specs arrive (PHASE2_STATUS). The
  current-state `VITE_PMTILES_BASE` mentions (§2/§6/§9) are corrected here; incidental "PMTiles"
  mentions in §3 tree comments + the §6 reserve-tiles note are superseded by this entry pending a
  tidy sweep. Stale `PermitMapView` comments in the *shared* `MapView.jsx`/`basemapTheme.js` are
  cosmetic-only and left untouched (freeze-the-working-core on shared code).
- **v1.9 (2026-06-25)** — **Frontend VM-readiness + refresh-by-design campaign** (three
  frontend seams; structural/host-decoupling merged to `main`, the year-hardcode cleanup on a
  review branch). **(1) Host-decoupling** (merged): added the missing `public/_redirects` SPA
  fallback + an nginx `try_files` doc; lifted the R2 PMTiles origin to `VITE_PMTILES_BASE`; made
  the deploy base + router basename `VITE_BASE_PATH` (default `/`) — all with in-code defaults so
  the Cloudflare Pages deploy is byte-for-behaviour unchanged. **(2) Base-resolution seam**
  (merged): routed all 14 root-absolute runtime asset fetches through one helper
  `src/utils/assetUrl.js` (joins to `import.meta.env.BASE_URL`; no-op at `/`), consolidated the 4
  duplicate basemap-style constants into `src/components/basemapStyle.js`, and **closed the
  subpath caveat** — a `VITE_BASE_PATH=/realestate/` build now loads data/styles/downloads/
  manifests under the subpath (verified with a headless browser). **(3) Year-hardcode cleanup**
  (review branch `feature-year-hardcode-cleanup`): the BP point-map slider, the Report Card, and
  the Download page (siteConfig restructured to year-free `{year}/{span}/{recentSpan}/{yearCount}`
  token skeletons resolved in DownloadPage) now source years/filenames/spans from the PA + BP
  manifests — refresh-by-design parity, each proven by a simulated next-year manifest advancing the
  UI with no code edit; the Download page additionally gated by a character-identical
  rendered-output diff. **Business Counts parked** (year baked into filename + column keys, no
  manifest) — handback spec `docs/BC_MANIFEST_HANDBACK.md`. §2 (serve-target-is-config bullet), §6
  (host-portable + refresh-by-design), §9 (two negative rules), README (subpath caveat → resolved;
  refresh-by-design note) updated. Frontend-only; no pipeline data logic changed.
- **v1.8 (2026-06-25)** — **Per-section website-standardization campaign**
  (building-permits + business-census brought to the PA conventions §6 defines;
  structural only, output byte-identical pre/post, each verified by an authorized
  refresh). **building-permits**: production scripts renumbered to 01..NN
  (`02->01` build_permits, `02a->01a` job-grouping tool, `03->02` aggregates,
  `04->03` manifest; `_whirl.yaml` + in-script cross-refs + README repointed; no
  stream tags — one all-years source); boundary resolved **newest-by-glob**
  (removed the hardcoded `..._20260616.csv` date literal — the sibling of PA's
  old `property_info` hardcode); published CSVs renamed to the **yeg_ standard**
  via the handoff (`permits_coverage`->`yeg_building-permits_coverage`,
  `permits_category_counts`->`yeg_building-permits_category_counts`; all-years
  rolling files take NO year/span suffix to stay literal-free + frontend-stable).
  **business-census**: source switched to `fetch_socrata_snapshot(wh44-4bkz)`
  (was a hardcoded local CSV) + boundary newest-by-glob; **wired into the runner**
  as the `business-census` section (was a manual side-script with a hand-copied
  handoff — the runner is now the sole publisher); `output/` regenerables
  untracked + gitignored (matching PA/BP). `refresh.R` now drives all three
  Edmonton sections. No pipeline data logic changed (KC's data-cleaning campaign
  is separate). Noted-but-not-touched (out of structural scope): BC's inline
  `ID_REMAP` duplicates the shared rescue oracle; BC's `2025` production-year is a
  pre-existing frontend-coupled literal.
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
