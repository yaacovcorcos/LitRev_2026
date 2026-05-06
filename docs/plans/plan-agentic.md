# Agent Platform Plan

## Authority and Scope

This is the single canonical plan for LitRev's agent platform.

It owns:
- runtime architecture
- orchestration and control flow
- decisioning and user-interrupt contracts
- tool-system boundaries and delegation
- cross-surface truth for `/ai`, project copilot, and popup
- search/research workflow product behavior
- the long-range product roadmap for making LitRev the best scientific copilot in the world

It does not own:
- memory, retrieval, grounding, and prompt-library internals
  - use [`plan-memory.md`](./plan-memory.md)
- agent-specific quality, reliability, security, rollout, and performance programs
  - use [`plan-agent-quality.md`](./plan-agent-quality.md)
- broad repo-wide testing ergonomics or CI taxonomy
  - use [`plan-testing-execution.md`](./plan-testing-execution.md)
- product-area onboarding flow details
  - use [`plan-guided-setup.md`](./plan-guided-setup.md)

Supporting design detail is intentionally sparse. The only retained agent-platform design note outside this plan is [`docs/design/agent-decision-system.md`](../design/agent-decision-system.md), which informs the next `ask_user` decision-system wave. Active status still lives here.

## North Star

LitRev should become the most trustworthy, effective, and durable research agent in its category:
- excellent at literature work
- explicit about uncertainty
- safe under failure
- fast enough to feel sharp
- structured enough to improve continuously
- robust enough for millions of scientists

The agent should not merely "feel smart." It should be:
- correct more often
- recoverable when wrong
- reviewable when consequential
- efficient under scale
- operable under real production load

## Product and Architecture Principles

1. Runtime truth beats prompt folklore.
   - blocked state, continuation, retries, tool results, and terminal reasons belong to typed runtime state

2. Search and evidence beat vibes.
   - scientific answers should be grounded in explicit evidence collection, not narrative confidence

3. Bounded autonomy beats wide ambiguity.
   - the agent should have strong specialist paths and explicit tool envelopes instead of one giant `general` escape hatch

4. Visible process beats raw thoughts.
   - user trust should come from truthful process trace, receipts, checkpoints, and clear blockers, not from provider-native reasoning dumps

5. Durable state beats restart-from-zero.
   - when useful work already exists, the next step should continue from proven state whenever it is safe

6. One engine, multiple shells.
   - `/ai`, main project conversation, side-panel copilot, and popup may differ in density and capability, but not in core runtime truth

7. Quality is part of architecture.
   - if a design is hard to test, hard to reason about, or hard to recover, it is not good enough yet

## Current Architecture

- The main chat surfaces already share one runtime/reducer foundation for normalized stream events, tool lifecycle, checkpoints, structured terminal errors, and blocked clarification.
- The known `FIX-011b` shared-runtime code delta is now closed on `main`:
  - stale replaced/cancelled workers fail closed on ownership loss
  - cancelled terminal truth converges across live stream, durable cancellation, recovery, and blocked-card dismissal
  - artifact-aware durable runs do not treat an HTTP observer disconnect as semantic cancellation; user-visible cancellation flows through the run cancellation API, the in-process fast path, and durable run-status monitoring
  - final stream reconciliation emits `run_end` from persisted terminal truth when a stale worker loses the finalization race
  - clarification hydration uses the newest relevant lineage window
  - useful completed runs are not retro-failed by optional post-answer work
- Run event append is now safer under load:
  - per-run sequence allocation is serialized by a transaction-scoped advisory lock before reading the latest event sequence
  - event writability checks are read-only and no longer update the `AgentRun` row before every event append
  - transient serialization/deadlock conflicts retry through the event append loop instead of bubbling as unknown runtime failures
- Run phase truth is centralized:
  - `verify -> plan` is an intentional legal transition for continuation runs that need to re-plan
  - plan, tool, artifact, and user-input events map through one shared state-machine module instead of scattered switch statements
  - phase-drifted pending decision requests can still be paused by the conversation admission guard before new work starts
- `U1.6` is now a recurring production-confidence and certification loop, not a global development blocker:
  - it still needs a fresh deployment-level burn-in window, scoped cohort evidence, and the manual abnormal-end spot checks from `docs/runbooks/chat-runtime-burn-in.md`
  - it gates formal runtime sign-off and destructive post-sign-off cleanup such as deleting fallback/legacy paths
  - it must not block additive agent improvements, bug fixes, eval expansion, security hardening, tool/autonomy hardening, decision-system work, research-quality work, or non-destructive runtime hardening that preserves existing contracts
- Durable continuation is materially stronger than before:
  - strict continue remains strict
  - retry/replace can now prefer checkpoint-backed or durable continuation over restart-from-zero when the source is proven
  - interrupted latest tool calls now use a runtime-owned restart policy: read-only calls and idempotent mutations can seed a bounded continuation, while unsafe or decision-sensitive calls still stop truthfully
