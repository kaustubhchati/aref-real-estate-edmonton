# PA Frontend Fix Directives — RECON RETURN (D-F1 … D-F5)

**Date:** 2026-07-05 · **Mode:** RECON ONLY — no code written, no build run, no data changed.
**Method:** 5 read-only recon agents (one per block) + a completeness critic; D-F2's load-bearing
claims independently re-verified by KC-side computation over the served geojson.
**Governing law checked:** DESIGN_SYSTEM Principle 0 + §1.5a/§4, PA_MODE_CONTRACT §3.1/§4/§5/§9,
PA_MODE_CONTRACT_ANNEX lines 72–79 (banners) / 97–105 (S-b float anatomy).
**Status:** STOP-gated. Every block below ends in the decisions KC must rule on. **No build until a per-block go.**

---

## TL;DR — what changed vs the directive's assumptions

1. **D-F1 (keystone) is a contained restyle, not a rebuild.** The tuning bay is a *single* DOM mount
   shared by console-down and console-up; the two rows diverge because Year uses `.pa-tune-row` (flex)
   and the metric range uses `.pa-range-slot` (column-flex, readout forced below). A CSS-grid regrid
   touches no state channel. **One blocking contradiction:** DESIGN_SYSTEM §1.5a line 47 says the
   "Tuning" label was *removed*; D-F1 + the annex want the "⚙ TUNING" banner *restored*. KC must reconcile.
2. **D-F2's reported defect does NOT reproduce on current `main` — VERIFIED.** The YoY legend already
   renders **±15.5 % symmetric** via a *global* p98(|yoy|) clamp (measured p98 = **15.512**, = the coded
   fallback). "+144.7 %" is the 2023 *data max*, not a legend endpoint; "+31.7 %" (claimed 2021 low)
   matches *no* 2021 value. The screenshots are from an older/branch build. The *real* residual defect is
   different (one global E is too wide for calm years, can't tame 2025's p98=108). This reframes the whole block.
