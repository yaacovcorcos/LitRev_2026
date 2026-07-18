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
- `FileAsset` rows store file metadata and server-only storage pointers, not file contents. Raw `storagePath` is never a client contract or trust boundary; clients consume derived URLs while privileged reads validate canonical project-owned namespace first. User-uploaded study files must be validated on the server before blob storage, and persisted MIME metadata must come from the server's validated file type rather than caller-provided content metadata.
- Better Auth is the identity authority. Supabase Auth is not used in this project.

## Domain Map

| Domain | Tables | Structural role |
|---|---|---|
| Auth and admin | `User`, `Session`, `Account`, `Verification`, `AdminAuditLog` | Identity, sessions, provider links, verification flows, admin audit trail |
| Workspace and project core | `Workspace`, `WorkspaceMember`, `Project`, `Protocol`, `Draft`, `DraftVersion`, `DraftCheckpoint`, `Study`, `StudyProcessingJob`, `Note`, `FileAsset` | Collaboration scope, project state, draft history/checkpoints, studies, durable study-PDF processing state, notes, file metadata |
| AI chat and telemetry | `AIConversation`, `AIMessage`, `AIUsageReservation`, `AIUsage`, `SearchProviderThrottle`, `ChatUnificationMetric` | Conversation storage, message timeline, durable provider-attempt quota admission, cross-instance search-provider pacing, token/cost attribution, chat surface telemetry |
| Memory and retrieval | `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`, `MemoryRetrievalItem`, `MemoryEmbedding` | Durable memory, summarization, item-level retrieval audit trail, vector search |
| Agent runtime | `AgentRun`, `RunEvent`, `RunCheckpoint`, `ToolIdempotencyRecord`, `DecisionRequestRecord`, `DecisionResolutionRecord`, `Artifact`, `AutonomyConfig` | Event-sourced runs, explicit continuation seeds, run lineage, durable mutating-tool receipts, first-class user decision requests/resolutions, reviewable artifacts, autonomy presets |

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
| `Project` | Main application hub | `workspaceId -> Workspace`, `ownerId -> User` | Indexes on `workspaceId`, `ownerId`; unique on `ownerId + workspaceId + demoKey` | `demoKey`, `description`, `papers`, `progress`, `projectConversation` optional | No |
| `Protocol` | Canonical protocol JSON for a project | `projectId -> Project` | `projectId` unique | None | No |
| `Draft` | Current draft state for a project | `projectId -> Project` | `projectId` unique | None | No |
| `DraftVersion` | Versioned draft snapshots by section | `projectId -> Project` | Unique on `projectId + section + version`; indexes on `projectId + section`, `projectId + createdAt` | `contentText`, `artifactId`, `conversationId` optional linkage/context | No |
| `DraftCheckpoint` | Immutable whole-draft authoring-state snapshot for compare/restore and export provenance | `projectId -> Project`, `fileAssetId -> FileAsset`, `artifactId -> Artifact`, `conversationId -> AIConversation` | Indexes on `projectId + createdAt`, `projectId + kind + createdAt`, `workspaceId`, `fileAssetId`, `artifactId`, `conversationId` | `workspaceId` is denormalized optional scope; `label`, `fileAssetId`, `artifactId`, `conversationId` are optional provenance metadata; `snapshot` intentionally excludes transient route/UI state | No |
| `Study` | Study records under a project | `projectId -> Project` | Indexes on `projectId`, `projectId + deletedAt`, `workspaceId` | `workspaceId` is denormalized optional scope; `details`, `deletedAt` optional | `deletedAt` |
| `StudyProcessingJob` | Durable transient workflow state for ledger study PDF quick extraction and deep analysis | `studyId -> Study`, `projectId -> Project`, `fileAssetId -> FileAsset` | Unique on `studyId + phase`; indexes on `projectId + state + priority + requestedAt`, `leaseExpiresAt`, `studyId` | `workspaceId` is denormalized optional scope; `fileAssetId`, `startedAt`, `leaseExpiresAt`, `completedAt`, `lastErrorCode`, `lastErrorMessage` are optional because jobs move through queued/running/terminal states on one mutable row per phase | No |
| `FileAsset` | File metadata and server-owned storage pointer | `projectId -> Project`, `studyId -> Study` | Indexes on `projectId`, `workspaceId`, `studyId` | `workspaceId` denormalized optional scope; `studyId`, `format`, `publicUrl`, `metadata` optional. `storagePath` is internal metadata and must not be exposed as a client URL or accepted from client-authored input; `publicUrl` is reserved for explicit external/demo or future true public/share surfaces rather than canonical tenant-scoped file delivery | No |
| `AIConversation` | Chat container for global/project/study contexts | `projectId -> Project` | Indexes on `userId + context`, `userId + projectId`, `workspaceId`, `workspaceId + context`, `projectId`, `studyId`, `context` | `userId`, `workspaceId`, `title`, `page`, `projectId`, `studyId` are optional to support global and scoped chats | No |
| `AIMessage` | Ordered messages within a conversation | `conversationId -> AIConversation` | Indexes on `conversationId`, `conversationId + createdAt + id` | `toolCalls`, `toolResultId`, `attachments` optional for tool/attachment flows | No |
| `AIUsageReservation` | Durable quota reservation and reconciliation state for one provider attempt | Referenced by optional `AIUsage.reservationId`; scope IDs are intentionally denormalized so billing evidence survives scope deletion | Unique `attemptKey`; indexes on scope/time, scope/status/time, status/update time, and conversation/time | Scope and conversation fields may be null for global calls; actual token/model and settlement fields stay null until authoritative usage is known | No |
| `AIUsage` | Settled token, routing, cache, and estimated-cost attribution records | `conversationId -> AIConversation`, `projectId -> Project`, optional `reservationId -> AIUsageReservation` | `reservationId` unique; indexes on user/workspace/project/conversation/source/contextPage + `createdAt` | `reservationId` is null for legacy/non-provider accounting; scope FKs and provider-observed routing fields are optional; cache-hit and cache-write input are separate counters; `estimatedCostUsd` requires known provider-host and delivery-tier provenance and remains an estimate, not an invoice | No |
| `SearchProviderThrottle` | Durable reservation cursor for pacing PubMed, OpenAlex, and Semantic Scholar calls across server instances | None | `providerKey` primary key | No nullable fields; provider keys contain provider identity plus a hash of any credential scope, never a raw key/email | No |
| `UserMemory` | User-level preferences and workflow memory | `userId -> User` | Unique on `userId + key`; indexes on `userId + status`, `userId + type`, `userId + pinned`, `userId + authority + status`, `userId + embeddingStatus` | `rationale`, source reference fields, `lastUsedAt`, `archivedAt` optional | No |
| `ProjectMemory` | Project-level goals, criteria, definitions, decisions | `projectId -> Project` | Indexes on `projectId + status`, `projectId + type`, `projectId + importance`, `projectId + importanceRank`, `projectId + pinned`, `projectId + key`, `projectId + authority + status`, `projectId + source`, `projectId + embeddingStatus` | `key`, `category`, `rationale`, `context`, source reference fields, `lastUsedAt`, `supersededBy`, `archivedAt` optional | No |
| `StudyMemory` | Study-level extracted facts and summaries | `studyId -> Study`, `projectId -> Project` | Indexes on `studyId + type`, `projectId + type`, `studyId + status`, `projectId + pinned`, `projectId + key`, `projectId + authority + status`, `projectId + source`, `projectId + embeddingStatus` | `key`, `category`, `source`, source reference fields, `locator`, `confidence`, `lastUsedAt`, `archivedAt` optional | No |
| `ConversationSummary` | Compressed summary of a long conversation | `conversationId -> AIConversation` | `conversationId` unique; index on `conversationId` | None | No |
| `MemoryRetrieval` | Parent audit record for memory retrieval attempts | `projectId -> Project` | Indexes on `conversationId`, `projectId`, `createdAt` | `conversationId`, `userId`, `projectId` optional because retrieval can happen in different scopes; `memoryIds` is a compact rollup, while item details live in `MemoryRetrievalItem` | No |
| `MemoryRetrievalItem` | Per-memory retrieval audit rows with rank, score components, trust metadata, and answer-use flag | `retrievalId -> MemoryRetrieval` | Indexes on `retrievalId`, `memoryType + memoryId`, `source`, `authority` | `lexicalScore`, `semanticScore`, `source`, `authority` optional because deterministic or legacy retrieval rows may not have all score/trust dimensions | No |
| `MemoryEmbedding` | Vector index backing semantic memory retrieval | `projectId -> Project` | Unique on `memoryType + memoryId + model`; indexes on `projectId + memoryType`, `userId + memoryType`, `studyId + memoryType` | `userId`, `projectId`, `studyId` optional because embeddings can belong to different memory scopes | No |
| `AgentRun` | Top-level agent execution trace with requested and provider-observed generation routing | `projectId -> Project`, `parentRunId -> AgentRun` | Indexes on project/conversation/user/lineage lifecycle fields plus `memoryExtractionStatus + memoryExtractionLeaseExpiresAt` | Scope, lineage, completion, memory-extraction lease/completion/error, and provider-observed fields are intentionally nullable; requested routing, lifecycle, durability, finalization, abnormal exits, and durable `pending | processing | succeeded | skipped | failed` conversation-memory extraction state retain separate authority | No |
| `RunEvent` | Event stream within a run | `runId -> AgentRun` | Unique on `runId + sequence`; indexes on `runId + sequence`, `runId + type`, `artifactId` | Tool/artifact/error/timing fields are optional because event payloads vary by type | No |
| `RunCheckpoint` | Explicit reusable continuation seed at a proven-safe durable boundary | `runId -> AgentRun` | Unique on `runId + sourceEventSequence`; indexes on `runId + status + sourceEventSequence`, `conversationId + status + sourceEventSequence`, `sourceArtifactId` | `sourceArtifactId` and `invalidatedReason` are optional because only artifact-backed checkpoints reference artifact rows directly and invalidation is source-drift driven; `seed` stores only the continuation inputs needed for the next validated server step | No |
| `ToolIdempotencyRecord` | Durable mutating-tool receipt for retry/continuation replay | `runId -> AgentRun` | Unique on `scopeKey + toolName + fingerprint`; indexes on `scopeKey + createdAt`, `runId`, `projectId`, `userId` | `callId`, `runId`, project/user/study scope fields, `result`, and `completedAt` are optional because a receipt is first reserved as `running` before the tool result is known; `scopeKey` is the root run lineage key, not the current retry run | No |
| `DecisionRequestRecord` | Canonical persisted `ask_user` decision request | `sourceRunId -> AgentRun` | Unique on `sourceRunId + callId`; indexes on `conversationId + status + createdAt`, `rootRunId + createdAt`, `projectId + status + createdAt`, `decisionBoundaryKey + status` | Scope columns are nullable for global/unscoped chats; `resolvedAt` is null while pending; `request` stores the canonical decision request plus legacy transport mirror | No |
| `DecisionResolutionRecord` | Canonical persisted answer/default/cancel decision resolution | `requestId -> DecisionRequestRecord` | `requestId` unique; indexes on `sourceRunId + createdAt`, `callId` | `userId` is optional because some resolutions may be runtime defaults or legacy imported events; `resolution` stores structured answers and resolution kind | No |
| `ChatUnificationMetric` | Chat-surface telemetry event record | `projectId -> Project` | `eventId` unique; indexes on `recordedAt`, `type + recordedAt`, `surface + recordedAt`, workspace/run/conversation/project + `recordedAt` | `userId`, `workspaceId`, `projectId`, `runId`, `conversationId`, `clientTimestamp` optional; anonymous home/auth operational telemetry may legitimately store null identity while scoped product telemetry should keep actor attribution when available | No |
| `Artifact` | Reviewable outputs produced by agent runs | `runId -> AgentRun`, `projectId -> Project` | `applyId` unique; indexes on `runId`, `projectId + status`, `conversationId`, `type + status` | `projectId`, `conversationId`, `userId`, snapshot/review/apply fields optional because artifacts can be proposed before acceptance/application | No |
| `AutonomyConfig` | Autonomy preset and tool override config | `projectId -> Project` | Unique on `userId + projectId`; indexes on `userId`, `projectId` | `userId`, `projectId` optional to support global and project-scoped config | No |
| `Note` | Rich project notes | `projectId -> Project` | Indexes on `projectId`, `projectId + deletedAt`, `projectId + source` | `userId`, `title`, `contentText`, `linkedStudyId`, `linkedSection`, source linkage fields, `deletedAt` optional | `deletedAt` |

