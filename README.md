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
| `VITE_PMTILES_BASE`  | `https://pub-600ea350470345bbb93a035ad72875d5.r2.dev` | Origin the building-permits `.pmtiles` is fetched from. **The host MUST honor HTTP range requests (HTTP 206 Partial Content)** — PMTiles reads tiles by byte-range. Cloudflare Pages does **not** honor ranges on static assets, which is why the default is Cloudflare R2; a range-capable host (e.g. nginx, which serves ranges by default) could self-host the file. Give the origin only — no trailing slash, no `/building-permits` suffix. |
| `VITE_BASE_PATH`     | `/`                                              | Public path the built site is served under. `/` = host root (current deploy). Set to a subpath like `/realestate/` (leading **and** trailing slash) for a non-root deploy. Drives both Vite's `base` and the router `basename` (via `import.meta.env.BASE_URL`), so they cannot drift. **Not yet a complete subpath deploy — see the caveat below.** |

**Subpath caveat (`VITE_BASE_PATH` ≠ `/`).** `base` rebases bundled assets (`/assets/…`)
and the router, but it does **not** rewrite the root-absolute runtime fetches the app issues
for data (`/data/…`, `/manifest.json`), downloads (`/downloads/…`), and the basemap style
(`/styles/custom-basemap.json`) — those are plain string literals Vite leaves untouched. So
under a subpath they would 404. Until a follow-up routes those through `import.meta.env.BASE_URL`,
`VITE_BASE_PATH` is groundwork; the only fully-working values today are `/` (root) and hosting
those asset trees at the same absolute paths on the target host.
