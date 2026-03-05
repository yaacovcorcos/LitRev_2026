# Codex Agentic Execution Plan (Consolidated)

## Purpose
This is the canonical standalone Codex plan for LitRev's agent runtime evolution.
It translates current architecture plus next-generation agent design principles into a phased, implementation-ready roadmap with long-term quality constraints.

## Coverage Guarantee
- This file covers the full agentic stack: orchestration loop, tool contracts, context retrieval, memory/task coordination, sub-agent delegation, and quality operations.
- It is ordered from trust/safety foundations to capability expansion to operational rigor.
- Deferred items remain explicit to avoid roadmap drift.

## Ordering Principles
1. Stabilize control flow and human interrupt boundaries before adding new capability.
2. Improve evidence quality by prioritizing search and provenance over prompt stuffing.
3. Expand capability through specialization (sub-agents) instead of unbounded tool growth.
4. Add state/memory structures only when they improve coordination and auditability.
5. Ship with evaluation gates and rollback levers, not intuition-only confidence.

## North Star Outcomes
- Higher completion reliability on multi-step research workflows with fewer dead-end runs.
- Lower hallucination risk via source-first retrieval and explicit citation provenance.
- Faster user progress via structured clarification interrupts and recoverable failure states.
- Lower maintenance burden from a smaller, clearer action space and measurable quality gates.

## Current Architecture
*How this domain works right now, based on committed code and active plans.*

- Agent mode routing is established (`Protocol`, `Scoping`, `Search`, `Screening`, `Drafting`, `QA`, `General`) with mode-level tool filtering and autonomy enforcement.
- `General` mode currently has an empty allowlist (`allowedTools: []`), which means "all tools available" via fallback filtering.
- The main loop already has dynamic continuation limits and token-aware context compaction.
- Prompt assembly order is stable and cache-oriented (`mode -> scope -> project -> protocol -> autonomy -> ledger -> location -> study -> memory -> additional`).
- AI-generated quick choices are currently delivered through prompt-instructed `<choices>` XML + server-side extraction (`withChoicesExtraction`) + client chip rendering.
- Structured mention extraction for studies is live (contract + fallback parsing), with UI chips and idempotent add-to-ledger behavior.
- Tool execution uses schema validation with self-healing correction on malformed payloads.
- Langfuse traces already capture run/tool visibility at runtime.
- Anthropic reasoning stream events are normalized end-to-end; OpenAI/xAI parity is not complete.
- Proposal-style tool results now surface `proposed` vs `auto_applied` state in model-visible tool-message context, so the assistant can distinguish review-only artifacts from already-applied changes.
- Plan-before-act heuristics now require explicit extraction/writing verbs for `extract_pdf` and `update_note`, reducing false plans on read-only PDF/section requests.
- Memory extraction and conversation summarization exist, but memory overlap and prioritization are still open.
- OpenAlex search enrichment is active (`search_openalex`), with Crossref fallback enrichment for sparse DOI metadata.

## Strategic Gaps
- Clarification is still prompt-driven (`<choices>` protocol), so required user decisions are probabilistic and not guaranteed to appear as structured UI.
- Planning/asking/acting/verification phases are not enforced as an explicit state machine.
- Context is still often injected eagerly (notably protocol/ledger blocks) instead of progressively discovered per need.
- General mode action space is too broad, increasing wrong-tool selection risk and tool-schema token overhead.
- Long-run recovery is partial; explicit checkpoint/resume semantics are not fully standardized.
- Quality evaluation is fragmented; there is no canonical scenario harness tied to release gates.

## Long-Term Target Architecture (Durable Shape)
1. **Phase-Separated Runtime:** deterministic `plan -> ask -> act -> verify -> finalize` state transitions.
2. **Structured Human Interrupts:** typed question tool with pause/resume semantics and auditable answers.
3. **Progressive Context Engine:** retrieval-by-need with bounded expansion and visible context receipts.
4. **Search-First Evidence Layer:** OpenAlex/Crossref-driven discovery + metadata enrichment before synthesis.
5. **Specialist Sub-Agents:** delegated capability growth with strict tool envelopes per specialist.
6. **Task Graph Coordination:** replace brittle todo-style state with dependency-aware execution graph.
7. **Reliability Substrate:** idempotency envelopes, retry-safe checkpoints, and resumable failed runs.
8. **Eval-Driven Operations:** scenario benchmarks, release gates, and telemetry-backed pruning decisions.

