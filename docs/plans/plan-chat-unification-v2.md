# Chat Unification V2 Plan

## Purpose
Unify `/ai`, project copilot, and popup chat onto one shared chat engine while keeping `/ai` independently usable without a project and preserving popup as intentionally lightweight.

## Implementation Status
1. Completed: U0.5 popup contract alignment.
2. Completed: U1.1 shared pure reducer + intents (`shared-stream-reducer`).
3. Completed: U1.2 project adapter migration.
4. Completed: U1.3 and U1.4 `/ai` send and plan stream paths now run through the shared reducer runtime.
5. Completed: U1.5 anti-duplication CI guard is now enforced in CI by default (`--mode=enforce`).
6. In progress: U1.6 telemetry ingestion is implemented end-to-end (client metric emission + authenticated server sink + DB storage + run-end metric capture).
7. In progress: U1.6 preflight hardening now requires explicit cohort scoping, canonical canary timestamp capture, and Day-0 runId-quality checks before the 7-day gate clock starts.
8. In progress: U1.6 operational execution is codified in `docs/runbooks/chat-unification-burn-in.md` with reusable report template `docs/reports/u1-6-burn-in-template.md`; final 7-day sign-off evidence remains pending.
9. Pending: U3 popup migration to shared runtime.

## Non-Negotiable Constraints
1. No feature regression in any surface.
2. `/ai` remains project-optional (`global` by default).
3. `/ai` may attach to a project only when user-selected.
4. Project copilot remains project-scoped and shell-embedded.
5. Popup remains compact and fast, not a full mirror of `/ai`.

## Architecture Rule
Use `one engine, multiple shells`.

Shared engine:
1. Stream normalization.
2. Single client reducer/state machine.
3. Retry/resume + model continuity.
4. Unified ask-user continuation contract.
5. Typed tool lifecycle events.
6. Error classification and rendering contract.
7. Pure reducer output plus typed side-effect intents (no hidden side effects inside reducer).

Shell adapters:
1. `/ai`: global/project selector and advanced controls.
2. Project copilot: route-aware project context.
3. Popup: compact view + handoff, same contracts.

Hard rule:
1. No new per-surface chunk handlers after U1 starts.

## Ask-User Continuation Invariant
1. Every `user_input_required` item must carry origin context: `page` and optional `section`.
2. Answering from timeline or input must continue the run using that same context.
3. Dismiss must remain available as an explicit continuation action with deterministic fallback answer text.
4. Parity tests must validate ask-user continuation context on both `/ai` and project surfaces.

## Context Contract V2

Canonical fields:
1. `scope`: `global | project | study`.
2. `projectId`: nullable.
3. `studyId`: nullable.
4. `page`: UI route context.
5. `section`: optional route subsection.
6. `origin`: `ai_page | project_copilot | popup`.
7. `version`: `v2`.

Rules:
1. `/ai` default: `scope=global`, `projectId=null`.
2. `/ai` attached: `scope=project`, `projectId` required.
3. Project copilot: always `scope=project`, `projectId` required.
4. Popup inherits opener scope and must transmit `origin=popup` and `version=v2`.
5. Legacy payloads are adapted through a server/client compatibility adapter until U4 cleanup.

## Feature Portability Matrix

### 1) Must Port to All Surfaces (Core Runtime)
1. Conversation lifecycle (create/select/delete/rename where available).
2. Streaming message updates.
3. Retry last message preserving model and reasoning settings.
4. ask-user interruption and continuation.
5. Tool lifecycle state visibility (at least compact form in popup).
6. Error contract with actionable recovery.
7. Context propagation (`scope/projectId/studyId/page/section`).

Acceptance criteria:
1. Same input event sequence produces equivalent reducer state across all surfaces.
2. Retry never drops selected model.
3. ask-user renders exactly once per active prompt and resumes run.
4. Tool lifecycle states are typed, not inferred from prose.

### 2) Port Where UX Fits (Advanced, Non-Essential)
1. Rich timeline grouping and receipts.
2. Expanded reasoning panels.
3. Advanced debug/provenance controls.
4. Bulk artifact controls and deep plan management UI.

Acceptance criteria:
1. Advanced features stay optional by surface and do not alter core contracts.
2. Disabling advanced UI does not break run execution, retry, or ask-user.

