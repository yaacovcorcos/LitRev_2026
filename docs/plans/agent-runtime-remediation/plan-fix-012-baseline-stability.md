# FIX-012 Baseline Stability and Transparency Reset

## Purpose

This is the supporting execution plan for `FIX-012` in [plan-agentic.md](../plan-agentic.md).

Use this file for:

- the concrete rescue structure for baseline agent stability
- the exact ownership split between runtime truth, visible-channel hygiene, and recovery
- execution slices, validation, and acceptance gates for `FIX-012`

Do not use this file for:

- canonical fix status or roadmap ownership
- long-term agentic roadmap tracking outside `FIX-012`
- popup parity claims beyond the reduced subset it can honestly support today

## Scope

`FIX-012` exists to restore baseline trust and usability on the main agent surfaces:

- `/ai`
- project main conversation
- project side-panel copilot

This fix owns:

- visible-channel cleanliness
- runtime operating discipline on the main surfaces
- runtime-led transparency defaults
- truthful bounded recovery
- the remaining shared-runtime rescue deltas on the main surfaces
- typed deferred blocked states
- prompt/continuation hygiene where it affects visible leakage or brittle recovery
- the first-wave validation program needed before burn-in becomes meaningful again

This fix does not own:

- popup full parity
- broad snapshot/revert lineage as a first-wave requirement
- provider-capability expansion for its own sake
- long-term memory architecture beyond what is required for truthful continuation/recovery

## Authority and Evidence Boundaries

This file is not a second owner for runtime, transparency, or prompt architecture.

- [plan-agentic.md](../plan-agentic.md) owns `FIX-012` status, ordering, and retirement.
- [chatRuntime.md](../chatRuntime.md) owns shared runtime and recovery truth.
- [transparencyUI.md](../transparencyUI.md) owns trace, receipt, summary, and visible-message UX contracts.
- [plan-prompts.md](../plan-prompts.md) owns prompt-side hygiene and degradation rules.
- this file owns only the remaining `FIX-012` rescue sequencing, evidence, and closeout criteria.

Canonical evidence record for `FIX-012`:

- [docs/reports/fix-012-baseline-stability.md](../../reports/fix-012-baseline-stability.md)

Standing scope rule:

- all `FIX-012` slice exit criteria apply only to `/ai`, project main conversation, and project side-panel copilot
- popup is judged only against its honest reduced subset and does not block `FIX-012` retirement

## Locked Contracts

These are the non-negotiable contracts for the rescue.

### 1. One shared runtime truth

`/ai` and the project surfaces must continue to share one canonical runtime/reducer/event truth.

- no second runtime
- no second event family
- no shell-specific lifecycle semantics

### 2. Process trace is primary

The default product transparency path must be grounded in runtime facts we own:

- progress
- tool lifecycle
- checkpoints
- blocker/deferred state
- terminal state

Provider-native reasoning is additive only.

### 3. Transparency modes stay stable

The supported modes remain:

- `off`
- `summary`
- `full`

Semantics:

- `off`: process trace only
- `summary`: process trace plus compact runtime-derived summary
- `full`: `summary` plus raw provider reasoning when explicitly requested and supported

### 4. Recovery must be truthful and bounded

Every abnormal end must converge to exactly one user-visible next step:

- continue
- retry
- wait for input
- stop with explicit failure

### 5. Blocked work must be typed runtime state

Ask-user, approval-required, clarification-required, denied-action, and external waits must not rely on prompt-shaped prose to exist.

### 6. Visible assistant prose must stay clean

Normal visible answer text must never contain:

- continuation/runtime scaffolding
- hidden machine protocol
- raw provider reasoning by default
- machine-only labels or payload families

## Failure Inventory Requirement

Before broad code changes, keep one concrete failure catalog for the current baseline rescue.

Record the live baseline-rescue evidence in:

- [docs/reports/fix-012-baseline-stability.md](../../reports/fix-012-baseline-stability.md)

### Required manual scenarios

Run and preserve failures for:

- `/ai` normal run
- `/ai` tool-heavy run
- `/ai` long run
- project main conversation run
- project side-panel copilot run
- interrupted run
- stale reconnect
- ask-user pause/resume
- retry after failure
- visible leak attempt

