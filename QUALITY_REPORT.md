# Quality Report (Current)

Generated: 2026-02-11  
Scope: Current repository state (`main` + working tree)

Verification run:
- `cd next-app && npx tsc --noEmit` -> passes
- `cd next-app && npx vitest run` -> blocked locally (`ENOSPC: no space left on device`), so test status is unknown from this machine

## Findings (ordered by severity)

1. **Critical** - No authentication/authorization on AI cost-bearing endpoints and core data paths
- Evidence:
  - `next-app/app/api/ai/stream/route.ts:15`
  - `next-app/app/api/ai/transcribe/route.ts:6`
  - `next-app/app/actions/conversations.ts:13`
  - `next-app/app/actions/memory.ts:66`
- Why this matters:
  - Any caller can hit expensive AI endpoints and data mutations without a verified user/session boundary.
  - Current scoping is placeholder-based, not identity-enforced.
- Recommended fix:
  - Add real auth/session middleware and enforce server-side ownership checks before every read/write/metered operation.

2. **Critical** - Identity split (`local-user` vs `single-user`) can break UserMemory writes
- Evidence:
  - Seeded single-user identity: `next-app/lib/server/scope.ts:8`, `next-app/lib/server/bootstrap.ts:6`
  - AI/memory fallback identity: `next-app/lib/server/ai/ai-service.ts:425`
  - Memory artifact write path uses `"single-user"`: `next-app/lib/server/agent/artifacts.ts:323`
  - UserMemory requires valid `userId`: `next-app/lib/server/memory/user-memory.ts:33`
- Why this matters:
  - User-memory writes can fail with FK errors when `"single-user"` is used but only `"local-user"` is seeded.
- Recommended fix:
  - Standardize on one canonical single-user ID immediately, then replace with auth-derived IDs in Phase 10.

3. **High** - TLS certificate verification is disabled for DB connections
- Evidence:
  - `next-app/lib/server/prisma.ts:10`
- Why this matters:
  - `sslmode=no-verify` removes server cert verification and weakens transport security.
- Recommended fix:
  - Keep `sslmode=require` (or strict TLS settings) in production; gate relaxed mode to local-only explicit opt-in.

4. **High** - Conversation operations allow ID-based access without ownership checks
- Evidence:
  - Raw conversation fetch by ID: `next-app/app/actions/conversations.ts:106`
  - Update/delete by ID only: `next-app/app/actions/conversations.ts:231`
  - Placeholder user/workspace context: `next-app/app/actions/conversations.ts:13`
- Why this matters:
  - With real multi-user auth, this becomes an IDOR-style data exposure/modification path unless fixed.
- Recommended fix:
  - Require auth scope and enforce `{conversationId, userId, workspaceId}` constraints on every conversation mutation/query.

5. **High** - Memory actions trust client-supplied scope and mutate by bare IDs
- Evidence:
  - User ID passed directly from caller: `next-app/app/actions/memory.ts:70`
  - User memory updates/deletes by ID only: `next-app/lib/server/memory/user-memory.ts:87`
  - Project memory reads by projectId without access assertion: `next-app/app/actions/memory.ts:116`
- Why this matters:
  - Boundary is not enforced in service/action layer; unsafe once more than one user exists.
- Recommended fix:
  - Remove client-supplied `userId`/scope inputs and derive from authenticated session; enforce project access in memory services.

6. **High** - AI rate limiting can be bypassed by client-controlled `projectId`
- Evidence:
  - Client body accepts `options.projectId`: `next-app/app/api/ai/stream/route.ts:18`
  - Rate limiter keys exclusively by `projectId`: `next-app/lib/server/ai/rate-limiter.ts:14`
- Why this matters:
  - A caller can shard requests across arbitrary project IDs to evade limits/cost controls.
- Recommended fix:
  - Rate-limit on authenticated `userId` and/or `workspaceId`, with optional per-project overlays.

7. **Medium** - Denormalized `workspaceId` fields are defined but not populated on study/file writes
- Evidence:
  - Intended denormalized fields: `next-app/prisma/schema.prisma:97`, `next-app/prisma/schema.prisma:119`
  - Study create/update paths omit `workspaceId`: `next-app/lib/server/ledger.ts:68`
  - FileAsset create path omits `workspaceId`: `next-app/lib/server/files.ts:111`
- Why this matters:
  - Multi-user query/index plans relying on these columns will be incomplete; future backfill becomes harder.
- Recommended fix:
  - Write `workspaceId` on create/update now (derived from project scope) and backfill existing rows once.

8. **Medium** - Two conversation persistence paths use different scoping models
- Evidence:
  - Placeholder-scoped path: `next-app/app/actions/conversations.ts:13`
  - AI memory path stores/fetches by context/project/study only: `next-app/lib/server/ai/memory.ts:41`
- Why this matters:
  - Inconsistent semantics increase migration risk and create hidden cross-session coupling.
- Recommended fix:
  - Consolidate conversation persistence behind a single ownership-aware service.

## Resolved/Outdated Items (not carried forward)

- "No CI" is outdated: `.github/workflows/ci.yml`
- "No tests" is outdated: `next-app/lib/server/__tests__/...` and other test suites exist
- File validation now exists for uploads: `next-app/lib/server/files.ts:333`

## Recommended Execution Order

1. Fix auth + ownership enforcement for AI routes, conversations, and memory actions.
2. Unify single-user identity constants (`local-user` vs `single-user`) as immediate bug fix.
3. Re-enable strict DB TLS verification for non-local environments.
4. Harden rate limiting to user/workspace dimensions.
5. Populate and backfill `workspaceId` on `Study` and `FileAsset`.
