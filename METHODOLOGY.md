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