### Required capture fields

For each failure, record:

- surface
- provider/model
- visible symptom
- terminal state
- recovery affordance shown
- whether visible leakage occurred
- whether the failure belongs primarily to runtime, prompt, trace, recovery, or context assembly

### Failure classes

All recurring failures should map to one of these classes:

- visible-channel leak
- runtime-summary weakness
- lifecycle classification failure
- continuation/recovery failure
- context overload or orchestration drift

## Execution Order

`FIX-012` is not a flat quality program. Land work in this order:

1. failure inventory and evidence baseline
2. first-wave rescue pair: `FIX-012b` visible-channel purity and the runtime-operating-discipline portion of `FIX-012a`, landing whichever blocking delta unblocks baseline trust first while treating both tracks as required for closeout
4. `FIX-012c` runtime-led transparency defaults
5. `FIX-012d` blocking runtime primitives and checkpointed continuation cleanup only where still needed for bounded next actions
6. `FIX-012e` only for mutation/receipt gaps that are currently breaking baseline trust
7. `FIX-012f` only for context/compaction issues that are currently causing visible instability or recovery brittleness

## First-Wave Rescue Tracks

The baseline rescue has two equal first-wave tracks. Both must improve together or the agent will still feel unreliable.

### Track 1: Visible trust

This track owns:

1. visible-channel purity
2. process-trace-first transparency
3. runtime-led summary behavior

### Track 2: Runtime operating discipline

This track owns:

1. explicit live run/session status
2. stale-stream and reconnect discipline, including heartbeat or equivalent freshness signals where needed
3. duplicate/delta suppression where it still causes baseline failures
4. forced abnormal-end cleanup
5. bounded execution-loop outcomes
6. reducer/event invariants and anti-drift architecture enforcement

## Execution Slices

Implement `FIX-012` as a small coherent series, not one giant branch.

### `FIX-012a` Shared runtime truth and operating discipline

#### Already shipped baseline

- the main timeline surfaces already share the reducer/runtime path
- `failed_interrupted` already exists as the shared non-network abnormal-end reason
- phase-backed recovery truth and persisted run-phase reconciliation already exist on the main surfaces
- CI already enforces the anti-duplication architecture guard against new per-surface chunk-parser drift

#### Remaining rescue delta

- close any remaining baseline-scenario drift where the main surfaces still disagree about abnormal-end cleanup, recovery affordances, or same-run truth
- make live run/session status explicit enough that the main surfaces do not improvise contradictory running/retrying/blocked states
- tighten stale-stream detection, heartbeat/freshness discipline where needed, reconnect eligibility, and duplicate/delta suppression only for the cases still causing baseline failures
- force cleanup of running tools and stale live state on abnormal end wherever the evidence record still shows ghosts or contradictory next actions
- tighten replay/recovery behavior only for the cases still causing contradictory or dead-end next actions in ordinary use
- keep architecture enforcement real: no reducer forks, no per-surface recovery semantics, no shell-specific parser drift

#### Exact exit delta

- `/ai`, project main conversation, and side-panel copilot produce the same bounded abnormal-end truth in the baseline scenario pack
- no open baseline scenario still shows contradictory next actions, stale live-state ghosts, or shell-specific recovery drift
- reducer, replay, and runtime-operating-discipline tests cover the failing cases captured in the evidence record

### `FIX-012b` Visible-channel purity

#### Already shipped baseline

- shared assistant-content normalization already strips known allowlisted leak patterns
- continuation/checkpoint seeds already moved toward machine-oriented fields
- prompt-side visible-answer rules already forbid the currently known leak families

#### Remaining rescue delta

- add only the specific remaining leak patterns observed in the evidence record
- remove any remaining human-readable continuation/runtime wrapper text that is still surfacing in normal use
- keep cleanup deterministic and upstream-first instead of broadening renderer heuristics

#### Exact exit delta

- known visible leak payload families from the evidence record no longer surface during the baseline manual scenario pack
- stripping remains allowlisted and deterministic
- visible-output safety tests cover every confirmed leak family still relevant to `FIX-012`

