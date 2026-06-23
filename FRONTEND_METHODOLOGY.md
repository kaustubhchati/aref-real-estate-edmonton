# Frontend Methodology

> **Created 2026-06-23.** First version. Records how the frontend has been built and
> standardized so far (as-built), the rules already in force, and the forward sharing plan
> — the latter folded in from `FRONTEND_AUDIT_2026-06-23.md`. Every as-built claim here was
> verified against the actual code on 2026-06-23 (file:line cited inline); no contradiction
> with the audit was found.
>
> **Updated 2026-06-23 (same day):** added §2 principle 7 — the standard choropleth ramp
> lock (OrRd with a soft-yellow lifted low end) — recorded alongside the commit that aligned
> Property Assessment's assessed-value `$` metrics to that low end. Then extended principle 7
> with the YoY diverging redesign (blue decline / warm-bone neutral `#f0e8da` / OrRd-red
> growth) and the canonical OrRd high `#cc0000` (Ferrari `#7a0000`/`#8a1208` retired). Then
> made the YoY shading **scale** data-driven (symmetric ±95th-pct-of-|yoy| extent, `yoyStops`)
> so it adapts per year like the sequential quantile metrics instead of a fixed ±15%.
>
> **What this is:** the single methodology reference for the `website/` frontend. Read it
> before adding a section or refactoring shared code. It does not replace `CLAUDE.md`
> (project-wide authority) — it sits under it, scoped to the frontend.
>
> **Companion doc:** `FRONTEND_AUDIT_2026-06-23.md` is the detailed adversarial audit. This
> file is the durable summary + plan; the audit is the evidence. Sections 3–5 below are the
> audit's recommendations, restated here as the standing plan.

---

## 1. Architecture as-built

This describes the **current** frontend only — no proposals. The frontend is a React + Vite
app under `website/`. Routing is flat: one `<Route>` per nav leaf in
`website/src/main.jsx`, wrapped by `website/src/shell/Layout.jsx` (Header + Nav + Footer +
a `SectionErrorBoundary` around the routed `<Outlet/>`).

There are **four** live map routes. Three are GeoJSON **choropleths** that share one map
component; the fourth is a **point** map with its own mount (the deliberate exception).

### The three choropleth sections (share `components/MapView.jsx`)

| Section | Route | Component | Style contract | Source shape |
|---|---|---|---|---|
| Property Assessment | `/properties/property-assessment` | `content/property-assessment/PropertyAssessmentMap.jsx` | `property-assessment/choroplethStyle.js` + `interactions.js` | city + year + metric; 5 polygon states |
| Dwelling Units | `/activity/dwelling-units` | `content/building-permits/PermitChoroplethMap.jsx` | `building-permits/permitChoroplethStyle.js` | year + metric/sub; 3 states; a/b crossfade |
| Business Counts | `/economy/business-counts` | `content/economy/BusinessCensusMap.jsx` | `economy/businessCensusStyle.js` | single file, no year; 2 states |

- **Shared map canvas** — all three render `website/src/components/MapView.jsx`
  (`PropertyAssessmentMap.jsx:28,451-462`; `PermitChoroplethMap.jsx:31,530-541`;
  `BusinessCensusMap.jsx:24,372-382`). `MapView` is section-agnostic: it loads **one
  GeoJSON source**, adds the section's `layers`, and exposes a single `onLoad(map)` hook so
  the section wires its own interactions (`MapView.jsx:37-48`).
- **Property Assessment** is the richest: it resolves a `(city, year)` URL via
  `property-assessment/dataSources.js` (`:46-55`), colours by one of five metrics, and has
  neighbourhood search + a copy-stats button living in `interactions.js`
  (`PropertyAssessmentMap.jsx:56-59,201-202`).
- **Dwelling Units** colours by a 3-metric + 2-sub system and dissolves between metrics with
  a **two-fill-layer (a/b) opacity crossfade** — `permitChoroplethStyle.js:267`
  (`FILL_LAYER_IDS = ['pnbhd-fill-a','pnbhd-fill-b']`), driven at
  `PermitChoroplethMap.jsx:234-247`.
- **Business Counts** is the simplest: one committed file
  (`BusinessCensusMap.jsx:41`, `business_census_2025.geojson`), no year axis, a two-state
  (`data` / `no_data`) model on the `census_state` field (`businessCensusStyle.js:33-47`).

