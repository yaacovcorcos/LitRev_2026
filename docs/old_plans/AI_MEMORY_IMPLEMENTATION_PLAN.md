# [ARCHIVED]
> **Note:** This file is obsolete. Active plans have moved to `docs/plans/README.md`.

# AI Memory Implementation Plan (Current)

Last updated: 2026-02-20

This document is the memory-specific execution plan.
For cross-cutting project tracking, keep `planB` in sync.

## Objective

Improve AI memory in this order:
1. Correctness and trust of proposal/apply behavior.
2. Retrieval quality and ranking precision.
3. Memory lifecycle, maintenance, and observability.

## Locked Design Decisions (Approved)

1. Contradictions require user confirmation by default.
- Deterministic contradiction:
  - Same scope + same normalized key/category + different value.
  - Behavior:
    - If current user turn explicitly says to change/update/replace, treat new value as intended replacement (still proposal-first).
    - Otherwise ask user to resolve conflict before superseding old memory.
- Semantic contradiction:
  - Opposing statements with different wording (for example inclusion vs exclusion inversion).
  - Behavior:
    - Mark as potential conflict and ask user to resolve.
    - Do not auto-overwrite existing active memory on low-confidence conflict detection.
- Resolution outcome:
  - On user confirmation, apply new memory and archive/supersede conflicting prior memory while preserving audit trail.

2. Relevance decay is utility-based, not time-based.
- No day/time half-life decay in ranking.
- Utility signals drive ranking and maintenance:
  - `retrievalCount`
  - `usedInAnswerCount`
  - `acceptedCount`
  - `rejectedCount`
  - `contradictionCount`
  - `pinned` flag
- Archive candidates are selected from low-utility memories after enough retrieval opportunities, never solely by age.

3. Hybrid semantic retrieval uses Postgres + pgvector.
- Keep Postgres as the single data store.
- Add pgvector for embedding similarity search.
- Use hybrid fusion:
  - deterministic includes (existing rules)
  - Postgres lexical/full-text ranking
  - pgvector cosine similarity
  - utility-based boosts/penalties

## Current State (Already Implemented)

- Structured memory storage exists:
  - `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval`.
  - Schema: `next-app/prisma/schema.prisma`.
- Memory proposal path exists:
  - Tool: `next-app/lib/server/ai/tools/store-memory.ts`.
  - Artifact apply: `next-app/lib/server/agent/artifacts.ts` (`memory_proposal`).
  - UI card: `next-app/components/artifacts/MemoryCard.tsx`.
- Retrieval + prompt injection exists:
  - Retrieval: `next-app/lib/server/memory/memory-retrieval.ts`.
  - Prompt assembly: `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/ai/prompts/copilot-prompts.ts`.
- Extraction and sync pipelines exist:
  - Conversation extraction: `next-app/lib/server/memory/conversation-extractor.ts`.
  - Artifact-decision extraction: `next-app/lib/server/memory/decision-extractor.ts`.
  - Protocol sync: `next-app/lib/server/memory/protocol-sync.ts`.
- Memory management UI exists:
  - `next-app/app/project/[id]/memory/page.tsx`.

## Active Gaps (Priority)

- P0 memory correctness items are complete.
- P1 retrieval implementation is in code; next gap is rollout/validation of pgvector migration in active environments.
- Scoping mode now persists hidden machine-readable report metadata in assistant messages; extraction/summarization must sanitize this markup before memory ingestion.
- P2 lifecycle metadata baseline is in code; next gap is full lifecycle scoring (`usedInAnswerCount` attribution + utility pipeline + maintenance jobs) after sanitization.

## Progress Log

