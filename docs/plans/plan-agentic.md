# Agentic System & AI Orchestration Plan

## Authority and Scope

This is the single canonical plan for LitRev's agent runtime.

It supersedes the following as standalone authorities:

- `docs/plans/codex-agentic-plan.md`
- `docs/plans/claude-agentic-plan.md`
- `docs/plans/agent-runtime-remediation/README.md`

Use this file for:

- current architecture truth
- immediate fix tracking
- medium/long-range agentic roadmap
- execution order
- maintenance/update rules

Use supporting plans only for detailed execution on a specific fix or subsystem:

- `docs/plans/agent-runtime-remediation/*.md` for fix-level implementation detail
- `docs/plans/plan-memory.md` for memory-internal work
- `docs/plans/plan-prompts.md` for prompt-library work
- `docs/plans/plan-chat-unification-v2.md` for shared chat-runtime migration
- `docs/plans/plan-context-capture.md` for scoped context entrypoints and receipts/history reuse

## Maintenance Contract

This file tracks current truth and remaining work. It must not become a diary.

### When Starting Work

1. Put the work in the right section:
   - immediate correctness/risk issue -> `Active Fixes`
   - durable capability/architecture work -> `Active Roadmap`
2. Add or update the supporting detail-plan link if implementation needs a deeper execution document.
3. Keep entries outcome-oriented and decision-complete; do not add vague placeholders.

### When Completing A Task

1. Remove it from `Active Fixes` or `Active Roadmap`.
2. If shipped behavior changed, add a 1-2 sentence factual note to `Current Architecture`.
3. Move a concise result note to the top of `Recently Completed`.
4. Update or retire any supporting detail-plan link that is no longer active.
5. Prune `Recently Completed` to 5-10 items maximum.

### When Adding A New Fix

Every fix entry must include:

- ID
- severity
- symptom
- desired end state
- supporting detail plan or explicit note that none exists
- clear exit criteria

### What Not To Do

- Do not keep parallel “active truth” in Codex/Claude-specific plan files.
- Do not append chronological changelogs.
- Do not duplicate memory-specific tracking here if `docs/plans/plan-memory.md` is the correct home.
- Do not leave completed fixes in `Active Fixes`.

## Ordering Principles

1. Fix trust and safety regressions before adding new capability.
2. Stabilize contracts before polishing UI.
3. Prefer explicit runtime contracts over prompt-only enforcement.
4. Keep `general` mode small and route complexity through focused specialists.
5. Ship agent changes with evals, rollback levers, and measurable signals.

## North Star Outcomes

- Higher completion reliability on multi-step research workflows.
- Lower hallucination risk through search-first evidence and explicit provenance.
- Faster user progress through deterministic clarification and review flows.
- Lower maintenance burden from a smaller, clearer action surface.
- Better operability through executable evals, telemetry, and incident-ready contracts.

## Current Architecture
*How the agentic system works right now, based on committed code.*

