# Specialist: Release Deploy

## Purpose

Use for production deploys, pre-deploy gating, and Vercel release safety checks.

## Invoke When

- User asks to deploy/redeploy production
- Editing release/deploy scripts under `next-app/scripts/`
- Investigating post-deploy DB/runtime regressions

## Required Tier 3 Reads

- `docs/runbooks/db-ops.md`
- `docs/plans/db-production-runbook.md`

## Guardrails

- Run release checks from `next-app/`.
- Do not deploy app code that references unapplied Prisma columns.
- `DIRECT_URL` must be configured and reachable for migration path.
- Never bypass migration safety scripts.

## Mandatory Workflow

1. `bash scripts/release-gate-prod.sh`
2. `npx prisma validate`
3. `npx prisma migrate status`
4. `npm run typecheck`
5. `npm run test:vitest`
6. Deploy from repo root only after gates pass: `vercel --prod`

## Failure Modes to Watch

- Passing app checks while migration state is still pending.
- Production drift mistaken for application logic bugs.
- Partial migration recovery not documented in runbooks.

## Handoff Checklist

- Gate command results.
- Migration state at deploy time.
- Deploy command and resulting environment URL(s).
