# Cold Memory Index (Tier 3)

Use this index to retrieve authoritative docs before editing high-risk domains.
Routing authority stays in `AGENTS.md`; this file only maps already-matched domains to canonical docs.

## Retrieval Protocol

1. Use `AGENTS.md` to identify the matched subsystem by changed paths and task intent.
2. Read the listed canonical doc(s) before editing.
3. If docs conflict with code, treat docs as stale and update docs in the same task.
4. Record architecture-impacting changes in the correct plan file.

## Canonical Subsystem Map

| Subsystem | Primary docs | When to retrieve |
|---|---|---|
| Database schema, operations, and production drift | `docs/runbooks/db-architecture.md` for schema/domain structure and invariants; `docs/runbooks/db-ops.md` for diagnosis, migration state, connectivity, and repair; `docs/plans/db-production-runbook.md` for production migration/release/remediation | Any Prisma schema change, migration issue, deploy DB gate, runtime schema errors, or DB-structure explanation task |
| Platform admin control plane (bootstrap, guards, mutations, audit, analytics) | `docs/runbooks/admin-access.md`, `docs/plans/plan-backend.md` | Changes under `next-app/app/admin/**`, `next-app/app/api/admin/**`, `next-app/lib/server/admin/**`, or admin guard logic |
| Agent orchestration and execution loop | `docs/plans/plan-agentic.md`; use `docs/plans/README.md` to locate any additional active runtime plans; `next-app/lib/agent/**`, `next-app/lib/server/agent/**` | Changes to planner/execution/router/sub-agent flow; use only active plans listed in `docs/plans/README.md` |
| Memory and retrieval architecture | `docs/plans/plan-memory.md` | Any memory extraction, embedding, retrieval, or memory lifecycle work |
| Backend and infrastructure decisions | `docs/plans/plan-backend.md` | Server action/service/DB contract changes |
| Guided setup behavior | `docs/plans/plan-guided-setup.md` | Onboarding/setup activation flow changes |
| Prompting/extraction logic | `docs/plans/plan-prompts.md` | Prompt text/schema/LLM extraction changes |
| UI/UX architecture and roadmap | `docs/architecture/frontend-quality-bar.md`, `docs/runbooks/frontend-review-loop.md`, `docs/plans/README.md` to locate the active relevant UI plan, `docs/architecture/agentic-ui-glossary.md` when vocabulary normalization matters | Component and interaction model changes, or any request to normalize product/code vocabulary for chat timeline, transparency, artifacts, or composer terms |
| Responsive/mobile foundation and chat UX execution | `docs/plans/mobile-plan.md`, `docs/plans/mobile-layout-contract.md`, `docs/runbooks/responsive-foundation-certification.md`, `docs/plans/chatRuntime.md` | Any responsive tier, phone/compact layout contract, mobile chat layout, drawer/composer, popup behavior, or responsive certification change |
| Chat runtime rollout operations | `docs/plans/chatRuntime.md`, `docs/runbooks/chat-unification-burn-in.md` | U1.6 canary setup, burn-in validation, and U3 unlock decisions |
| GitHub branch/PR/review automation | `docs/runbooks/github-flow.md` | Any edits to `.github/workflows/**`, branch protections, CODEOWNERS, or agent git policy |
| Repo-wide health reviews and recurring regression analysis | `docs/reviews/repo-health.md`, latest file under `docs/reviews/`, `docs/architecture/decision-log.md` | Any request to rerun a deep whole-repo analysis, compare against prior reviews, or assess repeated mistakes/drift |
| Durable repo-review baseline and review comparisons | `docs/runbooks/repo-review-baseline.md`, `docs/reports/diagnosis-03-02.md`, `docs/plans/plan-agentic.md` | Any deep diagnosis rerun, review-quality comparison, or governance update about prior findings |
| Product contract | `PRD.md` | Changes to product WHAT/WHO/WHY |
| Plan governance | `docs/plans/README.md` | Any edits to `docs/plans/*.md` |
| Cross-agent implementation planning contract | `docs/agents/universal-planning-meta-prompt.md` | Any request to draft implementation plans across domains, or any change to planning quality standards |

## Gap Signal Policy

A missing doc for an active subsystem is a blocker signal, not a minor warning.
When retrieval returns no relevant canonical doc:

1. Document current state first.
2. Then design and implement changes.
3. Update the new doc after implementation.

## Codification Rule

If the same domain explanation is needed twice, convert it into a durable Tier 3 artifact and link it from this index.
