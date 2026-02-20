# Agentic System & AI Orchestration Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Context Window Management (P0):** Managed via `ContextWindowManager` to track token usage. Automatically summarizes older messages when approaching ~80% of limit, preserving system prompt and recent exchanges (via `compactMessages`).
- **Dynamic Loop Control (P1):** Loops are controlled by `shouldContinue` checking a safety cap (max 25 iterations), token budget, and presence of tool calls.
- **AI-Powered Planning (P4):** LLM planner (`grok-4-1-fast`) decomposes multi-step workflows. Plans injected into system prompt.
- **Handoffs Between Agent Modes (P5):** Modes are defined by `{ mode, systemPrompt, allowedTools[], model?, maxIterations? }`. Handoffs trigger mode switch changing available tools and prompt context.
- **Prompt Caching Optimization (P6):** System prompt ordered by stability (Base -> Protocol -> Autonomy -> Memory -> Ledger) to maximize Anthropic/OpenAI prefix caching hits.
- **Self-Healing JSON (P7):** Failed Zod validations on tool payloads are fed back to the LLM for correction before failing the run.
- **Observability (P9):** Runs and tool calls are traced via Langfuse (1 run = 1 trace, tool = span, LLM = generation).
- **Autonomy Levels:** Tools have defined safety ranges (1=suggest, 4=autonomous). `executeTool` strictly enforces these caps based on user/project config.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

- [ ] Implement `exclude_study` tool (flips `triageDecision` to exclude with reason).
- [ ] Implement `update_criteria` tool (adds/removes incl/excl criteria on protocol and syncs to memory).
- [ ] Implement `bulk_screening` tool (screens multiple studies against protocol criteria in one call, produces `screening_batch` artifact).
- [ ] Implement `extract_pdf` tool (triggers existing PDF pipeline on uploaded file).
- [ ] Implement `edit_draft` tool (writes/edits a section of the review draft, produces `draft_diff` artifact).
- [ ] Implement `delete_study` tool (removes study from ledger).
- [ ] Build apply functions for remaining artifact types (`study_proposal`, `draft_diff`, `screening_batch`, `evidence_table`).

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] P0: Context Window Management.
- [x] P1: Dynamic Loop Control (`stopWhen` + `prepareStep`).
- [x] P4: AI-Powered Planning workflow.
- [x] P5: Handoffs between specialized Agent Modes.
- [x] P6: Prompt caching sequence optimized.
- [x] P7: Self-Healing JSON parsing loop.
- [x] P8: Semantic Scholar Search plugin added along with Recommendations.
- [x] P9: Langfuse integration for tracing.

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
