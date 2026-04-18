# Runtime Stabilization and Continuation

## Purpose
This is the supporting implementation plan for `FIX-011b` closeout under `A-001`.

[plan-agentic.md](../plan-agentic.md) remains the canonical owner for:
- active status
- priority and execution order
- fix ownership and completion rules

Use this file for decision-complete execution design, not for canonical status tracking.

## Overall Goal
`A-001` is the last narrow runtime-closeout task before the shared chat runtime can move back into sign-off mode instead of bug-discovery mode.

The goal is not to redesign the engine again. The goal is to make the existing shared runtime trustworthy enough for millions of users by closing the remaining truth gaps at the runtime authority boundary:
- one run owns writes
- terminal state means the same thing everywhere
- clarification state reconstructs from the right lineage
- useful success stays success even when optional follow-on work degrades

When this work is complete, the runtime should be boring in the best way: explicit, replayable, testable, easy to reason about under failure, and safe to build on.

## Goal and Scope

### Problem Statement
Current `main` already has the shared runtime, recovery, checkpoint-backed continuation, coarse run phases, and materially stronger ownership/finalization handling. The remaining problems are smaller but more dangerous because they undermine trust:
- cancelled truth can still drift across route projection, persisted run state, recovery, and UI lifecycle
- blocked-card dismissal is not yet durably equivalent to cancelled terminal truth
- clarification hydration still risks reconstructing policy from the wrong part of long lineage history
- post-answer auxiliary failures can still threaten a run that already produced useful durable output

### Intended Outcome
`A-001` is complete when:
- ownership loss is fail-closed on the shared write path
- cancelled terminal truth is identical across stream, persistence, replay, recovery, and UI
- clarification suppression and retry policy reconstruct from the newest relevant lineage window
- durable useful success cannot be retroactively rewritten to failed because optional cleanup degraded
- `U1.6` can resume as a quality-sign-off exercise owned by [`plan-agent-quality.md`](../plan-agent-quality.md)

### In Scope
- shared runtime authority and finalization behavior
- route -> persistence -> replay/recovery -> UI terminal-state parity
- clarification controller hydration for long lineages
- degrade-only post-answer behavior
- regression tests and burn-in handoff evidence for the above
- exact branch / PR / cleanup flow for each delivery slice

### Out of Scope
- new workflow-engine adoption
- broader `CAG-020` crash-safe long-loop work beyond what `A-001` needs
- new public recovery action families
- major prompt redesign
- new subagent/autonomy work
- broader memory, retrieval, or prompt-library redesign owned elsewhere

## Governance and Repo Grounding

### AGENTS Routing
- Trigger: agent runtime/orchestration files and plan docs
- Required Tier 2 specialist:
  - `docs/agents/specialists/agent-runtime-specialist.md` for code slices
  - `docs/agents/specialists/planning-governance-specialist.md` for this supporting plan update
- Required Tier 3 retrieval:
  - [`docs/plans/README.md`](../README.md)
  - [`docs/plans/plan-agentic.md`](../plan-agentic.md)
  - [`docs/plans/plan-agent-quality.md`](../plan-agent-quality.md)
  - [`docs/runbooks/chat-runtime-burn-in.md`](../../runbooks/chat-runtime-burn-in.md)
  - [`docs/runbooks/github-flow.md`](../../runbooks/github-flow.md)

### Current-State Evidence
The execution design in this plan is grounded in the current runtime and test surfaces on `main`:
- runtime authority and finalization:
  - `next-app/lib/server/agent/run.ts`
  - `next-app/lib/server/agent/run-event-recorder.ts`
  - `next-app/lib/server/ai/ai-service.ts`
- recovery and convergence:
  - `next-app/lib/server/agent/run-convergence.ts`
  - `next-app/lib/server/agent/run-recovery.ts`
- stream entry and clarification resolution:
  - `next-app/app/api/ai/stream/route.ts`
  - `next-app/lib/server/ai/clarification-controller.ts`
