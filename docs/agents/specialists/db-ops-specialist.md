# Specialist: DB Ops

## Purpose

Use for Prisma schema changes, migrations, production DB incidents, and runtime schema drift symptoms.

## Invoke When

- Editing `next-app/prisma/schema.prisma`
- Adding or changing `next-app/prisma/migrations/**`
- Editing `next-app/scripts/db-ops.sh`, `migrate-deploy-safe.sh`, `migrate-if-prod.sh`, `release-gate-prod.sh`
- Investigating `column does not exist`, `Invalid prisma.* invocation`, or migration failures

## Required Tier 3 Reads

- `docs/runbooks/db-architecture.md` when schema/domain semantics are touched
- `docs/runbooks/db-ops.md`
- `docs/plans/db-production-runbook.md` when production migration/remediation posture is involved

## Guardrails

- Run all commands from `next-app/`.
- Structural DB changes are incomplete until `docs/runbooks/db-architecture.md` is updated.
- Never use `prisma db push` for production remediation.
- Never edit applied migration SQL.
- Treat schema errors as migration state drift first.

## Mandatory Workflow

1. Diagnose state first: `bash scripts/db-ops.sh diagnose`.
2. Check migration and schema status:
   - `npx prisma validate`
   - `npx prisma migrate status`
3. For deploy readiness: `bash scripts/release-gate-prod.sh`.
4. If RunEvent duplicate key issue appears, use the documented repair sequence.
5. If schema changed, ensure a migration folder is included.

## Failure Modes to Watch

- App code references new columns before migration is applied.
- `DIRECT_URL` missing or unreachable from build container.
- Migration marked applied while SQL effects are partially missing.
- Silent failures from stale DB runbook assumptions.

## Handoff Checklist

- Exact commands run and outcomes.
- Current migration state.
- Any remediation performed.
- Whether docs were updated for changed behavior.