### The point-map exception (does NOT use the shared `MapView`)

The Building Permits **point** map (`/activity/construction-improvement`) is a deliberate
exception and is **not** built on `components/MapView.jsx`:

- `content/building-permits/PermitMapView.jsx` is its **own** MapLibre mount
  (`:166-210`, its own `new maplibregl.Map(...)` + `map.remove()` teardown). It loads a
  **PMTiles vector** source by byte-range from Cloudflare R2 — `R2_BASE_URL`
  (`PermitMapView.jsx:51`), `pmtiles://…/permits.pmtiles` (`:54`),
  `addSource(..., { type: "vector" })` (`:193-196`) — and registers the `pmtiles` protocol
  exactly once behind a module flag (`:38-44`, invoked `:167`).
- `building-permits/permitStyle.js` holds its circle layer (`:103-129`), the job-group
  colours (`:44-59`), the construction-value → radius ramp (`:74-97`), and the client-side
  filter builder (`:262-296`).
- `content/building-permits/BuildingPermitsMap.jsx` drives Year / type / month / value-tier
  as **client-side `map.setFilter` calls on the already-loaded tiles** — no file swap
  (`:310-316`; all 18 years live in one PMTiles).

Why the exception: `MapView` loads a single GeoJSON; permits is 226k points served as vector
tiles. Forcing it through the GeoJSON path would be worse, not better — it stays separate by
design.

### Manifest-driven year discovery

Available years are read from a committed manifest, never hardcoded in components. The
**manifest shape follows the source** (per `CLAUDE.md §2`), so the two manifest-bearing
sections read **different shapes** and that is intentional:

- Property Assessment reads a **nested** shape:
  `cities.<city>.assessment.{years, defaultYear, colourScaleByYear}`
  (`property-assessment/dataSources.js:34-40,47,52,59`).
- Dwelling Units reads a **flat** shape: `{ years, defaultYear }` at the root
  (`PermitChoroplethMap.jsx:59-65,149-150`).
- Business Counts has no year axis, so no year manifest — it fetches one fixed file.

Adding a year is a **pipeline-only** change (emit the GeoJSON + regenerate the manifest); no
frontend edit.

### Keyed-remount / in-place year-swap

A year change must **not** tear down and rebuild the map (that would drop the WebGL context,
refetch, and reset zoom/pan). The pattern, in `components/MapView.jsx`:

- A single **create-on-mount** effect builds the map once (`:72-136`, empty deps;
  `map.remove()` only in unmount cleanup at `:130`).
- A separate **in-place dip-and-swap** effect (`:144-202`, deps `[geojsonUrl, sourceId]`)
  calls `source.setData(geojsonUrl)` on the **persisting** map when the URL changes — one
  WebGL context, no remount. It dips canvas opacity, swaps, fades back, and respects
  reduced-motion (instant path at `:151-152`).
- The map is therefore **not** keyed by URL. Caught render errors are cleared via a
  `resetKey` prop on `components/MapErrorBoundary.jsx` (`componentDidUpdate` compares
  `resetKey`, `:32-36`) instead of a React `key` remount. Consumers pass `resetKey={url}`
  (`PermitChoroplethMap.jsx:529`).

---

## 2. Standardization principles (locked)

These are the rules already in force across the frontend. They are **decisions, not
suggestions** — follow them in every new section and every refactor.

1. **Gel/skeuomorphic styling is for UI chrome only — never data marks.** The "gel" recipe
   (one source of truth in `index.css` `:72-85`) dresses panels, selects, popups, zoom
   controls, segmented toggles. It must **never** touch a data symbol: the legend panel is
   gelled but its swatches are not (`index.css:672-673,708-714`), and choropleth fills read
   the raw ramp hex (`choroplethStyle.js:54-61,427-428,438`). Verified clean on 2026-06-23.
2. **Animate only `transform` and `opacity`.** Motion keyframes animate opacity/transform
   only (`index.css:1034-1036,1039-1049`), with a mandatory `prefers-reduced-motion` guard
   (`:1051-1060`) and a JS mirror in `components/motion.js` (`:29-49`). The one current
   exception — the map-skeleton shimmer animating `background-position`
   (`index.css:584-585`) — is loading-only and self-disables under reduced motion (`:586`).
   Do not add new non-compositor animations.