- client lifecycle and terminal-state handling:
  - `next-app/app/ai/page.tsx`
  - `next-app/components/chat/ChatComposerCore.tsx`
  - `next-app/components/chat/ChatTimeline.tsx`
- existing regression surfaces to extend:
  - `next-app/app/api/ai/stream/__tests__/route.test.ts`
  - `next-app/lib/server/__tests__/run-recovery.test.ts`
  - `next-app/lib/server/__tests__/run-convergence.test.ts`
  - `next-app/lib/server/__tests__/clarification-controller-hydration.test.ts`
  - `next-app/lib/server/__tests__/ai-service-run-finalization.test.ts`
  - `next-app/lib/server/__tests__/run-event-recorder.test.ts`

## Current Repo Truth
- A recovery API already exists and main timeline surfaces already use it to reconcile known-run abnormal disconnects.
- A replay adapter already exists and can restore persisted authoritative run events after disconnect.
- Paused-for-input truth and same-run reconciliation are stronger than before: paused handoff no longer defaults to generic failure and recovery actions are structured on the main timeline surfaces.
- The first `FIX-011b` stabilization slice now persists `lastDurableProgressAt`, `finalizationState`, and `abnormalEndClassification` on `AgentRun`, so recovery/readmission can separate liveness from durable forward progress instead of treating fresh heartbeats as sufficient evidence that the run is still converging.
- The second `FIX-011b` stabilization slice now makes reconnect checkpoints run-scoped, applies one shared same-run recovery authority across `/ai`, project copilot, and the main project conversation, and clears weaker same-run reconnect/fallback state as soon as stronger server recovery truth arrives.
- The third `FIX-011b` stabilization slice now introduces an explicit event-durability policy, records degraded durability on `AgentRun` when recovery-critical persistence fails after useful work, and moves recovery-critical persistence to the business event boundary instead of relying on the stream route as the first durable owner of that truth.
- The fourth `FIX-011b` stabilization slice now supports durable continuation only from proven persisted server state: the recovery contract can recommend `continue_from_durable_state` for audited tool-result and artifact-state cases, the next run reuses explicit persisted inputs instead of transcript reconstruction, and ambiguous mid-loop state still falls back to `stop_and_retry` / `retry`.
- The fifth `FIX-011b` stabilization slice now adds a narrow `RunCheckpoint` store for the exact Slice 4 gaps that still needed explicit continuation seeds: recovery can prefer `continue_from_checkpoint` when a valid `tool_result_ready` or `artifact_ready` boundary survives later same-run noise, while legacy runs and non-checkpoint cases still fall back to Slice 4 durable continuation or retry semantics.
- `CAG-003` is now shipped on top of that foundation: the stream entrypoint resolves strict `continueFromRunId` and best-effort retry continuation through one server-owned `checkpoint -> durable -> fresh retry` selector, explicit `Continue` stays strict, and run-targeted retry/replace actions on the main surfaces can now reuse audited durable work without degrading clean fallback when no safe source remains.
- The sixth `FIX-011b` / `CAG-001` slice now persists coarse `runPhase` and `phaseEnteredAt` on `AgentRun`, writes phase transitions only at authoritative runtime boundaries, uses ask-phase truth to recover/readmit paused runs without surfacing them as active conflicts, and uses stale finalize-phase truth to bound reconnect behavior instead of treating it as healthy running work.
- The first `A-001` closeout slice is now shipped on `main`: shared write helpers fail closed on ownership loss, stale workers stop instead of degrading winning-run truth, and stale assistant/finalization writes are covered by regression tests.
- A repo audit against `run-convergence.ts`, `run-recovery.ts`, the current recovery/surface tests, and the canonical runtime plans was later deepened on `2026-04-16`; that deeper pass did identify a narrow new shared-runtime delta beyond the shipped convergence path.
- The remaining delta is targeted, not greenfield: cancelled terminal truth still drifts across live stream vs replay/client lifecycle, blocked-card cancel is not durably replayed as cancelled, clarification hydration reads the oldest lineage window instead of the newest one, and post-answer auxiliary work can still retro-fail a useful run.
- The live `U1.6` report was also found to be operationally stale rather than code-blocked: the previously recorded scoped cohort now yields zero `metricVersion=3` rows while sparse unscoped v3 telemetry still exists, so the next valid burn-in window must refresh cohort scope instead of treating an empty scoped probe as proof of a new runtime defect.
- `U1.6` therefore remains paused on targeted remediation first: burn-in is still required for sign-off, but it should not be resumed as if the current runtime delta were already closed.
- Popup still remains a truthful reduced subset only; it should not claim full recovery/continuation parity until shared-engine convergence is explicitly finished.

