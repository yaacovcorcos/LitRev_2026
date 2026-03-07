# Plan: Agentic Docs Reconciliation, Executable Evals, and Search Provenance

> Supporting plan only. Canonical status, priority, and completion rules live in [../plan-agentic.md](../plan-agentic.md).
>
> Supports: `FIX-005`
>
> Retirement rule: when `FIX-005` is complete, either delete/archive this file or reduce it to a short historical note. Do not keep active status tracking here.

## Overall Goal

Restore agentic docs as reliable source-of-truth artifacts, add executable behavioral eval coverage, and introduce explicit search/source receipts so research actions are auditable instead of narrative-only.

## Goal + Scope

### Problem Statement

The active agentic plans are materially stale relative to shipped code, the current eval harness mostly validates catalog structure rather than runtime behavior, and search provenance expected by the eval catalog is not implemented as a normalized runtime contract.

### Intended Outcome

- `docs/plans/plan-agentic.md` reflects reality and remains the single active authority.
- Agentic evals exercise real runtime behavior.
- Search actions emit structured provenance/receipt data that can be tested and rendered.

### In Scope

- `docs/plans/plan-agentic.md`
- `docs/plans/README.md` as needed
- `next-app/lib/server/evals/**`
- `next-app/lib/server/ai/**` or search-tool paths required for receipts
- `next-app/types/ai.ts`
- `next-app/types/agent.ts`
- receipt-related types, events, and tests

### Out Of Scope

- Full SLO dashboard work
- Release-gate enforcement for evals in the same initial slice
- Broad redesign of all artifact types

## Governance and Repo Grounding

- AGENTS trigger mapping:
  - planning/governance edits for the docs work
  - agent runtime changes for the receipt/eval work
- Required Tier 2 specialists:
  - `docs/agents/specialists/planning-governance-specialist.md`
  - `docs/agents/specialists/agent-runtime-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/README.md`
  - `docs/plans/plan-agentic.md`

### Current-State Evidence

- `plan-agentic.md` describes AI-powered planning as current architecture, but `next-app/lib/server/agent/planner.ts` still uses `generateHeuristicPlan()`.
- prior agentic planning docs drifted from shipped code and created conflicting active-tracker expectations before `plan-agentic.md` was made canonical.
- `next-app/lib/server/evals/scenario-catalog.ts` expects `source_receipt`, but the current tests only validate catalog structure.
- Repo search shows provenance UI in onboarding artifacts, but not a runtime `source_receipt` contract for agent turns.

## Documentation Impact and Updates

Documentation updates are the first-class output of this plan.

### Files To Update

- `docs/plans/plan-agentic.md`
  - correct `Current Architecture`
  - remove or rewrite stale active tasks
  - add remediation items that are actually still open
- `docs/plans/README.md`
  - keep this remediation pack discoverable while active

### Future Work To Track

- Add a clear active-task entry for source receipts if it does not ship in the first eval slice.
- If release gates are deferred, record that explicitly in `plan-agentic.md` under the eval/ops roadmap.

## Minimal-Sufficient Strategy

Do this in three linked slices:

1. Reconcile docs immediately.
2. Add a minimal but executable eval runner over normalized stream behavior.
3. Introduce a search/source receipt contract that the runner can assert against.

This sequence prevents the docs from continuing to drift while the code-side eval work is underway.

## Reuse vs New

### Reuse

- Existing plan files as the canonical architecture trackers
- Existing normalized stream event pipeline
- Existing scenario catalog as seed data

### New

- A real eval runner and assertion layer
- A normalized `source_receipt` event or artifact contract for search turns

## Decision-Complete Implementation Design

### 1. Documentation reconciliation

Update `plan-agentic.md` so `Current Architecture` reflects actual committed behavior:

- heuristic planning, not AI planning
- `ask_user` implemented
- delegation implemented behind flags
- `read_protocol` and `read_ledger` implemented
- current popup limitation if still unresolved
- apply prune-and-migrate policy to `Active Tasks` and `Recently Completed` rather than appending a diary

Keep `plan-agentic.md` as the only active tracker for remaining phases and remediation work:

- keep remediation tasks active only if they are still open
- remove shipped work from stale sections
- align roadmap and receipt/provenance status with reality

### 2. Build an executable eval harness

Add a small runtime-facing eval layer under `next-app/lib/server/evals/`:

- scenario definition
- runner
- assertion helpers over normalized stream chunks and tool/event traces

Implementation decision:

- the first runnable suites should drive real orchestration entrypoints such as `AIService.streamChatWithArtifacts()` with mocked provider/tool outputs
- do not create a parallel fake orchestrator just for evals

Initial suites should cover:

- `ask_user`
- delegation
- plan execution
- popup safety
- search provenance

