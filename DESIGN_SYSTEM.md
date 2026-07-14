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

### 1.3 Colour — semantic data roles (the ONLY places colour carries meaning)
- `--data-up: #4ade80` — growth/increase (YoY positive, pp positive)
- `--data-down: #f88b6b` — decline/decrease (YoY negative, pp negative)
- `--city: #60a5fa` — the comparison-baseline (active city) datum, EVERYWHERE (line + numbers). Dashed line + blue = redundant encoding (colour-blind safe)
- `--sel: #e8734a` — selection accent on the **TABLE + RAIL** surfaces (the map boundary uses `--pa-selection-outline`)
- `--pa-selection-outline: #8b5cf6` — the **MAP** selection boundary stroke; violet, reserved distinct from the sequential/diverging ramps, `--data-up` green, `--data-down`/`--sel` coral, and `--city` blue. Violet appears nowhere in the basemap or any data ramp, so it reads unambiguously as "not data." Map-only (P4): the ramp collision it solves exists only on the choropleth; the table has no fill behind its rows, so table/rail selection stays `--sel` coral. MapLibre paint can't read CSS vars → `choroplethStyle.js` mirrors this literal.
- Level-metric deltas (median/mean/lot vs city): NEUTRAL `--tx` (white), not up/down — per COLOUR_LEVEL_DELTAS=false. Colour on levels editorializes; reserve it for rates.

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
| KPI card label + honesty tag | `--t-2xs` | 11 |
| Table header | `--t-2xs` | 11 |
| Trend readout + axis-end labels (values) | `--t-2xs` | 11 |
| Trend legend + sub-label (labels) | `--t-2xs` | 11 |
| Slider label ("Year", "Median") | `--t-xs` | 13 |
| Table cell / body | `--t-xs` | 13 |
| Legend min/max + title | `--t-xs` | 13 |
| Metric buttons | `--t-sm` | 14 |
| Console header scope title | `--t-md` | 16 |
| Slider readout value | `--t-md` | 16 |
| KPI card value | `--t-lg` | 19 |
| Identity card title | `--t-lg` | 19 |

Labels/tags use `--tx-mut`; values use `--tx`. All numeric roles carry `tabular-nums`.

### 1.6 Space + radius
Space scale (4px base): `--s1:4 --s2:8 --s3:12 --s4:16 --s5:20 --s6:24`. Radius: `--r-sm:6 --r-md:9 --r-lg:12`.

---

## 2. Typography rules (written down = enforceable)
- **Font:** house sans stack (Inter/system). Sans only. No serifs in chrome.
- **Capitalization — THE RULE (amended 2026-07-13, recurring drift ends here):** Title Case with **lowercase minor words**. Capitalize every word EXCEPT minor connecting words when they fall **mid-phrase**: articles (*a, an, the*), coordinating conjunctions (*and, but, or, nor*), short prepositions ≤4 letters (*of, in, on, to, by, as, at, off, per, over*), and *vs*. **Always capitalize the FIRST and LAST word**, regardless. Acronyms stay upper (YoY, m²); a unit in parens keeps its own case (`(%)`, `(m²)`). No sentence case, no ALL-CAPS, no arbitrary lowercase in chrome. Applies to metric buttons, legend titles, table headers, KPI labels, console headers, dropdown items, buttons — everything the user reads that isn't data. Exact transformations (apply verbatim):
  - Metric buttons (full labels; order = value → change → composition → structural): `Median Assessed Value` · `Mean Assessed Value` · `Year over Year Change (%)` · `Condominium (%)` · `Mean Lot Size (m²)`  — note "over" lowercased mid-phrase, "Year" (first word) capital.
  - Legend title: matches the active metric verbatim (e.g. `Median Assessed Value`, `Condominium (%)`).
  - Table headers (SHORT tier — space-constrained; a deliberate separate tier from the full metric-button labels above): `Neighbourhood` · `Median` · `Mean` · `Lot m²` · `Built` · `% Condo` · `YoY` · `Trend`. (The console-header metric chips use these short labels for the same space reason.)
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
- **Console-button chassis (the PA data-table console):** every control in the console — the metric chips, both Clears (`Clear filters`, `Clear selection`), the District dropdown, and Export — shares **ONE chassis geometry**. Only the *state layer* differs. This is governing law: a new console control adopts the chassis, then adds its state treatment; it never invents its own shape.
  - **Ratified chassis tokens** (the uniform geometry): `border-radius: var(--r-md)` (9px) · `padding: 4px 10px` · `font-size: var(--t-sm)` · `font-weight: 500` · `border: 1px solid var(--hair)` · `display: inline-flex; align-items: center; gap: 5px` · `white-space: nowrap`. Codified in `index.css` as one grouped selector (the `§6 CONSOLE-BUTTON CHASSIS` block) so the shape lives in exactly one place.
  - **State layers** (the only thing a role adds on top of the chassis): metric chip → transparent surface, `.active` paints **green** (`--pa-card` fill, `--pa-up` border + text) as the sole selected signal; **both Clears → identical** transparent outline (`--pa-mut` text, hover lifts to `--pa-sel`), disabled = **inert in place** (opacity 0.4, `pointer-events:none` — Principle 0: the slot holds, never absent); District/Export → filled `--card` surface + a leading icon/caret.
  - **Regroup order** (reading order in the fixed-slot strip): `metric chips (left) │ Clear filters · Clear selection │ District │ Export`. The two clears sit together (they answer the same "undo" question), then the District brush, then Export.
  - **Portaled menus flip at edges:** the District and Export menus are `position:fixed`, portaled to `<body>`. They flip **up** when there's no room below AND **left** (right-anchored) when a left-anchored menu would spill past the viewport's right margin — Export sits at the console's right edge, so it always opens leftward.

## 7. What this doc governs
Colour, type, space, contrast, capitalization, formatting, cartography, essential-vs-non-essential, and component anatomy — across every section (PA now; BP/BC/road/amenities/zoning later). New work cites this doc by section. It is the standard that makes the artifact production-grade.
