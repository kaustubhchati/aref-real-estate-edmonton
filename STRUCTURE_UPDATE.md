# Structure Update — Site Re-Cataloguing & Build Order

> **Status:** committed taxonomy, sequenced build plan.
> **Author:** Kaustubh Chati · **QA gate:** Olivia · **Approval gate:** Prof. Huang
> **Date:** 2026-06-15 (MDT)
> **Scope:** integrates new & historical Edmonton Open Data into the section taxonomy.

This file documents (1) the committed section tree and (2) the build order derived from it.
It is the source of truth for navigation structure and for sequencing frontend (Claude Code) sessions.

## Division of labour (read first)

- **R pipeline / operator (KC) owns ALL backend.** Literal downloading to local disk, landing files on the proper repo branch, and all processing / filtering / categorizing. Emits CSVs, PMTiles inputs, and `manifest.json`. **Socrata API access lives here and ONLY here.**
- **Claude Code is frontend-only.** It never downloads data, never calls the Socrata API, never sees a dataset ID. It wires React / MapLibre / PMTiles against artifacts the R pipeline has **already produced and committed**, addressed by their committed file paths / R2 keys.
- **Per-day precondition:** each Claude Code session lists the R outputs that must exist before it starts. If those artifacts are not on the branch, the frontend session does not begin.
- **CC directives are flat:** one concern per session, no investigation, verified before moving on.

---

## 1. Section tree

Organizing axis: **nature of the data** — stock / flow / liveability / economy / summary.
Extends the existing nav; does not invent a new taxonomy.

```
Data Collection
├─ Properties & Land            STOCK (current + regulatory)
│   ├─ Properties               → neighbourhood-ID choropleth
│   ├─ Property Assessment      → neighbourhood-ID choropleth   [SHIPPED]
│   └─ Zoning                   → neighbourhood choropleth (NOT base toggle, NOT parcel lookup)
├─ Activity                     FLOW (change over time)
│   ├─ Dwelling Units           → per-year point surface (Added/Demolished)
│   ├─ Construction & Improvement → per-year point surface (existing permits pipeline)
│   └─ Land Transfers           → per-year surface / time series
├─ Amenities                    LIVEABILITY (point/line MapViews + optional density)
│   ├─ Public School            → EPSB catchment polygons + school points
│   ├─ Public Transportation    → bus stops + LRT (points)
│   ├─ Parks                    → polygons
│   ├─ Playgrounds              → points
│   ├─ Recreation Facilities    → points
│   ├─ Bike Routes              → lines
│   ├─ EV Charging              → points
│   └─ Vegetation               → points/polygons
├─ Economy                      ECONOMY (choropleth + table)
│   ├─ Business Counts          → Edmonton Business Census → neighbourhood choropleth
│   ├─ Business Licences        → registry (delivery TBD)
│   └─ Salary Ranges            → TABLE, city-wide municipal bands (NOT resident income)
└─ Neighbourhood Report Card    PARKED (synthesis view; map + functionality unresolved)

Base reference layers (cross-cutting in-map TOGGLES, not nav items):
  └─ Road Network (priority), Speed Zones, Neighbourhood boundaries   → shared PMTiles on R2
```

Utility nav unchanged: Home · Data Collection · Download · Research Competition · About Us · Feedback.

---

## 2. Locked decisions

- **Axis:** nature-based (stock / flow / liveability / economy / summary), extending the existing nav.
- **Property cluster collapse:** original 4 menus (Properties & Assessment, Building Activity, Real Estate Market Activity, standalone Zoning) → 2 menus (Properties & Land, Activity) on a stock-vs-flow line.
- **Zoning:** neighbourhood choropleth under Properties & Land. NOT a base toggle, NOT parcel-level zone lookup.
- **Salary Ranges:** stays a table — city-wide municipal salary bands, explicitly framed as *not* resident income. No map chrome (no year/neighbourhood filter).
- **Business Counts:** source-and-geography **migration**, not a refresh.
  - Old dashboard = StatCan Business Register, **Census-Tract** level.
  - Replacement = Edmonton Business Census, **neighbourhood** level via native Neighbourhood Number.
  - **Ships with a provenance note:** source + geography changed; old CT numbers will not reconcile.
- **Amenities:** crime + air quality removed (placeholders, no data path); replaced with validated Open Data layers.

## 3. Open / deferred

