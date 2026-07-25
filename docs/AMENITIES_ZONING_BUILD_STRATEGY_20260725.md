# Amenities + Zoning — Source Recon and Build Strategy

**Date:** 2026-07-25
**Author:** CC session (recon + strategy), for KC's ratification
**Readers:** KC (builder), Olivia (verifier), Prof. Huang (approval)
**Status:** Proposal. Every architecture choice below is a **recommendation awaiting KC's ruling**
(the numbered decisions are in §10). No code was written and no pipeline/frontend/data file was
touched to produce this document. Recon downloads lived in `/tmp` and were deleted at session end.

> **What this is.** A build plan for two still-empty nav groupings — **Amenities** (the live-site
> leaves Air Quality · Community Services · Crime · Public School · Public Transportation) and
> **Zoning** (one leaf under Properties & Land) — grounded in **measured facts** about 17 named
> Edmonton Open Data sources, not in the "mostly spots and polygons to plot straight up" assumption
> the backlog was framed from. Where the measured facts contradict that framing, they are stated
> plainly and early (§0). The recon exists to be told it was wrong.

---

## §0. Five measured facts that contradict the framing this backlog was written from

Read these first — they reshape the whole plan.

1. **8 of the 17 listed IDs are Socrata *visualization lenses*, not data.** They carry zero own
   columns (`displayType: visualization_canvas_map`), export a 53-byte empty shell, and their
   `rows.csv` is empty. The real data lives in the lens's `modifyingViewUid` **parent**. **The
   pipeline registry must record the parent id, never the portal-listed id.** Rule:
   `displayType == visualization_canvas_map` → follow `modifyingViewUid`. The lens→parent map is in
   §1. This is the single biggest operational finding and it is invisible from the portal URLs the
   source list was built from.

2. **The Building Permits point map is NOT the only point precedent — and it is the *wrong* one to
   copy.** The repo already ships a **Business Census POINT map** (`website/src/content/economy/`,
   `businessCensusPointsStyle.js` + `BusinessCensusSection.jsx`, wired 2026-07-23): a **static,
   single-file, categorical-colour, no-year-axis, no-value-tier** point map — structurally almost
   exactly "plot N points, colour by a category field, click for detail." BP's map is the *most*
   BP-coupled (year slider, `construction_value` size-tiers, value-honesty null exclusion,
   heatmap-at-overview, year cross-fade) and inherits almost nothing an amenity inventory wants.
   **Ratified with KC: the pilot forks the Business Census points map, not BP.**

3. **"Public Schools" (A6) is School *Catchment Areas* — polygons, not school point locations** —
   and 14% (37/259) carry null geometry. **Accepted by KC as a polygon map layer** (catchment
   boundaries), not killed. It is not "plot the schools"; a school-*points* dataset is not in this
   list.

4. **Two "amenities" are not maps at all, and one spatial layer is over the cap:** Salary Ranges
   (A5) and Transit Ridership (A13) have no geometry; ETS GTFS Trips (A1b) is 56,812 route
   polylines at 250 MB+ (10× the Cloudflare Pages cap) and redundant. All three are removed from
   the map plan (§2).

5. **`fetch_socrata_snapshot()` needs no change — the CSV export carries WKT geometry.** Measured
   on the Zoning parent: `.../rows.csv?accessType=DOWNLOAD` returns `…,geometry_multipolygon` with
   cells like `MULTIPOLYGON(((-113.5908 53.5035, …)))`. So the existing helper feeds
   point/line/polygon pipelines unchanged (WKT → `sf` → GeoJSON) **as long as it is pointed at the
   parent data id.** No geospatial second mode is required. This closes must-answer #4 without a
   shared-code change.

---

## §1. Source inventory (measured facts, no opinions)

**Method (recon-only, not a sanctioned production pattern).** For each id: `api/views/<id>.json`
metadata; follow `modifyingViewUid` to the data-bearing parent where the listed id is a lens;
`resource/<data_id>.json?$select=count(*)` for the count; `resource/<data_id>.geojson?$limit=N` for
the full served GeoJSON (measured raw, then re-serialized at 6-dp coordinates and geometry-only);
`resource/<data_id>.csv?$limit=1` and the production `api/views/<data_id>/rows.csv?accessType=DOWNLOAD`
header to confirm CSV-borne WKT. Everything downloaded to `/tmp`, measured, deleted same session.
**This carve-out does not amend `CLAUDE.md` §4.8: every production fetch still goes through
`fetch_socrata_snapshot()`.** CRS as served = **EPSG:4326 / WGS84** (Socrata GeoJSON/CRS84) for
every source. Licence for all 17 = **"See Terms of Use"** = Open Government Licence – City of
Edmonton (the licence `DESIGN_SYSTEM.md` §6 already names).

### 1a. Spatial sources (map candidates) — sizes in MB (raw / 6-dp-thinned / geometry-only); cap = 25 MiB

