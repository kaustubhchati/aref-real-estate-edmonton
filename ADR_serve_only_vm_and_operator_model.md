# ADR — Serve-Only VM, Invisible Tiling, and the Prof-as-Operator Model

**Status:** Proposed — awaiting Olivia review, Prof Huang approval.
**Audience:** Olivia (review gate), Prof Huang (approval gate), Claude/CC (build context).
**Authorship:** KC, sole origin author. Decisions are KC's; this record exists to make them durable and reviewable.
**Source basis:** Synthesises a multi-session exploration of the tippecanoe-on-Windows
problem, the IST Virtual Server Hosting offering, and the long-run operator question.
Builds on `total_website_builder_plan.md`, `frontend_deployment_capability_reference.md`,
and `section_scaffolding_engine.md`. Verify all on-disk state before building against this.
**How to read this:** Each decision uses the project's five-field shape —
Decision / Why / Example / Rejected / When-this-changes. Decisions are ordered so the
binding constraint (D0) comes first; everything downstream answers to it.

---

## The binding constraint that reframes everything (D0)

### Decision
The long-run operator of the system is **Prof Huang** — a non-technical operator with
**no developer on call**. Every production step (refresh, build, tile, publish, recover)
must therefore be **invisible, single-command, OS-agnostic, zero-maintenance, and
recoverable from a written runbook.** This constraint outranks all technical preferences
in this ADR and is the reason the other decisions resolve the way they do.

### Why
RAs leave; Olivia reviews but is not a refresh-operator and may move on after her PhD;
KC is the current sole author but not a permanent fixture. The only named permanent role
that survives staffing turnover is the supervisor. A system whose yearly operation
assumes a developer is present is a system that dies at the first unattended failure
(a changed Socrata schema, a Node upgrade, a replaced laptop). Designing for "a
professor runs one command, and escalates to a named contact when something genuinely
breaks" is the only model that survives.

### Example
The yearly refresh, in full, from the operator's point of view: Prof Huang runs one
command. It downloads the new year's data, validates it, builds the site, generates
tiles, and reports in plain language whether it succeeded. A second command publishes
the verified result live. If either fails, the message tells him what to do or whom to
email. He never learns the words "tippecanoe," "Node," "Vite," or "nginx."

### Rejected
- **"A technical successor RA will always inherit the operator role."** Rejected as the
  planning assumption: there is no committed technical successor, and the realistic
  long-run operator is Prof Huang. If a technical successor *does* materialise, nothing
  here breaks — it only means the runbook's escalation path has a warmer body — but the
  architecture must not *depend* on that body existing.
- **Designing for "literally no one ever helps."** Also rejected. No professor operates a
  software system forever with zero support. The model is routine-ops-by-Prof +
  rare-break-escalation-to-a-named-contact (see D5).

### When-this-changes
If the project gains a funded, permanent technical operator role, D0 relaxes and several
downstream decisions (notably the tippecanoe retirement in D3) could be revisited. Until
that role exists and is funded, D0 holds.

---

## D1 — The VM is serve-only; all computation stays on the operator's pipeline machine

### Decision
The production VM (IST Hosted Server) runs **nothing but a static web server (nginx) and
a TLS certificate**. It serves a directory of files. No R, no Node, no build step, no
tiler, no data fetching, ever runs on it. The complete pipeline — fetch, clean, validate,
aggregate, build, **tile** — runs on the operator's local machine, exactly as the locked
invariant "the R pipeline runs locally, never deploys" already states. The VM is a dumb
origin; the laptop is the whole brain.

### Why
This is the honest completion of an invariant already in the architecture. It collapses
the VM to the most boring, hardenable, low-maintenance thing that can exist — a
static-file server with no application runtime. That directly defuses the central risk in
the IST offering: IST's managed expertise is a Microsoft/CMS shop (WordPress, Drupal,
.NET, ASP, MS SQL), none of which is our stack. A serve-only nginx box needs OS security
updates and TLS renewal and essentially nothing else, so the mismatch between our stack
and IST's support competency stops mattering. It also dissolves three recurring problems
at once: VM egress (the box never fetches, so Socrata reachability from the VM is moot),
Node/R-on-server drift, and — critically — the cross-platform tiling problem (see D3).

