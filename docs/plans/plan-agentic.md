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

Supporting design detail may still live under:
- `docs/plans/agent-runtime-remediation/*.md`
- `docs/plans/chat-runtime.md`
- `docs/plans/transparency-ui.md`

Those files are supporting references only. Active status lives here.

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
- Runtime ownership and terminal truth are materially stronger on current `main`, but `FIX-011b` remains open as a narrow shared-runtime delta rather than a new architecture program.
- A fresh runtime audit on `2026-04-16` found the currently active `FIX-011b` delta:
  - stale-writer exclusion after replace/cancel is still too soft
  - cancelled terminal truth still needs parity across live stream, replay, recovery, and blocked-card dismissal
  - clarification hydration on long lineages still needs the newest relevant window
  - post-answer auxiliary work still needs a degrade-only success boundary
- Durable continuation is materially stronger than before:
  - strict continue remains strict
  - retry/replace can now prefer checkpoint-backed or durable continuation over restart-from-zero when the source is proven
- `ask_user` is already runtime-safe and request-bound:
  - canonical identity is `sourceRunId + callId`
  - `questionId` support already exists as additive question-level structure
  - answer/default/cancel are structured runtime actions, not shell-local hacks
- Tool boundaries are materially better:
  - typed tool payload parsing
  - structured tool-boundary failures
  - no fake `{}` coercion for invalid payloads
- Search transparency is materially better:
  - semantic receipts for the main search tools
  - shared query/count/source semantics
  - continuation tokens hidden behind server-owned contracts
- Popup is now a truthful reduced subset of the shared runtime rather than a separate runtime model.
- Study-scoped stream entry now canonicalizes owned `projectId` before runtime start, popup/context validation, and tool-scope selection, so `studyId`-only requests no longer degrade into accidental global-scope runs.
- The remaining major platform debt is no longer "invent the architecture." It is:
  - finish convergence
  - remove duplication
  - formalize decisioning
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
- [ ] `A-001` Retire `FIX-011b` by closing the currently known shared-runtime delta on current production truth.
  - outcome:
    - replaced/cancelled runs cannot persist stale writes or finalization after ownership loss
    - cancelled terminal truth converges across live stream, replay, recovery, and client lifecycle, including blocked-card dismissal
    - clarification hydration stays correct on long lineages instead of depending on the oldest scanned history
    - useful completed runs cannot be retro-failed by post-answer auxiliary work
    - `U1.6` can resume as sign-off instead of runtime bug discovery
    - sign-off then depends on quality evidence from [`plan-agent-quality.md`](./plan-agent-quality.md)
  - supporting detail:
    - [`agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md`](./agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md)

- [ ] `A-002` Complete `U4` legacy/runtime cleanup after sign-off.
  - outcome:
    - no duplicate state machines
    - no legacy branches left as drift magnets

- [ ] `A-003` Ship `CAG-020` crash-safe long-loop continuation and no-forward-progress detection.
  - outcome:
    - long-running work can pause, recover, or stop honestly without losing the next valid safe step

### Track B — Tool System and Autonomy Boundaries

Goal:
- a smaller, safer, more legible action surface with explicit rules for what the agent may do and when

Active work:
- [ ] `B-001` Ship `CAG-004` idempotency envelopes for all mutating tools.
  - outcome:
    - retries are safe
    - duplicate side effects are bounded
    - tool results become easier to reason about and recover from

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
- [ ] `C-001` Redesign `ask_user` into a first-class decision system.
  - direction owner:
    - [`agent-runtime-remediation/ask-user-v2-design-direction.md`](./agent-runtime-remediation/ask-user-v2-design-direction.md)
  - target outcome:
    - one to three tightly coupled questions
    - structured option + nuance support
    - durable decision objects instead of thin answer strings

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

1. Finish Track A enough that the runtime is closed, honest, and sign-offable.
2. Tighten Track B so autonomy and tool boundaries are explicit before widening capability.
3. Upgrade Track C so high-impact human decisions are clearer and more durable.
4. Deepen Track D so LitRev becomes meaningfully better at scientific work, not just more agentic.

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

- [x] Stream-entry owned-scope canonicalization for study-scoped runs is now documented as part of current runtime truth; `studyId`-only requests carry the resolved owning `projectId` into runtime options instead of degrading tool scope to global.
- [x] Checkpoint-backed retry/replace continuation is now shipped for the main surfaces.
- [x] Shared blocked clarification identity and resolution are now materially runtime-owned.
- [x] Popup now runs on the shared runtime as a truthful reduced subset.
- [x] Search receipts and shared search-count semantics are materially stronger on the main surfaces.
- [x] Typed tool-boundary failures now survive provider -> runtime -> UI as structured errors.
