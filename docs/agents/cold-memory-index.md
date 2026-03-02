# Cold Memory Index (Tier 3)

Use this index to retrieve authoritative docs before editing high-risk domains.

## Retrieval Protocol

1. Identify subsystem by changed paths and task intent.
2. Read the listed canonical doc(s) before editing.
3. If docs conflict with code, treat docs as stale and update docs in the same task.
4. Record architecture-impacting changes in the correct plan file.

## Canonical Subsystem Map

| Subsystem | Primary docs | When to retrieve |
|---|---|---|
| Database operations, migrations, production drift | `docs/runbooks/db-ops.md`, `docs/plans/db-production-runbook.md` | Any Prisma schema change, migration issue, deploy DB gate, runtime schema errors |
| Agent orchestration and execution loop | `docs/plans/plan-agentic.md`, `docs/plans/codex-agentic-plan.md`, `next-app/lib/agent/**`, `next-app/lib/server/agent/**` | Changes to planner/execution/router/sub-agent flow |
| Memory and retrieval architecture | `docs/plans/plan-memory.md` | Any memory extraction, embedding, retrieval, or memory lifecycle work |
| Backend and infrastructure decisions | `docs/plans/plan-backend.md` | Server action/service/DB contract changes |
| Guided setup behavior | `docs/plans/plan-guided-setup.md` | Onboarding/setup activation flow changes |
| Prompting/extraction logic | `docs/plans/plan-prompts.md` | Prompt text/schema/LLM extraction changes |
| UI/UX architecture and roadmap | `docs/plans/codex-ui-ux-plan.md` (or active UI plan), `docs/plans/claude-ui-ux-plan.md` | Component and interaction model changes |
| GitHub branch/PR/review automation | `docs/runbooks/github-flow.md` | Any edits to `.github/workflows/**`, branch protections, CODEOWNERS, or agent git policy |
| Product contract | `PRD.md` | Changes to product WHAT/WHO/WHY |
| Plan governance | `docs/plans/README.md` | Any edits to `docs/plans/*.md` |
| Plan review and sequencing decisions | `docs/plans/README.md`, target plan file, and subsystem docs above that map to planned touched paths | Reviewing agent-proposed plans for strategic fit, duplication risk, and implementation order |
| Idea backlog (non-binding) | `docs/ideas/ideas.md` | Capturing early ideas or reviewing hypotheses before they are promoted into executable plans |

## Gap Signal Policy

A missing doc for an active subsystem is a blocker signal, not a minor warning.
When retrieval returns no relevant canonical doc:

1. Document current state first.
2. Then design and implement changes.
3. Update the new doc after implementation.

## Codification Rule

If the same domain explanation is needed twice, convert it into a durable Tier 3 artifact and link it from this index.
