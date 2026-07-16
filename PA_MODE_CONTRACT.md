# PA MODE CONTRACT — Three-Mode Layout & Functionality Specification (Doc 1)

**Status:** THE layout contract for the PA frontend rebuild. Supersedes the incremental D-directive layout sequence. Authored by KC (sole origin author) with Chat-Claude; executed by CC via Doc 2 (`PA_CONTRACT_DIRECTIVE.md`).
**Visual truth:** `PA_MODE_CONTRACT_ANNEX.html` — the seven reference states. **The annex is the contract, not inspiration.** Built output must match it in placement, relative widths, aspect ratios, and deliberate empty space. "Components present and functional" is NOT done; *where and how large* is part of correctness. If a detail is ambiguous or infeasible: STOP and surface — never resolve by stretching to fill. Stretch-to-fill is default CSS behaviour, not design.
**Casing note:** the annex renders sentence case (tool artifact). The PRODUCT standard is **Title Case** (house typography). Never "fix" product casing to match the annex.

---

## 1. Master principle — grid-structured external, dynamic internal

Every zone is a **fixed labelled frame** positioned by the mode's grid. Frames never move, resize, or restyle in response to data. Only the **data inside** a frame changes with selection, year, metric, or filter. The chassis is invariant; the data flows. Locked layout discipline (industry-standard: legends and filters in the same spot always; fixed card anatomy; controls consolidated in one panel; map centre sacred).

## 2. The modes and the seven states

Three modes over the existing state axes (R9: `url`, `dockOpen`, `selectedIds.length`):

| State | Mode | Definition |
|---|---|---|
| S-E | (pre-mode) | `url` falsy — Calgary / unlisted year |
| S-a | **Display** | Down · N=0 — browse |
| S-b | **View** | Down · N=1 — single-select detail |
| S-b₂ | **Display-variant** | Down · N≥2 — outlines + dim only, **no detail instrument** (KC-approved default) |
| S-c | **Analysis** | Up · N=0 — city scope |
| S-d | **Analysis** | Up · N=1 — neighbourhood scope |
| S-e | **Analysis** | Up · N≥2 — aggregate scope |

P0 (load error) / P1 (loading) remain bare shells as-built. Brush and box-select are **overlays/gestures, not modes** (they change map paint / trigger transitions, never frame visibility). No explicit mode variable is required in code — modes are documentation names for the existing axes.

## 3. External grids (structural outlay)

### 3.1 Display / View / b₂ (console down)
```
┌────────────────────────────────────────────────────────────────┐
│ ┌─COLUMN─┐                                     ┌──nav──┐       │
│ │identity│                                     │ search│       │
│ │────────│          MAP (sacred centre,        │ +   − │       │
│ │ METRIC │           zero chrome)              │ full  │       │
│ │────────│                                     │ fit   │       │
│ │ LEGEND │                                     │ info i│       │
│ │────────│                                     └───────┘       │
│ │ footer │                                  ┌─DETAIL─┐ (S-b    │
│ │·parcels│                                  │ float  │  only)  │
│ └────────┘   ┌──── TUNING BAY ────┐         └────────┘         │
│              │  Year · Metric rng │                  ┌ data ┐  │
│              └────────────────────┘                  └──────┘  │
│                  [ Data Console ▴ ]      © City · CARTO · OSM  │
└────────────────────────────────────────────────────────────────┘
```
- **Instrument column** (left, fixed width ~196px, top→bottom, full height minus margins): TWO stacked dark cards (P1) — an **Identity card** (title, city toggle) and, below it, an **Instrument chassis card** (Metric module → Legend module → footer [parcel count]). Tuning and the About & tips trigger are no longer in the column (§5 / DESIGN_SYSTEM §6). A gap separates the two cards; within the chassis, modules are hairline-separated. Module set identical in all data states. (The year readout was removed from Identity — the Tuning year slider owns the live year.)
- **Nav stack** (right-top): search peek + zoom +/− + fullscreen + recentre + info "i" (one Lucide family, DESIGN_SYSTEM §6). A **separate bottom-right stack** carries the scale bar + a "Data & attribution" database-glyph control (its panel = source + licence + disclaimer + CARTO/OSM; the always-visible links strip sits below).
- **Detail instrument** (right, below nav): mounts in S-b only. Fixed frame position; interior = name, rank/parcels/reportable line, sparkline, value/city/delta triplet, hairline, condo block (Condo share / Mean excl. condo / Lot non-condo).
- **Handle** (bottom, centred over the map area right of the column): the console's only down-state presence. Shows count; shows `N selected` (coral) in b₂.
- **The old `.pa-topbar` is REMOVED** — the parcel count re-homes to the column footer. The old centred `.pa-rack` is REMOVED. Tuning then re-homed AGAIN (Fix 4) OUT of the column into the **Data Console spine** — a horizontal Year·range bay bottom-centre above the handle in View, relocating into the console header in Analysis (see §5).