## Locked Design Principles
- Persisted run state is authoritative.
- The live stream is a projection of persisted truth, not the authority itself.
- Replay restores durable authoritative truth only.
- Ephemeral progress is never reconstructed.
- Continuation should prefer durable completed work over restart.
- Existing recovery primitives are the baseline; this plan hardens and extends them where the current durable contract is incomplete.

## Closeout Posture
- Treat `FIX-011b` as a targeted shared-runtime remediation program, not as burn-in paperwork and not as a greenfield runtime rewrite.
- If `FIX-012` is still open because ordinary manual agent use is visibly broken, treat this file as blocked by that broader baseline rescue work instead of treating burn-in as the current rescue task.
- Prefer hard execution-boundary fixes over prompt or surface patches. Reopen persistence when that is the simplest honest way to enforce authority or durable truth.
- Use this file for supporting detail only. [plan-agentic.md](../plan-agentic.md) remains the canonical fix-status owner, [plan-agent-quality.md](../plan-agent-quality.md) owns burn-in and runtime sign-off posture, and [chat-runtime-burn-in.md](../../runbooks/chat-runtime-burn-in.md) remains the only operational canary/sign-off source.
- If a real runtime drift is found, patch only the shared ownership/convergence/recovery path and add focused tests for that uncovered case.

## Minimal-Sufficient Strategy
The smallest reversible strategy is:
1. keep the shared runtime as the only authority surface
2. finish the remaining truth gaps at the boundary where data becomes durable
3. prove each fix with deterministic regressions before or alongside the patch
4. resume burn-in only after code-level truth is closed

This is better than a broader redesign because the runtime already has the key architecture pieces. The remaining risk is semantic drift, not missing infrastructure.

## Reuse vs New

### Reuse
- `run.ts` for authoritative run mutability and terminal writes
- `run-event-recorder.ts` for shared event-durability policy
- `run-convergence.ts` and `run-recovery.ts` for authoritative replay/recovery semantics
- `route.ts` for structured blocked-card resolution behavior
- `clarification-controller.ts` for scan-based policy reconstruction
- existing stream/recovery/finalization tests as the primary proof harness

### New
- No new subsystem should be introduced for `A-001`.
- New code is limited to:
  - tighter terminal-state normalization helpers where necessary
  - lineage-window selection logic inside the existing clarification controller
  - explicit degrade-only boundaries for optional post-answer work
  - additional regression fixtures and scenarios

Any broader abstraction should be rejected unless a concrete duplication or correctness failure proves it necessary.

## Active Delta Checklist
- **Execution ownership / stale-writer exclusion**
  - shipped as the first `A-001` slice
  - remains part of the acceptance matrix and burn-in evidence set
- **Cancelled terminal truth convergence**
  - `runStatus="cancelled"` must mean cancelled everywhere, even when `stopReason` is missing.
  - Blocked-card dismissal must durably settle the source run as cancelled instead of emitting a live-only cancelled projection while persisted recovery still says paused.
