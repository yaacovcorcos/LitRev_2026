# Authentication Implementation Report (Codex)

**Date:** February 25, 2026  
**Status:** Proposal (ready for execution planning)

## 1. Problem Definition (Agent Handoff-Friendly)

LitRev was intentionally built in **single-user runtime mode** while preserving
**multi-user data shape** (`ownerId` / `workspaceId` across core models). That is
correct architecture. The migration challenge now is not schema redesign; it is:

1. Replacing placeholder identity with real authenticated identity safely.
2. Closing all auth gaps at server-action and route boundaries.
3. Preserving existing data via a transactional first-login claim.
4. Shipping with production DB certainty (migrations + critical index verification).

This is a two-risk rollout:
- **Identity risk:** untrusted client identity + placeholder fallback paths.
- **Release risk:** schema/index drift between code expectations and production DB.

## 2. What I Reviewed

### Local codebase
- Placeholder/scope system:
  - `next-app/lib/server/scope.ts`
  - `next-app/app/actions/conversations.ts`
- Unauthenticated cost-bearing routes:
  - `next-app/app/api/ai/stream/route.ts`
  - `next-app/app/api/ai/transcribe/route.ts`
- Client-supplied identity in actions/services:
  - `next-app/app/actions/memory.ts`
  - `next-app/lib/server/ai/ai-service.ts`
- Denormalized workspace fields declared but not populated on create:
  - `next-app/prisma/schema.prisma`
  - `next-app/lib/server/ledger.ts`
  - `next-app/lib/server/files.ts`
- Production TLS weakening:
  - `next-app/lib/server/prisma.ts`
- Prisma CLI env precedence:
  - `next-app/prisma.config.ts`

### Existing auth report (Claude)
- `docs/plans/auth-implementation-report.md`

### Steal sources
- OpenCode (MIT): `cloned_repos/opencode_repo/packages/opencode/src/util/context.ts`
- OpenClaw (MIT):
  - `cloned_repos/openclaw_repo/src/gateway/auth-rate-limit.ts`
  - `cloned_repos/openclaw_repo/src/security/secret-equal.ts`
- Online repo/docs:
  - Prisma official Better Auth + Next.js + Prisma guide/example
  - Better Auth docs and Auth.js migration guidance

## 3. Strategic Decisions

1. **Use Better Auth, not Auth.js v5, for new implementation.**
   Better Auth is the sole identity authority in this project.
2. **Adopt Actor context via AsyncLocalStorage** at request boundary.
3. **Enforce auth at server boundary** (server actions + route handlers), not middleware-only.
4. **Treat first-login claim as core feature**, not cleanup.
5. **Run DB readiness as a release gate** for auth cutover (migrations + object verification).

## 4. Confirmed Gaps to Fix

1. Two placeholder identity systems are still active (`local-*` and `single-*`).
2. AI routes accept requests without authenticated session checks.
3. Several actions/services still accept user identity from caller input.
4. `Study.workspaceId` and `FileAsset.workspaceId` are not populated on writes.
5. Production DB connection currently rewrites `sslmode=require` to `sslmode=no-verify`.

## 5. “Steals” Worth Keeping

### From OpenCode
- Minimal AsyncLocalStorage context primitive (`use` + `provide`) to eliminate
  identity parameter drilling across service chains.

### From OpenClaw
- Scoped auth rate limiting (separate buckets per auth concern).
- Loopback/IP normalization behavior for fair limiter keys.
- Constant-time secret compare via hash + `timingSafeEqual`.

### From online reference (Prisma + Better Auth example)
- Clean Better Auth server initialization with Prisma adapter.
- Catch-all auth route pattern in Next.js.
- Session-first server-side lookup flow before privileged operations.

## 6. Improved Implementation Plan

### Phase 1: Foundation (Core Auth + Placeholder Unification)
1. Unify placeholder identity variants (`single-*` and `local-*`) before auth cutover.
2. Add Better Auth core wiring (`lib/auth.ts`, auth route handler, login flow).
3. Add `withAuth()` guard for server actions and `requireApiSession()` for API routes.
4. Gate `/api/ai/stream` and `/api/ai/transcribe` with server-side session checks.
5. Remove client-supplied `userId`/`workspaceId` from exposed action inputs.