3. **Join on the numeric Neighbourhood ID — never the name.** Every choropleth sets
   `promoteId` to the numeric id: `"Neighbourhood ID"` (PA `:457`, Dwelling Units `:536`),
   `"neighbourhood_id"` (Business `:378`). Feature-state and fly-to key off that id
   (`interactions.js:82-92,232`). The display name is used for **search lookup only**
   (`interactions.js:223-224`), then resolved back to the id. Names are never a join key.
4. **Legibility bar (Olivia's bar).** Per `CLAUDE.md §6`: code must be as sophisticated as
   the least-experienced maintainer can follow, and no more. Real structure that aids clarity
   (a shared `MapView`) is welcome; cleverness the problem didn't ask for is not. If a
   proposed abstraction reduces clarity, reject it and say so.
5. **Freeze the working core.** The shipped, validated behaviour (the three maps, the
   point map, the keyed-remount swap) is not to be churned. Refactors extract duplication
   **without changing behaviour**; they are not an invitation to redesign.
6. **Defer speculative generality.** Build for sections that exist, not ones that might.
   `MapView` exposes exactly one hook (`onLoad`) and the file says it will generalise "only
   once a second section actually needs the same wiring" (`MapView.jsx:13-17`). Extract on
   the *second* real use, not the first imagined one.
7. **Standard choropleth ramp = OrRd with a soft-yellow lifted low end (DU ramp),
   quantile-anchored legend, for all non-diverging metrics.** The reference is the Dwelling
   Units ramp: soft warm yellow low end (`RAMP_FLOOR` `#fbe3a0`, applied via `rampFloor()` —
   `components/choroplethTheme.js:29,36-37`), the existing OrRd from median up, and a
   quantile-anchored legend (max / Q75 / median / Q25 / min). Reference definition:
   `permitChoroplethStyle.js` `RAMP_SEQ` (`:115-121`). Business Census
   (`businessCensusStyle.js` `RAMP_ORRD`) already matches it; Property Assessment's
   assessed-value `$` metrics (`median_assessvalue`, `avall_public`) were aligned to the same
   low end (`choroplethStyle.js` `RAMP_ASSESSED:55`, via `rampFloor`). The low-stop lift
   fixes cream-on-cream blending against the `#f7f1df` basemap. **The canonical OrRd high is
   `#cc0000`** — the older Ferrari deep-reds `#7a0000` / `#8a1208` are retired (they were
   never live in code; do not reintroduce them). **Exceptions (locked separately): YoY stays
   DIVERGING** — blue decline → warm-bone neutral (`RAMP_YOY_NEUTRAL` `#f0e8da`, low-chroma so
   0% separates from the `#f7f1df` basemap without going whiter) → OrRd-red growth, with the
   positive arm reusing the sequential ramp's upper warm stops (`#fbe3a0` / `#ef9a4a` /
   `#cc0000`) so YoY growth reads the same red as the sequential high. Its **scale is
   data-driven like the sequential quantile metrics** — not a fixed ±15%: a symmetric domain
   ±M where M = the 95th-percentile of |yoy| over aggregated polygons, so the shading adapts
   to each year's spread while 0% stays neutral (`choroplethStyle.js` `yoyStops`, `YOY_STOPS`
   the ±15% fallback; DU's `yoy_pct_permits` already does this via `divergingStops`).
   **Median year-built = its own warm reversed ramp**; **lot size = its own
   amber-sienna ramp** (`RAMP_AREA`, area not `$`, deliberately distinct hue). For the
   sequential ramps, only the low end was ever the problem — median-and-up is not touched
   there.

---

## 3. Sharing plan — forward

These are the recommendations from `FRONTEND_AUDIT_2026-06-23.md §1`, restated as the
standardization roadmap. Each was re-verified to still exist on 2026-06-23. **Scope is
exactly these items** — nothing beyond what the audit found. All are behaviour-preserving
extractions of *leaf* duplication; none touch the divergent per-section logic.

