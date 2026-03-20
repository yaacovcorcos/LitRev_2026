# Runtime Stabilization and Continuation

## Purpose
This is the supporting execution plan for `FIX-011b`.

[plan-agentic.md](../plan-agentic.md) remains the canonical owner for:
- active status
- priority and execution order
- fix ownership and completion rules

Use this file for detailed execution thinking about stabilization and continuation only.

## Current Repo Truth
- A recovery API already exists and main timeline surfaces already use it to reconcile known-run abnormal disconnects.
- A replay adapter already exists and can restore persisted authoritative run events after disconnect.
- Paused-for-input truth and same-run reconciliation are stronger than before: paused handoff no longer defaults to generic failure and recovery actions are structured on the main timeline surfaces.
- The first `FIX-011b` stabilization slice now persists `lastDurableProgressAt`, `finalizationState`, and `abnormalEndClassification` on `AgentRun`, so recovery/readmission can separate liveness from durable forward progress instead of treating fresh heartbeats as sufficient evidence that the run is still converging.
- The second `FIX-011b` stabilization slice now makes reconnect checkpoints run-scoped, applies one shared same-run recovery authority across `/ai`, project copilot, and the main project conversation, and clears weaker same-run reconnect/fallback state as soon as stronger server recovery truth arrives.
- The third `FIX-011b` stabilization slice now introduces an explicit event-durability policy, records degraded durability on `AgentRun` when recovery-critical persistence fails after useful work, and moves recovery-critical persistence to the business event boundary instead of relying on the stream route as the first durable owner of that truth.
- The fourth `FIX-011b` stabilization slice now supports durable continuation only from proven persisted server state: the recovery contract can recommend `continue_from_durable_state` for audited tool-result and artifact-state cases, the next run reuses explicit persisted inputs instead of transcript reconstruction, and ambiguous mid-loop state still falls back to `stop_and_retry` / `retry`.
- The fifth `FIX-011b` stabilization slice now adds a narrow `RunCheckpoint` store for the exact Slice 4 gaps that still needed explicit continuation seeds: recovery can prefer `continue_from_checkpoint` when a valid `tool_result_ready` or `artifact_ready` boundary survives later same-run noise, while legacy runs and non-checkpoint cases still fall back to Slice 4 durable continuation or retry semantics.
- The sixth `FIX-011b` / `CAG-001` slice now persists coarse `runPhase` and `phaseEnteredAt` on `AgentRun`, writes phase transitions only at authoritative runtime boundaries, uses ask-phase truth to recover/readmit paused runs without surfacing them as active conflicts, and uses stale finalize-phase truth to bound reconnect behavior instead of treating it as healthy running work.
- A repo audit against `run-convergence.ts`, `run-recovery.ts`, the current recovery/surface tests, and the canonical runtime plans did not identify a new shared-runtime recovery delta beyond the shipped convergence path.
- The remaining closeout risk is now operational: `U1.6` still needs sign-off-quality burn-in evidence, and any later issue found during that burn-in should be treated as a narrow shared-path patch rather than a new recovery architecture program.
- Popup still remains a truthful reduced subset only; it should not claim full recovery/continuation parity until shared-engine convergence is explicitly finished.

## Locked Design Principles
- Persisted run state is authoritative.
- The live stream is a projection of persisted truth, not the authority itself.
- Replay restores durable authoritative truth only.
- Ephemeral progress is never reconstructed.
- Continuation should prefer durable completed work over restart.
- Existing recovery primitives are the baseline; this plan hardens and extends them where the current durable contract is incomplete.

## Closeout Posture
- Treat `FIX-011b` as a delta-closeout task, not a greenfield runtime program.
- Assume no schema change; reopen persistence only if a concrete missing persisted fact is discovered during burn-in or a narrow delta audit.
- Use this file for supporting detail only. [plan-agentic.md](../plan-agentic.md) remains the canonical fix-status owner, and `U1.6` in [plan-chat-unification-v2.md](../plan-chat-unification-v2.md) plus [chat-unification-burn-in.md](../../runbooks/chat-unification-burn-in.md) remains the operational sign-off owner.
- If a real runtime drift is found, patch only the shared convergence/recovery path and add focused tests for that uncovered case.

## Workstream A: Abnormal-End Classification
- Classify disconnects and finalization failures durably enough to stop guessing from generic broken-stream symptoms.
- Add route-level repro coverage for disconnect after tool result, disconnect before paused question delivery, finalization failure after useful work, and no-forward-progress active-run behavior.
- Keep stream-boundary hardening evidence-driven: classify first, harden after the dominant failure classes are proven.

## Workstream B: Persisted Run-Phase State
- Workstream B V1 is now shipped: recovery, readmission, and continuation consumers can read coarse persisted `runPhase = plan | ask | act | verify | finalize` plus `phaseEnteredAt` from `AgentRun` instead of inferring macro lifecycle only from `running + lastActivityAt`.
- Shipped V1 contract: `status="paused"` pairs with `runPhase="ask"`, continuation runs begin from `verify`, same-phase writes preserve `phaseEnteredAt`, and degraded/finalization-failure truth remains in the existing durability/finalization fields instead of becoming new phases.
- Shipped V1 transition matrix: `plan -> ask | act | finalize`, `ask -> plan | act | finalize`, `act -> ask | verify | finalize`, `verify -> ask | act | finalize`, and `finalize` has no outgoing transition on the same run.
- Shipped V1 consumers: running ask-phase truth now re-surfaces as paused-input recovery/readmission instead of active-run conflict, while stale finalize-phase truth now yields bounded user action instead of indefinite reconnect.
- Deferred from Workstream B: no sub-phase graph, no planner scratchpad persistence, no workflow-engine adoption, and no new public recovery action family in this slice.

