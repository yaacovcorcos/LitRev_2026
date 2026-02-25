# Backend Infrastructure & Schema Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Transport:** Server Actions are the primary transport, but all business logic lives in a server-only service layer (`lib/server`). This enables future Route Handlers + fetch without refactors.
- **Database:** Supabase PostgreSQL accessed via Prisma. Pooled connection string (`DATABASE_URL`) with SSL + pgbouncer. Direct string (`DIRECT_URL`) for migrations.
- **Data Persistence:** Replaced initial LocalStorage architecture with full database persistence for Projects, Protocols, Studies (Ledger), Drafts, and Copilot states.
- **File Assets:** Supabase Storage bucket `study-assets` is public. File deletes automatically purge orphaned blobs.
- **Schema:** Multi-tenant setup. Core models include `User`, `Workspace`, `WorkspaceMember`, `Project`, `Protocol`, `Draft`, `DraftVersion`, `Study`, `FileAsset`, `AIConversation`, `AIMessage`, `AIUsage`, `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`, `MemoryEmbedding`, `AgentRun`, `RunEvent`, `Artifact`, `AutonomyConfig`, and `Note`.
- **Draft Versioning:** `DraftVersion` stores immutable per-section snapshots for auditing/recovery. The `draft_diff` artifact apply flow writes to `DraftVersion` (provenance) + `Draft` (display). Notes table is no longer used for draft backup.
- **Single-User Compatibility Layer:** Most app data paths already enforce `ownerId` + `workspaceId` scoping via `SINGLE_USER_SCOPE` placeholders. Conversation actions still use separate placeholder constants and must be normalized before auth cutover.
- **Demo Seed Lifecycle:** Sample-project creation/reset is now server-seeded from a single transactional service (`lib/server/demo-project.ts`) that repopulates project, protocol, ledger, draft, notes, memory, and scoped seed conversation rows.
- **Onboarding State Persistence:** Guided-setup defaults now persist in `UserMemory` (`guided_setup_new_projects`) and per-project onboarding state persists in `Project.progress.onboarding` (`enabledOverride`, `completedAt`, `skippedAt`) so create-flow routing is backend-driven and auth-ready.
- **AI Cache Metrics (Current):** Cache-efficiency counters are currently process-local instrumentation in `lib/server/ai/rate-limiter.ts` (no DB persistence yet), so metrics reset on instance restart and are not queryable across deploys.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Execute **Phase 10: Authentication & Multi-User Enablement**:
  - Implement Better Auth + Prisma adapter (database sessions, not JWT) with Google OAuth + Resend magic links.
  - Add Actor request context (`AsyncLocalStorage`) so server identity is derived once and consumed across actions/services without client-supplied `userId`/`workspaceId`.
  - Auto-provision default Workspace + WorkspaceMember on signup.
  - Migrate all Server Actions from placeholder scope (`SINGLE_USER_SCOPE` / conversation placeholders) to session-derived identity.
  - Protect API routes (`/api/ai/stream`, `/api/ai/transcribe`) with server-side session checks; never rely on middleware alone as the security boundary.
  - Add a transactional, idempotent first-login claim path that reassigns placeholder-owned data to the authenticated user/workspace and removes legacy bootstrap paths.
  - Backfill and enforce denormalized `workspaceId` writes for `Study` and `FileAsset`.
  - Replace production `sslmode=no-verify` DB behavior with proper TLS verification.
  - Add release gate for auth rollout: run production `prisma migrate deploy/status` and verify critical indexes/objects before app deploy.
- [ ] Execute **Phase 13: Inline Numbered Citations & Bibliography** (Design pending):
  - Schema: citation-to-study mapping, order tracking.
  - TipTap editor custom node for citations `[1]`.
  - Ledger sync for automatic renumbering.
- [ ] Execute **Onboarding V2 Backend Enablement**:
  - Add server-action/service support for AI-assisted guided-setup steps (`suggest`, `refine`, `generate`) with typed result contracts.
  - Persist per-step onboarding status (`todo` / `skipped` / `later` / `completed`) so progress is resumable and queryable.
  - Add backend support for contextual guided-step explainers (`Explain this`) tied to current project/protocol state.
- [ ] Execute **Performance Program (Backend + Data Path)**:
  - Define and track baseline latency metrics (home load, project route switch, first guided-step action, sample-open action).
  - Add cache strategy for hot read paths and reduce redundant queries/action round-trips.
  - Optimize slow server actions in onboarding/sample/project bootstrap flows with measurable before/after timings.
- [ ] Execute **AI Cache Metrics Persistence (Plan + Implementation)**:
  - Design and approve persistent schema for provider cache metrics (project/workspace scoping, model, time bucket, cached vs total input tokens, request counts).
  - Implement Prisma migration(s) and server write-path integration from `recordUsage`/provider usage metadata (`cached_tokens` when available).
  - Add read/query surface for monitoring (aggregate stats per project/workspace and date range).
  - Add tests covering migration-safe writes, aggregation correctness, and fallback behavior when providers omit cache fields.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Phase 12: Added `DraftVersion` table for immutable per-section draft history. `draft_diff` artifact now writes to `DraftVersion` instead of `Note`. Fixed `update_note` tool `append` action to read from Draft table.
- [x] Hardened demo-seed integrity by typing transaction clients, scoping seeded conversation ownership to the active service scope, and aligning draft seed citations with linked evidence sections.
- [x] Added backend-guided onboarding persistence: user-level default preference plus per-project onboarding state and completion markers used by create-flow routing.
- [x] Added transactional demo project seed/reset actions for the on-demand sample onboarding workspace.
- [x] Phase 0-3: Core infra setup (Supabase, Prisma, basic schema, service layer).
- [x] Phase 4-5: Projects/Protocol backend wired + LocalStorage migrated to DB.
- [x] Phase 6-8: Ledger, Draft, and Copilot state persistence moved to DB.
- [x] Phase 9: Blob storage for PDFs and export file generation mock.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] ORCID OAuth provider authentication (OAuth 2.0).
- [ ] Institutional SAML via BoxyHQ SAML Jackson.
- [ ] Enterprise SSO via WorkOS.
