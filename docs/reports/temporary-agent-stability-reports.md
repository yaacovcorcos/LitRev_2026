# Temporary Agent Stability Recommendation

This file is synthesis material only. It is not a canonical plan tracker.

Canonical ownership remains in:

- `docs/plans/plan-agentic.md` for active fix status, ordering, and roadmap truth
- `docs/plans/chatRuntime.md` for shared runtime contract truth
- `docs/plans/transparencyUI.md` for transparency/message-boundary truth
- `docs/plans/plan-prompts.md` for prompt-side hygiene rules
- `docs/plans/agent-runtime-remediation/plan-fix-012-baseline-stability.md` for `FIX-012` execution detail

## Provenance

This recommendation was produced by comparing and reconciling:

- Agent 2 Report
- Agent 3 Report
- Agent 4 Report
- Agent 5 Report
- Agent 3 Combined Recommendation
- Agent 2 Combined Recommendation

The final choice is:

- use **Agent 3 Combined Recommendation** as the main architectural backbone
- use **Agent 2 Combined Recommendation** for rescue ordering and product-priority sequencing
- keep the strongest runtime-discipline ideas from Agent 4
- keep the strongest deferred-action, compaction, and evaluation ideas from Agent 5

## Executive Decision

The best long-term path is **not**:

- rewrite the entire agent from scratch
- add a second runtime or second event system
- make provider-native reasoning the product's main transparency layer
- widen the tool/action surface before tightening safety and recovery
- treat burn-in as the current rescue plan

The best long-term path **is**:

1. keep LitRev's existing shared runtime and durable recovery foundation
2. harden it into one stricter event-sourced runtime operating system
3. make visible output clean and runtime-led by default
4. make recovery bounded, explicit, and truthful
5. turn blocked work into typed deferred runtime state instead of prompt prose
6. reduce context bloat and prompt-owned system glue
7. prove stability with reducer tests, scenario tests, evals, telemetry, and only then formal burn-in

Short version:

**LitRev should become one strict shared runtime with durable checkpoints, deferred actions, capability-scoped mutations, facts-first UI, and test-owned recovery truth.**

## What Is Actually Broken

From first principles, the current agent feels unstable when these boundaries are weak:

1. user-visible answer vs machine/runtime scaffolding
2. structured process trace vs provider-native reasoning
3. durable runtime truth vs optimistic local UI inference
4. truthful bounded recovery vs vague reconnect heuristics
5. minimal execution context vs mixed, bloated prompt context
6. shared runtime semantics vs shell-specific drift between `/ai` and `project`

When those boundaries are weak, the user sees:

- internal junk in the transcript
- ugly or low-value "thinking"
- wrong recovery affordances
- brittle long-running execution
- repeated confusion around continue/retry/reload
- different semantics depending on which shell they used

So the main problem is not "the model is dumb." The main problem is:

**the runtime contracts are still too weak, too leaky, and too dependent on prompt or provider behavior.**

## Settled Design Decisions

These should be treated as locked unless new evidence forces a revision.

### 1. One shared runtime truth

`/ai` and the two `project` entrypoints must continue to share one runtime/reducer/event truth. No second runtime, no second event family, no shell-specific lifecycle semantics.

### 2. Process trace is primary

Default transparency must be based on runtime facts we own:

- progress
- tool lifecycle
- checkpoints
- blocker/deferred state
- terminal state

Provider-native reasoning is optional plumbing, not a required UX dependency.

### 3. Default mode stays `summary`

The supported modes should remain:

- `off`
- `summary`
- `full`

Semantics:

- `off`: process trace only
- `summary`: process trace plus compact runtime-derived summary
- `full`: `summary` plus raw provider-native reasoning when explicitly requested and available

### 4. Raw provider reasoning is debug-only product value

Provider-native reasoning can remain available in `full` mode, but it must not drive the default product experience and the system must work well when the provider exposes no reasoning at all.

### 5. Recovery must be bounded and truthful

Every abnormal end must resolve to one truthful next action:

- continue
- retry
- wait for input
- stop with explicit failure

No contradictory same-run states. No fake reconnect promises. No defaulting every broken stream to "network."

### 6. Blocked work must be first-class runtime state

Ask-user, approval, clarification, denied actions, and external waits should all become typed deferred runtime state, not hidden prompt prose.

### 7. Popup remains reduced for now