### `FIX-012c` Runtime-led transparency

#### Already shipped baseline

- default mode is already `summary`
- `summary` no longer requests provider-native reasoning
- the main surfaces already derive compact summaries from shared runtime facts

#### Remaining rescue delta

- close the remaining baseline cases where default transparency is still noisy, weak, or inconsistent across the main surfaces
- strengthen only the trace/summary gaps that still make ordinary use feel hard to follow without raw provider reasoning

#### Exact exit delta

- ordinary use on `/ai`, project main conversation, and side-panel copilot remains understandable in `summary` mode on providers with no reasoning support
- no open baseline scenario requires raw provider reasoning to make the process understandable
- the evidence record shows stable process-trace-first transparency on the main surfaces

### `FIX-012d` Blocking runtime primitives and checkpointed continuation

#### Already shipped baseline

- ask-user already exists as typed blocked runtime state
- paused-for-input recovery already survives disconnects on the main surfaces
- durable continuation from proven persisted state already exists in the current architecture
- request-bound clarification identity and structured resolution now exist on the main surfaces
- blocked-card answer/default/cancel now continue through the shared runtime path instead of plain user-turn resume
- the shared clarification controller now owns repeat suppression, durable-progress gating, safe fallback order, and shared runtime telemetry
- scoping now applies stricter policy through the shared clarification core instead of keeping separate clarification counters as a second blocked-state authority

#### Remaining rescue delta

- re-run and record the manual blocked-clarification scenario pack against the shipped runtime/surface contract
- close only the blocked-state or continuation gaps that still create contradictory continue/retry/wait-for-input behavior in the evidence record after that rerun
- verify expired/abandoned blocked-state cleanup only if the evidence pack still shows stale blocked truth
- do not absorb broader `CAG-003` or later `FIX-011b` work here unless it is directly required to eliminate a baseline trust failure

#### Exact exit delta

- no open baseline scenario still depends on optimistic local inference for continue/retry/wait-for-input truth
- blocked/deferred states relevant to the baseline scenario pack remain explicit and durable across interruption/reload
- any broader continuation work not needed for baseline rescue is left in roadmap or `FIX-011b`, not retained inside `FIX-012`

### `FIX-012e` Mutation safety and semantic receipts

#### Already shipped baseline

- tool prerequisites and autonomy boundaries already gate several high-risk actions
- semantic receipts already exist for search, read/inspection, and delegation on the main timeline surfaces

#### Remaining rescue delta

- address only the mutation-safety or semantic-receipt gaps that are currently breaking ordinary user trust in the baseline scenario pack
- keep broader approval-matrix, freshness, or receipt-completeness programs out of `FIX-012` unless the evidence record shows they are direct baseline blockers

#### Exact exit delta

- any mutation/receipt issue still recorded as a baseline trust blocker is either fixed or explicitly deferred out of `FIX-012` with a named roadmap owner
- no open baseline scenario remains blocked by an unfixed high-value mutation/receipt gap that belongs in this slice

### `FIX-012f` Context discipline and compaction

#### Already shipped baseline

- prompt assembly order is already stabilized for caching/grounding
- context-window management and compaction primitives already exist
- optional DB-backed context now degrades honestly instead of aborting the run outright

#### Remaining rescue delta

- address only the context or compaction issues that are currently causing visible instability, leakage, or recovery brittleness in the evidence record
- keep broader budget/compaction architecture work in roadmap items unless it is directly blocking baseline rescue

#### Exact exit delta

- no open baseline scenario remains blocked by an unfixed context-instability problem assigned to this slice
- any broader compaction/context improvements not needed for baseline rescue are explicitly deferred out of `FIX-012`

## Migration Boundaries

Apply `FIX-012` changes to surfaces in this order:

1. `/ai`
2. project main conversation
3. project side-panel copilot

Rules:

1. the main surfaces should converge on one runtime truth before popup absorbs any broader parity claim
2. popup remains honesty-only and non-blocking for `FIX-012` retirement
3. no slice should claim success based only on `/ai` if project surfaces still drift on the same contract

## Success Metrics And Signals

Track these signals during the rescue:

1. visible leak rate
2. interrupted-run recovery success rate
3. false reconnect rate
4. contradictory-next-action rate
5. wrong-tool rate where relevant to current baseline failures
6. no-forward-progress rate where measurable
7. summary-mode comprehension failures in ordinary use

These metrics do not replace the manual scenario pack, but they should make regressions harder to miss.

## Rollback-Safe Slice Rules

Each `FIX-012` slice must define:

1. blast radius
2. rollback point
3. detection signal

No slice should merge if it changes shared runtime truth without a clear way to detect regression in:

1. abnormal-end cleanup
2. continue/retry truth
3. visible leak behavior
4. summary-mode comprehension
5. shell parity on the main surfaces

## Validation Program

### Required automated coverage

#### Reducer, runtime, and architecture guard tests

Must cover:

- every important event type
- live run/status transitions
- every terminal reason
- replay and dedupe
- deferred-action transitions
- abnormal-end cleanup
- continue/retry affordance decisions
- architecture guardrails against:
  - new per-surface parsers
  - reducer forks
  - bespoke recovery semantics

#### Stream hygiene and abnormal-end discipline tests

Must cover:

- stale-stream suppression where applicable
- duplicate/delta suppression where applicable
- reconnect eligibility truth
- forced cleanup of running tools on abnormal end
- no contradictory running/retrying/blocked state combinations

#### Renderer and visible-output safety tests

Must cover:

- summary mode hides raw provider reasoning
- `full` mode shows raw provider reasoning only as an additive advanced layer
- known machine-only scaffolding is stripped deterministically
- legitimate assistant prose is preserved
- grouped trace rendering remains honest

#### Scenario and integration tests

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

### Manual acceptance matrix

Must cover:

- `/ai`
- project main conversation
- project side-panel copilot
- compact/mobile sanity where relevant
- popup honesty sanity for the supported reduced subset

## `FIX-012` Retirement Gate

[plan-agentic.md](../plan-agentic.md) is the closeout authority for `FIX-012`.

`FIX-012` can retire only when the evidence bundle in [docs/reports/fix-012-baseline-stability.md](../../reports/fix-012-baseline-stability.md) shows:

1. the baseline manual scenario pack passes on `/ai`, project main conversation, and project side-panel copilot
2. known visible leak payload families are eliminated for ordinary use on those main surfaces
3. default transparency is process-trace-first and stable in ordinary use without requiring provider-native reasoning
4. abnormal-end recovery converges to one bounded truthful next action on the main surfaces
5. popup reduced-parity gaps are documented as non-blocking and do not prevent main-surface closeout
6. the remaining `FIX-011b` path is now narrow enough that `U1.6` burn-in can resume as validation rather than baseline triage

## Acceptance Standard

Do not treat `FIX-012` as complete until all of these are true:

1. ordinary manual use no longer leaks machine scaffolding into visible output
2. `/ai` and project surfaces are understandable in `summary` mode with no provider reasoning support
3. interrupted runs no longer default to dishonest network explanations
4. recovery always presents one bounded next action
5. ask-user and other blocked states survive interruption truthfully
6. long tool-heavy runs are usable enough that the product no longer feels fundamentally broken
7. reducer, runtime, renderer, and scenario tests lock all of the above

## Deferred Until After Baseline Rescue

These are valuable, but they are not first-wave `FIX-012` blockers:

- broad snapshot/revert/diff lineage
- broad always-visible memory blocks
- advanced stuck-detection services
- popup full convergence
- execution sandboxing beyond current need
- provider-layer expansion that does not directly improve runtime truth

## Relationship To Other Plans

- [plan-agentic.md](../plan-agentic.md) remains the canonical owner of `FIX-012` status, severity, ordering, and completion rules.
- [chatRuntime.md](../chatRuntime.md) owns shared runtime parity, shared terminal-state semantics, and later-stage `U1.6` burn-in positioning.
- [transparencyUI.md](../transparencyUI.md) owns the facts-first UI contract, semantic receipts, summary semantics, and visible-message boundaries.
- [plan-prompts.md](../plan-prompts.md) owns prompt-side visible-answer hygiene, anti-echo rules, and degradation behavior.
