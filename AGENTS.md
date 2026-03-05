# LitRev 2026 - Agent Constitution (v2)

This file is Tier 1 hot memory for all agent sessions.
It is the always-loaded operating contract for this repository.

## Tiered Context Model (Required)

Use three tiers. Do not collapse everything into this file.

1. Tier 1 (hot memory): this `AGENTS.md`.
2. Tier 2 (specialists): `docs/agents/specialists/*.md`.
3. Tier 3 (cold memory): runbooks, plans, and subsystem docs referenced via `docs/agents/cold-memory-index.md`.

If work is domain-specific, route to Tier 2 and retrieve Tier 3 before editing code.

## Critical Directory and Path Rules

- The Next.js app lives in `next-app/`, not repo root.
- Run development commands from `next-app/` unless a command explicitly says otherwise.
- The `@/` alias resolves to `next-app/`.
- Env files live in `next-app/`: `.env`, `.env.local`.
- Required secrets are in `secrets.local.md` at repo root. Never invent credentials.

## Stack

Next.js 16, React 19, TypeScript, Prisma 7.3 (PostgreSQL), Vitest, Vercel

## Code Layout

- `next-app/app/actions/` - Server actions (backend entry points called from client)
- `next-app/lib/server/` - Service layer, AI providers, Prisma queries
- `next-app/lib/` (non-server) - Shared pure logic
- `next-app/components/` - Reusable client components
- `next-app/app/project/[id]/` - Route-level pages and co-located components

## Canonical Commands

All run from `next-app/` except deploy.

| Task | Command | Run from |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | `next-app/` |
| Build | `npx next build` | `next-app/` |
| Test | `npx vitest run` | `next-app/` |
| Deploy | `vercel --prod` | repo root |

## Global Workflow

1. Identify changed paths and map to a routing trigger.
2. Load the required Tier 2 specialist spec.
3. Read required Tier 3 docs before code edits.
4. Implement with smallest scoped changes.
5. Run mandatory checks for that route.
6. Update stale docs in the same task if behavior changed.
7. Commit atomically (one task = one commit, no unrelated files).

## Routing Trigger Table (Mandatory)

| Trigger signal | Required Tier 2 specialist | Required Tier 3 retrieval before editing | Mandatory checks before done |
|---|---|---|---|
| Prisma schema/migrations, DB runtime errors (`column does not exist`, `Invalid prisma.* invocation`) | `db-ops-specialist.md` | `docs/runbooks/db-ops.md`, `docs/plans/db-production-runbook.md` | `bash scripts/db-ops.sh diagnose`, `npx prisma validate`, `npx prisma migrate status` |
| Production deploy request / Vercel production release | `release-deploy-specialist.md` | `docs/runbooks/db-ops.md` | `bash scripts/release-gate-prod.sh`, `npx prisma validate`, `npx prisma migrate status`, `npx tsc --noEmit`, `npx vitest run` |
| UI changes under `next-app/app/project/[id]/...`, `next-app/components/...`, `next-app/styles/...` | `frontend-ui-specialist.md` | `docs/plans/plan-ux-ui.md` (or active UI plan), relevant route files | `npx tsc --noEmit`, `npx vitest run` |
| Platform admin control-plane changes (`next-app/app/admin/**`, `next-app/app/api/admin/**`, `next-app/lib/server/admin/**`, `next-app/lib/server/auth/platform-admin.ts`) | `frontend-ui-specialist.md` | `docs/runbooks/admin-access.md`, `docs/plans/plan-backend.md` | `npx tsc --noEmit`, `npx vitest run` |
| Agent runtime/orchestration files (`next-app/lib/agent/**`, `next-app/lib/server/agent/**`, `next-app/app/actions/agent.ts`, `next-app/lib/server/ai/sub-agent.ts`) | `agent-runtime-specialist.md` | `docs/plans/plan-agentic.md`, `docs/plans/codex-agentic-plan.md`, and `docs/plans/plan-memory.md` if memory touched | `npx tsc --noEmit`, `npx vitest run` |
| Plan/PRD/governance edits (`PRD.md`, `docs/plans/**`) | `planning-governance-specialist.md` | `docs/plans/README.md` and target plan file | If code is unchanged, no code gate required |
| GitHub workflow/governance edits (`.github/workflows/**`, `.github/CODEOWNERS`, git policy in `AGENTS.md`) | `planning-governance-specialist.md` | `docs/runbooks/github-flow.md` | If code is unchanged, no code gate required |

If no row matches, consult `docs/agents/cold-memory-index.md`, then pick the nearest specialist and proceed conservatively.

## Git Workflow (Agent Auto-Commit/Push Policy)

- One task = one atomic commit.
- Branch roles:
  - `main`: default branch and production deployment branch.
- Use feature branches by default (`codex/<task>`). Base from `main`; do not commit directly to `main` unless explicitly requested.
- For code changes, validate with `npx tsc --noEmit` and `npx vitest run`.
- If validation fails, fix first; do not commit failing code.
- Stage only relevant files for the task.
- Commit immediately after validation; do not batch completed tasks.
- After validation passes, push by default and open/update a PR targeting `main`.
- Hotfixes use `hotfix/<task>` branches and PR directly to `main`.
- Before merge decisions, pull latest review feedback with `gh pr view <number> --json reviews,comments`.
- Use conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.

