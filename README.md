# Open Data Centre for Alberta Urban Real Estate

Research-infrastructure data platform replacing the WordPress + Tableau Public website at `realestatedata.srv.ualberta.ca` with an automated, agent-driven pipeline for Alberta urban property data. Phase 1 covers Edmonton property assessment cleaning (Layer 1a row rules) and per-neighbourhood aggregation with spatial join (Layer 2); further cities and data domains queue behind it.

Maintained by Kaustubh Chati (Research Assistant) under Prof. Haifang Huang, University of Alberta, Department of Economics. Not a commercial product — bar is "researchers and the public can rely on it," not five-nines uptime.

## Context

- **[CLAUDE.md](./CLAUDE.md)** — authoritative project context: architectural invariants, cleaning methodology, repo conventions, negative rules.
- **[PHASE1_STATUS.md](./PHASE1_STATUS.md)** — current pipeline state: validated rules, coverage math, Layer 2 acceptance criteria, open items.

## Demo

`scripts/09_build_choropleth.html` — interactive MapLibre choropleth of 2026 median residential assessment, 402 Edmonton neighbourhoods. Serve from project root:

```sh
python3 -m http.server 8000
open http://localhost:8000/scripts/09_build_choropleth.html
```
