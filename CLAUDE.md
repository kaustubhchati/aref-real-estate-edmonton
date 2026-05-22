# CLAUDE.md

> **Version: v1.0 — authoritative. Supersedes all prior versions (v0.1–v0.3).**
> This is the single source of project context for every Claude Code session — read it first.
> If any other note, comment, or older doc frames *the website* as an "agent-driven platform,"
> that framing is **retired** — see §1.
> Owner: KC (Research Assistant, UAlberta). Verifier: Olivia. Supervisor: Prof. Haifang Huang.
> Last updated: 2026-05-21.

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
│   ├─ _shared/                  #   used by EVERY section: API fetch helper, neighbourhood
│   │                            #   shapefile + join, tippecanoe→PMTiles step, theme,
│   │                            #   validation template
│   ├─ property-assessment/      #   one folder per section (the only one built today)
│   │   ├─ scripts/              #     01_load … 09_build
│   │   ├─ data/                 #     raw/  processed/  validation/  reference/
│   │   └─ output/               #     this section's products: GeoJSON / PMTiles / CSVs
│   ├─ building-permits/         #   (added when built — copy the pattern)
│   ├─ crime/                    #   (added when built)
│   └─ …
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
- **Sections mirror across the repo.** `pipeline/<section>/` ↔ `website/src/content/<section>/`.
- **Each pipeline section is self-contained** (`scripts/ data/ output/`) and runs its own
  fetch → clean → aggregate → output. Anything used by *every* section lives in
  `pipeline/_shared/` — never duplicated (the neighbourhood shapefile especially).
- Backend → frontend handoff is one copy: a section's `output/` → `website/public/data/`.
- Restricted/confidential inputs live **only** in a section's `data/` (`raw/` or `validation/`)
  and are **gitignored** — never committed, never deployed.
- **Fit note:** only create folders for sections that exist. Today: `property-assessment` +
  `_shared`. Copy the pattern per new section — no empty stubs.

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
  review — even at 100% oracle scores. For the website, that gate is Olivia's PR review before
  merge to the deploy branch (§7).
- **4.7 Cross-product reconciliation via curated mappings.** When two City products disagree on
  a name/ID, reconcile through explicit, sourced, dated mapping tables under `data/reference/` —
  never fuzzy matching or silent auto-correction. Non-destructive (`_recovered` artifacts).
  Established example: `neighbourhood_name_mappings_20260519.csv` (8 mappings).

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

**Legibility standard — VERY IMPORTANT.** This code is maintained by people learning web dev
(Olivia) and inherited by future RAs. **Legibility beats cleverness, always.**
- The bar: *as sophisticated as the least-experienced maintainer can follow, and no more.*
- Match complexity to the problem — these are simple problems (maps, toggles, tooltips,
  downloads). Don't over-engineer. Real structure (a shared `MapView`) is welcome *because* it
  makes the code clearer; cleverness the problem didn't ask for is not.
- Patterns to follow in every file (worked reference example:
  `pipeline/property-assessment/scripts/09_build_choropleth.html`):
  header comment stating the file's contract; `// ===` section banners; data-driven tables
  (`STOPS`, `STATE_STYLE`, `POPUP_ROWS`) consumed by loops; small named single-purpose functions;
  comments explain the **why**, not the what; honest surfaced errors; plain readable code over clever.
- If Olivia can read a file and follow it, it's clean enough. If she can't, it isn't — even if it works.

**Data flow.**
```
Edmonton Open Data → (quarterly, on laptop) pipeline/<section>/ fetch→clean→aggregate
  → pipeline/<section>/output/ (GeoJSON / PMTiles / CSVs)
  → copied to website/public/data/<section>/ → Vite build → website/dist/ → git push → host
```
The Edmonton portal is touched **only at refresh time** on the laptop, never on a visit.
**Fit note:** the neighbourhood choropleth is 402 polygons — load it as plain GeoJSON. Reserve
PMTiles for high-volume layers (parcel-level properties, permit points) where it earns its keep.

---

## 7. How we work — team & handoff

- **KC** builds. **Olivia** (PhD candidate, learning web dev) is the verifier and the
  human-review gate.
- Workflow: build on a branch → open a PR → Olivia reviews for **(1)** data correctness,
  **(2)** does the map look right, **(3)** can she read it → merge to the deploy branch →
  auto-deploy. Reviewing every change is also how she stays current.
- Keep `README.md` and `REFRESH_NOTES.md` current. Everything must be **clone-and-run** for a
  future RA — no laptop-only magic, no undocumented steps. Generated code is reviewed like any
  other; it is never a black box.
- Git: small focused commits (what + why); one concern per branch/PR; never commit raw/restricted
  data, secrets, `dist/`, or `node_modules/`; the deploy branch is protected (reviewed PRs only).

---

## 8. First milestone — the live clone

Goal: a navigable shell with **one** working map, committed and deployed.

1. Scaffold the folder structure (§3) and a Vite + React app in `website/`.
2. Build `siteConfig.js` with placeholder identity + the nav tree (§6).
3. Build the shell — `Layout`, `Header`, `Nav`, `Footer` — reading from `siteConfig`.
4. Build shared components: `MapView`, `Legend`, `Tooltip`.
5. Port the **Property Assessment choropleth** from
   `pipeline/property-assessment/scripts/09_build_choropleth.html` into
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

**Website**
- Rewrite the R pipeline. (§2.)
- Hardcode org / university / professor / author names — `siteConfig` only. (§6.)
- Add a runtime database, server, or API. (§1.)
- Introduce stacks beyond React + Vite + PMTiles + MapLibre (+ Recharts for charts). (§2.)
- Duplicate shared pipeline pieces into sections — they live in `pipeline/_shared/`. (§3.)
- Over-engineer, or merge code Olivia can't read. (§6.)

**Both**
- Propose commercial features, paid tiers, or Model D. (§1 — parked future idea, hard scope boundary now.)

---

## 10. `[OPEN]`

| `[OPEN]` | Resolve by |
|---|---|
| Reconcile the colour-scale source reference (live page cites `PHASE1_STATUS.md §5`; confirm) | Before locking the React map |
| Calgary section: mirror Edmonton pipeline or use the RE-prefix filter? | Calgary work start |
| Identify canonical 2026 boundary shapefile (UAlberta Library data services) | Parallel track |
| R3b: optional catch for ~104 "building and land" manufactured-home FNs | Before R4, probably unnecessary |
| Scoreboard schema columns (`dataset`, `city`, `layer`, …) for multi-section scoring | Before second section's rules |

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

- **v1.0 (2026-05-21)** — Consolidated authority. Corrected framing: the website is a free-tier
  static replication, NOT an agentic platform (agentic platform reclassified as parked future).
  Added website build spec (React/Vite/PMTiles, shell/content, `siteConfig`, legibility standard),
  per-section repo layout, team/handoff model, first-milestone steps. Pipeline invariants (§4) and
  negative rules (§9) carried forward from v0.3. Supersedes v0.1–v0.3.
