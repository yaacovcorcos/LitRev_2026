# Backend Infrastructure & Schema Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Transport:** Server Actions are the primary transport, but all business logic lives in a server-only service layer (`lib/server`). This enables future Route Handlers + fetch without refactors.
- **Database:** Supabase PostgreSQL accessed via Prisma. Pooled connection string (`DATABASE_URL`) with SSL + pgbouncer. Direct string (`DIRECT_URL`) for migrations.
- **Data Persistence:** Replaced initial LocalStorage architecture with full database persistence for Projects, Protocols, Studies (Ledger), Drafts, and Copilot states.
- **File Assets:** Supabase Storage bucket `study-assets` is public. File deletes automatically purge orphaned blobs.
- **Schema:** Multi-tenant setup. Core models include `User`, `Workspace`, `WorkspaceMember`, `Project`, `Protocol`, `Draft`, `Study`, `FileAsset`, `AIConversation`, `AIMessage`, `AIUsage`, `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`, `MemoryEmbedding`, `AgentRun`, `RunEvent`, `Artifact`, `AutonomyConfig`, and `Note`.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Execute **Phase 10: Authentication & Multi-User Enablement**:
  - Implement Auth.js v5 + `@auth/prisma-adapter`.
  - Database sessions (not JWT). Login via Google OAuth + Resend Magic Links.
  - Auto-provision single Workspace per user on signup.
  - Migrate all Server Actions from `SINGLE_USER_SCOPE` placeholder to real session validation.
  - Update API routes (`/api/ai/stream`, `/api/ai/transcribe`) with auth checks.
- [ ] Execute **Phase 12: DraftVersion Hidden Backup History**:
  - Add `DraftVersion` schema (immutable versions for auditing/recovery) to preserve single latest `Draft` row for fast loads.
  - Modify draft save path to append version on content change.
  - Remove `Note` rows as draft backup storage in `draft_diff` apply flow.
- [ ] Execute **Phase 13: Inline Numbered Citations & Bibliography** (Design pending):
  - Schema: citation-to-study mapping, order tracking.
  - TipTap editor custom node for citations `[1]`.
  - Ledger sync for automatic renumbering.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Phase 0-3: Core infra setup (Supabase, Prisma, basic schema, service layer).
- [x] Phase 4-5: Projects/Protocol backend wired + LocalStorage migrated to DB.
- [x] Phase 6-8: Ledger, Draft, and Copilot state persistence moved to DB.
- [x] Phase 9: Blob storage for PDFs and export file generation mock.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] ORCID OAuth provider authentication (OAuth 2.0).
- [ ] Institutional SAML via BoxyHQ SAML Jackson.
- [ ] Enterprise SSO via WorkOS.
