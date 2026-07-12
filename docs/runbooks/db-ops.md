# LitRev DB Operations — Agent Triage Guide

All commands run from `next-app/`.

## Scope Boundary

This file owns operational diagnosis, connectivity, migration state checks, drift handling, and repair flows.
For schema/table semantics, environment topology, and DB invariants, use `docs/runbooks/db-architecture.md`.

## When To Update This Doc

- Command changes in DB scripts or npm aliases
- New failure modes or remediation rules
- Critical index gate changes
- Migration/repair flow changes
- Connection-policy changes

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
| Local ledger PDF import fails after pulling new code | `npx prisma migrate status` — local ledger import now touches processing-aware schema reads after study/file creation | `npx prisma migrate dev` to bring local DB schema current, then retry the exact import flow |
| `RunEvent_runId_sequence_key` | `db-ops.sh repair` then `db-ops.sh migrate` | Manual: see "RunEvent Recovery" below |
| Migration marked "failed" | `db-ops.sh diagnose` to inspect `_prisma_migrations` | See "Failed Migration Recovery" below |
| `ACTIVE_RUN_EXISTS` after a disconnect | `db-ops.sh diagnose` — confirm `AgentRun.lastActivityAt` migration/index and DB health first | If DB health is clean, inspect app-layer recovery handling rather than cancelling runs manually |
| Ledger study stays forever `Queued` / `Extracting` | `db-ops.sh diagnose` — confirm migrations are current and the app can reach DB normally first | Then inspect `StudyProcessingJob` rows for expired leases or repeated `failed` states before blaming the UI |
| Connection refused / timeout | `db-ops.sh diagnose` — checks both pooled and direct URLs | Check Supabase status, DNS, firewall. Main chat can now degrade optional context for some DB timeouts, but DB health still needs explicit diagnosis. |
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

## Critical Indexes (35 total)

These must exist in production. The gate script verifies all of them.

```
AIMessage_conversationId_createdAt_id_idx
UserMemory_userId_pinned_idx
UserMemory_userId_authority_status_idx
UserMemory_userId_embeddingStatus_idx
ProjectMemory_projectId_pinned_idx
ProjectMemory_projectId_importanceRank_idx
ProjectMemory_projectId_key_idx
ProjectMemory_projectId_authority_status_idx
ProjectMemory_projectId_source_idx
ProjectMemory_projectId_embeddingStatus_idx
StudyMemory_projectId_pinned_idx
StudyMemory_projectId_key_idx
StudyMemory_projectId_authority_status_idx
StudyMemory_projectId_source_idx
StudyMemory_projectId_embeddingStatus_idx
MemoryRetrievalItem_retrievalId_idx
MemoryRetrievalItem_memoryType_memoryId_idx
MemoryRetrievalItem_source_idx
MemoryRetrievalItem_authority_idx
MemoryEmbedding_embedding_hnsw_idx
AgentRun_parentRunId_startedAt_idx
AgentRun_rootRunId_startedAt_idx
AgentRun_conversationId_startedAt_idx
AgentRun_conversationId_lastActivityAt_idx
AgentRun_conversationId_lastDurableProgressAt_idx
AgentRun_memoryExtractionStatus_leaseExpiry_idx
ToolIdempotencyRecord_scopeKey_toolName_fingerprint_key
ToolIdempotencyRecord_scopeKey_createdAt_idx
DecisionRequestRecord_sourceRunId_callId_key
DecisionRequestRecord_conversationId_status_createdAt_idx
DecisionResolutionRecord_requestId_key
AIUsageReservation_attemptKey_key
AIUsageReservation_scopeKey_createdAt_idx
AIUsageReservation_scopeKey_status_createdAt_idx
AIUsage_reservationId_key
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
7. Do not treat app-layer degraded-context behavior as a substitute for DB remediation; it reduces blast radius for optional context only.
8. For ledger PDF processing incidents, inspect and repair `StudyProcessingJob` rows rather than reintroducing request-local locking or mutating `Study.status` to fake transient progress.
9. For local ledger PDF import failures after pulling recent code, treat unapplied local migrations as the first suspect before debugging storage or upload UI; `StudyProcessingJob` is the currently observed ledger trigger, but the general problem is local schema drift.

## Deep Procedures

For HNSW index remediation, smoke tests, monitoring checklists, and detailed SQL verification queries, see:

**`docs/plans/db-production-runbook.md`**
