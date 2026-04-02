# Database Architecture Reference

This file is the canonical structural DB reference for LitRev.
It explains environment topology, table/domain semantics, invariants, and DB-doc update obligations.

This file is not the owner of operational repair procedures or production migration steps.
For diagnosis/remediation, use `docs/runbooks/db-ops.md`.
For production migration/release procedure, use `docs/plans/db-production-runbook.md`.

## When Agents Must Read This Doc

- Before changing `next-app/prisma/schema.prisma`.
- Before adding or changing migrations when table semantics, ownership, scoping, nullability, or invariants matter.
- Before explaining table/domain structure, auth persistence, memory storage, agent runtime persistence, or storage metadata.
- Before making DB-related feature changes that repurpose existing schema.

## When This Doc Must Be Updated

- Any schema change in `next-app/prisma/schema.prisma`.
- Any migration that changes table purpose, ownership/scoping, nullable meaning, soft-delete behavior, important uniqueness/index assumptions, or domain invariants.
- Any change to local vs Supabase DB topology, `DATABASE_URL` / `DIRECT_URL` roles, Better Auth ownership, or Supabase Storage responsibility.
- Any task where an agent had to inspect schema or migrations to answer a DB-structure question this doc should already answer directly.

## Environment Topology

- Local development/test database: localhost Postgres only.
- Active online database: Supabase Postgres.
- An archived Supabase project may exist for history/reference, but it is not an active migration or runtime target.
- `DATABASE_URL` is the runtime connection string. In deployed environments this is the pooled/pooler-facing path.
- `DIRECT_URL` is the direct migration connection string and is required for production migration traffic.
- Supabase Storage stores uploaded file blobs.
- `FileAsset` rows store file metadata and server-only storage pointers, not file contents. Raw `storagePath` is never a client contract or trust boundary; clients consume derived URLs while privileged reads validate canonical project-owned namespace first.
- Better Auth is the identity authority. Supabase Auth is not used in this project.

## Domain Map

| Domain | Tables | Structural role |
|---|---|---|
| Auth and admin | `User`, `Session`, `Account`, `Verification`, `AdminAuditLog` | Identity, sessions, provider links, verification flows, admin audit trail |
| Workspace and project core | `Workspace`, `WorkspaceMember`, `Project`, `Protocol`, `Draft`, `DraftVersion`, `DraftCheckpoint`, `Study`, `StudyProcessingJob`, `Note`, `FileAsset` | Collaboration scope, project state, draft history/checkpoints, studies, durable study-PDF processing state, notes, file metadata |
| AI chat and telemetry | `AIConversation`, `AIMessage`, `AIUsage`, `ChatUnificationMetric` | Conversation storage, message timeline, token/cost attribution, chat surface telemetry |
| Memory and retrieval | `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`, `MemoryEmbedding` | Durable memory, summarization, retrieval audit trail, vector search |
| Agent runtime | `AgentRun`, `RunEvent`, `RunCheckpoint`, `Artifact`, `AutonomyConfig` | Event-sourced runs, explicit continuation seeds, run lineage, reviewable artifacts, autonomy presets |

## Table Glossary