| # | Source (data name) | Listed → **data id** | Geometry | Features | raw/thin/geom | Category axis (distinct) | Nbhd ID join | Null geom | City-updated |
|---|---|---|---|---|---|---|---|---|---|
| A1 | ETS Bus Stops | `4vt2-8zrq` (primary) | Point | 6,882 | 2.2 / 2.2 / 0.66 | `location_type`(4), `zone_id`(8) | no | 0 | 2026-04-20 |
| A2 | LRT Stations & Stops | `fhxi-cnhe` (primary) | Point | 54 | 0.02 / 0.01 | (small; by line if present) | no | 0 | 2026-06-28 |
| A3 | Police Stations | `e7aq-scxv` (primary) | Point | 10 | <0.01 | `name`/`address` | no | 0 | 2024-06-28 |
| A8 | Playgrounds | `g57c-ph4j` → **`9nqb-w48x`** | Point | 659 | 0.44 / 0.43 / 0.06 | `user_category`(6), `surface_type`(11), `accessibility`(2) | **yes** (`neighbourhood_id`+`_name`) | 0 | 2026-07-20 |
| A9 | EV Charging Stations | `rg5m-e4tk` → **`xzhy-xe8z`** | Point | 173 | 0.12 | `ev_network`(10), `status`(3), `ev_connector_types`(8) | no | 0 | 2026-03-04 |
| A11 | Recreation Facilities | `kab2-3f3p` → **`nz3t-vyg3`** | Point | 109 | 0.04 | `facility_type`(11), `category`(3) | no | 0 | 2026-07-25 |
| A12 | Spray Parks | `jyra-si4k` (primary) | Point | 77 | 0.05 | `surface_type`(3), `accessibility`(2) | **yes** (`neighbourhood_id`+`_name`) | 0 | 2026-07-20 |
| A14 | Track Sports Fields | `ykrg-bwt7` (primary) | Point | 14 | 0.01 | (name only) | no | 0 | 2025-03-28 |
| A10 | Parks | `ex66-ku6s` → **`gdd9-eqv9`** | MultiPolygon (+ lat/long) | 1,195 | 3.47 / 2.21 / 1.94 | `class`(10), `status`(5), `type`(3) | no | 0 | 2026-07-20 |
| A4 | Vegetation Areas | `pmka-uf4n` → **`ct88-r8tk`** | MultiPolygon | 3,145 | 13.2 / 8.2 / 7.6 | `vegetation_type`(7), `owner`(14), `maintainer`(13) | no | 0 | 2026-07-20 |
| A6 | Public Schools = **Catchment Areas** | `kicz-beax` → **`gc4g-ct3z`** | MultiPolygon | 259 | 1.5 / 0.94 | `sch_type`(7), `sector`(10), `grades`(15) | no | **37 (14%)** | 2025-02-13 |
| A7 | Bike Routes | `2bqu-nck6` → **`vd4b-a4iv`** | **MultiLineString** | 10,417 | 7.7 / 5.9 / 3.4 | `classification`(12), `network_classification`(3), `road_segment_type`(9) | no | 0 | 2026-07-20 |
| Z1 | Zoning Bylaw | `ruwn-htv8` → **`fixa-tstc`** | MultiPolygon | 11,516 | 9.1 / 9.1 / 6.2 | **`zoning` = 156 classes**, `description` | no | 0 | 2026-07-20 |
| Z2 | Zoning Overlays | `6w3s-58pv` (primary) | MultiPolygon | 36 | 10.2 / 6.1 | `overlay_code` / `overlay_descr`, `special_area` | no | 0 | 2026-07-20 |

### 1b. Non-spatial / over-cap sources (not map layers)

| # | Source | Data id | Why not a map |
|---|---|---|---|
| A5 | Salary Ranges by Job Title | `q683-6mqe` | No geometry. Columns: `job_title, minimum_annual_salary, maximum_annual_salary` (862 rows). |
| A13 | Transit Ridership | `wj6v-epas` | No geometry. Columns: `period, year, month, month_numeric, total_ridership` (89 rows) — a citywide monthly time series. |
| A1b | ETS GTFS Trips | `ctwr-tvrd` | Spatial (`geometry_line: multiline`) but **56,812 polylines at 250 MB+** (10× cap) and redundant (thousands of trips repeat ~200 route shapes). |

**Cap verdict:** every in-scope map layer fits 25 MiB. Heaviest are Vegetation (13→8), Z2 (10→6),
Z1 (9), Bike Routes (7.7→5.9) — all under cap after thinning. **No dissolve or simplification is
forced by the cap for any layer we keep.** (Simplification is still worth it for browser weight on
the 3k–11k-feature polygon/line layers — a *choice*, not a necessity; §8.)

---

## §2. Triage — every source in exactly one bucket

| Source | Bucket | Measured reason |
|---|---|---|
| A1 Bus Stops, A2 LRT | **MAP** | Point, tiny–moderate. → Public Transportation. |
| A7 Bike Routes | **MAP** | MultiLineString, under cap. → Public Transportation (KC steer: transport incl. bike lanes). |
| A8 Playgrounds, A12 Spray Parks, A11 Recreation Facilities, A14 Track Sports Fields | **MAP** | Point, tiny. → Parks & Recreation. |
| A10 Parks | **MAP** | MultiPolygon (+centroid). → Parks & Recreation. |
| A3 Police Stations | **MAP** | Point (10). → Community Services / Public Safety. |
| A9 EV Charging | **MAP** | Point (173). → Community Services **or** Transportation (§10 D2). |
| A6 School Catchment Areas | **MAP** | MultiPolygon (259). → Public School (KC accepted). Discloses the 14% null-geom gap. |
| A4 Vegetation Areas | **MAP or BASE GEO** | MultiPolygon (3,145). Home is contested (`CLAUDE.md §3` = base geo; source list = amenity) → **ruling owed, §7.4 / §10 D1.** |
| Z1 Zoning Bylaw | **MAP** | MultiPolygon (11,516). → Zoning (Properties & Land). Nominal class fill, not choropleth (§8). |
| Z2 Zoning Overlays | **MAP** | MultiPolygon (36). → Zoning, as a separate stacked-overlay toggle (§8). |
| A5 Salary Ranges | **NOT A MAP / NOT AN AMENITY** | Non-spatial pay table → belongs under **Economy** as a table (confirms `PHASE2_STATUS.md`). |
| A13 Transit Ridership | **NOT A MAP** | Non-spatial time series → a **chart** companion on the Public Transportation page, or Economy. Not a layer. |
| A1b GTFS Trips | **DEFER / NOT A MAP as-is** | Over cap + redundant. The access it represents is already covered by A1 + A2. A dissolved "route-network" line layer is a *possible future*, not this backlog. |

