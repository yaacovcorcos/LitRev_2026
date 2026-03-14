# Agentic System & AI Orchestration Plan

## Authority and Scope

This is the single canonical plan for LitRev's agent runtime.

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
- **Scoping Mode (P10):** Dedicated pre-protocol routing now runs through a server-owned workflow contract (`discover -> synthesize -> propose -> handoff`) with an exploratory-search cap, low-autonomy search-pack preview instead of a blocking first-pass approval pause, natural-language handoff/default carry-forward, and proposal-only protocol mutation.
- **Reasoning Stream Support (Current):** `reasoning_*` stream events are currently wired end-to-end for Anthropic responses. OpenAI/xAI models can run normally, but their provider adapters do not yet emit normalized reasoning stream parts in the same pipeline.
- **Proposal-State Tool Context:** Proposal-style tool results now surface whether they are `proposed` vs `auto_applied` in the model-visible tool-message context, so assistant replies can distinguish review-only changes from already-applied ones.
- **Plan Heuristic Guardrails:** Plan-before-act heuristics now require explicit extraction/writing verbs for `extract_pdf` and `update_note`, reducing false execution plans for read-only PDF/section questions.
- **Delegation Runtime Now Uses The Shared Safety Contract:** delegated child runs now reuse the same autonomy-aware execution/finalization core as direct execution, level-1 delegated actions fail as structured approval-required blocks instead of running, delegated proposal artifacts stay reviewable unless direct policy allows auto-apply, and delegated `ask_user` bubbles through the existing parent `user_input_required` flow.
- **Popup Runtime Is Now Honest About Edit Limits:** popup remains on a non-artifact path, but its tool contract is now explicitly read-only/advisory for edit intents. It no longer exposes invisible protocol-mutation flows and instead routes edit/application work to the main copilot surface.
- **General Mode And Clarification Now Use Explicit Honest Contracts:** normal agentic paths now assemble tools through contextual mode+scope filtering, `general` no longer widens to all tools, disabled/global delegation tools are hidden before exposure, `ask_user` remains the sole blocking clarification primitive in the global base prompt, and `<choices>` guidance is scoped to artifact/chat surfaces as optional suggestion-only output.
- **Model Requests Now Use Per-Model Capability Policy:** one authoritative model capability registry now feeds a shared request-policy normalizer, OpenAI/xAI/Google/Anthropic all reuse it before send, fixed-default OpenAI models omit unsupported `temperature`, and unsupported explicit reasoning budgets fail locally as structured `model_capability` errors instead of raw provider 400s.
- **Protocol Mutation Uses Shared Field-Aware Normalization:** `update_protocol`, same-turn tool-call sanitization, and repeat detection now reuse the same field/value normalize-classify path so unambiguous wrapper shapes are repaired consistently, whitespace-only field mismatches no longer diverge between validation and execution, and normalization/hashing paths cap nested input depth safely.
- **Tool Prerequisites Now Gate High-Risk Actions Before Execution:** tool metadata now declares project/study/protocol prerequisites in the shared pre-execution path, screening actions also gate on resolvable non-empty criteria, and blocked actions emit structured `missing_prerequisite` envelopes before a tool runs. Generic PDF file existence is still verified inside PDF tools rather than the shared prerequisite vocabulary.
- **Run Recovery Semantics Are Structured On Timeline-Based Surfaces:** `/ai` and project copilot now preserve deterministic failure envelopes into client state, retry affordances are derived from structured metadata, and server finalization uses explicit run facts so failed no-answer runs no longer masquerade as `completed`. Popup now preserves a truthful reduced subset of shared progress/checkpoint/error/blocking semantics, but it still does not claim full receipt/artifact parity.
- **Run Lifecycle Integrity Is Now Enforced Across The Main Surfaces:** started runs now finalize exactly once, replace-safe admission requires explicit prior run identity instead of conversation-wide cancellation, and abnormal failure cleanup/dedupe now use the shared runtime/error owners so `/ai` and project copilot fail unfinished tools consistently and render one terminal failure.
- **Abnormal-End Recovery Is Now Server-Authoritative On Main Timeline Surfaces:** `/ai` and project copilot now reconcile known-run broken streams against persisted `AgentRun` + replay-authoritative `RunEvent` truth, clear stale progress/tool activity into explicit recovery states, and drive `Reconnect` / `Retry` / `Stop & Retry` from structured recovery metadata instead of local loading heuristics.
- **Recovery Reconciliation Now Commits The Recovered Terminal Truth End-To-End:** recovered `/ai` and project-copilot runs now promote the replayed terminal `runStatus` back into outer completion/failure handling before fallback cleanup and telemetry fire, and recovery actions are bound to the clicked error item instead of a global “latest recovery” guess.
- **Paused-Input Recovery Truth Now Survives Disconnects:** the existing recovery foundation now treats `paused_for_input` as a first-class non-error terminal outcome, persists and replays the missing durable question/checkpoint/artifact/error states needed to keep current surfaces truthful after disconnects, reconciles same-run timeout/conflict/fallback errors through one shared `runId` authority, and closes the remaining main-conversation reconnect / stop-and-retry wiring gap without claiming new popup parity.
- **Recovery-Critical Persistence Now Uses An Explicit Durability Policy:** recovery-required runtime truth is now authored at the business event boundary instead of relying on the stream route as the first durable owner, observability-only event persistence failures soft-fail without breaking successful runs, and `AgentRun` now records degraded durability explicitly when recovery-critical persistence fails after useful work has already succeeded.
- **Durable Continuation Now Starts Only From Proven Persisted State:** recovery can now recommend `continue_from_durable_state` for audited tool-result and artifact-state cases where the server can prove the next step from current persistence alone, and continuation starts a new run from explicit persisted inputs instead of transcript reconstruction or in-place pseudo-resume behavior.
- **Context Assembly Now Degrades Optional DB-Backed Inputs Honestly:** critical authority still resolves before execution, but optional memory/protocol/ledger/study/project context now loads as best-effort after authority succeeds. When optional context fails, the run continues with a single pre-stream degraded-context checkpoint instead of aborting outright.
- **Running-Run Freshness Now Uses `lastActivityAt`:** `AgentRun.lastActivityAt` is now updated through centralized lifecycle/event helpers plus a quiet-run heartbeat, conversation admission uses it instead of `startedAt`, and stale `running` rows can be cancelled safely instead of poisoning future sends after disconnects.
- **Database Connectivity Failures Are Classified At The Shared Envelope Boundary:** Prisma/pg connection-establishment failures now surface as `database_connection` envelopes instead of generic `PROVIDER_REQUEST_FAILED`, preserving truthful runtime attribution through stream transport and UI rendering.
- **Approved Plan Execution Is Now Server-Constrained:** executable plan artifacts now author and preserve `execution` metadata at artifact creation time, the server loads artifact-bound conversation/project/mode authority before normal run setup, approved tool exposure is the intersection of selected-step tools, the stored plan-authorized ceiling, and current safe mode/scope definitions, and off-plan, out-of-order, non-executable, or now-unavailable plan steps fail through the shared non-retryable `plan_execution` error envelope.
- **Provider-Independent Search Trace Is Stronger Across Main Surfaces:** shared reducers now derive PubMed-specific live progress, factual receipt summaries, and selective grounded checkpoints from search tool facts alone, while the project message bridge preserves those checkpoint semantics so `/ai`, sidebar copilot, and the main project conversation can all expose the same search workflow meaning without depending on provider reasoning.
- **Executable Search Provenance Now Rides The Shared Receipt Path:** runtime evals now exercise the live `AIService.streamChatWithArtifacts()` orchestration path for direct, delegated, zero-result, and failed search scenarios, and the existing `tool_activity` receipt path now preserves compact source/query/count/identifier facts for PubMed, OpenAlex, and Semantic Scholar across `/ai`, sidebar copilot, and the main project conversation without changing final answer prose.
- **Canonical Runtime Docs Authority Is Now Explicit:** this plan remains the single active truth source for shipped agent-runtime status, while supporting remediation plans are limited to fix-level implementation detail instead of parallel status tracking.
- **Popup Now Preserves The Supported Shared Trace Subset:** popup now derives its supported progress, checkpoint, blocking-clarification, and structured terminal-error states through a shared reducer adapter instead of bespoke chunk-only rendering, while remaining intentionally compact and reduced.

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