### Example
```
OPERATOR MACHINE (the brain)              VM (the dumb mouth)
────────────────────────────              ──────────────────
refresh.R
  ├─ run sections (callr, JSONL)
  ├─ runner handoff → website/public/   ← sole-publisher seam, UNCHANGED
  ├─ verdict gate
  ├─ build_site.sh → website/dist/
  └─ tile stage → *.pmtiles  (produced LOCALLY)
        │
        │  ONE publish hop (see D4)
        ▼
   staged rsync + atomic flip ──────────►  /var/www/aref/current  (nginx root)
                                            serves SPA + GeoJSON + CSV + PMTiles + TLS
                                            NO Node · NO R · NO build · NO tiler
```

### Rejected
- **Build/compute on the VM (the managed Website-hosting track).** Rejected: IST's
  turnkey website product is WordPress/Drupal/.NET — not a React+Vite static bundle or an
  R pipeline. We take the raw Hosted Server (compute) and run our own nginx; we do not try
  to fit our stack into their managed CMS track.
- **CI (GitHub Actions) to run the build/tile remotely.** Rejected (consistently across
  this exploration): it contradicts the deliberately in-house monolith, moves a core
  production step into a cloud service with its own console/auth/failure-surface, and
  introduces secrets management and an external runtime dependency at refresh time.

### When-this-changes
If traffic ever exceeds what a single university VM can serve comfortably, a CDN (e.g. R2,
see D3) can be reintroduced *in front of* the VM behind the existing `PMTILES_BASE` env
seam — a reversible config change, not an architecture change.

---

## D2 — Pages-era constraints do not apply on the VM; large files serve directly

### Decision
On the production VM, serve PMTiles and large GeoJSON **directly from nginx**. The
Cloudflare Pages constraints that drove the hardest problems — the 25 MB per-file cap and
the lack of HTTP 206 (byte-range) support — **do not exist on a raw nginx box.** nginx
serves byte-range requests natively and has no per-file cap. nginx config (`gzip on` for
GeoJSON, range serving for PMTiles) lives in a version-controlled `nginx.conf` in the
repo, not hand-tweaked on the box.

### Why
The problems that generated the entire tippecanoe/PMTiles thread were *Pages* problems.
Moving production to a VM that lacks those limits makes the production architecture *less*
constrained than the demo. The 126 MB GeoJSON / 104 MB PMTiles that cannot live on Pages
serve fine from nginx. Keeping `nginx.conf` in the repo prevents repeating the
Pages-dashboard mistake (config that lives outside the repo and does not travel).

### Example
A 126 MB GeoJSON served with `gzip on` transfers at roughly 15–30 MB over the wire and
needs no tiling at all *for serving purposes* — though tiling may still be wanted for
browser parse/render performance on very large layers (an independent question from
transport, decided per layer on feature count, not on the Pages cap).

### Rejected
- **Keeping R2 as a forced dependency.** Rejected as *forced*; retained as *optional*.
  R2 existed to work around Pages limits. The VM removes those limits, so R2 becomes a
  deliberate choice (CDN offload) rather than a necessity. See D3.

### When-this-changes
If an air-gapped/offline VM is ever required, the external CARTO basemap CDN dependency
(documented residual coupling) would need a self-hosted style + glyphs. Out of scope now.

---

## D3 — tippecanoe is retired from the operator path in favour of an invisible, in-stack tiler (bench-gated)

### Decision
Remove tippecanoe from the operator's pipeline. Replace the tile-production step with an
**invisible, zero-install, OS-agnostic tile stage** built on tooling already present in
the stack: **GDAL (already available via the R `sf` package) → go-pmtiles (a single
static binary committed to the repo)**. The swap is **gated on a density bench** (D3a):
if GDAL's tiling preserves the density the current tippecanoe recipe produces
(`-r1 --no-tile-size-limit --no-feature-limit`) at the zoom levels actually displayed,
GDAL→go-pmtiles becomes the operator tiler. If the bench shows unacceptable density loss,
the fallback invisible tiler is **Planetiler** (a single JAR, cross-platform via a JRE),
**not** tippecanoe. tippecanoe may remain as KC's *local, personal* high-fidelity tool but
leaves the operator chain entirely.

### Why
Under D0, the tiler cannot require a specific OS, an install, admin rights, a build step,
or a separate environment, because Prof Huang must run it unattended and recover it from a
runbook. tippecanoe has **no native Windows binary** (confirmed: no PyPI Windows wheel, no
conda-forge win-64 build, no MSVC port — every Windows path routes through Cygwin or WSL,
which demand admin + virtualization + ongoing technical maintenance). GDAL is already
present the moment the operator can run the R pipeline at all; go-pmtiles is one static
executable with native Windows/Mac/Linux builds. The tile stage becomes ordinary R code
the runner calls — the operator never knows a tiler exists, and the experience is
identical on any OS. This is the only family of options that satisfies D0.