## Workstream C: Event Durability Policy
- Separate `recovery_required` runtime truth from `observability_only` diagnostics.
- Move recovery-critical persistence to the business event boundary rather than letting the route-layer projection be the first durable owner.
- When recovery-critical persistence fails after useful work already succeeded, downgrade recovery truth explicitly rather than pretending the whole run either succeeded cleanly or failed from zero.
- Keep any durability redesign incremental and justified by concrete failure evidence from the current runtime.

## Workstream D: Checkpointed Continuation
- Add continuation from durable completed work only where the current persisted truth proves restart-from-zero is unnecessary.
- Clarify reconnect / continue / stop-and-retry / retry semantics around durable completed work.
- Treat human input as a first-class paused continuation state.
- Do not commit the repo to a new checkpoint store or token format until the currently observed continuation gaps are proven against the existing persisted event model.

### Slice 4 audited continuation cases

| Failure case | Durable data available | Next server step required | Safe to continue with current persistence |
|---|---|---|---|
| Disconnect after durable `tool_result` with no newer assistant/tool-call/user-input-required state | `RunEvent.tool_result` payload, tool name, call id, source run id | Start a new run using the persisted tool result as authoritative continuation input | Yes |
| Disconnect after durable artifact proposal/review state with no newer assistant/tool-call/user-input-required state | durable artifact record plus authoritative `artifact_proposed` / `artifact_reviewed` event | Start a new run using the persisted artifact state as authoritative continuation input | Yes |
| Degraded durability after useful visible success | degraded `AgentRun` markers plus whatever durable events/artifacts survived | Only if one of the audited source validators still resolves to a safe tool-result or artifact-state continuation source | Conditional only |
| Paused-for-input | persisted `user_input_required` state | Resume via the existing paused-input path | Existing `resume` only; not part of `continue_from_durable_state` |
| Mid-loop planner/tool state, pending tool calls, delegated work without a durable parent-facing result, partial assistant output only | replayable UI state but no proven continuation authority | Recreate hidden transient loop state | No |

### Slice 5 checkpoint-backed continuation gaps

Only the following Slice 4 gaps are promoted into V1 checkpoint-backed continuation:

| Gap promoted from Slice 4 | Why Slice 4 durable continuation was insufficient | V1 checkpoint answer |
|---|---|---|
| Earlier safe `tool_result` boundary is followed by later same-run assistant/tool-call noise | Slice 4 intentionally refuses continuation once later same-run state makes the latest replayable event stream ambiguous, even if the earlier `tool_result` is still a valid seed | Persist `tool_result_ready` as an explicit reusable seed and let recovery resolve the latest valid checkpoint instead of inferring from replay order |
| Earlier safe artifact proposal/review boundary is followed by later same-run noise or post-boundary failure | Slice 4 can restore the durable artifact state for visibility, but it cannot always prefer that earlier boundary for execution continuation once later same-run events make the stream ambiguous | Persist `artifact_ready` as an explicit reusable seed and validate it directly against the authoritative artifact row |
| One run crosses multiple safe durable boundaries | Slice 4 has no explicit seed-selection authority beyond scanning persisted outputs, so it cannot distinguish "latest reusable boundary" from "latest replayable durable event" in noisy runs | Resolve the latest valid ready checkpoint by source event sequence and continue from that explicit seed |

Everything else remains deferred:
- mid-loop transient planner/tool state
- pending tool calls
- delegated work without a durable parent-facing result
- plan execution continuation
- partial assistant output only
- anything that requires transcript reconstruction or hidden scratchpad state

## Workstream E: Surface Convergence
- `/ai`, project copilot, and the main project conversation should consume one shared durable recovery/continuation contract instead of reinterpreting run truth per surface.
- Popup remains a truthful reduced subset only until shared-engine convergence is explicitly finished.
- No surface should show contradictory same-run timeout/conflict/fallback states once stabilization work is complete.

## Validation and Burn-In
- Burn-in must cover forced disconnect after tool result, disconnect before paused question delivery, recovery-required persistence failure behavior, no-forward-progress detection, degraded continuation correctness, and elimination of contradictory same-run recovery/error states.
- Stabilization is not done when unit tests pass; it is done when the runtime converges truthfully under those harnessed failure classes and the existing `U1.6` burn-in thresholds are met.
- `chat-unification-burn-in.md` remains the only operational canary/sign-off source. This file should not restate or replace that contract.

## Optional Reference Patterns
The systems below are optional architectural references only.

They are not required dependencies or normative implementations. Implementers may study them to borrow ideas, compare tradeoffs, and adapt patterns. All final design choices must be justified against LitRev's own runtime, plans, and constraints.

- Temporal-style durable execution / AgentState systems: workflow state, activity boundaries, heartbeat vs real progress, retry/compensation
- LangGraph: explicit state transitions, human-in-the-loop pause/resume, graph-state recovery
- OpenHands: preserving useful intermediate work and continuing from durable action history
- PydanticAI: typed tool/result boundaries and structured failures
- OpenAI Agents SDK: tool/handoff ergonomics, not a primary durability reference
- Letta, Mastra, AutoGen: optional secondary references for workflow/state ideas

Hard rule:
- never write "use LangGraph", "adopt Temporal", or similar dependency language
- only describe LitRev-native contracts and note references as optional comparison material