**General test surfaced for BASE GEO vs DATA LAYER (answers §7.4, reusable for future sources):** a
source is **base geo** (→ `pipeline/yeg/shared/`) if its geometry is consumed by *other* sections as
a join/reference substrate and it has no page of its own (the neighbourhood boundary is the type
case). It is a **data layer** (→ its own section) if it is the subject the user came to see. By this
test Vegetation is a **data layer** (nobody joins property assessments to vegetation polygons; a
visitor looks at green space as the thing itself) — recommendation in §10 D1, but the ruling is
KC's. `shared/`'s genuine base-geo backlog (road/vegetation/speed-zone per `PHASE2_STATUS.md`) is a
*different* need (a tonal reference layer under a choropleth), and if that ever ships it reads the
same parent `ct88-r8tk` — one fetch, two consumers, not a duplication.

---

## §3. Build families (bottom-up — grouped by what they demand of the code, not by subject)

Three families cover all 14 kept map layers (13 firmly in-scope + Vegetation A4, whose home is
pending §10 D1). Only the point family has a repo precedent to fork;
**everything else is new component work and is named as such.**

### Family 1 — Static categorical point inventory (8 layers: A1, A2, A3, A8, A9, A11, A12, A14)
- **Demand:** plot points; colour by one nominal category field; click → detail; a swatch legend;
  a currency statement; **no year axis, no value axis.**
- **Precedent:** the **Business Census points map** is this exact shape. Fork its style module
  (`buildColourExpression(domain)` + data-derived domain) and its detail rail. **Not** its legend:
  BC's point-map legend is an interactive **donut-wheel** sector filter (`BusinessCensusLegend.jsx`,
  ~180 lines of SVG donut geometry), not a swatch list — so the amenity swatch legend is genuinely
  new (see ②). The BP point machinery (value tiers, heatmap, year cross-fade, null-exclusion) is
  **not** used.
- **Covered by existing code:** the shared `MapView` (frozen — passes `geojsonUrl`+`layers`+`onLoad`
  exactly as BC points does), `mapCamera`, `basemapStyle`, `assetUrl`, `MapTipsPopover`,
  `SearchInput`, the map-control rail, and the *shape* of `wirePermitInteractions` (a ~40-line
  hover/click→callback recipe, copy-and-rename).
- **New component work (NOT reuse):** ① an `AmenityPointLayer` config binding (parent id · category
  field · colour table · detail fields · filter) — forked from BC but new; ② a **categorical point
  legend** (swatch list) — genuinely new: BC's point legend is a donut-wheel (not forkable to a
  swatch), and the nearest repo precedent is the shared `Legend.jsx` `discrete`/`greyStates` swatch
  mode (used by the choropleths, unused by any point map today); ③ an **amenity detail
  rail** (fork of the BC/BP inforail with amenity field sets); ④ a **category show/hide filter**
  (`["in", ["get", field], …]`) — small but new; ⑤ **overview declutter** for the two dense layers
  (Bus Stops 6,882; and in Family 2 Bike Routes) — zoom-gated `minzoom` or MapLibre clustering
  (`sourceOptions:{cluster:true}` + new cluster layers) — new, and optional for the sparse layers.

### Family 2 — Line inventory (1 layer: A7 Bike Routes)
- **Demand:** render MultiLineString geometry as the subject; colour by `classification` (12);
  a line legend; detail-on-select.
- **Covered by existing code:** MapView mounts a line-geometry source + `line` layer spec unchanged
  (`crossFadeSource` even lists `line-opacity`). That is the *only* reuse.
- **New component work (NOT reuse):** **there is no line-*data* renderer in this codebase.** Every
  existing `type:"line"` is a boundary/outline stroke (neighbourhood outlines, selection highlight)
  — none renders a line *dataset* where the line is the subject. New: ① an `AmenityLineLayer` (line
  layer spec + width/colour-by-class `match`); ② a **line legend** (dash/weight swatches). Line
  detail-on-select reuses the Family-1 interaction shape.

### Family 3 — Categorical (nominal-class) polygon fill (5 layers: A6, A10, A4, Z1, Z2)
- **Demand:** fill a polygon by a *nominal class* (school type, park class, vegetation type, zone
  code, overlay code); a categorical polygon legend; for Zoning, group 156 classes to families (§8).
- **Covered by existing code:** MapView mounts a polygon source + `fill` layer unchanged; the
  fill-layer + `greyStates`/pattern scaffolding *pattern* from the choropleths is a reference.
- **New component work (NOT reuse):** the PA/BP/BC choropleth fills are **continuous**
  (`["interpolate", ["linear"], value, …]`); the only polygon `match` expressions drive
  fill-*pattern*/outline by data-*state* (availability), never a *fill colour* by a data *class*.
  So: ① a `CategoricalPolygonLayer` (`["match", ["get", classField], …]` fill-colour); ② a
  **categorical polygon legend**; ③ Zoning's **family-grouping** (backend crosswalk + guard, §8).
  **Do not describe this as reuse of the choropleth** — the continuous-fill code does not cover
  nominal-class fill.

