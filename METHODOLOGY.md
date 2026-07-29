# METHODOLOGY — the *why* behind the design

**Audience:** reviewers (Olivia, Prof Huang) and any future RA deciding whether a change is
sound. This is the human-facing **rationale** companion to `CLAUDE.md` (which is the machine
**how** — a system prompt of operating rules) and to the `ADR_serve_only_vm_and_operator_model.md`
(a single large decision). METHODOLOGY records the *standing* decisions that shape the project, so
a reviewer can judge a change against the reasoning, not just the rules.

**Shape.** Each decision uses the project's five-field form:
**Decision / Why / Example / Rejected / When-this-changes.** Entries are deliberately short — this
is a substrate to grow as decisions settle, not a finished tome.

**Rule for this file:** seed and extend it **only with decisions that are settled and already true
on disk.** Do not record aspirations or speculative directions here (those live in the ADR or an
`[OPEN]` note). When a decision changes, edit its entry — don't leave a stale *why*.

---

## D1 — Map layers are served as whole GeoJSON (per-year where there's a year axis), not tiles

### Decision
Every map layer is a plain GeoJSON file the host serves whole. Where a layer has a year axis, it is
**one file per year**; the frontend swaps the source on the slider. The Building Permits permit-point
map — the last tiled layer — was standardized onto this model, and the entire tiler subsystem
(tippecanoe, go-pmtiles, the R2 tile host, the `VITE_PMTILES_BASE` seam, the `pmtiles` dependency
and protocol handler, the bespoke `PermitMapView` mount) was removed.

### Why
One transport means far fewer failure modes for a non-technical operator: no cross-platform tiler to
install, no hand-built tile to upload, no byte-range-capable host requirement. On the current host
(Cloudflare Pages) each asset must be ≤ 25 MiB; per-year point files (max ~7.7 MB, ~12–16k features
each) fit comfortably and keep the browser light, whereas one all-years points file (~105 MB) cannot
be a Pages asset at all — which is the very reason the points had been tiles on R2.

### Example
`pipeline/.../01_build_permits.R` emits `permit_points_<year>.geojson` (thinned: 6-dp coords, the 8
rendered properties). The frontend mounts them on the shared `MapView`; the year slider changes
`geojsonUrl`, MapView calls `setData` — the same per-year model the neighbourhood choropleth uses.

### Rejected
- **One all-years GeoJSON** — over the Pages 25 MiB per-file cap; cannot serve.
- **PMTiles on R2** — retained the only cross-platform tiler, a manual tile-upload step, and a
  range-capable-host dependency; all friction for a non-technical operator.

### When-this-changes
If a host without the per-file cap lands (the serve-only VM, deferred until specs arrive), an
all-years single-file + `setFilter`-by-year model becomes viable again and could replace the per-year
split for layers where instant scrubbing matters.

---

## D2 — Refresh-by-design: no year literals; the frontend discovers years from manifests

### Decision
The frontend reads years, filenames, and colour scales from backend-emitted `manifest.json` files —
never from literals in frontend code. Adding a data year is a **pipeline-only** change: emit the new
file(s) and regenerate the manifest; no frontend edit.

### Why
The operator's yearly refresh must not require touching code. A hardcoded year array or filename
silently 404s or mislabels the moment the data rolls to the next year — exactly the unattended
failure the project is built to avoid.

### Example
The PA and BP sliders read `{years, defaultYear}` from the published manifest; the per-year GeoJSON
URLs derive from the selected year. A simulated next-year manifest advances the UI with zero code
edits.

### Rejected
- **Hardcoded year arrays / filenames / labels** — break on the next refresh with no warning.

### When-this-changes
Stable — this is a core contract. The one parked exception is Business Census, whose survey year is
baked into its filename and column keys with no manifest; it reaches parity at the next backend BC
refresh (handback spec recorded).

---

## D3 — Freeze-the-working-core