### Example
The tile stage, conceptually, inside the runner:
```
GeoJSON  ──►  GDAL ogr2ogr (-f "PMTiles", or → MBTiles)  ──►  go-pmtiles (convert/cluster)  ──►  *.pmtiles
              already in stack via sf                          committed static binary, all OS
```
Operator experience: runs `refresh.R`; tiles appear in `output/`; publish ships them. No
"tippecanoe," no Homebrew, no WSL, no Docker.

### Rejected
- **WSL2 + tippecanoe.** Rejected under D0. Perfect recipe fidelity, but demands a
  professor maintain a Linux subsystem, build tippecanoe from source, and debug the
  `/mnt/c` performance cliff unattended. Viable only for a technical operator on one
  trusted machine — which D0 says we do not have long-run.
- **Docker / Podman tippecanoe.** Rejected: licensing (Docker Desktop at UAlberta scale),
  admin + virtualization, a daemon to keep alive, and path-mount friction — all on a
  non-technical operator's machine. No gain over the in-stack route.
- **conda-forge / PyPI tippecanoe.** Rejected on Windows: macOS/Linux only; no win-64
  build, no Windows wheel. Solves nothing for a possibly-Windows operator.
- **"Make our own" tiler from scratch.** Rejected as disproportionate: reimplements
  tippecanoe's hard parts (boundary clipping, coordinate quantisation, ring validity) for
  no benefit over borrowing GDAL's battle-tested geometry layer + go-pmtiles' packing.
- **R2 as forced tile host.** Demoted to optional (see D2). Default is serve PMTiles from
  the VM; the `PMTILES_BASE` env seam keeps re-adding R2 as a one-config-change CDN move.

### When-this-changes
If D0 relaxes (a funded permanent technical operator appears), tippecanoe could return as
the operator tiler for maximum density fidelity. Also: if the D3a bench shows GDAL is
*both* sufficient AND identical enough, go-pmtiles may even be unnecessary for layers GDAL
can emit as PMTiles directly — the bench informs that.

### D3a — the deciding measurement (must run before the swap)
Regenerate **one real PA layer** through GDAL→go-pmtiles and diff against the current
tippecanoe `.pmtiles` baseline: per-zoom feature counts and file size at z10–z14, plus a
visual density spot-check. This single measurement decides GDAL-vs-Planetiler and is the
subject of the companion recon directive. **No pipeline change before this bench reports
and KC reviews.**

---

## D4 — Publish becomes a separate one-command verb with staging + atomic flip

### Decision
Publishing the verified local build to the VM is a **separate operator verb** (e.g.
`deploy.sh`), distinct from `refresh.R`. It does **staged rsync → verify → atomic symlink
flip → (keep prior release for rollback)** internally, and reports in plain language
whether the site is live. The operator never hand-runs rsync or manages symlinks.

### Why
The laptop→VM hop is a network operation that can partially fail, creating a *torn deploy*
(new SPA bundle, stale data, or vice versa) — a failure mode the current local
sole-publisher copy does not have. Publishing to a staging directory then atomically
flipping a `current` symlink means visitors see either the whole old release or the whole
new one, never a torn mix, and gives instant rollback + release history the current
single-directory publish lacks. Keeping `deploy.sh` separate from `refresh.R` preserves a
human review beat: refresh+inspect locally, *then* decide to push live — matching Olivia's
QA gate and avoiding "every data refresh auto-publishes to the world."

### Example
```
deploy.sh
  → rsync dist/ + data/ + tiles/  →  /var/www/aref-releases/<timestamp>/
  → verify (zero-byte guard, expected files present)
  → ln -sfn /var/www/aref-releases/<timestamp>  /var/www/aref/current   (atomic)
  → report: "Site is live as of <timestamp>. To roll back, run: deploy.sh --rollback"
```

### Rejected
- **Folding publish into `refresh.R` (auto-publish on every refresh).** Rejected: removes
  the human review beat and risks publishing unreviewed data to the public site.
- **Manual rsync + manual symlink management by the operator.** Rejected under D0: Prof
  Huang cannot be expected to SSH in and manage symlinks, and cannot manually un-break a
  torn deploy. The safety must be inside one command.

