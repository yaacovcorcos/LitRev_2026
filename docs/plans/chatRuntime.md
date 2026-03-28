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
- truthful execution-trace design in [transparencyUI.md](./transparencyUI.md)
- route-specific UI polish in [plan-ux-ui.md](./plan-ux-ui.md)
- the durable URL/navigation contract for conversation identity, which is owned by [plan-ux-ui.md](./plan-ux-ui.md) and must be reflected here only where route identity constrains shared chat-runtime behavior

## Current Architecture
- `/ai` and project copilot already share the normalized stream event model through `shared-stream-reducer.ts` and shared runtime helpers in `lib/ai/`.
- `/ai` standard send and plan paths already run through the shared reducer/runtime contract.
- Project copilot already migrated off bespoke chunk accumulation onto the shared reducer/runtime path, but still carries a few surface adapter differences that matter for truthful progress/presentation.
- `/ai` and project copilot now share the same default transparency semantics on top of that runtime: `summary` mode stays provider-independent, compact process summaries are derived from existing shared trace facts, and raw provider reasoning is limited to explicit `full` mode on surfaces that support it.
- `/ai`, main conversation, and side-panel copilot now also share the queued-follow-up contract on top of that runtime: one explicit text-only next message may be queued while a run is active, rendered as an attached composer cap, and auto-dispatched only after the surface returns to true idle/sendable state.
- `/ai`, main conversation, and side-panel copilot now also consume phase-backed recovery truth from persisted `AgentRun.runPhase` / `phaseEnteredAt`, so paused-input and stale-finalize cases converge through the shared runtime contract instead of per-surface reconnect heuristics.
- `/ai`, main conversation, and side-panel copilot now also resolve blocking clarification through the shared runtime contract: pending requests carry canonical identity (`sourceRunId + callId`), answer/default continue through the structured continuation path, blocked-card cancel resolves as a structured terminal dismissal, freeform composer sends while blocked remain cancel-and-new-run, and cancelled clarifications stay visible as cancelled transcript state instead of disappearing.
- Shared main-surface clarification now also uses one runtime-owned controller for identity, durable-progress accounting, repeat suppression, safe fallback order, and runtime-authored clarification telemetry. Scoping may apply stricter policy on top, but it no longer owns a separate blocked-state model.
- `/ai` now also restores recent recoverable run identity within bounded local scope: boot restore may reopen the last recoverable conversation and invoke the existing recovery path, but it does not reconstruct runtime state itself and it does not imply reload-time durable trace replay.
- Project conversation bootstrap now treats the first created conversation id as immediately authoritative in both state and bootstrap refs, so the initial project send cannot be auto-reselected as a fresh conversation and have its in-flight stream aborted by the restore/bootstrap path.
- Abrupt main-surface stream endings without concrete transport evidence now reconcile as `failed_interrupted` through the shared lifecycle contract instead of defaulting to `failed_network`, so recovery affordances and error copy no longer imply a network failure unless one is actually known.
- Progressive assistant streaming on the main surfaces now preserves the trace-before-answer placement invariant required by the transparency contract: if a reserved assistant row and durable trace/progress for the same turn coexist, the shared adapters move the reserved assistant behind the contiguous trace suffix instead of leaving a visible `assistant -> trace` shape that would strand `Process details` at the bottom.
- That placement repair is a live-session/runtime invariant only. `/ai` reload or conversation reselect still rebuilds from persisted messages + artifacts rather than full durable tool/checkpoint trace, so reload-time reconstruction of `Process details` remains a separate persistence task.
- Popup has canonical Context V2 payload alignment and now derives its supported progress/checkpoint/error/blocking subset through a shared reducer adapter, but it still has not migrated fully onto the shared runtime engine.
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
These invariants are the chat-runtime portion of `FIX-012`. They belong here because they are shared runtime truth, not UI doctrine.

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

Popup remains a truthful reduced subset until `U3` lands.

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
3. Answering or accepting a recommended default from a blocked card must continue the same contextual flow through the structured resolution path, not by appending a plain user turn.
4. Cancelling from a blocked card must resolve the pending clarification as a visible terminal cancelled state without starting or resuming a run.
5. Freeform composer sends while blocked must cancel the pending clarification truthfully and start a fresh user turn; recovery/reload must preserve that cancelled state.
6. `/ai` boot restore may restore only recent recoverable conversation/run identity and must hand off all recoverability truth to the existing shared recovery path rather than inventing a second restore state machine.
7. Shared runtime policy, not surface heuristics, owns repeat-clarification suppression, durable-progress gating, and safe fallback order.
8. Cross-surface tests must continue validating this invariant.
9. Clarification telemetry is authored from the shared resolution/runtime path; surface analytics may exist, but they are not clarification truth.

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
    - resume this task only once `FIX-012` in `docs/plans/plan-agentic.md` has restored baseline agent usability/trust enough that burn-in is validating convergence instead of discovering obvious product failures
    - finish canary evidence using `docs/runbooks/chat-runtime-burn-in.md`
    - advance `docs/reports/u1-6-burn-in.md` in place as the single canonical live report for the active window rather than creating parallel live reports
    - use the runbook baseline-then-organic evidence flow, including the minimum manual baseline scenario pack and preserved raw validator JSON artifacts
    - preserve raw validator JSON either in the live report appendix or in linked dated snapshot artifacts under `docs/reports/`
    - complete replay parity confidence for `/ai` vs project adapters
    - prove parity for durable recovery truth, not only reducer-state parity
    - prove phase-backed paused-input and stale-finalize recovery behavior across the supported main surfaces
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

