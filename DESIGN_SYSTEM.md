# DESIGN SYSTEM — AREF Open Data Centre (governing design law)

**Status:** Normative. The human-facing companion to `PA_MODE_CONTRACT.md`. Every future frontend directive cites this. Its purpose: convert taste into an enforceable standard so the product reads as a finished institutional artifact, not rough work. Where a component disagrees with this doc, the component is wrong.

**Principle 0 — grid-structured external, dynamic internal.** Fixed frames; only data inside them changes. Governs layout AND controls (a slider track never resizes with its value; a card never reflows with its number).

---

## 1. Tokens — single source of truth (no raw hex or px in components)

All values below live as CSS variables defined once. Components reference tokens only. A raw `#hex` or bare `px` literal in a component is a defect.

### 1.1 Colour — surfaces (dark chrome)
- `--shell: #0d0e10` — console/column chassis
- `--card: #16181b` — KPI/detail tiles (one step DARKER than panel, so tiles read raised)
- `--panel: #1a1c1f` — inner panel surfaces (table frame, trend frame)
- `--hair: #2a2d31` — hairline borders/dividers

### 1.2 Colour — text (all must clear contrast floor §4 on their surface)
- `--tx: #f5f6f7` — primary text/values
- `--tx-mut: #9ba1a8` — secondary/labels (RAISED from old #8b8f94 to clear 4.5:1 on --shell)
- `--tx-dim: #6b7076` — tertiary/suppressed ONLY (never for text that must be read)
- **Interactive text — zone-split (2026-07-14, ratified).** The teal interactive accent (§1.3) is delivered as text in two zone tiers, both in the teal family, differentiated by their surface: **sidebar** metric-button / toggle text = **T2 teal-white `#7defe0`** (legible on the dark teal-petrol active bodies; §4 7.5:1 on petrol-lit); **tuning-bay** value readouts (`--tx-read`, the YEAR/MEDIAN values + legend $bounds) = **T1-bright teal `#2dd4bf`** (the darker/richer shade for the darker tuning-bay glass; §4 9.6:1 on the bay, separates from the warm ramp by hue). Inactive-button text stays the muted key label (`--tx-key`).
  *(NB — the surface tokens `--tx-mut`/`--tx-dim` above are shown at their pre-tonal cool values; the live build derives them warm from `--neutral-hue` at ≤8% sat. That tonal codification is a pending batch, tracked separately — do not treat the cool hexes here as current.)*
- **InfoRail obeys the §1.5a scale (2026-07-14, Fix 3).** The neighbourhood-detail rail (`.pa-detail`) is NOT a quieter bespoke tier — it uses the same role→size table as the KPI cards/console: card title `--t-md`/700, the active-metric **lead value `--t-lg`/700** (the rail's dominant number), triplet values `--t-sm`/600, kv rows `--t-xs`, labels `--t-2xs` muted. §1.3 semantics preserved: lead value white, city baseline `--city` blue, signed deltas coloured.

### 1.3 Colour — semantic roles (the ONLY places colour carries meaning)
**Governing principle (Option 1, ratified 2026-07-14): COOL = interactive chrome, WARM = data.** Two colour systems: the DATA hues below (warm/blue/violet, each a fixed meaning) and the ONE interactive-accent (teal, cool). Green is DATA-ONLY — no chrome may use it.
- `--data-up: #4ade80` — growth/increase (YoY positive, pp positive)
- `--data-down: #f88b6b` — decline/decrease (YoY negative, pp negative)
- `--city: #60a5fa` — the comparison-baseline (active city) datum, EVERYWHERE (line + numbers). Dashed line + blue = redundant encoding (colour-blind safe)
- `--sel: #e8734a` — selection accent on the **TABLE + RAIL** surfaces (the map boundary uses `--pa-selection-outline`)
- `--pa-selection-outline: #8b5cf6` — the **MAP** selection boundary stroke; violet, reserved distinct from the sequential/diverging ramps, `--data-up` green, `--data-down`/`--sel` coral, and `--city` blue. Violet appears nowhere in the basemap or any data ramp, so it reads unambiguously as "not data." Map-only (P4): the ramp collision it solves exists only on the choropleth; the table has no fill behind its rows, so table/rail selection stays `--sel` coral. MapLibre paint can't read CSS vars → `choroplethStyle.js` mirrors this literal.
- **`--accent-teal: #2dd4bf` — the interactive-accent (CHROME, not data; 2026-07-14).** The ONE colour marking *interactive* controls: active metric-button / toggle text, slider value readouts (`--tx-read` = teal), slider fill / thumb ring / major-tick emphasis, focus rings. Delivered as a teal **rim + glow + text** on neutral active glass (not a flat fill), with a `font-weight` + light-rim non-colour cue (forced-colors → `Highlight`). Teal is cool (near-opposite the warm map; holds chroma through frost) and tuned into the GAP between `--city` blue (213°) and `--data-up` green (142°): teal at **172°** reads as neither city nor growth, and is clear of `--sel`/`--data-down` coral, `--pa-selection-outline` violet (258°), and YoY-indigo (229°). §4: teal ≥4.5:1 on the active body (5.0:1) and the dark tuning bay (9.6:1); readouts contained on the bay (≥7.9:1). Retires the warm C2° glow that blinded out over the warm map. It is the ONE saturated interactive mark (≤~10% of the field per 60-30-10); chrome *surfaces* still obey the ≤8% tonal ceiling (§1.1). *(An optional Layer-2 pearlescent rim/dome sheen — cool-family, edges only — is codified in §6 only if it ships.)*
- **Signed deltas (amended 2026-07-13): ALL signed deltas colour by sign** — `--data-up` (positive), `--data-down` (negative). `COLOUR_LEVEL_DELTAS=`**`true`**. The former level/rate distinction ("colour on levels editorializes; reserve it for rates" — NEUTRAL `--tx` on level deltas) is **retired**: a signed delta reads by direction regardless of whether it compares a level (median/mean/lot vs city) or a rate (YoY, condo pp). Both `%` and `pp` deltas colour; unit doesn't matter, sign does. **Zero is neutral `--tx`** (no sign → no colour). The `+`/`−` sign glyph is the colour-blind-safe redundant channel (colour reinforces the sign, never sole-encodes it — §4). The **city baseline stays `--city` blue everywhere** (a reference datum, not a delta): the sign-colour applies to the *delta only*, never the baseline or the neighbourhood value (three distinct roles → three treatments: value `--tx` white · baseline `--city` blue · delta signed).

### 1.4 Colour — map/cartography
- `--map-cream: #f7f1df` — basemap ground = the label halo colour
- `--label-ink: #2a2621` — map label text (dark warm grey, NOT pure black; ~13:1 on cream)
- Sequential ramp (levels): cream→red as-built (choroplethStyle). UNTOUCHED.
- Diverging ramp (YoY): blue→yellow-plateau→red (D6). The ±1% yellow plateau and the red (growth) arm are as-built; the **negative (decline) arm is DEEPENED** — this note intentionally overrides the former "UNTOUCHED" line here and the D-F2 "diverging ramp untouched" directive. Named tokens (in `choroplethStyle.js`): the decline EXTREME `YOY_DEEP_BLUE = #0d1f6b` (deep indigo, was #08519c) and the mid `YOY_MED_BLUE = #2166ac` (potent medium blue, was #4393c3). Both are darker in **lightness** (not just more saturated) and hue-shifted toward **indigo**, so sub-−1% declines read strongly AND the decline colour stays clearly distinct from `--city #60a5fa` — it must never read as the city baseline on the map. Plateau reuses `RAMP_FLOOR`; the deepening is one-sided (blue only).
- Share ramp (%Condo): reuses the WARM sequential ramp (the cream→amber→orange→brown family used by dollar/level metrics — NOT a new hue, NOT purple). **Quantile classification, 5 classes** (sequential data reveals pattern via classed quantiles; an unclassed linear ramp reads flat). Legend shows the quantile break values (e.g. `0 · 8 · 19 · 34 · 61 · 100 %`). Domain = actual condo-share distribution. Higher share = darker, per sequential convention.

### 1.5 Type scale (named steps; no ad-hoc sizes) — BUMPED for legibility
`--t-2xs: 11px` · `--t-xs: 13px` · `--t-sm: 14px` · `--t-md: 16px` · `--t-lg: 19px` · `--t-xl: 24px`
Chrome minimum body text = `--t-xs` (13px). No text below `--t-2xs` (11px) anywhere. (Old scale started at 10/12; everything moved up one notch — the chrome was too small.)

### 1.5a Role → size assignment (ONE size per role; no ad-hoc sizing anywhere)
Every text role gets exactly one token. A role rendered at any other size is a defect.

| Role | Token | px |
|---|---|---|
| Module banner (e.g. "Metric", "⚙ Tuning", "Legend") | `--t-2xs` | 11 |
| **Console label tier — KPI card label, table header, trend label** (uniform across the three console zones, weight 600; 2026-07-14 Fix 1) | `--t-xs` | 13 |
| Trend readout + axis-end labels (values) | `--t-xs` | 13 |
| Trend legend | `--t-xs` | 13 |
| Slider label ("Year", "Median") | `--t-xs` | 13 |
| Table cell / body | `--t-xs` | 13 |
| Legend min/max + title | `--t-xs` | 13 |
| Metric buttons | `--t-sm` | 14 |
| Console header scope title | `--t-md` | 16 |
| Slider readout value | `--t-md` | 16 |
| InfoRail triplet value (Value/City/Delta — equal to each other) | `--t-md` | 16 |
| InfoRail stat-stack value | `--t-sm` | 14 |
| InfoRail stat-stack label | `--t-xs` | 13 |
| KPI card value | `--t-lg` | 19 |
| Identity card title | `--t-lg` | 19 |
| InfoRail card title (`.pa-detail-name`) | `--t-md` | 16 |
| **Icon — map control + metric-chip glyph** | (glyph) | **18** |

Labels/tags use `--tx-mut`; values use `--tx`. All numeric roles carry `tabular-nums`. **Parity within a role is mandatory** — e.g. the three InfoRail triplet values are equal to each other; all stat-stack values are equal; no per-row drift. **Icons** are ONE family (Feather-style, stroke-2, round) at ONE size (18px) across the map-control set (search / zoom ± / fullscreen / recentre) — no MapLibre defaults, no mixed sources.

### 1.6 Space + radius
Space scale (4px base): `--s1:4 --s2:8 --s3:12 --s4:16 --s5:20 --s6:24`. Radius: `--r-sm:6 --r-md:9 --r-lg:12`.

---

## 2. Typography rules (written down = enforceable)
- **Font:** house sans stack (Inter/system). Sans only. No serifs in chrome.
- **Capitalization — THE RULE (amended 2026-07-13, recurring drift ends here):** Title Case with **lowercase minor words**. Capitalize every word EXCEPT minor connecting words when they fall **mid-phrase**: articles (*a, an, the*), coordinating conjunctions (*and, but, or, nor*), short prepositions ≤4 letters (*of, in, on, to, by, as, at, off, per, over*), and *vs*. **Always capitalize the FIRST and LAST word**, regardless. Acronyms stay upper (YoY, m²); a unit in parens keeps its own case (`(%)`, `(m²)`). No sentence case, no ALL-CAPS, no arbitrary lowercase in chrome. Applies to metric buttons, legend titles, table headers, KPI labels, console headers, dropdown items, buttons — everything the user reads that isn't data. Exact transformations (apply verbatim):
  - Metric buttons (full labels; order = value → change → composition → structural): `Median Assessed Value` · `Mean Assessed Value` · `Year over Year Change (Log Pts)` · `Condominium (%)` · `Mean Lot Size (m²)`  — note "over" lowercased mid-phrase, "Year" (first word) capital.
    - **YoY's unit is LOG POINTS, not `%` (amended 2026-07-15).** The backend emits `log(median_now / median_prior) * 100` — a log change (`04_aggregate_historical.R:274`). It is NOT a percent, and the two diverge hard in the tail: ROSENTHAL 2014 is `159.7` log pts, which as a percent is **+393.8%**. The former `(%)` label was a knowingly-accepted approximation (`b3c8fb4`) whose stated bound the greenfield tail broke — see METHODOLOGY.md **D7**. **No `%` may appear on this metric anywhere**, and no `pp` on its deltas (a percentage point is the gap between two *percentages*; a log-point gap is log points). Notation is **`Log Pts`** everywhere — `Δln` is rejected, one notation only.
  - Legend title: matches the active metric verbatim (e.g. `Median Assessed Value`, `Condominium (%)`).
  - Table headers (SHORT tier — space-constrained; a deliberate separate tier from the full metric-button labels above): `Neighbourhood` · `Median` · `Mean` · `Lot m²` · `Built` · `% Condo` · `YoY (Log Pts)` · `Trend`. (The console-header metric chips use these short labels for the same space reason.) **`YoY (Log Pts)` carries its unit even in the short tier (amended 2026-07-15)**: a bare `YoY` invites the `%` the reader already assumes, which is exactly the drift D7 ends. The unit sits in the header so the CELLS stay bare signed numbers (`+7.3`, `−1.3`, `144.7`, tabular-nums) — stated once, not once per row. The range-slider label reads this same header, so the unit is stated once there too and its readout stays bare.
  - KPI labels: `Median` · `YoY` · `Condo` · `Distribution` (+ honesty tags: `≈ Of Medians` — "Of" is the first word after the `≈` symbol so it stays capital; `Parcel-Weighted · Exact`; `Excluding Condos`).
  - Console header scope: `All 407 Neighbourhoods` · `6 Neighbourhoods Selected` · `<Name>` (name as delivered).
  - Handle/affordances: `Data Table` · `Analyst View` · `Press T`.
  - Map labels follow the data's own casing (Title Case as delivered).
- **Numerals:** `font-variant-numeric: tabular-nums` on ALL numbers (tables, cards, readouts, sliders).
- **One number formatter, everywhere chrome-side:** compact — `$448k`, `≈$425k`, `611 m²`, `+7.3%`, `+72pp`. Full precision is Export's job ONLY. The `$448,000` vs `$731k` vs `≈$425,125` inconsistency is a defect.
- **Approximation mark `≈`** prefixes any median-of-medians or estimated aggregate. Never dropped.
- **Hierarchy by size, min 1 step:** adjacent hierarchy levels differ by ≥1 type step.

---

## 3. Essential vs non-essential (a rule, not a vibe)
Every displayed element must answer: *does this help the user decide?* If not, cut it. Current failures to remove: on-map `N=` count debris, stranded KPI-card mid-whitespace, duplicate trend readouts, verbose metric-name labels inside value triplets. Dual-encoding rule: label the essential (map key features get text labels alongside colour), suppress the rest. Less is more — especially on the map.

## 4. Contrast floor (enforced; legal, not just polish)
- Text vs its surface: **≥4.5:1** (`--tx-mut` on `--shell` must pass; the old muted grey did NOT).
- UI/graphical elements (borders, chart strokes, control affordances): **≥3:1**.
- Map label text vs halo: **≥4.5:1** (`--label-ink` on `--map-cream` ≈13:1 ✓).
- Disabled/inert states may drop below, but stay readable (opacity, not invisibility).
- Test every new colour pair before commit. This is a WCAG 2.2 AA floor; for an institutional (UAlberta) artifact it is a requirement.

## 5. Map/cartography law
- **Labels:** `--label-ink` text + `--map-cream` halo, halo width ~1.5px (as narrow as stays legible — "effective but invisible"). The cream halo makes the label readable over ANY choropleth colour because the halo is the text's effective background.
- **Collision:** our centroid labels and basemap labels share ONE collision index (adjacent layer order, `text-allow-overlap:false`) so they never overprint each other. Hover/selected label is the ONE exception (`allow-overlap:true`) — the pointed-at neighbourhood always names itself.
- **Density by zoom:** major neighbourhoods only ≤~z11 → mid tier ~z12.5 → all ~z14. The overview breathes; the table holds the exhaustive list.
- **Building harmony:** building footprints blend to luminosity (hue drops out → tonal texture) so they never clash with the active ramp (sequential OR diverging). Colour-only; no data.
- **No internal debris on the map:** parcel counts, suppression flags, and other internal fields never render as map labels. They live in the table/detail.

## 6. Component patterns
- **KPI card = square-ish tile:** label (top) → big value (centre) → city + delta (footer row). Vertical stack kills mid-rectangle dead space. Grid of tiles in the rail, not wide rectangles. `--card` surface, `--hair` border.
- **Two-lens comparison (CONDO card):** distinguish the two questions explicitly — (a) vs-city share comparison (primary line, pp delta, `--city` baseline) and (b) within-neighbourhood condo-stripped view (secondary block under an `excluding condos:` label). Never conflate.
- **Selection:** one meaning, two surface-appropriate encodings — the **map** boundary is `--pa-selection-outline` violet (top-of-stack, distinct from the ramp), the **table/rail** accent is `--sel` coral (P4). Both read as "selected."
- **Metric chips (left rail):** each carries a leading glyph — one inline stroke SVG per metric (24×24 viewBox, `stroke="currentColor"`, `aria-hidden`; the label carries the accessible name), sized ~14px to sit with the chip text. The glyph inherits the chip ink, so it greens with the active chip — **no per-metric colour** (the green border is the only selected signal). Glyph set lives in `choroplethStyle.js` METRICS (data-driven, one place). Icons appear on the rail chips ONLY — not the console-header re-home, map, legend, or table (P5).
- **City baseline:** `--city` blue on every surface, labelled with the ACTIVE CITY NAME (e.g. "Edmonton"), read dynamically — never the literal word "city," never a hardcoded "Edmonton."
- **Honesty labels:** reportable/suppressed/excluded, exact/approx, aggregate formula tags — always shown, muted tier, never stripped.
- **Trend panel anatomy (2026-07-14):** header (metric title + top-right year·value readout) → main line chart (flex-grows to fill) → axis-end labels → **bottom legend (the series named ONCE, next to its line)**. The matched-sample **YoY·Matched bar strip was removed** (§3: an axis-less 3px bar didn't help the user decide; that YoY still lives in the table YoY column + the KPI YoY card). The series/scope name appears once (legend), never duplicated in the header.
- **About & tips popover = the canonical interaction reference.** ALL interactions documented once, plain English, Title Case: click-select, Shift+drag box-select, Search (fly-to), Year slider, Median range-filter, T / Data-Table handle, Clear Filters vs Clear Selection — plus the honest-aggregate + renaming disclosures. The inline `Press T` handle hint stays as the discoverable; the popover is the reference, not a replacement.
- **Button standard — ONE language, every button on the page (2026-07-14, ratified).** EVERY button — sidebar metric chips, the city toggle, console utility (District, Export, both Clears), AND the right-side **map controls** (zoom ±, fullscreen, geolocate, reset, search) + the **scale bar** — shares one chassis + material + accent + fixed uniform slots. No default-MapLibre styling remains anywhere; the map controls are the dark tonal-glass system re-skin (glass-panel body, neutral-glass key buttons, light-inverted icons, teal focus, uniform 30px slots — size kept so the `.pa-detail` derived offset holds; behaviour unchanged). **Material states (uniform everywhere):** *active/selected* → dark teal-**petrol** body + duochrome **pearl** rim + teal-white text; *inactive/available* → quiet neutral-glass key (brighter than dead grey, not disabled-looking); *disabled/inert* → muted, in place (reserved slot, Principle 0). The console-button chassis below is that one shared geometry:
  - **Ratified chassis tokens** (the uniform geometry): `border-radius: var(--r-md)` (9px) · `padding: 4px 10px` · `font-size: var(--t-sm)` · `font-weight: 500` · `border: 1px solid var(--hair)` · `display: inline-flex; align-items: center; gap: 5px` · `white-space: nowrap`. Codified in `index.css` as one grouped selector (the `§6 CONSOLE-BUTTON CHASSIS` block) so the shape lives in exactly one place.
  - **State layers** (the only thing a role adds on top of the chassis): metric chip → glass-key body (top-lit gradient + specular light-rim), `.active` = the DualSense material: **dark teal-petrol body** (`--accent-int-fill`) + **duochrome pearl rim** (`--accent-rim-image`, a thin metallic teal→cyan→gold-green edge-light; gold-green is metallic-highlight-only, never data-green) + **teal-white text** (`--accent-int-text`, T2 in the sidebar) + teal glow/`--accent-soft` spill + `font-weight:600` (the non-colour cue) — the sole selected signal, warm glow retired (2026-07-14, Option 1). **Both Clears → identical** (Fix 1): **enabled = coral** (`--sel`) outline + coral text ALWAYS; **disabled = muted grey**, inert in place (Principle 0 — the slot holds, never absent); District/Export → filled `--card` surface + a leading icon/caret. Focus rings on all controls (console + map) are **teal** (interactive), not the old coral.
  - **Duochrome rim construction (LOCKED — 2026-07-14 bug fix).** The pearl rim is a **mask + pseudo-element** ring (`::after { inset:0; border-radius:inherit; padding:1px; background:var(--accent-rim-image); mask: <solid> content-box exclude, <solid> }`) — NOT `border-image` (which ignores `border-radius` → rectangular seams on rounded pills, Mozilla-confirmed) and NOT the two-background-layer trick (which needs an opaque body — ours is glass-transparent over the map). The `--accent-duochrome` sweep is a **cyclic** `repeating-linear-gradient` whose first and last colour MATCH (`#10464a`…`#10464a`), else the repeat boundary is a hard jump = a mid-run seam (the image-3 bug). Fixed ~132px period so the flip reads at one scale on long and short elements. No hard colour stops (all gradual). **Luminance-flat rule (checkable law):** only HUE travels (teal→cyan→gold-green); the sweep stays even in luminance (all stops L≈0.53–0.62) — a lit edge whose colour travels, never a dark stop landing mid-run (a dark stop = the "warp/pinch" bug on long buttons). Do not reintroduce `border-image`, a non-cyclic sweep, or a dark stop.
  - **Interaction states (all buttons, uniform):** REST (neutral-glass key) · HOVER (rim-brighten + slight lift, transform-only, reduced-motion-gated) · PRESSED (depress) · SELECTED/on (active material — petrol + pearl + teal; e.g. fullscreen-toggled map control) · DISABLED (muted, in place). Same chassis/material/accent/timing across sidebar, console, and map controls.
  - **Regroup order** (reading order in the fixed-slot strip): `metric chips (left) │ Clear filters · Clear selection │ District │ Export`. The two clears sit together (they answer the same "undo" question), then the District brush, then Export.
  - **Portaled menus flip at edges:** the District and Export menus are `position:fixed`, portaled to `<body>`. They flip **up** when there's no room below AND **left** (right-anchored) when a left-anchored menu would spill past the viewport's right margin — Export sits at the console's right edge, so it always opens leftward.

## 7. What this doc governs
Colour, type, space, contrast, capitalization, formatting, cartography, essential-vs-non-essential, and component anatomy — across every section (PA now; BP/BC/road/amenities/zoning later). New work cites this doc by section. It is the standard that makes the artifact production-grade.