### 3) Do Not Port (Intentional Surface-Specific)
1. Popup does not replicate full-page timeline density.
2. Popup does not expose heavy multi-panel controls.
3. Project-only controls do not appear in `/ai` global mode.

Acceptance criteria:
1. Popup remains compact with no regression in response latency.
2. `/ai` remains independent of project context by default.

## Phase Order (Updated)

### U0 - Parity Split + Governance Activation
1. Split parity checklist into `core runtime parity` vs `surface UX parity`.
2. Promote `CUX-D01` to active tracking in `plan-ux-ui.md` at kickoff.
3. Capture baseline metrics by surface:
   - first visible token latency
   - retry success/model continuity
   - ask-user completion
   - tool state freshness

Exit criteria:
1. Portability matrix is adopted and testable.
2. `CUX-D01` is explicitly active.

### U0.5 - Popup Contract Alignment (Blocker)
1. Align popup payloads so `popupMode`/`popupContext` map into Context V2.
2. Ensure popup path reaches popup runtime behavior intentionally (no silent bypass).
3. Add Context V2 adapter tests for legacy and popup payloads.

Exit criteria:
1. Popup sends/receives canonical context fields with `origin=popup`.
2. No popup runtime bypass due to contract mismatch.

### U1.0 - Runtime Contract Freeze
1. Freeze full `RuntimeStreamEvent` coverage (not subset): `content`, `reasoning_start`, `reasoning_delta`, `reasoning_end`, `tool_call`, `tool_result`, `done`, `error`, `artifact`, `progress`, `checkpoint`, `run_start`, `run_end`, `conversation_title`, `choices`, `plan_step_update`, `navigate`, `user_input_required`.
2. Define canonical state transitions and intent outputs for each event.
3. Add contract fixtures reused by both `/ai` and project adapter tests.

Exit criteria:
1. Event contract is explicit, exhaustive, and versioned.
2. Fixtures cover all event variants and malformed-edge payloads.

### U1.1 - Shared Pure Reducer + Intents
1. Implement one pure reducer that returns:
   - canonical chat state
   - typed intents (`persist_conversation_title`, `navigate`, `set_pending_choices`, `set_pending_user_input`, `emit_domain_invalidation`, etc.)
2. Keep side effects in per-surface adapters consuming intents.
3. Ban direct side effects in reducer implementation.

Exit criteria:
1. Reducer is deterministic and side-effect free.
2. Intent schema is shared and typed.

### U1.2 - Project Adapter Migration First
1. Migrate project copilot stream handling to the shared reducer + intent executor.
2. Preserve shell embedding and route context behavior.
3. Keep existing project legacy path as shadow fallback behind unification flags.

Exit criteria:
1. Project copilot runs primarily on shared reducer.
2. Feature parity and reliability blockers remain green.

### U1.3 - `/ai` Send Path Migration
1. Migrate `/ai` standard send/stream flow to shared reducer + intents.
2. Preserve `/ai` global mode and optional project attachment.

Exit criteria:
1. `/ai` send path no longer has bespoke chunk accumulation logic.

### U1.4 - `/ai` Plan Path Migration
1. Migrate `/ai` plan execution stream path to shared reducer + intents.
2. Preserve plan progress and failure behavior.

Exit criteria:
1. `/ai` no longer has split send/plan reducer logic.

### U1.5 - Shadow Fallback + Anti-Duplication CI
1. Keep legacy handlers as shadow-only fallback while burn-in runs.
2. Add scoped architecture checks in CI (client stream files only, allowlist based):
   - no new per-surface stream chunk parsers outside approved adapter/reducer files
   - no `reduceSharedStreamChunk()` usage outside approved shared adapters
3. Guard is now enabled in `enforce` mode by default in CI.

Exit criteria:
1. CI guard passes in `enforce` mode with zero unexpected violations.
2. Flag-off fallback remains available pre-cleanup.

### U1.6 - Cross-Surface Replay Parity + Burn-In Gate
1. Adapter extraction prerequisite: `/ai` runtime adapter must be test-separable (module export, not page-local function).
2. Add replay tests: same chunk sequence -> same canonical reducer state + emitted intents across `/ai` and project adapters.
   - fixtures source of truth: `next-app/lib/ai/stream-fixtures.ts` (`CHAT_STREAM_FIXTURES_V1`)