- **Context Window Management (P0):** Managed via `ContextWindowManager` to track token usage. Automatically summarizes older messages when approaching ~80% of limit, preserving system prompt and recent exchanges (via `compactMessages`).
- **Dynamic Loop Control (P1):** Loops are controlled by `shouldContinue` checking a safety cap (max 25 iterations), token budget, and presence of tool calls.
- **Heuristic Planning (P4):** Plan-before-act exists, but the planner is still heuristic rather than AI-generated.
- **Handoffs Between Agent Modes (P5):** Modes are configured in `AGENT_MODE_CONFIG` (`systemPromptKey`, `allowedTools[]`, `memoryScope`, `description`) and selected by router + feature-flag normalization before prompt/tool assembly.
- **Prompt Caching Optimization (P6):** Prompt assembly follows a stable-to-variable order (`mode -> scope -> project -> protocol -> autonomy -> ledger -> location -> study -> memory -> additional`) to maximize prefix-caching hits while preserving grounding.
- **Self-Healing JSON (P7):** Failed Zod validations on tool payloads are fed back to the LLM for correction before failing the run.
- **Typed Tool-Call Boundary:** Provider tool-call payloads are now parsed as a strict object-or-error contract. Parse failures, array payloads, and tool schema validation failures are classified as non-executable structured errors instead of being coerced into fake `{}` tool calls.
- **Structured Stream Errors:** Error envelopes (`kind`, `code`, `retryable`, `source`, `message`) now survive provider -> runtime -> stream -> timeline transport, so deterministic tool-boundary failures are visible to the UI as typed non-retryable errors.
- **Observability (P9):** Runs and tool calls are traced via Langfuse (1 run = 1 trace, tool = span, LLM = generation).
- **Autonomy Levels:** Tools have defined safety ranges (1=suggest, 4=autonomous). `executeTool` strictly enforces these caps based on user/project config.
- **Protocol Criteria Editing:** `update_criteria` is registered and mode-allowed for protocol work, enabling atomic add/remove edits for inclusion/exclusion criteria with protocol-memory sync.
- **Ledger Deletion Action:** `delete_study` is implemented and mode-allowed in screening for explicit hard-delete requests from the ledger.
- **Evidence Table Apply Path:** Accepted `evidence_table` artifacts now persist to an "Evidence Table" note (update existing note if present, create if missing).
- **Mentioned Studies Flow (P10):** Assistant turns now support deterministic mention extraction (structured contract + DOI/PMID/title-year fallback), inline chat chips, and direct user-initiated add-to-ledger with duplicate-safe idempotent writes and chat provenance metadata.
- **P10 Rollout Flags:** Mention flow and scoping decision-card behavior are feature-flagged (`NEXT_PUBLIC_CHAT_STUDY_MENTIONS_V1`, `NEXT_PUBLIC_SCOPING_DECISION_CARD_V2`).
- **Scoping Mode (P10):** Dedicated pre-protocol routing and prompt behavior is live with low-autonomy batch search-pack planning and deterministic protocol handoff (`update_protocol` proposal-only).
- **Reasoning Stream Support (Current):** `reasoning_*` stream events are currently wired end-to-end for Anthropic responses. OpenAI/xAI models can run normally, but their provider adapters do not yet emit normalized reasoning stream parts in the same pipeline.
- **Proposal-State Tool Context:** Proposal-style tool results now surface whether they are `proposed` vs `auto_applied` in the model-visible tool-message context, so assistant replies can distinguish review-only changes from already-applied ones.
- **Plan Heuristic Guardrails:** Plan-before-act heuristics now require explicit extraction/writing verbs for `extract_pdf` and `update_note`, reducing false execution plans for read-only PDF/section questions.
- **Delegation Runtime Now Uses The Shared Safety Contract:** delegated child runs now reuse the same autonomy-aware execution/finalization core as direct execution, level-1 delegated actions fail as structured approval-required blocks instead of running, delegated proposal artifacts stay reviewable unless direct policy allows auto-apply, and delegated `ask_user` bubbles through the existing parent `user_input_required` flow.
- **Popup Runtime Is Still Lighter Than Copilot:** popup remains on a non-artifact path, so protocol mutation capability is not yet honest there; tracked under `FIX-003`.
- **General Mode And Clarification Now Use Explicit Honest Contracts:** normal agentic paths now assemble tools through contextual mode+scope filtering, `general` no longer widens to all tools, disabled/global delegation tools are hidden before exposure, `ask_user` remains the sole blocking clarification primitive in the global base prompt, and `<choices>` guidance is scoped to artifact/chat surfaces as optional suggestion-only output.
- **Model Requests Now Use Per-Model Capability Policy:** one authoritative model capability registry now feeds a shared request-policy normalizer, OpenAI/xAI/Google/Anthropic all reuse it before send, fixed-default OpenAI models omit unsupported `temperature`, and unsupported explicit reasoning budgets fail locally as structured `model_capability` errors instead of raw provider 400s.
- **Protocol Mutation Uses Shared Field-Aware Normalization:** `update_protocol`, same-turn tool-call sanitization, and repeat detection now reuse the same field/value normalize-classify path so unambiguous wrapper shapes are repaired consistently, whitespace-only field mismatches no longer diverge between validation and execution, and normalization/hashing paths cap nested input depth safely.
- **Tool Prerequisites Now Gate High-Risk Actions Before Execution:** tool metadata now declares project/study/protocol prerequisites in the shared pre-execution path, screening actions also gate on resolvable non-empty criteria, and blocked actions emit structured `missing_prerequisite` envelopes before a tool runs. Generic PDF file existence is still verified inside PDF tools rather than the shared prerequisite vocabulary.
- **Run Recovery Semantics Are Structured On Timeline-Based Surfaces:** `/ai` and project copilot now preserve deterministic failure envelopes into client state, retry affordances are derived from structured metadata, and server finalization uses explicit run facts so failed no-answer runs no longer masquerade as `completed`. Popup now retains lightweight error metadata and annotates terminal failures inline, but it still does not have full timeline-style parity.
- **Run Lifecycle Integrity Is Now Enforced Across The Main Surfaces:** started runs now finalize exactly once, replace-safe admission requires explicit prior run identity instead of conversation-wide cancellation, and abnormal failure cleanup/dedupe now use the shared runtime/error owners so `/ai` and project copilot fail unfinished tools consistently and render one terminal failure.
- **Shared Failure Handling Still Needs One Owner:** shared stream reducers emit typed `stream_error` intents, but terminal failure presentation is not fully centralized yet; tracked under `FIX-011`.