- **Neighbourhood Report Card** — section design parked. Map vs. table, and switchable-metric vs. composite-score, both unresolved. Build last (synthesizes all prior sections).
- **Inner category breakdowns** — NAICS sector splits, business-size bands, per-dataset analysis of new Amenities sources. Deferred. Precedent: old dashboard's 2-digit NAICS dropdown (~20 sectors).
- **Amenities sub-grouping** — 8 children may later want mobility / green-recreation / services split. Not urgent.
- **Zoning metric** — gating decision: predominant zone (categorical) vs. % residential-zoned land (continuous). Recommendation: % residential (legend consistency with Assessment gradient).
- **Land Transfers** — source granularity to confirm (R side).

---

## 4. Load assessment

Load = backend processing/analysis cost in the R pipeline (download + filter + join + categorize). It sequences the work; it is not frontend effort.

| Dataset | Geometry | Load | Reason |
|---|---|---|---|
| Property Assessment | polygon agg | **LOW** | Shipped; native nbhd-ID join |
| Properties | polygon agg | **LOW** | Same pipeline + render as Assessment |
| Construction & Improvement | points/yr | **LOW** | Existing permits pipeline |
| Dwelling Units | points/yr | **LOW** | Same General Building Permits source |
| Business Counts (Census) | point + agg | **MED** | Native nbhd key, but source+geography migration |
| Bus stops / LRT | points | **MED** | New point layer; tile large stop set |
| Parks / Playgrounds / Rec / EV / Vegetation | pts/poly | **MED** | New layers; spatial join for density |
| Bike Routes | lines | **MED** | New line layer |
| EPSB Schools | polygon + pt | **MED** | Catchment polygons (history appended) + points |
| Land Transfers | agg/series | **MED** | Source granularity TBD |
| Road Network (base) | lines | **MED** | Priority base layer; city-wide WGS84, tile to R2 |
| Zoning | polygon → agg | **HIGH** | Derivation metric needed (polygons cross nbhd lines) |
| Salary Ranges | none | **HIGH** | Non-spatial; framing risk, not build effort |
| Neighbourhood Report Card | agg | **HIGH** | Open methodology + QA gate |

---

## 5. Build order

Ordered by backend processing load, not nav position. Each day = effort unit, not calendar mandate.
Every day splits into **R / operator (KC)** — the backend that must land on the branch first — and **Claude Code (frontend only)** — wiring that consumes those committed artifacts.

> **Convention:** Claude Code directives begin with "These artifacts exist; wire them." CC never fetches, never names a dataset ID. If the listed handoff artifacts are not on the branch, the CC session does not start.

### Day 1 — Foundation + Properties stock · LOW

**R / operator (KC)**
- Download Neighbourhoods boundary; land on the proper branch as the canonical join geometry (~406 polygons). Key = numeric Neighbourhood ID (ID-join, not name).
- Run Properties aggregates through the Assessment template; emit per-neighbourhood CSV.
- Emit / extend `manifest.json` for year auto-discovery. No year literals.

**Handoff artifacts → CC**
- `manifest.json`
- Properties neighbourhood-aggregate CSV (Assessment-shaped)
- neighbourhood boundary geometry (committed path / R2)

**Claude Code (frontend only)**
- These artifacts exist; wire them. Build Properties & Land menu shell (3 children).
- Mount Properties + Property Assessment on the existing choropleth MapView.
- Year selector + coverage surface read from `manifest.json`.

**Gate:** Olivia verifies Properties choropleth vs. Assessment QA (N<100 + 10% divergence suppression).

### Day 2 — Activity via permits pipeline · LOW

**R / operator (KC)**
- Confirm Dwelling Units + Construction & Improvement both derive from General Building Permits; emit per-(year, category) counts.
- Generate PMTiles point tiles: `-r1 --no-tile-size-limit --no-feature-limit` (never `--drop-densest-as-needed`). Upload to R2.
- Verify each PMTiles via `curl` range request (expect HTTP 206).

**Handoff artifacts → CC**
- Dwelling Units PMTiles (R2 key) + per-(year, category) counts CSV
- Construction & Improvement PMTiles (R2 key) + counts CSV

**Claude Code (frontend only)**
- These tiles + counts exist on R2/branch; wire them. Build Activity menu.
- Mount both as sectional point MapViews (own point-mount, NOT shared GeoJSON MapView).
- Per-year coverage surface + legend (swatches + dot-size) + click popups, mirroring Building Permits.
- Land Transfers deferred to Day 6.

**Gate:** range-request (206) verification is an R-side precondition, done before the CC session.

### Day 3 — Base layers (Road Network priority) · MED

**R / operator (KC)**
- Download Road Network; confirm single-line WGS84 + size; generate PMTiles with `-r1` flags; upload to R2.
- Download + tile Speed Zones (lines) to R2. Confirm neighbourhood boundary layer is available as a shared source.