### Decision
A structural or standardization change leaves the validated data interior and every sibling section
**byte-identical**; only the one targeted seam changes, and that identity is verified per commit.

### Why
The F1-validated cleaning rules and the already-working sections are the project's hard-won value.
Cosmetic or structural churn near them risks a silent regression for no functional gain — an
unacceptable trade in research infrastructure where correctness is the product.

### Example
The BP point standardization changed only `01`'s emit, the handoff, and the point-map frontend.
`02`'s aggregates, the BP choropleth, and all of Property Assessment stayed byte-identical (checked
each commit). Stale `PermitMapView` comments in the *shared* `MapView.jsx` / `basemapTheme.js` were
left untouched rather than edit frozen shared code for cosmetics.

### Rejected
- **Refactoring frozen shared code for cosmetic fixes** (e.g. correcting a now-stale comment) — the
  regression risk outweighs the tidiness.

### When-this-changes
Stable.

---

## D4 — The runner is the sole publisher to `website/public/`

### Decision
Pipeline scripts write **only** to their section's `output/`. A single runner handoff
(`pipeline/_run_engine.R`) is the only writer of `website/public/`, copying via a glob + fixed-file
mechanism, each copy guarded against zero-byte files and logged as a `handoff_copy` record in
`runs/refresh_runs.jsonl`.

### Why
A script that wrote `website/public/` directly is what produced silent current-year staleness. One
publisher, with a zero-byte guard and an append-only audit log, removes that whole class of bug and
makes every published file traceable to the run that produced it.

### Example
BP per-year points: `01` writes `output/permit_points/`; the `_whirl.yaml` glob publishes them to
`website/public/.../permit-points/`. A full refresh logged 18 `permit_points` `handoff_copy` records
under section `building-permits`, which the HTML run report then surfaces automatically.

### Rejected
- **Scripts writing `website/public/` directly** — the staleness bug.
- **A second, bespoke logger** — reuse the one handoff/logging seam; never fork it.

### When-this-changes
Stable.

---

## D5 — The oracle validates rules once; production runs them year-invariant

### Decision
Cleaning rules are scored **once** against the confidential 2023 oracle (precision/recall scorecards
on disk), then run **unchanged** on public data for later years. Thresholds are domain-justified
constants or recomputed from the year being cleaned — never memorized from the oracle year.

### Why
The oracle is a one-time *validation instrument*, not a production input: it is confidential (so it
cannot enter production), and tuning thresholds to it would overfit the 2023 distribution. Holding
F1 ≥ 0.97 across the 3-year gap to 2026 is the year-invariance contract that earns the right to run a
rule on unseen years.

### Example
The parking $80,000 cap and the R1/R3 residential rules were scored on 2023 and applied unchanged to
the 2026 public data (365,406 rows). The Layer-2 aggregates from 2026 will **not** numerically match
the 2023 outputs — that divergence is expected, not a defect.

### Rejected
- **Tuning thresholds to the oracle year** — overfits; breaks year-invariance.
- **Using the oracle as a production input** — confidential; a hard blocker.

### When-this-changes
If a new confidential snapshot becomes available, a rule may be **re-scored** — recorded as a new
versioned scorecard, never a silent retune of a live rule.

---

## D6 — The home camera is a tuned per-city preset, not a data-derived fit

### Decision
The Property Assessment **home view** is a hand-tuned, per-city camera **preset**
(`HOME_VIEW` in `choroplethStyle.js`) — a `{ center, zoom, pitch, bearing }` with a
slight north-up pitch — applied on load, on city switch, and by the reset button when
no selection is active (`easeTo`; reduced-motion / first-load → `jumpTo`). Everywhere
else the camera stays **data-derived**: the flat `fitToFeatures(bbox, chrome-aware
padding)` frames a **selection** (box-select) and is the reset target when a selection
is active.

