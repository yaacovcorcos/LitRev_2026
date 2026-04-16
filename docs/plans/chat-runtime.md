# Chat Runtime Plan

## Purpose
Track the remaining work to keep `/ai`, project copilot, and popup on one shared chat/runtime contract while preserving surface-specific UX where it is intentional.

This file is not a migration diary. It records:
- the current shared-runtime truth
- the remaining runtime-parity blockers
- the rules that future chat/trace work must preserve

## Scope
This plan owns:
- shared stream/runtime contracts across `/ai`, project copilot, and popup
- cross-surface reducer/runtime parity
- popup migration onto the shared runtime
- burn-in and cleanup for the unified path

This plan does not own:
- agent-runtime orchestration fixes in [plan-agentic.md](./plan-agentic.md)
- truthful execution-trace design in [transparency-ui.md](./transparency-ui.md)
- route-specific UI polish in [plan-ux-ui.md](./plan-ux-ui.md)
- the durable URL/navigation contract for conversation identity, which is owned by [plan-ux-ui.md](./plan-ux-ui.md) and must be reflected here only where route identity constrains shared chat-runtime behavior

## Current Architecture
- `/ai` and project copilot already share the normalized stream event model through `shared-stream-reducer.ts` and shared runtime helpers in `lib/ai/`.
- `/ai` standard send and plan paths already run through the shared reducer/runtime contract.
- `/ai`, main project conversation, and side-panel project copilot now all hand pre-normalized `TimelineItem[]` data into the shared timeline renderer, so progress/approval state and timeline rendering consume the same normalized shape instead of re-deriving it twice on the project surfaces.
- Project copilot already migrated off bespoke chunk accumulation onto the shared reducer/runtime path, but still carries a few surface adapter differences that matter for truthful progress/presentation.
- Protocol artifact propagation is not yet fully parity-complete across the main surfaces: project copilot acceptance and undo emit `protocolPatch` for immediate protocol live-sync application, but `/ai` still invalidates the protocol domain without embedding that patch payload, so protocol views reacting to `/ai` remain refetch-bound today.
- `/ai` and project copilot now share the same default transparency semantics on top of that runtime: `summary` mode stays provider-independent, compact process summaries are derived from existing shared trace facts, and raw provider reasoning is limited to explicit `full` mode on surfaces that support it.
- `/ai`, main conversation, and side-panel copilot now also share the queued-follow-up contract on top of that runtime: one explicit text-only next message may be queued while a run is active, rendered as an attached composer cap, and auto-dispatched only after the surface returns to true idle/sendable state.
- `/ai`, main conversation, and side-panel copilot now also consume phase-backed recovery truth from persisted `AgentRun.runPhase` / `phaseEnteredAt`, so paused-input and stale-finalize cases converge through the shared runtime contract instead of per-surface reconnect heuristics.
- `/ai`, main conversation, and side-panel copilot now also share one retry/continue contract on top of that runtime: explicit `Continue` remains strict proven-state continuation, while run-targeted retry/replace actions can request the same checkpoint/durable seed as a best-effort starting point and still fall back cleanly to a fresh retry when no safe source survives.
- `/ai`, main conversation, and side-panel copilot now also resolve blocking clarification through the shared runtime contract: pending requests carry canonical identity (`sourceRunId + callId`), answer/default continue through the structured continuation path, blocked-card cancel resolves as a structured terminal dismissal, freeform composer sends while blocked remain cancel-and-new-run, and cancelled clarifications stay visible as cancelled transcript state instead of disappearing.
- The current shipped single-question clarification payload also carries additive `questionId` support through live events, persisted replay, and shared main-surface answer entry. Request identity remains `sourceRunId + callId`; `questionId` is preserved as question-level structure for compatibility with the future decision-system redesign.
- Shared main-surface clarification now also uses one runtime-owned controller for identity, durable-progress accounting, repeat suppression, safe fallback order, and runtime-authored clarification telemetry. Scoping may apply stricter policy on top, but it no longer owns a separate blocked-state model.
- Shared PDF attachment handling on the main chat surfaces is now truthful by contract: upload success and extraction success are separate states, unreadable PDFs stay attached with explicit failure status/copy, sends are blocked until the user removes or replaces the unreadable attachment, and the runtime no longer injects fabricated placeholder document text into model prompts.
- `/ai` now also restores recent recoverable run identity within bounded local scope: boot restore may reopen the last recoverable conversation and invoke the existing recovery path, but it does not reconstruct runtime state itself and it does not imply reload-time durable trace replay.
- Project conversation bootstrap now treats the first created conversation id as immediately authoritative in both state and bootstrap refs, so the initial project send cannot be auto-reselected as a fresh conversation and have its in-flight stream aborted by the restore/bootstrap path.
- Abrupt main-surface stream endings without concrete transport evidence now reconcile as `failed_interrupted` through the shared lifecycle contract instead of defaulting to `failed_network`, so recovery affordances and error copy no longer imply a network failure unless one is actually known.
- Progressive assistant streaming on the main surfaces now preserves the trace-before-answer placement invariant required by the transparency contract: if a reserved assistant row and durable trace/progress for the same turn coexist, the shared adapters move the reserved assistant behind the contiguous trace suffix instead of leaving a visible `assistant -> trace` shape that would strand `Process details` at the bottom.
- That placement repair is a live-session/runtime invariant only. `/ai` reload or conversation reselect still rebuilds from persisted messages + artifacts rather than full durable tool/checkpoint trace, so reload-time reconstruction of `Process details` remains a separate persistence task.
- Popup now uses the same shared runtime controller pattern as the main chat surfaces for its supported subset: progress, grounded checkpoints, settled semantic receipts, blocking clarification, and structured terminal errors all derive from the shared runtime state machine, while popup-specific prompt/tool limits remain explicit surface configuration instead of a separate runtime model.
- The CI anti-duplication architecture guard is already enforced and should continue preventing new per-surface chunk parsers.
- Chat/runtime work above this layer now depends on convergence here rather than inventing new per-surface semantics.
- Durable route identity is still weaker than the runtime contract on the main chat surfaces:
  - main project conversation is not yet a first-class route destination
  - side-panel copilot conversation identity is not yet URL-bound on workspace routes
  - `/ai` active conversation and attached project scope are still route-local client state rather than URL state

