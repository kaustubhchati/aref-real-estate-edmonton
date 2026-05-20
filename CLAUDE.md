# CLAUDE.md

> **Version**: v0.3 (Layer 2 + cross-product reconciliation)
> **Status**: Living document. v0.3 captures: (a) the data-cleaning rule methodology validated 2026-05 (parking + R1 + R3); (b) the Layer 2 aggregation port; (c) the cross-product reconciliation mechanism via curated name mappings. It will be replaced by a full v1.0 produced via the three-phase Opus methodology when Phase 1 (DB + connectors) begins. Until then, this file is the authoritative project context for Claude Code sessions.
> **Owner**: KC (Research Assistant, UAlberta). Reviewer: Prof. Haifang Huang.
> **Last updated**: 2026-05-19

---

## 0. How to read this file

This is not documentation for humans. It is a system prompt that loads into every Claude Code session in this project. Every claim here is treated as authoritative by Claude. If something below is wrong, it becomes a wrong assumption Claude defends against your corrections later.

Three rules for editing:
1. **Truth or `[OPEN]`** — every claim is either verified or flagged `[OPEN]`. No optimistic placeholders.
2. **Short over comprehensive** — verbose CLAUDE.md is expensive forever. Caching helps; verbosity is still not free.
3. **Labeled sections** — each numbered section is loadable independently. Tell Claude "load §3 and §5" to save tokens on focused tasks.

---

## 1. Project identity

The **Open Data Centre for Alberta Urban Real Estate** is replacing its WordPress + Tableau Public website (realestatedata.srv.ualberta.ca) with an automated, agent-driven data platform. The replacement covers ~14 existing dashboards across two cities (Edmonton, Calgary) and multiple data domains (property assessment, building permits, census, business licences, crime, air quality, transit, amenities).

The platform is **research infrastructure**, not a commercial product. Users are Prof. Huang's research group, partner researchers, and the public who consume the dashboards. There is no paying customer, no SLA, no on-call rotation. The bar is "researchers and the public can rely on it"; the bar is not "five-nines uptime."