3. **D-F3 is ready — but the directive's stated cause is imprecise.** The chip does NOT eat the baseline's
   horizontal space (it's `display:block` on its own line). The baseline clips in the *footer* because a
   non-shrinking delta squeezes it. So deleting the chip alone won't un-clip; the baseline must move to its
   own line. Everything else confirmed (baseline computed & clipped, city name already dynamic).
4. **D-F4 is a one-line CSS fix** (`.pa-detail top:46px → ~208px`). Note: there is **no geolocate control**
   in the code — the third buried button is Fullscreen. Fix covers all three.
5. **D-F5's "corner-tucked sparkline" does NOT reproduce in InfoRail** (already `width:100%` own-row). The
   *real* interior gaps are: no active-metric emphasis, four sub-11px type roles, one raw hex. Plus a live
   §1.3 tension: KC's "mute the rest" collides with the mandatory blue-city / up-down-delta roles.

**Two blocks (D-F2, D-F5) describe symptoms that don't match current `main`.** Pin which build the
screenshots came from before scoping those two.

**Recommended order (unchanged):** D-F1 → D-F3 → D-F4 → D-F5 → D-F2 (D-F2 stays recon until KC rules).

---

## D-F1 — Tuning bay: enforce the fixed grid (KEYSTONE)

> **SUPERSEDED BY P2 (2026-07-06).** D-F1 shipped the "one shared 4-column grid
> `[label | min | track(1fr) | max]`, both rows `display:contents`" approach described
> below. P2 (PA Patch Directives 2026-07-06) replaced it: the track was still a `1fr`
> residual flanked by `max-content` value cells, so its length + x drifted between
> metrics/states — a Principle-0 violation. P2 rebuilt the bay as a **vertical flow of
> fixed two-row grids** (name header + `[min · fixed track · max]`), aligning the Year and
> range tracks by shared fixed cell-width tokens (`--pa-tune-num-w` / `--pa-track-w`), so
> the track is now a fixed width at a fixed x on every control and state. The banner
> restore + §1.5a reconciliation from D-F1 stand; only the grid mechanism changed.

**Where it lives.** Markup `PropertyAssessmentMap.jsx:1296–1317` (`.pa-col-mod.pa-col-tuning`); CSS
`index.css:1233–1265` + shared slider base `index.css:1461–1542`.

**Findings (recon Q1–Q5):**
- **Q1 — two rows, two layout systems.** Year row = `.pa-tune-row` (`PAMap.jsx:1300–1314`): fixed label
  `.pa-tune-name` · flexing track `.pa-tune-slider` · inline-right readout `.pa-tune-year`. The metric row
  is **not authored here** — it's the **RangeFacet portaled in** at `.pa-rack-range-slot` (`PAMap.jsx:1316`);
  its real markup is `DataTable.jsx:1131–1161`. The chip list is a *separate* module (METRIC,
  `PAMap.jsx:1280–1289`), not part of tuning.
- **Q2 — the below-track readout is a separate element, structurally below.** `.pa-range-top` holds
  label+track; `<strong class="pa-rack-value">` (`DataTable.jsx:1160`) is its sibling, and
  `.pa-column .pa-range-slot{flex-direction:column}` (`index.css:1258`) forces it onto its own right-aligned
  16px line (`index.css:1264`). Documented as intentional "B1" (`index.css:1256–1257`). **D-F1 supersedes B1.**
- **Q3 — NO shared module-label component; restoring banners = 3 edits.** METRIC = SegmentedControl's
  internal `.seg-label` at **10px** (`index.css:1222`, below the 11px floor). **⚙ TUNING = deleted** (comment
  "C2 — the '⚙ Tuning' module label is removed", `PAMap.jsx:1297–1298`) → **defect (d) confirmed**. **LEGEND
  (AF-1) = no banner strip**, only the bare metric title `.legend-title` (`Legend.jsx:72`) → **AF-1 confirmed**.
  *A CSS hook `.pa-col-lab` already exists for exactly this (`index.css:1194–1199`) but is referenced in zero
  JSX* — planned, styled, never wired. (It's tokened at 13px `--t-xs`, not the §1.5a 11px `--t-2xs`.)
- **Q4 — SINGLE mount, shared by both console states.** Only the METRIC module is `{!dockOpen}`-gated
  (`PAMap.jsx:1280`); TUNING (`:1296`) + the range portal target (`:1316`) are not, so the sliders are the
  *same DOM node* down and up. **AF-2 CORRECTED:** the "blank stub in console-up" is a **selection-mode
  disable, not a console-position artifact.** `disabled={selectionMode}` (`DataTable.jsx:856`) → `off` →
  readout becomes `—` (`:1160`) + `.is-off` dim (`index.css:1541`). In **S-c (console-up, N=0) the range is
  still live and shows a value** — so "up = blank" is false; blank ⇔ a selection filter is inapplicable.
- **Q5 — a regrid touches no channel.** Year wiring (`slideYear` `PAMap.jsx:1311`, throttle `:530–545`,
  `sliderYear` `:332`, `--pct` `:1181`) and the range portal (`setRange` `DataTable.jsx:542`, `createPortal`
  `:848–859`, target `PAMap.jsx:1316`) all key off `value`/props, not DOM position. Re-slotting into grid
  cells preserves everything.

**Frozen cores:** year state+throttle+reduced-motion (`PAMap.jsx:332,526,530–545`); range filter+portal
(`DataTable.jsx:542,848–859`; target `PAMap.jsx:1316`); brush fence (`DataTable.jsx:567–571`); metric-chip
two-home SegmentedControl (`PAMap.jsx:1280–1289` + `DataTable.jsx:656–668`); `.pa-float` camera selector
(`PAMap.jsx:1264` → `interactions.js:178`); RangeFacet reserved `is-off` slot (`DataTable.jsx:1132,1160`).

**Mechanical root cause of defect (a):** `--pa-track-w:150px` is declared "one source of truth"
(`index.css:158`) but the column overrides both tracks to `flex` (`:1236`, `:1261`) so the fixed width never
applies. Regrid routes both tracks back through the token.

**Proposed approach (prose):** one shared 4-column grid `[label | min | track | max]` with fixed
label/min/max widths + a fixed track length; apply it to both `.pa-tune-row` and the RangeFacet's
`.pa-range-slot`; split `.pa-rack-value` into min (left) + max (right) cells flanking the track; map Year to
value-right + empty-but-reserved-left; restore the three banners via the unused `.pa-col-lab` hook. One grid
serves both console states (single mount).

**DECISIONS FOR KC:**
1. **Fixed column template — exact widths.** LABEL (fit "Median"/"Year" @13px), MIN + MAX (fit `$1.09M`,
   `+144.7%`, `−14.3%` @16px tabular-nums), TRACK length (reuse `--pa-track-w:150px`?). Column ≈196px wide —
   confirm the four widths close inside it.
2. **⚙ TUNING banner contradiction (BLOCKING).** DESIGN_SYSTEM §1.5a line 47 ("'Tuning' removed") + code C2
   comment vs D-F1 defect (d) + annex:73 ("⚙ TUNING"). Restore the banner? If yes, update §1.5a in the same
   commit so the docs stop disagreeing. Include the ⚙ glyph?
3. **Banner component.** Reuse the unused `.pa-col-lab` as ONE shared banner span across METRIC/TUNING/LEGEND
   (Olivia-legible; also fixes AF-1 + the 10px `seg-label`), or add per-module inline banners?
4. **Panel-label token.** Restored banners at `--t-2xs` 11px per §1.5a (also lifts the current 10px violation)?
5. Confirm the annex's below-track readout (annex:76) is superseded by the flanking min/max cells.

---

## D-F2 — YoY first-crossing outliers (RECON + PROPOSAL ONLY — methodology-bearing)

**VERIFIED FACTS (code + data, KC-side re-computed):**
- **YoY value = backend** matched-sample log-then-difference (`04_aggregate_historical.R:274`,
  `05_aggregate_current.R:273`). **YoY colour-domain = frontend, client-side, NOT in the manifest**
  (`choroplethStyle.js:273–281` `yoyStopsFromValues`; caller `PAMap.jsx:485–504`). The manifest's
  `colourScaleByYear` carries only the median-value quantiles.
- **The domain is a GLOBAL (all-years) robust clamp:** E = p98(|yoy|) over every neighbourhood-year
  (`yoyAllValues`, `PAMap.jsx:485–496`), symmetric `−E…−1·+1…+E` with a ±1 % plateau (`yoyDivergingStops`,
  `choroplethStyle.js:251–261`). Fallback `YOY_FALLBACK_E = 15.5`.
- **Measured (replicating the JS `quantile` exactly over the served geojson, 403 nbhds × 15 yrs = 3720 vals):**
  - **Global p98(|yoy|) = 15.512** → the live legend shows **±15.5 % symmetric**.
  - Per-year extremes: 2023 max **+144.67** (n=105 Blatchford), +111.32 (n=334), +103.54 (n=396);
    2021 max **+85.27** (n=738 Glenridding); 2026 **+60.94** (n=145 Gorman). All match the recon table.
  - **2025 is the artifact year: per-year p98 = 108.25, #>+50 % = 7.** Calm years: 2020 p98=9.21, 2021=8.07,
    2023=14.73 (my figures replicate the JS quantile; they supersede the recon's asserted 5.26/6.16/13.97).
  - Domain if >+50 % excluded: 2023 [−14.29, +18.58], 2021 [−10.44, +10.51] — an 8× collapse of the positive arm.
- **The reported defect endpoints do NOT reproduce.** "+144.7 %" = the 2023 data max (not the legend);
  "+31.7 %" isn't any 2021 value (2021 spans −10.44…+85.27). ⇒ **the screenshots predate the current global-clamp build.**
- **Matched-base count is NOT emitted.** Computed transiently (`04:275 n_matched=n()`) then dropped at the
  join (`04:286–288`); `05` doesn't compute it. Only `n_properties` (full-pop gated) exists. Strategy A needs
  a backend emit (un-drop in 04, add to 05, carry to 06/07 geojson + 07b combine).

**The REAL residual defect:** one fixed global E=15.5 is ~2.5× too wide for low-volatility years (genuine
±5 % moves render pale) yet cannot contain an artifact year (2025). It's a deliberate "same scale every year"
choice (`PAMap.jsx:468`) trading per-year discrimination for cross-year comparability.

**Frozen cores:** the matched-sample YoY math + the NA suppression gate (gaps-not-zeros, `04:295–297`,
`05:289–290`); `yoyDivergingStops` ramp structure; the Legend renderer. A strategy edits only *how E is chosen*
at the one seam `yoyStopsFromValues` + its caller.

**STRATEGY MENU (agent recommends B-refined; KC rules):**
- **(A) First-crossing suppression** — needs the missing `n_matched` emit; wouldn't cleanly catch Blatchford
  (base ~105, above any sane threshold); the true first-computable-YoY years already show NA via the existing
  gate. **Not recommended as the primary tool** — keep only as an `n_matched` *disclosure* badge.
- **(B) Robust per-year clamp (RECOMMENDED)** — set E from a robust spread of *that year's* YoY (p90|yoy| or
  k·MAD), clamped between a floor + cap (domain constants, refresh-by-design). Keeps every value (auditable),
  restores calm-year discrimination, and the cap tames 2025. Frontend-only (domain is client-side) — smallest
  blast radius. Ramp + legend untouched.
- **(C) Fixed symmetric ±E** — essentially the status quo (E=15.5 global); the very thing the defect complains of.
- **(D) B (or C) for the scale + A as disclosure-only** — the fullest, honest option.

**Tradeoff KC owns:** per-year adaptivity abandons the deliberate "same scale every year." *But* the
median-value metric is already per-year (manifest), so this **aligns** YoY with the rest of PA.

**Also (AF-4/AF-5):** in the S-b float the sparkline colour = series trend direction (`InfoRail.jsx:75–76`)
while the delta chip colour = nbhd-vs-city sign (`InfoRail.jsx:84`) — different axes, so Kinglet Gardens shows
coral-trend + green-delta, reading as a contradiction. Separate encoding decision (belongs with D-F5).

**DECISIONS FOR KC:**
1. **Pin the build.** The defect doesn't reproduce on current `main` (legend already ±15.5 % symmetric).
   Confirm whether the screenshots are from an older/branch build before scoping — part of the fix may be landed.
2. **Strategy:** per-year robust clamp (B, recommended) / B + n_matched disclosure (D) / keep global (C) / defer.
3. If per-year: which robust statistic (p90|yoy| vs k·MAD) + floor/cap constants (needed so 2025's p98=108
   can't wash out and a flat year isn't over-amplified)?
4. Domain home: keep client-side (frontend-only) or move to the manifest per-year (matches median-value; bigger blast)?
5. AF-4/AF-5: reconcile the sparkline-vs-delta colour contradiction, or annotate the two distinct encodings?

*(Any go here that touches backend triggers a SECOND STOP before the write — CLAUDE.md §7.)*

---

## D-F3 — KPI cards: drop methodology chips, surface the city baseline

**Where it lives.** `KpiCard` `DataTable.jsx:981–1002`; assembled by `KpiRail` `:890–975`.

**Findings:**
- **Chips are ONE hardcoded object literal** at `DataTable.jsx:901`, built only in the S-e aggregate branch
  (`{median:"≈ Of Medians", mean:"Parcel-Weighted · Exact", yoy:"≈ Weighted", condo:"Weighted"}`); S-c/S-d pass
  `tags:{}`. One authoring site to remove.
- **Directive's stated cause is imprecise.** The chip is `display:block` on its own label-row line
  (`index.css:1107`) — it never competes horizontally. The baseline clips in the **footer**: `.dt-tile-city`
  is `overflow:hidden;text-overflow:ellipsis` (`index.css:1116`) sharing a flex row with the non-shrinking
  delta `.dt-tile-d{flex:0 0 auto}` (`index.css:1117`) in a half-width tile. **⇒ deleting the chip alone does
  NOT un-clip;** the baseline must move to its own line.
- **Baseline is computed, passed, and merely clipped** — `cityBaseline = aggregateFeatures(gjView.features)`
  (`PAMap.jsx:1060–1063`) → prop (`:1194`) → `cityTxt` (`DataTable.jsx:927`).
- **City name already dynamic** (§6 satisfied): `cityName` prop ← `city` state ← `?city` param / `DEFAULT_CITY`
  (`PAMap.jsx:325–326`, `dataSources.js:24,28`). Keep the neutral `"city"/"City"` fallbacks.
- **Disclosure already persists** in the CSV export sidecar (`exportData.js:144–146`, "parcel-weighted (exact)"
  / "median of neighbourhood medians (approx)") — so §9 "honesty never stripped" holds at the data-product level.

**Frozen cores:** KpiRail scope/figure/order logic + card order (`DataTable.jsx:890–975`); delta/baseline math
(`:923–951`); `aggregateFeatures` (`PAMap.jsx:1060–1063`); city plumbing (`:325–326`). Excluding-Condos card
(`key:exclcondo`, uses `foot`) has no tag/baseline — leave untouched.

**DECISIONS FOR KC:**
1. **Disclosure single-home:** About & tips popover `.pa-info-pop` (`PAMap.jsx:1347`, recommended — reuse an
   existing unobtrusive home) / a new muted footnote under the card stack / rely on the CSV sidecar only.
2. **Approve moving the baseline OUT of the footer** onto its own top-right line (per CONTRACT §4 "city baseline
   top-right"), footer holds only the delta. (Required — deleting the chip alone won't un-clip.) Verify in S-d too.
3. Confirm the tag removal is an intentional deviation from CONTRACT §4 line 84 (mark it superseded so the chip
   isn't "restored" later as a regression).

---

## D-F4 — Detail float: reposition below the nav stack

**Where it lives.** `.pa-detail` CSS `index.css:634–642`; rendered `InfoRail.jsx:97`; mounted `PAMap.jsx:1371`
(`{url && !dockOpen && detailRail}`) inside `.pa-canvas` (position:relative, `index.css:507`).

**Findings:**
- Current: `position:absolute; right:12px; top:46px; z-index:14; width:224px` (`index.css:635–636`). No media
  override — `top:46px` at every width.
- **`top:46px` lands mid-nav-stack.** Nav stack (origin = `.pa-canvas` top): search peek ~y10–39
  (`.pa-search-peek` z:20, `index.css:485`); zoom group ~50–112; fullscreen ~122–154; reset ~164–196. **Nav
  bottom ≈ 196px.** Float z:14 paints over all except the z:20 search peek — exactly the symptom.
- **No z-index war** — burial is purely geometric (float overlaps x/y + higher z than the z:2 control container).
  Correct fix is positional: don't lower z.
- **No geolocate control exists** (grep: zero `Geolocate` hits). The third buried button is FullscreenControl
  (`MapView.jsx:128–133`). Fix covers all three regardless. Controls: NavigationControl `MapView.jsx:123`,
  Fullscreen `:128–133`, reset `PAMap.jsx:1025–1026`.

**Frozen cores:** float S-b mount gating (`PAMap.jsx:1371`); the nav-control wiring (read, don't modify);
`.pa-canvas` position:relative (coordinate origin); the interior (D-F5 owns it).

**Proposed:** change `.pa-detail top:46px → ~208px` (196 nav bottom + ~11px gap matching the existing
search-peek→zoom gap), comment the derivation. Leave right/width/z.

**DECISIONS FOR KC:**
1. **Literal vs measured:** commented derived literal (~208px, recommended — simplest/Olivia-legible) OR a
   JS/ResizeObserver read of the nav container bottom into `--pa-nav-bottom` (fully refresh-proof if controls
   change, but adds JS)?
2. Gap size: reuse the ~11px search-peek→zoom gap, or a DESIGN_SYSTEM spacing token?
3. Short-viewport: acceptable for the float to extend toward the bottom console, or cap height / allow internal
   scroll (arguably crosses into D-F5)?

---

## D-F5 — Detail float: legible vertical interior (re-skin to annex anatomy)

**Where it lives.** `InfoRail.jsx:96–142`; CSS `index.css:634–661` (+ D1 case override `:1271–1282`).

**Findings — the interior is MOSTLY already the annex stack:**
- **"Corner-tucked sparkline" does NOT reproduce.** InfoRail already renders name → sub → **full-width
  own-row sparkline** (`.pa-detail .sparkline{width:100%}` `index.css:651`) → 3-up triplet → hairline → condo
  key-values. The observed corner-tuck isn't in this component.
- **The three REAL gaps:**
  1. **No active-metric emphasis.** All three triplet values are `.pa-trip-v` @12px/weight-500 (`index.css:654`),
     differentiated only by colour. KC's "highlight chosen, mute the rest" is unimplemented; the active Value is
     actually *less* prominent than the blue City cell.
  2. **Four sub-floor type sizes:** sub 9px (`:650`), kv 10px (`:658`), note 9.5px (`:661`), trip-v 12px
     off-scale (`:654`) — all below the §1.5a 11px floor / off the role table.
  3. **One raw hex** `#c7cacd` in `.pa-kv-v` (`:660`) — violates §1's token rule.
- **Contrast is largely FINE, not the failure the directive suspected.** `--pa-mut #9ba1a8` passes ~8:1 (it was
  raised in §1.2). The only sub-4.5 pair is the suppressed `--pa-dim` value (~3.87:1), which §4 *permits* for
  inert text. So the "dense grey-on-dark" concern is really a *type-size* + *emphasis* problem, not contrast.
- **Sparkline is the SHARED component** (`components/Sparkline.jsx`), fed the upstream `useMemo` `sparkValues`
  (`PAMap.jsx:857`); the render-storm memo guard is `TrendSparkCell` (`DataTable.jsx:97–106`) — the TABLE's, out
  of scope. Any dot/stroke change must be an additive prop or it ripples into the table.

**Frozen cores:** InfoRail data/math helpers, trajectory stroke, delta, condo figures, compact `chromeFmt`,
STATE_NOTE (`InfoRail.jsx:23–92`); shared Sparkline; TrendSparkCell memo (`DataTable.jsx:97–106`, don't touch);
suppressed em-dash branch; D1 Title-Case override (`index.css:1271–1282`) — the annex mockup shows ALL-CAPS but
§2 mandates Title Case; keep de-capped.

**DECISIONS FOR KC:**
1. **Scope confirm:** D-F5 = the interior gaps (emphasis + type-scale + raw hex), not a layout rebuild? If you
   truly saw a corner-tucked sparkline, it's on a different surface (not InfoRail) — point me to it.
2. **§1.3 colour-role tension (BLOCKING for the triplet).** "Emphasise active metric bold + its colour, mute the
   rest" collides with §1.3's *mandatory* blue City (`--city`, colour-blind-safe) and up/down Delta. Which wins?
   Recommended: emphasise the active **Value** with **bold + size only**, keep City blue + Delta semantic — no §1.3 violation.
3. Triplet label: keep generic "Value" (§3 calls verbose metric-name labels a defect) or the active-metric short
   name (annex shows "MEDIAN")? (annex vs §3 conflict.)
4. Type-scale bump makes the float taller → coordinate with D-F4's position work.
5. Endpoint dot: keep the shared Sparkline's active-year dot, or add an additive prop for a trajectory-coloured dot?

---

## Cross-cutting flags

- **AF-1 (LEGEND banner) — CONFIRMED missing**, folded into D-F1 (Q3). No uniform "LEGEND ·" strip; only the
  bare metric title. The shared `.pa-col-lab` fix restores it alongside METRIC/TUNING.
- **AF-2 (console-state divergence) — REFRAMED.** Not a console-position artifact: the readout blanks whenever
  `selectionMode` disables the range (`DataTable.jsx:856`), including S-b₂/S-e. The grid must show reserved `—`
  in *both* min/max cells when off, never a collapsing gap.
- **AF-3 (historical %condo 0 % false-zeros) — flagged only, KC-GATED.** No recon touched it (per the gate). The
  two %condo surfaces are the Condo KPI card (`DataTable.jsx:950`) and the InfoRail condo block
  (`InfoRail.jsx:134`). If the historical 0 % is a placeholder, it's D-BE1 territory (backend, gated on KC
  providing context first). No action taken.
- **Build provenance (D-F2 + D-F5).** Two blocks describe symptoms absent from current `main`. Pin the build
  before scoping those two, or risk targeting an already-landed state.
- **No contradictions between reports.** D-F4 and D-F5 agree the float interior is `InfoRail.jsx:96–142`,
  mounted `PAMap.jsx:1371`, styled `index.css:634–661`.

---

## Frozen-core inventory (build must re-home/re-skin, NEVER rewrite — §5/§9)

Year channel + throttle + reduced-motion · Range filter + portal target · Brush fence (VIEW-only) · Metric-chip
two-home SegmentedControl · `.pa-float` camera selector · Matched-sample YoY math + NA suppression gate ·
`yoyDivergingStops` ramp + Legend renderer · `aggregateFeatures` city baseline · city-name plumbing · shared
Sparkline + TrendSparkCell memo · D1 Title-Case override · suppressed em-dash / honesty branches. File:line
anchors per block above.
