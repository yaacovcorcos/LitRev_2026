# Backend Infrastructure & Schema Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Transport:** Server Actions are the primary transport, but all business logic lives in a server-only service layer (`lib/server`). This enables future Route Handlers + fetch without refactors.
- **Server Action Export Contract:** `app/actions/**` modules marked `"use server"` must export runtime action functions only; shared type contracts come from non-action modules (for example `lib/schemas/**`) to avoid runtime action-registration failures.
- **Database:** Supabase PostgreSQL accessed via Prisma. Pooled connection string (`DATABASE_URL`) with SSL + pgbouncer. Direct string (`DIRECT_URL`) for migrations.
- **Environment split:** Local localhost DB is for development/testing only. Deployed source of truth is Supabase Postgres, and production schema changes must target production `DIRECT_URL` (not local URLs).
- **Data Persistence:** Replaced initial LocalStorage architecture with full database persistence for Projects, Protocols, Studies (Ledger), Drafts, and Copilot states.
- **File Assets:** Supabase Storage bucket `study-assets` is public. File deletes automatically purge orphaned blobs.
- **Schema:** Multi-tenant setup. Core models include `User`, `Workspace`, `WorkspaceMember`, `Project`, `Protocol`, `Draft`, `DraftVersion`, `Study`, `FileAsset`, `AIConversation`, `AIMessage`, `AIUsage`, `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`, `MemoryEmbedding`, `AgentRun`, `RunEvent`, `Artifact`, `AutonomyConfig`, and `Note`.
- **Draft Versioning:** `DraftVersion` stores immutable per-section snapshots for auditing/recovery. The `draft_diff` artifact apply flow writes to `DraftVersion` (provenance) + `Draft` (display). Notes table is no longer used for draft backup.
- **Auth & Identity Boundary:** Better Auth (Prisma adapter, DB sessions) is live with Google + magic link support, server-side `withAuth()`/`requireApiSession()` boundaries, and request-scoped actor context (`AsyncLocalStorage`) that feeds service scope resolution.
- **Legacy Claim Path:** First authenticated session runs an idempotent transactional claim that reassigns `local-user`/`local-workspace` ownership, backfills denormalized workspace IDs, and removes obsolete placeholder principal rows.
- **Demo Seed Lifecycle:** Sample-project creation/reset is server-seeded from a single transactional service (`lib/server/demo-project.ts`) that finds the current user's scoped demo by `Project.demoKey`, creates a generated project ID when missing, and repopulates project, protocol, ledger, draft, notes, memory, and scoped seed conversation rows without relying on a global fixed project ID.
- **Onboarding State Persistence:** Guided-setup defaults now persist in `UserMemory` (`guided_setup_new_projects`) and per-project onboarding state persists in `Project.progress.onboarding` (`enabledOverride`, `completedAt`, `skippedAt`) so create-flow routing is backend-driven and auth-ready.
- **AI Rate Limiting (Current):** Limit checks and usage writes now support authenticated user/workspace scope (with legacy project fallback), while cache-efficiency counters remain process-local instrumentation in `lib/server/ai/rate-limiter.ts`.
- **Citation Preview Diagnostics:** Citation hover resolution returns server-owned diagnostics alongside `CitationMetadata`, caches successful diagnostics with the result, persists terminal completion/failure telemetry into `ChatUnificationMetric` under the `citation_preview.*` namespace, and ships repo-owned smoke/report/diagnose scripts for provider triage.
- **Citation Hover Continuation:** Citation hover remains bibliography-first and budget-bounded on the initial request, but retryable `PubMed` bibliography-only successes can now trigger one server-authoritative continuation attempt. Continuation is gated by paired existing server/client flags, server-side continuation requests dedupe by citation key, count-bearing cache state is monotonic under slower no-count retries, and continuation terminal telemetry/reporting track recovery without overstating failed-attempt outcomes.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Complete **Phase 10 rollout gate and production stabilization**:
  - Run production `prisma migrate deploy` and `prisma migrate status` against the production direct connection.
  - Verify critical DB objects/indexes in production before deploy (`AIMessage_conversationId_createdAt_id_idx`, memory pinned indexes, `MemoryEmbedding_embedding_hnsw_idx`).
  - Execute auth cutover smoke checks (login, protected route denial, AI stream auth path, first-login claim visibility).
  - Monitor 24-48h post-cutover for auth failures, AI route error/latency regression, and claim anomalies.
