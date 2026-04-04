# LitRev_2026

LitRev is an AI-assisted research workspace for evidence reviews. It combines protocol design, study intake, screening, drafting, and verification in one product, with a strong emphasis on traceability, controllable automation, and source-backed writing.

This repository is private and collaborator-managed. The main Next.js app lives in [`next-app/`](./next-app).

## Start Here

- Product intent: [`PRD.md`](./PRD.md)
- Repo rules and agent workflow: [`AGENTS.md`](./AGENTS.md)
- Active plans and canonical owners: [`docs/plans/README.md`](./docs/plans/README.md)
- Security baseline: [`SECURITY.md`](./SECURITY.md)

## Common Commands

Run these from `next-app/` unless stated otherwise.

| Task | Command |
|---|---|
| Install deps | `npm install` |
| Start local app | `npm run dev` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Style lint | `npm run lint:styles` |
| Test | `npx vitest run` |
| Build | `npm run build` |
| DB diagnostics | `bash scripts/db-ops.sh diagnose` |
| Production deploy | `vercel --prod` from repo root |

## Repo Shape

- `next-app/app/` — routes, pages, server actions
- `next-app/components/` — reusable UI
- `next-app/lib/` — shared logic
- `next-app/lib/server/` — server services, Prisma access, AI providers
- `next-app/prisma/` — schema and migrations
- `docs/` — plans, runbooks, architecture docs, reports
- `.factory/skills/` — repo-local draft skills and helper instructions

## Working Here

- Keep repo-root `main` clean and synced to `origin/main`.
- Do branch work in dedicated `YY/*` worktrees, not in repo root.
- Prefer durable, high-quality fixes over quick patches. Do the hard work when needed; do not leave behind low-trust band-aids.
- The app uses PostgreSQL via Prisma. Local development uses localhost Postgres; deployed environments use Supabase Postgres.
- Secrets are local-only. Do not invent them or commit them.

## If You Are Touching...

- DB or Prisma work: start with [`docs/runbooks/db-architecture.md`](./docs/runbooks/db-architecture.md) and [`docs/runbooks/db-ops.md`](./docs/runbooks/db-ops.md)
- UI work: start with [`docs/architecture/frontend-quality-bar.md`](./docs/architecture/frontend-quality-bar.md)
- Runtime / agent work: start with [`docs/plans/plan-agentic.md`](./docs/plans/plan-agentic.md)
- Git / PR / worktree flow: start with [`docs/runbooks/github-flow.md`](./docs/runbooks/github-flow.md)

## Notes

- This repo is optimized for disciplined iteration, not casual drive-by edits.
- If a doc and the code disagree, treat that as drift and fix it in the same task.
