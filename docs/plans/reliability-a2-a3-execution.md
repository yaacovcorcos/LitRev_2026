# Reliability A2/A3 Execution Plan

## Objective
- A2: make stream end-states deterministic across `/ai`, project copilot, and popup chat through one shared lifecycle contract.
- A3: add a separate reliability telemetry namespace and staged canary gates.

## A2.0 Stream Lifecycle Spec (No Behavior Change)

### Canonical lifecycle owner
- Single canonical lifecycle implementation lives in shared stream runtime/reducer path (`lib/ai/*`).
- Surface components (`app/ai/page.tsx`, `hooks/useCopilotStreamActions.ts`, `components/PopupChat.tsx`) are adapters only.

### UI terminal reasons
- `completed`
- `cancelled_by_user`
- `failed_network`
- `failed_server`
- `timed_out`

Exactly one terminal reason must be recorded per run attempt.

### Mapping table: wire/server semantics -> UI terminal reason

| Source signal | Conditions | UI terminal reason | Notes |
|---|---|---|---|
| `run_end` chunk | `runStatus === "completed"` | `completed` | Terminal success path. |
| User stop action | Abort initiated by explicit user control | `cancelled_by_user` | Distinct from transport failure. |
| Abort signal (non-user) | unmount/navigation/new request replacement | `cancelled_by_user` for now in A2 | Follow-up may split into `cancelled_system`. |
| `error` chunk with `errorStatus >= 500` | server reported error | `failed_server` | Includes upstream provider failures surfaced by server. |
| `error` chunk with `errorStatus in [400..499]` | client/request contract failure | `failed_server` | UI treats this as server-side failure bucket in A2. |
| Fetch/stream exception | network/transport issue (`TypeError`, connection reset, offline) | `failed_network` | Includes mid-stream disconnects. |
| Watchdog expiry | token inactivity AND no active run/tool progress for timeout window | `timed_out` | Guarded timeout; avoids false positives during tool execution. |
| Stream ends without `run_end` and without error | parser ends unexpectedly | `failed_network` | Defensive fallback. |

### Transition contract

States:
- `idle`
- `running`
- `terminal`

Allowed transitions:
- `idle -> running`
- `running -> terminal`
- `terminal -> idle` (only when starting a brand-new attempt)

Invalid transitions:
- any transition out of `terminal` for same run attempt.
- duplicate terminal writes for same run attempt.

Reducer/runtime behavior for invalid transitions:
- ignore update (idempotent no-op)
- debug-log in development

### Watchdog contract
- Watchdog may finalize to `timed_out` only when all are true:
  - no content/reasoning/progress/tool events within `timeoutMs`
  - no active tool calls in shared runtime state
  - stream not already terminal
- If tool activity is still active, watchdog extends instead of terminating.

### Surface adapter rules
- Surface-local loading booleans derive from shared lifecycle terminal state.
- `Send`/`Stop`/`Retry` availability derives from shared lifecycle state, not independent booleans.
- Late stream events for closed attempts are dropped by run-attempt id/latch guard.

## A2 Delivery Sequence
1. A2.1: shared lifecycle module + terminal latch + finalize function.
2. A2.2: adapters for `/ai`, project copilot, popup chat.
3. A2.3: deterministic tests (unit/integration), one minimal offline E2E smoke.

## A3 Delivery Sequence (after A2)
1. A3.1: telemetry namespace and schema.
2. A3.2: staged canary gates and runbook updates.

## A3 telemetry namespace (separate from chat-unification)
Events:
- `reliability.v1.stream.started`
- `reliability.v1.stream.terminal`
- `reliability.v1.stream.stuck_watchdog_fired`
- `reliability.v1.retry.clicked`
- `reliability.v1.shell.session_started`
- `reliability.v1.shell.session_ended`

Required dimensions:
- `surface` (`ai`, `project`, `popup`)
- `viewport` (`mobile`, `desktop`)
- flags snapshot (`A1`, `A2`, mobile-scroll flags)
- network hint (`online`, `offline`, `slow`, `unknown`)

## A3 staged gate model
- Internal canary: low sample minimum, fast rollback.
- 5% canary: moderate sample minimum.
- 25%/50% canary: stricter sample minimum and tighter rates.
- 100% rollout only after stable 50% soak.

Rollout control:
- `NEXT_PUBLIC_*` is deployment-scoped only.
- true cohort canary/instant rollback requires runtime allowlist gating.
- if runtime gating is not active, rollback is redeploy-based and must be documented in runbook.
