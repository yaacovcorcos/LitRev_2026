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

## Code Layout

- `app/actions/` — Server actions (backend entry points called from client)
- `lib/server/` — Service layer, AI providers, Prisma queries
- `lib/` (non-server) — Shared pure logic (criteria matching, config)
- `components/` — Reusable client components
- `app/project/[id]/` — Route-level pages and co-located components

## Open-Source Code Adaptation

The agentic architecture references several open-source codebases to steal patterns from (documented in the archived `planC` and current agentic plans). When working with any of them:
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
Files in `docs/old_plans/` (like `planB`, `planC`) are ARCHIVED. Do not read them for active tasks or write to them under any circumstances.

**PRD vs. Domain Plans Policy (The "What vs. How" Rule)**
- **Change `PRD.md` ONLY IF:** A decision changes **WHAT** the product does, **WHO** it is for, or **WHY** we are building it (e.g., changes to user-visible behavior, product scope, trust/safety rules, or success metrics).
- **Change Domain Plans (`docs/plans/*.md`) ONLY IF:** A decision changes **HOW** the product is built (e.g., architectural choices, prompt structures, server actions).
- If a PR changes the product contract, it must update `PRD.md`, add an entry to the `PRD.md` decision log, and update the linked plan. If it's implementation-only, update the `plan-*.md` file with NO changes to `PRD.md`.