- 2026-02-20: P0 item completed — edited memory proposal payload now propagates through accept flow in `next-app/components/copilot/TimelineRenderer.tsx` so edit-then-accept can persist edited payload via existing artifact review plumbing.
- 2026-02-20: P0 item completed — `store_memory` dedupe hardened in `next-app/lib/server/ai/tools/store-memory.ts` with key/value normalization and active project-memory statement dedupe; tests updated in `next-app/lib/server/__tests__/store-memory.test.ts`.
- 2026-02-20: P0 item completed — retrieval logs now include `conversationId` context by extending `MemoryContext` and wiring call sites in `next-app/lib/server/ai/ai-service.ts`; covered by `next-app/lib/server/__tests__/memory-retrieval.test.ts`.
- 2026-02-20: P0 item completed — conversation extraction idempotency now guards both decision/fact extraction and preference-only extraction via an extractor marker (`sourceEventId: conversation-extractor:<conversationId>`) in `next-app/lib/server/memory/conversation-extractor.ts`; covered by `next-app/lib/server/__tests__/conversation-extractor.test.ts`.
- 2026-02-20: P0 item completed — protocol sync now covers research question, search strategy, and methodology fields in addition to PICO/eligibility in `next-app/lib/server/memory/protocol-sync.ts`; covered by `next-app/lib/server/__tests__/protocol-sync.test.ts`.
- 2026-02-20: P0 item completed — contradiction flow added for memory proposals: `store_memory` now flags keyed conflicts in rationale for user review, and accepted project memories supersede conflicting active keyed memories via archive-on-apply in `next-app/lib/server/agent/artifacts.ts`; covered by `next-app/lib/server/__tests__/store-memory.test.ts`.
- 2026-02-20: Minor hardening from review feedback — added explicit comments clarifying extractor marker idempotency (`sourceEventId`) in `next-app/lib/server/memory/conversation-extractor.ts`, user-memory upsert/supersession semantics in `next-app/lib/server/agent/artifacts.ts`, and protocol-sync type rationale in `next-app/lib/server/memory/protocol-sync.ts`.
- 2026-02-20: P1 kickoff started — retrieval pipeline now includes identifier-aware lexical ranking boost and a semantic-layer merge hook in `next-app/lib/server/memory/memory-retrieval.ts` (semantic source currently scaffolded pending pgvector storage/query integration); covered by updated `next-app/lib/server/__tests__/memory-retrieval.test.ts`.
- 2026-02-20: P1 progress — retrieval now uses weighted fusion (lexical + semantic slots with utility multipliers), adds scoped study-memory lexical search, and filters study memories by active `projectId` to prevent cross-project leakage in `next-app/lib/server/memory/memory-retrieval.ts`; covered by additional cases in `next-app/lib/server/__tests__/memory-retrieval.test.ts`.
- 2026-02-20: P1 semantic layer implemented — added `next-app/lib/server/memory/semantic-memory.ts` with OpenAI embedding generation, idempotent embedding refresh via content-hash upserts, pgvector cosine search, and scoped hydration into retrieved memories; wired into `next-app/lib/server/memory/memory-retrieval.ts`. Added `MemoryEmbedding` model in `next-app/prisma/schema.prisma` and migration `next-app/prisma/migrations/20260220211500_memory_embeddings/migration.sql`.
- 2026-02-20: Added one-time embedding warmup script `next-app/scripts/warmup-memory-embeddings.ts` (with `npm run memory:warmup`) to precompute semantic embeddings by project.
- 2026-02-20: P2 kickoff implemented — lifecycle metadata columns added across memory tables in `next-app/prisma/schema.prisma` (+ migration `next-app/prisma/migrations/20260220213500_memory_lifecycle_metadata/migration.sql`). Baseline counters wired: retrieval increments in `next-app/lib/server/memory/memory-retrieval.ts`, accepted/rejected/contradiction increments in memory proposal review/apply paths in `next-app/lib/server/agent/artifacts.ts`.
- 2026-02-20: Cross-stream scoping integration landed (`scoping` mode + `scoping_report` artifacts + hidden assistant metadata comments). Memory plan adjusted to add mandatory metadata sanitization before extraction/scoring improvements.