Required local commit flow:

1. `git add <changed-files-for-this-task>`
2. `git diff --cached` and `git status`
3. `git commit -m "<type(scope): concise why-focused message>"`
4. `git push -u origin <branch>`
5. `gh pr create --base main --head <branch> ...` (or update an existing PR)

## Database Contract (Non-Negotiable)

- For DB incidents, use `bash scripts/db-ops.sh <command>` before ad-hoc fixes.
- If a PR changes `prisma/schema.prisma`, include a migration in `next-app/prisma/migrations/`.
- Never deploy production code that references new columns before migrations are applied.
- Production builds run `next-app/scripts/migrate-if-prod.sh` which runs `bash scripts/migrate-deploy-safe.sh`.
- `DIRECT_URL` is mandatory for migration traffic in production.
- `DATABASE_URL` is runtime only.
- For Supabase production migrations, prefer a session-mode pooler host on `:5432` reachable from Vercel build containers.
- Local development may use localhost Postgres; deployed environments use Supabase Postgres.
- Primary deployed database is Supabase Postgres (accessed via Prisma).
- Supabase Auth is not used; Better Auth is the sole identity authority in this project.
- Supabase Storage is used for file upload/download.
- Required file storage env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Local DB (localhost) is for development/testing only; it is never the target for production rollout decisions.
- Production migrations must target Supabase Postgres via production `DIRECT_URL` (non-localhost).
- A Git push does not migrate any database; migration occurs only when migration commands/deploy pipeline run against production environment variables.
- Prisma tests are mocked by default; real DB tests require `RUN_DB_TESTS=1`.
- Scoping feature flags:
  - `NEXT_PUBLIC_ENABLE_SCOPING_MODE`
  - `ENABLE_SCOPING_MODE`
  - Default when unset is enabled; set both to `0` to disable.
- Before `vercel --prod`, run from `next-app/`:
  - `bash scripts/release-gate-prod.sh` (preferred)
  - `bash scripts/migrate-deploy-safe.sh` (DB-only remediation path)
  - `npx prisma validate`
  - `npx prisma migrate status`
  - `npx tsc --noEmit`
  - `npx vitest run`
- If production errors include `column does not exist` or `Invalid prisma.* invocation`, treat as schema drift first.

If `prisma migrate deploy` fails with `RunEvent_runId_sequence_key` duplicates, do not edit applied migrations. Run:

1. `node scripts/repair-run-event-sequences.mjs`
2. `npx prisma migrate resolve --rolled-back 20260228180000_add_agent_run_lineage`
3. `npx prisma migrate deploy`

## UI Delivery Contract (Strict)

- Shell embedding is mandatory for pages under `app/project/[id]/...` using `isEmbeddedInProjectShell`.
- No visible no-op controls.
- Suggestion buttons must send immediately or prefill via `prefill` and `onPrefillConsumed`.
- Prefer shared primitives in `components/ui/`.
- Token-first styling via `styles/tokens.css`; avoid hardcoded palette values unless intentionally local and reviewed.
- Icon-only buttons require `aria-label`.
- Preserve keyboard navigation and visible focus behavior.
- Validate desktop and mobile for UI changes.
- For meaningful UI behavior changes, run `npx tsc --noEmit` and `npx vitest run` and update tests.

## Plan Governance (Strict)

Canonical plan index: `docs/plans/README.md`.

Prune and Migrate Policy when completing plan tasks:

1. Remove item from `Active Tasks`.
2. If architecture changed, add a 1-2 sentence factual update in `Current Architecture`.
3. Move completed item to top of `Recently Completed`.
4. Keep `Recently Completed` capped to 5-10 items.

Memory routing rule:

- `docs/plans/plan-memory.md` is the only active memory tracker.

PRD vs Domain Plans:

- Edit `PRD.md` only when product WHAT/WHO/WHY changes.
- Edit `docs/plans/*.md` when implementation HOW changes.
- For cross-agent implementation planning requests, use the canonical prompt in `docs/agents/universal-planning-meta-prompt.md`.

## Open-Source Adaptation Rules

- Never copy-paste external code verbatim.
- Extract ideas, rewrite to this stack and naming.
- Preserve local design system (`styles/tokens.css`).
- Respect licenses (MIT/Apache preferred; be careful with AGPL or source-available terms).
- Port only what is needed.
- Run `npx tsc --noEmit` and `npx vitest run` after adaptation.

## Staleness and Drift Policy

- Docs are load-bearing. Stale docs are a correctness risk.
- If behavior, schema, workflow, or invariants changed, update the corresponding Tier 2/Tier 3 docs in the same task.
- If you explained the same domain rule twice across sessions, codify it.
- Run `docs/agents/drift-checklist.md` before commit for domain-impacting changes.

## Tier 2 Specialists

- `docs/agents/specialists/db-ops-specialist.md`
- `docs/agents/specialists/release-deploy-specialist.md`
- `docs/agents/specialists/frontend-ui-specialist.md`
- `docs/agents/specialists/agent-runtime-specialist.md`
- `docs/agents/specialists/planning-governance-specialist.md`

## Tier 3 Index

- `docs/agents/cold-memory-index.md`
- `docs/agents/universal-planning-meta-prompt.md`