## Verified Failure Classes
*The concrete runtime failures this plan is intended to eliminate.*

- Unsupported per-model request params causing deterministic request failures before the tool loop can usefully start.
- Protocol mutation attempts failing because `update_protocol` receives the wrong shape for the target field.
- Repeated failed task cards for the same invalid mutation intent.
- Wrong-tool execution in `general` mode when study, criteria, PDF, or project context is missing.
- Retry or resume affordances appearing for failures that cannot succeed without changing the request.
- Runs ending without a truthful fallback explanation after failed mutation attempts.
- Delegated child work bypassing review boundaries or swallowing clarification requests.
- Plan execution exceeding the tool surface or mode the user actually approved.
- Popup implying mutation capability it cannot actually render or complete honestly.
- Started runs leaking as `running` after stream termination or early generator close, causing fresh-send collisions on the same conversation.

## Active Fixes
*Immediate remediation work for shipped behavior that is broken, misleading, or lower quality than the intended contract.*

- [ ] `FIX-002` Plan execution confinement and approval integrity
  - Severity: `P0`
  - Problem: approved plans can widen back to `general` and are not strictly constrained to approved steps/tools.
  - Supporting detail: `docs/plans/agent-runtime-remediation/plan-plan-execution-confinement.md`
  - Exit criteria:
    - execution runs in the plan’s originating mode
    - only approved step tools are executable
    - step order is enforced for executable plans
    - advisory/non-executable plans cannot accidentally enter execution

- [ ] `FIX-003` Popup action-surface honesty
  - Severity: `P1`
  - Problem: popup currently advertises tool-driven protocol editing that it cannot correctly render or complete.
  - Supporting detail: `docs/plans/agent-runtime-remediation/plan-popup-action-surface.md`
  - Exit criteria:
    - popup is either explicitly read-only/advisory or fully artifact-aware
    - popup no longer claims to have created hidden protocol proposals
    - popup tool policy and UI capability match

- [ ] `FIX-005a` Agentic docs authority and plan truth
  - Severity: `P2`
  - Problem: the canonical plans are much healthier now, but authority and active-truth cleanup are still mixed together with broader eval/provenance work.
  - Supporting detail: `docs/plans/agent-runtime-remediation/plan-docs-evals-and-provenance.md`
  - Exit criteria:
    - `plan-agentic.md` remains the single accurate runtime authority
    - overlapping supporting docs are either retired, demoted to supporting-only, or made explicitly historical
    - active plan files do not overstate popup/shared-runtime parity or burn-in status

- [ ] `FIX-005b` Executable evals and search provenance
  - Severity: `P1`
  - Problem: eval coverage is still scaffold-level and search provenance is not a normalized runtime contract.
  - Supporting detail: `docs/plans/agent-runtime-remediation/plan-docs-evals-and-provenance.md`
  - Exit criteria:
    - runtime evals assert real orchestration behavior
    - search turns emit normalized `source_receipt` data
    - release confidence can rely on executable agent/runtime scenarios instead of catalog shape alone