- **Lineage-safe clarification state**
  - Clarification suppression/repeat policy must reconstruct from the newest relevant lineage window, not the oldest scanned events.
  - The current scan-based controller should remain correct on long lineages until a future first-class persisted controller snapshot exists.
- **Post-answer success boundary**
  - Once a useful final assistant answer is durably stored, auxiliary follow-on work such as summarization, tracing flush, and conversation-title polish must be degrade-only and must not flip the run to failed.

## Decision-Complete Implementation Design

### Slice 1: Cancelled Terminal Truth Convergence

#### Goal
Make persisted cancelled truth authoritative and impossible to reinterpret differently by stream projection, replay/recovery, or UI reducers.

#### Touched Paths
- `next-app/app/api/ai/stream/route.ts`
- `next-app/lib/server/agent/run.ts`
- `next-app/lib/server/agent/run-recovery.ts`
- `next-app/lib/server/agent/run-convergence.ts` if normalization logic must be shared
- `next-app/app/ai/page.tsx`
- `next-app/app/api/ai/stream/__tests__/route.test.ts`
- `next-app/lib/server/__tests__/run-recovery.test.ts`

#### Contract
- If authoritative persisted run status is `cancelled`, every recovery/render path must surface `runStatus="cancelled"`.
- `stopReason` should preserve `cancelled` when known and should default to cancelled-compatible projection instead of producing ambiguous paused/error UI.
- Blocked-card dismissal must durably cancel the source run before or while emitting the synthetic terminal chunk; a live-only cancelled projection is not acceptable.
- Sparse `stopReason` must never cause cancelled runs to be shown as reconnectable, paused, or generic failed.

#### Best Solution
- Normalize terminal truth at the server boundary, not in scattered client fallbacks.
- Reuse persisted `status` as the primary authority and treat `stopReason` as a descriptive refinement.
- Keep synthetic terminal chunks aligned with persisted state by sharing one mapping path wherever practical.

#### Rejected Alternatives
- UI-only normalization:
  - rejected because replay/recovery and future shells would still drift
- prompt/system-message workaround:
  - rejected because terminal truth is runtime state, not model behavior

### Slice 2: Lineage-Safe Clarification Hydration

#### Goal
Hydrate clarification suppression and repeat policy from the newest relevant lineage window, not the oldest matching events in long histories.

#### Touched Paths
- `next-app/lib/server/ai/clarification-controller.ts`
- `next-app/app/api/ai/stream/route.ts`
- `next-app/lib/server/__tests__/clarification-controller-hydration.test.ts`
- any nearby clarification-runtime tests that prove resume behavior remains correct

#### Contract
- Lineage scanning must prioritize the most recent relevant progress/resolution boundary.
- Older ask/resolution history may inform context but cannot override newer durable progress.
- The controller remains scan-based for `A-001`; no persisted controller snapshot is added in this slice.

#### Best Solution
- Keep the current controller and narrow the bug to lineage-window selection.
- Introduce one explicit helper for choosing the authoritative scan window from persisted events.
- Add long-lineage fixtures that include repeated asks, durable progress, and late resume behavior.

#### Rejected Alternatives
- Persist a brand-new clarification-state machine:
  - too large for the actual defect
- truncate lineage aggressively:
  - risks hiding valid state and weakening recovery quality

### Slice 3: Post-Answer Success Boundary

#### Goal
Once a useful final answer is durably stored, optional post-answer work must be allowed to degrade without rewriting the run as failed.

#### Touched Paths
- `next-app/lib/server/ai/ai-service.ts`
- `next-app/lib/server/agent/run-event-recorder.ts` if degrade-only handling needs a shared helper
- `next-app/lib/server/__tests__/ai-service-run-finalization.test.ts`

#### Contract
- There is one authoritative boundary after which the run is already a success from the user's perspective.
- Optional work after that boundary may log warnings, degrade durability/observability, or emit diagnostics, but must not change terminal user truth from completed to failed.
- If failure happens before that authoritative boundary, normal failure semantics still apply.