- `ask_user` is already runtime-safe and request-bound:
  - canonical identity is `sourceRunId + callId`
  - `questionId` support already exists as additive question-level structure
  - answer/default/cancel are structured runtime actions, not shell-local hacks
  - new pauses are mirrored as `user_input_required` stream/run events but also persisted as canonical `DecisionRequestRecord` rows
  - resumed answers/defaults/cancellations are mirrored as `user_input_resolved` stream/run events but also persisted as canonical `DecisionResolutionRecord` rows
  - pending clarification lookup prefers first-class decision records and falls back to run events for legacy lineages
- Tool boundaries are materially better:
  - typed tool payload parsing
  - structured tool-boundary failures
  - no fake `{}` coercion for invalid payloads
  - mutating-tool idempotency receipts now settle on returned, thrown, and aborted executor failures; stale running leases remain the crash/process-death fallback instead of a normal cancellation path
- Search transparency is materially better:
  - semantic receipts for the main search tools
  - shared query/count/source semantics
  - continuation tokens hidden behind server-owned contracts
  - OpenAlex Crossref enrichment is bounded, abort-aware, and non-critical-path, so optional metadata lookup cannot hold the base search result hostage
- Search source selection is runtime-owned:
  - PubMed is the default and only exposed search source unless the user explicitly names OpenAlex, Semantic Scholar, or S2 API/search as a source
  - `recommend_studies` is gated with the Semantic Scholar policy because it calls the Semantic Scholar recommendations API
  - the same request-scoped tool envelope is passed through parent runs, executable plans, and delegated search sub-agents
  - a pre-execution tool-availability middleware blocks hidden non-PubMed search calls before any OpenAlex or Semantic Scholar network request can start
- Popup is now a truthful reduced subset of the shared runtime rather than a separate runtime model.
- Study-scoped stream entry now canonicalizes owned `projectId` before runtime start, popup/context validation, and tool-scope selection, so `studyId`-only requests no longer degrade into accidental global-scope runs.
- The remaining major platform debt is no longer "invent the architecture." It is:
  - finish convergence
  - remove duplication
  - finish the decision-quality UX and policy follow-through on top of the new persisted decision foundation
  - tighten autonomy/tool boundaries
  - make research workflows deeper and more reliable

## Open-Source Position

The active benchmark artifact is:
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](../reviews/2026-04-16-agentic-open-source-benchmark.md)

Primary external references for this plan:
- `openai/codex`
- `openclaw/openclaw`
- `anomalyco/opencode`
- `vercel/ai`
- `langchain-ai/langgraph`
- `langchain-ai/deepagents`
- `pydantic/pydantic-ai`
- `openai/openai-agents-python`
- `Future-House/paper-qa`
- `stanford-oval/storm`

Rule:
- borrow ideas, contracts, and testing patterns
- never copy external code verbatim
- never let external repos become implicit LitRev policy

## Program Tracks

### Track A — Runtime Core and Durable Execution

Goal:
- one production-grade runtime that remains truthful under disconnects, retries, paused input, and long-running multi-step work

Active work:

- [ ] `A-002` Complete `U4` legacy/runtime cleanup after sign-off.
  - outcome:
    - no duplicate state machines
    - no legacy branches left as drift magnets
  - sequencing:
    - wait for U1.6 sign-off evidence before deleting fallback or legacy runtime paths

- [ ] `A-003` Ship `CAG-020` crash-safe long-loop continuation and no-forward-progress detection.
  - outcome:
    - long-running work can pause, recover, or stop honestly without losing the next valid safe step
    - the current foundation already advances durable-progress timestamps only at replayable forward-progress boundaries, and budget/repeat/no-answer exits already fail truthfully unless a real answer or durable output exists
    - remaining work should focus on broader crash-safe pause/recover behavior for long research loops, not re-solving the shipped outcome semantics
  - sequencing:
    - additive, well-tested continuation hardening may proceed while U1.6 evidence is being collected

### Track B — Tool System and Autonomy Boundaries

Goal:
- a smaller, safer, more legible action surface with explicit rules for what the agent may do and when

Active work:
- [ ] `B-002` Ship `CAG-013` and finish narrowing `general` mode into a coordination surface rather than a superuser mode.

- [ ] `B-003` Ship `CAG-014` delegation policy matrix by mode, autonomy, and risk.
  - outcome:
    - clear rules for when to ask, suggest, propose, auto-apply, or delegate

- [ ] `B-004` Ship `CAG-015` tool-portfolio telemetry and pruning.
  - outcome:
    - unused or confusing tools are retired
    - the agent stays sharp instead of sprawling

### Track C — User Decisioning and Interaction Contracts

Goal:
- make user interruptions rare, crisp, trustworthy, and reusable