- [ ] `FIX-011` Shared failure handling and popup parity
  - Severity: `P1`
  - Problem: shared reducers now emit typed stream-error intents, but popup still lacks full timeline-style recovery parity and terminal failure rendering is not fully unified across every surface.
  - Supporting detail: canonical plan only for now.
  - Exit criteria:
    - shared stream-error intents are consumed consistently by timeline-based adapters
    - popup retains structured error metadata for terminal failures
    - popup and shared adapters have dedicated regression coverage for terminal failure rendering
    - remaining popup limitations are documented explicitly instead of implied away

## Execution Order

Work should proceed in this order unless a production incident forces reprioritization:

1. `FIX-002` plan execution confinement
2. `FIX-003` popup action-surface honesty
3. `FIX-005a` docs authority and plan truth
4. `FIX-005b` evals and provenance hardening
5. `FIX-011` shared failure handling and popup parity
6. roadmap phases after the active fixes above are stable

## End-to-End Delivery Program

### Track A — Request-Boundary Reliability and Truthful Failure Handling

- `FIX-007` shipped the protocol-mutation normalization/suppression layer.
- `FIX-009` shipped truthful failure handling for timeline-based surfaces: structured error envelopes now survive processor/reducer/timeline state, non-retryable failures no longer default back to retryable UI affordances, and server finalization emits one fallback explanation for deterministic no-answer failures while deriving `runStatus` from explicit run facts. Popup remains a lighter path under `FIX-011`.
- `FIX-010` shipped provider/model request-policy normalization: one authoritative model registry now drives temperature/reasoning capability handling, provider adapters reuse shared builders for `chat()` and `streamChat()`, and blocked reasoning-budget mismatches fail locally as structured capability errors instead of provider-side request failures.

### Track B — Action Eligibility and Honest Execution

- Land `FIX-008` before broader orchestration hardening so the runtime stops attempting impossible work with missing context.
- Treat prerequisite gating as a contract layer, not a prompt tweak.

### Track C — Orchestration Safety and Approval Integrity

- Once the request/tool boundary is stable, land `FIX-001` and `FIX-002`.
- This is the phase where delegation, approved-plan execution, and scoped `general` behavior become trustworthy instead of prompt-dependent.

### Track D — Surface Honesty, Docs, Evals, and Provenance

- Land `FIX-003`, `FIX-005a`, `FIX-005b`, and `FIX-011` after the lower-level contracts are stable.
- Popup honesty should match the real runtime surface, plan/docs authority should stay truthful, shared failure rendering should stop drifting per surface, and evals/provenance should measure the behavior the runtime actually ships.

## Active Roadmap
*Durable capability and architecture work after the immediate fixes.*

### Phase 0 — Control-Flow Safety and Human Interrupts

- [ ] `CAG-001` Implement explicit run-phase state machine: `plan -> ask -> act -> verify -> finalize`
- [x] `CAG-002` Baseline `ask_user` tool and typed UI contract shipped
- [x] `CAG-002a` Stateless turn-based clarification flow shipped
- [ ] `CAG-003` Add retry/resume capability with checkpointed failed-step recovery
- [ ] `CAG-004` Standardize idempotency envelopes for mutating tools
- [ ] `CAG-005` Complete provider-native reasoning stream parity for OpenAI/xAI

### Phase 1 — Search-First Retrieval and Progressive Context

- [x] `CAG-006` Foundation shipped: `read_protocol` and `read_ledger` exist
- [ ] `CAG-006b` Complete lazy context loading and pointer-first context assembly
- [x] `CAG-007` OpenAlex search shipped
- [x] `CAG-008` Baseline delegated search query planning shipped
- [ ] `CAG-008b` Expand structured query planning and validation across broader search flows
- [ ] `CAG-009` Add runtime search/source receipts and user-visible provenance
- [ ] `CAG-010` Implement centralized context budget policy

### Phase 2 — Specialist Delegation and Action-Space Discipline

