# Parking Rule Investigation — Historical Property Assessment
**AREF Open Data Centre | University of Alberta Economics**
**Author: Kaustubh Chati (Research Assistant)**
**Date: 2026-06-17**
**Dataset: Edmonton Historical Property Assessment 2012–2025**
**Source: [data.edmonton.ca — qi6a-xuwt](https://data.edmonton.ca/City-Administration/Property-Assessment-Data-Historical-/qi6a-xuwt/data_preview)**

---

## 1. Background

The current-year pipeline (2026 public data) uses a coordinate-density parking rule validated at F1 0.989 on the 2023 confidential oracle:

> **Flag any row where ≥ 3 accounts share an identical (Latitude, Longitude) coordinate pair.**

This document investigates whether that rule transfers to the historical dataset (2012–2025, ~5.5M rows) and, if not, what replacement rule is appropriate.

---

## 2. Why the Coordinate Rule Fails on Historical Data

### 2.1 Year Repetition Inflates Coordinate Counts

In the single-year file, a condo building with 50 units = 50 rows at one coordinate. In the historical file, that same building across 14 years = **700 rows at one coordinate**. Even a single-unit property hits `n ≥ 3` just from year repetition.

**Diagnostic code:**

```r
# Count accounts per coordinate pair ACROSS all years (broken)
coord_counts_naive <- pa_res |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  count(Latitude, Longitude, name = "n_at_coord")

# Result: p75 = 68, p95 = 420, max = 1,152 — clearly not parking clusters
print(quantile(coord_counts_naive$n_at_coord,
               probs = c(0, .25, .5, .75, .90, .95, .99, 1)))
```

**Result observed:**

| Percentile | n_at_coord |
|---|---|
| 0% | 1 |
| 25% | 1 |
| 50% | 1 |
| 75% | 68 |
| 90% | 294 |
| 95% | 420 |
| 99% | 623 |
| 100% | 1,152 |

**Conclusion:** p75 = 68 is a condo tower, not a parkade. The naive coordinate rule flags **4.4M of 4.9M rows (89%)** — the entire residential condo stock.

### 2.2 Within-Year Coordinate Counts Also Fail

Switching to within-year counts reduces over-flagging but the high-density coordinate distribution still captures legitimate multi-family buildings:

```r
# Within-year coordinate counts
coord_counts_hist <- pa_res |>
  filter(!is.na(Latitude), !is.na(Longitude)) |>
  group_by(`Assessment Year`, Latitude, Longitude) |>
  summarise(
    n_at_coord  = n(),
    median_val  = median(`Assessed Value`, na.rm = TRUE),
    .groups = "drop"
  )
```

Neighbourhood inspection of high-density flagged rows revealed **South Terwillegar, Ermineskin, Ambleside, Rutherford, Windermere** — suburban south Edmonton family neighbourhoods with zero downtown parkades. These are condos and townhouses with shared building centroids.

**Coordinate-density is not a viable parking signal for the historical dataset.**

---

## 3. Assessed Value as a Parking Signal

### 3.1 Raw Value Distribution of Low-Value Rows

Parking stalls are assessed at ~$5,000–$15,000. Legitimate residential units start at $100,000+.

```r
# Global distribution of low-value rows
pa_res |>
  summarise(
    total         = n(),
    under_20k     = sum(`Assessed Value` < 20000, na.rm = TRUE),
    pct_under_20k = scales::percent(mean(`Assessed Value` < 20000,
                                         na.rm = TRUE), 0.01)
  ) |>
  print()
```

**Result:** 523,110 rows (10.5%) have assessed value < $20,000.

### 3.2 Lot Size Distribution of Low-Value Rows

```r
# Lot size distribution for assessed value < $20K rows
pa_res |>
  filter(`Assessed Value` < 20000) |>
  mutate(lot_band = case_when(
    `Lot Size` < 20   ~ "<20 m²",
    `Lot Size` < 50   ~ "20-50 m²",
    `Lot Size` < 100  ~ "50-100 m²",
    `Lot Size` < 200  ~ "100-200 m²",
    TRUE              ~ "200m²+"
  )) |>
  count(lot_band, name = "n_rows") |>
  mutate(pct = scales::percent(n_rows / sum(n_rows), accuracy = 0.1)) |>
  arrange(lot_band) |>
  print()
```

**Result:**

| Lot Band | Rows | % |
|---|---|---|
| < 20 m² | 473,559 | **90.5%** |
| 20–50 m² | 6,740 | 1.3% |
| 50–100 m² | 4,572 | 0.9% |
| 100–200 m² | 9,701 | 1.9% |
| 200 m²+ | 28,538 | 5.5% |

**90.5% of low-value rows have lot size < 20 m²** — the physical size of a single parking stall (14–18 m²).

---

## 4. Why Lot Size < 20 m² Cannot Be Used Alone

### 4.1 Edmonton Condo Proportional Lot Size

Edmonton's assessment data records each condo unit's **proportional share of the building footprint**, not the full parcel. Under Zoning Bylaw 12800:

- **RA7 minimum site area: 800 m²** (City of Edmonton, Zoning Bylaw 12800, Section 210.4.3)
- A 50-unit building on 800 m² = **16 m² per unit** in the lot size field
- A 100-unit building on 800 m² = **8 m² per unit**

Legitimate condo units in RA7/RA8/RA9 buildings therefore appear with lot sizes of 4–20 m² — indistinguishable from parking stalls by lot size alone.

**Confirming code:**

```r
# Are RF5/RF6 low-lot rows legitimate condos?
pa_res |>
  filter(`Assessed Value` < 20000,
         `Lot Size` < 20,
         grepl("^RF", Zoning)) |>
  count(Zoning, Neighbourhood, name = "n_rows") |>
  arrange(desc(n_rows)) |>
  slice_head(n = 15) |>
  print()
```

**Result:** RF6/Oliver (1,392), RF6/Terra Losa (1,389), RF5/Ramsay Heights (960) — these are medium-density multi-family buildings. Their low assessed values and small proportional lots are structurally legitimate, not parking contamination.

---

## 5. Zoning Bylaw 12800 — Full Reference (2012–2023)

### 5.1 Sources

| Source | URL |
|---|---|
| City of Edmonton — Official Bylaw 12800 | https://webdocs.edmonton.ca/zoningbylaw/ZoningBylaw/ |
| RA7 Zone — Official Text | https://webdocs.edmonton.ca/zoningbylaw/ZoningBylaw/Part2/Residential/210_(RA7)_Low_Rise_Apartment_Zone.htm |
| RF1 Zone — Official Text | https://webdocs.edmonton.ca/zoningbylaw/ZoningBylaw/Part2/Residential/110_(RF1)_Single_Detached_Residential_Zone.htm |
| City of Edmonton — Zone Equivalencies (12800 → 20001) | https://www.edmonton.ca/sites/default/files/public-files/ZBRI-Zone-Equivalencies.pdf |
| City of Edmonton — Zoning Bylaw renewal page | https://www.edmonton.ca/city_government/bylaws/zoning-bylaw |
| Situate Inc — RM Zone explainer (post-2023) | https://situateinc.ca/regulation/edmonton-rm-zone/ |

### 5.2 Residential Zone Code Reference

**RF Family (low density, 2012–2023):**

| Code | Name | Housing Types | Min Site Area |
|---|---|---|---|
| RF1 | Single Detached Residential | Single detached, duplex, garden/secondary suite | 250.8 m² |
| RF2 | Low Density Infill | Single detached, duplexes | ~300 m² |
| RF3 | Small Scale Infill | Up to 4 units, row houses | 360 m² (apt) |
| RF4 | Semi-detached Residential | Duplexes, semi-detached | 488.4 m² |
| RF5 | Row Housing | Townhouses, connected multi-family | varies |
| RF6 | Medium Density Multiple Family | 1–2 storey multi-family | varies |
| RSL | Residential Small Lot | Single family, small lots | ~250 m² |
| RPL | Planned Lot Residential | Single family, lane access | standard |
| RR | Rural Residential | Single family rural | 1.0 ha |
| RMH | Mobile Home | Manufactured/mobile homes | 280 m² |

**RA Family (apartment, 2012–2023):**

| Code | Name | Building Type | Min Site Area | Min Width | Max Height |
|---|---|---|---|---|---|
| RA7 | Low Rise Apartment | Apartments ≤ 4 storeys | **800 m²** | 20.0 m | 14.5 m |
| RA8 | Medium Rise Apartment | Apartments ≤ 6 storeys | larger | wider | taller |
| RA9 | High Rise Apartment | Apartments > 6 storeys | largest | widest | unlimited |

**Key implication:** RA7 minimum 800 m² site, but each unit only owns a proportional share in assessment data. A 50-unit RA7 building records 16 m² lot size per unit — structurally identical to a parking stall on lot size alone.

### 5.3 Post-2023 Transition (Bylaw 20001 — your 2024–2025 data)

Bylaw 12800 was repealed January 1, 2024 and replaced with Bylaw 20001:

| Old Zone | New Zone | Effective |
|---|---|---|
| RF1, RF2, RF3, RF4 (redeveloping) | RS — Small Scale Residential | Oct 16, 2023 |
| RSL, RPL, RF4 (developing) | RSF — Small Scale Flex Residential | Oct 16, 2023 |
| RF6, RA7 | RM h16 — Medium Scale Residential | Jan 1, 2024 |
| RA8 | RM h23 — Medium Scale Residential | Jan 1, 2024 |

This explains the structural break in zoning codes at 2024: RF virtually disappears (1 row), RSL disappears (1 row), RA drops from 79,200 to 19 rows. All converted to RS/RSF/RM.

---

## 6. Zone Family Classification

### 6.1 RSL Regex Bug — Fixed

Initial `grepl("^RS", Zoning)` incorrectly captured RSL (a pre-2023 Residential Small Lot zone) as post-2023 RS. RSL appears in the data from 2012 with ~27,000–45,000 rows per year.

**Fix:**

```r
# CORRECT zone_family classification — most specific patterns first
pa_res <- pa_res |>
  mutate(zone_family = case_when(
    Zoning == "RSL"          ~ "RSL (residential small lot)",
    grepl("^RSF", Zoning)    ~ "RSF (post-2023 flex)",
    grepl("^RS",  Zoning)    ~ "RS (post-2023 small scale)",
    grepl("^RF",  Zoning)    ~ "RF (low density residential)",
    grepl("^RA",  Zoning)    ~ "RA (apartment)",
    grepl("^RR",  Zoning)    ~ "RR (rural residential)",
    grepl("^RMH", Zoning)    ~ "RMH (mobile home)",
    grepl("^RPL", Zoning)    ~ "RPL (planned lot)",
    grepl("^DC",  Zoning)    ~ "DC (direct control)",
    is.na(Zoning)             ~ "NA",
    TRUE                      ~ "OTHER"
  ))
```

### 6.2 Corrected Zone Family Distribution

```r
pa_res |>
  count(zone_family, name = "n_rows") |>
  mutate(pct = scales::percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
  arrange(desc(n_rows)) |>
  print()
```

**Result:**

| Zone Family | Rows | % | Verdict |
|---|---|---|---|
| RF (low density residential) | 2,196,499 | 44.30% | Clean residential |
| RA (apartment) | 870,333 | 17.55% | Contains parking stalls |
| RS (post-2023 small scale) | 481,933 | 9.72% | Post-bylaw replacement for RF+RSL |
| RSL (residential small lot) | 480,633 | 9.69% | Clean residential |
| DC (direct control) | 332,633 | 6.71% | Mixed — towers with parking |
| OTHER | 264,332 | 5.33% | Commercial zones — suspicious |
| RPL (planned lot) | 178,697 | 3.60% | Clean residential |
| NA | 144,406 | 2.91% | 2025 data gap — accept as-is |
| RR (rural residential) | 7,928 | 0.16% | Clean residential |
| RMH (mobile home) | 1,327 | 0.03% | Clean residential |

### 6.3 Zone Family of Flagged Low-Value + Small-Lot Rows

```r
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20) |>
  count(zone_family, name = "n_rows") |>
  mutate(pct = scales::percent(n_rows / sum(n_rows), accuracy = 0.01)) |>
  arrange(desc(n_rows)) |>
  print()
```

**Result:**

| Zone Family | Rows | % | Interpretation |
|---|---|---|---|
| RA (apartment) | 262,576 | 55.45% | Parking stalls in condo towers |
| DC (direct control) | 110,717 | 23.38% | Mixed-use towers with parking |
| OTHER | 50,370 | 10.64% | Commercial zones — credible contamination |
| NA | 40,085 | 8.46% | Unknown — conservatively retained |
| RF (low density residential) | 9,552 | 2.02% | RF5/RF6 condos — **legitimate residential** |
| RS / RSL / RPL / RMH | < 300 | < 0.1% | Edge cases — retained |

**Critical finding:** The RF 2.02% (9,552 rows) are RF5/RF6 medium-density condos in Oliver, Terra Losa, and Ramsay Heights. These are legitimate residential units with proportional lot sizes. They must NOT be flagged.

---

## 7. The OTHER Zone Problem

```r
# Identify what OTHER zone codes appear in flagged rows
pa_res |>
  filter(`Assessed Value` < 20000, `Lot Size` < 20,
         zone_family == "OTHER") |>
  count(Zoning, name = "n_rows") |>
  arrange(desc(n_rows)) |>
  slice_head(n = 20) |>
  print()
```

**Top OTHER codes in flagged rows:**

| Code | n | Likely Meaning |
|---|---|---|
| UW | 9,412 | Urban Warehouse |
| HDR | 9,253 | High Density Residential overlay |
| HA | 8,114 | Highway Arterial |
| CO | 3,465 | Commercial Office |
| CB2 | 2,738 | General Business |
| EZ | 2,101 | Enterprise Zone |
| GVC | 1,828 | (overlay/special zone) |

These are commercial and overlay zones. Residential properties assessed in commercial zones with stall-sized lots and sub-$20K values are credible parking/data contamination.

---

## 8. Parking Rule v3 — Final Proposed Rule

### 8.1 Rule Definition

> **Flag a row as parking if:**
> - `Assessed Value < $20,000` AND
> - `Lot Size < 20 m²` AND
> - `zone_family` is one of: `RA (apartment)`, `DC (direct control)`, `OTHER`

**What this protects:**
- RF5/RF6 medium-density condos (Oliver, Terra Losa) → **kept** — zone_family = RF, excluded
- RSL small-lot single family → **kept** — not in flagged zone families
- NA zone 2025 rows → **kept** — conservative, unknown zone excluded from flag
- RA/DC tower parking stalls → **removed**
- Commercial zone OTHER tiny-lot low-value rows → **removed**

### 8.2 Implementation

```r
# ============================================================
# PARKING RULE v3 — historical dataset
# Validated logic: value + lot size + non-residential zone
# ============================================================

pa_res <- pa_res |>
  mutate(is_parking_hist =
    `Assessed Value` < 20000 &
    `Lot Size` < 20 &
    zone_family %in% c("RA (apartment)",
                       "DC (direct control)",
                       "OTHER")
  )

# Diagnostic
cat("--- Parking Rule v3 ---\n")
pa_res |>
  summarise(
    total    = n(),
    flagged  = sum(is_parking_hist, na.rm = TRUE),
    pct      = scales::percent(mean(is_parking_hist, na.rm = TRUE), 0.01)
  ) |>
  print()

# Zone breakdown of what gets flagged
pa_res |>
  filter(is_parking_hist) |>
  count(zone_family, `Assessment Year`, name = "n_rows") |>
  arrange(zone_family, `Assessment Year`) |>
  print(n = Inf)

# Neighbourhood check — should be downtown/inner city tower locations
pa_res |>
  filter(is_parking_hist) |>
  count(Neighbourhood, name = "n") |>
  arrange(desc(n)) |>
  slice_head(n = 15) |>
  print()

# Apply removal
pa_res_clean <- pa_res |>
  filter(!is_parking_hist) |>
  select(-is_parking_hist, -zone_family)   # drop helper columns

cat("\nRows before parking removal: ", format(nrow(pa_res),       big.mark = ","), "\n")
cat("Rows after parking removal:  ", format(nrow(pa_res_clean),  big.mark = ","), "\n")
cat("Rows removed:                ", format(nrow(pa_res) - nrow(pa_res_clean), big.mark = ","), "\n")

pa_res <- pa_res_clean
rm(pa_res_clean)
```

### 8.3 Acceptance Threshold

The project stopping threshold for residual contamination is **≤ 1%** (established in Layer 1a validation). Run the residual check after removal:

```r
# Residual contamination check post-removal
pa_res |>
  summarise(
    total         = n(),
    under_1k      = sum(`Assessed Value` < 1000,  na.rm = TRUE),
    under_5k      = sum(`Assessed Value` < 5000,  na.rm = TRUE),
    under_10k     = sum(`Assessed Value` < 10000, na.rm = TRUE),
    pct_under_1k  = scales::percent(mean(`Assessed Value` < 1000,  na.rm = TRUE), 0.001),
    pct_under_5k  = scales::percent(mean(`Assessed Value` < 5000,  na.rm = TRUE), 0.001),
    pct_under_10k = scales::percent(mean(`Assessed Value` < 10000, na.rm = TRUE), 0.001)
  ) |>
  print()
```

If `pct_under_1k` is below 1%, the historical dataset ships without further parking filtering.

---

## 9. Rule Comparison Summary

| Rule | Dataset | F1 | Status | Notes |
|---|---|---|---|---|
| Coordinate ≥ 3 (original) | Single-year 2026 | 0.989 | ✅ Production | Validated against 2023 oracle |
| Coordinate ≥ 3 | Historical 2012–2025 | N/A | ❌ Broken | Year repetition inflates counts; 89% over-flag |
| Value < $20K + Lot < 20 m² | Historical | N/A | ❌ Partial | Flags legitimate RF5/RF6 condos |
| **Value < $20K + Lot < 20 m² + RA/DC/OTHER zone** | Historical | pending | 🔲 Proposed v3 | Excludes RF condo false positives |

---

## 10. Open Items

- [ ] Run v3 rule and confirm neighbourhood output is downtown/inner-city tower locations
- [ ] Run residual contamination check — confirm below ≤ 1% stopping threshold
- [ ] Confirm 2024 row count anomaly is solely explained by bylaw transition (not data dropout)
- [ ] Document 2025 NA zone rows (144,338) as known data quality gap in `REFRESH_NOTES.md`
- [ ] Decide whether DC zone subsets (residential DC vs commercial DC) warrant further splitting

---

*Document maintained by Kaustubh Chati. Reviewed by Olivia (QA gate) before merge.*