## Implementation Plan

### P0 — Correctness and Trust

1. Fix edited payload propagation for memory proposals.
- Files:
  - `next-app/components/copilot/TimelineRenderer.tsx`
  - `next-app/app/actions/agent.ts`
  - `next-app/lib/server/agent/artifacts.ts`
- Outcome:
  - Editing a `memory_proposal` value then accepting persists the edited payload.
- Status:
  - Completed on 2026-02-20 (timeline wiring fix). No action needed in `agent.ts` or `artifacts.ts` for this sub-item.

2. Harden dedupe in `store_memory`.
- Files:
  - `next-app/lib/server/ai/tools/store-memory.ts`
  - Memory service helpers under `next-app/lib/server/memory/`
- Outcome:
  - Duplicate proposals are skipped for normalized equivalent values.
- Status:
  - Completed on 2026-02-20 (normalization + stronger project/user dedupe guards).

3. Add robust extraction idempotency.
- Files:
  - `next-app/lib/server/memory/conversation-extractor.ts`
  - `next-app/lib/server/agent/run.ts`
  - Prisma schema/migration (`next-app/prisma/schema.prisma`)
- Outcome:
  - A conversation is extracted once per idempotency key regardless of extracted type mix.
- Status:
  - Completed on 2026-02-20 using extractor marker dedupe for preference artifacts + existing project-memory tag guard.

4. Link retrieval logs to conversation context.
- Files:
  - `next-app/lib/server/memory/memory-retrieval.ts`
  - `next-app/lib/server/ai/ai-service.ts`
- Outcome:
  - Retrieval entries can be traced by conversation/run for debugging and evals.
- Status:
  - Completed on 2026-02-20 (`conversationId` wired end-to-end + test coverage).

5. Complete protocol sync coverage.
- Files:
  - `next-app/lib/server/memory/protocol-sync.ts`
  - Protocol field definitions in `next-app/lib/protocol-fields.ts`
- Outcome:
  - Protocol memory reflects all fields intended for grounding.
- Status:
  - Completed on 2026-02-20 (coverage expanded beyond PICO/eligibility to research/search/methodology).

6. Implement contradiction detection + user resolution flow.
- Files:
  - `next-app/lib/server/ai/tools/store-memory.ts`
  - `next-app/lib/server/agent/artifacts.ts`
  - `next-app/components/artifacts/MemoryCard.tsx`
  - `next-app/components/copilot/TimelineRenderer.tsx`
- Outcome:
  - Contradictory memories are surfaced for user confirmation instead of silent overwrite.
- Status:
  - Completed on 2026-02-20 (proposal-time conflict signaling + apply-time keyed supersession).

### P1 — Retrieval Quality (Postgres-Native Hybrid)

1. Keep deterministic memory inclusion; add hybrid ranking for the remainder.
- Combine:
  - Deterministic includes (existing rules).
  - Lexical ranking (Postgres full-text).
  - Semantic similarity (embeddings/vector index).
- File focus:
  - `next-app/lib/server/memory/memory-retrieval.ts`
  - New retrieval/index helpers under `next-app/lib/server/memory/`
  - Prisma schema/migrations for pgvector support.
- Status:
  - Implemented in code (deterministic + lexical + semantic + fusion active). Pending migration rollout verification per environment.

1.1 pgvector schema and indexing.
- Add a dedicated embedding store (single-DB approach), for example:
  - `MemoryEmbedding(memoryType, memoryId, projectId?, model, contentHash, embedding, createdAt, updatedAt)`.
- Indexing:
  - HNSW cosine index on embedding column.
  - Uniqueness on (`memoryType`, `memoryId`, `model`) for idempotent refresh.
- Outcome:
  - Fast semantic retrieval with no second database.
- Status:
  - Implemented in code + migration. Pending `prisma migrate` rollout and smoke test in deployed environments.