### Cross-cutting: the consolidated multi-layer map (needed by §4's recommendation)
A thematic page (e.g. Public Transportation = points *and* a line layer) puts **multiple families on
one map**. MapView supports this without edits — the primary layer rides `geojsonUrl`; secondary
layers are added **imperatively in `onLoad`** (`map.addSource`/`addLayer`), which is the established
pattern (BP adds its boundary tint this way; BC adds cluster sources this way). But it **is** new
per-map code plus one more new component: ④ a **layer-toggle / legend-stack control** (turn each
layer on/off, stack each family's legend) — new, and the mechanism that makes consolidation legible.

---

## §4. Consolidation options (score all four; one recommendation)

Scoring axes (from the directive): **page count / nav parity** with the Tableau site · **build
effort** (CC sessions) · **payload / browser weight** vs the 25 MiB cap · **legibility for Olivia**
(the governing bar, `CLAUDE.md` §6) · **extensibility** to the rest of the `YEG_OPEN_DATA` backlog.

| Option | Pages | Nav parity | Effort | Payload / weight | Legibility (Olivia) | Extensibility | Verdict |
|---|---|---|---|---|---|---|---|
| **Opt 1 — one page per dataset** | 14 | Poor — invents ~14 leaves the live site doesn't have; nav bloat | Worst — ~14 near-identical builds | Best — each page loads one layer | Fine per page, but 14 pages to maintain = copy-paste rot | Adds a leaf per new source forever | **Reject** |
| **Opt 2 — one Amenities map, all layers as toggles** | 1 (+Zoning) | Poor — collapses 5 live leaves into one | Medium — one map, many layers | Worst — a kitchen-sink map can load 12 mixed-geometry layers at once | Worst — an all-layers map is the illegibility `DESIGN_SYSTEM.md` §3 forbids | Every new source piles onto one page | **Reject** |
| **Opt 3 — thematic consolidation onto the live nav leaves** | ~4–5 (+Zoning) | **Best — is the live nav** (Public Transportation, Community Services, Public School…) | Medium — one build per theme, layers reuse the family components | Good — a theme loads 1–3 related layers | **Best — one theme per map reads as one idea** | New source slots onto an existing theme | **Strong** |
| **Opt 4 — hybrid: consolidated thematic maps + standalone where a family needs its own treatment** | ~5 (+Zoning) | Best — thematic + Zoning honestly separate | Medium — Opt 3 + Zoning's bespoke build | Good | Best — keeps Zoning's 156-class problem off the amenity maps | Best | **RECOMMEND** |

**Recommendation — Opt 4 (thematic hybrid), which is KC's steer made concrete.** Consolidate the 14
map layers onto **~5 thematic pages mapped to the live nav leaves**, plus **Zoning standalone** under
Properties & Land. This collapses 14 one-per-dataset pages to ~6, *is* the nav the project exists to
replicate, keeps each map to one theme (legible), and reuses the three family components across
themes. The section→layer mapping:

| Consolidated page (nav leaf) | Layers | Families on the map |
|---|---|---|
| **Public Transportation** *(live leaf)* | A1 Bus Stops · A2 LRT · A7 Bike Routes · *(A13 Ridership = chart companion, not a layer)* | F1 points + F2 line |
| **Parks & Recreation** *(new leaf — our addition, like Permit Neighbourhoods)* | A10 Parks · A8 Playgrounds · A12 Spray Parks · A11 Recreation Facilities · A14 Track Sports Fields | F3 polygon + F1 points |
| **Community Services / Public Safety** *(live "Community Services" leaf)* | A3 Police Stations · A9 EV Charging *(pending §10 D2)* | F1 points |
| **Public School** *(live leaf)* | A6 School Catchment Areas | F3 polygon |
| **Environment** *(new leaf — pending §10 D1)* | A4 Vegetation *(if ruled an amenity)* | F3 polygon |
| **Zoning** *(Properties & Land leaf, standalone)* | Z1 Zoning Bylaw (base classes) · Z2 Overlays (stacked toggle) | F3 polygon |

Result: **5 Amenities pages + 1 Zoning page** vs 14 one-per-dataset pages. If Vegetation is ruled
base geo (§10 D1), Environment disappears — **4 Amenities pages + 1 Zoning** over 13 layers. Air
Quality and Crime stay
placeholders (no source in this list).

---

## §5. Pipeline shape (compare two; recommend one)

### (a) One script per layer (mirrors PA/BP)
Familiar; each script is self-contained and Olivia can read one in isolation. But 14 near-identical
fetch→WKT→thin→emit scripts is **copy-paste rot** — a fix to the thinning or the WKT parse has to be
made 14 times, and drift between them is the exact failure `DESIGN_SYSTEM.md`/`CLAUDE.md` legibility
rules dislike. Adding the 15th layer is a whole new script.

### (b) One registry-driven script over a committed registry table — **RECOMMEND (for the point + line families)**
A single emit script loops a **committed, human-readable registry** (one row per layer):
`section, label, listed_id, data_id, geometry, category_field, min_rows,
min_size_mb, renderable_cols` (no `grouping_table` column — grouping is Zoning-only and lives in its
dedicated script, below). For each row it calls `fetch_socrata_snapshot(data_id, …)`, parses
the WKT geometry column → `sf`, keeps `renderable_cols` + geometry, thins coords to 6-dp, and writes
one normalised GeoJSON per layer plus one manifest listing every layer (§6). Adding the 15th layer
is **a registry row, not a script.**

**Why (b) is *more* legible here, not less** — the directive's own worry, answered honestly: the
project's house idiom already *is* "a data-driven table consumed by a loop" (`CLAUDE.md` §6:
`STOPS`/`STATE_STYLE`/`POPUP_ROWS`). A transparent registry CSV + one readable ~80-line loop is a
pattern Olivia already reads elsewhere, and it beats 14 divergent copies. The abstraction is a
*table*, not clever code — which is the legible kind. The registry doubles as the **single source of
the lens→parent mapping** (§0.1), so that finding can never be lost in a filename.