### 3.2 Analysis (console up)
```
┌────────────────────────────────────────────────────────────────┐
│ ┌COLUMN┐  (map above console, centre clear)         ┌nav┐      │
│ │identity                                           └───┘      │
│ │LEGEND│   ← METRIC dormant: chips re-home to console header   │
│ │footer│      TUNING (Year·range) re-homes to header too       │
│ └──────┘                                                       │
│ ┌CONSOLE (full-width shell, rises alone from the bottom)────┐  │
│ │ HEADER: scope-title · metric chips │ Year·range │ District │ │
│ │                                    │  (tuning)  │ Clear ·  │ │
│ │                                    │            │ Export   │ │
│ │ ┌RAIL 184┐ ┌TABLE ≤~640─┐ ┌TREND~340┐ ┌margin──┐          │  │
│ │ │KPI cards│ │dense table │ │line+city│ │(empty, │          │ │
│ │ │MEDIAN   │ │%CONDO col  │ │envelope │ │honest  │          │ │
│ │ │MEAN/YOY │ │TREND spark │ │yr cursor│ │gutter) │          │ │
│ │ │CONDO    │ │coral sel   │ │YoY strip│ │        │          │ │
│ │ │DISTRIB  │ │            │ │         │ │        │          │ │
│ │ └─────────┘ └────────────┘ └─────────┘ └────────┘          │ │
│ └──────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```
Console interior = **four fixed frames**: `rail (≈184–200px) | table (content-capped ≈600–680px, never stretched) | trend instrument (width-bound ≈300–360px) | margin (residual, deliberately empty)`. Content packs LEFT; full-width shell ≠ full-width content.

## 4. Frame inventory — interiors per state