Popup should inherit shared truth improvements where possible, but it should stay explicitly reduced and excluded from first-wave parity claims.

## Chosen Borrowing Strategy

The best architecture is a selective hybrid, not a wholesale port.

### Borrow strongly from OpenCode-style systems for:

- live runtime strictness
- explicit session/run status discipline
- permission request objects
- bounded retries and visible runtime control

### Borrow conceptually from LangGraph for:

- checkpoint semantics
- pending-write semantics
- resumable interrupted work

### Borrow conceptually from PydanticAI and Letta for:

- deferred actions as typed runtime state
- typed tool outcomes
- explicit human-in-the-loop boundaries

### Borrow selectively from OpenHands for:

- append-only event-log mindset
- replay and lineage discipline

### Borrow selectively from Goose and Aider for:

- narrower tool portfolios
- permission gating
- context budgeting
- validation discipline

### Explicitly reject:

- copying one upstream project wholesale
- monolithic orchestrator ports
- raw provider reasoning as primary transparency
- a second runtime or event system
- widening autonomy before mutation safety exists

## Target Architecture

The target architecture should have these durable layers.

### 1. Canonical Event Authority

There should be one authoritative runtime event contract that owns:

- lifecycle events
- tool lifecycle events
- checkpoints
- deferred actions
- compaction events
- recovery events
- terminal reasons

All shells derive view state from this authority.

### 2. Shared Runtime State Machine

There should be one canonical live state model across `/ai` and `project`, covering states such as:

- `idle`
- `running`
- `retrying`
- `waiting_for_input`
- `approval_required`
- `failed_interrupted`
- `failed_network`
- `completed`

The exact labels can vary, but the contract must be shared and explicit.

### 3. Durable Lineage Layer

LitRev should keep and extend its existing durable assets:

- persisted runs
- persisted events
- checkpoints
- replayable recovery

Persistent truth remains the authority for resume and recovery decisions.

### 4. Deferred Action Layer

Blocked work should become typed runtime state, unifying:

- ask-user
- approval required
- clarification required
- denied action
- external wait

### 5. Mutation Safety Layer

Meaningful mutations should require:

- freshness
- explicit permission policy
- structured receipt
- durable provenance
- optional revert/diff lineage later where that actually matters

### 6. Facts-First UI Layer

The UI should render:

- process trace
- semantic tool receipts
- checkpoints
- blocker/recovery state
- compact runtime-derived summary

It should not scrape assistant prose for product truth and it should not depend on provider-native reasoning to remain understandable.

## Priority Order

This is the correct rescue order.

1. visible-channel cleanliness
2. truthful recovery
3. shared runtime event/reducer discipline
4. deferred actions and checkpointed continuation
5. permission, capability, and freshness boundaries
6. context discipline and compaction
7. tool receipt completeness
8. surface parity
9. evals, telemetry, and operability
10. only then later burn-in and second-wave upgrades

This order is deliberate. The first wave should fix what currently makes the agent feel embarrassing or untrustworthy in day-to-day use. Later durability work should not be allowed to crowd out the baseline rescue.

## Phase-By-Phase Recommendation

## Phase 0: Program Reset And Contract Lock

### Objective

Stop treating burn-in as the current rescue. Make baseline product rescue the explicit top priority and lock the contracts that every later change must obey.

### Actions

1. Keep [plan-agentic.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/plan-agentic.md) as the canonical owner of the active rescue program.
2. Keep `FIX-012` as the main baseline stability program and treat `FIX-011b` as later-stage convergence closeout.
3. Keep [chatRuntime.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/chatRuntime.md) explicit that `U1.6` burn-in remains downstream of baseline rescue.
4. Keep [transparencyUI.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/transparencyUI.md) explicit that process trace is primary and provider reasoning is secondary.
5. Keep [plan-prompts.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/plan-prompts.md) explicit that runtime scaffolding must never be echoed into visible output.
6. Treat this file only as synthesis material for the final direction; do not create a second plan tracker from it.

### Exit Criteria

- no active doc implies burn-in is the substitute for rescue
- the visible-output, transparency, recovery, and surface-parity contracts are all explicit

## Phase 1: Hard Failure Inventory

### Objective

Replace intuition and frustration with a concrete failure catalog that later code work can target and later tests can lock.

### Actions

1. Run manual scenarios on:
   - `/ai`
   - project main conversation
   - project side-panel copilot