## Core Invariants

- `Project` is the main application hub. Most DB-domain features eventually attach to project scope.
- `FileAsset` stores metadata and storage paths only. Blob storage lives in Supabase Storage, and app-layer ownership validation must treat `storagePath` as server-owned internal metadata rather than a client-controlled locator.
- Canonical tenant-scoped `FileAsset` delivery stays behind authenticated app-owned routes and a private storage bucket. Direct public object URLs are not a valid delivery contract for project, study, export, or attachment files. Download routes should default to attachment/no-sniff behavior unless a dedicated preview path deliberately constrains inline rendering.
- `StudyProcessingJob` is owned by ledger study PDF processing only. It is not a generic background-job framework.
- Each `(studyId, phase)` uses one mutable row with the lifecycle `queued -> running -> succeeded|failed`.
- A worker may mutate or settle an active `StudyProcessingJob` only while its claimed `startedAt` value still matches. Expired-lease takeover must assign a new `startedAt` atomically so a stale worker cannot overwrite the new owner's terminal state.
- Page-focus priority upgrades may mutate an existing queued/running background job, but they must never create a new job row by themselves.
- Every chat or voice-transcription provider attempt, including a retry, must first create one `AIUsageReservation` under a transaction-scoped advisory lock for its effective user/workspace or legacy project/global scope. The server-generated unique `attemptKey` makes uncertain admission outcomes replay-safe: admission-only retries reuse it, while any retry after provider invocation uses a new key. Admission counts reservation rows across sources against the shared minute cap and conservatively counts all non-settled reserved tokens against the daily cap.
- `AIUsageReservation.status = "active" | "failed" | "unknown"` remains quota-bearing and reconcilable. Only an idempotent settlement transaction may create the unique linked `AIUsage` row and change the reservation to `settled`; settlement failure must not erase the reservation or retroactively fail a delivered answer.
- Provider calls must fail closed before invocation when reservation admission cannot complete within its bounded database deadline. Post-provider settlement is also bounded; a deferred retry is safe only because the pre-provider reservation is already durable.
- External search calls reserve their provider/credential-scoped slot atomically through `SearchProviderThrottle` before network I/O. A 429 `Retry-After` advances the same shared cursor, so parallel server instances cannot bypass local pacing or immediately retry through a provider cooldown; raw provider credentials must never be persisted in the key. Reservation admission has a bounded future horizon so a request burst cannot push the cursor arbitrarily far ahead after callers time out.
- `RunEvent` must remain unique on `(runId, sequence)`. Sequence repair is an operational concern documented in `docs/runbooks/db-ops.md`.
- `RunEvent.sequence` allocation is serialized inside the event-create transaction by a per-run advisory lock. Runtime code must not return to unguarded `max(sequence) + 1` allocation without an equivalent serialization mechanism.
- `RunCheckpoint` is continuation authority only. It must not replace `RunEvent` as the audit or replay log, and it must never become a sink for transient runtime facts.
- `ToolIdempotencyRecord` is the durable replay receipt for mutating tools inside one root run lineage. A retry or continuation with the same `scopeKey`, tool name, and request fingerprint must replay a completed result or stop on an unresolved `running` receipt instead of executing the same side effect twice.
- `ToolIdempotencyRecord.status = "running"` is a reservation, not a permanent lock. Returned, thrown, and aborted executor failures should release the reservation through middleware cleanup; stale-running takeover is reserved for crash/process-death recovery.
- `AgentRun.lastActivityAt` is the authoritative liveness field for `running` runs. Admission/recovery logic should not fall back to `startedAt` freshness once the field exists, and event writability checks must not update the run row merely to prove ownership.
- `AgentRun.runPhase` is the coarse persisted lifecycle authority for recovery/readmission/UI consumers. It is intentionally macro-level and does not replace existing event, checkpoint, durability, or finalization truth.
- `AgentRun.runPhase` transitions are owned by the shared runtime state machine. Continuation runs may legally move `verify -> plan` when the next safe step is to re-plan from persisted durable state.
- `AgentRun.phaseEnteredAt` records when the current coarse lifecycle phase became authoritative and must change only on real phase transitions, not on heartbeat refreshes or same-phase writes.
- `AgentRun.lastDurableProgressAt` is the authoritative durable-progress field for convergence decisions; a fresh heartbeat alone must not imply the run is still making forward recovery-authoritative progress.
- `AgentRun.finalizationState` makes finalize truth explicit (`not_started`, `in_progress`, `completed`, `failed`) so readmission and recovery do not guess from `status` alone.
- `AgentRun.durabilityState` records whether recovery-critical persisted truth is still trustworthy for a run (`durable` vs `degraded`); if it is degraded, `durabilityDegradedReason` must preserve the durable reason rather than leaving recovery to infer a clean state.
- `AgentRun.abnormalEndClassification` stores the latest durable explanation for abnormal exits and must be treated as runtime truth rather than UI-only telemetry.
- Successful scoped run finalization must set `AgentRun.memoryExtractionStatus = "pending"` in the same transaction as terminal run truth. Extraction claims increment attempts and install a random expiring lease token; only the matching token may settle `succeeded`, `skipped`, or `failed`, while expired `processing` and bounded `failed` rows remain eligible for later-run backlog recovery. An expired claim at the attempt cap must be terminalized as `failed` with its lease cleared, not left permanently `processing`. Request-scoped `after()` is an accelerator, never the durability boundary.
- `AgentRun.model`, `provider`, `reasoningEffort`, and `deliveryMode` record the validated requested generation route. `actualModel`, `actualProvider`, `actualReasoningEffort`, and `actualDeliveryMode` are reserved for fields explicitly observed in provider responses; current adapters leave `actualReasoningEffort` null because they do not receive an accepted-effort echo. Recovery may fall back to requested metadata only when no provider model was observed, and it must label that source honestly.
- `AIUsage.model` is the provider-observed model when available. Requested routing remains in the dedicated `requested*` columns, and cache-hit, cache-write, and reasoning token counts must not be inferred from totals. `cachedInputTokens` and `cacheWriteInputTokens` are disjoint subsets of `inputTokens`; inconsistent provider breakdowns fail cost estimation instead of producing a misleading value. `estimatedCostUsd` uses dated token prices, known long-context tiers, provider-reported cache writes, and provider-confirmed delivery tiers; it remains null when a requested paid tier lacks an accepted-tier receipt, for OpenAI priority, and when a gateway host is unknown. It does not include hosted tool/search fees, taxes, retries, or cache writes whose token count the provider does not report.
- `RunCheckpoint` may exist only when the source durable state and source event were committed together as one authoritative boundary. Invalidating a checkpoint is for later source drift only; it must not be used to paper over partial writes.
- `DecisionRequestRecord` is the canonical durable state for pending `ask_user` requests. `user_input_required` run events remain transcript/replay mirrors, and legacy runs without decision rows must still resolve through the run-event fallback.
- `DecisionResolutionRecord` is the canonical durable state for structured user answers, accepted recommendations, and cancellations. It is unique per decision request so replayed or retried resolution handling cannot create divergent answers for the same `sourceRunId + callId`.
- Memory rows carry explicit trust metadata. `source` is normalized by the application contract, `authority` is one of `canonical | confirmed | inferred | proposed`, and `polarity` is one of `affirming | rejecting | neutral`. Protocol-synced project memories are canonical, accepted artifacts and explicit user edits are confirmed, and conversation extraction/deep analysis memories are inferred unless later confirmed.
- `ProjectMemory.key` and `StudyMemory.key` are stable semantic identifiers when the source can provide one. Protocol sync uses `protocol:*` keys and should revise by key rather than accumulating duplicate active protocol rows.
- `ProjectMemory` revision creates a new row and marks the prior row `revised` with `supersededBy`; callers should not mutate an accepted decision in place when the historical decision matters.
- Archive, delete, and maintenance paths for memory rows must purge corresponding `MemoryEmbedding` rows before making the source memory inactive. `embeddingStatus` records whether a memory is waiting for embedding, ready, or failed.
- Request-time semantic retrieval must not opportunistically embed the whole corpus by default. Embeddings are warmed by explicit rollout/warmup paths or by an explicitly enabled backfill mode.
- Study memories are project-scoped. Runtime retrieval that cites study IDs must first prove project access and must not retrieve arbitrary study memory without a project scope.
- `MemoryRetrievalItem` is the detailed audit source for what was retrieved, why it ranked where it did, and whether it was later marked used in an answer.
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
| `AIUsageReservation_scopeKey_createdAt_idx` | Serialized per-scope minute admission and request counting |
| `AIUsageReservation_scopeKey_status_createdAt_idx` | Outstanding daily-token reservation aggregation and reconciliation inspection |
| `AIUsageReservation_attemptKey_key` | Replay-safe admission after ambiguous transaction outcomes |
| `AIUsage_reservationId_key` | Exactly-once conversion of a reservation into settled usage |
| `UserMemory_userId_pinned_idx` | Fast pinned user-memory retrieval |
| `UserMemory_userId_authority_status_idx` | Trust-filtered user-memory retrieval |
| `UserMemory_userId_embeddingStatus_idx` | User-memory embedding lifecycle scans |
| `ProjectMemory_projectId_pinned_idx` | Fast pinned project-memory retrieval |
| `ProjectMemory_projectId_importanceRank_idx` | Stable deterministic project-memory ordering by importance |
| `ProjectMemory_projectId_key_idx` | Stable-key lookup for protocol sync and version history |
| `ProjectMemory_projectId_authority_status_idx` | Trust-filtered project-memory retrieval |
| `ProjectMemory_projectId_source_idx` | Source/provenance filtering for project memory |
| `ProjectMemory_projectId_embeddingStatus_idx` | Project-memory embedding lifecycle scans |
| `StudyMemory_projectId_pinned_idx` | Fast pinned study-memory retrieval within project scope |
| `StudyMemory_projectId_key_idx` | Stable-key lookup for study-level extracted memory |
| `StudyMemory_projectId_authority_status_idx` | Trust-filtered study-memory retrieval |
| `StudyMemory_projectId_source_idx` | Source/provenance filtering for study memory |
| `StudyMemory_projectId_embeddingStatus_idx` | Study-memory embedding lifecycle scans |
| `MemoryRetrievalItem_retrievalId_idx` | Per-retrieval item audit hydration |
| `MemoryRetrievalItem_memoryType_memoryId_idx` | Memory-use audit lookup by source memory |
| `MemoryRetrievalItem_source_idx` | Retrieval audit filtering by memory provenance |
| `MemoryRetrievalItem_authority_idx` | Retrieval audit filtering by trust authority |
| `MemoryEmbedding_embedding_hnsw_idx` | Vector similarity retrieval performance |
| `AgentRun_parentRunId_startedAt_idx` | Child-run lineage lookups |
| `AgentRun_rootRunId_startedAt_idx` | Root-run trace aggregation |
| `AgentRun_conversationId_startedAt_idx` | Conversation-linked run history queries |
| `AgentRun_conversationId_lastActivityAt_idx` | Active-run freshness checks and recovery admission |
| `AgentRun_conversationId_lastDurableProgressAt_idx` | Durable-progress checks for stalled-run convergence |
| `AgentRun_memoryExtractionStatus_leaseExpiry_idx` | Pending/failed conversation-memory backlog scans and expired processing-lease recovery |
| `ToolIdempotencyRecord_scopeKey_toolName_fingerprint_key` | Retry/continuation dedupe for mutating tools within one root run lineage |
| `ToolIdempotencyRecord_scopeKey_createdAt_idx` | Lineage-scoped receipt inspection and cleanup |
| `DecisionRequestRecord_sourceRunId_callId_key` | Request-bound clarification lookup by source run and tool call |
| `DecisionRequestRecord_conversationId_status_createdAt_idx` | Pending decision hydration for conversation surfaces |
| `DecisionResolutionRecord_requestId_key` | One canonical resolution per decision request |