**Handoff artifacts → CC**
- Road Network PMTiles (R2 key)
- Speed Zones PMTiles (R2 key)
- neighbourhood boundaries (shared source)

**Claude Code (frontend only)**
- These tiles exist on R2; wire them as in-map base-layer TOGGLES across sections — NOT nav items.
- Tile-once-mount-many: each sectional MapView imports the same R2 PMTiles URL.

**Note (R side):** Pages 25 MiB per-file cap applies to anything bundled into the build — dense layers tile to R2, never inline GeoJSON.

### Day 4 — Amenities batch 1 (raw layers) · MED

**R / operator (KC)**
- Download + tile Parks (polygons), Bike Routes (lines), Playgrounds, Recreation Facilities, EV Charging, Vegetation (points) as standalone PMTiles on R2.
- Raw geometry only; defer per-neighbourhood density to Day 7.

**Handoff artifacts → CC**
- One PMTiles R2 key per dataset (6 layers)

**Claude Code (frontend only)**
- These tiles exist on R2; wire them. Build Amenities menu (crime + air quality removed).
- Each dataset = own sectional point/line MapView (popups + legend).
- Public Transportation (bus stops + LRT) as point layers (tiles supplied by R side).

**Watch:** 8 children in one dropdown — note future mobility/green-recreation/services split; do not build yet.

### Day 5 — EPSB + Census points · MED

**R / operator (KC)**
- Download EPSB; tile catchment POLYGONS (history appended over years) + school POINTS as two layers → R2.
- Download Business Census (point detail: lat/long, Sectors, NAICS, Business Size, Neighbourhood Number); tile as points → R2.

**Handoff artifacts → CC**
- EPSB catchment-polygons PMTiles + school-points PMTiles (R2 keys)
- Business Census points PMTiles (R2 key)

**Claude Code (frontend only)**
- These tiles exist on R2; wire them. Public School: catchment polygons + school points overlay.
- Economy menu shell; Business Census points as sectional MapView (popups: name / sector / size).

**Gate:** confirm "Business Counts" = Census aggregate (Census is the engine behind Counts, not a separate sibling). R side owns the aggregate; CC consumes it Day 6.

### Day 6 — Economy choropleth (migration) + Land Transfers + Salary · HIGH

**R / operator (KC)**
- Aggregate Business Census to neighbourhood on native Neighbourhood Number; emit total-count choropleth CSV (sector/size breakdowns deferred).
- Resolve Land Transfers granularity; emit per-year surface / time-series feed.
- Emit Salary Ranges as a flat table CSV (no spatial fields).

**Handoff artifacts → CC**
- Business Counts neighbourhood-aggregate CSV (+ provenance note text)
- Land Transfers feed (CSV / per-year)
- Salary Ranges flat table CSV

**Claude Code (frontend only)**
- These files exist; wire them. Business Counts choropleth on neighbourhood geometry **+ visible PROVENANCE NOTE**: source changed (Edmonton Open Data, not StatCan), geography changed (neighbourhood, not Census Tract), old CT numbers won't reconcile.
- Salary Ranges as labelled table tab inside Economy: "City of Edmonton municipal salary bands, city-wide, not resident income." No map chrome.

**Gate:** Olivia reviews migration provenance note (R-authored) before ship — same discipline as Layer 2 "won't match 2023 Stata outputs" caveat.

### Day 7 — Zoning derivation + optional amenity densities · HIGH

**R / operator (KC)**
- **Decide Zoning metric (gating call):** predominant zone (categorical) vs. % residential-zoned land (continuous). Rec: % residential.
- Download zoning polygons; spatial-join → neighbourhood boundaries; compute chosen metric deterministically; document numerator for QA. Emit zoning choropleth CSV.
- Optional: spatial-join amenity points (stops / playgrounds / rec / EV / parks area %) → neighbourhoods; emit density CSVs.

**Handoff artifacts → CC**
- Zoning neighbourhood-metric CSV (+ legend type implied by metric)
- Optional amenity-density CSVs

**Claude Code (frontend only)**
- These files exist; wire them. Zoning choropleth under Properties & Land (legend type matches the supplied metric).
- Optional amenity-density choropleths alongside Day 4 raw layers.

**Gate:** Olivia signs off on the zoning derivation method (R-side definition) before merge — first metric needing a documented definition.

### Day 8 — Neighbourhood Report Card (PARKED) · HIGH

**Decision required first (KC + Olivia)**
- Switchable single metric (cheap, honest, every colour = one real number) — recommended launch form; OR
- Composite score (hero view; needs documented weighting + normalization, survives N<100 / divergence gates, Olivia sign-off).