### Why
The landing view is a designed first impression — a cinematic, slightly-pitched framing
of the city reads better than a flat auto-fit to the raw extent (which floats the city in
dead basemap and has no depth). Framing is an editorial choice for the home; *analysis*
framing (selection) stays honest and automatic. The two are deliberately different camera
concepts, both kept.

### Example
`HOME_VIEW.Edmonton = { center: [-113.485, 53.515], zoom: 10.5, pitch: 18, bearing: 0 }`
was captured by framing the live map to the design reference (*Home-View Pitch angle*) and
reading back `getCenter/getZoom/getPitch/getBearing` — not eyeballed. Selection-fit still
uses the data bbox, so it reframes automatically as data/boundaries change.

### Rejected
- **A data-derived fit for home too** — uniform but flat and characterless; loses the
  designed pitch/zoom of the landing.
- **One global preset for all cities** — dishonest; Edmonton's framing isn't Calgary's.

### When-this-changes
Each new city needs its **own** `HOME_VIEW` entry (Calgary when it arrives); without one,
that city has no tuned home until it is captured. `maxBounds` likewise becomes per-city at
that point (today it is Edmonton-pinned, harmless because Calgary has no map yet).

---

## D7 — YoY is a matched-sample log change, published in log points

### Decision
Property Assessment's year-over-year metric is a **matched-sample log change**: take the
parcels present in **both** years (matched by `Account Number`), take the median assessed
value of that same set in each year, and report `log(median_now / median_prior) * 100`
(`04_aggregate_historical.R:274`, `05_aggregate_current.R:273`). The per-year **level**
median stays full-population; only the *change* is matched. It is published, labelled and
formatted in **log points** — never `%`, and its deltas never `pp`. The column is named
`yoy_log_points` everywhere it is written, published or downloaded: the aggregate CSVs
(04/05), the per-year and combined GeoJSONs (06/07/07b), the per-neighbourhood download
CSV, and the map's own CSV export.

**Renamed 2026-07-15** (was `yoy_pct_change`). The rename landed in two steps, and the
intermediate state is the reason the second was needed: `0cbdbaf` renamed only the
combined GeoJSON, via a publish-time map inside 07b, leaving 04/05 writing the old name.
The map then said `yoy_log_points` while the per-neighbourhood download CSV said
`yoy_pct_change` — one statistic under two names, with the *wrong* one on the
researcher-facing download. The name is now honest at the point of writing, so every
reader inherits it and the 07b bridge is deleted rather than left as a no-op. **A column
called `pct_change` holding a log change is the exact misreading D7 exists to end**, so
the rule is: fix a wrong published name where it is written, never by translating it on
the way out.

### Why
Two separate choices, both deliberate.

**Matched-sample**, because a growing neighbourhood's new houses would otherwise
masquerade as price change. This is the standard mix-adjustment (RPPI Handbook; StatCan
matched-model; FHFA "same physical units").

**Log points**, per `b3c8fb4` (2026-06-26), which changed the estimator from a raw percent
and recorded why:

> *"Log is symmetric about 0 (an x% rise and the offsetting fall have equal magnitude) and
> additive across periods — the scale repeat-sales / Case-Shiller estimate on — and it tames
> the long right tail of raw percent (unbounded above, floored at -100%)."*

Measured: skew **11.51 → 7.72**, kurtosis **160 → 78**. Log is also the well-behaved scale
for a median on skewed data, and the log-return convention in asset pricing.

That same commit kept the `%` label, reasoning *"For small changes log ~= raw percent, so
the displayed '%' stays meaningful for the vast majority of neighbourhoods."* The estimator
was right; the label was not, and 2026-07-15 retired it (below).