- [x] `CAG-011` Baseline sub-agent runtime shipped
- [x] `CAG-012` Baseline delegation meta-tools shipped behind flag
- [ ] `CAG-013` Make scoped `general` mode the default architecture
- [ ] `CAG-014` Implement delegation policy matrix by mode/autonomy/risk
- [ ] `CAG-015` Implement tool-portfolio telemetry and pruning workflow

### Phase 3 — Durable State, Memory, and User Visibility

- [ ] `CAG-016` Add dependency-aware `AgentTask` graph and APIs
- [ ] `CAG-017` Unify decision-memory schema across summary and extraction paths
- [ ] `CAG-018` Add negative-memory extraction with confidence and importance
- [ ] `CAG-019` Render a user-visible run board for tasks, blockers, and clarifications
- [ ] `CAG-020` Add crash-safe long-loop continuation tokens

### Phase 4 — Evaluation, Rollout, and Operations

- [ ] `CAG-021` Build executable scenario eval harness and wire it into release confidence
- [ ] `CAG-022` Enforce staged rollout templates for agent runtime features
- [ ] `CAG-023` Add run SLO dashboards and alert thresholds
- [ ] `CAG-024` Publish incident playbooks for provider/tool/runtime failures
- [ ] `CAG-025` Schedule recurring architecture-pruning review

## Workstream Guidance

### Clarification and Human Interrupts

- Required user decisions must use `ask_user`.
- `<choices>` remains optional-only for lightweight next-step suggestions until it is retired.
- Pause/resume complexity should not block improvements that can work through stateless history continuation.

### Delegation and Scoped General Mode

- General mode should remain a coordination surface, not a raw superuser mode.
- New capability should prefer specialist routing and bounded tool envelopes over growing `general`.
- Shared files such as `ai-service.ts`, `router.ts`, `tools/base.ts`, and `copilot-prompts.ts` should have one owner at a time during multi-agent work.

### Progressive Context and Search Quality

- Prefer pointer-first context plus explicit read tools over eager full-block injection.
- Search quality work should ship with provenance/receipt signals, not narrative-only claims.

### Eval and Operations

- Runtime changes are not done when “the tests pass”; they are done when behavior is testable, observable, and rollback-safe.

## Multi-Agent Execution Rules

Use these rules when more than one agent/engineer is working the domain in parallel:

1. Types and stream/event contracts stabilize before UI polish.
2. New-file work can run in parallel when it does not touch shared registration or orchestration files.
3. Shared integration files are sequentially owned:
   - `next-app/lib/server/ai/ai-service.ts`
   - `next-app/lib/server/ai/tools/base.ts`
   - `next-app/lib/agent/router.ts`
   - `next-app/lib/ai/prompts/copilot-prompts.ts`
4. Do not run parallel edits on shared runtime files across waves.
5. Merge gates must pass before the next wave starts.

Recommended collaboration pattern:

- Wave A: contract and new-file work
- Wave B: shared integration
- Wave C: UI polish and eval expansion
- Wave D: ops hardening and cleanup

## Validation and Merge Gates

### For Runtime or UI Changes

- `cd next-app && npx tsc --noEmit`
- `cd next-app && npx vitest run`

### For Docs-Only Changes

- No code gate is required, but links, ownership, and maintenance rules must remain coherent.

### For Multi-Agent Hand-Offs

- event/type contracts must be frozen at the hand-off point
- shared-file ownership must be explicit
- no stacked cross-wave changes should remain unmerged

## Supporting Detail Plans

Use these only as execution detail for the active fixes above:

- `docs/plans/agent-runtime-remediation/plan-delegation-safety.md`
- `docs/plans/agent-runtime-remediation/plan-plan-execution-confinement.md`
- `docs/plans/agent-runtime-remediation/plan-popup-action-surface.md`
- `docs/plans/agent-runtime-remediation/plan-general-scope-and-clarification.md`
- `docs/plans/agent-runtime-remediation/plan-docs-evals-and-provenance.md`

These files are supporting documents. Status, priority, and closure rules live here.

## Recently Completed