- [ ] `U3` Popup migration to shared engine
  - Problem: popup still does not use the same runtime path as `/ai` and project copilot, which blocks fully shared trace/error/tool semantics.
  - Remaining work:
    - wait for stabilized durable runtime truth before claiming broader recovery/continuation parity
    - move popup from bridge/special path onto shared reducer/runtime adapters
    - keep popup compact through capability gating, not bespoke runtime logic
    - preserve handoff to full copilot with no context loss
  - Exit criteria:
    - popup consumes the same runtime contracts as the other chat surfaces
    - popup remains a truthful reduced subset only until shared-engine convergence is complete

- [ ] `U4` Shadow cleanup and legacy-path removal
  - Problem: once burn-in and popup migration are complete, the remaining fallback/legacy branches become drift risks.
  - Remaining work:
    - remove obsolete handlers and adapters after the shared path is proven
    - simplify rollback semantics around one canonical engine
  - Exit criteria:
    - no duplicate chat state machines remain
    - the unified engine is the documented and enforced default

## Execution Order
1. Resolve baseline agent usability/trust blockers tracked in `docs/plans/plan-agentic.md` (`FIX-012`).
2. Finish `U1.6` burn-in and sign-off.
3. Land `U3` popup migration.
4. Remove legacy/runtime duplication in `U4`.

## Rollout and Rollback Semantics
Current rollout control:
1. `U1.6` burn-in currently uses a production deployment baseline plus `CANARY_SINCE_UTC` and scoped `workspaceIds` / `userIds` evidence filters.
2. No active `CHAT_UNIFICATION_V2` runtime flag is currently wired in committed code; do not assume a live cohort-toggle path exists unless this plan and the burn-in runbook are updated first.
3. `U3` becomes next only within this plan after `U1.6` passes; broader runtime roadmap ordering still follows `docs/plans/plan-agentic.md` unless it is explicitly updated there.

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

Integration tests must continue covering:
1. `/ai` global roundtrip.
2. `/ai` attached-to-project roundtrip.
3. Project copilot roundtrip.
4. Popup roundtrip once `U3` lands.
5. Cross-surface replay parity at reducer-state + intent level.

Architecture guardrails:
1. No new per-surface stream parsers.
2. No new reducer forks.
3. No bespoke recovery semantics on one main surface.
4. Shared runtime changes must preserve the CI architecture check in enforce mode.

## Dependency Notes
- [plan-agentic.md](./plan-agentic.md) now owns the active runtime stabilization program (`FIX-011b`) for disconnect classification, run convergence, durable continuation, and same-run recovery truth. This plan should treat that stabilization work as an upstream dependency rather than a competing runtime owner.
- [agent-runtime-remediation/plan-fix-012-baseline-stability.md](./agent-runtime-remediation/plan-fix-012-baseline-stability.md) owns the execution detail for the baseline rescue; this plan owns only the shared runtime portion of that rescue.
- `U1.6` should be treated as blocked whenever `plan-agentic.md` still tracks baseline agent breakage under `FIX-012`; burn-in is later-stage validation once ordinary manual use is no longer obviously broken.
- [agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md](./agent-runtime-remediation/plan-runtime-stabilization-and-continuation.md) defines the durable recovery/continuation contract that chat runtime work must consume rather than reinterpret per surface.
- [transparencyUI.md](./transparencyUI.md) depends on this plan for shared runtime parity across `/ai` and project copilot before broader truthful execution-trace rollout.
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

Popup remains a truthful reduced subset only: until `U3` lands, popup should be reviewed against the shared runtime contract's honest reduced subset, not full reconnect/replay chrome or continuation parity.

Queued follow-up parity is currently limited to `/ai`, main conversation, and side-panel copilot. Popup support is intentionally deferred until `U3` because the popup shell has not yet converged on the same shared runtime/composer contract.

## Recently Completed
- Shared main chat surfaces now consume phase-backed recovery truth from persisted `AgentRun.runPhase` / `phaseEnteredAt`, so paused-input and stale-finalize cases reconcile through the shared runtime contract without adding new popup parity claims.
- Popup now preserves a truthful reduced shared-trace subset for live progress, grounded checkpoints, blocking clarification, and structured terminal failures through a shared reducer adapter while remaining compact.
- Shared pure reducer + intents shipped and now back both `/ai` and project copilot.
- `/ai` send and plan stream paths were migrated onto the shared reducer/runtime path.
- Popup payloads were aligned to Context V2 so popup no longer silently bypasses the canonical context contract.
- The anti-duplication architecture guard is enforced in CI, preventing new per-surface chunk-parser drift.
