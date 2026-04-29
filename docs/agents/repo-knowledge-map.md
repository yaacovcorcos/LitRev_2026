# Repo Knowledge Map

Purpose: provide one discovery surface that helps agents rapidly find authoritative context, then branch into the correct Tier 2/Tier 3 artifacts.

This map is additive to `AGENTS.md` routing and `docs/agents/cold-memory-index.md` retrieval rules; it does not replace them.

## 1) Fast Start Discovery Loop

1. Confirm changed paths and user intent in `AGENTS.md`.
2. Open the matching specialist in `docs/agents/specialists/`.
3. Use this file to jump directly to the highest-signal canonical docs.
4. Read only active plans indexed in `docs/plans/README.md`.
5. If behavior changed, update both implementation and docs in the same task.

## 2) Canonical Entry Points by Goal

### Product and operating contract
- Product contract (WHAT/WHO/WHY): `PRD.md`
- Repo-wide execution contract: `AGENTS.md`
- Plan governance and active plan registry: `docs/plans/README.md`

### Agent platform and quality
- Runtime architecture and sequencing: `docs/plans/plan-agentic.md`
- Reliability, eval, and rollout controls: `docs/plans/plan-agent-quality.md`
- Memory, retrieval, grounding, and extraction: `docs/plans/plan-memory.md`
- Context capture execution surface: `docs/plans/plan-context-capture.md`

### UI/UX and frontend quality
- Durable frontend doctrine: `docs/architecture/frontend-quality-bar.md`
- Frontend delivery/review process: `docs/runbooks/frontend-review-loop.md`
- UI vocabulary normalization: `docs/architecture/agentic-ui-glossary.md`
- Active UI execution plans: start from `docs/plans/README.md` and follow listed canonical plans only.

### Data/DB and production safety
- DB semantics and invariants: `docs/runbooks/db-architecture.md`
- DB triage/remediation operations: `docs/runbooks/db-ops.md`
- Production migration posture: `docs/plans/db-production-runbook.md`
- Production release safety gates: `docs/agents/cold-memory-index.md` (Database and deploy rows)

### Testing, lint, and repo health
- Test command and scope contract: `docs/agents/testing-agent-contract.md`
- Cross-cutting test/CI policy: `docs/runbooks/testing-ci-strategy.md`
- Lint architecture/governance: `docs/plans/plan-lint-governance.md`
- Testing execution plan: `docs/plans/plan-testing-execution.md`
- Recurring quality regressions: `docs/reviews/repo-health.md`

### Security, admin, and governance ops
- Security baseline: `docs/runbooks/security-baseline.md`
- Disclosure/process baseline: `SECURITY.md`
- Admin control-plane runbook: `docs/runbooks/admin-access.md`
- GitHub branch/PR/worktree policy: `docs/runbooks/github-flow.md`

## 3) Source Freshness and Trust Rules

- Prefer canonical runbooks/plans over ad hoc notes.
- Prefer active plan files listed in `docs/plans/README.md`; treat unlisted artifacts as supporting or archived context.
- When two docs conflict, treat the mismatch as drift and update the stale artifact in the same task.
- For repeated clarifications, codify once in a durable doc and link it from `docs/agents/cold-memory-index.md`.

## 4) High-Signal Search Recipes

Use `rg` from repo root for deterministic discovery.

- Find active plan owners for a topic:
  - `rg -n "<topic>" docs/plans/README.md docs/plans`
- Find authoritative runbook references:
  - `rg -n "<topic>" docs/runbooks docs/architecture docs/agents/cold-memory-index.md`
- Find where a route/subsystem is implemented:
  - `rg -n "<keyword>|<path-fragment>" next-app/app next-app/lib next-app/components`
- Find prior review findings before changing architecture:
  - `rg -n "<topic>" docs/reviews docs/reports docs/architecture/decision-log.md`

## 5) Minimal Completion Checklist for Knowledge Work

- Updated canonical artifact(s) only (no parallel truth).
- Updated links when adding or renaming docs.
- Verified retrieval path from `AGENTS.md` trigger -> specialist -> Tier 3 docs.
- Kept plan files as current-state trackers (no diary/changelog sprawl).
