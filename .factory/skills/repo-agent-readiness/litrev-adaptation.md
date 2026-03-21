# LitRev Adaptation

This overlay refines the general `repo-agent-readiness` skill for LitRev.

It does not supersede `AGENTS.md`.
When conflicts exist, `AGENTS.md` and canonical LitRev governance docs win.

## Core Governance Reads

Read first:
- `AGENTS.md`
- `docs/plans/README.md`
- `docs/agents/cold-memory-index.md`
- `docs/reviews/repo-health.md`
- `docs/runbooks/repo-review-baseline.md`
- `docs/architecture/decision-log.md`

Read when present and relevant:
- latest dated file under `docs/reviews/`
- `docs/reviews/review-template.md`
- relevant specialist under `docs/agents/specialists/`

## LitRev-Specific Things To Audit

### Instruction Topology
- Tier 1 / Tier 2 / Tier 3 separation
- whether governance lives in the right layer
- whether specialist scopes remain subordinate to `AGENTS.md`

### Verification Topology
- whether route-level mandatory checks in `AGENTS.md` match actual package scripts and CI
- whether `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, and governance checks are aligned

### Enforcement Topology
- whether important repo contracts remain prose-only
- especially:
  - effect discipline
  - import/export/searchability rules
  - logging/error-surface rules
  - route-specific UI delivery rules

### Searchability and Placement
- default exports outside framework-required files
- parent-directory relative imports across boundaries
- large route/runtime files
- deterministic test placement where it matters most

### Drift Memory
- whether `docs/reviews/repo-health.md` reflects current truth
- whether major review conclusions were codified in plans, rules, or decisions
- whether stale review findings remain open without ownership

## LitRev Durable Artifact Pattern

When writing a durable review:
- use `docs/reviews/review-template.md`
- update `docs/reviews/repo-health.md`
- write a dated snapshot under `docs/reviews/`
- keep the living summary concise and replace stale statements instead of appending history
