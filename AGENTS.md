# LitRev 2026 — Agent Guidelines

## Critical: Directory Structure

The Next.js app lives in `next-app/`, NOT the repo root. All dev commands must run from `next-app/`.

The `@/` path alias resolves to `next-app/` (e.g., `@/lib/server/...` → `next-app/lib/server/...`).

## Stack

Next.js 16, React 19, TypeScript, Prisma 7.3 (PostgreSQL), Vitest, Vercel

## Commands

All run from `next-app/` except deploy:

| Task       | Command                  | Run from         |
|------------|--------------------------|------------------|
| Typecheck  | `npx tsc --noEmit`      | `next-app/`      |
| Build      | `npx next build`        | `next-app/`      |
| Test       | `npx vitest run`        | `next-app/`      |
| Deploy     | `vercel --prod`         | repo root        |

## Database

- **Env files live in `next-app/`** — `next-app/.env` and `next-app/.env.local`. See `next-app/.env.local.example` for the template.
- Two database URLs are required:
  - `DATABASE_URL` — pooled connection (pgbouncer), used by the app at runtime
  - `DIRECT_URL` — direct connection, used by `prisma migrate` (see `prisma.config.ts`)
- Prisma uses a **pg Pool adapter** (`lib/server/prisma.ts`), not Prisma's default connector. Connection timeout is 30s.
- All credentials (DATABASE_URL, DIRECT_URL, Supabase keys, OpenAI key) are in `secrets.local.md` at the repo root. If env values are missing or wrong, copy from there into `next-app/.env.local`. Do NOT invent or guess credentials.
- **Supabase is used for file storage only** (PDF uploads/downloads), not as the database. Requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in env. See `lib/server/files.ts` and `lib/server/pdf-extraction.ts`.
- For tests, Prisma is mocked (see `vitest.setup.ts`). Real DB tests are gated behind `RUN_DB_TESTS=1`.
- Scoping mode feature flags:
  - `NEXT_PUBLIC_ENABLE_SCOPING_MODE` (client routing/mode picker)
  - `ENABLE_SCOPING_MODE` (server normalization fallback)
  - Current default when unset is enabled; set both to `0` to disable.

### DB Deploy Contract (Non-Negotiable)

- For DB incidents (migration errors, Prisma schema drift, runtime `column does not exist`), agents must consult `docs/runbooks/db-ops.md` and use `bash scripts/db-ops.sh <command>` before attempting ad-hoc fixes.
- If a PR changes `prisma/schema.prisma`, it MUST include a migration folder under `next-app/prisma/migrations/`.
- Never deploy production app code that references new Prisma columns before migrations are applied.
- Production builds run `next-app/scripts/migrate-if-prod.sh`, which:
  - runs `bash scripts/migrate-deploy-safe.sh` in production (pre-repair + deploy + one-shot recovery)
  - fails the build if migration state is still pending
- `DIRECT_URL` is mandatory in production (migration path). `DATABASE_URL` is runtime only.
- Before `vercel --prod`, agents must run from `next-app/`:
  - `bash scripts/release-gate-prod.sh` (preferred single-command production DB gate)
  - `bash scripts/migrate-deploy-safe.sh` if doing DB-only remediation outside full release gate
  - `npx prisma validate`
  - `npx prisma migrate status`
  - `npx tsc --noEmit`
  - `npx vitest run`
- If production errors include `column does not exist` or `Invalid prisma.* invocation`, treat it as schema drift first and verify migrations before debugging app code.
- If `prisma migrate deploy` fails with `RunEvent_runId_sequence_key` duplicate errors, do NOT edit applied migrations. Run:
  - `node scripts/repair-run-event-sequences.mjs`
  - `npx prisma migrate resolve --rolled-back 20260228180000_add_agent_run_lineage`
  - `npx prisma migrate deploy`

## Code Layout