## Migration Themes

- Core app foundation: initial workspace/project/protocol/draft/study/file schema.
- Memory and embeddings: pgvector support, memory tables, retrieval audit, per-item retrieval audit, trust/provenance metadata, summaries, and memory lifecycle metadata.
- Draft history: section-scoped draft versioning.
- Draft checkpoints: immutable whole-draft authoring-state snapshots with export/file provenance.
- Study PDF processing: durable per-study per-phase queue/lease state via `StudyProcessingJob`.
- Project FK hardening: project relations added across AI, memory, and runtime tables.
- Auth foundation: Better Auth session/account/verification support plus later auth/admin indexes.
- Agent runtime hardening: run lineage fields, mutating-tool idempotency receipts, first-class decision request/resolution persistence, uniqueness guarantees, and runtime-supporting indexes.
- Conversation-memory extraction durability: run-owned pending/processing/terminal markers, fenced expiring leases, bounded retry attempts, and backlog recovery at later run boundaries.
- Wave/core cleanup: soft-delete and text-search support for notes and studies.
- Telemetry and admin: chat unification metrics, platform admin flag, and admin audit log.
- Provider usage admission: durable per-attempt reservations, conservative outstanding-token accounting, and unique idempotent settlement into `AIUsage`.
- Search-provider reliability: durable per-provider/hashed-credential reservation cursors replace process-local throttles and propagate upstream cooldowns across instances.
- AI routing and cost attribution: requested/actual model-provider-effort-delivery receipts on `AgentRun`, plus separate cache-hit/cache-write input, reasoning tokens, and tier-aware estimated USD cost on `AIUsage`.
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