| Item | What collapses | Into what shared signature | Why it's safe |
|---|---|---|---|
| **S1** | The hover / click-to-pin / dblclick-fly interaction block, written ~3× (`interactions.js:68-263`; `PermitChoroplethMap.jsx:267-398`; `BusinessCensusMap.jsx:147-282`) | `installChoroplethInteractions(map, { sourceId, fillLayerIds, idProperty, gj, buildPopup, onHover, onPinned }) → { flyAndPinByName, cleanup }` | Logic is ~95% identical; only the layer ids, source id, id property and popup builder differ — all become parameters. PA keeps its search/copy-button on top of the returned handle. |
| **S2** | `bboxOfGeom` / `flyToFeature` / `findFeatureById`, triplicated (`interactions.js:289-322`; `PermitChoroplethMap.jsx:75-99`; `BusinessCensusMap.jsx:47-72`) | `components/geo.js`: `bboxOfGeom(geom)`, `flyToFeature(map, feat, opts)`, `findFeatureById(gj, idProperty, id)` | Pure functions; `bboxOfGeom` is byte-identical, `flyToFeature` identical, `findFeatureById` differs only by id property (now a param). Zero risk. |
| **S3** | `escapeHtml`, defined 4× byte-identical (`choroplethStyle.js:292`; `permitChoroplethStyle.js:372`; `businessCensusStyle.js:253`; `permitStyle.js:154`) | `utils/html.js → escapeHtml(s)` | Same five-entity replace everywhere; pure. The one §3 item that safely touches the point-map style file too. |
| **S4** | `quantile`, defined 3× identical (`choroplethStyle.js:181`; `permitChoroplethStyle.js:134`; `businessCensusStyle.js:94`) | `utils/stats.js → quantile(sorted, p)` | Identical linear-interpolated quantile. Pure. |
| **S5** | The "ramp stops from GeoJSON quantiles" routine, ~3× (`metricStops`/`sequentialStops`/`bcensusMetricStops`) | `utils/stats.js → quantileStops(values, ramp)` (caller still does its own filter) | Shares the quantile-to-stops core only; each section keeps its tiny filter (the state field is the real difference). PA's IQR tail-break path stays PA-only. Partial on purpose — fuller unification would bury the difference. |
| **S6** | `fmtInt` (and `fmtIntPopup`), re-implementing the shared formatter (`permitChoroplethStyle.js:64`; `businessCensusStyle.js:58,276`) | delete; import `utils/format.js → fmtNumber` (`:30`) | Behaviourally identical to `fmtNumber`. The local guard `!Number.isFinite(+v)` vs `fmtNumber`'s `isNaN(+v)` diverges only on ±Infinity, which never occurs for these count fields — so the swap is safe. |
| **S7** | The fill-opacity expression, the highlight outline layer, and the label symbol layer, ~identical in all three style files (`choroplethStyle.js:482-494,580-597,601-617`; `permitChoroplethStyle.js:252-264,332-349,351-367`; `businessCensusStyle.js:175-187,213-230,232-248`) | factory helpers in `components/choroplethTheme.js`: `fillOpacityExpr(stateField, aggValue)`, `highlightLayer(id)`, `labelLayer(id)` | Highlight + label layers are character-identical bar the id. Fill-opacity is identical bar the **state field** (`polygon_state` vs `census_state`) — so it must be parameterized, not hardcoded. (Dwelling Units already exports `FILL_OPACITY_EXPR`; the other two still inline a copy.) |

**Suggested sequencing:** the pure leaf extractions (S2, S3, S4, S6) land first and
independently; S5 builds on S4; S1 and S7 (the larger, higher-payoff consolidations) land
once their dependencies exist. Each is a one-concern commit.

> The audit's §1 also lists three additional, lower-priority sharing items — **S8** (shared
> `MAP_VIEW`/`BASEMAP_STYLE`), **S9** (a `useScrollShadow` hook), **S10** (a thin manifest
> fetch wrap; the manifest *readers* stay separate). They are real but out of this roadmap's
> stated scope — see `FRONTEND_AUDIT_2026-06-23.md §1` if picking them up.

---

## 4. Explicit non-goals

**The three choropleth section components are NOT to be unified into a single
`<ChoroplethSection>`.** This is a standing decision, not an open question.

They diverge on three axes at once, each genuinely different and each verified on
2026-06-23:

1. **Manifest shape** — nested `cities.<city>.assessment.*` (PA) vs flat `{years,
   defaultYear}` (Dwelling Units) vs no year manifest (Business). `CLAUDE.md §2` makes
   "manifest shape follows source structure" a locked, generative rule.
2. **Control model** — city + year + metric (PA) vs year + metric/sub two-level switch with
   the a/b crossfade (Dwelling Units) vs metric-only (Business).