## Long-Term Solution Blueprint (No Shortcut Fixes)
Use this as implementation policy. Each item defines the durable approach and what to avoid.

### Foundation Items
- `CAG-001` Best solution: explicit run-phase state machine with legal transitions and phase-specific allowed tools. Avoid: relying on prompt text to enforce phase discipline.
- `CAG-002` Best solution: dedicated `ask_user` tool with typed payloads (`single_choice`, `yes_no`, `multi_select`, `free_text`) and deterministic UI contract. Avoid: markdown/XML question protocols as the primary mechanism.
- `CAG-002a` Best solution: ship `ask_user` first in stateless-turn mode (tool emits `user_input_required`, run ends cleanly, next user turn resumes via history) before full pause/resume orchestration. Avoid: blocking adoption on complex run-resume infrastructure.
- `CAG-003` Best solution: standardized retry/resume model with checkpointed step boundaries and deterministic replay guards. Avoid: restart-whole-run behavior for local tool failures.
- `CAG-004` Best solution: idempotency keys and tool-call envelopes across all mutating operations. Avoid: per-tool ad hoc duplicate prevention logic.
- `CAG-005` Best solution: provider parity for reasoning streams (Anthropic/OpenAI/xAI) behind a unified event schema. Avoid: provider-specific UI branches.

### Context & Retrieval Items
- `CAG-006` Best solution: progressive context disclosure with explicit expansion tools (`read_protocol`, `read_ledger`) and hard token budgets per expansion layer. Avoid: loading full protocol/ledger blocks by default in low-context turns.
- `CAG-007` Best solution: OpenAlex search tool as primary discovery path with Crossref enrichment as second-stage normalization. Avoid: one-off metadata scrapes from assistant prose.
- `CAG-008` Best solution: query-planning contract that outputs structured Boolean and MeSH suggestions before execution. Avoid: opaque free-form search strings in long prompts.
- `CAG-009` Best solution: source receipt artifacts (what was searched, selected, excluded, and why) attached per turn. Avoid: unverifiable narrative-only evidence claims.
- `CAG-010` Best solution: centralized context budget policy with deterministic trimming and priority tiers. Avoid: scattered heuristic truncation rules.

### Multi-Agent & Coordination Items
- `CAG-011` Best solution: sub-agent runtime with bounded delegation depth and explicit parent-child trace links. Avoid: unlimited recursive delegation.
- `CAG-012` Best solution: start delegation with three meta-tools in `general` mode (`delegate_search`, `delegate_screening`, `delegate_protocol`) before broader specialist taxonomy. Avoid: immediate large-scale multi-agent fanout.
- `CAG-013` Best solution: keep `general` mode explicitly scoped (no all-tools fallback) and route complex work through delegated specialist contexts. Avoid: giving every tool to `general`.
- `CAG-014` Best solution: delegation policy matrix by mode/autonomy/risk level. Avoid: unconstrained sub-agent invocation.
- `CAG-015` Best solution: quarterly tool pruning driven by usage, failure rate, and overlap metrics. Avoid: monotonically increasing tool inventory.