#### Best Solution
- Define the boundary around durable visible answer completion, not around every later follow-on write.
- Keep degrade-only behavior explicit in the finalization path so it is easy to audit.
- Preserve operator visibility with logging and durability markers rather than swallowing the failure.

#### Rejected Alternatives
- Mark everything after answer generation as fully ignorable:
  - rejected because operational evidence still matters
- keep retro-fail semantics for “strictness”:
  - rejected because it lies about what the user actually received

### Slice 4: Quality Handoff and Burn-In Resumption

#### Goal
Resume `U1.6` only after the runtime delta is code-closed and backed by deterministic proof.

#### Touched Docs
- `docs/plans/plan-agentic.md`
- `docs/plans/plan-agent-quality.md` if sign-off language must be tightened
- `docs/runbooks/chat-runtime-burn-in.md`

#### Contract
- `A-001` is not “done” on merged code alone.
- `U1.6` resumes only when deterministic regressions exist for every known delta class and the stale operational cohort is refreshed.

## Validation and Burn-In
- Burn-in must cover forced disconnect after tool result, disconnect before paused question delivery, recovery-required persistence failure behavior, no-forward-progress detection, degraded continuation correctness, elimination of contradictory same-run recovery/error states, cancelled terminal parity, and stale-writer exclusion after replace/cancel.
- Stabilization is not done when unit tests pass; it is done when the runtime converges truthfully under those harnessed failure classes and the existing `U1.6` burn-in thresholds are met.
- `chat-runtime-burn-in.md` remains the only operational canary/sign-off source. This file should not restate or replace that contract.

## Long-Term Quality, Scalability, and Security
- **Maintainability**
  - keep authority rules centralized in shared runtime files, not duplicated per surface
  - prefer one small normalization helper over many local fallbacks
- **Reliability**
  - each runtime invariant must have a deterministic regression test
  - terminal-state semantics must be derivable from persisted truth under disconnect and replay
- **Operability**
  - degradation must be explicit in logs and persisted run markers
  - on-call should be able to identify whether the fault is route projection, persistence, recovery, or UI interpretation
- **Scalability**
  - fixes should reduce semantic branching, not add more of it
  - no new heavy persistence model should be introduced for a bug that existing durable events can explain
- **Security / trust**
  - no prompt or client-side path may widen runtime authority
  - cancelled and blocked states must remain server-owned truth, not UI opinion

## Open-Source Pattern Guidance
Use the benchmark as input, not policy:
- [`docs/reviews/2026-04-16-agentic-open-source-benchmark.md`](../../reviews/2026-04-16-agentic-open-source-benchmark.md)

Relevant patterns to adapt locally:
- `openclaw/openclaw`
  - queueing, cancellation, and operator-facing truth should stay explicit and inspectable
- `vercel/ai`
  - stream abort/error handling and deterministic mock-stream tests are useful references
- `langchain-ai/langgraph`
  - interruption/resume truth should remain typed and durable
- `pydantic/pydantic-ai`
  - typed result/failure boundaries should remain explicit instead of implicit

Do not copy external code. Rewrite only the needed contracts into LitRev-local behavior and tests.

## Execution Slices

### PR 1: Cancelled truth convergence
- scope:
  - persisted cancelled truth
  - blocked-card durable cancellation
  - recovery/replay parity
- blast radius:
  - server route, recovery projection, main AI surface terminal handling
- rollback-safe boundary:
  - changes are limited to terminal-state mapping and tests

### PR 2: Clarification lineage hydration
- scope:
  - newest relevant lineage window selection
  - long-lineage clarification regression fixtures
- blast radius:
  - clarification controller and resume path only
- rollback-safe boundary:
  - isolated to scan reconstruction behavior

### PR 3: Post-answer success boundary
- scope:
  - degrade-only handling after durable useful answer
  - finalization regressions
- blast radius:
  - runtime finalization and optional post-answer tasks
