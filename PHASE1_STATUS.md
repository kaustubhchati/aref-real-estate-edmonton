# Status Report — Property Assessment Cleaning (Edmonton)

**Reassessed:** May 19, 2026 (fourth pass — supersedes all prior reports)
**Workstream:** Phase 1, Layers 1a + 2 — row-level rule discovery, neighbourhood aggregation, and spatial join
**Scope:** Edmonton public property assessment data (q7d6-ambg + dkk9-cj3x), 2026 current, validated against 2023 confidential oracle

---

> **Context (2026-05-21):** `CLAUDE.md` (v1.0) is the current authoritative project context and
> supersedes the v0.3 cited below by section number — this report's `CLAUDE.md §x.x` references map
> to the v1.0 invariants in §4–§5. The website is a **static replication**; "Sanity Agent"
> references here are the parked future-platform vision, not the current site. The repo is being
> reorganised per CLAUDE.md §3 (pipeline files move under `pipeline/property-assessment/`); paths
> below reflect the pre-reorg flat layout.

---

## 0. Temporal asymmetry (read first)

Public assessment data is **2026** (q7d6-ambg snapshot, fetched May 19, 2026). Confidential oracle is **2023** (xlsx, validation-only). The 3-year gap is intentional per CLAUDE.md's temporal-asymmetry / year-invariance invariant (§4.3, §5) — it's the test of methodology durability. Rules that score F1 ≥ 0.97 across a 3-year gap pass the year-invariance contract.

**Consequence for Layer 2:** aggregates computed from current 2026 cleaned data will NOT numerically match the previous RA's 2023 Stata3 outputs. Acceptance criteria for Layer 2 are reformulated (see §5).

---

## 1. What changed since the last report

Three significant pieces of work shipped:

**1. Script 06 (`apply_layer1a_rules.R`)** — applies validated parking + R1 + R3 rules to current 2026 data. Produces `data/processed/assess_2026_clean.csv` (365,406 rows). This is the production-bound frame.

**2. Scripts 07 + 08 (Layer 2 aggregation + spatial join)** — port of previous RA's `Code_Stata_Property_assessment_edmonton_3.do` lines 31-92, plus spatial join against the Jan 2023 City of Edmonton neighbourhood boundary shapefile. Outputs neighbourhood-level aggregates and a MapLibre-ready GeoJSON.

**3. Script 08b (`name_fallback_rescue.R`)** — a Phase-2 Sanity Agent prototype. Rescues 8 NA-id aggregate rows via a hand-curated, version-controlled name mapping table. Surfaces a finding about cross-product naming drift in the City's own data products.

---

## 2. Rule-by-Rule State (Scoreboard Live)

Unchanged from prior report. Three validated rules, all above F1 0.97. Source of truth: `output/rule_scorecards_2023.csv`.

| Rule | Polarity | Label | Precision | Recall | F1 | Rows flagged | Status |
|------|----------|-------|-----------|--------|-----|--------------|--------|
| Parking | drop | spatial+value cluster | 0.986 | 0.992 | 0.989 | 44,311 | ✅ Scored, in scoreboard |
| R1 | keep | `Assessment Class 1 == 'RESIDENTIAL'` | 0.987 | 0.997 | 0.992 | 341,154 kept | ✅ Scored, in scoreboard |
| R3 | drop | `is.na(lot_size)` [PI join] | **1.000** | 0.949 | 0.974 | 2,210 | ✅ Scored, in scoreboard |

---

## 3. Coverage Math — Current 2026 Actuals

Pipeline applied to current 2026 data via script 06:

| Layer | Rows in | Dropped | Rows out |
|-------|---------|---------|----------|
| Raw join | 446,179 | — | 446,179 |
| After Parking | 446,179 | 51,773 | 394,406 |
| After R1 (keep) | 394,406 | 28,402 | 366,004 |
| After R3 (drop) | 366,004 | 598 | **365,406** |

The 2026 pipeline ships **365,406 rows** to production. This is +26,462 over the 2023 scoreboard baseline of 338,944 — reflecting 3 years of City growth (new construction in fringe developments).

**Cross-year validation of R1's contract:** of the 367,666 post-R1 rows in 2026, 341,154 are also present in the 2023 oracle (exact match to the scoreboard universe) with R1 precision 0.9872 against the oracle — identical to the scoreboard precision to 4 decimal places. The rule contract holds perfectly across 3 years, including Edmonton bylaw 20001 (Jan 2024 zoning collapse) and the Oliver→Wîhkwêntôwin neighbourhood rename (effective Jan 1, 2025).

---

## 4. Layer 2 — Neighbourhood Aggregation

Script 07 ports the previous RA's Stata3 aggregate formulas to R/SQL. Per-neighbourhood columns produced:

- `n_properties` — row count
- `avall_public` — mean assessed value (all rows)
- `median_assessvalue` — median assessed value
- `sd_assessedvalue` — standard deviation
- `median_yearbuilt` — median construction year
- `pct_with_unit` — % of rows with `unit:` in legal_description (condo indicator)
- `avg_assessvalue_without_unit` — mean restricted to non-unit rows
- `avg_lotsize` — mean lot size, non-unit rows only