The first version does not need live provider calls. It can operate with mocked tool/model outputs so long as it drives the real orchestration code path.

### 3. Define a search/source receipt contract

Introduce a normalized contract for search provenance with this default shape:

- a new normalized stream chunk type: `source_receipt`
- a persisted run event type: `source_receipt`
- no aggregated artifact in the first slice; add one later only if timeline rendering becomes a concrete requirement

Minimum payload should include:

- search tool name
- query string or structured query
- filter parameters
- result count
- selected or added study identifiers if applicable
- timestamp / run linkage

Recommended rule:

- every search tool call may emit a raw per-call receipt
- the turn may later emit an aggregated receipt artifact if UI rendering is desired

### 4. Connect evals to receipts

Once the receipt contract exists:

- update the search eval scenario to assert against the real emitted signal
- add at least one delegated-search scenario so provenance survives specialist routing

### 5. Edge Cases and Failure Behavior

- Search tool returns zero results
  - receipt still emitted with zero count
- Search tool fails before completion
  - failure receipt or error event should still preserve attempted query metadata if safe
- Legacy tests assume catalog-only behavior
  - keep catalog validation, but add runtime suites rather than replacing it

### Practical Impact Translation

- User experience
  - clearer evidence of what the agent searched and why
- Runtime/system behavior
  - agent regressions become measurable
- Operational/support impact
  - easier triage when a search turn appears low quality or unsupported

## Long-Term Quality and Scalability

- Maintainability
  - docs stop drifting from code
- Reliability
  - runtime behavior gets benchmarked, not inferred
- Operability
  - provenance signals support debugging and future SLO work

### Tradeoffs

- Adding real eval coverage takes more effort than keeping a catalog scaffold.
- That cost is justified because the current scaffold overstates confidence.

## Execution Slicing

### Slice 1: Docs truth pass

- update `plan-agentic.md`
- keep this remediation pack indexed

Blast radius:
- documentation only

### Slice 2: Eval runner foundation

- add runtime scenario runner and assertions
- convert one scenario per suite from catalog-only to executable

Blast radius:
- test infrastructure and orchestration tests

### Slice 3: Search/source receipts

- add receipt contract
- emit receipts from search paths
- assert them in evals

Blast radius:
- search tools and event pipeline; timeline UI only if receipt rendering is explicitly included in a later slice

### Alternatives Considered

- Chosen
  - docs first, then runtime evals, then receipts wired into those evals
- Rejected
  - waiting to reconcile docs until after the runtime work lands
- Deferred
  - full release-gate integration in the same initial slice

## Risk + Rollback

### Primary Failure Modes

- docs updates become stale again because runtime work lands without follow-through
- receipt emission becomes too coupled to one search tool implementation
- eval harness is too synthetic to catch real regressions

### Detection Signals

- plan docs disagree with merged runtime behavior within one or two PRs
- runtime tests pass while manual search provenance is still absent
- receipts emit for direct search but not delegated search

### Rollback Path

- documentation slice stands on its own and should not be rolled back
- if receipt UI is unstable, keep receipt emission in run events first and delay visual rendering

## Verification Strategy

### Test Matrix

- Happy path
  - search turn emits provenance signal
  - delegated search also emits provenance signal
- Edge cases
  - zero-result search
  - failed search
  - legacy plan docs updated without breaking links/indexing
- Regression scenarios
  - catalog validation still passes
  - normalized stream event parity remains intact

### Relevant Test Layers

- documentation review plus link sanity
- unit/integration tests for eval runner
- runtime tests for search receipt emission

### Acceptance Signals

- docs accurately describe shipped agent behavior
- runtime evals assert real behavior, not only static schema
- provenance is visible in runtime data for search turns

## Validation Mapping

- `cd next-app && npx tsc --noEmit`
  - required once receipt types and event contracts land
- `cd next-app && npx vitest run`
  - required for eval and receipt behavior
- no code gate required for the docs-only reconciliation slice by itself

## Debuggability + Triage

### Failure Surface Signals

- search turns have no receipt signal
- eval runner passes catalog parsing but no runtime suites execute
- docs still mention AI planning or unshipped work after the truth pass

### Fast Reproduction Path

1. Run a direct search turn.
2. Run a delegated search turn.
3. Inspect normalized stream events and run events for receipt presence.
4. Compare `plan-agentic.md` to the actual touched code paths.

### First Triage Steps

- inspect receipt emission location
- inspect normalized event serialization
- inspect eval runner fixture coverage

### First Owner

- documentation owner for the truth pass
- agent runtime owner for receipts and eval behavior

## Assumptions / Defaults

- Agentic docs should be treated as load-bearing, not aspirational.
- Receipt emission can start as a runtime data contract before UI rendering is complete.
- The first eval harness should favor real orchestration-path coverage over broad but shallow scenario catalogs.