- rollback-safe boundary:
  - isolates completed-vs-failed semantics to one path

### PR 4: Burn-in resumption package
- scope:
  - update docs/runbooks to current truth
  - refresh cohort evidence and resume `U1.6`
- blast radius:
  - docs, metrics/runbook operations, no architecture expansion

### Complexity Budget
- chosen:
  - three narrow runtime PRs plus one sign-off PR
- rejected:
  - one giant catch-all runtime PR
  - a greenfield state-machine rewrite

## Risk and Rollback

### Primary Failure Modes
- a cancelled run still renders as paused or reconnectable on one surface
- blocked-card dismissal produces a cancelled chunk but leaves persisted status paused
- clarification scans regress and suppress the wrong question
- degrade-only handling hides real pre-answer failures

### Detection Signals
- route tests or recovery tests disagree on terminal projection
- manual replay of a cancelled run shows different status than live stream
- clarification hydration tests fail on long-lineage fixtures
- finalization tests show completed runs flipping to failed after optional-work errors

### Rollback Path
- each PR is small enough to revert independently
- if terminal truth regresses, revert the specific slice rather than broad runtime changes
- do not proceed to `U1.6` resumption while any slice is rolled back or partially reverted

## Verification Strategy

### Test Matrix
| Area | Happy path | Edge cases | Regression proof |
|---|---|---|---|
| Cancelled truth | normal cancel surfaces cancelled everywhere | missing `stopReason`, blocked-card dismissal, replay after reconnect | `route.test.ts`, `run-recovery.test.ts`, UI lifecycle coverage |
| Clarification hydration | newest relevant lineage reconstructs correctly | repeated asks, durable progress between asks, resumed long lineage | `clarification-controller-hydration.test.ts` |
| Post-answer success boundary | useful answer completes cleanly | optional summary/title/tracing failure after answer | `ai-service-run-finalization.test.ts` |
| Ownership-loss regression | stale writer stops cleanly | replace/cancel during assistant write or degraded durability write | existing `run-event-recorder` and finalization tests |

### Required Test Layers
- unit:
  - convergence, recovery, clarification-controller helpers
- integration:
  - stream route lifecycle
  - AI service finalization path
- client/runtime parity:
  - `/ai` lifecycle handling where terminal-state ambiguity was previously possible

### Acceptance Signals
- deterministic tests cover all known `A-001` delta classes
- no known surface shows conflicting terminal truth for the same persisted run
- `U1.6` resumes with refreshed cohort evidence instead of stale telemetry assumptions

## Validation Mapping

### Required Gates for Runtime PRs
- `cd next-app && npx tsc --noEmit`
  - catches type-contract drift across runtime, route, and UI boundaries
- `cd next-app && npx vitest run`
  - catches deterministic regression failures in runtime and surface parity

### Recommended High-Confidence Gates
- `cd next-app && npm run lint`
  - catches local code-smell and policy regressions before CI
- `cd next-app && npm run governance:ci-required`
  - reproduces the required governance portion of `check` before pushing higher-risk runtime slices
- `git diff --check`
  - catches malformed patches and whitespace/merge slop before commit

## Debuggability and Triage
- failure surface:
  - route logs for clarification resolution and synthetic terminal emission
  - runtime logs from `ai-service`, `run-event-recorder`, and recovery helpers
  - persisted `AgentRun.status`, `finalizationState`, `durabilityState`, and `abnormalEndClassification`
- fast reproduction:
  - use the existing route and runtime tests as first repro harnesses before browser/manual testing
- first triage order:
  1. confirm persisted run row truth
  2. confirm recovery projection truth
  3. confirm stream route emission
  4. confirm client reducer/render fallback behavior
- probable fault boundaries:
  - persisted truth wrong -> `run.ts` / finalization path
  - persisted truth right but replay wrong -> `run-recovery.ts` / `run-convergence.ts`
  - live stream wrong but recovery right -> `route.ts`
  - both server paths right but UI wrong -> `app/ai/page.tsx` and chat components

