# Memory & Retrieval Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Contradictions:** Require user confirmation by default. (Deterministic conflicts prompt review; semantic conflicts are flagged without auto-overwrite). Accepted new memories archive/supersede conflicting prior ones.
- **Utility Ranking:** Relevance decay is utility-based, not time-based (`retrievalCount`, `acceptedCount`, `rejectedCount`, `contradictionCount`, `pinned`).
- **Hybrid Fusion:** Retrieval uses Postgres lexical/full-text ranking + pgvector cosine similarity + deterministic rules + utility penalties.
- **Storage:** `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval` (Postgres is single data store).
- **Embeddings:** Generation via OpenAI, idempotent content-hash upserts, pgvector HNSW cosine index.
- **Pipelines:** Conversation extraction (with marker idempotency against duplicate extraction), artifact decision extraction, protocol sync (handles PICO, methodology, and search strategy).

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Rollout validation of pgvector migration in active environments.
- [ ] Add scoping metadata sanitization guardrail (strip `SCOPING_REPORT` blocks from conversation-extractor before transcript assembly).
- [ ] Add scoping-specific memory policy (persist explicit user decisions, but do not persist transient landscape summaries).
- [ ] Add contradiction/supersession handling (new conflicting memories link/supersede older entries instead of silent drift).
- [ ] Add maintenance loop (archive low-utility memories based on utility, not age).
- [ ] Add explicit user memory controls (Support clear remember/forget/inspect commands via tool + UI path).
- [ ] Add memory quality metrics (proposal acceptance by source, retrieval hit rate, stale-memory usage, contradiction rate).
- [ ] Add reporting surface (Extend memory dashboard with quality and health metrics).

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] P0 Correctness items: Edited memory proposals persist correctly, dedupe in `store_memory` hardened, extraction idempotency added, retrieval logs linked to conversation context, protocol sync expanded.
- [x] Contradiction detection: Proposal-time conflict signaling + apply-time keyed supersession wired up.
- [x] P1 Hybrid Retrieval: Weighted fusion (lexical + semantic + utility multipliers) active. Scoped study-memory lexical search added to prevent cross-project leakage.
- [x] P1 Semantic layer: OpenAI embedding generation, pgvector schema, search hooks, and idempotent refresh working.
- [x] P2 Lifecycle metadata: Baseline columns/counters (`usedInAnswerCount`, `retrievalCount`, etc.) added and wired into proposal paths.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] File-system based canonical memory (`MEMORY.md`).
- [ ] SQLite session layer.
- [ ] Graph memory infrastructure.