## Active Fixes
*Immediate remediation work for shipped behavior that is broken, misleading, or lower quality than the intended contract.*

- **`FIX-011b` Runtime stabilization, convergence, and durable continuation**
  - **Severity:** P0 trust/reliability
  - **Symptom:** recovery still relies too much on stream delivery and coarse `running + lastActivityAt` inference; durable user-facing state is not yet guaranteed to survive disconnect/finalization/persistence seams; successful tool/model work can still be undermined by recovery-critical persistence failures; the runtime still lacks trustworthy convergence and continuation from durable completed work; abnormal disconnects are not yet classified durably enough to drive evidence-based hardening.
  - **Desired end state:** one persisted run lifecycle is authoritative for recovery, retry/replace/continue decisions, UI state, telemetry, and burn-in sign-off; the runtime converges from abnormal ends through that lifecycle; durable user-facing recovery truth survives disconnects without inventing ephemeral progress; and users/agents can continue from durable completed work instead of restarting unnecessarily.
  - **Supporting plans:** `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md` for detailed execution thinking, `docs/plans/plan-thinking-v2.md` for durable execution-trace truth, and `docs/plans/plan-chat-unification-v2.md` for cross-surface runtime parity and popup boundary honesty.
  - **Exit criteria:**
    - persisted lifecycle truth is authoritative enough to eliminate indefinite reconnect states on main chat surfaces
    - durable recovery restores authoritative user-facing truth without duplicating or inventing ephemeral progress
    - same-run recovery/failure state converges to one authoritative outcome
    - continuation prefers durable completed work over restart where the runtime can prove that safely
    - feature-freeze burn-in signs off the stabilized runtime before new agent/chat capability work resumes