## Git Flow and Cleanup
Every `A-001` execution slice must follow the canonical task-worktree flow from [`docs/runbooks/github-flow.md`](../../runbooks/github-flow.md).

### Start a Slice
From repo root:
1. `git fetch origin --prune`
2. `git switch main`
3. `git pull --ff-only origin main`
4. `git worktree add -b YY/<slice-name> .worktrees/<slice-name> origin/main`

### Implement and Validate
From the task worktree:
1. make the narrow code/doc change for that slice only
2. run required validation:
   - `cd next-app && npx tsc --noEmit`
   - `cd next-app && npx vitest run`
3. run recommended confidence checks for risky slices:
   - `cd next-app && npm run lint`
   - `cd next-app && npm run governance:ci-required`
   - `git diff --check`
4. commit atomically with a conventional message

### Push and Open PR
From the task worktree:
1. `git push -u origin YY/<slice-name>`
2. open or update a non-interactive PR to `main`
3. add a cleanup manifest entry to the PR body or a PR comment:
   - worktree path
   - branch name
   - status
   - decision
   - short reason

### Closeout
1. monitor the PR until mergeable:
   - required checks green
   - latest review feedback inspected with `gh pr view <number> --json reviews,comments`
2. merge to `main`
3. from repo root:
   - `git fetch origin --prune`
   - `git switch main`
   - `git pull --ff-only origin main`
   - `git worktree remove .worktrees/<slice-name>`
   - `git branch -d YY/<slice-name>` or `git branch -D` if squash-merge history requires it
4. confirm repo root `main` is clean and matches `origin/main`

### Non-Negotiable Cleanup Rule
- do not leave merged `A-001` worktrees behind
- do not leave merged local branches behind
- do not start the next slice until the previous slice is merged or intentionally abandoned

## Documentation Impact
- [`docs/plans/plan-agentic.md`](../plan-agentic.md)
  - keep the active delta summary current
- [`docs/plans/plan-agent-quality.md`](../plan-agent-quality.md)
  - remains the sign-off owner; update only if quality gates or burn-in ownership changes
- [`docs/runbooks/chat-runtime-burn-in.md`](../../runbooks/chat-runtime-burn-in.md)
  - must be refreshed before `U1.6` resumes so the cohort and evidence rules match current reality

## Assumptions and Defaults
- default: keep persisted run status as the primary terminal authority and treat `stopReason` as a refinement, not a competing source of truth
- default: no new persistence model is added for clarification hydration in `A-001`
- default: the popup remains a reduced subset and does not get special-case truth rules
- default: `U1.6` stays paused until all three remaining runtime slices are merged and tested
- unresolved ambiguity:
  - if a later code audit finds a deeper shared abstraction gap, that should be spun into a new task rather than silently expanding `A-001`

## Optional Reference Patterns
The systems below are optional architectural references only.

They are not required dependencies or normative implementations. Implementers may study them to borrow ideas, compare tradeoffs, and adapt patterns. All final design choices must be justified against LitRev's own runtime, plans, and constraints.

Use `OPEN_SOURCE_REFERENCES.md` for the current GitHub URLs behind the named upstreams that are still tracked as active inputs.

- Temporal-style durable execution / AgentState systems: workflow state, activity boundaries, heartbeat vs real progress, retry/compensation
- LangGraph: explicit state transitions, human-in-the-loop pause/resume, graph-state recovery
- OpenHands: preserving useful intermediate work and continuing from durable action history
- PydanticAI: typed tool/result boundaries and structured failures
- OpenAI Agents SDK: tool/handoff ergonomics, not a primary durability reference
- Letta, Mastra, AutoGen: optional secondary references for workflow/state ideas

Hard rule:
- never write "use LangGraph", "adopt Temporal", or similar dependency language
- only describe LitRev-native contracts and note references as optional comparison material