2. Exercise at least:
   - normal run
   - tool-heavy run
   - long run
   - interrupted run
   - stale reconnect
   - ask-user
   - retry
   - visible leak attempt
3. For each failure, capture:
   - shell/surface
   - provider/model
   - visible symptom
   - terminal state
   - recovery affordance shown
   - whether visible leakage occurred
   - whether it was runtime, prompt, trace, recovery, or context related
4. Convert every recurring failure into a named regression scenario.

### Exit Criteria

- one concrete failure catalog exists
- every known user-visible failure belongs to a named class
- the first wave of tests/evals can be mapped directly to real failures

## Phase 2: Canonical Runtime Truth

### Objective

Make one shared runtime truth unavoidable.

### Actions

1. Keep one canonical event contract in the shared runtime path.
2. Do not create a second transparency event family.
3. Make the reducer/runtime contract the only source of shell state truth.
4. Reduce shell differences to rendering and capability gates only.
5. Standardize canonical terminal reasons across shared runtime consumers.
6. Add reducer and replay tests for:
   - every event type
   - every terminal reason
   - recovery transitions
   - replay and dedupe edges

### Why This Is Early

Everything else depends on shared runtime truth. If this layer drifts, later UI cleanup and recovery work will only mask symptoms.

### Exit Criteria

- `/ai` and `project` consume one shared runtime truth path
- no shell-specific parser or reducer fork is needed
- event replay and terminal-state tests are reliable

## Phase 3: Visible-Channel Purity And Prompt Hygiene

### Objective

Make the visible answer channel reliably clean and reduce prompt-owned system glue at the source.

### Actions

1. Keep allowlisted stripping only in visible-content normalization.
2. Expand normalization to cover concrete, known machine-only payload families already observed in LitRev.
3. Strip known continuation/runtime scaffolding markers deterministically.
4. Keep telemetry or logging for stripped content so leaks remain debuggable.
5. Remove human-readable continuation wrapper prose wherever structured fields can replace it.
6. Strengthen prompts so visible answers must never echo:
   - continuation wrapper text
   - machine-only labels
   - hidden runtime sections
   - provider-native reasoning in default mode

### Why This Is Early

Visible-channel leakage is part of the current P0 product pain. The agent cannot feel stable while the visible answer channel still looks contaminated.

### Exit Criteria

- normal usage no longer leaks machine scaffolding into visible output
- leak patterns are covered by explicit tests
- upstream continuation and prompt paths carry less narrative system glue

## Phase 4: Runtime-Led Transparency Completion

### Objective

Make transparency good without depending on provider-native reasoning.

### Actions

1. Keep the mode contract:
   - `off`
   - `summary`
   - `full`
2. Keep `summary` runtime-led and derived from existing runtime facts.
3. Never create a second narration stream.
4. Keep process trace primary and compact runtime summary secondary.
5. Keep raw provider reasoning in `full` only.
6. Degrade cleanly to process trace only when no honest summary can be derived.
7. Keep summary derivation shared across `/ai` and `project`.

### Why This Is Early

This is part of the baseline rescue, not late polish. The product must become understandable even on providers with zero reasoning support.

### Exit Criteria

- default transparency works well with no provider reasoning support
- raw provider reasoning is no longer needed for a comprehensible product
- `/ai` and `project` render the same summary semantics

## Phase 5: Recovery Truth And Shared Terminal States

### Objective

Stop lying about interruptions and make the next step obvious and bounded.

### Actions

1. Finalize one shared terminal-reason vocabulary.
2. Use `failed_interrupted` for abnormal endings without transport proof.
3. Reserve `failed_network` for actual transport/network evidence.
4. Force cleanup of pending or running tools on abnormal termination.
5. Ensure each abnormal end produces exactly one bounded next action.
6. Never show reconnect or continue unless durable truth supports it.
7. Keep paused-for-input as a first-class successful handoff state where appropriate.

### Why This Is Early

Recovery lies destroy trust. Users can tolerate failure more easily than they can tolerate dishonest or contradictory failure semantics.

### Exit Criteria

- interrupted runs are no longer mislabeled as network failures by default
- recovery affordances are bounded and non-contradictory
- shell behavior is aligned through the shared runtime path

## Phase 6: Deferred Actions And Checkpointed Continuation

### Objective

Turn blocked and resumable work into first-class runtime state.

### Actions

