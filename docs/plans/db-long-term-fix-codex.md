# DB + Deploy Reliability Long-Term Fix (Codex)

## Problem Statement
You are repeatedly hitting a mixed class of failures:
- auth endpoints fail because runtime DB TLS/connection fails,
- deploys fail or become non-deterministic because migrations and app rollout are not a single controlled release step,
- investigation is slow because tooling access is inconsistent (MCP auth drift, missing local CLI diagnostics).

This plan is designed to stop recurring incidents, not just patch one outage.

## Current Baseline (Now)
- `supabase` CLI installed locally.
- `psql` installed locally.
- MCP servers configured, but OAuth tokens were stale and had to be re-authorized.
- Existing production runbook exists at `docs/plans/db-production-runbook.md`.
- Security debt exists if runtime uses TLS downgrade (`sslmode=no-verify`) outside explicit emergency mode.

## Target Operating Model
1. Single source of truth for environment variables per environment (`local`, `preview`, `production`).
2. Deterministic release gate: `migrate -> verify -> deploy -> smoke`.
3. Continuous observability for DB/auth failure modes.
4. Fast operator diagnostics from one command.
5. No permanent insecure TLS downgrade in production.

## Phase A (Immediate: 1-2 days)
1. MCP + CLI stabilization
   - Re-login MCP for `supabase` and `vercel` (OAuth).
   - Keep `supabase`, `psql`, `vercel` CLIs as mandatory operator tooling.
2. Standard diagnostic command
   - Use `next-app/scripts/db-doctor.sh` before and after each production release.
3. Release gate enforcement
   - Release checklist must include:
     - `npx prisma migrate deploy`
     - `npx prisma migrate status`
     - critical index checks
     - auth smoke checks

## Phase B (Stabilization: this week)
1. Environment hygiene
   - Normalize env ownership:
     - local: `next-app/.env.local`
     - Vercel preview/prod: Vercel Project Environment Variables only
   - Remove contradictory/duplicate DB vars from shell profiles.
2. Runtime TLS policy
   - Replace implicit TLS downgrade with explicit flag-based emergency mode:
     - default production behavior: verify cert chain
     - emergency-only temporary opt-out with loud logging and expiry date
3. Deployment sequencing
   - Do not run migrations as part of every app build by default.
   - Run migrations in controlled release window right before production deploy.

## Phase C (Hardening: 1-2 weeks)
1. Monitoring + alerts
   - Track:
     - auth route 5xx rate (`/api/auth/*`)
     - DB connect failures (`P1011`, SSL chain failures, timeout)
     - p95/p99 latency for chat stream and project load
   - Add alert thresholds and on-call runbook links.
2. Drift prevention
   - Weekly schema/index drift check using read-only SQL.
   - Verify `MemoryEmbedding_embedding_hnsw_idx` and other critical indexes.
3. Automated smoke tests
   - Post-deploy scripted smoke:
     - Google login start/callback
     - magic-link request
     - protected route access
     - project list load

## Phase D (Strategic Option: provider migration decision)
If Supabase Postgres reliability remains unstable after Phases A-C:
1. Run a 2-provider bakeoff (Supabase vs Neon/RDS) on:
   - TLS stability,
   - pooler behavior under load,
   - migration ergonomics,
   - cost + operational burden.
2. Decide based on measured SLO misses, not sentiment.
3. If migrating:
   - dual-write not required for this app shape,
   - plan snapshot + restore + validation + short write freeze cutover.

## Non-Negotiable Release Gate (Every Production Release)
1. `db-doctor.sh` clean enough to proceed (or known exceptions documented).
2. `prisma migrate deploy` successful against production `DIRECT_URL`.
3. `prisma migrate status` says up-to-date.
4. critical indexes verified.
5. auth + project smoke tests pass.
6. monitor closely for 24-48h after release.

## Ownership
- Build/Code owner: application repo maintainers.
- Infra owner: Vercel env + DB endpoint + TLS policy.
- Release owner: whoever presses production deploy is responsible for running the gate.