## Execution Order

Work should proceed in this order unless a production incident forces reprioritization:

1. `FIX-011b` runtime stabilization, convergence, and durable continuation
2. `CAG-001` explicit run-phase state machine
3. `CAG-003` checkpointed retry/resume from durable state
4. remaining roadmap phases after those contracts are stable

## End-to-End Delivery Program

### Track A — Request-Boundary Reliability and Truthful Failure Handling

- `FIX-007` shipped the protocol-mutation normalization/suppression layer.
- `FIX-009` shipped truthful failure handling for timeline-based surfaces: structured error envelopes now survive processor/reducer/timeline state, non-retryable failures no longer default back to retryable UI affordances, and server finalization emits one fallback explanation for deterministic no-answer failures while deriving `runStatus` from explicit run facts. Popup remains a lighter path under `FIX-011`.
- `FIX-010` shipped provider/model request-policy normalization: one authoritative model registry now drives temperature/reasoning capability handling, provider adapters reuse shared builders for `chat()` and `streamChat()`, and blocked reasoning-budget mismatches fail locally as structured capability errors instead of provider-side request failures.

### Track B — Action Eligibility and Honest Execution

- Land `FIX-008` before broader orchestration hardening so the runtime stops attempting impossible work with missing context.
- Treat prerequisite gating as a contract layer, not a prompt tweak.

### Track C — Orchestration Safety and Approval Integrity

- `FIX-001` and `FIX-002` are now shipped, so delegation and approved-plan execution no longer depend on prompt-only guardrails.
- Continue treating this phase as the contract boundary for coordination safety: new orchestration changes should preserve scoped `general`, plan approval integrity, and explicit server-side enforcement.

### Track D — Surface Honesty, Docs, Evals, and Provenance

- `FIX-005a`, `FIX-005b`, `FIX-011`, and the immediate `FIX-011a` reconciliation follow-up are complete, but runtime stabilization remains active under `FIX-011b` because convergence, durable continuation, and disconnect handling are not yet trustworthy enough to treat as finished.
- Popup honesty should stay aligned with the reduced-parity runtime it actually supports, and future surface work should preserve the recovery/action truth model rather than reintroducing bespoke failure semantics or overclaiming parity while `FIX-011b` is active.

## Active Roadmap
*Durable capability and architecture work after the immediate fixes.*

### Phase 0 — Control-Flow Safety and Human Interrupts

- [ ] `CAG-001` Implement persisted run-phase authority for `plan -> ask -> act -> verify -> finalize`, so run lock, recovery, and UI derive from phase state rather than stream heuristics alone
  - V1 active contract: `AgentRun` gains coarse `runPhase` + `phaseEnteredAt` lifecycle truth, `status="paused"` pairs with `runPhase="ask"`, continuation runs begin from `verify`, and the phase contract stays macro-lifecycle only until the persisted boundary writes and phase-aware recovery/readmission consumers are fully shipped.
  - Supporting execution detail continues in `docs/plans/agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`.
- [x] `CAG-002` Baseline `ask_user` tool and typed UI contract shipped
- [x] `CAG-002a` Stateless turn-based clarification flow shipped
- [ ] `CAG-003` Add checkpointed continuation from durable work so reconnect / continue / replace / retry semantics never restart from zero when durable work already exists
- [ ] `CAG-004` Standardize idempotency envelopes for mutating tools
- [ ] `CAG-005` Complete provider-native reasoning stream parity for OpenAI/xAI

### Phase 1 — Search-First Retrieval and Progressive Context

- [x] `CAG-006` Foundation shipped: `read_protocol` and `read_ledger` exist
- [ ] `CAG-006b` Complete lazy context loading and pointer-first context assembly
- [x] `CAG-007` OpenAlex search shipped
- [x] `CAG-008` Baseline delegated search query planning shipped
- [ ] `CAG-008b` Expand structured query planning and validation across broader search flows
- [x] `CAG-009` Runtime search/source receipts shipped for the core search tools via the shared `tool_activity` receipt path
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
- [ ] `CAG-020` Add crash-safe long-loop continuation tokens tied to durable state snapshots/continuation tokens, transport/runtime recovery, and no-forward-progress detection

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
- `docs/plans/agent-runtime-remediation/plan-general-scope-and-clarification.md`

