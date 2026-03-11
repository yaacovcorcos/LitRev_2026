#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "== LitRev DB Doctor =="
echo "cwd: $ROOT_DIR"
echo

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  if [ -f ".env.local" ]; then
  echo "Loading env from .env.local"
  set -a
  # shellcheck source=/dev/null
  source .env.local
  set +a
  else
    echo "No .env.local found in next-app/. Continuing with current shell env."
  fi
else
  echo "Using DATABASE_URL/DIRECT_URL from current shell environment."
fi

if [ -z "${DATABASE_URL:-}" ] || [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DATABASE_URL and DIRECT_URL must both be set."
  exit 1
fi

echo
echo "1) URL sanity"
if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DIRECT_URL" == *"localhost"* ]]; then
  echo "WARN: At least one DB URL points to localhost."
else
  echo "OK: URLs are non-localhost."
fi

db_ssl_mode=$(echo "$DATABASE_URL" | sed -n 's/.*sslmode=\([^&]*\).*/\1/p')
direct_ssl_mode=$(echo "$DIRECT_URL" | sed -n 's/.*sslmode=\([^&]*\).*/\1/p')
echo "DATABASE_URL sslmode: ${db_ssl_mode:-missing}"
echo "DIRECT_URL   sslmode: ${direct_ssl_mode:-missing}"

echo
echo "2) Prisma migration state"
npx prisma migrate status || true

echo
echo "3) Connection + object checks (DATABASE_URL)"
node <<'NODE'
const { Client } = require("pg");

const databaseUrl = process.env.DATABASE_URL;
const directUrl = process.env.DIRECT_URL;

const checks = [
  {
    name: "critical_indexes",
    sql: `
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN (
          'AIMessage_conversationId_createdAt_id_idx',
          'UserMemory_userId_pinned_idx',
          'ProjectMemory_projectId_pinned_idx',
          'StudyMemory_projectId_pinned_idx',
          'MemoryEmbedding_embedding_hnsw_idx',
          'AgentRun_parentRunId_startedAt_idx',
          'AgentRun_rootRunId_startedAt_idx',
          'AgentRun_conversationId_startedAt_idx',
          'AgentRun_conversationId_lastActivityAt_idx'
        )
      ORDER BY indexname;
    `,
  },
  {
    name: "pending_migrations",
    sql: `
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
      LIMIT 10;
    `,
  },
];

async function run(label, url) {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const conn = await client.query(
      "SELECT current_database() AS db, current_user AS usr, version() AS version",
    );
    console.log(`\n[${label}] connected`, conn.rows[0]);
    for (const check of checks) {
      const out = await client.query(check.sql);
      console.log(`[${label}] ${check.name}:`, out.rows);
    }
  } catch (err) {
    console.error(`\n[${label}] ERROR:`, err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

(async () => {
  await run("DATABASE_URL", databaseUrl);
  await run("DIRECT_URL", directUrl);
})();
NODE

echo
echo "4) Suggested next step"
echo "If DATABASE_URL fails but DIRECT_URL works, inspect pooler/TLS settings."
echo "If both fail, inspect DNS/firewall/credentials first."