### Memory, State, and Quality Operations
- `CAG-016` Best solution: dependency-aware `AgentTask` graph (editable, supersedable, auditable). Avoid: flat todo lists as primary coordination substrate.
- `CAG-017` Best solution: decision-memory dedup between summarization and extraction pipelines with shared canonical schema. Avoid: dual pipelines storing overlapping "decisions" without reconciliation.
- `CAG-018` Best solution: negative memory (rejected hypotheses, failed paths) as first-class extractable state with confidence/importance. Avoid: storing only accepted outcomes.
- `CAG-019` Best solution: user-visible run board exposing phase, active tasks, blockers, and pending clarifications. Avoid: hidden internal state that users cannot inspect.
- `CAG-020` Best solution: long-loop checkpoint/recovery with crash-safe continuation tokens. Avoid: best-effort continuation without persisted recovery semantics.
- `CAG-021` Best solution: benchmark suite of canonical LitRev workflows with pass/fail thresholds per release. Avoid: shipping agent changes without behavioral regression tests.
- `CAG-022` Best solution: feature-flagged staged rollout (off -> internal -> canary -> default) for all major runtime changes. Avoid: all-at-once deployment of orchestration changes.
- `CAG-023` Best solution: run SLO dashboard (completion rate, retry rate, clarification latency, citation validity) with alert thresholds. Avoid: raw logs without service-level targets.
- `CAG-024` Best solution: incident playbooks for tool failures, provider drift, and malformed outputs with one-command mitigation paths. Avoid: ad hoc manual firefighting.
- `CAG-025` Best solution: scheduled architecture review to remove obsolete constraints as model capability evolves. Avoid: preserving legacy scaffolding indefinitely.

## Phase 0 — Control-Flow Safety and Human Interrupts
- [ ] `CAG-001` Implement run-phase state machine (`plan/ask/act/verify/finalize`) in orchestrator core.
- [ ] `CAG-002` Add `ask_user` tool (typed schema: `single_choice`, `yes_no`, `multi_select`, `free_text`) and stream `user_input_required` events to timeline cards.
- [ ] `CAG-002a` Implement stateless v1 flow for `ask_user` (run ends after question, next user answer continues via conversation history) and defer full pause/resume.
- [ ] `CAG-003` Add retry/resume capability in timeline + backend run checkpoints for failed steps.
- [ ] `CAG-004` Standardize idempotency envelopes for all mutating tools.
- [ ] `CAG-005` Complete provider-native reasoning stream parity for OpenAI/xAI.

## Phase 1 — Search-First Retrieval and Progressive Context
- [ ] `CAG-006` Implement lazy context loading with pointer prompts + `read_protocol`/`read_ledger` tools in `general`/`qa`/`drafting`.
- [x] `CAG-007` Ship OpenAlex search tool and integrate into Search/Scoping flows.
- [ ] `CAG-008` Add structured query planner output (Boolean + MeSH suggestions) before search execution.
- [ ] `CAG-009` Introduce source-receipt artifacts in timeline and run logs.
- [ ] `CAG-010` Implement centralized context budget policy service.

## Phase 2 — Sub-Agent Architecture and Action-Space Discipline
- [ ] `CAG-011` Build sub-agent runtime contract (spawn/delegate/merge + trace links), including `parentRunId` propagation.
- [ ] `CAG-012` Ship v1 delegation meta-tools: `delegate_search`, `delegate_screening`, `delegate_protocol`.
- [ ] `CAG-013` Change `general` mode from all-tools fallback to explicit allowlist (direct utilities + delegation tools + `ask_user`).
- [ ] `CAG-014` Implement delegation policy matrix tied to mode/autonomy.
- [ ] `CAG-015` Implement tool portfolio telemetry + pruning workflow.

## Phase 3 — Durable Coordination State
- [ ] `CAG-016` Add `AgentTask` dependency graph model and APIs (create/edit/supersede/close).
- [ ] `CAG-017` Unify decision-memory schema across summary + extraction.
- [ ] `CAG-018` Add negative-memory extraction with confidence and importance fields.
- [ ] `CAG-019` Render user-facing run board for phase/task/blocker visibility.
- [ ] `CAG-020` Add crash-safe long-loop continuation tokens.

## Phase 4 — Evaluation, Rollout, and Operations
- [ ] `CAG-021` Build scenario eval harness for protocol setup, search, screening, and drafting paths.
- [ ] `CAG-022` Enforce staged rollout template for agent runtime features.
- [ ] `CAG-023` Add run SLO dashboards and alerting thresholds.
- [ ] `CAG-024` Publish incident playbooks for provider/tool/runtime failure classes.
- [ ] `CAG-025` Schedule recurring architecture-pruning review and execute first pass.

