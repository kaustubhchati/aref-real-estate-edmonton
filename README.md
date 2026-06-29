# Open Data Centre for Alberta Urban Real Estate (Dev Build)
# MAPS LIVE: Property Assessment · Building Permits · Permit Neighbourhoods. Download page live.
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
- **[PHASE1_STATUS.md](./PHASE1_STATUS.md)** — Phase 1 pipeline + frontend state, now **closed /
  archive** (June 18, 2026): validated rules, coverage math, Layer 2 acceptance criteria, and the
  final frontend state.
- **[PHASE2_STATUS.md](./PHASE2_STATUS.md)** — current status: carried-forward items, new Phase 2
  workstreams (agent pipeline, boundary migration, infrastructure), and the prioritised next actions.

## Layout (see CLAUDE.md §3)

- `pipeline/` — the R data pipeline, organised by section (runs on a laptop, never deploys).
- `website/` — the React + Vite app (the deployable static site).
- `docs/` — flowchart, cost-saving document, onboarding.

## Run the current choropleth (demo)

`pipeline/yeg/property-assessment/scripts/production/09_build_choropleth.html` — interactive MapLibre choropleth
of 2026 median residential assessment, 402 Edmonton neighbourhoods. Serve from the repo root:

```sh
python3 -m http.server 8000
open http://localhost:8000/pipeline/yeg/property-assessment/scripts/production/09_build_choropleth.html
```

This standalone HTML is the reference the React build (`website/`) ports from.

## Refreshing pipeline data (regenerate + publish)

A section is regenerated **and** published to the site with ONE command. The runner
(`run_section.R`) runs the section's scripts in dependency order (fresh process each),
then publishes `output/ → website/public/` using that section's `handoff` block in
`_whirl.yaml`. The runner is the **sole** publisher of `website/public/` (CLAUDE.md §2).

```sh
# Regenerate + publish one section (example: Dwelling Units / building permits)
Rscript run_section.R building-permits

# Prove the wiring first (resolve cwd + scripts, no side effects):
Rscript run_section.R building-permits --dry-run
```

For building-permits this runs `01_build_permits` (fetches today's snapshot) →
`02_build_permit_aggregates` → `03_emit_manifest`, then copies the per-year
neighbourhood GeoJSONs + `manifest.json` + the download CSVs into `website/public/`.

**Do NOT run a single script as a refresh.** A standalone run (e.g.
`Rscript scripts/production/02_build_permit_aggregates.R`) writes only to that section's
`output/` — it does **not** publish. Publishing lives only in the runner's handoff phase
(reached only after the whole section succeeds), so a standalone run leaves
`website/public/` stale (the silent staleness that has bitten the live map before).
Always refresh through `run_section.R <section>`.

### Refresh-by-design (no frontend edits on a year rollover)

The site reads its years, filenames, and spans from the per-section `manifest.json`
the pipeline emits — there are no year literals in the frontend. So a new data year is a
**pipeline-only** change: emit the new GeoJSON/CSV + regenerate the section's manifest, and the
maps, the Report Card table, and the Download page pick up the new year automatically. The one
exception is **Business Counts**, whose year is baked into its source filename and column keys
with no manifest to source it from — it is parked pending a small backend emit
(`docs/BC_MANIFEST_HANDBACK.md`).

## Deploying the site

The site is a static build hosted on Cloudflare Pages (free tier), connected to this
repo. Pages rebuilds automatically on every push to `main`.

Cloudflare Pages build settings:

| Setting                | Value                          |
| ---------------------- | ------------------------------ |
| Root directory         | `website`                      |
| Build command          | `npm install && npm run build` |
| Build output directory | `dist`                         |
| Environment variable   | `NODE_VERSION` = `20`          |

Note: the output directory is **relative to the root directory** (`website`), so it is
`dist`, not `website/dist`.

Live: https://aref-real-estate-edmonton.pages.dev/

A University of Alberta server is the intended long-term home; the Cloudflare deploy is
the free-tier proof and demo.

### Single-page-app routing fallback (any host)

The site is a client-routed SPA: only `index.html` is real, and React Router renders the
rest in the browser. So the host must serve `index.html` (with a **200**, not a redirect)
for any path that is not a real static file — otherwise a hard refresh or shared deep link
to e.g. `/properties/property-assessment` returns a 404.

The fallback **must not shadow real static assets** (`/assets`, `/data`, `/styles`,
`/downloads`, `/manifest.json`): real files are served first, the SPA catches only the rest.

- **Cloudflare Pages** — handled by `website/public/_redirects` (`/*  /index.html  200`),
  which Vite copies into `dist/`. Pages serves existing files before applying the catch-all.
- **nginx** (the UAlberta server) — add the equivalent `try_files` rule, which serves the
  requested file/dir first and falls back to `index.html` only when neither exists:

  ```nginx
  location / {
      try_files $uri $uri/ /index.html;
  }
  ```

### Environment variables (host portability)

Build-time `VITE_`-prefixed env vars let the serve target be configured instead of
hardcoded. Each has an in-code default that reproduces the current Cloudflare Pages
deploy, so **none are required** — set them only to point the site at a different host.
(`.env`/`.env.*` are gitignored; set these in the build environment, e.g. a Cloudflare
Pages variable or an `export` before `npm run build`.)

| Variable             | Default                                          | Purpose |
| -------------------- | ------------------------------------------------ | ------- |
| `VITE_BASE_PATH`     | `/`                                              | Public path the built site is served under. `/` = host root (current deploy). Set to a subpath like `/realestate/` (leading **and** trailing slash) for a non-root deploy. Drives Vite's `base`, the router `basename`, **and** every runtime asset fetch (via `assetUrl` / `import.meta.env.BASE_URL`), so a subpath deploy is fully wired — see the note below. |

**Subpath deploy (`VITE_BASE_PATH` ≠ `/`) — fully supported.** Vite rebases the bundled
assets and the router; the app's hand-issued runtime fetches — data (`/data/…`), downloads
(`/downloads/…`), the `manifest.json` files, and the basemap style
(`/styles/custom-basemap.json`) — all go through one helper, `website/src/utils/assetUrl.js`,
which joins each path to `import.meta.env.BASE_URL`. At the default base `/` it is a no-op
(today's deploy is unchanged); under `/realestate/` every fetch resolves to `/realestate/…`.
Verified end-to-end: a `VITE_BASE_PATH=/realestate/` build loads its data, styles, and
downloads under the subpath with zero requests to the host root.