- [x] Pruned and clarified the remaining docs/evals backlog: `FIX-005` is now split into `FIX-005a` (docs authority and plan truth) and `FIX-005b` (executable evals and search provenance), so plan-governance cleanup can finish independently of the heavier runtime measurement work.

- [x] Implemented `FIX-004b` clarification contract cleanup, completing `FIX-004`: `ask_user` is now the only blocking clarification primitive taught in the global base prompt, while `<choices>` guidance is scoped to artifact/chat surfaces and explicitly limited to optional suggestion chips without changing the XML/event contract.
- [x] Implemented `FIX-012c` abnormal-end cleanup and error dedupe, completing `FIX-012`: `/ai` and project copilot now reuse the shared runtime/error owners for abnormal-failure aftermath, unfinished tools are force-failed consistently, and one terminal failure renders once without regressing deterministic capability suppression.
- [x] Implemented `FIX-012b` replace-safe admission: `/ai` and project copilot now send `replaceRunId` only for their own tracked active run, and the server only replaces when that explicit run identity matches the actual active run for the conversation.
- [x] Implemented `FIX-012a` run finalization guard: started runs now enter the guarded `streamChatWithArtifacts` lifecycle, `run_start` is only emitted after that guard is active, and exactly-once finalization prevents ordinary aborted streams from leaking fresh `running` rows.
- [x] Implemented `FIX-004a` tool-surface honesty: `general` mode now uses explicit project/global allowlists instead of widening to all tools, main agentic tool assembly in `ai-service` is mode-aware through the contextual helper, and disabled/global delegation tools are removed from model-visible definitions before the model can call them.
- [x] Implemented `FIX-001` delegation safety and child clarification: delegated child runs now use the shared autonomy-aware execution/finalization core instead of direct tool execution, approval-required autonomy blocks surface as structured non-executed results, delegated proposal artifacts stay review-only unless direct policy allows auto-apply, and delegated `ask_user` requests bubble through the parent `user_input_required` path with parent-visible artifact metadata.
- [x] Implemented `FIX-008` tool prerequisite gating: high-risk tools now declare project/study/protocol prerequisites in shared tool metadata, the shared pre-execution middleware/autonomy path blocks missing context before tool execution, screening actions also gate on non-empty criteria readiness, and blocked calls emit structured `missing_prerequisite` envelopes instead of generic tool failures.
- [x] Hardened popup terminal-failure rendering under `FIX-011`: popup now keeps lightweight structured error metadata on assistant turns, annotates partial-output failures inline without persisting raw error text into transcript content, and has direct component coverage for deterministic and retryable terminal failure rendering.
- [x] Implemented `FIX-010` model capability negotiation: one authoritative model registry now drives per-model request-policy normalization, OpenAI/xAI/Google/Anthropic all reuse shared request builders for `chat()` and `streamChat()`, fixed-default OpenAI models omit unsupported temperature params, and unsupported explicit reasoning budgets fail locally as structured `model_capability` errors.
- [x] Implemented `FIX-009` recovery semantics and truthful run outcomes for timeline-based surfaces: structured error envelopes now survive through stream processor, reducer, and timeline state; retryable UI affordances no longer default to true for deterministic failures; and server finalization derives `runStatus` from explicit run facts while emitting one fallback assistant explanation for deterministic no-answer failures.

## Deferred / Parking Lot

- [ ] Active-learning screening priority (ASReview-style ranking)
- [ ] PRISMA flow diagram generation
- [ ] Risk of bias tools (RoB 2 / ROBINS-I)
- [ ] GRADE evidence profile artifacts
- [ ] Table/Figure extraction via Marker or Nougat
- [ ] MCP abstraction layer for external tools
- [ ] Inngest integration for long-running loops
- [ ] Per-paper deep specialist agents
- [ ] Full command-palette orchestration UI
- [ ] Cross-provider arbitration agent

## Legacy Source Documents

These are no longer active trackers:

- `docs/plans/codex-agentic-plan.md`
- `docs/plans/claude-agentic-plan.md`
- `docs/plans/agent-runtime-remediation/README.md`

They are retained only as superseded source material or supporting pointers. Update this file instead.
