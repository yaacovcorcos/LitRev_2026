# FIX-012 Baseline Stability Evidence Record

## Purpose

This is the canonical evidence artifact for retiring `FIX-012` in [plan-agentic.md](../plans/plan-agentic.md).

Use this file to record:

- the baseline manual scenario pack
- the active failure catalog
- the current rescue deltas still blocking closeout
- the automated validation/eval evidence used to retire `FIX-012`

This file is evidence, not a parallel plan tracker.

## Current Status

- `FIX-012` is retired in [plan-agentic.md](../plans/plan-agentic.md).
- The baseline manual scenario pack was revalidated on 2026-03-28 through combined evidence:
  - user-run manual validation across the main surfaces
  - a final local dev spot-check on `/ai`, project main conversation, and project side-panel shell loading
  - targeted blocked-clarification verification in `/ai`
- The final closeout pass surfaced one last visible clarification regression: overlong cosmetic `ask_user.header` values could emit a spurious failed tool step before the valid blocking card rendered. That normalization bug was fixed before retirement and is now covered by automated tests.
- `FIX-012d` request-bound clarification, runtime fallback enforcement, and surface parity remain implemented and covered by automated tests.
- `FIX-012` retirement is now auditable as complete for the main surfaces. Longer-run burn-in proof remains owned by later-stage `U1.6`, not by `FIX-012`.

## Known Shipped Baseline

The current repo already supports these `FIX-012` baseline claims:

- Default reasoning mode is `summary` in [reasoning-visibility.ts](../../next-app/lib/ai/reasoning-visibility.ts).
- `summary` no longer requests provider reasoning in [reasoning-request.ts](../../next-app/lib/ai/reasoning-request.ts).
- `failed_interrupted` is part of the shared terminal-state contract in [stream-lifecycle.ts](../../next-app/lib/ai/stream-lifecycle.ts).
- Visible-channel hygiene for known continuation payloads exists in [normalize-assistant-content.ts](../../next-app/lib/ai/normalize-assistant-content.ts).
- The main plan stack already reflects runtime-led summary semantics in [plan-agentic.md](../plans/plan-agentic.md), with reliability/sign-off posture in [plan-agent-quality.md](../plans/plan-agent-quality.md).
- Blocking clarification is now request-bound and runtime-owned on the main surfaces in [clarification-controller.ts](../../next-app/lib/server/ai/clarification-controller.ts), [route.ts](../../next-app/app/api/ai/stream/route.ts), [ai-service.ts](../../next-app/lib/server/ai/ai-service.ts), [page.tsx](../../next-app/app/ai/page.tsx), and [ProjectConversationContext.tsx](../../next-app/contexts/ProjectConversationContext.tsx).
- Hidden clarification-resume prompt strings have been removed from `/ai` and project surfaces; the route now synthesizes continuation input from structured `userInputResolution` instead of surface-authored control text.

## Scenario Pack

Record current outcomes for:

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

| Scenario | Surface | Current status | Key finding | Owning `FIX-012` slice | Notes |
|---|---|---|---|---|---|
| Normal run | `/ai` | `passed` | Default summary-mode answer flow stayed clean and understandable in ordinary use | `FIX-012c` | Revalidated in local dev during closeout on 2026-03-28 after user manual pass |
| Tool-heavy run | `/ai` | `passed` | Live process trace and completed answer flow stayed bounded without visible machine scaffolding | `FIX-012a` | Manual validation from user plus closeout spot-check |
| Long run | `/ai` | `passed` | No remaining baseline-blocking long-run instability was observed during manual validation | `FIX-012f` | Later burn-in depth remains `U1.6` scope, not baseline rescue scope |
| Main conversation run | project main conversation | `passed` | Main conversation behavior remained aligned with `/ai` for baseline trust/usability | `FIX-012a` | User manual validation confirmed parity on the project main surface |
| Side-panel copilot run | project side-panel copilot | `passed` | Side-panel remained a presentation variant of the shared runtime truth | `FIX-012a` | User manual validation confirmed parity on the side-panel surface |
| Interrupted run | main surfaces | `passed` | Recovery remained bounded and truthful enough to avoid baseline-closeout blockers | `FIX-012a` | User manual validation did not surface contradictory next actions |
| Stale reconnect | main surfaces | `passed` | No dead-end reconnect trap remained in the validated baseline scenarios | `FIX-012d` | Manual validation plus shared recovery contract/tests closed the remaining gate |
| Ask-user pause/resume | main surfaces | `passed` | Request-bound clarification resumed the paused request with explicit answer/default/cancel exits | `FIX-012d` | Final closeout spot-check found one header-normalization leak and fixed it before retirement |
| Retry after failure | main surfaces | `passed` | Retry/recovery affordances no longer blocked baseline closeout with contradictory UX | `FIX-012a` | Manual validation did not uncover a remaining shared recovery-action drift |
| Visible leak attempt | main surfaces | `passed` | No visible continuation/runtime scaffolding remained in ordinary-use validation on the main surfaces | `FIX-012b` | Known normalizers plus closeout spot-check kept visible chat clean |

## Failure Catalog

For each open failure, record:

- surface
- provider/model
- visible symptom
- current terminal state
- current recovery affordance shown
- whether visible leakage occurred
- failure class
- owning `FIX-012` slice
- current status

