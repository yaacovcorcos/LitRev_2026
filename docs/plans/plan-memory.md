# Agent Knowledge, Memory, and Grounding Plan

## Authority and Scope

This file remains the canonical memory tracker, and it now also owns the agent's knowledge-quality layer:
- memory storage and retrieval
- grounding and evidence-use policy
- prompt-library and extraction work that affects knowledge quality
- conversation summaries, decision extraction, and cited-study metadata

It owns:
- retrieval quality
- contradiction policy
- memory lifecycle
- grounding contracts
- prompt-owned extraction and schema work

It does not own:
- runtime continuation, delegation, or orchestration
  - use [`plan-agentic.md`](./plan-agentic.md)
- rollout, eval, security, and performance quality programs
  - use [`plan-agent-quality.md`](./plan-agent-quality.md)

There is no separate active prompts plan. Prompt-library and extraction-quality work lives here, while runtime-owned interaction contracts live in [`plan-agentic.md`](./plan-agentic.md).

## North Star

LitRev should answer scientific questions from the best available evidence, remember the right things, forget the wrong things safely, and expose enough structure that its answers can be trusted, audited, and improved.

That means:
- better retrieval
- better grounding
- cleaner prompt contracts
- stronger decision memory
- less duplication between summaries, memories, and cited-study metadata

## Current Architecture

- Retrieval already uses lexical ranking, vector similarity, deterministic rules, and utility-aware penalties in Postgres.
- pgvector infrastructure is already implemented, with rollout checks and server-side validation paths.
- Memory storage already supports:
  - `UserMemory`
  - `ProjectMemory`
  - `StudyMemory`
  - `ConversationSummary`
  - `MemoryRetrieval`
  - `MemoryRetrievalItem`
- Memory rows now carry explicit trust metadata:
  - `source`
  - `authority`
  - `polarity`
  - source reference fields
  - embedding lifecycle status
- Project and study memories can carry stable semantic `key` values. Protocol sync uses `protocol:*` keys so revised protocol facts update/version the intended memory instead of creating ambiguous duplicates.
- Contradictions already require explicit confirmation by default, and conflicting accepted values archive/supersede older variants.
- Study-memory retrieval is project-scoped, including cited-study retrieval from prompt context.
- Conversation summaries and selected draft text are treated as untrusted context, not source-of-truth evidence.
- Conversation-extracted decisions, facts, and preferences are proposed as reviewable memory artifacts; they do not silently become durable project truth.
- Successful scoped runs atomically queue conversation-memory extraction in durable `AgentRun` state. Request-scoped `after()` only accelerates processing; bounded later-run backlog scans reclaim expired leases, retry recorded failures up to a fixed cap, terminalize exhausted work, and fence settlement so serverless teardown cannot silently discard or duplicate extraction work. Provider extraction carries a job-owned 60-second abort deadline inside the five-minute lease and rechecks cancellation before proposal writes.
- Semantic retrieval no longer performs request-time corpus embedding backfill by default; warmup/rollout paths own embedding readiness unless an explicit backfill flag is enabled.
- Optional runtime retrieval is cooperatively cancellable: context deadlines abort a branch-owned signal, retrieval rechecks cancellation between phases, and event, audit, counter, and maintenance writes do not start after a known cancellation. Maintenance rechecks inside its write transaction so cancellation rolls back partially entered archive work.
- Memory tooling already exists:
  - `store_memory`
  - `forget_memory`
  - `inspect_memory`
- Prompt memory formatting preserves compact `authority`, `source`, and negative-memory polarity labels so recalled context does not lose its trust boundary when it reaches the model.
- Prompt assembly is already stable-to-variable for caching and grounding.
- The current prompt layer already includes:
  - scoping guidance
  - clarification guidance
  - visible-answer hygiene
  - DOI/PMID anti-fabrication guidance
  - PubMed-only default search-source guidance, with OpenAlex, Semantic Scholar/S2 search, and Semantic Scholar recommendations reserved for explicit user requests and enforced by runtime tool filtering
- The main remaining issue is not missing primitives. It is fragmentation:
  - prompt work, extraction work, grounding rules, and memory quality are split across too many docs

## Open-Source Position

Primary external references for this plan:
- `Future-House/paper-qa`
- `asreview/asreview`
- `AkariAsai/OpenScholar`
- `stanford-oval/storm`
- `Future-House/aviary`

Reference artifact:
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](../reviews/2026-04-16-agentic-open-source-benchmark.md)