Out of scope (do not implement, do not propose):
- Commercial productization (Model D)
- User accounts, authentication, paywalls
- Real-time / sub-daily data updates beyond what source APIs natively support
- Predictive modelling at the row level (the previous RA's random forest is explicitly discarded)

---

## 2. Architectural invariants

These are the cross-cutting rules every component obeys. They are not negotiable per-feature.

### 2.1 Public-data rules only in production

Every production cleaning rule references only **public data columns**. Confidential data (the 2023 oracle xlsx, any future confidential snapshots) is used **once**, at validation time, to score precision/recall of public-only rules against an oracle. The oracle never enters production.

This is the methodology contract. Violating it (writing a rule that depends on a confidential column being available) is a blocker.

### 2.2 Eval-first

No rule ships without a scorecard. The scorecard is an artifact on disk (`output/<rule_id>_<rule_slug>_validation_<year>.csv`) and a row in the combined scoreboard (`output/rule_scorecards_<year>.csv`). The scoreboard is the contract the Sanity Agent reads in Phase 2.

A rule that has not been scored against the oracle does not exist for production purposes.

### 2.3 Year-invariant rule design

Rules are validated on stale-oracle data (currently 2023 confidential vs current-year public, a 3-year gap as of 2026-05) and intended to run on any year's data without retraining. This means:

- Thresholds are either **domain-justified constants** (e.g., parking's `$80,000` cap is below any plausible legitimate-residential value floor) **or recomputed from the year being cleaned** (e.g., quantile-based bounds derived from that year's data, not the validation year).
- No rule contains memorized values from the 2023 oracle. The oracle scores rules; it does not parameterize them.

### 2.4 Versioned contracts

Anything other components consume — the 5-class canonical residential list, the scoreboard schema, agent input/output JSON schemas, **reference tables under `data/reference/`** — lives in a versioned file with explicit version number or date stamp. Changing a contract requires a new version (`v2` or new date) plus deprecation notes for the previous. Silent in-place edits to contracts are blockers.

### 2.5 Audit traceability

Every artifact records what produced it. Scorecards record `rule_id`, `rule_slug`, `year_tag`, and the (eventually) `agent_run_id` of the run that produced them. Reference tables under `data/reference/` record `date_curated` and `curated_by` per row. Once `agent_runs` table exists (Phase 1 TODO), every run logs start/end/tools-used/tokens/cost/duration. Until then, R scripts log to console only and date-stamp filenames where ambiguity is possible.

### 2.6 Human-gated promotion

No cleaned data reaches a public-facing surface without explicit human review. The promotion gate is the Refresh Report Agent → KC approve/reject → `promoted.*` schema in the production DB. This applies even when rules score 100% on the oracle. The oracle is stale; production data drifts; humans verify.

### 2.7 Cross-product reconciliation via curated mappings (NEW v0.3)

When two City data products disagree (e.g., the assessment data and the boundary shapefile carry different names or IDs for the same physical entity), reconciliation happens through **explicit, sourced, dated mapping tables under `data/reference/`** — never through fuzzy matching, heuristics, or silent auto-correction.

The reference layer is its own contract. Every row has:
- The two strings being reconciled (e.g., `shapefile_name`, `assessment_name`)
- A `reason` tag classifying the drift (e.g., `assessment_side_typo`, `area_suffix_developing`)
- A `source` citation justifying the mapping
- `date_curated` and `curated_by` for provenance

The Phase 2 Sanity Agent consumes these tables and surfaces new unresolved cases for human approval. Rules of the road:
- New mappings require evidence from authoritative sources, not guesses
- The mapping output is non-destructive — produce `_recovered` artifacts in parallel with originals, do not overwrite
- Unresolved cases never resolve themselves — they go to the human queue

Established example: `data/reference/neighbourhood_name_mappings_20260519.csv` (script 08b, KC, 2026-05-19), 8 mappings for the Edmonton boundary shapefile × assessment data drift.

---

## 3. Repository layout

```
project_root/
├── scripts/                            # R scripts: data exploration, rule validation, pipeline
│   ├── 00_theme.R                      # ggplot2 theme + colour palette
│   ├── 01_load_data.R                  # Public data → parking-cleaned
│   ├── 02_validate_parking_rule.R      # Parking rule oracle scoring
│   ├── 03_explore_rental_signal.R      # Build validation oracle (run once per oracle year)
│   ├── 04_validate_residential_class_rule.R  # R1 oracle scoring
│   ├── 05_validate_manufactured_homes_rule.R # R3 oracle scoring
│   ├── 06_apply_layer1a_rules.R        # Apply parking + R1 + R3 → cleaned production frame
│   ├── 07_layer2_aggregates.R          # Stata3 port: per-neighbourhood aggregates
│   ├── 08_build_geojson.R              # Spatial join (aggregates × shapefile) → GeoJSON
│   ├── 08b_name_fallback_rescue.R      # Cross-product reconciliation (Sanity Agent prototype)
│   └── ##_validate_<rule_slug>.R       # Future rules: template = 04
├── data/
│   ├── raw/                            # Original downloads, archived per refresh
│   │   ├── property_info_2026_<YYYYMMDD>.csv     # Property Info API snapshot
│   │   └── EDM_neighborhood_boundary.{shp,shx,dbf,prj,sbn,sbx,xml}  # Jan 2023 shapefile
│   ├── processed/                      # Output of pipeline stages
│   │   ├── assess_2026_no_parking.csv  # Post-parking-rule
│   │   └── assess_2026_clean.csv       # Post-Layer-1a (parking + R1 + R3)
│   ├── validation/                     # Oracle CSVs — NEVER reopens confidential xlsx
│   │   ├── edmonton_row_labels_2023.csv
│   │   └── edmonton_neighbourhood_truth_2023.csv
│   ├── reference/                      # Curated cross-product mappings (§2.7)
│   │   └── neighbourhood_name_mappings_<YYYYMMDD>.csv
│   └── contracts/                      # Versioned definitions [OPEN: schema TBD]
├── output/
│   ├── rule_scorecards_<year>.csv      # Combined scoreboard (wide format)
│   ├── <rule_id>_<rule_slug>_validation_<year>.csv  # Per-rule scorecard (long format)
│   ├── <rule_id>_<rule_slug>_errors_<year>.csv      # Per-rule FP/FN breakdown
│   ├── neighbourhood_aggregates_2026.csv  # Layer 2 output
│   ├── neighbourhoods_2026.geojson         # Pre-rescue GeoJSON (script 08)
│   ├── neighbourhoods_2026_recovered.geojson  # Post-rescue GeoJSON (script 08b) ← canonical
│   ├── neighbourhoods_2026_not_rendered_recovered.csv  # Unresolved cases (currently 0)
│   ├── name_mapping_audit_log_<YYYYMMDD>.csv  # 08b audit trail
│   └── figures/                        # Plots saved by R scripts
├── CLAUDE.md                           # This file
├── PHASE1_STATUS.md                    # Latest pipeline state, refreshed per session
└── [Phase 1+] platform/                # DB, connectors, agents — TBD
```

Naming conventions:
- Scripts: `NN_action_object.R`, two-digit prefix for ordering, snake_case after. Sub-scripts use `NNa`, `NNb` suffixes for variations sharing a base concern.
- Rule scripts: prefix `validate_`, slug matches `rule_slug` in the script body, output filename pattern follows §6.2.
- Data files: snake_case, year or date suffix when version-specific, never use spaces.
- Reference tables: date-stamped (`_<YYYYMMDD>`) for explicit versioning (§2.4).
- All paths in scripts: relative to project root. Never absolute paths in code that ships. (The one exception: `confidential_path` in script 03, which is a developer-local file outside the repo. The confidential xlsx is never committed.)

---

## 4. Data sources and column conventions

### 4.1 Edmonton public datasets currently used

| Dataset | Socrata ID | Cadence | Notes |
|---|---|---|---|
| Property Assessment (current) | `q7d6-ambg` | Annual | TitleCase column names with spaces (`Assessed Value`, `Assessment Class 1`). Reference with backticks in R. |
| Property Assessment (historical) | `qi6a-xuwt` | Annual | Same shape as current, multi-year. Not yet wired. |
| Property Information (current) | `dkk9-cj3x` | Annual | **snake_case** column names (`lot_size`, `year_built`, `zoning`, `legal_description`). Mixes with assessment fields. Join key: `Account Number` (numeric). |
| Neighbourhood Boundary Shapefile | `(Jan 2023)` | Manual download | 402 polygons, WGS84. Join key: `neighbourh` (numeric, character-cast for join). Source: previous RA inheritance. `[OPEN]` Identify canonical 2026 source via UAlberta Library data services. |
| General Building Permits | `24uj-dj8v` | Daily | Not yet wired. |
| Business Licences | `qhi4-bdpu` | Monthly | Not yet wired. |

When loading Property Information alongside Property Assessment, the following columns collide and Information-side must be renamed with `info_` prefix at load: `Neighbourhood`, `Neighbourhood ID`, `Ward`, `Latitude`, `Longitude`, `Suite`, `House Number`, `Street Name`, `Point Location`. Assessment-side is canonical because it matches what the public dashboards display. See `scripts/03_explore_rental_signal.R` §A.2 for the canonical rename block.

### 4.2 Calgary

`[OPEN]` — Calgary connectors not yet wired. Memory notes Calgary's public assessment data exposes clean `RE`-prefix property type codes (`RE0110` Detached, `RE0210` Low Rise Rental Condo, etc.), making contamination filtering far simpler than Edmonton. Decision deferred: do we mirror Edmonton's `01–04` script structure for Calgary, or skip straight to a SQL filter on the RE prefix? Resolve in Phase 1.

### 4.3 Confidential data

The 2023 confidential xlsx at the developer-local path is used **once** per oracle generation. Script 03 reads it, builds row-level and neighbourhood-level oracle CSVs, and writes them to `data/validation/`. Downstream scripts (`04`, `05`, ...) read **only** the validation CSVs, never the xlsx.

This contract is documented in script 03's header comment. Violating it (re-opening the xlsx downstream) is a blocker.

### 4.4 Cross-product naming conventions (NEW v0.3)

Edmonton's data products do not maintain consistent neighbourhood naming across artifacts. As of 2026-05, 8 known drift cases between the Jan 2023 boundary shapefile and the 2026 assessment data are catalogued in `data/reference/neighbourhood_name_mappings_20260519.csv` with sources. Drift categories observed:

- **Assessment-side typos** (single-L `RAPPERSWIL` for canonical `RAPPERSWILL`, missing R `WINDEMERE` for `WINDERMERE`, singular `WESTBROOK ESTATE` for `WESTBROOK ESTATES`)
- **"AREA" suffix policy** — the City appends "AREA" to neighbourhoods still in development (`CHAPPELLE AREA`, `HERITAGE VALLEY TOWN CENTRE AREA`), dropping the suffix at finalization. The shapefile reflects post-finalization names; the assessment data does not.
- **Compound-name spacing** (`ANTHONY HENDAY SOUTHEAST` vs `ANTHONY HENDAY SOUTH EAST`)
- **Annexation suffixes** (`SOUTHEAST (ANNEXED) INDUSTRIAL` post-2022 annexation)

When a new dataset is wired, expect similar drift. Reconciliation goes through `data/reference/` per §2.7.

---

## 5. The cleaning methodology

This section is the load-bearing one. It describes what we are actually doing.

### 5.1 The problem

Public property assessment data contains contamination — rows that aren't "real residential titles" in the sense the dashboards need (parking stalls, accessory structures, apartment buildings sold as a single title, warehouses, commercial properties, etc.). Roughly 20% of raw rows are contamination. Aggregate statistics (median value per neighbourhood, etc.) computed without removing contamination are biased.

### 5.2 The approach

A small set of conjunctive **public-data filter rules** removes contamination in stages. Each rule:

1. References only public columns (§2.1)
2. Is scored against an oracle for precision and recall (§2.2)
3. Is tuned for year-invariance (§2.3)
4. Appends a row to the combined scoreboard (§6.3)

Rules compose by sequence. Layer 1a row filters run first (parking → residential class → others). Layer 1b is LISA I (spatial outlier detection, not yet implemented). Layer 2 is aggregation to neighbourhood level + spatial join to polygons. Layer 3 is Sanity gates (N≥100, YoY divergence, spatial neighbour checks).

### 5.3 Current Layer 1a rule set (Edmonton property assessment)

Validated 2026-05 against 2023 confidential oracle, 3-year temporal gap:

| Rule | Polarity | Predicate | Precision | Recall | F1 |
|---|---|---|---|---|---|
| parking | drop | `n_at_coord >= 20 AND Assessed Value <= 80000 AND value repeats >= 10x at coord` | 0.986 | 0.992 | 0.989 |
| r1 | keep | `Assessment Class 1 == 'RESIDENTIAL'` | 0.987 | 0.997 | 0.992 |
| r3 | drop | `is.na(lot_size)` (Property Information join, dkk9-cj3x) | 1.000 | 0.949 | 0.974 |

R3 notes: scored against the post-R1 universe (R3 is applied only to rows R1 keeps), so `rows_scored` for R3 differs from parking/R1. Recall ceiling is set by 104 documented structural FNs ("Manufactured home (building and land)" titles own their lot and have a non-NA `lot_size`) plus 14 unexplained "building only" FNs pending inspection. Precision is 1.000 — every row R3 flags is a confirmed manufactured home in the oracle.

After parking + R1 + R3 applied in sequence, ~338,944 rows flow to production from the 341,154-row validation universe. Remaining contamination is below the previous RA's 10% divergence gate (§2.6), so the rule set is shippable as v1 Layer 1a.

When applied to current 2026 data (script 06), the pipeline ships **365,406 rows** from 446,179 raw → 394,406 (post-parking) → 366,004 (post-R1) → 365,406 (post-R3). The +26,462 over scoreboard reflects 3 years of City growth.

`[OPEN]` Layer 1a candidate rules not yet validated (in rough priority order):
- R3b (manufactured homes, building-and-land): the 104 structural FNs from R3 sit on owned lots and have `lot_size > 0`. Candidate signature: `lot_size > 0 AND value ~$78k AND year_built low`. Targets MFH titles R3 cannot catch by construction.
- R4 (lot_size threshold): high lot sizes correlate strongly with non-residential. `lot_size > <threshold>`. Catches acreages (~851 rows).
- R5 (small-parkade leakage): parking stalls that escape `n_at_coord >= 20`. Catches ~580 rows.

Diminishing returns hit hard after R5. Stop point per §2.6 is whenever production-vs-internal aggregate divergence is reliably below 10%. Current data suggests parking + R1 + R3 already passes that gate.

### 5.4 The oracle and validation universe

Oracle is the 2023 confidential xlsx. Row-level oracle (`data/validation/edmonton_row_labels_2023.csv`, 371,244 rows) labels each Account Number with `is_5class` (real residential per the canonical 5-target Luc 1 list) and `is_parking_conf` (confidential parking categories). Neighbourhood-level oracle (`edmonton_neighbourhood_truth_2023.csv`, 298 neighbourhoods) gives per-nbhd aggregates restricted to `is_5class == TRUE` rows.

Canonical 5-target Luc 1 list (locked, version v1):
1. `Single-family, detached house`
2. `Semi-detached residence in duplex`
3. `Row house condominium`
4. `Lowrise condominium`, `Highrise condominium`
5. `Residential bare land condominium (land and building)`, `Carriage home condominium`, `Semi-detached residence in multiplex (four and more)`, `Semi-detached residence in triplex`, `Duplex`, `Fourplex`, `Triplex`

`[OPEN]` Confirm with Prof. Huang whether bare `Row house` (singular, non-condominium) should be included. Currently excluded. 1,410 such rows in 2023 oracle.

`[OPEN]` Locking format: write canonical list to `data/contracts/canonical_5class_v1.csv` with a version marker. Currently lives only in `scripts/03_explore_rental_signal.R` `target_luc` vector. Lift to versioned contract before R2 work begins.

### 5.5 The 3-year-gap design

Validating 2026 rules against 2023 oracle is intentional. If a rule scores 98%+ across a 3-year gap, it generalizes to "this rule catches contamination based on durable signal, not memorization." When the 2024 confidential snapshot arrives, validation re-runs with the 2-year gap; same rules should score similarly. Persistent precision/recall across vintages is the test of methodology durability.

Empirical confirmation (2026-05): R1's precision against the 2023 oracle on the 2026 frame is 0.9872 — identical to the scoreboard's 4-decimal-place precision. The rule contract holds perfectly across 3 years, including Edmonton bylaw 20001 (Jan 2024 zoning collapse) and the Oliver→Wîhkwêntôwin neighbourhood rename (effective Jan 1, 2025).

The unmatched 14% of public rows (those without a 2023 oracle match) are real production rows we cannot validate directly. They are protected by §2.6 (human review) and by the fact that rules use durable public signal, not Account Number lookups.

### 5.6 Layer 2 — aggregation and spatial join (NEW v0.3)

Layer 2 converts cleaned row-level data (the output of Layer 1a) into per-neighbourhood aggregates and attaches them to polygons for choropleth rendering.

**Aggregation (script 07)** ports the previous RA's `Code_Stata_Property_assessment_edmonton_3.do` lines 31-92 directly to R/dplyr. Per-neighbourhood columns: `n_properties`, `avall_public`, `median_assessvalue`, `sd_assessedvalue`, `median_yearbuilt`, `pct_with_unit`, `avg_assessvalue_without_unit`, `avg_lotsize`. Sanity gate at N<100 suppresses **values, not rows** — the row stays in the output with NA in the suppressed columns and `suppressed = TRUE`.

**Spatial join (script 08)** joins aggregates against the Jan 2023 City of Edmonton boundary shapefile on `Neighbourhood ID` ↔ `neighbourh` (numeric, character-cast). Every polygon receives a `polygon_state` classification:

| State | Meaning | Render |
|---|---|---|
| `aggregated` | has data, N ≥ 100 | choropleth colour |
| `suppressed_low_n` | has data, N < 100 | grey + "data suppressed" |
| `non_residential` | R1+R3 emptied the neighbourhood | grey + "no residential properties" |
| `manufactured_home_community` | EVERGREEN ID 2270 special case | grey + "manufactured home community" |
| `no_data` | polygon has no matching aggregate row | grey + reason |

**Cross-product reconciliation (script 08b)** applies the curated mapping at `data/reference/neighbourhood_name_mappings_<YYYYMMDD>.csv` to rescue NA-id aggregate rows. As of 2026-05-19: 8 of 8 NA-id rows rescued, 4 polygons remain in `no_data` state by City designation. See §2.7 and §4.4.

**Canonical GeoJSON for downstream consumers (script 09+, MapLibre, etc.):** `output/neighbourhoods_2026_recovered.geojson`. The pre-rescue artifact at `output/neighbourhoods_2026.geojson` is retained for diff/audit but not consumed.

**Acceptance criteria** (reformulated for the 3-year temporal gap):
1. Spatial integrity — every aggregate row joins to exactly one polygon or is documented as legitimately unjoinable
2. Formula equivalence — column shape and arithmetic match Stata3 line-by-line
3. Shape sanity — value distributions match Edmonton real estate norms (median ~$425K, 10x spread)
4. Reasonableness — top/bottom neighbourhoods land in expected geographies

Numerical match against the previous RA's 2023 Stata3 aggregates is **not** an acceptance criterion (would compare different years).

---

## 6. Conventions for rule scripts

### 6.1 Template

Future rule scripts use `scripts/04_validate_residential_class_rule.R` as their template. Copy the file, change the six metadata fields at the top (`rule_id`, `rule_slug`, `rule_label`, `rule_polarity`, `year_tag`, predicate body), run. The scorecard structure is invariant; only the predicate and metadata differ across rules.

### 6.2 Output filename pattern

```
output/<rule_id>_<rule_slug>_validation_<year>.csv     # Long-format metrics
output/<rule_id>_<rule_slug>_errors_<year>.csv          # FP/FN breakdown by luc_1_desc
output/rule_scorecards_<year>.csv                       # Combined wide-format scoreboard
```

### 6.3 Scoreboard schema (v1)

Wide-format CSV, one row per (rule, year, dataset). Columns:

```
rule_id        — short slug, unique within a dataset (e.g., "parking", "r1")
rule_slug      — human-readable slug
rule_label     — predicate in English
polarity       — "keep" or "drop". Tells the Sanity Agent how to interpret rows_kept/rows_dropped.
year           — oracle year used for validation
precision      — TP / (TP + FP)
recall         — TP / (TP + FN)
f1             — 2 * P * R / (P + R)
true_pos, false_pos, false_neg, true_neg  — confusion matrix cells
rows_scored    — validation universe size
rows_kept      — rows where predicate == TRUE (TP + FP)
rows_dropped   — rows where predicate == FALSE (FN + TN)
```

`[OPEN]` Schema additions to make before more datasets land:
- `dataset` (e.g., `"edmonton_property_assessment"`) — namespace for multi-dataset scoreboards
- `city` (e.g., `"edmonton"`, `"calgary"`) — secondary namespace
- `filter_sql` — machine-readable SQL form of the predicate, for Sanity Agent consumption
- `layer` — `"1a"`, `"1b"`, `"2"`, `"3"`
- `order` — integer, application order within a layer

Add these to script 04's `scoreboard_row` tibble before running R2's validation script.

### 6.4 Polarity semantics

Polarity determines the meaning of `rows_kept` / `rows_dropped` for each rule. For polarity `"keep"`, predicate `TRUE` means "retain this row for production" — `rows_kept` is the production-bound set. For polarity `"drop"`, predicate `TRUE` means "remove this row from production" — `rows_kept` is the removed set, and `rows_dropped` is what flows to production.

Layer 1a default is `"drop"`. R1 is the foundational exception (`"keep"`). When in doubt, polarity is `"drop"`.

### 6.5 Reference table schema (NEW v0.3)

Reference tables under `data/reference/` follow a uniform column convention so the Phase 2 Sanity Agent can consume any of them with the same code path. Required columns:

```
<key_a>         — first reconciliation key (e.g., shapefile_name)
<key_a>_id      — optional ID for the first key (e.g., shapefile_id)
<key_b>         — second reconciliation key (e.g., assessment_name)
reason          — drift category tag (snake_case)
source          — authority justifying the mapping (free text, must be evidence-bearing)
date_curated    — ISO date the mapping was added
curated_by      — person who curated (e.g., "KC", "OF" for Olivia)
```

Filename pattern: `<scope>_<concern>_<YYYYMMDD>.csv` (e.g., `neighbourhood_name_mappings_20260519.csv`). Date stamp is mandatory.

---

## 7. Negative rules

What Claude must not do, in this project:

### 7.1 Do not reopen the confidential xlsx outside `scripts/03_explore_rental_signal.R`

**Reason**: §2.1, §4.3. The confidential file is a one-time oracle source.
**Alternative**: read `data/validation/edmonton_row_labels_2023.csv` or `data/validation/edmonton_neighbourhood_truth_2023.csv`.
**Escalation**: if a downstream script genuinely needs a confidential column not in the validation CSVs, do not patch the script — instead, propose extending `scripts/03` to add the column to the validation export, then regenerate.

### 7.2 Do not introduce rule predicates that reference confidential columns

**Reason**: §2.1. Rules must run on public data alone.
**Alternative**: derive an equivalent public-side signal. Most contamination categories have a public-data fingerprint (see `scripts/03` Section B.7).
**Escalation**: if a contamination category genuinely has no public-side signal, document the gap in §5.3 `[OPEN]` and escalate to KC. Do not silently use a confidential column.

### 7.3 Do not silently overwrite scoreboard rows

**Reason**: §2.5 audit traceability.
**Alternative**: the scoreboard write block in `scripts/04` removes the prior version of the current rule by `rule_id` and appends fresh. This is the only acceptable update pattern. Wholesale overwrite of the scoreboard with arbitrary content is a blocker.
**Escalation**: if you need to migrate the scoreboard schema (add columns, etc.), use the migration block pattern: detect missing columns, backfill via explicit `case_when` mapping, log to console with `message()`.

### 7.4 Do not hardcode oracle-year-specific thresholds in rule predicates

**Reason**: §2.3 year invariance.
**Alternative**: use domain-justified constants (the `$80,000` parking cap) or quantile-based bounds computed from the year being cleaned.
**Escalation**: if a rule genuinely needs a year-specific threshold (e.g., inflation adjustment), parameterize the threshold by year and document the inflation logic in the script header.

### 7.5 Do not propose commercial features, paid tiers, or productization

**Reason**: §1. Model D is deferred indefinitely.
**Alternative**: focus suggestions on research-infrastructure utility, public accessibility, and reproducibility.
**Escalation**: none. This is a hard scope boundary.

### 7.6 Do not modify `data/contracts/` or `data/reference/` files in place

**Reason**: §2.4 versioned contracts. Reference tables are contracts per §2.7.
**Alternative**: for `data/contracts/`, create `<contract>_v2.csv` alongside `<contract>_v1.csv`, document the diff in a sibling `.md` file, and update consumer scripts to read `v2`. For `data/reference/`, create a new date-stamped file (e.g., `_20260601.csv` alongside `_20260519.csv`), and update consumer scripts to read the latest date.
**Escalation**: if a change is truly trivial (typo fix), still bump version/date and note the trivial-fix justification. Versioning discipline is more valuable than the small overhead.

### 7.7 Do not invoke the previous RA's pipeline

**Reason**: explicit scope decision. The previous pipeline (Python + Stata + ArcPy + R random forest) is reference material only.
**Alternative**: the new platform replaces the whole flow. Reuse only the five explicit inheritances documented in memory (canonical Luc 1 list, Stata3 aggregate column shapes, Stata3 N<100 gate, `unit:` legal description signal, Luc 1 contamination definition). Note: the previous RA's 10% divergence gate at Stata3 line 121 is **not adopted in production** — it would require running aggregates over confidential data and breach §2.1. Reserved for the Phase 2 Sanity Agent only.
**Escalation**: if a previous-RA artifact seems useful beyond these five, document why and add to the inheritance list with KC review.

### 7.8 Do not auto-resolve cross-product naming conflicts with fuzzy matching (NEW v0.3)

**Reason**: §2.7. Fuzzy matching introduces non-determinism; the same input can produce different mappings if the algorithm changes. The Sanity Agent must produce auditable, reproducible mappings.
**Alternative**: surface the unresolved case in the audit log. Add a row to `data/reference/neighbourhood_name_mappings_<YYYYMMDD>.csv` only after researching the canonical form via authoritative sources (Wikipedia, City Census CSVs, shapefile attribute fields).
**Escalation**: a high-volume new drift pattern (e.g., 50+ new mismatches in a single refresh) warrants a Sanity Agent investigation pass before manual curation. Flag to KC; do not bulk-resolve.

---

## 8. Context-loading guidance for Claude Code

For focused tasks, load only relevant sections to save tokens:

| Task | Load sections |
|---|---|
| Writing or reviewing a new rule script | §2, §5, §6, §7 |
| Debugging a data loading issue | §3, §4 |
| Writing an aggregation or spatial-join script | §2.7, §4, §5.6, §7.6 |
| Working with reference tables | §2.4, §2.7, §4.4, §6.5, §7.6, §7.8 |
| Discussing scope / "should we build X?" | §1, §2, §7.5 |
| Schema or contract changes | §2.4, §6.3, §6.5, §7.6 |
| Methodology question ("why are we doing it this way?") | §2, §5 |
| Full context for an unfamiliar contributor | All sections |

When in doubt, load §2 (architectural invariants) and §7 (negative rules) — these are the load-bearing constraints.

---

## 9. What's `[OPEN]`

Consolidated list of unresolved decisions flagged above. Each must be resolved before the indicated milestone.

| `[OPEN]` | Section | Resolve by |
|---|---|---|
| Calgary script structure: mirror Edmonton or RE-prefix SQL filter? | §4.2 | Phase 1 start |
| Identify canonical 2026 boundary shapefile source (UAlberta Library data services) | §4.1 | Post-Friday |
| `Row house` inclusion in canonical 5-class | §5.4 | Before R2 work begins |
| Lift `target_luc` to `data/contracts/canonical_5class_v1.csv` | §5.4 | Before R2 work begins |
| R3b: catch "Manufactured home (building and land)" structural FNs from R3 | §5.3 | Before R4 validation runs |
| Add `dataset`, `city`, `filter_sql`, `layer`, `order` columns to scoreboard schema | §6.3 | Before R2 validation runs |
| `agent_runs` table schema and integration | §2.5 | Phase 1 |
| Phase 1+ `platform/` directory structure | §3 | Phase 1 |
| Sanity Agent consumes `data/reference/*.csv` — formalize contract | §2.7, §6.5 | Phase 2 start |
| Voice guide for Narrative and Digest agents | future | Phase 3 |
| Versioned schemas for Sanity verdict, Insight findings, Digest input | future | Phase 2 / Phase 5 |

---

## 10. When to revise this file

Revise CLAUDE.md when:
- A new architectural invariant emerges (§2) — bump to v0.x+1
- A new dataset is wired (§4)
- A new rule is validated and shipped (§5.3 table updated, scoreboard reflects)
- A new layer or mechanism is implemented (§5.6 expanded, §2 invariant added if needed)
- A negative rule needs adjustment (§7)
- An `[OPEN]` is resolved (§9 removed, relevant section updated to be authoritative)

Run a full three-phase Opus methodology pass (interrogation → constrained drafting → adversarial review) before bumping to **v1.0**. v1.0 cutover is gated on Phase 1 completion (DB + connectors live, `agent_runs` table populating, at least one agent running).

Until v1.0, this file is the authoritative bootstrap context. Treat it as living, not provisional.

---

## Change log

- **v0.3 (2026-05-19)** — Added §2.7 (cross-product reconciliation), §4.4 (cross-product naming conventions), §5.6 (Layer 2 aggregation + spatial join), §6.5 (reference table schema), §7.8 (no fuzzy matching). Updated §3 (repo layout — added scripts 05-08b, `data/reference/`, GeoJSON outputs). Updated §2.4 and §2.5 to include reference tables. Updated §7.7 to clarify that the previous RA's 10% divergence gate is Sanity Agent territory, not production.
- **v0.2 (2026-05-19, earlier)** — R3 validated, scoreboard reaches 3 rules.
- **v0.1** — Initial document. Parking + R1 validated.