- Rollout helper:
  - `next-app/scripts/warmup-memory-embeddings.ts` for one-time backfill/prewarm after migration.

2. Weighted fusion and relevance controls.
- Add ranking factors:
  - lexical score
  - semantic score
  - memory importance
  - utility score (non-time-based)
  - confidence weight
- Outcome:
  - Better recall for exact IDs and better relevance for paraphrased intent.
- Status:
  - Implemented for P1 baseline (identifier-aware lexical ranking + semantic similarity + utility weighting).

### P2 — Lifecycle and Maintenance

1. Add memory lifecycle metadata.
- Proposed fields:
  - `source`, `confidence`, `retrievalCount`, `usedInAnswerCount`, `acceptedCount`, `rejectedCount`, `contradictionCount`, `pinned`, optional `expiresAt`, optional contradiction linkage.
- Files:
  - `next-app/prisma/schema.prisma`
  - `next-app/lib/server/memory/*.ts`
- Status:
  - Implemented baseline (schema + migrations + baseline counter wiring for retrieval/accept/reject/conflict). Full utility scoring still pending.

1.1 Scoping metadata sanitization guardrail.
- Problem:
  - Scoping assistant messages may include hidden `SCOPING_REPORT` JSON comments for machine handoff.
  - Memory extraction/summarization that reads raw assistant text can ingest this metadata as false memory signal.
- Required changes:
  - Strip `SCOPING_REPORT` comment/XML/fenced blocks in `next-app/lib/server/memory/conversation-extractor.ts` before transcript assembly.
  - Apply same sanitization in any conversation summary pipeline consuming assistant text.
- Status:
  - Not started (must land before `usedInAnswerCount`/utility-scoring expansion).

1.2 Scoping-specific memory policy.
- Policy:
  - Persist explicit user decisions/preferences from scoping handoff.
  - Do not persist transient landscape summaries as durable project/user memory unless explicitly confirmed.
- Files:
  - `next-app/lib/server/memory/conversation-extractor.ts`
  - `next-app/lib/server/memory/decision-extractor.ts` (if needed for handoff events)
- Status:
  - Not started.

2. Add contradiction/supersession handling.
- Outcome:
  - New conflicting memories link/supersede older entries instead of silent drift.

3. Add maintenance loop.
- Archive low-utility/superseded memories with explicit status transitions.
- Candidate logic is utility-driven (no age-only archive rule).

4. Add explicit user memory controls.
- Support clear remember/forget/inspect commands via tool + UI path.

### P3 — Observability and Evals

1. Add memory quality metrics.
- Track:
  - proposal acceptance by source
  - retrieval hit/use rate
  - stale-memory usage rate
  - contradiction rate

2. Add reporting surface.
- Extend memory dashboard with quality and health metrics.

## Non-Goals (For Now)

- No filesystem-based canonical memory (`MEMORY.md`) for runtime source-of-truth.
- No SQLite session layer (conversations already persist in Postgres).
- No graph memory infrastructure until retrieval metrics justify complexity.

## Acceptance Criteria

P0 done when:
- Memory proposal edits persist correctly.
- Duplicate memories are consistently blocked.
- Extraction cannot duplicate on re-run.
- Retrieval logs include conversation linkage.
- Protocol-sync memory coverage is complete.

P1 done when:
- Hybrid retrieval improves both exact-ID recall and semantic recall in tests.
- Ranking remains project/user scoped with no cross-project leakage.

P2 done when:
- Utility scoring, reinforcement tracking, and contradiction handling are visible in data model and behavior.

P3 done when:
- Weekly memory quality metrics are available and actionable.

## Required Verification for Each Change Set

- `cd next-app && npx tsc --noEmit`
- `cd next-app && npx vitest run`
- Manual checks:
  - proposal accept/reject/edit flows
  - cross-session recall
  - project-scope isolation
  - retrieval traceability in logs