Borrow from them:
- staged search -> evidence -> answer flows
- citation-aware answer shaping
- explicit source budgeting
- reviewer-oriented evidence triage
- evaluation tasks for scientific research agents

## Workstreams

### Workstream K1 — Retrieval and Evidence Grounding

- [ ] `K1-001` Execute pgvector rollout validation in each active deployed environment and record pass/fail status.
  - outcome:
    - no ambiguity about which environments are actually on the intended retrieval stack

- [ ] `K1-002` Strengthen search-mode retrieval guidance with explicit Boolean-query, MeSH, and query-rewrite rules where they materially improve evidence discovery.

- [ ] `K1-003` Make staged evidence use more explicit in the agent's knowledge contract.
  - target shape:
    - retrieve
    - gather evidence
    - rank/filter
    - answer with bounded sources
  - outcome:
    - LitRev's research answers become easier to trust and easier to evaluate

### Workstream K2 — Memory Quality and Decision Memory

- [ ] `K2-001` Ship `CAG-017` and unify decision-memory schema across summary and extraction paths.
  - outcome:
    - one decision-grade memory contract instead of overlapping summary and extractor heuristics
  - current status:
    - memory rows now have shared trust/provenance fields, and summary text is explicitly separated from canonical memory
    - remaining work is to finish any higher-level product/eval definition of `CAG-017` rather than adding more storage primitives

- [ ] `K2-002` Ship `CAG-018` negative-memory extraction with confidence and importance.
  - outcome:
    - rejected ideas and ruled-out directions become retrievable without pretending they were accepted decisions
  - current status:
    - storage now supports `polarity = rejecting`; extraction coverage still needs product-level tuning and evaluation before closing this item

- [ ] `K2-003` Improve implicit-decision extraction.
  - options:
    - better examples
    - temperature tuning
    - explicit extraction distinctions between stated, implied, and rejected decisions

- [ ] `K2-004` Resolve conversation-summary versus memory-extraction overlap.
  - outcome:
    - summaries explain context
    - memory stores durable facts and decisions
    - the two stop duplicating each other ambiguously

### Workstream K3 — Prompt and Output-Schema Discipline

- [ ] `K3-001` Keep visible-answer hygiene aligned with the runtime-led transparency model.
  - outcome:
    - grounded prose stays clean even when summaries are weak or intentionally suppressed

- [ ] `K3-002` Retire the hidden `MENTIONED_STUDIES` prompt contract when structured message parts land.
  - dependency:
    - `CAG-026` in [`plan-agentic.md`](./plan-agentic.md)

- [ ] `K3-003` Define stronger prompt-pack contracts for high-value retrieval and explanation flows.
  - current priority:
    - search mode retrieval guidance
    - explainer-style grounded explanations
    - onboarding assist prompt packs in coordination with [`plan-guided-setup.md`](./plan-guided-setup.md)

## Execution Order

1. Finish environment truth for retrieval rollout.
2. Unify decision memory and negative memory.
3. Strengthen staged grounding and prompt-pack discipline.
4. Remove legacy hidden metadata dependence once structured parts are shipped.

## Rules

1. Memory should store durable truth, not transient narration.
2. Summaries should explain context, not silently become canonical memory.
3. Prompt work should reduce ambiguity and leakage, not compensate for weak runtime contracts.
4. Grounding work should prefer explicit evidence structure over prose-only confidence.

## Recently Completed

- [x] Memory trust/provenance metadata is first-class across user, project, and study memory rows.
- [x] Stable project/study memory keys, protocol-sync revision keys, and project-memory version chaining are implemented.
- [x] Per-item retrieval audit rows now capture rank, score components, trust metadata, token estimate, and answer-use feedback.
- [x] Recalled memory prompt context now includes compact source/authority/polarity labels instead of flattening canonical, confirmed, inferred, proposed, and rejecting memories into identical prose.
- [x] Study-memory retrieval now requires project scope for cited-study context and server-side rehydration validates captured targets before prompt assembly.
- [x] Request-time semantic retrieval no longer silently performs corpus-wide embedding backfill by default.
- [x] Conversation summaries and selected draft context are marked as untrusted context before they enter future prompts.
- [x] Conversation-extracted decisions and facts now route through reviewable memory proposals instead of being auto-written to project memory.
- [x] Memory health metrics and rollout-status views are now implemented server-side.
- [x] Retrieval-side audit logging is now best-effort rather than taking down the main retrieval path.
- [x] Contradiction policy and archive-only forget semantics are codified.
- [x] Visible-answer hygiene and structured mention fallback rules are materially stronger than before.