| Table | Purpose | Main FKs | Important unique/index constraints | Important nullable semantics | Soft delete |
|---|---|---|---|---|---|
| `User` | Primary identity record | None | `email` unique; indexes on `createdAt`, `isPlatformAdmin + createdAt` | `image` optional profile asset | No |
| `AdminAuditLog` | Admin action audit trail | `actorUserId -> User`, `targetUserId -> User` | Indexes on actor/target + `createdAt` | `reason`, `requestId`, `before`, `after` are optional metadata | No |
| `Session` | Better Auth session store | `userId -> User` | `token` unique; indexes on `userId`, `userId + updatedAt` | `ipAddress`, `userAgent` optional | No |
| `Account` | External auth provider link | `userId -> User` | Unique on `providerId + accountId`; index on `userId` | Token fields and `password` are optional provider-specific data | No |
| `Verification` | Verification and magic-link tokens | None | Indexes on `identifier + createdAt`, `expiresAt` | No nullable business fields | No |
| `Workspace` | Top-level collaboration scope | None | No special unique beyond PK | None | No |
| `WorkspaceMember` | User membership in workspace | `workspaceId -> Workspace`, `userId -> User` | Unique on `workspaceId + userId`; index on `userId` | None | No |
| `Project` | Main application hub | `workspaceId -> Workspace`, `ownerId -> User` | Indexes on `workspaceId`, `ownerId`; unique on `ownerId + workspaceId + demoKey` | `demoKey`, `description`, `papers`, `progress`, `projectCopilot` optional | No |
| `Protocol` | Canonical protocol JSON for a project | `projectId -> Project` | `projectId` unique | None | No |
| `Draft` | Current draft state for a project | `projectId -> Project` | `projectId` unique | None | No |
| `DraftVersion` | Versioned draft snapshots by section | `projectId -> Project` | Unique on `projectId + section + version`; indexes on `projectId + section`, `projectId + createdAt` | `contentText`, `artifactId`, `conversationId` optional linkage/context | No |
| `DraftCheckpoint` | Immutable whole-draft authoring-state snapshot for compare/restore and export provenance | `projectId -> Project`, `fileAssetId -> FileAsset`, `artifactId -> Artifact`, `conversationId -> AIConversation` | Indexes on `projectId + createdAt`, `projectId + kind + createdAt`, `workspaceId`, `fileAssetId`, `artifactId`, `conversationId` | `workspaceId` is denormalized optional scope; `label`, `fileAssetId`, `artifactId`, `conversationId` are optional provenance metadata; `snapshot` intentionally excludes transient route/UI state | No |
| `Study` | Study records under a project | `projectId -> Project` | Indexes on `projectId`, `projectId + deletedAt`, `workspaceId` | `workspaceId` is denormalized optional scope; `details`, `deletedAt` optional | `deletedAt` |
| `StudyProcessingJob` | Durable transient workflow state for ledger study PDF quick extraction and deep analysis | `studyId -> Study`, `projectId -> Project`, `fileAssetId -> FileAsset` | Unique on `studyId + phase`; indexes on `projectId + state + priority + requestedAt`, `leaseExpiresAt`, `studyId` | `workspaceId` is denormalized optional scope; `fileAssetId`, `startedAt`, `leaseExpiresAt`, `completedAt`, `lastErrorCode`, `lastErrorMessage` are optional because jobs move through queued/running/terminal states on one mutable row per phase | No |
| `FileAsset` | File metadata and server-owned storage pointer | `projectId -> Project`, `studyId -> Study` | Indexes on `projectId`, `workspaceId`, `studyId` | `workspaceId` denormalized optional scope; `studyId`, `format`, `publicUrl`, `metadata` optional. `storagePath` is internal metadata and must not be exposed as a client URL or accepted from client-authored input | No |
| `AIConversation` | Chat container for global/project/study contexts | `projectId -> Project` | Indexes on `userId + context`, `userId + projectId`, `workspaceId`, `workspaceId + context`, `projectId`, `studyId`, `context` | `userId`, `workspaceId`, `title`, `page`, `projectId`, `studyId` are optional to support global and scoped chats | No |
| `AIMessage` | Ordered messages within a conversation | `conversationId -> AIConversation` | Indexes on `conversationId`, `conversationId + createdAt + id` | `toolCalls`, `toolResultId`, `attachments` optional for tool/attachment flows | No |
| `AIUsage` | Token/cost attribution records | `conversationId -> AIConversation`, `projectId -> Project` | Indexes on user/workspace/project/conversation/source/contextPage + `createdAt` | `userId`, `workspaceId`, `projectId`, `conversationId` are optional because attribution can vary by surface/context | No |
| `UserMemory` | User-level preferences and workflow memory | `userId -> User` | Unique on `userId + key`; indexes on `userId + status`, `userId + type`, `userId + pinned` | `rationale`, `archivedAt` optional | No |
| `ProjectMemory` | Project-level goals, criteria, definitions, decisions | `projectId -> Project` | Indexes on `projectId + status`, `projectId + type`, `projectId + importance`, `projectId + pinned` | `category`, `rationale`, `context`, `supersededBy`, `archivedAt` optional | No |
| `StudyMemory` | Study-level extracted facts and summaries | `studyId -> Study`, `projectId -> Project` | Indexes on `studyId + type`, `projectId + type`, `studyId + status`, `projectId + pinned` | `category`, `source`, `confidence` optional | No |
| `ConversationSummary` | Compressed summary of a long conversation | `conversationId -> AIConversation` | `conversationId` unique; index on `conversationId` | None | No |
| `MemoryRetrieval` | Audit trail of memory retrieval attempts | `projectId -> Project` | Indexes on `conversationId`, `projectId`, `createdAt` | `conversationId`, `userId`, `projectId` optional because retrieval can happen in different scopes | No |
| `MemoryEmbedding` | Vector index backing semantic memory retrieval | `projectId -> Project` | Unique on `memoryType + memoryId + model`; indexes on `projectId + memoryType`, `userId + memoryType`, `studyId + memoryType` | `userId`, `projectId`, `studyId` optional because embeddings can belong to different memory scopes | No |
| `AgentRun` | Top-level agent execution trace | `projectId -> Project`, `parentRunId -> AgentRun` | Indexes on `projectId + startedAt`, `conversationId`, `conversationId + startedAt`, `conversationId + lastActivityAt`, `conversationId + lastDurableProgressAt`, `userId`, `parentRunId + startedAt`, `rootRunId + startedAt` | `projectId`, `conversationId`, `userId`, `parentRunId`, `rootRunId`, `model`, `completedAt` are intentionally nullable; `runPhase` is the coarse persisted lifecycle phase (`plan | ask | act | verify | finalize`) and `phaseEnteredAt` records when that phase became authoritative; `lastActivityAt` tracks liveness, `lastDurableProgressAt` tracks recovery-authoritative forward progress, `finalizationState` records durable finalize truth, `durabilityState` and `durabilityDegradedReason` record whether recovery-critical persistence remains trustworthy, and `abnormalEndClassification` records the latest known abnormal exit class | No |
| `RunEvent` | Event stream within a run | `runId -> AgentRun` | Unique on `runId + sequence`; indexes on `runId + sequence`, `runId + type`, `artifactId` | Tool/artifact/error/timing fields are optional because event payloads vary by type | No |
| `RunCheckpoint` | Explicit reusable continuation seed at a proven-safe durable boundary | `runId -> AgentRun` | Unique on `runId + sourceEventSequence`; indexes on `runId + status + sourceEventSequence`, `conversationId + status + sourceEventSequence`, `sourceArtifactId` | `sourceArtifactId` and `invalidatedReason` are optional because only artifact-backed checkpoints reference artifact rows directly and invalidation is source-drift driven; `seed` stores only the continuation inputs needed for the next validated server step | No |
| `ChatUnificationMetric` | Chat-surface telemetry event record | `projectId -> Project` | `eventId` unique; indexes on `recordedAt`, `type + recordedAt`, `surface + recordedAt`, workspace/run/conversation/project + `recordedAt` | `userId`, `workspaceId`, `projectId`, `runId`, `conversationId`, `clientTimestamp` optional; anonymous home/auth operational telemetry may legitimately store null identity while scoped product telemetry should keep actor attribution when available | No |
| `Artifact` | Reviewable outputs produced by agent runs | `runId -> AgentRun`, `projectId -> Project` | `applyId` unique; indexes on `runId`, `projectId + status`, `conversationId`, `type + status` | `projectId`, `conversationId`, `userId`, snapshot/review/apply fields optional because artifacts can be proposed before acceptance/application | No |
| `AutonomyConfig` | Autonomy preset and tool override config | `projectId -> Project` | Unique on `userId + projectId`; indexes on `userId`, `projectId` | `userId`, `projectId` optional to support global and project-scoped config | No |
| `Note` | Rich project notes | `projectId -> Project` | Indexes on `projectId`, `projectId + deletedAt`, `projectId + source` | `userId`, `title`, `contentText`, `linkedStudyId`, `linkedSection`, source linkage fields, `deletedAt` optional | `deletedAt` |