1. Generalize the current ask-user path into a broader deferred-action model.
2. Support typed blocked states for:
   - user clarification
   - approval required
   - external wait
   - denied action
3. Persist significant work through checkpoints.
4. Use pending-write or equivalent semantics so successful substeps are not unnecessarily rerun after downstream failure.
5. Make continuation operate from checkpoint truth rather than prompt prose.

### Why This Is Middle-Wave

This is a major stability multiplier, but it should build on cleaner runtime truth and recovery semantics instead of competing with them.

### Exit Criteria

- retries and continues are checkpoint-based
- blocked work is explicit runtime state
- interrupted runs can resume from durable truth instead of optimistic UI inference

## Phase 7: Permission, Capability, And Freshness Boundaries

### Objective

Make the action surface smaller, safer, and easier to reason about.

### Actions

1. Introduce capability-scoped agent/runtime profiles.
2. Define a permission engine for dangerous or stateful actions.
3. Separate:
   - allowed tool family
   - approval requirement
   - autonomy level
   - shell-specific exclusions
4. Introduce read-before-write and freshness guards for mutable resources.
5. Start with the highest-value mutable targets:
   - protocol state
   - artifacts
   - study mutations
   - broader file or code mutation only if the product surface truly needs it later

### Why This Comes After Recovery

The first wave should make the current system clean and honest. This phase is where the agent becomes safer and less chaotic when it acts on mutable state.

### Exit Criteria

- wrong-tool execution drops
- stale-state mutation risk drops
- approval-required work becomes structurally explicit rather than prompt-shaped

## Phase 8: Context Discipline And Compaction

### Objective

Make long sessions survive without collapsing into prompt noise or unstable behavior.

### Actions

1. Audit context assembly for duplication, stale blocks, and low-value payloads.
2. Define explicit budget ceilings for:
   - continuation payload
   - tool carry-forward
   - history size
   - visible summary size
3. Compact older context as an explicit runtime event.
4. Make compaction durable and inspectable.
5. Use smaller and more stable prompt prefixes and context processors.
6. Keep heavyweight repo-map or codebase summary context restricted to the shells and modes that actually need it.

### Why This Is Later Than Cleanliness And Recovery

Context discipline is a major long-run stability lever, but it is easier to improve once the shared runtime, visible channel, and recovery truth are already cleaner.

### Exit Criteria

- long runs degrade gracefully instead of collapsing unpredictably
- compaction is explicit and testable
- continuation payloads are materially smaller and less redundant

## Phase 9: Semantic Tool Receipts

### Objective

Make the trace factual, semantic, and useful across the main tool families.

### Actions

1. Standardize semantic receipt fields for:
   - search
   - read/inspection
   - delegation
   - study mutations
   - protocol mutations
   - artifact-producing actions
2. Ensure each family has consistent:
   - title
   - input preview
   - outcome summary
   - detail items
   - duration
   - status
3. Add contract tests for each receipt family.

### Why This Matters

The process trace only works as a product layer if tool transparency is factual, stable, and easy to scan.

### Exit Criteria

- all important tool families render semantic receipts
- receipts are factual and runtime-led across main shells

## Phase 10: Surface Parity And Shell Honesty

### Objective

Make `/ai` and both `project` entrypoints visibly consistent while keeping popup honest about its reduced scope.

### Actions

1. Verify parity for:
   - summary semantics
   - terminal-reason semantics
   - recovery affordances
   - ask-user truth
   - visible-channel safety
2. Keep popup honesty-only until real convergence is achieved.
3. Reject any new bespoke runtime semantics in one shell.

### Exit Criteria

- `/ai` and `project` consume one runtime truth with materially matching behavior
- popup remains explicit about what it does and does not support

## Phase 11: Evals, Telemetry, And Operability

### Objective

Make stability measurable and enforceable.

### Actions

1. Expand unit and contract tests for:
   - reducer transitions
   - terminal reasons
   - summary derivation
   - visible-content normalization
   - deferred-action state
2. Add scenario evals for:
   - interrupted runs
   - blocked actions
   - ask-user
   - retry and continue truth
   - long-run compaction
   - replay parity
3. Emit telemetry for:
   - run success
   - interrupted rate
   - recovery success
   - retry success
   - stripped leak events
   - ask-user recovery truth
   - long-run completion
4. Define first-triage playbooks for:
   - visible leak
   - wrong recovery affordance
   - stuck run
   - parity drift
   - context collapse