### Phase 2: Actor Context & Scope Migration (All Endpoints, First Wave)
1. Implement `lib/server/actor.ts` using AsyncLocalStorage.
2. Replace placeholder reads with server-derived actor values.
3. Adapt scope helpers so existing service layer remains compatible.
4. Convert `assertProjectAccess()` and downstream data calls to actor-backed scope.

### Phase 3: First-Login Claim (First-Class Migration Feature)
1. Add idempotent claim transaction triggered on first authenticated login.
2. Reassign placeholder-owned rows to authenticated user/workspace.
3. Backfill denormalized `workspaceId` on `Study` and `FileAsset`.
4. Remove `ensureSingleUserSeed` path after successful cutover.

### Phase 4: Hardening
1. Replace TLS downgrade behavior in `prisma.ts`.
2. Move AI rate limiting keying to authenticated `userId` (not caller payload).
3. Add auth-focused tests (claim idempotency, cross-workspace denial, AI route denial).
4. Add session management UX only after boundary security is complete.

## 7. Your DB/Migration Conversation: Should It Be Part of Auth?

Short answer: **yes, as a release gate; no, as core auth domain logic**.

- The migration/index checks are not “auth features.”
- But they are **mandatory preconditions** to ship auth safely.

### Recommended ownership split
- **Auth build track (this project):** identity boundaries, actor context, claim flow,
  endpoint protection, service-layer migration.
- **DB reliability track (can be another agent):** production-target migration run,
  critical index/object verification, optional repair SQL, release checklists.

### Non-negotiable gate before auth production rollout
1. `npx prisma migrate deploy` against production target.
2. `npx prisma migrate status` against production target.
3. Explicit SQL existence checks for critical indexes (including HNSW).
4. Deploy app code only after gate passes.

## 8. Production Runbook (Auth Cutover Window)

1. Snapshot/backup production database.
2. Confirm env points to production DB for CLI operation (`DIRECT_URL`/`DATABASE_URL`).
3. Run migration deploy.
4. Run migration status.
5. Run object verification SQL:
   - `AIMessage_conversationId_createdAt_id_idx`
   - `UserMemory_userId_pinned_idx`
   - `ProjectMemory_projectId_pinned_idx`
   - `StudyMemory_projectId_pinned_idx`
   - `MemoryEmbedding_embedding_hnsw_idx`
6. If missing, apply controlled repair SQL and re-verify.
7. Deploy application.
8. Run smoke tests:
   - unauthenticated route rejection
   - authenticated chat path success
   - first-login claim success and idempotent re-run
9. Monitor error rate and chat/memory latency for 24-48h.

## 9. Feedback to Claude (ready to send)

Your report is strong and mostly execution-ready. I agree with your core
corrections: Better Auth direction, Actor context, first-login claim priority,
all-endpoint first-wave coverage, denormalized workspace backfill, and TLS
hardening.

My additions:
1. Split execution into two parallel tracks: auth implementation vs DB release
   reliability. Keep DB checks as a hard gate for auth launch.
2. Move AI route protection to the earliest phase and treat it as immediate
   security baseline.
3. Add an explicit production cutover runbook with migration-target validation
   to prevent local-vs-prod execution mistakes.
4. Keep collaboration authorization out of initial auth delivery scope; only
   ship collaboration after auth is stable in production.

## 10. Definition of Done

1. No protected route/action can execute without validated server session.
2. No action trusts caller-provided identity fields.
3. Placeholder identity system removed from production code paths.
4. First-login claim migrates legacy data and is idempotent.
5. `Study.workspaceId` and `FileAsset.workspaceId` are populated on write and
   backfilled historically.
6. Production migration/index verification gate is documented and used.
7. Typecheck and tests pass from `next-app/`.

## 11. Notes on Why This Fits Your Existing Architecture

Single-user mode was implemented correctly for later migration: data already
carries ownership/workspace scoping. The auth project is mainly a controlled
identity-source swap plus boundary hardening, not a schema rewrite.