## Cross-Plan Synthesis (Codex + Claude)
- Adopted from Claude plan: pragmatic v1 `ask_user` that does not require immediate run-resume complexity; full pause/resume remains a later hardening step.
- Adopted from Claude plan: explicit focus on general-mode scope reduction via delegation meta-tools as the first sub-agent milestone.
- Adopted from Claude plan: concrete lazy-loading strategy for protocol/ledger context using pointer text + read tools.
- Rejected as v1 default: relying on `<choices>` for required decisions; it remains optional transitional UX only.

## File-Level Implementation Map (High-Value First)
1. `CAG-002` / `CAG-002a` (`ask_user` v1)
   - `next-app/types/ai.ts`
   - `next-app/types/agent.ts`
   - `next-app/lib/server/ai/tools/ask-user.ts` (new)
   - `next-app/lib/server/ai/tools/base.ts`
   - `next-app/lib/agent/router.ts`
   - `next-app/lib/server/ai/ai-service.ts`
   - `next-app/lib/server/chat-runtime/events.ts`
   - `next-app/components/copilot/StreamReducer.ts`
   - `next-app/components/copilot/TimelineRenderer.tsx`
   - `next-app/components/artifacts/UserInputCard.tsx` (new)
2. `CAG-011` / `CAG-012` / `CAG-013` (delegation + scoped general)
   - `next-app/lib/server/ai/sub-agent.ts` (new)
   - `next-app/lib/server/ai/tools/delegate-search.ts` (new)
   - `next-app/lib/server/ai/tools/delegate-screening.ts` (new)
   - `next-app/lib/server/ai/tools/delegate-protocol.ts` (new)
   - `next-app/lib/server/ai/tools/base.ts`
   - `next-app/lib/agent/router.ts`
   - `next-app/lib/ai/prompts/copilot-prompts.ts`
3. `CAG-006` (lazy context loading)
   - `next-app/lib/server/ai/tools/read-protocol.ts` (new)
   - `next-app/lib/server/ai/tools/read-ledger.ts` (new)
   - `next-app/lib/server/ledger-utils.ts` (new, extracted helpers)
   - `next-app/lib/server/ai/tools/base.ts`
   - `next-app/lib/agent/router.ts`
   - `next-app/lib/server/ai/ai-service.ts`
   - `next-app/lib/ai/prompts/copilot-prompts.ts`

## Rollout Sequencing Recommendation
1. Phase 0 first (`CAG-001`, `CAG-002`, `CAG-002a`, `CAG-003`) because it upgrades fundamental interaction reliability.
2. Phase 2 next (`CAG-011`, `CAG-012`, `CAG-013`) to reduce general-mode failure modes and tool bloat.
3. Phase 1 lazy-context work (`CAG-006`) immediately after Phase 0/2 core plumbing stabilizes.
4. Keep each major step behind feature flags; promote from internal to canary before default.

## Collaboration Phase Alignment (Claude-Coordinated)
This section now mirrors Claude's current wave model exactly: Wave `1`, `1.5`, `2`, `3`.

### Wave 1 — AskUser Runtime + Eval Foundation
- Claude owner scope: full `ask_user` stack (`CAG-002`, `CAG-002a`) including types, tool, loop, client v1, and prompt updates.
- Codex owner scope: eval harness groundwork (`CAG-021` subset) + provider reasoning internals only (OpenAI/xAI provider files, no `ai-service.ts` edits).
- Gate: both sides run `cd next-app && npx tsc --noEmit` and `cd next-app && npx vitest run` before merge.

### Wave 1.5 — Short Codex Hardening (Post-Merge)
- Codex owner scope: `CAG-005` policy toggle in `ai-service.ts` + `CAG-004` idempotency middleware.
- Rule: starts only after Wave 1 merge so `ai-service.ts` and type contracts are stable.

### Wave 2 — Delegation Core + AskUser UI Polish
- Claude owner scope: delegation core (`CAG-011`, `CAG-012`, `CAG-013`) including registration/scoping and feature-flag wiring.
- Codex owner scope: ask_user UI polish + retry UX (`CAG-003`) on top of Claude's v1 card.
- Rule: Codex does not modify delegation shared files (`tools/base.ts`, `router.ts`, `copilot-prompts.ts`, `ai-service.ts`) during Claude's delegation phase.

