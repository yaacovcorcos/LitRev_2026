#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<EOF
Usage: bash scripts/db-ops.sh <command>

Commands:
  diagnose   Run connection tests, SSL checks, migration state, index audit
  migrate    Safe migration deploy with automatic RunEvent duplicate repair
  repair     Fix duplicate (runId, sequence) tuples in RunEvent table
  gate       Full pre-deploy validation (diagnose + migrate + index check)
  status     Show prisma migrate status
  validate   Run prisma validate (schema syntax check)

All commands require DATABASE_URL and/or DIRECT_URL to be set
(via shell env or next-app/.env.local).
EOF
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

case "$1" in
  diagnose)
    bash scripts/db-doctor.sh
    ;;
  migrate)
    bash scripts/migrate-deploy-safe.sh
    ;;
  repair)
    node scripts/repair-run-event-sequences.mjs
    ;;
  gate)
    bash scripts/release-gate-prod.sh
    ;;
  status)
    npx prisma migrate status
    ;;
  validate)
    npx prisma validate
    ;;
  *)
    echo "Unknown command: $1"
    echo
    usage
    ;;
esac