These files are supporting documents. Status, priority, and closure rules live here.

## Recently Completed

- [x] Landed the fifth `FIX-011b` continuation slice: the runtime now persists narrow `RunCheckpoint` continuation seeds only at explicit `tool_result_ready` and `artifact_ready` boundaries, recovery can prefer `continue_from_checkpoint` over weaker replay-order heuristics, and `continueFromRunId` remains the only public continuation selector while popup stays a truthful reduced subset only.
- [x] Landed the fourth `FIX-011b` continuation slice: recovery now upgrades only audited proven-state cases to `continue_from_durable_state`, the stream entrypoint can start a fresh run from explicit persisted tool-result or artifact-state inputs without duplicating the prior user turn, and main timeline surfaces expose a truthful `Continue` action while popup stays a status-only reduced subset.
- [x] Landed scoping equilibrium enforcement: scoping now uses a runtime-owned clarification budget and phase contract, first-pass low-autonomy search-pack planning is preview-only instead of blocking, no-protocol deliverable requests enter scoping as `draft_bootstrap`, and natural-language handoff replies/default carry-forward stop repeated clarification loops.
- [x] Landed the third `FIX-011b` stabilization slice: recovery-critical event persistence now originates at business boundaries instead of the stream route, `AgentRun` records `durabilityState` / `durabilityDegradedReason` when recovery-required persistence fails after useful work, and observability-only runtime events now soft-fail without collapsing an otherwise successful run.
- [x] Landed the second `FIX-011b` convergence slice: reconnect checkpoints are now run-scoped recovery state instead of anonymous timeline breadcrumbs, stronger same-run server truth clears weaker reconnect/timeout/fallback remnants across `/ai`, project copilot, and the main project conversation, and recovery messaging now reflects stalled durable progress or finalization failure instead of spinning indefinitely on generic reconnect text.
- [x] Landed the first `FIX-011b` convergence slice: `AgentRun` now persists `lastDurableProgressAt`, `finalizationState`, and `abnormalEndClassification`, recovery/readmission distinguishes heartbeat freshness from durable forward progress, and route-level regression coverage now includes disconnect-before-terminal and finalization-failure harnesses instead of relying only on optimistic active-run inference.
- [x] Patched the immediate `FIX-011` follow-up regressions: recovered-completed runs now stop before false terminal fallback/error telemetry is emitted, and reconnect / stop-and-retry actions now target the specific timeline error card the user clicked instead of whichever recovery error happened to be newest.
- [x] Completed `FIX-011` shared failure handling and popup parity: `/ai` and project copilot now recover known-run abnormal disconnects against persisted run truth with structured `Reconnect` / `Retry` / `Stop & Retry` actions, popup keeps a truthful reduced recovery subset without fake `Resume`, and running-run freshness now uses `AgentRun.lastActivityAt` plus safe stale-run cleanup instead of conversation-wide cancellation heuristics.
- [x] Completed `FIX-005b` executable evals and search provenance: runtime evals now exercise the live chat orchestration path for direct/delegated/failed/zero-result search scenarios, and the shared `tool_activity` receipt contract now carries compact source/query/count/identifier facts for PubMed, OpenAlex, and Semantic Scholar without changing final answer prose.
- [x] Strengthened popup parity without overstating migration: popup now preserves a truthful reduced shared-trace subset for live progress, grounded checkpoints, blocking clarification, and structured terminal failures via a shared reducer adapter, while remaining intentionally compact and reduced.
- [x] Completed `FIX-005a` docs authority and plan truth: `plan-agentic.md` remains the single active runtime authority, stale split-era `FIX-005` wording was removed from the supporting remediation doc, and popup/shared-runtime/eval maturity claims now stay aligned with the canonical and adjacent active plans instead of drifting into parallel status trackers.
- [x] Strengthened provider-independent PubMed execution trace: shared reducers now emit PubMed-specific live progress, factual receipt summaries, and selective grounded checkpoints from search results alone, and project surfaces preserve checkpoint semantics through the structured message bridge so the same search workflow remains legible across `/ai`, sidebar copilot, and the main project conversation.

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

## Supporting Documents Governance

This plan is the active runtime authority. Supporting remediation documents may
hold fix-level implementation detail, but they are not parallel status
trackers.

Current supporting references:

- `docs/plans/agent-runtime-remediation/README.md`

Supporting detail should live under `docs/plans/agent-runtime-remediation/`
while status, priority, and completion rules stay in this file.
