# System Prompts & LLM Extraction Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Copilot Base (`lib/ai/prompts/copilot-prompts.ts`):** Foundation identity for all modes. Enforces markdown and strict verifiable hyperlinking to studies (via DOI/PMID).
- **Copilot Modes:** 7 variants (Protocol, Scoping, Search, Screening, Drafting, QA, General) that prepend Base + append mode-specific behavior.
- **Scoping Prompt Contract:** Scoping now teaches a broad-first evidence pass, avoids forcing early population/intervention/outcome commitments before evidence, recommends a default direction after synthesis, and reserves `ask_user` for hard blockers or the rare no-safe-default handoff case.
- **Clarification Prompt Contract:** Base prompt now aligns with the runtime-owned clarification controller: `ask_user` is the only blocking clarification primitive, the assistant should do non-blocked work first, include a safe `recommendedAnswer` / `recommendedReason` when available, treat resolved clarifications as authoritative, and never re-ask the same blocker after runtime suppression.
- **Structured Mention Contract:** Base prompt requires hidden `MENTIONED_STUDIES` JSON comments whenever a response names specific studies so UI can render actionable study chips; parser fallback remains as a last-resort path when metadata is omitted.
- **Context Assembly (`lib/server/ai/ai-service.ts` + `lib/ai/prompts/copilot-prompts.ts`):** Prompt assembly follows a stable-to-variable sequence for caching and grounding: Mode Prompt -> Scope -> Project -> Protocol -> Autonomy -> Ledger -> Location -> Study -> Memory -> Additional.
- **PDF Extraction Pipeline:** 
  - Quick Extract (grok-4-1-fast, temp 0.2): Regex fallback + strict JSON for DOI/PMID/year/authors.
  - Deep Analysis (grok-4-1-fast, temp 0.3): Structured JSON summary, keywords, quality.
- **Conversation Summarization:** `summarizeConversationAction` (grok-4-1-fast, temp 0.2) summarizes active context to inject into new threads.
- **Memory Extraction (`lib/server/memory/conversation-extractor.ts`):** Background job (grok-4-1-fast, temp 0.1) mining conversations for Decisions, Facts, and Preferences into strict JSON.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P1 — Copilot Prompt Hardening
- [ ] Visible-answer and reasoning hygiene: make the prompt contract explicitly forbid continuation/runtime scaffolding, hidden machine protocol, or raw provider reasoning from surfacing in normal visible answer prose.
- [ ] Visible-answer and reasoning hygiene: define a compact reasoning-summary contract that can enrich structured process trace without depending on raw provider-native reasoning quality.
- [ ] Visible-answer and reasoning hygiene: define clean degradation rules so prompt behavior falls back to process-led answers when reasoning is unavailable, noisy, or inconsistent.
- [ ] Search Mode: Strengthen explicit Boolean-query and MeSH suggestion guidance for evidence-retrieval requests.
- [ ] Onboarding V2: Define step-specific prompt pack for guided setup AI assists (`suggest`, `refine`, `generate`) with strict output schemas and deterministic fallback behavior.
- [ ] Onboarding V2: Add explainer-mode prompt contract for `Explain this` surfaces (plain-language, concise, and grounded to current project context).

### P2 — Context & Extraction Hardening
- [ ] Memory Extraction: Raise temp slightly or add examples of implicit vs explicit decisions to fix under-extraction.
- [ ] Memory Extraction: Add priority/importance signal to extracted facts.
- [ ] Memory Extraction: Expand 200-char limit for statements and add "negative extraction" (capturing rejected ideas).
- [ ] Resolve Prompt #6 vs #7 overlap: Both Conversation Summary and Memory Extraction pull "decisions", creating potential duplication.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Visible-answer and continuation hygiene now explicitly forbids echoing `[CONTINUATION_CONTEXT]`, `payload_json`, machine-only runtime labels, or raw provider reasoning into the normal visible answer path; continuation seeds were also shifted toward machine-oriented fields so prompt echo is less likely even before renderer sanitation.
- [x] Runtime-aligned clarification guidance now teaches the bounded `ask_user` contract end to end: do non-blocked work first, include a safe recommended default when possible, treat resolved clarifications as authoritative, and never re-ask the same blocker after runtime suppression.
- [x] Search/scoping visible-answer prompts now explicitly keep raw query logs and search-iteration mechanics in receipts/checkpoints/process details by default; visible prose should synthesize findings unless the user explicitly asks for the search strategy.
- [x] Tightened the hidden `MENTIONED_STUDIES` response contract so study-naming answers are expected to emit machine-readable metadata, while keeping graceful parser fallback behavior when the model still omits it.
- [x] Prompt assembly order stabilized for caching and grounding (Mode/Scope/Project/Protocol/Autonomy before variable context blocks).
- [x] Base prompt includes explicit tool-awareness guidance for action-oriented requests.
- [x] Base prompt includes concise-vs-structured response guidance for simple vs analytical requests.
- [x] Base prompt includes DOI/PMID anti-fabrication and verification guardrails.
- [x] Screening mode includes explicit decision policy and auditable output format (decision/rationale/confidence).
- [x] Injected context blocks include explicit grounding/usage and prompt-injection safety instructions.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Add AI quality feedback loop (no mechanism currently adjusts future prompts based on user accept/reject behavior).
- [ ] More robust context sanitization (currently a shallow blocklist).
