# Agent Scope (Design Artifact)

**Author:** Kaustubh Chati (KC) — sole origin author
**Status:** DESIGN ONLY. Nothing here is built. These are staged decisions for the Phase 5 agent layer, recorded now so the architecture reserves room. **Do not implement until the pipeline migration is complete and the orchestrator (`whirl`) is producing run results** — the first agent depends on those outputs and cannot run before they exist.

---

## Purpose

Define where agents plug into the post-migration architecture, and scope the first one. Agents sit on top of the orchestrated pipeline; they do not replace or modify it. This document governs scope and contracts, not implementation.

## Sequencing

The locked plan puts the agent layer at Phase 5 (after the Phase 4 map frontend replaces the Tableau dashboards, which is the project's priority). This document does not change that. It only stages the design so the infrastructure (logging + schemas) is ready and the first agent can be built cleanly when its prerequisites exist.

## Layered design (build in this order, post-migration)

### Layer 0 — `agent_runs` log (infrastructure, build first)
An append-only JSONL file at `runs/agent_runs.jsonl`. One JSON object per line per agent invocation. Chosen as JSONL (not a database) for zero dependency, git-diffability, and human legibility. Every agent — present and future — writes one row here. Schema: `schemas/agent_run.v1.json`.

### Layer 1 — versioned output schema
Each agent emits **structured output first, prose second**: a JSON object conforming to a versioned schema checked into `schemas/`, from which any human-readable note is rendered. Versioning (`.v1`, `.v2`, ...) keeps old outputs parseable and the audit trail intact when a schema changes. First schema: `schemas/refresh_report.v1.json`.

### Layer 2 — Refresh Report agent (first agent, read-only)
The lowest-risk agent and the proving ground for Layers 0–1.
- **Inputs (read-only):** the `whirl` run result in `runs/` (summary + per-script status) and the rule scorecards in each section's `output/` (e.g. `rule_scorecards_*.csv`).
- **Output:** a `refresh_report.v1.json` + a rendered human note answering "what changed this refresh" — row-count deltas, rule precision/recall drift, scripts that errored or warned, new-year detection.
- **Side effects:** none on production data. Worst-case failure is a wrong note, never a broken pipeline. It writes exactly one `agent_runs.jsonl` row.

## Why this order

The read-only agent validates the logging table and the schema discipline before any agent with side effects (e.g. Watchdog, which acts; Insight, which interprets) is built. Observability and structured outputs are proven by the harmless consumer first, not bolted on later.

## Out of scope for this document

The other planned agents (Sanity, Narrative, Watchdog, Insight, Digest) reuse the same `agent_runs` log and the same schema-versioning discipline, but are not scoped here. No conversational agent is in the build plan.

## Standards basis

- `agent_runs` fields follow the established minimum for agent observability: structured record of each invocation with inputs, model, tokens, cost, duration, status, and a pointer to the output artifact — serving both external (audit/debug) and internal (feedback-loop) purposes.
- Schemas use JSON Schema draft 2020-12 (current stable; the dialect adopted as default by Anthropic's Model Context Protocol).
