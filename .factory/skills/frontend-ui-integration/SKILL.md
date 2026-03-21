---
name: frontend-ui-integration
description: Implement or extend LitRev frontend workflows in next-app/ using existing contracts while following repo-owned frontend doctrine, the frontend specialist, accessibility rules, and validation gates.
---
# Skill: Frontend UI Integration (LitRev 2026)

## Purpose

Use this skill to execute LitRev frontend work after repo governance has already routed the task to the frontend path.

This skill is an execution layer.
Durable frontend truth lives in the repo.

## Read First

Read these before editing:
- `AGENTS.md`
- `docs/agents/specialists/frontend-ui-specialist.md`
- `docs/architecture/frontend-quality-bar.md`
- `docs/runbooks/frontend-review-loop.md`
- `docs/plans/README.md`
- the active relevant UI plan identified from `docs/plans/README.md`
- the touched route/component files and nearby tests

## When to use this skill

- The change is primarily UI/UX in `next-app/`.
- Existing server actions/services already support the feature, or only additive wiring is needed.
- No Prisma schema or migration work is required.

## Inputs

- Feature description and user flow.
- Target route/component paths (for example `app/project/[id]/...`, `components/...`).
- Related server entrypoints (`app/actions/...`) and service files (`lib/server/...`) if applicable.
- Design references and behavior requirements.

## Out of scope

- Prisma schema changes or migrations.
- Deploy-only work.
- New backend/service ownership changes.
- Agent-runtime ownership changes.
- Replacing repo-owned frontend doctrine with skill-local rules.

## Workflow

1. Map the request to route-level and shared component files in `next-app/`.
2. Confirm existing server action/service contracts before changing UI wiring.
3. Write:
   - `visual thesis`
   - `structure thesis`
   - `interaction thesis`
4. Reuse existing primitives and existing state ownership before creating new structure.
5. Implement the smallest change that satisfies the user-facing need without breaking ownership.
6. Run the frontend review loop from `docs/runbooks/frontend-review-loop.md`.
7. Add or update tests for meaningful behavior changes.
8. Run validation before handoff.

## Execution reminders

- Read repo docs first.
- Prefer shared primitives in `next-app/components/ui/`.
- Respect route-level ownership and embedded-shell rules.
- Use token-first styling from `next-app/styles/tokens.css`.
- Reuse existing actions, services, hooks, controllers, and layout ownership before creating new patterns.

## Verification

Run the route-appropriate commands required by repo governance.

For meaningful frontend work from `next-app/`:

- `npm run lint`
- `npm run lint:styles` if CSS changed
- `npx tsc --noEmit`
- `npx vitest run`

Use any additional route-specific checks required by `AGENTS.md` and the frontend specialist.

## Handoff

Report:
- visual thesis
- structure thesis
- interaction thesis
- behavior changed
- tests updated
- commands run
- mobile/accessibility review status
- remaining risks or approval-gated items

## Safety and escalation

- If the change requires Prisma schema/migration work, split into a separate DB-scoped task and follow `docs/runbooks/db-ops.md`.
- If product behavior expectations conflict with repo-owned frontend doctrine or `AGENTS.md`, follow repo doctrine and explicitly call out the conflict.