### When-this-changes
The SSH key authorising laptop→VM publish is per-operator. At any operator handoff, the new
operator's key is added and the prior one removed — a documented protocol in the runbook
(D5), not an architecture change. (Note: pushing to production is a human action; it is
never performed by Claude/CC.)

---

## D5 — Operability spine reclassified as load-bearing; runbook + escalation contact required

### Decision
Three things previously classified as "optional polish" or "KC's call" are **reclassified
as load-bearing deliverables** under D0:
1. **The §5 entrypoint + Node-version guard** (sentinel-anchored, committed `.nvmrc` +
   `engines`) — it is the disaster-recovery spine: "rebuild the whole site from a clean
   clone, guarding the runtime version."
2. **The one-verb refresh chain with operator-facing verdicts** — failure states must
   translate to plain-language operator actions, not internal jargon (not "vroom parsing
   warning" but "Data downloaded with minor warnings — safe to publish" / not "error" but
   "Data download failed — check internet and re-run; if it persists, email <contact>").
3. **A written operator runbook aimed at Prof Huang** (not `METHODOLOGY.md`, which is the
   why, for reviewers): one-command-per-task, explicit "if you see X do Y," explicit
   rollback steps, and a **named technical escalation contact.**

### Why
Once the operator is a non-technical professor with no developer on call, "one command
that recovers from a clean clone" is not polish — it is what stands between him and an
unrecoverable broken build after a laptop replacement or runtime upgrade. The failure UX
*is* a feature: a verdict he cannot act on is equivalent to no verdict. And no professor
operates a software system forever with zero support; the realistic model is
routine-ops-by-Prof + rare-break-escalation-to-a-named-contact, which only works if the
contact is actually named and written down.

### Example
A runbook section, in operator voice:
> **To refresh the data each year:** open the project, run `refresh.R`. Wait for the
> green "Refresh complete" message. If you see "Data download failed," check your internet
> and run it again. If it fails twice, email <maintainer> — the data source may have
> changed.
> **To publish the refreshed site:** run `deploy.sh`. Wait for "Site is live."
> **If the live site looks wrong:** run `deploy.sh --rollback` to restore the previous
> version, then email <maintainer>.

### Rejected
- **Leaving §5 as "optional, not load-bearing"** (its current classification in the
  deployment reference). Rejected under D0 — that classification assumed a technical
  operator.
- **Relying on `METHODOLOGY.md` as the operator's guide.** Rejected: that document is the
  reviewer-facing *why*; the operator needs a separate task-oriented *how*.

### When-this-changes
If a funded permanent technical operator appears (relaxing D0), the runbook's escalation
path warms and the failure-UX bar can ease — but the entrypoint/Node-guard and one-verb
chain remain good practice regardless.

---

## Decisions deferred (explicitly not made here)

- **Sync vs detached build** inside `refresh.R` — open judgment call recorded in
  `total_website_builder_plan.md`; unaffected by this ADR. Lean synchronous for legibility.
- **Whether very large layers still want tiling for browser-render reasons** (independent
  of the Pages cap, which D2 removed) — a per-layer call on feature count, to be decided on
  measured parse/render cost, not assumed.
- **The exact IST cost / root-access / egress answers** — must be confirmed with IST and
  priced against the ~$2,000/yr Tableau saving before the VM is committed. Flagged for the
  Prof's gate, not decided here.

---

## One-paragraph summary for the approval gate

The website architecture is sound and is **not** being rewritten. This ADR resolves a
recurring class of problem (cross-platform tiling, manual tile upload, dashboard-bound
build config) by recognising the real binding constraint: the long-run operator is Prof
Huang, non-technical, with no developer on call. From that: the VM becomes serve-only
(static nginx + TLS, no compute), which removes the Pages limits that caused the problems
and defuses the IST stack-mismatch; tippecanoe is retired from the operator path in favour
of an invisible, in-stack GDAL→go-pmtiles tiler (gated on a density bench), because nothing
requiring a specific OS or install can survive on the Prof's machine; publish becomes one
safe command with atomic flip and rollback; and the operability spine (clone-and-run
entrypoint, plain-language failure messages, an operator runbook with a named escalation
contact) is reclassified from optional to load-bearing. Net: finish the single-operator-verb
design already chosen, extend it safely across the network to a dumb origin server, and make
every step survivable by a professor working alone.