**Identity card:** its own dark surface (P1), always: title, city toggle. No year readout (removed in P1 — it duplicated the Tuning year slider's live readout).
**Metric module:** S-a/b/b₂: vertical chip list, active chip green-bordered; each left-rail chip carries a leading metric glyph (inline stroke SVG, `currentColor` → greens with the active chip; NO per-metric colour — the green border stays the sole selected signal) (P5). S-c/d/e: DORMANT (empties; chips render in console header — the ONLY re-homing element, mechanics as-built: two conditional SegmentedControl homes, not a portal; the re-homed console-header chips stay text-only, icons suppressed there). S-E: hidden.
**Tuning module:** each control is a fixed **two-row form** (P2) — a name header row, then a slider row `[min · fixed track · max]`; the slider TRACK is a fixed width at a fixed x on every control and every state (Principle 0 — the track never resizes with its value), only the handle + the flanking numbers move. Year = green readout at the right, min cell reserved empty; range = white bold min/max flanking the track. `⚙ Tuning` banner. Range dims (`is-off`) in selection mode (N≥2) exactly as-built. Docked in the **Data Console spine** (Fix 4): a horizontal Year·range bay above the pull-up handle in View, relocating into the console header in Analysis — no longer in the left column.
**Legend module:** horizontal ramp bar + min/max labels (D6 as committed: sequential = index-spaced simple gradient; YoY = value-spaced diverging with ±1 plateau tag). Frame fixed; ramp swaps with active metric. Relocated from `.pa-legend` bottom-right into the column — a real relocation, conscious.
**Detail instrument (S-b):** anatomy above; suppressed/non-reportable single-select shows its state label and honest em-dashes.
**Console header:** left = scope title (`All 407 Neighbourhoods` / `<Name> · rank · parcels · state` / `N neighbourhoods selected`) + metric chips; right = a FIXED-SLOT strip (Principle 0 — every element permanently present, enabled/disabled in place, never added/removed): District ▾ (filter; inert while a selection is active), `Clear filters` (empties the range/District filter), `Clear selection` (empties the selection), Export (as-built menu, portal to body preserved). State toggles each slot's enabled state; nothing reflows.
**KPI rail:** cards in fixed order MEDIAN → MEAN or YOY (metric-relevant pair) → CONDO → DISTRIBUTION. Card anatomy (locked): small-caps muted label (+ inline muted honesty tag) | city baseline top-right | big white value | coloured delta right. CONDO card secondary block: `Mean excl. condo` / `Lot (non-condo)`. Interiors: S-c baselines-no-delta; S-d value/city/delta; S-e aggregate + honesty tags (`≈ of medians`, `parcel-weighted · exact`). Distribution: histogram; S-d = selection marker line; S-e = selection band.
**Table:** columns `NEIGHBOURHOOD | MEDIAN | MEAN | LOT M² | BUILT | % CONDO | YOY | TREND` (fixed chassis re-cut; active-metric column tinted green header). Uppercase muted headers, tabular numerals, taller rows per annex. Selection = **coral outline** (`--sel` token), neutral row bg (amends note 26 — outline colour is the coral accent, NOT active-metric colour). Auto-scroll selected to top (`block:"start"`). Suppressed rows: dimmed grey + em-dashes.
**TREND sparkline column:** ~44×12px polyline per row; **active metric series** (KC-locked); trajectory-coloured green/coral for median/mean/YoY, neutral for lot/built (decided-default); gaps (never zero-bridging) at suppressed/-999 years; memoised per `(rowId, metric)` — render-storm guard territory, mandatory.
**Trend instrument:** header label + top-right year/value readout; main chart = selection line (green) over min–max envelope (N≥2 only, translucent) + dashed muted city baseline + active-year coral cursor tied to the tuning year + labelled endpoints (P3: readout + axis-end labels at the `--t-2xs` floor in `--tx` — they carry values; the series legend + YoY sub-label at `--t-2xs` in `--tx-mut` — they are labels; never below the 11px floor); below hairline: matched-sample YoY bar strip (green/coral per year). Interiors: S-c city line only; S-d neighbourhood vs city, no envelope; S-e mean + envelope + city. Hover crosshair readout permitted (local, VIEW-only). **Excluded:** click/drag-to-set-year or select on the chart; axis grids; any zoom/brush. All hand-rolled SVG — **no Recharts / no new chart dependency** (Rejected: bundle + Redux internals + 400-instance sparkline pathology; When-this-changes: Ph5 interactive report needs).
**Margin frame:** residual width, empty. The honest gutter.

## 5. Controls, channels, interlinking (preserve as-built wiring — R4/R8 anchors)

- **Year:** slider → `slideYear` (leading+trailing throttle @ DUR_BASE, reduced-motion 0) → `sliderYear`/`year`. Unchanged; only the DOM home moves into the console tuning bay (Fix 4).
- **Range:** RangeFacet stays **owned by DataTable, portaled** — the portal TARGET moves from `.pa-rack-range-slot` to the console tuning bay's slot. Filter application immediate; brush report throttled 100ms + signature guard. All unchanged.
- **Metric-range / District = a FILTER (updated 2026-07-13, ratified KC):** the metric-range slider + District are `columnFilters` — narrowing them filters the **table view AND the neighbourhood count** (`scopeTitle` = viewRows/total), and (via `brushActive = !selectionMode && columnFilters.length>0` → `brushedIds`) **dims the map** to the in-range set. This is a FILTER ("which neighbourhoods are in scope"), DISTINCT from a *selection* (a chosen neighbourhood, `--sel`/`--pa-selection-outline` = "this one"). Each has its OWN clear in the console strip: **`Clear filters`** (empties `columnFilters` — range + District) vs **`Clear selection`** (empties `selectedIds`). The filter STILL does NOT touch the selection, the KPI **aggregate**, or **Export** — those read the selection/city channel (`selectionAggregate`/`cityBaseline`; `handleExport` scopes to the selection or ALL 407, never the brushed set), so a filtered view never silently narrows an aggregate or export. (Stale wording corrected: the old note said "map dim ONLY," but `columnFilters` also drive the table + count — the dim is one of three filter effects, not the only one.)
- **Search:** D5 unified control unchanged (peek → `flyAndPinByName` + `globalFilter`).
- **Selection:** click ≤1 / box-select ≥2 (auto-opens console, `reserveConsole:true` fit) — unchanged. **Clear** button = new writer that empties `selectedIds` (and thus collapses per existing auto-collapse rule only if that rule fires; console stays up on manual clear — clearing scope ≠ closing console; S-e→S-c in place).
- **Console:** handle/T-key toggle, 0fr↔1fr rise, mount/unmount race handling — unchanged mechanics; the shell now rises ALONE (no rack above).
- **Camera/padding:** the column MUST render as (or retain the measured selector of) **`.pa-float`** so `chromePadding`'s live left reserve keeps working (interactions.js:178–181). Bottom reserve: rackH term naturally →0 when `.pa-rack` is gone — verify, don't fork the function. HOME preset is un-padded by design (unchanged); if home framing visibly crowds the column, the per-city center literal may be nudged (the ONE authorized per-city literal) — surface first.
- **Geometry constants collapse:** the console cap loses the rack term — `calc(37svh − 106px)` is re-derived to console-alone (gap+handle only; recompute, comment the derivation). Collapse the three un-synced bottom-band constants (120 / 106+37svh / 0.42–0.56) toward one commented source of truth; `chromePadding`'s svh fractions must be updated in the same commit as the cap (they describe the same band).

## 6. Transitions

- **S-a↔S-b:** detail instrument mounts/unmounts in its reserved slot. Nothing else moves.
- **↔Analysis:** console rises alone; metric module empties ↔ header chips (only re-homing element); S-b detail consolidates into rail/header. Existing transition constants + reduced-motion guards preserved.
- **City switch / no-data:** column persists with switcher (S-E); everything else gated as matrix.
- Degradation (narrow→): trend instrument folds first (its summary lives in the KPI cards) → margin collapses → rail compresses → **table never collapses; spine last, always.** Mobile (≤680): existing mobile behaviours preserved; column may compress width; verify at 1050/760/700 heights + ~1280 width per D3 protocol.

## 7. New aggregate math (the only backend-adjacent spec; frontend `aggregateFeatures` extension)

For selection S with per-nbhd `n_i` (parcels), `pct_i` (=pct_with_unit), `mexcl_i` (=avg_assessvalue_without_unit), `lot_i` (=avg_lotsize):
- Condo share (parcel-weighted, exact): `Σ(n_i·pct_i) / Σ(n_i)`.
- Non-condo parcel count: `nc_i = n_i·(1 − pct_i/100)`.
- Mean excl. condo (non-condo-weighted, exact): `Σ(nc_i·mexcl_i) / Σ(nc_i)` over members with finite `mexcl_i`; if `Σ nc_i = 0` (all-condo selection) → honest — (never 0). Same weighting for lot.
- Deltas: value − city (pp for shares). City baselines from the city aggregate row/values as-built. Honesty labels per formula class: `parcel-weighted · exact` / `≈ of medians` — never stripped.

## 8. Debt absorbed by this build (R10, in-scope)

Remove `.pa-topbar` (+ its CSS); fix the stale file-top ASCII (replace with this contract's §3 outlay); delete the three phantom `detail`-prop comments; fix stale `.dt-toolbar` comment; drop legacy `.sb-year-value` usage on PA (own class); remove dead `.dt--open`; remove `.pa-detail` legacy top-border rules if the detail instrument re-skins. Preserve untouched: all four D3 guards (portal, head cap, flex-start, shrink-fit min-height:0) + render-storm guard — file:line anchors in the recon report.

## 9. Invariants (bind everything)

REFRESH-BY-DESIGN (no year literals; manifest discovery; HOME preset the one exception). Freeze-the-working-core (state channels, math, D6 ramp, search, selection mechanics are working cores — re-home and re-skin, don't rewrite). ~~VIEW-only brush fence.~~ **AMENDED 2026-07-15 (KC): the facet is a SCOPE, not just a lens.** A facet (District / metric range) now drives the KPI cards, the trend graph AND the export — not only the map dim. The fence held that `brushedIds` may drive nothing but the dim; in practice that left city-wide KPIs sitting above a district-filtered table, which read as incoherent. **What survives of the fence, and is now the actual rule: the figures on screen and the figures in the download must never disagree.** So the scope moves as ONE — KPI, graph, export, filename and provenance all follow the same precedence: selection (N≥2) → single row (N=1) → facet view → city. The facet aggregate is a SEPARATE channel from the selection's (`facetAggregate`, not `aggregate`): `selectionMode` disables the facet controls, so feeding one into the other would let a facet switch itself off. **The distribution histogram takes the scope as MARKS, and only from a District (amended 2026-07-15).** Its bars are the city ALWAYS: the card exists to PLACE a scope against the whole spread, so re-binning them over a district's 19 values would delete the comparison it is for. The metric range is the one facet that does not mark — it filters on the histogram's OWN axis, so its marks are the band the slider already draws one slot away, and arming YoY passes 272 of 278 values, washing out the bars from a bare metric switch that asked for nothing. This does not breach the rule above: marks are an annotation, not a figure, and none of this reaches the download. Honesty labels/states never stripped; no false zeros; gaps not zero-bridges. Methodology: %Condo = share of individually-titled condominium parcels (Plan/Unit); never "% apartments". One concern per commit. Legibility: Olivia-followable; header contracts; comments explain WHY. Title Case product typography. D8 dissolves — this contract carries the skin; palette tokens (define once in CSS vars): shell `#0d0e10`, card `#1a1c1f`, hairline `#2a2d31`, text `#f5f6f7`, muted `#8b8f94`, dim `#6b7076`, up/accent `#4ade80`, down `#f88b6b`, table/rail selection `#e8734a`, map selection outline `#8b5cf6` (violet, P4 — top-of-stack, distinct from the ramp). Gloss on chrome, flat on data. Cartography (cream basemap, sequential ramps, D6 YoY ramp) UNTOUCHED.
