# Structure Update — Site Re-Cataloguing & Build Order

> **Status:** committed taxonomy, sequenced build plan.
> **Author:** Kaustubh Chati · **QA gate:** Olivia · **Approval gate:** Prof. Huang
> **Date:** 2026-06-15 (MDT)
> **Scope:** integrates new & historical Edmonton Open Data into the section taxonomy.

This file documents (1) the committed section tree and (2) the build order derived from it.
It is the source of truth for navigation structure and for sequencing Claude Code sessions.

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
  - Replacement = Edmonton Business Census (`8c4b-u4a4`), **neighbourhood** level via native Neighbourhood Number.
  - **Ships with a provenance note:** source + geography changed; old CT numbers will not reconcile.
- **Amenities:** crime + air quality removed (placeholders, no data path); replaced with validated Open Data layers.

## 3. Open / deferred

- **Neighbourhood Report Card** — section design parked. Map vs. table, and switchable-metric vs. composite-score, both unresolved. Build last (synthesizes all prior sections).
- **Inner category breakdowns** — NAICS sector splits, business-size bands, per-dataset analysis of new Amenities sources. Deferred. Precedent: old dashboard's 2-digit NAICS dropdown (~20 sectors).
- **Amenities sub-grouping** — 8 children may later want mobility / green-recreation / services split. Not urgent.
- **Zoning metric** — gating decision: predominant zone (categorical) vs. % residential-zoned land (continuous). Recommendation: % residential (legend consistency with Assessment gradient).
- **Land Transfers** — source granularity to confirm.

---

## 4. Load assessment

| Dataset | Geometry | Load | Reason |
|---|---|---|---|
| Property Assessment | polygon agg | **LOW** | Shipped; native nbhd-ID join |
| Properties | polygon agg | **LOW** | Same pipeline + render as Assessment |
| Construction & Improvement | points/yr | **LOW** | Existing permits pipeline |
| Dwelling Units | points/yr | **LOW** | Same General Building Permits source |
| Business Counts (Census) | point + agg | **MED** | Native nbhd key, but source+geography migration |
| Bus stops / LRT | points | **MED** | New point MapView; tile large stop set |
| Parks / Playgrounds / Rec / EV / Vegetation | pts/poly | **MED** | New layers; spatial join for density |
| Bike Routes | lines | **MED** | New line MapView |
| EPSB Schools | polygon + pt | **MED** | Catchment polygons (history appended) + points |
| Land Transfers | agg/series | **MED** | Source granularity TBD |
| Road Network (base) | lines | **MED** | Priority base layer; city-wide WGS84, tile to R2 |
| Zoning | polygon → agg | **HIGH** | Derivation metric needed (polygons cross nbhd lines) |
| Salary Ranges | none | **HIGH** | Non-spatial; framing risk, not build effort |
| Neighbourhood Report Card | agg | **HIGH** | Open methodology + QA gate |

---

## 5. Build order

Ordered by processing load, not nav position. Each day = effort unit, not calendar mandate.
Each Claude Code session is **one concern**, flat directives, verified before moving on.

### Day 1 — Foundation + Properties stock · LOW
**Backend (R)**
- Load Neighbourhoods (`65fr-66s6`, ~406 polygons) as canonical join geometry; key = numeric Neighbourhood ID (ID-join, not name).
- Extend `manifest.json` for year auto-discovery; no year literals.
- Run Properties aggregates through the Assessment template.

**Frontend (React/MapLibre)**
- Properties & Land menu shell (3 children); wire Properties + Property Assessment to existing choropleth MapView.
- Year selector + coverage surface read from `manifest.json`.

**Gate:** Olivia verifies Properties choropleth vs. Assessment QA (N<100 + 10% divergence suppression).

### Day 2 — Activity via permits pipeline · LOW
**Backend**
- Confirm Dwelling Units + Construction & Improvement both derive from General Building Permits; emit per-(year, category) counts.
- Tile as PMTiles point sources: `-r1 --no-tile-size-limit --no-feature-limit` (never `--drop-densest-as-needed`). Stage on R2.

**Frontend**
- Activity menu; mount both as sectional point MapViews (own point-mount, NOT shared GeoJSON MapView).
- Per-year coverage surface + legend (swatches + dot-size) + click popups, mirroring Building Permits.
- Park Land Transfers → Day 6.

**Gate:** verify PMTiles via `curl` range request (expect HTTP 206) before frontend wiring.

### Day 3 — Base layers (Road Network priority) · MED
**Backend**
- Read Socrata metadata for Road Network (`9j8t-zm52`); confirm single-line WGS84 + size; tile to R2 with `-r1` flags.
- Tile Speed Zones (lines); confirm neighbourhood boundary layer is a shared source.

**Frontend**
- Base layers as in-map toggles across sections — NOT nav items.
- Tile-once-mount-many: each sectional MapView imports the same R2 PMTiles URL.

**Note:** Pages 25 MiB per-file cap applies to anything bundled into the build — dense layers tile to R2, never inline GeoJSON.