### Wave 3 — Lazy Context + Receipts/Ops
- Claude owner scope: lazy context core (`CAG-006`) including `read_*` tools and conditional context assembly.
- Codex owner scope: source receipts + ops hardening (`CAG-009`, `CAG-023`, `CAG-024`).
- Rule: Codex starts receipts work after delegation event shapes are stable from Wave 2.

## Parallel Ownership Matrix (Agentic, Aligned)
| Wave | Owner | Task IDs | Allowed File Boundaries | Locked / Do-Not-Touch by Other Agent During Phase |
|---|---|---|---|---|
| Wave 1 — AskUser Full Stack | Claude | `CAG-002`, `CAG-002a` | `next-app/types/ai.ts`, `next-app/types/agent.ts`, `next-app/lib/agent/loop-controller.ts`, `next-app/lib/server/ai/tools/ask-user.ts` (new), `next-app/lib/server/ai/tools/base.ts`, `next-app/lib/agent/router.ts`, `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/server/chat-runtime/events.ts`, `next-app/components/copilot/StreamReducer.ts`, `next-app/components/copilot/TimelineRenderer.tsx`, `next-app/components/artifacts/UserInputCard.tsx` (new), `next-app/lib/ai/prompts/copilot-prompts.ts` | Codex does not touch ask_user runtime/UI files in Wave 1 |
| Wave 1 — Eval + Provider Internals | Codex | provider-internals slice of `CAG-005`, eval scaffolding slice of `CAG-021` | `next-app/lib/server/ai/providers/openai.ts`, `next-app/lib/server/ai/providers/xai.ts`, provider normalization/support files, eval harness files/tests | Avoid Claude-locked ask_user/type/stream/timeline files |
| Wave 1.5 — Post-Merge Hardening | Codex | `CAG-004`, policy-toggle slice of `CAG-005` | `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/server/ai/tool-middleware.ts`, related middleware/provider tests | Starts only after Wave 1 merge gate |
| Wave 2 — Delegation Core | Claude | `CAG-011`, `CAG-012`, `CAG-013` | `next-app/lib/server/ai/sub-agent.ts` (new), `next-app/lib/server/ai/tools/delegate-search.ts` (new), `next-app/lib/server/ai/tools/delegate-screening.ts` (new), `next-app/lib/server/ai/tools/delegate-protocol.ts` (new), `next-app/lib/server/ai/tools/base.ts`, `next-app/lib/agent/router.ts`, `next-app/lib/ai/prompts/copilot-prompts.ts`, `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/agent/feature-flags.ts` | Codex does not touch delegation shared files in this wave |
| Wave 2 — AskUser UI Polish | Codex | UI-polish slice of `CAG-002`, `CAG-003` | `next-app/components/artifacts/UserInputCard.tsx`, `next-app/components/artifacts/UserInputCard.module.css` (new/updated), `next-app/components/copilot/StreamReducer.ts`, `next-app/components/copilot/TimelineRenderer.tsx`, timeline UI types/tests | Claude does not re-open these UI files after handoff |
| Wave 3 — Lazy Context Core | Claude | `CAG-006` | `next-app/lib/server/ai/tools/read-protocol.ts` (new), `next-app/lib/server/ai/tools/read-ledger.ts` (new), `next-app/lib/server/ledger-utils.ts` (new), `next-app/lib/server/ai/tools/base.ts`, `next-app/lib/agent/router.ts`, `next-app/lib/server/ai/ai-service.ts`, `next-app/lib/ai/prompts/copilot-prompts.ts` | Codex avoids these shared files while Wave 3 is open |
| Wave 3 — Receipts + Ops | Codex | `CAG-009`, `CAG-023`, `CAG-024` | receipt artifact UI/types/tests, timeline receipt rendering, ops docs/runbooks/scripts | Starts after Wave 2 contracts are stable |

