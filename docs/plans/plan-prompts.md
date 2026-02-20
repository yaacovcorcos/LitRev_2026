# System Prompts & LLM Extraction Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Copilot Base (`lib/ai/prompts/copilot-prompts.ts`):** Foundation identity for all modes. Enforces markdown and strict verifiable hyperlinking to studies (via DOI/PMID).
- **Copilot Modes:** 6 variants (Protocol, Search, Screening, Drafting, QA, General) that prepend Base + append mode-specific behavior.
- **Context Assembly (`lib/server/ai/ai-service.ts`):** Injected block order is Mode Prompt -> Protocol -> Autonomy -> Ledger -> Memory -> Additional (optimized for Anthropic/OpenAI prompt caching).
- **PDF Extraction Pipeline:** 
  - Quick Extract (grok-4-1-fast, temp 0.2): Regex fallback + strict JSON for DOI/PMID/year/authors.
  - Deep Analysis (grok-4-1-fast, temp 0.3): Structured JSON summary, keywords, quality.
- **Conversation Summarization:** `summarizeConversationAction` (grok-4-1-fast, temp 0.2) summarizes active context to inject into new threads.
- **Memory Extraction (`lib/server/memory/conversation-extractor.ts`):** Background job (grok-4-1-fast, temp 0.1) mining conversations for Decisions, Facts, and Preferences into strict JSON.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P1 — Copilot Prompt Hardening
- [ ] Base Prompt: Add strict length/structure guidance (e.g., 1-3 sentences for simple answers, headers for analysis, max ~800 words).
- [ ] Base Prompt: Improve hallucination guardrail ("If you cannot verify a DOI/PMID, describe the study without a link and state it needs verification").
- [ ] Base Prompt: Add Tool awareness (tell the model what it can do).
- [ ] Protocol Mode: Define `criteria_card` artifact schema. Instruct AI to check existing protocol context before proposing and explain trade-offs.
- [ ] Search Mode: Define `study_proposal` artifact schema. Instruct AI to construct explicit Boolean strings, use protocol context, and suggest MeSH terms.
- [ ] Screening Mode: Define format for screening decisions. Instruct AI to explicitly reference protocol/memory context blocks when evaluating.

### P2 — Context & Extraction Hardening
- [ ] Context Blocks: Add explicit usage instructions inside the injected context blocks (e.g., tell the AI *how* to use the injected memory/ledger).
- [ ] Memory Extraction: Raise temp slightly or add examples of implicit vs explicit decisions to fix under-extraction.
- [ ] Memory Extraction: Add priority/importance signal to extracted facts.
- [ ] Memory Extraction: Expand 200-char limit for statements and add "negative extraction" (capturing rejected ideas).
- [ ] Resolve Prompt #6 vs #7 overlap: Both Conversation Summary and Memory Extraction pull "decisions", creating potential duplication.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Initial Prompts Map analysis completed (2026-02-07).
- [x] Prompt caching reorder implemented (Base -> Protocol -> Autonomy -> Memory -> Ledger).

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Add AI quality feedback loop (no mechanism currently adjusts future prompts based on user accept/reject behavior).
- [ ] More robust context sanitization (currently a shallow blocklist).
