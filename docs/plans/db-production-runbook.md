# Production DB Migration Runbook

## Purpose
Safely deploy schema changes to production Postgres (Supabase) with clear verification, drift handling, and rollback posture.
Local localhost databases are development-only; this runbook applies to production Supabase Postgres targets only.

## Scope
- In scope: Prisma migration execution, schema/index verification, DB health checks.
- Out of scope: auth schema work, application code changes, feature redesign.

## Scope Boundary

This file owns production migration/release procedure only.
For schema/table semantics, environment topology, and DB invariants, use `docs/runbooks/db-architecture.md`.

## When To Update This Doc

- Production preflight changes
- Verification SQL changes
- Smoke-test changes
- Rollback posture changes
- Production target wiring changes

## Preconditions
1. Run in a low-traffic release window.
2. Confirm Supabase backup/PITR is available.
3. Freeze new schema-changing merges until completion.
4. Run all commands from `next-app/`.

## 1) Environment Wiring (Critical)
`prisma.config.ts` loads `.env.local`, but already-set shell env vars should take precedence. Verify this explicitly before running migrations.

1. Export production DB URLs in current shell:
```bash
export DATABASE_URL="PROD_POOLER_URL"
export DIRECT_URL="PROD_DIRECT_URL"
```

2. Verify target is production (not localhost):
```bash
node -e "require('dotenv').config({path:'.env.local'}); const u=process.env.DIRECT_URL||''; console.log('DIRECT_URL:', u.slice(0,90)); console.log(u.includes('localhost') ? 'ERROR_localhost' : 'OK_non_local')"
```

3. If output indicates localhost, stop and fix env wiring before proceeding.

## 2) Pre-Migration Diagnostics (Read-only)
0. Optional helper (recommended):
```bash
npm run db:doctor
```

1. Check migration state:
```bash
npx prisma migrate status
```

2. Treat `migrate status` as necessary but not sufficient. Run SQL verification checks:

Critical indexes:
```sql
SELECT indexname
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN (
    'AIMessage_conversationId_createdAt_id_idx',
    'UserMemory_userId_pinned_idx',
    'UserMemory_userId_authority_status_idx',
    'UserMemory_userId_embeddingStatus_idx',
    'ProjectMemory_projectId_pinned_idx',
    'ProjectMemory_projectId_importanceRank_idx',
    'ProjectMemory_projectId_key_idx',
    'ProjectMemory_projectId_authority_status_idx',
    'ProjectMemory_projectId_source_idx',
    'ProjectMemory_projectId_embeddingStatus_idx',
    'StudyMemory_projectId_pinned_idx',
    'StudyMemory_projectId_key_idx',
    'StudyMemory_projectId_authority_status_idx',
    'StudyMemory_projectId_source_idx',
    'StudyMemory_projectId_embeddingStatus_idx',
    'MemoryRetrievalItem_retrievalId_idx',
    'MemoryRetrievalItem_memoryType_memoryId_idx',
    'MemoryRetrievalItem_source_idx',
    'MemoryRetrievalItem_authority_idx',
    'MemoryEmbedding_embedding_hnsw_idx',
    'AgentRun_parentRunId_startedAt_idx',
    'AgentRun_rootRunId_startedAt_idx',
    'AgentRun_conversationId_startedAt_idx',
    'AgentRun_conversationId_lastActivityAt_idx',
    'AgentRun_conversationId_lastDurableProgressAt_idx',
    'ToolIdempotencyRecord_scopeKey_toolName_fingerprint_key',
    'ToolIdempotencyRecord_scopeKey_createdAt_idx',
    'DecisionRequestRecord_sourceRunId_callId_key',
    'DecisionRequestRecord_conversationId_status_createdAt_idx',
    'DecisionResolutionRecord_requestId_key',
    'AIUsageReservation_attemptKey_key',
    'AIUsageReservation_scopeKey_createdAt_idx',
    'AIUsageReservation_scopeKey_status_createdAt_idx',
    'AIUsage_reservationId_key'
  )
ORDER BY indexname;
```