## Non-Negotiable Constraints
1. `/ai` remains usable without a project.
2. Project copilot remains project-scoped and shell-embedded.
3. Popup remains compact and intentionally reduced unless/until it can honestly support the same runtime contract.
4. No new per-surface chunk handlers or reducer forks may be added.
5. Surface-specific differences should live in rendering and capability gating, not in stream parsing or core runtime state transitions.

## Shared Runtime Rescue Invariants
These invariants originated in the chat-runtime portion of `FIX-012` and remain load-bearing shared runtime truth after that rescue was retired. They belong here because they are shared runtime truth, not UI doctrine.

### One canonical event authority
The shared runtime path remains the only authority for:

1. lifecycle events
2. tool lifecycle events
3. checkpoints
4. blocked/deferred states
5. recovery events
6. terminal reasons

No parallel transparency event family should be introduced.

### One shared live state model
`/ai` and the project surfaces must derive the same coarse live state vocabulary from the shared runtime path.

Required properties:

1. one run cannot occupy contradictory states at once
2. blocked states must be explicit runtime state, not inferred from transcript prose
3. shell-specific differences are rendering-only or capability-gated, never parser-level

The shared live state model should stay explicit enough to represent at least:

1. idle
2. running
3. retrying
4. waiting for input / blocked
5. terminal failure
6. terminal success

### One shared terminal-state contract
Abnormal-end semantics must remain shared across the main surfaces.

Rules:

1. `failed_interrupted` is used for abnormal endings without concrete network/transport evidence
2. `failed_network` is reserved for actual network/transport evidence
3. recovery affordances must be derived from durable truth, not shell-local optimism

### Runtime operating discipline is part of shared truth
The shared runtime path must also own:

1. stale-stream/reconnect discipline, including heartbeat or equivalent freshness signals where needed
2. duplicate or stale-delta suppression where needed
3. forced cleanup of running tools on abnormal end
4. bounded next-action truth after interruption
5. architecture enforcement against parser/reducer/recovery drift

### One parity rule for the main surfaces
`/ai`, main project conversation, and side-panel project copilot must share:

1. reducer/runtime semantics
2. terminal-reason semantics
3. blocked-state semantics
4. continue/retry truth

Popup remains a truthful reduced subset after `U3`; shared-engine convergence does not imply full popup parity.

## Shared Runtime Contract

### One Engine, Multiple Shells
Shared engine responsibilities:
1. Stream normalization.
2. Shared reducer state transitions.
3. Typed side-effect intents.
4. Retry/model continuity contract.
5. Ask-user continuation contract.
6. Typed tool lifecycle events.
7. Shared error and recovery semantics.

Shell responsibilities:
1. `/ai`: global/project attachment controls and richer presentation.
2. Project copilot: project-scoped shell and compact presentation.
3. Popup: compact shell, capability-gated presentation, handoff behavior.

### Ask-User Continuation Invariant
1. Every `user_input_required` event must preserve `page` and optional `section`.
2. Every pending clarification must be identified canonically by `sourceRunId + callId`; loop-control metadata such as `decisionBoundaryKey` is not identity.
3. Question-level identity may also be present as `questionId`, but it does not replace the canonical request identity.
4. Answering or accepting a recommended default from a blocked card must continue the same contextual flow through the structured resolution path, not by appending a plain user turn.
5. Cancelling from a blocked card must resolve the pending clarification as a visible terminal cancelled state without starting or resuming a run.
6. Freeform composer sends while blocked must cancel the pending clarification truthfully and start a fresh user turn; recovery/reload must preserve that cancelled state.
7. `/ai` boot restore may restore only recent recoverable conversation/run identity and must hand off all recoverability truth to the existing shared recovery path rather than inventing a second restore state machine.
8. Shared runtime policy, not surface heuristics, owns repeat-clarification suppression, durable-progress gating, and safe fallback order.
9. Cross-surface tests must continue validating this invariant.
10. Clarification telemetry is authored from the shared resolution/runtime path; surface analytics may exist, but they are not clarification truth.

### Context Contract V2
Canonical fields:
1. `scope`: `global | project | study`
2. `projectId`: nullable
3. `studyId`: nullable
4. `page`: UI route context
5. `section`: optional route subsection
6. `origin`: `ai_page | project_copilot | popup`
7. `version`: `v2`

Rules:
1. `/ai` defaults to `scope=global`, `projectId=null`.
2. `/ai` may attach to a project only when user-selected.
3. Project copilot always runs with `scope=project`.
4. Popup inherits opener context and transmits `origin=popup`, `version=v2`.

## Still-Relevant Portability Rules

### Must Stay Shared Across Surfaces
1. Streaming message updates.
2. Retry last message while preserving model/reasoning settings.
3. Ask-user interruption and continuation.
4. Tool lifecycle visibility.
5. Error contract and actionable recovery.
6. Context propagation.

### May Vary By Surface
1. Timeline density.
2. Receipt richness.
3. Reasoning presentation depth.
4. Advanced debug/provenance controls.

### Must Remain Surface-Specific
1. Popup does not mirror full-page timeline density.
2. Project-only controls do not appear in `/ai` global mode.
3. Compact shells may reduce presentation detail, but not alter the underlying runtime truth.

## Active Tasks