**Where (b) stops and (a) is right — Zoning.** Zoning's 156→family grouping, its bylaw-amendment
guard, and the overlay-stacking are genuinely bespoke and deserve **their own readable script**, not
a registry row with a mystery grouping reference doing invisible work. So the honest recommendation is
**hybrid: registry-driven for Families 1 & 2 (the 9 point/line layers), a dedicated script for
Zoning (Family 3 categorical, Z1+Z2).** The other Family-3 polygons (Schools, Parks, Vegetation) fit
the registry loop (their class fields are used as-is, no grouping) with a `geometry`-typed branch in
the emit.

**How the recommended design satisfies the contracts:**
- **§4.8 (fetch discipline):** every row calls `fetch_socrata_snapshot(data_id, …)` with per-layer
  floors — unchanged helper, pointed at the **parent** id (the measured requirement). No new mode.
- **D4 (sole publisher):** the script writes only to the section's `output/`; the `_whirl.yaml`
  handoff publishes to `public/`. No script writes `public/`.
- **`_whirl.yaml` contract:** one section entry with `cwd`, an ordered `scripts` list
  (`01_build_amenity_layers.R` → `02_build_zoning.R` → `03_emit_manifest.R`), `expected_outputs`
  mapping each producing script to a representative non-empty output, and a `handoff.glob` copying
  `output/*.geojson` to `website/public/data/amenities/…` plus a fixed-file `manifest.json` copy.
- **`expected_outputs` guard:** list one representative layer file per script (e.g.
  `output/playgrounds.geojson`) as the script-level non-empty signal; the handoff's zero-byte check
  backstops every file.

**Illustrative `_whirl.yaml` entry (for the document only — NOT an edit to the file):**
```yaml
  amenities:
    cwd: pipeline/yeg/amenities
    scripts:
      - scripts/production/01_build_amenity_layers.R   # registry loop: F1 points + F2 line
      - scripts/production/02_build_zoning.R            # dedicated: Z1 families + Z2 overlays
      - scripts/production/03_emit_manifest.R           # no-year manifest (§6)
    expected_outputs:
      scripts/production/01_build_amenity_layers.R:
        - output/playgrounds.geojson
        - output/bike_routes.geojson
      scripts/production/02_build_zoning.R:
        - output/zoning_bylaw.geojson
    handoff:
      glob:
        - src_dir:  output
          dest_dir: website/public/data/amenities
          pattern:  "*.geojson"
      files:
        - { from: output/manifest.json, to: website/public/data/amenities/manifest.json }
```
Whether Zoning shares the `amenities` section cwd or gets its own `zoning` section is a §10 detail
(D6); the shape is identical either way.

---

## §6. Refresh-by-design for a layer with no year axis (a contract question, answered as a contract)

**The contract (D2) still holds; the axis it discovers changes.** D2 forbids *year literals* because
the operator's refresh must not touch code. An inventory has no year — so the rule generalises to
**no data literals**: the filename, the category domain (legend), the counts, and the currency all
come from the manifest, never from frontend code.

**What the no-year manifest carries, per layer:**
```json
{
  "layers": [
    {
      "id": "playgrounds",
      "file": "playgrounds.geojson",
      "label": "Playgrounds",
      "geometry": "Point",
      "sourceDatasetId": "9nqb-w48x",
      "sourceUpdatedAt": "2026-07-20",     // City rowsUpdatedAt — the data's true currency
      "fetchedAt": "2026-07-25",           // our snapshot date
      "featureCount": 659,
      "categoryField": "user_category",
      "categories": ["…"],                 // observed domain → drives the legend (data-driven)
      "coverage": { "withGeometry": 659, "withoutGeometry": 0 }
    }
  ]
}
```
- **Currency statement (replaces the year readout):** the frontend shows *"City data updated
  2026-07-20 · 659 playgrounds"* from `sourceUpdatedAt` + `featureCount`. This is the manifest's
  analogue of the PA/BP year label — it advances on refresh with no code edit (D2 satisfied), and it
  is the honest currency signal the directive's cadence question asks for.
- **Legend is data-driven:** `categories[]` is the observed domain, so a new category the City adds
  appears in the legend automatically — the categorical analogue of PA's per-year colour scale in
  its manifest.
- **Coverage is disclosed from the manifest** (§7 below): `withoutGeometry` drives the "N of M
  mapped" honesty line — driven by `withGeometry` (School Catchments show **222 of 259 mapped**; 37
  lack a boundary).
- **Manifest shape follows source structure** (`CLAUDE.md` §2): a multi-layer inventory section emits
  one manifest listing every layer — the same generative rule that gives PA a nested manifest and
  building-permits a flat one.

This is a clean extension of D2, not an exception to it. **Business Counts** remains the one parked
literal-baked case; amenities are built refresh-by-design from day one.

