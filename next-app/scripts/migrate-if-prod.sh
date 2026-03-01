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

echo "Production deploy — checking DIRECT_URL reachability..."
if ! node -e '
const net = require("node:net");
const { URL } = require("node:url");

const timeoutMs = Number(process.env.DIRECT_URL_CONNECT_TIMEOUT_MS || 3000);
const target = new URL(process.env.DIRECT_URL);
const host = target.hostname;
const port = Number(target.port || 5432);

const socket = net.createConnection({ host, port });
let settled = false;

function fail(message) {
  if (settled) return;
  settled = true;
  try { socket.destroy(); } catch {}
  console.error(message);
  process.exit(1);
}

socket.setTimeout(timeoutMs, () => fail(`TCP timeout to ${host}:${port} after ${timeoutMs}ms`));
socket.on("error", (err) => fail(`TCP connect failed to ${host}:${port}: ${err.code || err.message}`));
socket.on("connect", () => {
  if (settled) return;
  settled = true;
  socket.end();
  process.exit(0);
});
'; then
  echo "ERROR: DIRECT_URL is not reachable from this build environment."
  echo "Hint: Supabase direct DB hosts can be IPv6-only from Vercel builds."
  echo "Use a reachable session-mode pooler host (:5432) for DIRECT_URL."
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