- [ ] Execute **Phase 13: Inline Numbered Citations & Bibliography** (Design pending):
  - Schema: citation-to-study mapping, order tracking.
  - TipTap editor custom node for citations `[1]`.
  - Ledger sync for automatic renumbering.
- [ ] Execute **Onboarding V2 Backend Enablement**:
  - Add server-action/service support for AI-assisted guided-setup steps (`suggest`, `refine`, `generate`) with typed result contracts.
  - Persist per-step onboarding status (`todo` / `skipped` / `later` / `completed`) so progress is resumable and queryable.
  - Add backend support for contextual guided-step explainers (`Explain this`) tied to current project/protocol state.
- [ ] Execute **Performance Program (Backend + Data Path)**:
  - Define strict speed budgets and track baseline + regression metrics (home load, project route switch, first guided-step action, sample-open action, first AI response token).
  - Implement serious cache management for hot reads:
    - cache layers (request, process, edge where appropriate),
    - explicit cache keys and TTL policy,
    - explicit invalidation rules tied to writes.
  - Implement preloading strategy for critical flows:
    - preload next-route/project essentials,
    - warm high-probability data (recent projects, active conversation metadata, protocol/draft headers),
    - prevent over-prefetching with guardrails.
  - Remove redundant queries and action round-trips; consolidate N+1 patterns into batched reads where possible.
  - Add query/index performance review for top slow paths and lock in DB-level fixes with migration-backed indexes.
  - Ship performance work in measured phases with before/after benchmarks and hard go/no-go criteria.
- [ ] Execute **AI Cache Metrics Persistence (Plan + Implementation)**:
  - Design and approve persistent schema for provider cache metrics (project/workspace scoping, model, time bucket, cached vs total input tokens, request counts).
  - Implement Prisma migration(s) and server write-path integration from `recordUsage`/provider usage metadata (`cached_tokens` when available).
  - Add read/query surface for monitoring (aggregate stats per project/workspace and date range).
  - Add tests covering migration-safe writes, aggregation correctness, and fallback behavior when providers omit cache fields.
## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Hardened shipped citation hover continuation for retryable `PubMed` bibliography-only misses: continuation requests now dedupe on the server by citation key, slower no-count continuations cannot downgrade recovered counts, and continuation reporting counts failed attempts in the recovery denominator.
- [x] Tuned citation hover count enrichment to a larger bounded budget (`1500ms` overall, `1200ms` per provider) and added a repo-owned single-URL diagnosis script so live PubMed/DOI hover misses can be classified before building continuation.
- [x] Hardened citation hover observability: resolver success paths now classify resolution diagnostics, client/server cache retain those diagnostics for truthful telemetry, only terminal citation preview completion/failure events persist to `ChatUnificationMetric`, and repo-owned compatibility smoke/report scripts document the first canary workflow.
- [x] Reworked sample-project identity to use scoped `Project.demoKey` lookup plus generated per-user project/child IDs, eliminating production collisions from the legacy shared `sample-yoga-anxiety` primary key while leaving old rows safely ignored.
- [x] Phase 10 (build phases 1-4): landed Better Auth foundation + actor-context identity propagation, protected server actions/routes, replaced runtime placeholder scope usage, added transactional first-login claim, moved AI usage limiting toward user/workspace scope, and added auth hardening tests.
- [x] Phase 12: Added `DraftVersion` table for immutable per-section draft history. `draft_diff` artifact now writes to `DraftVersion` instead of `Note`. Fixed `update_note` tool `append` action to read from Draft table.
- [x] Hardened demo-seed integrity by typing transaction clients, scoping seeded conversation ownership to the active service scope, and aligning draft seed citations with linked evidence sections.
- [x] Added backend-guided onboarding persistence: user-level default preference plus per-project onboarding state and completion markers used by create-flow routing.
- [x] Added transactional demo project seed/reset actions for the on-demand sample onboarding workspace.
- [x] Phase 0-3: Core infra setup (Supabase, Prisma, basic schema, service layer).
- [x] Phase 4-5: Projects/Protocol backend wired + LocalStorage migrated to DB.
- [x] Phase 6-8: Ledger, Draft, and Copilot state persistence moved to DB.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] ORCID OAuth provider authentication (OAuth 2.0).
- [ ] Institutional SAML via BoxyHQ SAML Jackson.
- [ ] Enterprise SSO via WorkOS.