---

## §7. Point standard, revisited for a static inventory (inherit vs must-not-copy)

The BP point map is built around three things an amenity inventory **must not inherit**, and the
**Business Census points map already demonstrates the correct static shape** (which is why it, not
BP, is the pilot template).

**Inherited from the point standard (as-is):** the shared `MapView` mount; the pitched **home
camera** (`mapCamera.js` `HOME_VIEW` / `applyCameraPreset`, `CLAUDE.md §12 v1.15`); the map-control
rail (search · zoom · fullscreen · recentre · info); `MapTipsPopover`; the attribution strip +
database-control panel standard (`DESIGN_SYSTEM.md` §6); whole-GeoJSON transport (D1).

**BP-specific — must NOT be copied:** the **year slider** and its debounce (no year axis); the
**`construction_value` size-tiers** and `VALUE_BUCKETS` legend (no value axis — an amenity is
present or absent, it has no magnitude to size); the **value-honesty null exclusion** (that is a
"don't size a valueless dot" fix, meaningless without sizing); the **heatmap-at-overview** +
zoom cross-fade; the **year cross-fade / source-recreate** (`crossFadeSource.js` — a static layer
never swaps its source, so this code path never runs, exactly as the choropleths already show).

**What the amenity case needs that BP does NOT have (all new work, per §3):** categorical colour +
categorical **filter** (BP filters by group/month/value — wrong axes); a **categorical legend**
(BP's is a value-tier circle legend, choropleth `Legend.jsx` is a gradient — neither fits N nominal
categories); **detail-on-select** with amenity fields (new rail); **overview declutter** for the
dense point/line layers (BP substitutes a heatmap — a BP-specific choice, not inherited).

**Dependency flag (not resolved here):** the open BP question of *point-primary vs choropleth-primary*
does not bind this backlog — amenities are inherently point/line/nominal-polygon inventories with no
aggregate value to choropleth. If a future "amenities per neighbourhood" **rollup** is wanted, that
is the analysis layer explicitly out of scope (§ out-of-scope), and it would reopen that BP question;
flag the dependency, don't resolve it.

---

## §8. Zoning specifically (it is not a choropleth)

`PHASE2_STATUS.md` calls this a "Zoning choropleth." **Wrong term — fix it.** A choropleth encodes a
*continuous value* by area; zoning is a **nominal class per polygon**. The correct component is a
categorical polygon fill (Family 3), not the PA/BP continuous ramp.

- **Class count is the problem, and it is measured: 156 distinct base classes** (the `zoning` field,
  counted via a `$select=zoning,count(*)&$group=zoning` query on `fixa-tstc` — e.g. RSF, CB, DC1,
  DC2, and ~50 `MU h.. f..` height/FAR variants). A 156-colour fill is illegible and no
  categorical palette survives it.
- **Sourcing the class list without hardcoding it (bylaw-amendment-safe):** the emit reads the
  distinct `zoning` codes from the data each refresh and maps them to **~10–15 zone families**
  (Residential Small/Medium/Large · Commercial · Mixed Use · Industrial · Agricultural · Direct
  Control · Civic/Parks/Open · …) through a **curated, sourced, dated code→family crosswalk** under
  `data/reference/` — the established reconciliation pattern (`CLAUDE.md` §4.7, the neighbourhood
  crosswalk), *not* fuzzy matching. The `description` field ("Small Scale Flex Residential" for RSF)
  is the human-readable input to that curation. The frontend fills by **family** (legible), and can
  reveal the exact `zoning` code + `description` on hover/select.
- **How a bylaw amendment surfaces at refresh (not silently):** the emit counts distinct `zoning`
  codes and stops with an `n_unmapped` error when the City introduces a code the crosswalk doesn't
  cover — **exactly the guard building-permits already runs on `job_category`**
  (`_whirl.yaml` building-permits note: "01 self-guards category drift via its n_unmapped stop").
  A new zone → a loud stop → a human adds the crosswalk row → refresh. The class list is never a
  frontend literal.
- **Z2 Overlays stack over base zones by design** (36 polygons; `overlay_code`/`overlay_descr`).
  Overlays are not a fill class — they modify the base zone. Encode them as a **separate toggle layer
  with a distinct non-fill encoding** (outline/hatch composed *over* the base fill — the same
  orthogonal-composition idea as the Tier-2 annexation outline, `CLAUDE.md §12 v1.11`), never as a
  16th fill colour. **Recommend shipping Z2 in v1** as that toggle (only 36 polygons, cheap); it is
  low-risk to defer to v1.1 if the base-zone build runs long (§10 D5).
- **Cap / dissolve:** Z1 is 11,516 polygons at **9.1 MB — under cap, no dissolve required**
  (measured). Dissolving to family boundaries would shrink the browser payload and is a *legibility*
  option for the overview, but it **costs fidelity** (you lose the parcel-level zone boundary the
  user may want to inspect) — so keep full polygons for v1 and treat family-dissolve as a later
  performance option, not a v1 requirement.

---

## §9. Sequencing (one concern per step; pilot first)

**Pilot layer = Playgrounds (A8), and it is the representative one, not the easiest.** Track Sports
Fields (14 pts) or Police (10 pts) would be *easier* but prove nothing about density. Playgrounds is
representative because it forces every question the other 13 layers inherit: a **659-point layer**
(dense enough to force the overview-declutter decision the tiny layers dodge), a **real 6-value
category axis** (`user_category`) that exercises categorical colour + legend + filter, it **carries
`neighbourhood_id`+`_name`** (so it tests the join question even though v1 skips the join), it has
**fresh data** (2026-07-20), and it seeds the Parks & Recreation section. Locking the standard on
Playgrounds makes the remaining 7 point layers a config each.