### Day 4 — Amenities batch 1 (raw layers) · MED
**Backend**
- Tile Parks (polygons), Bike Routes (lines), Playgrounds, Recreation Facilities, EV Charging, Vegetation (points) as standalone PMTiles on R2.
- Raw geometry only; defer per-neighbourhood density to Day 7.

**Frontend**
- Amenities menu (crime + air quality removed); each dataset = own sectional point/line MapView (popups + legend).
- Public Transportation (bus stops + LRT) as point layers.

**Watch:** 8 children in one dropdown — note future mobility/green-recreation/services split; do not build yet.

### Day 5 — EPSB + Census points · MED
**Backend**
- EPSB (`kicz-beax`): tile catchment POLYGONS (history appended over years) + school POINTS as two layers.
- Business Census (`8c4b-u4a4`): load point detail (lat/long, Sectors, NAICS, Business Size, Neighbourhood Number); tile as points.

**Frontend**
- Public School: catchment polygons + school points overlay.
- Economy menu shell; Business Census points as sectional MapView (popups: name / sector / size).

**Gate:** confirm "Business Counts" = Census aggregate (Census is the engine behind Counts, not a separate sibling).

### Day 6 — Economy choropleth (migration) + Land Transfers + Salary · HIGH
**Backend**
- Aggregate Business Census to neighbourhood on native Neighbourhood Number; total-count choropleth surface (sector/size breakdowns deferred).
- Resolve Land Transfers granularity; build per-year surface / time-series feed.
- Salary Ranges as flat table feed (no map chrome).

**Frontend**
- Business Counts choropleth on neighbourhood geometry **+ visible PROVENANCE NOTE**: source changed (Edmonton Open Data, not StatCan), geography changed (neighbourhood, not Census Tract), old CT numbers won't reconcile.
- Salary Ranges as labelled table tab inside Economy: "City of Edmonton municipal salary bands, city-wide, not resident income."

**Gate:** Olivia reviews migration provenance note before ship (same discipline as Layer 2 "won't match 2023 Stata outputs" caveat).

### Day 7 — Zoning derivation + optional amenity densities · HIGH
**Backend**
- **Decide Zoning metric (gating call):** predominant zone (categorical) vs. % residential-zoned land (continuous). Rec: % residential.
- Spatial-join zoning polygons → neighbourhood boundaries; compute chosen metric deterministically; document numerator for QA.
- Optional: spatial-join amenity points (stops / playgrounds / rec / EV / parks area %) → neighbourhoods for density choropleths.

**Frontend**
- Zoning choropleth under Properties & Land (legend type matches chosen metric).
- Optional amenity-density choropleths alongside Day 4 raw layers.

**Gate:** Olivia signs off on zoning derivation method before merge (first metric needing a documented definition).

### Day 8 — Neighbourhood Report Card (PARKED) · HIGH
**Decision required first**
- Switchable single metric (cheap, honest, every colour = one real number) — recommended launch form; OR
- Composite score (hero view; needs documented weighting + normalization, survives N<100 / divergence gates, Olivia sign-off).

**Backend (once decided)**
- Switchable: expose existing neighbourhood aggregates behind one selector.
- Composite: implement + document weighting as a versioned contract.

**Frontend**
- Report Card map + table side-by-side, reusing the switchable-choropleth pattern from Economy (Day 6).

**Rationale:** synthesizes Days 1–7 → must come last; earlier means colouring by metrics that don't exist yet.

---

## 6. Day-by-day summary

| Day | Focus | Load | Gate / risk |
|---|---|---|---|
| 1 | Foundation + Properties stock | LOW | Join geometry + manifest |
| 2 | Activity via permits pipeline | LOW | Range-request (206) check |
| 3 | Base layers (Road Network) | MED | Tile-once reuse; 25 MiB cap |
| 4 | Amenities batch 1 (raw layers) | MED | Dropdown crowding |
| 5 | EPSB + Census points | MED | Counts = Census aggregate |
| 6 | Economy choropleth + Salary | HIGH | Migration provenance note |
| 7 | Zoning derivation + densities | HIGH | Metric definition sign-off |
| 8 | Report Card (parked) | HIGH | Methodology unresolved |

---

## 7. Invariants (hold across every day)

- **Refresh-by-design:** one operator-triggered refresh handles a new year end-to-end; frontend auto-discovers years from `manifest.json` — no year literals.
- **Join on ID, not name:** Neighbourhood ID (numeric); display-label overrides separate (e.g. Oliver → Wîhkwêntôwin, same ID 1151).
- **Tiles live on R2:** Cloudflare Pages does not serve range requests; tippecanoe `-r1 --no-tile-size-limit --no-feature-limit`.
- **Sectional MapView:** point/line datasets get their own point-mount; do NOT extend the shared GeoJSON MapView.
- **One concern per commit:** verified before moving on; human-gated promotion through Olivia.
- **Methodology boundary:** confidential xlsx is a validation oracle only — never runs in production.

---

## 8. Dataset reference (Socrata IDs)

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