- `app/actions/` — Server actions (backend entry points called from client)
- `lib/server/` — Service layer, AI providers, Prisma queries
- `lib/` (non-server) — Shared pure logic (criteria matching, config)
- `components/` — Reusable client components
- `app/project/[id]/` — Route-level pages and co-located components

## UI Delivery Contract (Strict)

- **Shell embedding is mandatory:** Pages under `app/project/[id]/...` must respect `isEmbeddedInProjectShell`. Embedded pages render content-only (no nested `AppShell`, no duplicate copilot shell).
- **No visible no-op controls:** Any visible button or action must have working behavior. If behavior is unavailable, hide it or disable with explicit text.
- **Suggestion buttons must work:** Any rendered suggestion chip/button must either send immediately or prefill via `prefill` + `onPrefillConsumed`.
- **Use shared primitives first:** Prefer shared UI primitives in `components/ui/` (for selectors/menus/popovers) before building one-off interaction logic in feature components.
- **Token-first styling:** Use `styles/tokens.css` variables for colors/radius/surfaces. Avoid hardcoded palette values unless intentionally local and reviewed.
- **A11y baseline is required:** icon-only buttons need `aria-label`; maintain keyboard navigation; never suppress focus styles without an accessible replacement.
- **Responsive behavior is part of done:** Validate both desktop and mobile after UI changes.
- **UI test gate for meaningful UI changes:** run `npx tsc --noEmit` and `npx vitest run` from `next-app/`, and add/adjust tests for changed UI behavior.

## Open-Source Code Adaptation

The agentic architecture references several open-source codebases to steal patterns from (documented in the active plans under `docs/plans/`, especially `plan-agentic.md`). When working with any of them:
- **Never copy-paste verbatim.** Rewrite every snippet to match our stack, naming, and file layout.
- **Strip foreign abstractions.** Extract the idea, not their framework-specific implementation.
- **Respect our design system.** All UI must use our CSS tokens (`tokens.css`), not imported styles.
- **Check licenses.** MIT/Apache 2.0 are fine. Be cautious with AGPL or source-available licenses.
- **Take only what's needed.** Don't port entire modules when we need one pattern.
- **Test after every adaptation.** Must pass `npx tsc --noEmit` and `npx vitest run` before moving on.

## Plan Governance (Strictly Enforced)

We use a decentralized, domain-specific planning system located in `docs/plans/`.
The canonical index mapping domains to their plan files is `docs/plans/README.md`.

**CRITICAL RULE: The "Prune and Migrate" Policy**
When you complete a task in any `plan-*.md` file, you MUST NOT append a log or write a phase diary at the bottom. Instead, you must:
1. Delete the task from the `Active Tasks` section.
2. If the task changed the system's architecture, add a 1-2 sentence factual summary to the `Current Architecture` section.
3. Move the task to the top of the `Recently Completed` section (if it exists).
4. Prune the oldest items from `Recently Completed` to keep it capped at 5-10 items.

**Memory Tracking:**
`docs/plans/plan-memory.md` is the SINGLE source of truth for all memory implementation routing and tasks. No other plan file should contain memory tracking tasks.

**Legacy Plans:**
Legacy planning artifacts are not part of the active planning system. Use only the canonical plans in `docs/plans/`.

**PRD vs. Domain Plans Policy (The "What vs. How" Rule)**
- **Change `PRD.md` ONLY IF:** A decision changes **WHAT** the product does, **WHO** it is for, or **WHY** we are building it (e.g., changes to user-visible behavior, product scope, trust/safety rules, or success metrics).
- **Change Domain Plans (`docs/plans/*.md`) ONLY IF:** A decision changes **HOW** the product is built (e.g., architectural choices, prompt structures, server actions).
- If a PR changes the product contract, it must update `PRD.md`, add an entry to the `PRD.md` decision log, and update the linked plan. If it's implementation-only, update the `plan-*.md` file with NO changes to `PRD.md`.
