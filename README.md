# Open Data Centre for Alberta Urban Real Estate

A **free-tier, static replication** of the public real-estate data website at
`realestatedata.srv.ualberta.ca` — the Tableau Public dashboards rebuilt as our own maps and
pages, fed by an R data pipeline. Phase 1 delivers Edmonton property-assessment cleaning
(Layer 1a row rules) and per-neighbourhood aggregation with spatial join (Layer 2); further
cities and data domains queue behind it.

Built on free, open tooling — **React + Vite + PMTiles + MapLibre** for the site, **R** for the
pipeline — and served as static files: no licensed software, no live server, no runtime database.
(A larger agent-driven data platform is a separate, parked future direction — not this build.)

Maintained by **Kaustubh Chati** (Research Assistant, builder), with **Olivia** (verification /
QA and review gate), under **Prof. Haifang Huang**, University of Alberta, Department of Economics.
The bar is "researchers and the public can rely on it," not five-nines uptime.

> The deployed site's displayed identity (university, centre, funder names) is placeholdered in
> `website/src/config/siteConfig.js` until finalised — see CLAUDE.md §6.

## Context

- **[CLAUDE.md](./CLAUDE.md)** — authoritative project context: locked architecture, pipeline
  invariants, website build spec, repo conventions, negative rules. Read this first.
- **[PHASE1_STATUS.md](./PHASE1_STATUS.md)** — pipeline state: validated rules, coverage math,
  Layer 2 acceptance criteria, open items.

## Layout (see CLAUDE.md §3)

- `pipeline/` — the R data pipeline, organised by section (runs on a laptop, never deploys).
- `website/` — the React + Vite app (the deployable static site).
- `docs/` — flowchart, cost-saving document, onboarding.

## Run the current choropleth (demo)

`pipeline/property-assessment/scripts/09_build_choropleth.html` — interactive MapLibre choropleth
of 2026 median residential assessment, 402 Edmonton neighbourhoods. Serve from the repo root:

```sh
python3 -m http.server 8000
open http://localhost:8000/pipeline/property-assessment/scripts/09_build_choropleth.html
```

This standalone HTML is the reference the React build (`website/`) ports from.