### Why This Comes Before Burn-In Reentry

Stability should be measured by tests and runtime signals before it is blessed by canary validation.

### Exit Criteria

- stability is measurable with tests and telemetry
- known failure classes have direct detection and triage paths
- the team can distinguish regressions from provider noise or one-off failures

## Phase 12: Burn-In Reentry And Later-Wave Upgrades

### Objective

Resume formal burn-in only after the baseline rescue is real, then pursue second-wave durability features.

### Actions

1. Re-enter [chat-runtime-burn-in.md](/Users/yaacovcorcos/LitRev_2026/docs/runbooks/chat-runtime-burn-in.md) only after:
   - visible-channel leaks are materially gone
   - summary mode works without provider reasoning
   - recovery truth is bounded and believable
   - long tool-heavy runs are no longer embarrassing in normal usage
2. After rescue and burn-in readiness, consider later-wave upgrades such as:
   - snapshot/revert/diff lineage
   - targeted coordination memory blocks
   - pattern-based stuck detection beyond simple caps
   - deeper popup convergence
   - stronger execution sandboxing if the action surface expands

### Why These Are Deferred

They are valuable, but they are not the first blockers to baseline usability and trust.

### Exit Criteria

- burn-in becomes a validation procedure instead of bug discovery
- later-wave work is chosen from a stable base, not while the rescue is still incomplete

## Testing And Validation Program

The stability program should be proven at multiple layers.

### 1. Reducer and runtime contract tests

Must cover:

- every important event type
- every terminal reason
- replay and dedupe
- deferred-action transitions
- abnormal-end cleanup
- continue/retry affordance decisions

### 2. Renderer and visible-output safety tests

Must cover:

- summary mode hides raw provider reasoning
- `full` mode shows raw provider reasoning only as an additive advanced layer
- machine-only continuation scaffolding is stripped deterministically
- legitimate assistant prose is preserved
- grouped trace rendering stays honest

### 3. Scenario and integration tests

Must cover:

- provider without reasoning support
- provider with reasoning support in `summary`
- provider with reasoning support in `full`
- long tool-heavy run
- interrupted run with valid continue
- interrupted run with invalid continue
- ask-user pause/resume
- retry after failure
- long-run compaction

### 4. Manual acceptance matrix

Must cover:

- `/ai`
- project main conversation
- project side-panel copilot
- compact/mobile sanity where relevant
- popup honesty sanity

## Acceptance Standard Before Burn-In

Do not resume formal burn-in until all of these are true:

1. ordinary manual use no longer leaks machine scaffolding into visible output
2. `/ai` and `project` are understandable in `summary` mode with no provider reasoning support
3. interrupted runs no longer default to dishonest network explanations
4. recovery always presents one bounded next action
5. ask-user and other blocked states survive interruption truthfully
6. long tool-heavy runs are usable enough that the product no longer feels fundamentally broken
7. reducer, runtime, renderer, and scenario tests lock all of the above

## What To Defer

These are important, but they are not first-wave rescue work:

- broad snapshot/revert/diff lineage
- broad always-visible memory blocks
- advanced stuck-detection services
- popup full convergence
- execution sandboxing beyond current need
- major provider-layer expansion that does not directly improve runtime truth

## What To Explicitly Reject

1. a full rewrite before locking the runtime contracts
2. a second event system or second runtime beside the shared one
3. raw provider reasoning as the main transparency product
4. prompt-heavy runtime glue as the primary control mechanism
5. a monolithic orchestrator import from another repo
6. broad autonomous tool exposure before permission and freshness boundaries exist
7. pretending popup has parity it does not have

## Final Combined Recommendation

If LitRev wants the highest-probability path to a stable, high-quality agent, the system it should build is:

- as strict as OpenCode in live runtime discipline
- stronger than OpenCode in durable recovery and replay
- conceptually closer to LangGraph for checkpoint and pending-write semantics
- conceptually closer to PydanticAI and Letta for deferred actions and typed outcomes
- conceptually closer to Goose and Aider for capability scoping, validation, and context discipline
- better than all of them in product-facing transparency discipline

The one-sentence final recommendation is:

**build one event-sourced shared runtime with durable checkpoints, typed deferred actions, strict visible-channel separation, narrow capability envelopes, runtime-led transparency, and test-owned recovery truth, then prove it with evals and telemetry before calling it stable.**