3. **State model** — 5 polygon states vs 3 vs 2, on two different state fields
   (`polygon_state` vs `census_state`).

Folding those behind one config object would produce exactly the clever, hard-to-follow
indirection the legibility bar (§2.4) forbids. The correct boundary is the one in §3: extract
the **leaf-level** shared utilities so each section shrinks to its genuinely-different
orchestration, and keep the three components as readable siblings. We accept some top-level
structural similarity across the three files (each still wires manifest → stops → repaint →
interactions in its own ~150 lines) in exchange for not coupling three divergent data
contracts — the right trade for a codebase Olivia maintains.

---

## 5. Correctness notes

The audit verified the following on 2026-06-23. This is a **record + checklist**, not work to
do now.

### Verified clean (no action)

- [x] **Joins are all numeric id, never name** — see §2.3 (`promoteId` lines cited there;
  search resolves name → id at `interactions.js:223-232`).
- [x] **No unhandled async** — every fetch checks `!r.ok` and uses a `cancelled` guard in
  cleanup: `PropertyAssessmentMap.jsx:104-114,171-180`; `PermitChoroplethMap.jsx:59-65,
  143-154,184-198`; `BusinessCensusMap.jsx:110-125`; `ReportCard.jsx:83-97`.
- [x] **No WebGL / popup leaks** — each map calls `map.remove()` on unmount
  (`MapView.jsx:130`; `PermitMapView.jsx:209`) and removes its popups in cleanup
  (`interactions.js:250-262`; `PermitChoroplethMap.jsx:395-396`;
  `BusinessCensusMap.jsx:279-280`); the PMTiles protocol registers once behind a flag
  (`PermitMapView.jsx:38-44`).

### Open items (fix later — not this pass)

- [ ] **C2 — reduced-motion gap (count-up).** `PropertyAssessmentMap.jsx` `useCountUp`
  (`:64-79`) runs a `requestAnimationFrame` tween with no `prefers-reduced-motion` guard
  (the file doesn't import `motion.js`). Fix: early-return the target when `reduceMotion()`.
- [ ] **C3 — reduced-motion gap (fill crossfade).** `PermitChoroplethMap.jsx:241-244` sets
  `fill-opacity-transition` to `FADE_MS` and crossfades without going through
  `motion.js`'s `reduceMotion()` / `paintTransition()` gate (it imports only the duration
  constants). Fix: snap (duration 0) under reduced motion, as `MapView.jsx:151-152` already
  does for the year swap.
- [ ] **C4 — in-place-swap race.** `MapView.jsx` (create effect closes over the initial
  `geojsonUrl`; swap effect `:144-202`): if the year changes inside the initial tile-load
  window, the map can show the stale year with no correction. Narrow window; a `MapSkeleton`
  covers it. Fix: reconcile prop vs `loadedUrlRef` in the `load` handler.
- [ ] **C5 — `SearchInput` double-fire on Enter.** `SearchInput.jsx` fires `onSelect` from
  both a keydown handler (`:46-52`) and a native `change` listener (`:35-44`). `e.preventDefault`
  doesn't suppress the `change` event, so Enter can invoke `onSelect` twice. Harmless today
  (`flyAndPinByName` is idempotent-ish); pick one path.

> The audit also records lower-severity open items (C6 year-select accent; CSS1–CSS5: dead
> rules, a duplicate selector, a stale comment, the shimmer property, the permit tier-card
> gel). Out of this checklist's stated scope — see `FRONTEND_AUDIT_2026-06-23.md §3–§4`.

---

## Appendix — UNCONFIRMED (not in the audit)

Observations surfaced while verifying the as-built state on 2026-06-23 that the audit did
**not** cover. Recorded here, deliberately **outside** the plan above, so they aren't folded
into scope:

- **Stale file-header comment in `MapErrorBoundary.jsx`.** The header comment block
  (`:8-15`) still describes the old `key={url}` remount-to-reset approach, but the actual
  implementation is `resetKey` + `componentDidUpdate` (`:32-36`), and callers pass
  `resetKey={url}` (`PermitChoroplethMap.jsx:529`). This is a documentation/comment
  staleness in **code** (not a structural contradiction) — left as an observation only; any
  fix would be a code edit, which this Markdown pass does not make.
