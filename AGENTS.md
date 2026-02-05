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

## Code Layout

- `app/actions/` — Server actions (backend entry points called from client)
- `lib/server/` — Service layer, AI providers, Prisma queries
- `lib/` (non-server) — Shared pure logic (criteria matching, config)
- `components/` — Reusable client components
- `app/project/[id]/` — Route-level pages and co-located components

## Other

- When completing or changing any task in planB, update `planB` immediately so the plan stays current.