**R / operator (KC) — once decided**
- Switchable: emit the existing neighbourhood aggregates behind a single selector schema.
- Composite: implement + document weighting as a versioned contract; emit score CSV.

**Handoff artifacts → CC**
- Report Card metric/score CSV(s) + selector schema

**Claude Code (frontend only)**
- These files exist; wire them. Report Card map + table side-by-side, reusing the switchable-choropleth pattern from Economy (Day 6).

**Rationale:** synthesizes Days 1–7 → must come last; earlier means colouring by metrics that don't exist yet.

---

## 6. Day-by-day summary

| Day | Focus | Load | R / operator owns | CC (frontend) wires | Gate / risk |
|---|---|---|---|---|---|
| 1 | Foundation + Properties stock | LOW | boundary + Properties CSV + manifest | menu shell + choropleth mount | Join geometry + manifest |
| 2 | Activity via permits pipeline | LOW | permits PMTiles + counts (R2) | Activity point MapViews | Range-request (206) check |
| 3 | Base layers (Road Network) | MED | Road/Speed PMTiles (R2) | base-layer toggles | Tile-once reuse; 25 MiB cap |
| 4 | Amenities batch 1 (raw layers) | MED | 6 layer PMTiles (R2) | sectional point/line MapViews | Dropdown crowding |
| 5 | EPSB + Census points | MED | EPSB + Census points PMTiles (R2) | Public School + Census points | Counts = Census aggregate |
| 6 | Economy choropleth + Salary | HIGH | Census aggregate + Salary CSVs | choropleth + table tab | Migration provenance note |
| 7 | Zoning derivation + densities | HIGH | zoning + density CSVs | zoning + density choropleths | Metric definition sign-off |
| 8 | Report Card (parked) | HIGH | score/metric CSVs (post-decision) | map + table | Methodology unresolved |

---

## 7. Invariants (hold across every day)

- **Backend/frontend boundary:** R pipeline owns all data (download, process, tile, emit). Claude Code is frontend-only and consumes committed artifacts by path / R2 key — never fetches, never sees a dataset ID.
- **Refresh-by-design:** one operator-triggered refresh handles a new year end-to-end; frontend auto-discovers years from `manifest.json` — no year literals.
- **Join on ID, not name:** Neighbourhood ID (numeric); display-label overrides separate (e.g. Oliver → Wîhkwêntôwin, same ID 1151).
- **Tiles live on R2:** Cloudflare Pages does not serve range requests; tippecanoe `-r1 --no-tile-size-limit --no-feature-limit`. Tiling is an R-side step.
- **Sectional MapView:** point/line datasets get their own point-mount; do NOT extend the shared GeoJSON MapView.
- **One concern per commit:** verified before moving on; human-gated promotion through Olivia.
- **Methodology boundary:** confidential xlsx is a validation oracle only — never runs in production.

---

## 8. Dataset reference (R / operator side only)

> **Claude Code never uses this table.** Socrata IDs belong to the R download step. CC consumes only the emitted files (CSV / PMTiles), addressed by committed path or R2 key. IDs are listed here as operator reference for the R pipeline.

| Dataset | ID | Notes |
|---|---|---|
| Neighbourhoods | `65fr-66s6` | Join geometry, ~406 polygons |
| Road Network | `9j8t-zm52` | Priority base layer; single-line WGS84 |
| Speed Zones | `6e78-2mje` | Base line layer |
| Zoning Bylaw | `ruwn-htv8` | Polygons → derive nbhd metric |
| Dwelling Units / Construction | General Building Permits | Existing pipeline |
| EPSB Schools | `kicz-beax` | Catchment polygons + points |
| Bus stops (GTFS) | `4vt2-8zrq` | Large point set; tile |
| LRT | `fhxi-cnhe` | Points |
| Parks | `ex66-ku6s` | Polygons |
| Playgrounds | `g57c-ph4j` | Points |
| Recreation Facilities | `kab2-3f3p` | Points |
| Bike Routes | `2bqu-nck6` | Lines |
| EV Charging | `rg5m-e4tk` | Points |
| Vegetation | `pmka-uf4n` | Points/polygons |
| Business Census | `8c4b-u4a4` | Point + native Neighbourhood Number |
| Business Census Nbhd Aggregation | `wh44-4bkz` | Pre-aggregated alternative |
| Salary Ranges | `q683-6mqe` | Non-spatial table |
| Transit Ridership | `wj6v-epas` | Non-spatial; not in current plan |

> Confirm exact Socrata IDs and field lists against `data.edmonton.ca` before ingestion — some datasets have near-duplicates on the portal.