| Step | Scope (one CC session) | Commit | Blocked on |
|---|---|---|---|
| 1 | **Backend: registry + point emitter + no-year manifest**, producing the Playgrounds GeoJSON + manifest (registry table, `01_build_amenity_layers.R` for one row, `03_emit_manifest.R`, `_whirl.yaml` `amenities` section). | `feat(amenities): registry-driven point emitter + manifest (pilot: playgrounds)` | §10 D6 (section layout), D8 (registry design) |
| 2 | **Frontend: Family-1 pilot (Playgrounds standalone)** — `AmenityPointLayer` + categorical point legend + amenity detail rail + coverage disclosure + manifest currency. **Locks the point standard.** | `feat(amenities): playgrounds point map (Family-1 standard)` | Step 1; §10 D7 (pilot confirm) |
| 3 | **Roll Family 1** across the remaining 7 point layers — A1 Bus Stops (with overview declutter, §10 D10), A2 LRT, A3 Police, A9 EV, A11 Rec, A12 Spray, A14 Track (registry rows + reuse the locked component). | `feat(amenities): remaining point inventories` | Step 2 |
| 4 | **Family 2 (Bike Routes)** — backend line emit + `AmenityLineLayer` + line legend. | `feat(amenities): bike routes line layer (Family-2 standard)` | Step 1 |
| 5 | **Public Transportation consolidated map** — assemble the already-built A1 Bus Stops + A2 LRT (points) + A7 Bike Routes (line) onto one map + the **layer-toggle/legend-stack control** + A13 Ridership chart companion. First multi-geometry consolidation; pure assembly. | `feat(amenities): public transportation consolidated map` | Steps 3, 4 |
| 6 | **Family 3 (categorical polygon)** — start with **Parks or Schools** (simpler than Zoning): backend + `CategoricalPolygonLayer` + categorical polygon legend. | `feat(amenities): categorical polygon standard (schools/parks)` | Step 1 |
| 7 | **Parks & Recreation consolidated map** — Parks (polygon) + Playgrounds/Spray/Rec/Track (points). | `feat(amenities): parks & recreation consolidated map` | Steps 3, 6; §10 D3 (new leaf) |
| 8 | **Community Services** — Police + EV. **Public School** — School Catchments (from step 6). | `feat(amenities): community services + public school` | Steps 3, 6; §10 D2 |
| 9 | **Zoning (standalone, hardest)** — backend family crosswalk + `n_unmapped` guard + Z1/Z2 emit; frontend family fill + overlays toggle. | `feat(zoning): zoning bylaw families + overlays` | §10 D4, D5, D6 |
| 10 | **Vegetation / Environment** — build or route to base geo. | (per ruling) | §10 D1 |

Steps 1–2 are the gate that must land before anything scales. Steps 3/4/6 are independent
(parallelizable). 5/7/8 assemble. 9 stands alone. 10 waits on a ruling.

---

## §10. Decisions for KC (one question · one recommendation · one consequence-if-deferred)

1. **Vegetation home — amenity Environment page, or `shared/` base geo?**
   *Rec:* amenity **Environment** data layer (it is the subject, nobody joins to it — §2 test).
   *If deferred:* Step 10 blocked; the Environment leaf can't be scoped.
2. **EV Charging home — Community Services, Public Transportation, or Environment?**
   *Rec:* **Community Services / Public Facilities.**
   *If deferred:* cosmetic nav placement only; low-risk, Step 8 proceeds with a placeholder home.
3. **Add two new nav leaves — "Parks & Recreation" and (pending D1) "Environment"?**
   *Rec:* yes — our additions, like the Permit Neighbourhoods leaf; the live site has no home for
   the 5-dataset outdoor-rec cluster otherwise.
   *If deferred:* Steps 7/10 have nowhere to mount; fold rec into Community Services as a fallback.
4. **Zoning class grouping — curated code→family crosswalk (§4.7 pattern) or `description`-derived?**
   *Rec:* **curated, dated crosswalk + `n_unmapped` guard** (bylaw-amendment-safe, non-fuzzy).
   *If deferred:* Step 9 blocked — a 156-class fill is not shippable.
5. **Z2 Overlays in v1 or v1.1?**
   *Rec:* **v1**, as a separate stacked-outline toggle (36 polygons, cheap).
   *If deferred:* Zoning ships base-zones-only; overlays follow — no rework.
6. **Section layout — one `amenities` section with Zoning inside, or `amenities` + a separate
   `zoning` section?**
   *Rec:* **`amenities`** for Families 1–3 amenity layers; **Zoning under its own concern** (it is
   Properties & Land, not Amenities, and its build is bespoke) — likely a `zoning` section or a
   sub-folder. Confirm before Step 1 (sets `cwd`/handoff paths).
   *If deferred:* Step 1 can't declare `_whirl.yaml` cleanly.
7. **Pilot = Playgrounds?** *Rec:* yes (§9 rationale). *If deferred:* Step 2 can't start.
8. **Pipeline = registry-driven for points/line + dedicated Zoning script (hybrid)?**
   *Rec:* yes (§5). *If deferred:* Step 1 design is unset.
9. **Shared helper stays unchanged, registry records parent ids?** *Rec:* yes — measured: the CSV
   export carries WKT, no new mode (§0.5). *If deferred:* none — this is a confirmation, not a build
   gate.