### Example
**ROSENTHAL 2014 = `159.7` log pts.** As a percent that is **+393.8%** — the label was
understating the move by 234 points. It is also not price change: 38.5% of its matched
parcels went from a **$77,250** serviced lot to a **$479,750** finished house, while the
already-built parcels moved **+18.8**. That is greenfield buildout, and the value is
correct — the tail stays (`docs/recon/YOY_TAIL_MECHANISM_20260715.md`, Mechanism A).
Below about ±14 log points — 98% of the panel — log and percent agree to within 1.2 points,
which is why the mislabel survived every eyeball check for three weeks.

### Rejected
- **Raw percent** (`(median_now − median_prior)/median_prior * 100`) — the pre-`b3c8fb4`
  estimator. Skew 11.51, kurtosis 160; unbounded above and floored at −100%, so it is
  asymmetric about zero and not additive. Retired on the evidence above.
- **Converting to percent for display** (compute in log, `exp()` at the edge) — makes the
  old `%` label true, but reverses `b3c8fb4` in everything but name: it restores the skew
  the log was adopted to tame, changes all 3,473 published values, and re-fits the
  data-derived ramp. Rejected 2026-07-15: **relabel, do not convert.**
- **Log-compute / percent-display** — the as-built state until 2026-07-15, and the reason
  this entry exists: two units live in the system at once and nothing marks the seam.
- **`Δln` as the notation** — one notation everywhere; `Log Pts` is it.

### When-this-changes
**`b3c8fb4` accepted an error bounded by the data it could then see. That bound was
empirical, not structural — and the greenfield tail widened it.** The reasoning was sound
and the arithmetic was checked; it was still wrong within a month, because the panel grew a
tail the check had not seen. A future panel — more greenfield, a second city, a
reassessment shock — can widen it again. So: **an approximation justified by "the current
data makes this close enough" is a standing liability, not a settled decision.** Either the
label states the actual unit (what we now do), or the bound is re-tested every refresh and
recorded here. Do not re-derive the `%` label from "log ≈ percent for most rows" — that
argument has already been made once, correctly, and has already failed.

The estimator itself is stable: `04:274` / `05:273` and the N<100 gate are frozen cores.
Changing either changes every published YoY value and needs a STOP-gate.

---

## D8 — Zoning ships 156 codes grouped to 10 families via a ratified crosswalk; unmapped and blank codes halt

### Decision
The Zoning map fills polygons by **`zone_family`** — 10 families a human curated from the
156 Zoning Bylaw codes in a **dated, ratified crosswalk**
(`pipeline/yeg/zoning/data/reference/zoning_family_crosswalk_20260725.csv`, KC 2026-07-25),
never by the raw code. The build **halts** on any code the crosswalk does not carry AND on
any blank code; the zone code `NA` (Natural Areas) is handled as a **literal join key** on
both sides of the join, so readr's NA-coercion can never route a blank onto its family.
Families are a categorical fill; the exact code + description surface on hover/select.

### Why
A 156-class fill is unreadable — no categorical palette survives it — and the class list
changes whenever Council amends the bylaw. Curation (with a fail-closed guard) turns both
problems into one human decision per new code, on the §4.7 curated-mapping pattern; the
guard makes an amendment surface loudly at refresh instead of silently mis-colouring.

### Example
The 2026-07-29 snapshot added codes `DC`, `RM h16`, `RSM h12` (+3 polygons) — all already
in the crosswalk, so the refresh flowed through. A genuinely new code (or a blank) prints
the offending codes with counts and stops with exit 1 (proven on a doctored copy).

### Rejected
Deriving families from `description` text (fuzzy, §4.7 forbids); rendering raw codes
(illegible); a residual "Other" family (an unmapped code is a curation debt, not a class);
`replace_na(zoning, "NA")` (re-opens the fail-open it closes: a blank would become
Natural Areas).

### When-this-changes
A new ratified crosswalk version (new dated file, §4.4) — e.g. a family split/merge —
recolours the map by design; re-run the section and re-ratify the palette row for any NEW
family (DESIGN_SYSTEM §1.4 polygon law). If the City ever ships blank zone codes, the
build halts until the rows are adjudicated.
