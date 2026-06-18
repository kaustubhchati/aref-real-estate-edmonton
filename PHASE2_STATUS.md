# Status Report — Phase 2

**Created:** June 18, 2026 (MDT)
**Author:** Kaustubh Chati
**QA gate:** Olivia
**Approval gate:** Prof. Haifang Huang
**Supersedes:** PHASE1_STATUS.md (now read-only)

Phase 2 picks up all carried-forward items from Phase 1
and adds the next-priority workstreams: remaining frontend
sections, agent pipeline, and Prof deliverables.

---

## 1. Carried forward from Phase 1

### Backend / pipeline
- [ ] **Layer 1b** — LISA I spatial outlier filtering.
      Inputs: `assess_2026_clean.csv`. Output: filtered
      frame with spatial outlier flag column.
- [ ] **Layer 2 — 10% divergence gate** — deferred from
      Phase 1 (requires confidential data, scoped to
      Phase 2 Sanity Agent).
- [ ] **R1 vs Assessment Class % ≥ 90 head-to-head** —
      Tableau parity check. Low priority.
- [ ] **R3b** — ~104 building-and-land manufactured home
      FNs. Probably unnecessary; confirm and close.
- [ ] **08b rescue table** — CHAPPELLE AREA → ID 5471,
      HERITAGE VALLEY TOWN CENTRE AREA → ID 5472 in new
      407-polygon boundary. Old IDs 5462/5464 no longer
      exist. Resolve before next pipeline refresh.
- [ ] **R1 scoreboard notes backfill** — rejected R1'
      variant note still missing from scoreboard CSV.

### Frontend — sections not yet built
- [ ] **Point layers batch** (Amenities):
      ETS Bus Stops (4vt2-8zrq), LRT Stations (j77g-ki3x),
      Police Stations (e7aq-scxv), Attractions (7yt8-7467),
      Public Libraries (jn25-zspi).
      Pattern A output: one `<layer>.pmtiles` on R2 +
      one `<layer>_coverage.csv`.
      Air Quality + Business Licences held pending
      volatility/density resolution.
- [ ] **Permit Neighbourhoods choropleth** — 18-year
      GeoJSONs built and committed, route wired. Pending
      Olivia QA before ship.
- [ ] **Zoning choropleth** — nav leaf exists, no backend
      data yet.
- [ ] **Business Counts** — migrated from StatCan to
      Edmonton Business Census (neighbourhood level).
      Requires explicit provenance note on ship.
- [ ] **Salary Ranges table** — city-wide non-spatial
      table under Economy. Backend not started.
- [ ] **Neighbourhood Report Card** — parked. Map +
      functionality unresolved.

### Frontend — polish deferred from Phase 1
- [ ] Neighbourhood search — custom combobox replacing
      native `<datalist>` (inconsistent cross-browser).
- [ ] Map fly-to easing — ease-out quad vs default linear.
- [ ] Map scrollytelling / guided tour (centrepiece per
      UIUX doc, medium effort).
- [ ] Mobile layout polish (post-v2).

---

## 2. New Phase 2 workstreams

### Agent pipeline
- [ ] **Sanity Agent** — N≥100 gate, YoY ±10% jump
      detection, spatial neighbour check. Olivia owns
      ongoing operation.
- [ ] **Refresh Report Agent** — structured output on
      each pipeline run.
- [ ] **Narrative Agent** — plain-language summary of
      each refresh for sidebar/download.
- [ ] **Watchdog Agent** — monitors source dataset
      update timestamps.
- [ ] **Insight Agent** — flags notable changes.
- [ ] **Digest Agent** — weekly summary email.
- [ ] Agent runs table — `agent_runs` logging
      (in/out/tools/tokens/cost/duration) from day one.

### Boundary file migration (in progress)
- [ ] Scripts 08 + 08b fully migrated to new
      City of Edmonton Neighbourhoods CSV (65fr-66s6,
      407 rows). Parallel non-destructive GeoJSONs
      confirmed. Resolve 08b rescue table IDs (above).
- [ ] Mature Neighbourhoods CSV (111-row subset) —
      add as boolean attribute lookup only, not boundary.

### Repository / infrastructure
- [ ] Add Olivia (Write) + Prof as GitHub collaborators.
- [ ] Transfer repo ownership to Prof or UAlberta org.
- [ ] Branch protection on main once Olivia is reviewing.
- [ ] Confirm LICENSE holder with Prof.

---

## 3. What is locked / stable entering Phase 2

- Three Layer 1a rules at F1 ≥ 0.97 (parking, R1, R3).
  Ship-ready, deterministic, temporally stable.
- Layer 2 aggregation formulas (8 columns, N<100
  suppression, Stata3 equivalence confirmed).
- 407-polygon boundary (65fr-66s6) as source of truth.
  ID-based join is the locked join strategy.
- Property Assessment choropleth — production, live,
  per-metric palettes, gradient legend, full popup.
- Building Permits point map — production, live,
  PMTiles on R2, interactive legend, standard popup.
- Cloudflare Pages (demo) + R2 (tiles) infrastructure.
- React + Vite + MapLibre + PMTiles stack (locked).
- Tippecanoe recipe locked:
  `-r1 --no-tile-size-limit --no-feature-limit`.
- Neighbourhood join: always on Neighbourhood ID,
  never on name (name drift is the documented failure).
- Refresh-by-design: no year literals anywhere in
  frontend; manifest.json drives year auto-discovery.

---

## 4. Immediate next actions (priority order)

1. Resolve 08b rescue table (CHAPPELLE / HERITAGE
   VALLEY IDs) — blocks next pipeline refresh.
2. Point layers batch — R pipeline first, then Pattern A
   frontend (one CC session per layer).
3. Permit Neighbourhoods — Olivia QA, then ship.
4. Add collaborators + branch protection.
5. Layer 1b (LISA I) — stretch goal before agent work.
6. Begin Sanity Agent scaffolding.

---

*Next update: after first Phase 2 milestone ships.*
*Maintained by Kaustubh Chati*
