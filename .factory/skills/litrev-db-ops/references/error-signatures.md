# Error Signatures

Use this mapping to avoid trial-and-error. Match symptoms exactly before applying actions.

## Quick Reference

| Error Pattern | Likely Cause | First Action |
|---------------|--------------|--------------|
| `column does not exist` | Schema drift | `npm run db:migrate:safe` |
| `P2022` | Missing column | `npm run db:migrate:safe` |
| `P3018` + unique index | Data quality blocker | `npm run db:repair-run-events` |
| `getaddrinfo ENOTFOUND` | DNS/connectivity | Check env source |
| `Invalid prisma.* invocation` | Schema drift | `npx prisma migrate status` |

## Schema Drift / Pending Migration

- Symptoms:
  - `Invalid prisma.* invocation`
  - `The column '(not available)' does not exist`
  - `column ... does not exist`
  - `P2022`
- Actions:
  1. `npx prisma migrate status`
  2. `npm run db:migrate:safe`
  3. Re-check `npx prisma migrate status`

## Migration Blocked by Data Quality

- Symptoms:
  - `P3018`
  - `could not create unique index "RunEvent_runId_sequence_key"`
  - `Key ("runId", sequence)=... is duplicated`
- Actions:
  1. Confirm PITR and record rollback anchor timestamp.
  2. `npm run db:repair-run-events`
  3. `npx prisma migrate resolve --rolled-back 20260228180000_add_agent_run_lineage`
  4. `npm run db:migrate:safe`

## DB Connectivity / DNS / TLS

- Symptoms:
  - `getaddrinfo ENOTFOUND`
  - TLS/connector errors in `db:doctor`
- Actions:
  1. Verify env source (`.env.local` for local, `vercel env pull` for production)
  2. Re-run `npm run db:doctor`
  3. Confirm both pooled (`DATABASE_URL`) and direct (`DIRECT_URL`) connectivity

## Rollback State Guidance

- Use rollback state only for failed migrations.
- Prefer roll-forward migration fixes over destructive rollback.
- Never use `prisma migrate reset` in production.

## Post-Fix Verification

Always validate:

1. `npx prisma migrate status` -> up to date
2. `npm run db:release-gate` -> pass
3. [verification-checks.md](verification-checks.md) -> pass
4. Reproduce original failing user flow
