# LitRev DB Operations — Agent Triage Guide

All commands run from `next-app/`.

## Quick Reference

| Command | What it does |
|---------|-------------|
| `bash scripts/db-ops.sh diagnose` | Connection test, SSL check, migration state, critical index audit |
| `bash scripts/db-ops.sh migrate` | Safe migration deploy with automatic RunEvent duplicate repair |
| `bash scripts/db-ops.sh repair` | Fix duplicate `(runId, sequence)` tuples in RunEvent table |
| `bash scripts/db-ops.sh gate` | Full pre-deploy validation (diagnose + migrate + index verification) |
| `bash scripts/db-ops.sh status` | `prisma migrate status` |
| `bash scripts/db-ops.sh validate` | `prisma validate` (schema syntax check) |

npm aliases: `npm run db:ops -- <subcommand>`, `npm run db:doctor`, `npm run db:release-gate`.

## Symptom-to-Action Table

| Error / Symptom | First action | If that fails |
|-----------------|-------------|---------------|
| `column does not exist` | `db-ops.sh status` — treat as schema drift, not app bug | `db-ops.sh gate` to apply pending migrations |
| `Invalid prisma.* invocation` | `db-ops.sh status` — check for unapplied migrations | `db-ops.sh diagnose` to verify connectivity |
| `RunEvent_runId_sequence_key` | `db-ops.sh repair` then `db-ops.sh migrate` | Manual: see "RunEvent Recovery" below |
| Migration marked "failed" | `db-ops.sh diagnose` to inspect `_prisma_migrations` | See "Failed Migration Recovery" below |
| Connection refused / timeout | `db-ops.sh diagnose` — checks both pooled and direct URLs | Check Supabase status, DNS, firewall |
| Pooler works but direct fails | Inspect TLS/SSL settings in connection URL | Verify `sslmode=require` on DIRECT_URL |
| Direct works but pooler fails | PgBouncer config or connection limit issue | Check Supabase dashboard for connection saturation |
| Slow queries after migration | Run `ANALYZE` on affected tables (see runbook section 6) | Check if indexes exist: `db-ops.sh gate` |
| Vector search returning empty | Verify pgvector extension and HNSW index exist | See "HNSW Index Remediation" in full runbook |

## Decision Trees

### Pre-Deploy (before `vercel --prod`)

```
1. Run: bash scripts/db-ops.sh gate
2. If it passes → safe to deploy
3. If it fails:
   ├── Missing indexes → check migration state, apply if pending
   ├── Migration failure → see "Migration Failure" tree below
   └── Connection failure → see "Connection Issues" in symptom table
```

### Migration Failure

```
1. Read the error output carefully
2. If "RunEvent_runId_sequence_key":
   ├── db-ops.sh repair
   ├── npx prisma migrate resolve --rolled-back 20260228180000_add_agent_run_lineage
   └── db-ops.sh migrate
3. If "already applied" or "checksum mismatch":
   ├── Do NOT edit applied migration files
   ├── Run db-ops.sh diagnose to inspect _prisma_migrations table
   └── Consider prisma migrate resolve --applied <migration_name>
4. If constraint violation:
   ├── Identify the constraint from the error message
   ├── Fix the data issue (not the migration)
   └── Retry db-ops.sh migrate
5. If unknown error:
   ├── Do NOT use prisma db push in production
   ├── Consult docs/plans/db-production-runbook.md
   └── Consider rollback posture (app rollback first, forward-fix DB)
```

### Schema Drift Detection

```
1. Run: db-ops.sh status
2. If "up to date" but columns are missing:
   ├── Migration was marked applied but SQL didn't fully execute
   ├── Run SQL verification checks from the full runbook (section 2)
   └── Apply targeted SQL repair and document in release notes
3. If pending migrations exist:
   └── Run: db-ops.sh gate
```

## Critical Indexes (8 total)

These must exist in production. The gate script verifies all of them.

```
AIMessage_conversationId_createdAt_id_idx
UserMemory_userId_pinned_idx
ProjectMemory_projectId_pinned_idx
StudyMemory_projectId_pinned_idx
MemoryEmbedding_embedding_hnsw_idx
AgentRun_parentRunId_startedAt_idx
AgentRun_rootRunId_startedAt_idx
AgentRun_conversationId_startedAt_idx
```

## Hardcoded References

The following values are hardcoded in scripts and may need updating for future migrations:

| Value | Location | Context |
|-------|----------|---------|
| `20260228180000_add_agent_run_lineage` | `migrate-deploy-safe.sh` line 27 | Migration ID for `prisma migrate resolve --rolled-back` fallback |

If a future RunEvent migration introduces the same duplicate-sequence issue, the hardcoded migration ID in `migrate-deploy-safe.sh` must be updated.

## Environment Requirements

- Local environment: localhost Postgres for development and tests only.
- Production environment: Supabase Postgres (source of truth for deployed app).
- `DATABASE_URL` — pooled runtime connection (pgbouncer).
- `DIRECT_URL` — direct migration connection; required for migrate commands.
- For production migration work, both URLs must point to non-localhost Supabase hosts.
- Always verify target before migrations (do not run rollout migrations against local DB).

### Preflight Target Verification

```bash
echo "$DIRECT_URL" | sed 's/:\/\/.*@/:\/\/***@/'
echo "$DIRECT_URL" | grep -E "localhost|127\\.0\\.0\\.1" && echo "ERROR_local_target" || echo "OK_non_local_target"
npx prisma migrate status
```

Expected before production migration commands:
- `OK_non_local_target`
- `npx prisma migrate status` runs against production Supabase connection

### Migration Target Preflight (Required)

Run this before any production migration command:

```bash
echo "$DIRECT_URL"
npx prisma migrate status
```

Expected:
- `DIRECT_URL` resolves to Supabase Postgres (not `localhost` / `127.0.0.1`)
- `prisma migrate status` points at the intended deployment target

## Rules

1. Never use `prisma db push` in production.
2. Never edit applied migration files.
3. Treat `column does not exist` as schema drift first, not an app bug.
4. Always run the gate before `vercel --prod`.
5. Prefer forward-fix migrations over rollback for DB issues.
6. Roll back the app first if errors spike post-deploy; fix DB separately.

## Deep Procedures

For HNSW index remediation, smoke tests, monitoring checklists, and detailed SQL verification queries, see:

**`docs/plans/db-production-runbook.md`**
