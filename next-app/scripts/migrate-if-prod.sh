#!/usr/bin/env bash
# Production migration gate for Vercel builds.
# Policy:
# - Production deploys MUST run prisma migrate deploy before building app code.
# - Production deploys MUST fail if migrations are still pending afterwards.
# - Preview/development deploys skip DB mutations.

set -euo pipefail

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping migrations (VERCEL_ENV=${VERCEL_ENV:-unset})"
  exit 0
fi

if [ -z "${DIRECT_URL:-}" ]; then
  echo "ERROR: DIRECT_URL is required for production migrations and is not set."
  exit 1
fi

echo "Production deploy — running prisma migrate deploy..."
bash scripts/migrate-deploy-safe.sh

echo "Production deploy — verifying migration state..."
status_output="$(npx prisma migrate status 2>&1 || true)"
echo "$status_output"

if echo "$status_output" | grep -Eiq "have not yet been applied|following migration"; then
  echo "ERROR: Pending migrations detected after prisma migrate deploy."
  echo "Aborting build to prevent app/schema drift in production."
  exit 1
fi

echo "Production migration gate passed."