- [ ] `U1.6` Cross-surface replay parity and burn-in sign-off
  - Problem: the shared runtime is shipped, but the operational proof that it is stable enough to treat as canonical is still incomplete. `U1.6` is later-stage validation, not the current rescue task, and must not be used as a substitute for fixing obvious baseline agent breakage in ordinary manual use.
  - Remaining work:
    - keep this task paused until the targeted `FIX-011b` runtime deltas are patched; do not treat the current window as sign-off-only while stale-writer exclusion and cancelled terminal parity are still open
    - resume this task only while baseline agent usability/trust is healthy enough that burn-in is validating convergence instead of rediscovering obvious product failures
    - finish canary evidence using `docs/runbooks/chat-runtime-burn-in.md`
    - advance `docs/reports/u1-6-burn-in.md` in place as the single canonical live report for the active window rather than creating parallel live reports
    - use the runbook baseline-then-organic evidence flow, including the minimum manual baseline scenario pack and preserved raw validator JSON artifacts
    - preserve raw validator JSON either in the live report appendix or in linked dated snapshot artifacts under `docs/reports/`
    - if a scoped Day-0 probe returns zero rows, verify whether unscoped `metricVersion=3` telemetry exists before treating it as a runtime/telemetry outage; refresh the cohort scope when the scoped filter is stale
    - complete replay parity confidence for `/ai` vs project adapters
    - close the remaining protocol live-sync parity gap by making `/ai` artifact review and undo emit `protocolPatch` with project-data invalidation, matching project copilot immediate protocol patch behavior
    - prove parity for durable recovery truth, not only reducer-state parity
    - prove phase-backed paused-input and stale-finalize recovery behavior across the supported main surfaces
    - prove that a replaced/cancelled run cannot append replay-authoritative state or overwrite terminal truth after ownership is lost
    - prove that cancelled `runStatus` stays cancelled across live stream, recovery replay, and client lifecycle classification
    - prove that blocked-card dismissals replay as cancelled terminal truth rather than reverting to paused source-run truth
    - prove that long-lineage clarification hydration still preserves the shared suppression/resume contract
    - add burn-in checks for no indefinite reconnect loops, no contradictory same-run states, and truthful degraded continuation behavior
    - keep manual `project` evidence precise by naming the exact entrypoint exercised and covering both the main project conversation and side-panel project copilot entrypoints during the active window
    - serve as the operational sign-off blocker for retiring `FIX-011b` once the runtime delta audit confirms no additional shared-runtime gap remains
    - if a burn-in window fails, merge that failed-window evidence record before opening a remediation PR and then restart on a fresh window after the remediation deploy
    - finish sign-off on the current metric contract and thresholds
  - Exit criteria:
    - baseline agent stability/trust no longer blocks burn-in from being meaningful validation
    - burn-in evidence is complete and sign-offable
    - replay parity is proven at reducer-state + intent level
    - reliability thresholds are met for the shared runtime path

- [x] `U3` Popup migration to shared engine
  - Shipped:
    - popup now consumes the shared runtime controller/reducer path for its supported subset instead of keeping a popup-local chunk adapter
    - popup server requests use the shared `createAIService(...)` construction path, with popup-specific tool limits injected as surface configuration rather than hand-assembled runtime wiring
    - popup remains compact through capability gating, not bespoke runtime logic
    - `Continue in Copilot` promotion now preserves structured source context through `context_capture` attachment handoff instead of transcript-only copying
  - Residual limits:
    - popup remains intentionally ephemeral and reduced
    - popup still does not claim full artifact/replay/queued-follow-up parity

- [ ] `U4` Shadow cleanup and legacy-path removal
  - Problem: once burn-in and popup migration are complete, the remaining fallback/legacy branches become drift risks.
  - Remaining work:
    - remove obsolete handlers and adapters after the shared path is proven
    - simplify rollback semantics around one canonical engine
  - Exit criteria:
    - no duplicate chat state machines remain
    - the unified engine is the documented and enforced default

## Execution Order
1. Finish `U1.6` burn-in and sign-off.
2. Remove legacy/runtime duplication in `U4`.

## Rollout and Rollback Semantics
Current rollout control:
1. `U1.6` burn-in currently uses a production deployment baseline plus `CANARY_SINCE_UTC` and scoped `workspaceIds` / `userIds` evidence filters.
2. No active `CHAT_UNIFICATION_V2` runtime flag is currently wired in committed code; do not assume a live cohort-toggle path exists unless this plan and the burn-in runbook are updated first.
3. `U3` is already landed for the popup reduced surface; broader runtime roadmap ordering now flows through `U1.6`, then `U4`, while `docs/plans/plan-agentic.md` remains the top-level prioritization owner.

Rules:
1. Before `U4`, rollback should be treated as a deploy/version rollback unless a documented runtime cohort gate is explicitly reintroduced.
2. After `U4`, rollback remains a version rollback rather than a path fork.
3. If a runtime cohort gate is reintroduced later, document the exact control surface and reset the burn-in runbook/report before using it operationally.

