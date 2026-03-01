#!/usr/bin/env bash
set -euo pipefail

if [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DIRECT_URL is required for prisma migrate deploy."
  exit 1
fi

echo "Pre-migration repair: checking RunEvent duplicate sequences..."
node scripts/repair-run-event-sequences.mjs

run_migrate_deploy() {
  local output
  set +e
  output="$(npx prisma migrate deploy 2>&1)"
  local exit_code=$?
  set -e

  echo "$output"
  if [ $exit_code -eq 0 ]; then
    return 0
  fi

  if echo "$output" | grep -q "RunEvent_runId_sequence_key"; then
    echo "Detected RunEvent unique-sequence migration failure. Attempting automatic recovery..."
    node scripts/repair-run-event-sequences.mjs
    npx prisma migrate resolve --rolled-back 20260228180000_add_agent_run_lineage || true
    echo "Retrying prisma migrate deploy..."
    npx prisma migrate deploy
    return 0
  fi

  return $exit_code
}

run_migrate_deploy