10. **Dense-layer declutter (Bus Stops 6,882; Bike Routes 10,417) — zoom-gated display, clustering,
    or both?**
    *Rec:* zoom-gated `minzoom` for both + optional clustering for Bus Stops; decide at Step 5.
    *If deferred:* the Transportation overview renders ~17k marks at once — heavy and cluttered.

---

## Explicitly out of scope for v1 (stated so it isn't quietly added)

**Derived accessibility metrics** — distance to nearest LRT/school, playgrounds-per-capita, amenity
indices, "walkability" scores. Those are **analysis**, and this backlog is **inventory**; mixing them
turns a plot-the-points task into a modelling task (the same scope line that retired the previous
RA's random forest, `CLAUDE.md §1`). They are the natural **Neighbourhood Report Card** and **Phase 5**
extension — and the only place the neighbourhood-ID join (Playgrounds/Spray Parks carry it;
everything else needs a spatial join) actually earns its keep. Noted here; not built.

---

## Appendix A — Doc conflicts this recon resolves (each with its ruling + the line to correct in a follow-up commit)

*None of these files is edited in this session; the corrections are proposals for a later commit.*

| # | Conflict | Ruling |
|---|---|---|
| 1 | `PHASE2_STATUS.md` "Pattern A = `<layer>.pmtiles` on R2 + `<layer>_coverage.csv`" | **Stale.** PMTiles/R2/tiler retired (`CLAUDE.md §12 v1.10`, `METHODOLOGY.md D1`). Restate Pattern A on **whole per-layer GeoJSON + a no-year manifest**. Correct the `PHASE2_STATUS.md` "Point layers batch" bullet. |
| 2 | Two amenity lists | `PHASE2_STATUS.md` names Attractions (`7yt8-7467`) + Public Libraries (`jn25-zspi`) — **drops** (not in the current 14-item list); the current list **adds** A1b/A4/A5/A6/A7/A8/A9/A10–A14 (everything in §1 except A1/A2/A3, which PHASE2 already carried — A8 Playgrounds, a net-new add, is the pilot). Reconciled list = §1. |
| 3 | LRT id | **Use `fhxi-cnhe`** (source list). `PHASE2_STATUS.md`'s `j77g-ki3x` → **HTTP 403 / dead**; correct the bullet. |
| 4 | Vegetation in two homes | **Data layer, not base geo** (§2 test) — recommend Environment amenity; `CLAUDE.md §3`'s base-geo mention is the *tonal-reference* need, a different consumer of the same parent `ct88-r8tk`. Ruling gated on §10 D1. |
| 5 | "Zoning choropleth" | **Nominal-class fill, not a choropleth.** Fix the `PHASE2_STATUS.md` "Zoning choropleth" line to "Zoning categorical polygon map." |
| 6 | Salary Ranges as amenity | **Not an amenity, not a map** — non-spatial Economy table (confirms `PHASE2_STATUS.md`). |
| 7 | Zoning Bylaw in both lists | `ruwn-htv8` is the **portal lens** for the Zoning **section deliverable**; its data parent is `fixa-tstc`. It appears in `YEG_OPEN_DATA_BASE.md` as "base data," but by the §2 test zoning is a **data layer** (its own page), not shared base geo — one role, not two. |
| 8 | Two copies of `YEG_OPEN_DATA.md` differ | **Committed (HEAD)** carries `Tab 1`/`Tab 2`, the **"TOTAL SNOW MONTHLY → Road Network `9j8t-zm52`"** copy-paste error, and two Business Census dupes. The **working tree** already has an **uncommitted** cleanup to the 14-item amenities list, with base-geo items moved to the tracked `YEG_OPEN_DATA_BASE.md` (Zoning Bylaw, Speed Zones, Road Network, Neighbourhoods). *Recommend committing the working-tree cleanup*; left both untouched this session. |
| 9 *(new)* | Z2 Overlays (`6w3s-58pv`) is in neither repo list | **Exists** — "Zoning Overlays," MultiPolygon, 36 features, updated 2026-07-20. Add to the Zoning scope. |
| 10 *(new)* | §4.8 CSV-only helper vs polygon/line needs | **No conflict after measurement** — `rows.csv` carries WKT geometry; helper unchanged (§0.5). Record so a future reader doesn't add a geospatial mode unnecessarily. |
| 11 *(new)* | Listed IDs are visualization lenses | The 8 `visualization_canvas_map` lenses (§0.1) must be replaced by their `modifyingViewUid` parents in any build. Record the map (§1) in the registry. |

## Appendix B — Recon method + provenance note

Measured 2026-07-25 against `data.edmonton.ca` (Socrata). Endpoints used (recon only): `api/views/<id>.json`
(metadata + `modifyingViewUid`), `resource/<data_id>.json?$select=count(*)` (count),
`resource/<data_id>.json?$select=<field>,count(*)&$group=<field>` (category domains + the 156
distinct Zoning classes), `resource/<data_id>.geojson?$limit=N` (served size; re-serialized at 6-dp and geometry-only for the
thinned/floor sizes), and the production `api/views/<data_id>/rows.csv?accessType=DOWNLOAD` header
(WKT-in-CSV confirmation). Downloads lived in `/tmp`, were measured, and were deleted at session end;
nothing entered any section's `data/`, and nothing was committed. **This recon method is not a
sanctioned production pattern** — production fetches go through `fetch_socrata_snapshot()` (`CLAUDE.md
§4.8`), pointed at the parent `data_id`.