## Core Invariants

- `Project` is the main application hub. Most DB-domain features eventually attach to project scope.
- `FileAsset` stores metadata and storage paths only. Blob storage lives in Supabase Storage, and app-layer ownership validation must treat `storagePath` as server-owned internal metadata rather than a client-controlled locator.
- `StudyProcessingJob` is owned by ledger study PDF processing only. It is not a generic background-job framework.
- Each `(studyId, phase)` uses one mutable row with the lifecycle `queued -> running -> succeeded|failed`.
- Page-focus priority upgrades may mutate an existing queued/running background job, but they must never create a new job row by themselves.
- `RunEvent` must remain unique on `(runId, sequence)`. Sequence repair is an operational concern documented in `docs/runbooks/db-ops.md`.
- `RunCheckpoint` is continuation authority only. It must not replace `RunEvent` as the audit or replay log, and it must never become a sink for transient runtime facts.
- `AgentRun.lastActivityAt` is the authoritative liveness field for `running` runs. Admission/recovery logic should not fall back to `startedAt` freshness once the field exists.
- `AgentRun.runPhase` is the coarse persisted lifecycle authority for recovery/readmission/UI consumers. It is intentionally macro-level and does not replace existing event, checkpoint, durability, or finalization truth.
- `AgentRun.phaseEnteredAt` records when the current coarse lifecycle phase became authoritative and must change only on real phase transitions, not on heartbeat refreshes or same-phase writes.
- `AgentRun.lastDurableProgressAt` is the authoritative durable-progress field for convergence decisions; a fresh heartbeat alone must not imply the run is still making forward recovery-authoritative progress.
- `AgentRun.finalizationState` makes finalize truth explicit (`not_started`, `in_progress`, `completed`, `failed`) so readmission and recovery do not guess from `status` alone.
- `AgentRun.durabilityState` records whether recovery-critical persisted truth is still trustworthy for a run (`durable` vs `degraded`); if it is degraded, `durabilityDegradedReason` must preserve the durable reason rather than leaving recovery to infer a clean state.
- `AgentRun.abnormalEndClassification` stores the latest durable explanation for abnormal exits and must be treated as runtime truth rather than UI-only telemetry.
- `RunCheckpoint` may exist only when the source durable state and source event were committed together as one authoritative boundary. Invalidating a checkpoint is for later source drift only; it must not be used to paper over partial writes.
- `MemoryEmbedding` depends on the `vector` extension and the embedding index path documented in the DB ops docs.
- `Study.deletedAt` and `Note.deletedAt` are soft-delete markers, not archival tables.
- Nullable `projectId` in runtime-oriented tables such as `AgentRun`, `Artifact`, and attribution tables is intentional and supports global or not-yet-project-bound flows.
- Workspace/user scoping columns are part of the multi-user-ready schema shape and should only be changed with explicit intent.
- Better Auth owns identity/session semantics. Do not model Supabase Auth as a source of truth in DB changes.

