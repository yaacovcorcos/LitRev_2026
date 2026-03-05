# Auth Implementation History

Status: historical reference only
Last reviewed: 2026-03-06

This file merges the retired proposal-era auth reports:
- `docs/plans/auth-implementation-report-claude.md`
- `docs/plans/auth-implementation-report-codex.md`

Current implementation truth now lives in:
- `docs/plans/plan-backend.md`
- `docs/plans/db-production-runbook.md`
- `docs/runbooks/admin-access.md`

## Current Shipped State

As of the current codebase and `plan-backend.md`:
- Better Auth is live with the Prisma adapter and DB-backed sessions.
- Google sign-in and magic-link auth are implemented.
- Server boundaries use `withAuth()` for actions and `requireApiSession()` for route handlers.
- Request-scoped actor context is implemented with `AsyncLocalStorage`.
- The first authenticated session runs an idempotent legacy claim that migrates placeholder-owned data and backfills denormalized workspace ownership.
- Auth protection is active across the AI stream/transcribe paths and the main server-action surface.

## Current Evidence Anchors

- Better Auth server/client wiring: `next-app/lib/auth.ts`, `next-app/lib/auth-client.ts`, `next-app/app/api/auth/[...all]/route.ts`
- Session-cookie route protection: `next-app/proxy.ts`
- Request-scoped actor context and API/session guards: `next-app/lib/server/actor.ts`, `next-app/lib/server/auth/session.ts`
- Legacy placeholder claim and reassignment flow: `next-app/lib/server/auth/claim.ts`
- Protected AI/API boundaries: `next-app/app/api/ai/stream/route.ts`, `next-app/app/api/ai/transcribe/route.ts`, `next-app/app/api/telemetry/chat-unification/route.ts`
- Protected server-action surface examples: `next-app/app/actions/agent.ts`, `next-app/app/actions/conversations.ts`, `next-app/app/actions/memory.ts`

## Decisions Retained From The Original Reports

The two original reports agreed on the decisions that still matter:

1. Better Auth is the sole identity authority for this repo.
2. Auth must be enforced at server boundaries, not trusted from client payloads.
3. Actor-context propagation is the right replacement for placeholder identity plumbing.
4. First-login legacy claim is part of the auth rollout, not optional cleanup.
5. Production DB verification is a hard release gate for auth rollout safety.

## What Remains Open

The proposal reports are no longer active plans. The remaining open work is now tracked in `docs/plans/plan-backend.md`:

- Phase 10 rollout gate and production stabilization:
  - production `prisma migrate deploy` / `migrate status`
  - critical DB object verification
  - auth cutover smoke checks
  - 24-48h monitoring after rollout
- Enterprise/provider follow-ons remain deferred:
  - ORCID OAuth
  - institutional SAML
  - enterprise SSO

## Why The Original Files Were Retired

Both original auth reports were proposal documents written before the auth foundation shipped.
Keeping both in `docs/plans/` created duplicate truth and increased the chance of someone following stale rollout guidance instead of the active backend plan and DB runbooks.