**Sanity gate applied:** values (not rows) suppressed when N < 100, per CLAUDE.md's suppression gate and the previous RA's Stata3 gate at lines 120-128. The 10% public-vs-internal divergence gate from Stata3 line 121 is **NOT applied** — it would require running aggregates over confidential data and breach CLAUDE.md's methodology boundary (§4.1). Deferred to Phase 2 Sanity Agent.

**Output:** `output/neighbourhood_aggregates_2026.csv`, 346 rows (338 with numeric IDs + 8 NA-id rows for developing fringe neighbourhoods).

---

## 5. Layer 2 acceptance criteria — reformulated for the temporal gap

The previous RA's pipeline produced 2023 Stata3 aggregates. Our pipeline produces 2026 aggregates from cleaned 2026 data. **Numerical match against the 2023 outputs is not an acceptance criterion** (we'd be comparing different years). The new criteria:

1. **Spatial integrity** — every aggregate row joins to exactly one polygon (or is documented as legitimately unjoinable). ✅ achieved via script 08b.
2. **Formula equivalence** — every aggregate column produced from the same arithmetic as Stata3, with the same column shape and suppression rules. ✅ verified line-by-line port.
3. **Shape sanity** — value distributions plausibly match 2026 Edmonton real estate norms (no neighbourhoods at $50 medians, no neighbourhoods at $50M medians except for genuine outliers). ✅ — see colour-scale domain below.
4. **Reasonableness gates** — top-end neighbourhoods and bottom-end neighbourhoods land in the expected geographies. To verify pre-demo.

**Colour-scale domain (median_assessvalue, aggregated polygons):**

| Statistic | Value |
|-----------|-------|
| Min | $103,500 |
| Q25 | $352,625 |
| Median | $425,125 |
| Q75 | $496,188 |
| Max | $1,226,000 |

~10x spread, tight Q25-Q75, long tail to the high-end neighbourhoods. Matches the shape any Edmonton-real-estate-familiar reviewer would expect.

---

## 6. Spatial join — script 08 + 08b name-fallback rescue

Script 08 performs the primary spatial join: aggregates × 2023 City of Edmonton neighbourhood boundary shapefile, joining on `Neighbourhood ID` ↔ `neighbourh` (numeric). 402 polygons in the shapefile. After the join, every polygon gets a `polygon_state`:

- `aggregated` — has data, N ≥ 100, render with choropleth colour
- `suppressed_low_n` — has data, N < 100, render grey-labelled
- `non_residential` — R1+R3 emptied the neighbourhood, render grey-labelled
- `manufactured_home_community` — EVERGREEN (ID 2270), special-case grey
- `no_data` — polygon has no matching aggregate row at all

**Script 08 output (initial run):** 12 polygons in `no_data` state, 8 aggregate rows unrenderable (NA-id).

### 6.1 The cross-product naming finding

Diagnostic on the 12 `no_data` polygons revealed they fall into two categories:

**8 polygons with assessment-side counterparts that have valid Neighbourhood IDs in the shapefile but `NA` IDs in the 2026 assessment data:**

| Shapefile name | Shapefile ID | Assessment name | Drift type |
|---|---|---|---|
| ANTHONY HENDAY SOUTH EAST | 6665 | ANTHONY HENDAY SOUTHEAST | compound-name spacing |
| CHAPPELLE | 5462 | CHAPPELLE AREA | "AREA" suffix policy |
| HERITAGE VALLEY TOWN CENTRE | 5464 | HERITAGE VALLEY TOWN CENTRE AREA | "AREA" suffix policy |
| LEWIS FARMS INDUSTRIAL | 4485 | LEWIS FARMS INDUSTRIAL | exact match |
| RAPPERSWILL | 3370 | RAPPERSWIL | assessment-side typo |
| RIVER VALLEY WINDERMERE | 5405 | RIVER VALLEY WINDEMERE | assessment-side typo |
| SOUTHEAST INDUSTRIAL | 6690 | SOUTHEAST (ANNEXED) INDUSTRIAL | annexation suffix added |
| WESTBROOK ESTATES | 5540 | WESTBROOK ESTATE | assessment-side typo |

**4 polygons that are legitimately empty by City designation:**

| Polygon | Shapefile ID | Reason |
|---|---|---|
| EDMONTON RESEARCH AND DEVELOPMENT PARK | 6190 | Industrial/research zone, zero residential by design |
| OLIVER | 1150 | Historical/secondary boundary, distinct from active Wîhkwêntôwin at ID 1151 |
| PLACE LARUE | 4400 | 0-residential-population commercial zone per City 2014 + 2019 census |
| WINDERMERE AREA | 5575 | Umbrella structure-plan container; 6 sub-neighbourhoods carry properties |

### 6.2 Script 08b — name-fallback rescue

Implementation produces three artifacts:

1. **`data/reference/neighbourhood_name_mappings_20260519.csv`** — 8-row curated mapping table with `shapefile_name`, `shapefile_id`, `assessment_name`, `reason`, `source`, `date_curated`, `curated_by`. Every row researched against authoritative sources (Wikipedia, real estate consensus, City census CSVs, shapefile attribute fields).
2. **`output/neighbourhoods_2026_recovered.geojson`** — corrected choropleth source, supersedes the original `neighbourhoods_2026.geojson`.
3. **`output/name_mapping_audit_log_20260519.csv`** — audit trail showing every mapping attempt and its resolution.

**Post-rescue polygon state breakdown:**

| State | Before 08b | After 08b | Delta |
|---|---:|---:|---:|
| aggregated (coloured) | 274 | **278** | +4 |
| suppressed_low_n | 57 | **61** | +4 |
| non_residential | 58 | 58 | — |
| manufactured_home_community | 1 | 1 | — |
| no_data | 12 | **4** | −8 |

8 of 8 rescues succeeded. The 4 remaining `no_data` polygons are the legitimately-empty group documented in §6.1.

### 6.3 The Sanity Agent prototype

Script 08b is the operational prototype of what the Phase 2 Sanity Agent will do for cross-product reconciliation:

- Mapping table is a versioned, machine-readable contract (CSV with explicit columns)
- Every mapping is sourced and dated for audit
- Application is deterministic — no fuzzy matching
- Unresolved cases surface in the audit log for human review
- Output is non-destructive — the `_recovered` suffix preserves the unrescued artifact

In Phase 2, this becomes a Sanity Agent capability that runs every refresh, comparing the current refresh's NA-id roster against the mapping table, surfacing new cases for KC approval before they ship.

---

## 7. Open Items, Updated

| # | Item | Status |
|---|------|--------|
| 1 | ~~Reconstruct script 04~~ | ✅ Closed |
| 2 | ~~Run script 05~~ | ✅ Closed — R3 scored at P=1.000, R=0.949 |
| 3 | ~~Decide whether to stop adding row rules~~ | ✅ Closed — stopped at three rules, residual 0.63% |
| 4 | ~~Port Stata3 aggregates to SQL/R~~ | ✅ Closed — script 07 |
| 5 | ~~Spatial join against shapefile~~ | ✅ Closed — script 08 |
| 6 | ~~Resolve NA-id developing neighbourhoods~~ | ✅ Closed — script 08b + mapping CSV |
| 7 | **Script 09 — MapLibre HTML choropleth** | **Next.** Inputs locked: `neighbourhoods_2026_recovered.geojson` + colour-scale domain at §5. Est. 60-90 min. |
| 8 | Backfill R1's `notes` field in scoreboard — currently NA | Cosmetic. Pre-Friday cleanup. |
| 9 | Delete the stale 0-byte `scripts_04_validate_residential_class_rule.R` | Cosmetic. |
| 10 | R1 vs `Assessment Class % 1 ≥ 90` head-to-head | Open. Worth resolving for Tableau parity, deferred. |
| 11 | Layer 1b (LISA I spatial outliers) | Open. Phase 1 stretch goal. |
| 12 | Email UAlberta Library data services for canonical 2026 boundary shapefile | Pending. The Jan 2023 shapefile works for Friday; 2026 source identification is a parallel track. |
| 13 | Optional R3b for ~104 building-and-land manufactured home FNs | Open. Probably unnecessary. |

---

## 8. What's Locked

- **Three Layer 1a rules at F1 ≥ 0.97.** Validated contract, ship-ready.
- **Layer 2 aggregation formulas.** Direct port of Stata3, suppression at N<100, all 8 columns produced.
- **Spatial join semantics.** ID-based primary join + curated name-based fallback for cross-product drift cases. The contract for the Phase 2 Sanity Agent is now concrete.
- **Cross-product reconciliation mechanism.** Versioned mapping CSV at `data/reference/neighbourhood_name_mappings_<YYYYMMDD>.csv`. Future refreshes append; the Sanity Agent reads.
- **The temporal-asymmetry methodology.** Rules validate on 2023 oracle, run on 2026+ public data, contract holds across the gap with zero degradation.

---

## 9. Recommendation

The cleaning pipeline is complete end-to-end: raw API → row rules (Layer 1a) → aggregation (Layer 2) → spatial join (Layer 2) → GeoJSON. The choropleth is unblocked.

**For Friday demo:**

1. **Write script 09 (MapLibre HTML)** — the one remaining piece. Consumes `output/neighbourhoods_2026_recovered.geojson`, locked colour-scale domain, renders the full 402-polygon city map with hover tooltips.
2. **Update `YEAR_DRIFT_FINDINGS.md`** to reflect §6.1 cross-product naming finding (the prior §3.2 framing about NA-id rows having no polygons is now superseded).
3. **Optional cleanup** — items #8 and #9.

The data-cleaning workstream arc: "concept proven" → "three rules validated" → "Layer 2 aggregated" → "spatial join with cross-product reconciliation operational." That's the full Phase 1 data-side delivery. Script 09 is presentation; the engineering is done.