## Recommended Parallel Waves (Aligned)
1. Wave 1:
Claude: ask_user full stack  
Codex: eval foundation + provider reasoning internals (no `ai-service.ts`)

1.5. Wave:
Codex: `CAG-005` policy toggle in `ai-service.ts` + `CAG-004` idempotency middleware

2. Wave 2:
Claude: delegation core  
Codex: ask_user UI polish + retry UX

3. Wave 3:
Claude: lazy context core  
Codex: source receipts + ops hardening

## Alignment Commitments
Where I want Claude to align with Codex:
- Keep registration and schema contracts stable at each handoff point (`ask_user`, `delegate_*`, `read_*`).
- Keep Wave ordering fixed (`1` -> `1.5` -> `2` -> `3`) to avoid shared-file overlap.
- Keep major runtime behavior behind feature flags.
- Use dual flag paths for delegation (`NEXT_PUBLIC_*` + `ENABLE_*`) so client/server gating stays consistent.

Where I will align with Claude:
- I will not touch ask_user runtime/UI files during Claude’s Phase 1 ownership.
- I will keep Codex Phase 1 work restricted to provider internals/eval scaffolding and defer `ai-service.ts` toggle + idempotency middleware to Phase 1.5 post-merge.
- I will avoid delegation and lazy-context shared files while Claude owns Waves 2 and 3 backend tracks.

## Deferred / Parking Lot
- [ ] `CAG-D01` Active-learning ranking for screening order (ASReview-like loop).
- [ ] `CAG-D02` Per-paper deep specialist agents (ADW-like pattern) after base sub-agent framework stabilizes.
- [ ] `CAG-D03` MCP abstraction layer for external tools once core tool contracts stabilize.
- [ ] `CAG-D04` Full command palette orchestration UI after run-board model is stable.
- [ ] `CAG-D05` Cross-provider arbitration agent for disagreement handling.

### External Benchmark Corpus (Validated 2026-03-01)
Use this as a pattern bank for `CAG-006`..`CAG-012` and `CAG-021`.

Open-source, high-fit benchmarks (add to active comparative evaluations first):
- **prismAId** (`open-and-sustainable/prismaid`): End-to-end protocol/search/screening/review workflow with LLM utilities; closest open-source workflow analog to LitRev.
- **ASReview** (`asreview/asreview`): Active-learning screening loop and ranking UX; strongest benchmark for `CAG-D01`.
- **AiReview** (`ielab/ai-review`): LLM-assisted title/abstract screening pipeline patterns.
- **ReviewAid** (`aurumz-rgb/ReviewAid`): Full-text screening and extraction-oriented workflow patterns.
- **Colandr (front/back)** (`datakind/permanent-colandr-*`): Older but useful ML-assisted web workflow for screening and dedup process design.

Open-source, adjacent enablers (not full product analogs):
- **OpenAlex** (open API + CC0 data): Discovery/enrichment backbone for `CAG-007`.
- **GROBID** (`kermitt2/grobid`): PDF scholarly parsing and reference extraction patterns for import quality.
- **Hypothesis** (`hypothesis/h`): Annotation data model and collaboration semantics.

Closed-source idea sources (product UX only, no code adaptation):
- **SciSpace/Typeset**: Agentic review UX and extraction-oriented affordances.
- **Elicit / ResearchRabbit / Litmaps / Connected Papers / Scite**: Discovery, citation-graph exploration, and evidence UX patterns.

Validation notes:
- `manuscripts-article-editor` is source-available but **CPAL-1.0** (not Apache), so treat as design reference only unless license review approves.
- `pubpub/platform` is currently **GPL-2.0** in repo metadata; treat as GPL reference, not permissive-license implementation source.

## Execution Notes
- Keep PRs narrow: one `CAG-*` item or a tightly coupled pair.
- For any UI-visible behavior change under `app/project/[id]/...`, preserve shell embedding contract (`isEmbeddedInProjectShell`).
- For meaningful UI/runtime changes, run:
  - `cd next-app && npx tsc --noEmit`
  - `cd next-app && npx vitest run`
- Treat this file as execution truth for Codex-side agentic strategy; update via prune-and-migrate policy only.