3. Parity scope:
   - strict parity target = reducer state + intents only
   - surface rendering differences remain covered by per-surface UI tests
4. Add burn-in telemetry metrics with explicit schema:
   - `retry_model_continuity`
   - `ask_user_context_mismatch`
   - `stuck_running_tools_after_run_end`
   - `run_end_observed`
   - `retry_model_continuity` v2 contract is authoritative:
     - client sends retry intent only (`requestKey`, `expectedModel`, `source=retry_action`)
     - server emits run-completion truth (`requestKey`, `actualModel`, `runId`, `runStatus`, `source=run_completion`)
     - analyzer computes `preserved` only from matched v2 intent/completion pairs
5. Authoritative metric sink decision (ADR-brief):
   - Use a dedicated `ChatUnificationMetric` table (instead of extending `RunEvent`) because U1.6 gate metrics include UI-level events that can occur without a valid `runId` (for example retry continuity and ask-user context mismatch checks), and we need one canonical store for both run-bound and non-run-bound evidence.
   - Keep `RunEvent` as the agent execution timeline source; avoid cross-purpose overloading.
6. Burn-in pass rule:
   - preflight addendum (must complete before Day 0):
     - merge the release PR to `main`, deploy production from `main`, and record the deployed commit SHA before starting burn-in measurement
     - define canary cohort source of truth (`workspaceIds` and/or `userIds`) or enforce canary-only feature-flag exposure for full window
     - choose sign-off environment (`production` default; `staging` is rehearsal only)
     - capture one canonical UTC enable timestamp (`CANARY_SINCE_UTC`) at feature-flag enable time and reuse it in every command/report
      - freeze burn-in metric contract version (current: `CHAT_UNIFICATION_METRIC_VERSION=3`) before canary starts; do not change during the 7-day window
     - any metric schema/version change during burn-in invalidates comparability and resets the 7-day window from the new enable timestamp
     - assign sign-off owner + backup reviewer
     - use `docs/runbooks/chat-unification-burn-in.md` for the canonical operational checklist, inputs, metric-integrity rules, and sign-off flow
   - rollout environment matrix:
     - local development only: `npx prisma migrate dev`
     - shared/staging/production: `bash scripts/db-ops.sh migrate`
     - never run `migrate dev` against shared environments
   - Day-0 data quality gate (run immediately after migration + enable):
     - require `run_end_observed` rows for both `ai` and `project` surfaces
     - validate run-end `runId` coverage per surface (non-null `runId` ratio)
     - include sample rows for missing `runId` in report output
   - window: 7 days internal canary, anchored from `CANARY_SINCE_UTC` (exact ISO in plan + report output)
   - minimum sample size: 200 completed runs total, with at least 50 `/ai` and 50 project runs
   - thresholds:
     - `retry_model_continuity` >= 99% on matched + eligible retry pairs only (`run_end_observed` status `completed`)
     - retry intent/completion match-rate >= 95% overall and >= 90% per surface
     - `ask_user_context_mismatch` = 0
     - `stuck_running_tools_after_run_end` = 0
     - retry join match-rate >= 95% overall and >= 90% per surface
   - non-vacuous denominator minimums:
     - `retry_model_continuity` intent denominator >= 30 overall and >= 10 per surface
     - `retry_model_continuity` matched denominator >= 30 overall and >= 10 per surface
     - `ask_user_context_mismatch` denominator >= 30 overall and >= 10 per surface
   - retry continuity truth contract (`metricVersion=3`):
     - client emits retry intent with `requestKey + expectedModel` at retry click
     - run completion is joined via `run_end_observed` using composite key (`requestKey + userId + workspaceId + surface`) and bounded join window
     - continuity is computed server-side/analyzer-side only (no client-provided `preserved` truth)
     - mixed metric versions in the same canary window fail validation unless explicit diagnostics override is used
   - completed-run counting rule:
     - count distinct `runId` where `run_end_observed.payload.runStatus === "completed"` and `runId` belongs to an authorized run
   - execution docs:
     - runbook: `docs/runbooks/chat-unification-burn-in.md`
     - report template: `docs/reports/u1-6-burn-in-template.md`
   - validation commands:
     - daily progress (first 7 days only):  
       `cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts --since=<CANARY_SINCE_UTC> --metricVersion=3 --workspaceIds=<ws1,ws2> --userIds=<u1,u2> --allowShortWindow=1`
     - strict final gate (no short-window override, earliest at +7 days; paste output into `docs/reports/u1-6-burn-in.md` created from the report template):
       `cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts --since=<CANARY_SINCE_UTC> --metricVersion=3 --workspaceIds=<ws1,ws2> --userIds=<u1,u2> --requireScopedCohort=1 --requireRunEndPerSurface=1 --minRunIdCoveragePerSurface=0.95`
