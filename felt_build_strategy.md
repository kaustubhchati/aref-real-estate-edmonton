# Felt Four-Zone — Build Strategy (PA)

> Accepted strategy doc (for the record). Grounded in the deployed PA code; the Felt
> plan (`felt_layout_build_plan.md`) wins where it disagrees with the shipped 3-zone form.
> Authorship: Kaustubh Chati. Built by CC.

## Starting state (already shipped to `main`)

The immediately-prior PA work already delivered four Felt-plan steps in a 3-zone form:

- **Right rail** — `InfoRail.jsx` (reuses `POPUP_ROWS` + `format.js`, year/metric-reactive,
  `sidebarRightPad` added). *Was* always-visible with a default summary + in-rail search.
- **Metric selector** — `SegmentedControl.jsx` (icon+label single-select from `METRICS`).
- **Immersive chrome** — `EdgeReveal.jsx` + `.shell-immersive` (`Layout.jsx`,
  pointer-proximity + focus-within + tap reveal; a11y-safe, reduced-motion aware). Done.
- **Selection** — single `selectedId` React state + a pinned/hover feature-state mirror.

So this build is **extend/reshape**, not from-scratch.

## Decisions carried in

- **Rail = hidden by default, opens on selection** (Felt plan). Search relocates to the
  new top toolbar; the rail default-summary state is removed. Authorized live-behavior change.
- **C2 data seam:** iterate the resident `gjView.features` — `querySourceFeatures` + tile
  dedupe is unnecessary because the full combined FeatureCollection is already in React
  (`gj` / `gjView`).
- **C3 aggregation honesty (the crux):** the browser holds ONLY neighbourhood aggregates,
  and the combined file NULLs values for non-aggregated polygons (empirically:
  `suppressed_low_n` carry only `n_properties`; `non_residential`/`no_data` carry nothing).
  Therefore client-side:
  - EXACT: selected/reportable/suppressed counts; total parcels (Σ `n_properties`);
    parcel-weighted MEAN assessed value (Σ nᵢ·meanᵢ / Σ nᵢ over reportable nbhds, using
    `avall_public`); linear sums. **Mean is the value-stat to feature.**
  - APPROX ONLY (label "≈ neighbourhood-weighted", one-line why), or omit: area MEDIAN
    (only per-nbhd medians exist) and area YoY (the locked PA YoY is a parcel-level
    matched-sample stat, not reproducible from per-nbhd `yoy_pct_change`). Never unlabelled.
  - Always disclose suppressed/non-res exclusions; show auditable constituent rows.
- **C4 PNG:** `preserveDrawingBuffer:true` is required or the WebGL canvas exports blank —
  add as a PA-only opt-in prop on the shared `MapView` (BP/BC untouched).
- **No new dependency** at 403 polygons (hand-roll sort/filter/aggregate/CSV/centroid/
  sparkline). A future lasso (terra-draw) would be the one place to STOP + surface.

## Build order (one concern per commit; verify each)

1. **`selectedIds` foundation** — array selection; set-diff pinned mirror; click=replace,
   empty=clear. *Verify:* click/clear, rail unchanged.
2. **C1 rail + sparkline + hidden-by-default** — sparkline from `gj` all-years; rail
   renders only on selection (slide-in); search removed from rail. *Verify:* opens on
   select, closes on clear, sparkline tracks metric.
3. **Legend ↔ metric fusion** — co-locate in one panel. *Verify:* legend matches metric.
4. **C2 bottom table** — `gjView`-driven; sort/filter; columns (name, active metric, YoY,
   per-row sparkline, city rank); bidirectional row↔polygon link; collapsed handle
   (desktop drawer / mobile fullscreen). *Verify:* sort/filter, both link directions,
   rollover-safe.
5. **Top toolbar** — relocate search (local name search → fly+select), focus-mode toggle,
   export-button shell; always visible. *Verify:* search selects; visible under immersive.
6. **C3 box-select + aggregate** — `boxZoomEnd` → centroid-in-box → `selectedIds`; table
   selection-mode with exact cards + labelled approximations + auditable rows. *Verify:*
   aggregate mean/count vs hand-computed; suppressed excluded + disclosed.
7. **C4 export** — CSV / GeoJSON-clip / PNG over `selectedIds`; `preserveDrawingBuffer`
   PA-only prop. *Verify:* each downloads; PNG non-blank; BP unaffected.

Hard dependency chain: 1 → 4 → 6 → 7. Steps 2/3 are independent polish.

## Bounds

Refresh-by-design (no year literals); Mode B native; no new dep at this scale; PA only
(don't touch BP frontend, don't publish the BP combined file); aggregates honest; one
concern per commit; legible for Olivia/future RAs.
