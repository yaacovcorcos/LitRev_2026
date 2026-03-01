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
  "ProjectMemory_projectId_pinned_idx",
  "StudyMemory_projectId_pinned_idx",
  "MemoryEmbedding_embedding_hnsw_idx",
  "AgentRun_parentRunId_startedAt_idx",
  "AgentRun_rootRunId_startedAt_idx",
  "AgentRun_conversationId_startedAt_idx",
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