Sentinel cleanup checks:
```sql
SELECT 'AIUsage' AS table_name, COUNT(*)::int AS rows_with_global FROM "AIUsage" WHERE "projectId"='global'
UNION ALL SELECT 'AIConversation', COUNT(*)::int FROM "AIConversation" WHERE "projectId"='global'
UNION ALL SELECT 'AgentRun', COUNT(*)::int FROM "AgentRun" WHERE "projectId"='global'
UNION ALL SELECT 'Artifact', COUNT(*)::int FROM "Artifact" WHERE "projectId"='global'
UNION ALL SELECT 'AutonomyConfig', COUNT(*)::int FROM "AutonomyConfig" WHERE "projectId"='global';
```

Nullability checks:
```sql
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='AgentRun' AND column_name='projectId')
    OR (table_name='Artifact' AND column_name='projectId'))
ORDER BY table_name;
```

Run-lineage schema checks:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='AgentRun'
  AND column_name IN ('parentRunId', 'rootRunId')
ORDER BY column_name;

SELECT conname
FROM pg_constraint
WHERE conname IN (
  'AgentRun_parentRunId_fkey',
  'RunEvent_runId_sequence_key'
)
ORDER BY conname;
```

## 3) Drift / Failure Handling Rules
1. If `migrate status` is "up to date", still trust SQL object checks as source of truth.
2. If failed or partially applied migrations appear, stop deployment and repair migration state first.
3. If migration is marked applied but object is missing, apply targeted SQL repair and document it in release notes.
4. Do not use `prisma db push` in production to resolve drift.

## 4) Apply Migrations
1. Execute:
```bash
npx prisma migrate deploy
npx prisma migrate status
```

Alternative (single gate command):
```bash
npm run db:release-gate
```

2. Re-run SQL checks from section 2.

## 5) HNSW Index Remediation (If Missing)
1. Confirm pgvector extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

2. Check table size first:
```sql
SELECT COUNT(*)::bigint AS memory_embedding_rows FROM "MemoryEmbedding";
```

3. Build strategy:
- Small table: standard create is acceptable.
- Large table: prefer `CONCURRENTLY` to reduce write blocking.

Standard:
```sql
CREATE INDEX IF NOT EXISTS "MemoryEmbedding_embedding_hnsw_idx"
ON "MemoryEmbedding" USING hnsw ("embedding" vector_cosine_ops);
```

Concurrent:
```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "MemoryEmbedding_embedding_hnsw_idx"
ON "MemoryEmbedding" USING hnsw ("embedding" vector_cosine_ops);
```

Note: `CONCURRENTLY` cannot run inside a transaction block.

## 6) Optional Statistics Refresh
Supabase autovacuum/autoanalyze may handle this automatically. Manual `ANALYZE` is a precaution for faster planner convergence immediately post-release.

```sql
ANALYZE "AIMessage";
ANALYZE "AIConversation";
ANALYZE "MemoryEmbedding";
ANALYZE "UserMemory";
ANALYZE "ProjectMemory";
ANALYZE "StudyMemory";
ANALYZE "AgentRun";
ANALYZE "Artifact";
```

## 7) Deploy Order
1. Complete sections 1-6.
2. Confirm migration guard behavior:
   - Production builds fail when pending migrations exist and `RUN_PRISMA_MIGRATE_IN_BUILD` is not set.
3. Deploy app after DB checks pass.

## 8) Smoke Tests (Post-deploy)
1. Start a chat stream and receive full response.
2. Load older messages in conversation timeline.
3. Trigger `open_project` navigation tool flow.
4. Run memory retrieval path.
5. Create a new study (ledger write path).
6. Upload a file (storage write path).

## 9) Monitoring
1. High-attention monitoring for first 60 minutes.
2. Continue monitoring for 24 hours:
- API/server error rate.
- P95/P99 latency.
- DB CPU, connection utilization, lock waits, long-running queries.

## 10) Go / No-Go Criteria
Go only if:
1. Migrations apply cleanly.
2. `migrate status` is healthy.
3. SQL verification checks pass.
4. Smoke tests pass.

No-Go if any of the above fails.

## 11) Rollback Posture
1. If app errors spike, roll back app first.
2. Prefer forward-fix migration for DB issues.
3. Use PITR restore only for severe integrity incidents.