Active work:
- [ ] `C-001` Complete `ask_user` decision-quality follow-through on top of the first-class `DecisionRequest` foundation.
  - direction owner:
    - [`docs/design/agent-decision-system.md`](../design/agent-decision-system.md)
  - target outcome:
    - high-trust decision UI and resolved-history rendering
    - partial, superseded, interrupted, stale, and expired lifecycle handling where product flows need it
    - decision-quality policy layered on top of the existing clarification budget guardrails
    - decision-memory reuse where appropriate
    - the current runtime foundation already persists canonical decision requests/resolutions while preserving legacy stream-event compatibility

- [ ] `C-002` Ship `CAG-019` user-visible run board for tasks, blockers, and clarifications.
  - outcome:
    - users can see what the agent is doing, what is stuck, and what needs a decision

- [ ] `C-003` Ship `CAG-026` canonical structured message parts.
  - outcome:
    - no hidden assistant markup as an active product contract
    - one clean visible-text plus structured-parts boundary

- [ ] `C-004` Ship `CAG-005` controlled optional reasoning transparency without regressing to provider-led comprehension.
  - outcome:
    - `off`, `summary`, and `full` remain honest and understandable across providers

### Track D — Research Workflow Intelligence

Goal:
- make LitRev exceptional at the actual work scientists need done

Active work:
- [ ] `D-001` Ship `CAG-006b` lazy context loading and pointer-first context assembly.
  - outcome:
    - lower context waste
    - more scalable long-running work

- [ ] `D-002` Ship `CAG-008b` broader structured query planning and validation across search flows.
  - outcome:
    - better search decomposition
    - fewer weak or redundant searches

- [ ] `D-003` Ship `CAG-010` centralized context-budget policy.
  - outcome:
    - context use becomes deliberate, predictable, and measurable

- [ ] `D-004` Ship `CAG-016` dependency-aware `AgentTask` graph and APIs.
  - outcome:
    - the agent can plan and expose multi-step work as a real graph rather than ad hoc narration

## Execution Order

1. Keep U1.6 running as the production-confidence loop and use it to challenge the runtime continuously.
2. Continue additive Track A hardening and agent feature work while U1.6 evidence is being collected.
3. Do not perform destructive `A-002` / `U4` cleanup or formal runtime sign-off until U1.6 evidence supports it.
4. Tighten Track B so autonomy and tool boundaries are explicit before widening capability.
5. Upgrade Track C so high-impact human decisions are clearer and more durable.
6. Deepen Track D so LitRev becomes meaningfully better at scientific work, not just more agentic.

## Dependencies and Boundaries

- Memory, retrieval, grounding, extraction, and prompt-library work live in [`plan-memory.md`](./plan-memory.md).
- Agent quality, rollout, security, performance, incident response, and eval work live in [`plan-agent-quality.md`](./plan-agent-quality.md).
- Broad repo-wide CI taxonomy stays in [`plan-testing-execution.md`](./plan-testing-execution.md).
- App-wide speed budgets stay in [`plan-speed-performance.md`](./plan-speed-performance.md).

This plan should never absorb those owners by duplication. It should depend on them explicitly.

## Validation Rule

Agent platform work is not done when "the code compiles."

It is done when:
- runtime behavior is explicit
- surface truth is consistent
- the failure mode is observable
- the continuation/retry path is honest
- the relevant quality work in [`plan-agent-quality.md`](./plan-agent-quality.md) exists

## Recently Completed

- [x] The known `FIX-011b` runtime code delta is closed on `main`: ownership loss fails closed, cancelled terminal truth is durable, clarification hydration uses the newest relevant lineage window, and optional post-answer work is degrade-only after a useful answer.
- [x] Loop outcome semantics are truthful for budget, repeat-guard, no-answer, and durable-progress exits: retry/recovery progress now advances only at replayable forward boundaries.
- [x] Mutating tools now use durable `ToolIdempotencyRecord` receipts across retry/continuation lineage, replay completed results internally, and block duplicate unresolved in-flight mutations.
- [x] `ask_user` now has first-class persisted `DecisionRequestRecord` and `DecisionResolutionRecord` rows while preserving legacy `user_input_required` / `user_input_resolved` stream compatibility.
- [x] Shared write helpers now fail closed on ownership loss, so stale replaced/cancelled workers stop instead of persisting stale writes or stale finalization.
- [x] Stream-entry owned-scope canonicalization for study-scoped runs is now documented as part of current runtime truth; `studyId`-only requests carry the resolved owning `projectId` into runtime options instead of degrading tool scope to global.
- [x] Checkpoint-backed retry/replace continuation is now shipped for the main surfaces.
- [x] Shared blocked clarification identity and resolution are now materially runtime-owned.
- [x] Popup now runs on the shared runtime as a truthful reduced subset.
- [x] Search receipts and shared search-count semantics are materially stronger on the main surfaces.
