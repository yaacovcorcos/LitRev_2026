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
- `/ai`, main conversation, and side-panel copilot now also share the queued-follow-up contract on top of that runtime: one explicit text-only next message may be queued while a run is active, rendered as an attached composer cap, and auto-dispatched only after the surface returns to true idle/sendable state.
- `/ai`, main conversation, and side-panel copilot now also consume phase-backed recovery truth from persisted `AgentRun.runPhase` / `phaseEnteredAt`, so paused-input and stale-finalize cases converge through the shared runtime contract instead of per-surface reconnect heuristics.
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
2. Answering from timeline or input must continue the same contextual flow.
3. Dismiss remains an explicit continuation action with deterministic fallback text.
4. Cross-surface tests must continue validating this invariant.

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
  - Problem: the shared runtime is shipped, but the operational proof that it is stable enough to treat as canonical is still incomplete.
  - Remaining work:
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
1. Finish `U1.6` burn-in and sign-off.
2. Land `U3` popup migration.
3. Remove legacy/runtime duplication in `U4`.

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
3. Intent emission invariants.
4. Retry model continuity.
5. Ask-user single-render and continuation-context invariants.
6. Typed tool lifecycle transitions.

Integration tests must continue covering:
1. `/ai` global roundtrip.
2. `/ai` attached-to-project roundtrip.
3. Project copilot roundtrip.
4. Popup roundtrip once `U3` lands.
5. Cross-surface replay parity at reducer-state + intent level.

Architecture guardrails:
1. No new per-surface stream parsers.
2. No new reducer forks.
3. Shared runtime changes must preserve the CI architecture check in enforce mode.

## Dependency Notes
- [plan-agentic.md](./plan-agentic.md) now owns the active runtime stabilization program (`FIX-011b`) for disconnect classification, run convergence, durable continuation, and same-run recovery truth. This plan should treat that stabilization work as an upstream dependency rather than a competing runtime owner.
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