| Failure ID | Symptom | Surface | Provider/model | Failure class | Owning `FIX-012` slice | Current status | Notes |
|---|---|---|---|---|---|---|---|
| `FIX12-LEAK-001` | Ordinary use can still expose continuation/runtime scaffolding or other machine-only payloads in visible chat | main surfaces | varies | visible-channel leak | `FIX-012b` | `closed` | Manual validation plus final closeout spot-check did not reproduce visible scaffolding on the main surfaces |
| `FIX12-REC-001` | Interrupted or broken runs can still produce contradictory, dead-end, or misleading next actions | main surfaces | varies | continuation/recovery failure | `FIX-012a` | `closed` | Baseline closeout validation did not surface a remaining bounded-next-action failure on the main surfaces |
| `FIX12-ASK-001` | A blocked clarification could re-enter repeated `ask_user` loops, or surface resume through plain user-turn hacks instead of the paused request | main surfaces | varies | continuation/recovery failure | `FIX-012d` | `closed` | Request-bound resume, runtime fallback, surface parity, and closeout-time header normalization are now in place and validated |
| `FIX12-TRACE-001` | Default transparency can still feel noisy or low-value in ordinary use even without provider reasoning | main surfaces | varies | runtime-summary weakness | `FIX-012c` | `closed` | Runtime-led summary stayed understandable in the validated baseline scenarios without relying on provider reasoning |
| `FIX12-LONG-001` | Long-running tasks are still not proven stable enough for burn-in-quality confidence | main surfaces | varies | context overload or orchestration drift | `FIX-012f` | `closed_for_baseline` | No baseline-blocking long-run instability remains; later burn-in proof belongs to `U1.6` |

## Automated Evidence

Record the relevant automated coverage or eval evidence for:

- reducer/runtime contract behavior
- visible-output safety
- transparency-mode behavior
- abnormal-end recovery truth
- blocked/deferred state truth

| Evidence area | Current status | Source |
|---|---|---|
| Reasoning-mode default and request policy | `covered` | [reasoning-visibility.test.ts](../../next-app/lib/server/__tests__/reasoning-visibility.test.ts), [reasoning-request.test.ts](../../next-app/lib/ai/__tests__/reasoning-request.test.ts), [ai-service-reasoning-policy.test.ts](../../next-app/lib/server/__tests__/ai-service-reasoning-policy.test.ts) |
| Shared terminal-state classification | `covered` | [stream-lifecycle.test.ts](../../next-app/lib/ai/__tests__/stream-lifecycle.test.ts), [stream-processor-lifecycle.test.ts](../../next-app/lib/ai/__tests__/stream-processor-lifecycle.test.ts), [ai-stream-runtime.test.ts](../../next-app/lib/ai/__tests__/ai-stream-runtime.test.ts) |
| Visible-channel hygiene for known continuation payloads | `covered` | [normalize-assistant-content.test.ts](../../next-app/lib/ai/__tests__/normalize-assistant-content.test.ts) |
| Summary/full reasoning rendering behavior | `covered` | [ChatTimeline.reasoning-mode.test.tsx](../../next-app/components/chat/__tests__/ChatTimeline.reasoning-mode.test.tsx) |
| Durable continuation and recovery truth | `partially covered` | [durable-continuation.test.ts](../../next-app/lib/server/__tests__/durable-continuation.test.ts), [run-recovery.test.ts](../../next-app/lib/server/__tests__/run-recovery.test.ts) |
| Request-bound clarification identity, fallback order, and route telemetry | `covered` | [clarification-controller.test.ts](../../next-app/lib/server/__tests__/clarification-controller.test.ts), [scoping-workflow.test.ts](../../next-app/lib/server/__tests__/scoping-workflow.test.ts), [scoping-runtime.test.ts](../../next-app/lib/server/__tests__/scoping-runtime.test.ts), [route.test.ts](../../next-app/app/api/ai/stream/__tests__/route.test.ts), [chat-unification-metrics.test.ts](../../next-app/lib/server/__tests__/chat-unification-metrics.test.ts) |
| `/ai` + project clarification surface parity | `covered` | [page.clarification.test.tsx](../../next-app/app/ai/__tests__/page.clarification.test.tsx), [page.recovery.test.tsx](../../next-app/app/ai/__tests__/page.recovery.test.tsx), [ConversationMainView.test.tsx](../../next-app/components/project/__tests__/ConversationMainView.test.tsx), [ProjectCopilotPanel.test.tsx](../../next-app/components/project/__tests__/ProjectCopilotPanel.test.tsx), [project-conversation-stream-events.test.ts](../../next-app/contexts/__tests__/project-conversation-stream-events.test.ts) |
| Manual baseline scenario pack | `recorded` | User manual validation plus 2026-03-28 local closeout spot-checks on the main surfaces |

## Popup Non-Blocking Note

Popup remains a reduced honest subset and does not block `FIX-012` retirement. Record only reduced-subset honesty findings here when relevant.

## Closeout Decision

`FIX-012` is retired. This evidence record is historical; current agent-runtime status belongs in [plan-agentic.md](../plans/plan-agentic.md).

### Current gate status

`FIX-012` retirement gate status: `satisfied`

Recorded closeout basis:

- manual baseline validation was completed by the user on the main surfaces
- final local closeout spot-checks on 2026-03-28 revalidated `/ai` plus project shell loading and blocked clarification behavior
- visible leak, clarification-loop, and bounded-recovery gates are backed by both the manual closeout pass and the automated evidence listed above
- the last remaining closeout-time clarification regression was fixed before retirement rather than waived