## Test and Guardrail Requirements
Contract tests must continue covering:
1. Context V2 compatibility.
2. Shared reducer transition invariants.
3. Shared live-status invariants.
4. Intent emission invariants.
5. Retry model continuity.
6. Ask-user single-render and continuation-context invariants.
7. Structured blocked-request resolution, cancellation, and fallback invariants.
8. Typed tool lifecycle transitions.
9. Abnormal-end cleanup and reconnect-eligibility invariants.
10. Cancelled terminal parity invariants across live stream, replay, and client lifecycle classification.
11. Stale-writer exclusion after replace/cancel and finalization races.

Integration tests must continue covering:
1. `/ai` global roundtrip.
2. `/ai` attached-to-project roundtrip.
3. Project copilot roundtrip.
4. Popup roundtrip on the current reduced `U3` surface.
5. Cross-surface replay parity at reducer-state + intent level.

Architecture guardrails:
1. No new per-surface stream parsers.
2. No new reducer forks.
3. No bespoke recovery semantics on one main surface.
4. Shared runtime changes must preserve the CI architecture check in enforce mode.

## Dependency Notes
- [plan-agentic.md](./plan-agentic.md) now owns the active runtime stabilization program (`FIX-011b`) for disconnect classification, run convergence, durable continuation, and same-run recovery truth. This plan should treat that stabilization work as an upstream dependency rather than a competing runtime owner.
- [agent-runtime-remediation/plan-fix-012-baseline-stability.md](./agent-runtime-remediation/plan-fix-012-baseline-stability.md) owns the execution detail for the baseline rescue; this plan owns only the shared runtime portion of that rescue.
- `U1.6` should be treated as blocked whenever baseline agent usability/trust regresses badly enough that burn-in would again become bug discovery instead of later-stage convergence validation.
- [agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md](./agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md) defines the durable recovery/continuation contract that chat runtime work must consume rather than reinterpret per surface.
- [transparency-ui.md](./transparency-ui.md) depends on this plan for shared runtime parity across `/ai` and project copilot before broader truthful execution-trace rollout.
- [plan-agentic.md](./plan-agentic.md) depends on this plan whenever agent fixes require shared stream/runtime semantics instead of per-surface adapters.
- [plan-ux-ui.md](./plan-ux-ui.md) owns the durable navigation contract for chat surfaces:
  - `/project/[id]` becomes overview-only
  - main project conversation becomes `/project/[id]/conversation/[conversationId]`
  - side copilot adopts query-param identity on workspace routes
  - `/ai` adopts URL-owned conversation and project-scope identity
  - explicit URL must always beat local restore
- Shared runtime work in this file must preserve that navigation contract:
  - no live run may be rebound to a different conversation or project solely because a normalization pass changed the URL
  - popup remains promotion-only and should not gain first-class durable URL identity unless this plan and `plan-ux-ui.md` are updated together

Popup remains a truthful reduced subset only: after `U3`, popup should still be reviewed against the shared runtime contract's honest reduced subset, not full reconnect/replay chrome or continuation parity.

Queued follow-up parity is currently limited to `/ai`, main conversation, and side-panel copilot. Popup support remains intentionally deferred because the popup shell stays ephemeral/reduced even after shared-engine convergence and should not silently inherit a second durable-composer contract.

## Recently Completed
- Shared main chat surfaces now consume phase-backed recovery truth from persisted `AgentRun.runPhase` / `phaseEnteredAt`, so paused-input and stale-finalize cases reconcile through the shared runtime contract without adding new popup parity claims.
- Popup now preserves a truthful reduced shared-trace subset for live progress, grounded checkpoints, blocking clarification, and structured terminal failures through a shared reducer adapter while remaining compact.
- Popup now completes `U3` shared-engine convergence for its reduced contract: it uses the shared runtime controller pattern, renders compact settled semantic receipts from shared `tool_activity`, and promotes into full copilot through structured `context_capture` handoff instead of transcript-only copying.
- Shared pure reducer + intents shipped and now back both `/ai` and project copilot.
- `/ai` send and plan stream paths were migrated onto the shared reducer/runtime path.
- Popup payloads were aligned to Context V2 so popup no longer silently bypasses the canonical context contract.
- The anti-duplication architecture guard is enforced in CI, preventing new per-surface chunk-parser drift.
