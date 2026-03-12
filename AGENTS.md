# LitRev 2026 - Agent Constitution (v2)

This file is Tier 1 hot memory for all agent sessions.
It is the always-loaded operating contract for this repository.

## Tiered Context Model (Required)

Use three tiers. Do not collapse everything into this file.

1. Tier 1 (hot memory): this `AGENTS.md`.
2. Tier 2 (specialists): `docs/agents/specialists/*.md`.
3. Tier 3 (cold memory): runbooks, plans, and subsystem docs referenced via `docs/agents/cold-memory-index.md`.

If work is domain-specific, route to Tier 2 and retrieve Tier 3 before editing code.
Tier 1 owns routing and repo-wide rules, Tier 2 specialists refine matched-domain workflow, and Tier 3 docs provide the canonical subsystem context.

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
| Lint | `npm run lint` | `next-app/` |
| Build | `npm run build` | `next-app/` |
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
| Prisma schema/migrations, DB runtime errors (`column does not exist`, `Invalid prisma.* invocation`) | `db-ops-specialist.md` | `docs/runbooks/db-architecture.md` for schema/domain semantics; `docs/runbooks/db-ops.md` for diagnosis/remediation; `docs/plans/db-production-runbook.md` when production migration/remediation posture is involved | `bash scripts/db-ops.sh diagnose`, `npx prisma validate`, `npx prisma migrate status` |
| Production deploy request / Vercel production release | `release-deploy-specialist.md` | `docs/runbooks/db-ops.md`, `docs/plans/db-production-runbook.md` | `bash scripts/release-gate-prod.sh`, `npx prisma validate`, `npx prisma migrate status`, `npx tsc --noEmit`, `npx vitest run` |
| UI changes under `next-app/app/project/[id]/...`, `next-app/components/...`, `next-app/styles/...` | `frontend-ui-specialist.md` | `docs/plans/plan-ux-ui.md` (or active UI plan), relevant route files | `npx tsc --noEmit`, `npx vitest run` |
| Platform admin control-plane changes (`next-app/app/admin/**`, `next-app/app/api/admin/**`, `next-app/lib/server/admin/**`, `next-app/lib/server/auth/platform-admin.ts`) | `frontend-ui-specialist.md` | `docs/runbooks/admin-access.md`, `docs/plans/plan-backend.md` | `npx tsc --noEmit`, `npx vitest run` |
| Agent runtime/orchestration files (`next-app/lib/agent/**`, `next-app/lib/server/agent/**`, `next-app/app/actions/agent.ts`, `next-app/lib/server/ai/sub-agent.ts`) | `agent-runtime-specialist.md` | `docs/plans/plan-agentic.md`; read `docs/plans/plan-memory.md` if memory is touched; use `docs/plans/README.md` to identify any additional active runtime plans. Do not use superseded source plans marked inactive in `docs/plans/README.md`. | `npx tsc --noEmit`, `npx vitest run` |
| Plan/PRD/governance edits (`PRD.md`, `docs/plans/**`) | `planning-governance-specialist.md` | `docs/plans/README.md` and target plan file | If code is unchanged, no code gate required |
| GitHub workflow/governance edits (`.github/workflows/**`, `.github/CODEOWNERS`, git policy in `AGENTS.md`) | `planning-governance-specialist.md` | `docs/runbooks/github-flow.md` | If code is unchanged, no code gate required |

If no row matches, consult `docs/agents/cold-memory-index.md`, then pick the nearest specialist and proceed conservatively.

## Git Workflow (Agent Auto-Commit/Push Policy)

Rule: feature branches hold work; repo root `main` only mirrors merged work.

