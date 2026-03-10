# Memory & Retrieval Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Contradictions:** Require user confirmation by default. (Deterministic conflicts prompt review; semantic conflicts are flagged without auto-overwrite). Accepted new memories archive/supersede conflicting prior ones.
- **Utility Ranking:** Relevance decay is utility-based, not time-based (`retrievalCount`, `acceptedCount`, `rejectedCount`, `contradictionCount`, `pinned`).
- **Hybrid Fusion:** Retrieval uses Postgres lexical/full-text ranking + pgvector cosine similarity + deterministic rules + utility penalties.
- **Storage:** `UserMemory`, `ProjectMemory`, `StudyMemory`, `ConversationSummary`, `MemoryRetrieval` (Postgres is single data store).
- **Embeddings:** Generation via OpenAI, idempotent content-hash upserts, pgvector HNSW cosine index.
- **Pipelines:** Conversation extraction now strips hidden scoping metadata before transcript assembly and applies scoping-aware persistence rules (explicit user decisions/preferences only, no transient landscape summaries). Marker idempotency is enforced via `sourceEventId` for preference-only paths.
- **Memory Controls:** AI supports explicit `store_memory`, `forget_memory` (archive semantics), and `inspect_memory`. Forget operations are proposal-based (`memory_forget_proposal`) with user review in timeline UI.
- **Lifecycle:** Utility-based maintenance loop archives low-utility memories (no time decay). User-memory accept flow now normalizes keys and supersedes conflicting active variants.
- **Quality & Ops:** Quality metrics (acceptance by source, retrieval hit rate, stale-memory usage, contradiction rate) are computed server-side and surfaced on Memory Health dashboard. pgvector rollout checks are implemented (`validateSemanticRolloutStatus`, `memory:validate`).

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Execute pgvector rollout validation in each active deployed environment and record pass/fail status (local command is implemented, but this still needs networked environment execution).

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Retrieval-side audit logging is now best-effort: `logMemoryRetrieval(...)` no longer rejects the main retrieval path, so memory bookkeeping failures degrade silently with warning logs instead of taking down chat/context assembly.
- [x] Memory Health dashboard shipped: retrieval + quality metrics and rollout status are visible in project memory UI (`Memory Health` tab).
- [x] Quality metrics implemented server-side: proposal acceptance by source, retrieval hit rate (heuristic usage wiring), stale-memory usage rate, contradiction rate.
- [x] Utility-based maintenance loop implemented: low-utility memories are archived based on usage/rejection/contradiction signals (not age-based decay).
- [x] Contradiction policy thresholds codified: deterministic vs semantic conflict rules centralized and applied in memory proposal flow.
- [x] `forget` semantics implemented as archive-only with explicit proposal review path (`memory_forget_proposal` apply function + UI card).
- [x] User-memory supersession parity: accepting conflicting normalized keys archives prior active variants before persisting canonical value.
- [x] Scoping extraction guardrails implemented: `SCOPING_REPORT` stripping + scoping-specific extraction policy to avoid transient landscape memory pollution.
- [x] Explicit memory controls added to tooling and prompts: `store_memory`, `forget_memory`, `inspect_memory` wired with autonomy/mode/tool mappings.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Conversation-native structured memory lane: capture decision-grade structured memories continuously during a live conversation (separate from summary compaction) so critical decisions/facts are preserved and retrievable for future cross-conversation retrieval.
- [ ] File-system based canonical memory (`MEMORY.md`).
- [ ] SQLite session layer.
- [ ] Graph memory infrastructure.
