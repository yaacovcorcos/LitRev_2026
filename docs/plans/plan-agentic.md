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
- **Protocol Criteria Editing:** `update_criteria` is registered and mode-allowed for protocol work, enabling atomic add/remove edits for inclusion/exclusion criteria with protocol-memory sync.
- **Ledger Deletion Action:** `delete_study` is implemented and mode-allowed in screening for explicit hard-delete requests from the ledger.
- **Evidence Table Apply Path:** Accepted `evidence_table` artifacts now persist to an "Evidence Table" note (update existing note if present, create if missing).
- **Mentioned Studies Flow (P10):** Assistant turns now support deterministic mention extraction (structured contract + DOI/PMID/title-year fallback), inline chat chips, and direct user-initiated add-to-ledger with duplicate-safe idempotent writes and chat provenance metadata.
- **P10 Rollout Flags:** Mention flow and scoping decision-card behavior are feature-flagged (`NEXT_PUBLIC_CHAT_STUDY_MENTIONS_V1`, `NEXT_PUBLIC_SCOPING_DECISION_CARD_V2`).
- **Scoping Mode (P10):** Dedicated pre-protocol routing and prompt behavior is live with low-autonomy batch search-pack planning and deterministic protocol handoff (`update_protocol` proposal-only).

## Active Tasks
*Work that is entirely unimplemented or currently broken.*
- [ ] No open agent-orchestration implementation tasks in this phase.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] P10 mentioned-studies flow shipped: extraction pipeline (structured + fallback), chat chips, one-click add-to-ledger, idempotent duplicate protection, and chat provenance tagging.
- [x] Added rollout flags for mention/scoping UX controls: `NEXT_PUBLIC_CHAT_STUDY_MENTIONS_V1` and `NEXT_PUBLIC_SCOPING_DECISION_CARD_V2`.
- [x] Added validation coverage for P10: mention parser tests, add-to-ledger idempotency tests, timeline metadata stripping + mention-action UI tests, and scoping finalization tests.
- [x] Implemented apply function for `evidence_table` artifacts (persists accepted table to project Notes).
- [x] Implemented `delete_study` tool and registered it in `AVAILABLE_TOOLS` and screening mode.
- [x] Wired `update_criteria` into tool registry and protocol-mode tool filtering.
- [x] P10: Scoping mode architecture shipped (routing, tool filtering, batch plan behavior, contract parsing, deterministic handoff).
- [x] `exclude_study` tool implemented and registered in `AVAILABLE_TOOLS`.
- [x] `bulk_screening` tool implemented and registered in `AVAILABLE_TOOLS`.
- [x] `extract_pdf` tool implemented and registered in `AVAILABLE_TOOLS`.

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
- [ ] Global Command Palette / Search overlay UI.
- [ ] MCP Server abstraction for tools.
- [ ] Inngest integration for long loops.
- [ ] LlamaIndex.TS ADW pattern (per-paper agents).
- [ ] Checkpoint / crash recovery for long loops (LangGraph pattern).