7. Gate cleanup on parity + KPI pass.

Exit criteria:
1. Replay parity suite passes for shared stream fixtures.
2. Burn-in KPIs meet numeric thresholds above.
3. Owner for burn-in sign-off: AI runtime maintainers (Codex + designated reviewer).

### U2 - Typed Tool Activity Contract
1. Keep explicit `tool_activity` timeline types: `queued/running/done/failed`.
2. Reuse existing run metadata (`toolName`, `durationMs`) and avoid parallel persistence.
3. Define lane-specific latency targets:
   - control/tool transitions use low-latency path
   - reasoning/content deltas remain coalesced

Exit criteria:
1. Tool states are typed and rendered consistently on `/ai` and project copilot.
2. KPI matches coalescer realities by lane.

### U3 - Popup Migration to Shared Engine
1. Move popup from bridge to shared reducer/event adapters.
2. Preserve popup compact UX via capability gating, not custom runtime logic.
3. Preserve handoff to full copilot without loss of conversation context.

Exit criteria:
1. Popup uses same runtime contracts as other surfaces.
2. Popup remains lightweight with stable latency.

### U4 - Shadow Validation + Cleanup
1. Run burn-in with both legacy and unified paths in shadow validation mode.
2. After burn-in, remove obsolete handlers and adapters.
3. Update rollback semantics after cleanup.

Exit criteria:
1. No duplicate state machines remain.
2. Unified path is canonical and documented.

## Rollout + Rollback Semantics

Flags:
1. Keep environment flags:
   - `NEXT_PUBLIC_ENABLE_CHAT_UNIFICATION_V2`
   - `ENABLE_CHAT_UNIFICATION_V2`
2. Define and consume flags from a dedicated chat feature-flag module (not agent-only flag file).

Rollout:
1. Internal.
2. Power users.
3. Broad rollout after parity pass and reliability KPIs.

Rollback policy by stage:
1. U0-U3: flag-off may return to legacy runtime path.
2. Post-U4 cleanup: flag-off disables new UX layers but keeps unified engine; emergency rollback is via git/version rollback, not resurrecting deleted runtime code.

## Test Plan

Contract tests:
1. Context V2 adapter compatibility (including popup legacy payloads).
2. Full RuntimeStreamEvent normalization snapshots (all event types).
3. Shared pure reducer transition invariants.
4. Intent emission invariants (no missing/extra side effects).
5. Retry model continuity.
6. ask-user single-render invariant.
7. ask-user continuation context invariant (`page`/`section` preserved).
8. Typed tool lifecycle transitions.

Integration tests:
1. `/ai` global roundtrip.
2. `/ai` attached-to-project roundtrip.
3. Project copilot route-scoped roundtrip.
4. Popup roundtrip + handoff to full chat.
5. Cross-surface replay parity (`/ai` adapter vs project adapter) for identical chunk sequences at reducer-state+intent layer.

Regression tests:
1. Artifact review/apply flows.
2. Plan execution progress/failure.
3. Error rendering and recovery actions.
4. Conversation continuity across surface switches.

## Migration Safety Rules
1. One phase = one atomic PR sequence.
2. No mixed runtime refactor and major visual redesign in same PR.
3. Shadow validation required before deleting legacy code.
4. Keep `/ai` independence and project shell contracts intact during all phases.
5. Replace comment-only guardrails with enforceable CI architecture checks before cleanup.

## Plan Alignment
1. `CUX-D01` is the primary tracker and must remain active during this plan.
2. `CUX-027` tracks adjacent copilot UX dependencies.
3. `plan-thinking-v2.md` remains a dependent plan executed after U1.5 reliability blockers.