## Critical Indexes: Structural Context

These indexes protect major runtime paths. The operational gate owner and verification source of truth remains `docs/runbooks/db-ops.md`.

| Index | Runtime path protected |
|---|---|
| `AIMessage_conversationId_createdAt_id_idx` | Stable conversation timeline pagination and cursor loading |
| `UserMemory_userId_pinned_idx` | Fast pinned user-memory retrieval |
| `ProjectMemory_projectId_pinned_idx` | Fast pinned project-memory retrieval |
| `StudyMemory_projectId_pinned_idx` | Fast pinned study-memory retrieval within project scope |
| `MemoryEmbedding_embedding_hnsw_idx` | Vector similarity retrieval performance |
| `AgentRun_parentRunId_startedAt_idx` | Child-run lineage lookups |
| `AgentRun_rootRunId_startedAt_idx` | Root-run trace aggregation |
| `AgentRun_conversationId_startedAt_idx` | Conversation-linked run history queries |
| `AgentRun_conversationId_lastActivityAt_idx` | Active-run freshness checks and recovery admission |
| `AgentRun_conversationId_lastDurableProgressAt_idx` | Durable-progress checks for stalled-run convergence |

## Migration Themes

- Core app foundation: initial workspace/project/protocol/draft/study/file schema.
- Memory and embeddings: pgvector support, memory tables, retrieval audit, summaries, and memory lifecycle metadata.
- Draft history: section-scoped draft versioning.
- Draft checkpoints: immutable whole-draft authoring-state snapshots with export/file provenance.
- Study PDF processing: durable per-study per-phase queue/lease state via `StudyProcessingJob`.
- Project FK hardening: project relations added across AI, memory, and runtime tables.
- Auth foundation: Better Auth session/account/verification support plus later auth/admin indexes.
- Agent runtime hardening: run lineage fields, uniqueness guarantees, and runtime-supporting indexes.
- Wave/core cleanup: soft-delete and text-search support for notes and studies.
- Telemetry and admin: chat unification metrics, platform admin flag, and admin audit log.
- Latest project-keying tweaks: `demoKey` support on `Project`.

## Safe Schema Change Checklist

1. Update `next-app/prisma/schema.prisma`.
2. Add a migration under `next-app/prisma/migrations/`.
3. Evaluate nullability, backfill, and data-cleanup needs before finalizing the migration.
4. Evaluate production drift risk before code ships against new schema.
5. Update `docs/runbooks/db-architecture.md` and any affected DB ops/runbook docs in the same task.
6. Never edit applied migration SQL.

## Related Docs

- `docs/runbooks/db-ops.md` — operational diagnosis, migration state, connectivity, and repair
- `docs/plans/db-production-runbook.md` — production migration/release/remediation procedure
- `docs/plans/plan-backend.md` — broader backend and infrastructure context
