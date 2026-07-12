#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== LitRev Production Release Gate =="
echo "cwd: $ROOT_DIR"

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  if [ -f ".env.local" ]; then
    set -a
    # shellcheck source=/dev/null
    source .env.local
    set +a
  fi
fi

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DATABASE_URL and DIRECT_URL must be set."
  exit 1
fi

if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DIRECT_URL" == *"localhost"* ]]; then
  echo "ERROR: Refusing production gate because DB URL points to localhost."
  exit 1
fi

echo
echo "1) Preflight diagnostics"
bash scripts/db-doctor.sh

echo
echo "2) Apply migrations"
bash scripts/migrate-deploy-safe.sh

echo
echo "3) Verify migration state"
npx prisma migrate status

echo
echo "4) Critical index verification"
node <<'NODE'
const { Client } = require("pg");

const requiredIndexes = new Set([
  "AIMessage_conversationId_createdAt_id_idx",
  "UserMemory_userId_pinned_idx",
  "UserMemory_userId_authority_status_idx",
  "UserMemory_userId_embeddingStatus_idx",
  "ProjectMemory_projectId_pinned_idx",
  "ProjectMemory_projectId_importanceRank_idx",
  "ProjectMemory_projectId_key_idx",
  "ProjectMemory_projectId_authority_status_idx",
  "ProjectMemory_projectId_source_idx",
  "ProjectMemory_projectId_embeddingStatus_idx",
  "StudyMemory_projectId_pinned_idx",
  "StudyMemory_projectId_key_idx",
  "StudyMemory_projectId_authority_status_idx",
  "StudyMemory_projectId_source_idx",
  "StudyMemory_projectId_embeddingStatus_idx",
  "MemoryRetrievalItem_retrievalId_idx",
  "MemoryRetrievalItem_memoryType_memoryId_idx",
  "MemoryRetrievalItem_source_idx",
  "MemoryRetrievalItem_authority_idx",
  "MemoryEmbedding_embedding_hnsw_idx",
  "AgentRun_parentRunId_startedAt_idx",
  "AgentRun_rootRunId_startedAt_idx",
  "AgentRun_conversationId_startedAt_idx",
  "AgentRun_conversationId_lastActivityAt_idx",
  "AgentRun_conversationId_lastDurableProgressAt_idx",
  "AgentRun_memoryExtractionStatus_leaseExpiry_idx",
  "ToolIdempotencyRecord_scopeKey_toolName_fingerprint_key",
  "ToolIdempotencyRecord_scopeKey_createdAt_idx",
  "DecisionRequestRecord_sourceRunId_callId_key",
  "DecisionRequestRecord_conversationId_status_createdAt_idx",
  "DecisionResolutionRecord_requestId_key",
  "AIUsageReservation_attemptKey_key",
  "AIUsageReservation_scopeKey_createdAt_idx",
  "AIUsageReservation_scopeKey_status_createdAt_idx",
  "AIUsage_reservationId_key",
]);

(async () => {
  const client = new Client({ connectionString: process.env.DIRECT_URL });
  await client.connect();
  const result = await client.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname='public'
      AND indexname = ANY($1::text[])
  `, [[...requiredIndexes]]);

  const found = new Set(result.rows.map((r) => r.indexname));
  const missing = [...requiredIndexes].filter((indexName) => !found.has(indexName));

  if (missing.length > 0) {
    console.error("Missing critical indexes:", missing);
    process.exitCode = 1;
  } else {
    console.log("All critical indexes present.");
  }

  await client.end();
})();
NODE

echo
echo "Release gate passed."
