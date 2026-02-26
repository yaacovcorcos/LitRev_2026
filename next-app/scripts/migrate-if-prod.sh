#!/usr/bin/env bash
# Run Prisma migrations only on production Vercel deploys.
# Preview/development deploys skip migrations to avoid mutating the shared DB.

set -euo pipefail

if [ "${VERCEL_ENV:-}" = "production" ]; then
  if [ "${RUN_PRISMA_MIGRATE_IN_BUILD:-0}" = "1" ]; then
    echo "Production deploy — running prisma migrate deploy..."
    npx prisma migrate deploy
  else
    echo "Production deploy — skipping prisma migrate deploy (RUN_PRISMA_MIGRATE_IN_BUILD != 1)"
  fi
else
  echo "Skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset})"
fi
