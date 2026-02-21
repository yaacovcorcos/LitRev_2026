# Agentic System & AI Orchestration Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Context Window Management (P0):** Managed via `ContextWindowManager` to track token usage. Automatically summarizes older messages when approaching ~80% of limit, preserving system prompt and recent exchanges (via `compactMessages`).
- **Dynamic Loop Control (P1):** Loops are controlled by `shouldContinue` checking a safety cap (max 25 iterations), token budget, and presence of tool calls.
- **AI-Powered Planning (P4):** LLM planner (`grok-4-1-fast`) decomposes multi-step workflows. Plans injected into system prompt.
- **Handoffs Between Agent Modes (P5):** Modes are configured in `AGENT_MODE_CONFIG` (`systemPromptKey`, `allowedTools[]`, `memoryScope`, `description`) and selected by router + feature-flag normalization before prompt/tool assembly.
- **Prompt Caching Optimization (P6):** Prompt assembly follows a stable-to-variable order (`mode -> scope -> project -> protocol -> autonomy -> ledger -> location -> study -> memory -> additional`) to maximize prefix-caching hits while preserving grounding.
- **Self-Healing JSON (P7):** Failed Zod validations on tool payloads are fed back to the LLM for correction before failing the run.
- **Observability (P9):** Runs and tool calls are traced via Langfuse (1 run = 1 trace, tool = span, LLM = generation).
- **Autonomy Levels:** Tools have defined safety ranges (1=suggest, 4=autonomous). `executeTool` strictly enforces these caps based on user/project config.
- **Scoping Mode (P10):** Dedicated pre-protocol routing and prompt behavior is live with low-autonomy batch search-pack planning and deterministic protocol handoff (`update_protocol` proposal-only).

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Wire `update-criteria.ts` into `AVAILABLE_TOOLS` (or remove orphan tool if intentionally deprecated).
- [ ] Implement `delete_study` tool (removes study from ledger).
- [ ] Implement apply function for remaining artifact type (`evidence_table`).

### P10 — Mentioned Studies Action Flow (Chat-Native)
- [ ] Build study-mention extraction pipeline from assistant turns:
  - Structured extraction when present (IDs + metadata).
  - Fallback parser for DOI/PMID/title-year patterns.
  - Deterministic normalization/dedupe (DOI/PMID/S2, then title+year fallback).
- [ ] Add user-initiated chat action path to add a mentioned study directly to ledger (no separate AI turn), with idempotent server enforcement.
- [ ] Add provenance tagging for chat-click additions (e.g., `source = "chat_mention"` in stored study details/metadata).
- [ ] Add rollout flags:
  - `SCOPING_DECISION_CARD_V2`
  - `CHAT_STUDY_MENTIONS_V1`
- [ ] Add integration tests:
  - Scoping runs emit `scoping_report` artifacts in stream pipeline.
  - Mention extraction + dedupe + add-to-ledger idempotency.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] P6: Prompt caching sequence optimized.
- [x] P7: Self-Healing JSON parsing loop.
- [x] P8: Semantic Scholar Search plugin added along with Recommendations.
- [x] P9: Langfuse integration for tracing.
- [x] P10: Scoping mode architecture shipped (routing, tool filtering, batch plan behavior, contract parsing, deterministic handoff).
- [x] `exclude_study` tool implemented and registered in `AVAILABLE_TOOLS`.
- [x] `bulk_screening` tool implemented and registered in `AVAILABLE_TOOLS`.
- [x] `extract_pdf` tool implemented and registered in `AVAILABLE_TOOLS`.
- [x] Draft editing flow consolidated on `update_note` tool producing `draft_diff` artifacts.
- [x] Apply functions implemented for `study_proposal`, `draft_diff`, and `screening_batch`.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] OpenAlex search tool (240M papers, free).
- [ ] Crossref metadata enrichment (DOI validation, backward snowballing).
- [ ] Active learning screening priority (ASReview pattern).
- [ ] Section-aware PDF chunking.
- [ ] PRISMA flow diagram generation.
- [ ] Risk of bias assessment tools (RoB 2 / ROBINS-I).
- [ ] GRADE evidence profile artifacts.
- [ ] Table/Figure extraction via Marker or Nougat.
- [ ] Global Command Palette / Search overlay UI (`planC` Phase 8).
- [ ] MCP Server abstraction for tools.
- [ ] Inngest integration for long loops.
- [ ] LlamaIndex.TS ADW pattern (per-paper agents).
- [ ] Checkpoint / crash recovery for long loops (LangGraph pattern).