- Repo root `main` is the only canonical baseline; task worktrees may use other branches temporarily, but they must never be treated as the baseline or replace repo root `main`.
- Repo root is the canonical clean `main` checkout for this repository.
- Repo root `main` must match `origin/main` exactly during normal workflow.
- Do not commit directly to repo root `main` except for an explicit emergency hotfix requested by the user.
- Do not use repo root as a task checkout, PR checkout, or scratch branch checkout.
- Do not run `gh pr checkout <number>` in repo root; inspect or update PR branches from a dedicated task worktree instead.
- Use repo root `main` for read-only work; enter a task worktree only for branch-specific execution such as edits, commits, pushes, rebases, or PR branch updates.
- All normal agent work must happen on named feature branches.
- Canonical agent branch prefix is `YY/`.
- Emergency hotfix branches should also use the `YY/` prefix, for example `YY/hotfix-<task>`.
- Avoid long-lived detached worktrees.
- Repo root `main` must not remain ahead of or behind `origin/main`.
- If repo root `main` differs from `origin/main` in either direction, stop and reconcile before starting new work.
- Detached or rescue worktrees must not be treated as the `main` baseline.
- Task worktrees are temporary by default.
- A task worktree should exist only while that task is actively being implemented, reviewed, or waiting to merge.
- Before resuming an existing task worktree, `git fetch origin --prune` and confirm it is still the intended execution surface against current `origin/main`.
- Once a task is merged, abandoned, or intentionally archived, remove its worktree immediately as part of the same cleanup flow.
- Maintain a cleanup manifest before deleting or re-homing any worktree; follow the schema in `docs/runbooks/github-flow.md`.
- Do not remove a parent worktree directory while it still contains active nested child worktrees.
- After merge, sync repo root `main`, remove the merged task worktree, and delete the merged local branch in the same cleanup sequence.
- Do not keep finished task worktrees around as passive history.
- After rescue review, either promote the rescue work, archive it intentionally, or delete the worktree.
- For code changes, validate with `npx tsc --noEmit` and `npx vitest run` before commit. If validation fails, fix first.
- Stage only relevant files for the task.
- One task = one atomic commit unless the task clearly requires a small series of coherent commits.
- Commit immediately after validation; do not batch completed tasks.
- Use conventional commit types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
- Do not infer GitHub auth state from `GH_TOKEN` or other shell env vars; this environment may authenticate `gh` via the GitHub CLI keyring.
- Before declaring GitHub access unavailable, verify `gh auth status`, `gh auth token`, and `gh api user`.
- Never run bare interactive `gh pr create` in agent flows; always pass explicit `--base`, `--head`, `--title`, and `--body` flags.
- If `gh pr create` appears to hang, suspect an interactive prompt or editor wait before blaming the GitHub API.
- Before merge decisions, pull latest review feedback with `gh pr view <number> --json reviews,comments`.
- After validation passes, push by default and open/update a PR targeting `main`.
- For the exact branch-start, push/PR, merge-sync, and worktree-cleanup procedure, follow `docs/runbooks/github-flow.md`.

## Database Contract (Non-Negotiable)

- `docs/runbooks/db-architecture.md` is the structural DB reference; `docs/runbooks/db-ops.md` is the operational triage/remediation guide.
- For DB incidents, start with `bash scripts/db-ops.sh diagnose` from `next-app/`.
- If a PR changes `prisma/schema.prisma`, include a migration in `next-app/prisma/migrations/`.
- If schema/domain semantics change, update `docs/runbooks/db-architecture.md` in the same task.
- Never deploy production code that references new columns before migrations are applied.
- Production builds run `next-app/scripts/migrate-if-prod.sh`, which runs the migration safety path before building app code.
- `DIRECT_URL` is mandatory for migration traffic in production.
- `DATABASE_URL` is runtime only.
- Never use `prisma db push` for production remediation.
- Local development may use localhost Postgres; deployed environments use Supabase Postgres.
- Production migrations must target Supabase Postgres via production `DIRECT_URL` (non-localhost).
- Primary deployed database is Supabase Postgres (accessed via Prisma).
- Supabase Auth is not used; Better Auth is the sole identity authority in this project.
- Supabase Storage is used for file upload/download.
- Required file storage env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- A Git push does not migrate any database; migration occurs only when migration commands/deploy pipeline run against production environment variables.
- Prisma tests are mocked by default; real DB tests require `RUN_DB_TESTS=1`.
- Scoping feature flags:
  - `NEXT_PUBLIC_ENABLE_SCOPING_MODE`
  - `ENABLE_SCOPING_MODE`
  - Default when unset is enabled; set both to `0` to disable.
- Before `vercel --prod`, run from `next-app/`:
  - `bash scripts/release-gate-prod.sh`
  - `npx prisma validate`
  - `npx prisma migrate status`
  - `npx tsc --noEmit`
  - `npx vitest run`
- For DB-only remediation, use the migration-safe path documented in `docs/runbooks/db-ops.md` and `scripts/migrate-deploy-safe.sh`.
- If production errors include `column does not exist` or `Invalid prisma.* invocation`, treat as schema drift first.
- For migration failure recovery, duplicate-sequence repair, and production DB remediation, follow `docs/runbooks/db-ops.md` and `docs/plans/db-production-runbook.md`.

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

Use `docs/plans/README.md` to identify active canonical plans, ignore inactive/superseded plan docs, and follow the full plan-maintenance and PRD-vs-domain policy.
- `docs/plans/plan-memory.md` is the only active memory tracker.
- When writing an implementation plan, use `docs/agents/universal-planning-meta-prompt.md`.

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
