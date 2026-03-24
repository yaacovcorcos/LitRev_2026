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

- `FIX-012` remains open in [plan-agentic.md](../plans/plan-agentic.md) as the active baseline rescue program.
- This evidence record now captures current shipped baseline truth from code/tests plus the remaining manual evidence gap.
- `FIX-012d` request-bound clarification, runtime fallback enforcement, and surface parity are now implemented and covered by automated tests.
- The manual baseline scenario pack has not yet been fully executed and recorded here after the `FIX-012d` finish work.
- `FIX-012` retirement is therefore **not yet auditable as complete**, even though important baseline behavior is already shipped.

## Known Shipped Baseline

The current repo already supports these `FIX-012` baseline claims:

- Default reasoning mode is `summary` in [reasoning-visibility.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/reasoning-visibility.ts).
- `summary` no longer requests provider reasoning in [reasoning-request.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/reasoning-request.ts).
- `failed_interrupted` is part of the shared terminal-state contract in [stream-lifecycle.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/stream-lifecycle.ts).
- Visible-channel hygiene for known continuation payloads exists in [normalize-assistant-content.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/normalize-assistant-content.ts).
- The main plan stack already reflects runtime-led summary semantics in [plan-agentic.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/plan-agentic.md), [chatRuntime.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/chatRuntime.md), and [transparencyUI.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/transparencyUI.md).
- Blocking clarification is now request-bound and runtime-owned on the main surfaces in [clarification-controller.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/ai/clarification-controller.ts), [route.ts](/Users/yaacovcorcos/LitRev_2026/next-app/app/api/ai/stream/route.ts), [ai-service.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/ai/ai-service.ts), [page.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/app/ai/page.tsx), and [ProjectCopilotContext.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/contexts/ProjectCopilotContext.tsx).
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
| Normal run | `/ai` | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012c` | Runtime-led summary is shipped, but ordinary-use manual proof is still missing |
| Tool-heavy run | `/ai` | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012a` | Needs bounded recovery and trace-quality confirmation |
| Long run | `/ai` | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012f` | Only in scope if context/compaction issues still cause visible instability |
| Main conversation run | project main conversation | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012a` | Needs parity confirmation against `/ai` |
| Side-panel copilot run | project side-panel copilot | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012a` | Needs parity confirmation against `/ai` |
| Interrupted run | main surfaces | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012a` | Shared `failed_interrupted` exists, but baseline pack needs to verify UX truth |
| Stale reconnect | main surfaces | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012d` | Needs continue/retry/wait truth verification |
| Ask-user pause/resume | main surfaces | `automated coverage landed; manual rerun pending` | Request-bound clarification, shared fallback order, and surface parity are implemented; manual recheck still required | `FIX-012d` | See automated evidence for route/runtime/surface coverage below |
| Retry after failure | main surfaces | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012a` | Needs bounded next-action verification |
| Visible leak attempt | main surfaces | `not yet run` | Canonical post-reset manual evidence not yet recorded | `FIX-012b` | Known normalization exists, but scenario proof is still missing |

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
| `FIX12-LEAK-001` | Ordinary use can still expose continuation/runtime scaffolding or other machine-only payloads in visible chat | main surfaces | varies | visible-channel leak | `FIX-012b` | `open` | This is the top visible-output blocker tracked in [plan-agentic.md](/Users/yaacovcorcos/LitRev_2026/docs/plans/plan-agentic.md) |
| `FIX12-REC-001` | Interrupted or broken runs can still produce contradictory, dead-end, or misleading next actions | main surfaces | varies | continuation/recovery failure | `FIX-012a` | `open` | Shared recovery truth is shipped in part, but closeout evidence is not complete |
| `FIX12-ASK-001` | A blocked clarification could re-enter repeated `ask_user` loops, or surface resume through plain user-turn hacks instead of the paused request | main surfaces | varies | continuation/recovery failure | `FIX-012d` | `implemented_pending_manual_validation` | Request-bound resume, runtime fallback, and surface parity are now covered automatically; manual baseline rerun still required before closeout |
| `FIX12-TRACE-001` | Default transparency can still feel noisy or low-value in ordinary use even without provider reasoning | main surfaces | varies | runtime-summary weakness | `FIX-012c` | `open` | Runtime-led summary is shipped, but qualitative baseline proof is still missing |
| `FIX12-LONG-001` | Long-running tasks are still not proven stable enough for burn-in-quality confidence | main surfaces | varies | context overload or orchestration drift | `FIX-012f` | `open` | Keep narrow; only baseline-breaking long-run issues belong here |

## Automated Evidence

Record the relevant automated coverage or eval evidence for:

- reducer/runtime contract behavior
- visible-output safety
- transparency-mode behavior
- abnormal-end recovery truth
- blocked/deferred state truth

| Evidence area | Current status | Source |
|---|---|---|
| Reasoning-mode default and request policy | `covered` | [reasoning-visibility.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/reasoning-visibility.test.ts), [reasoning-request.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/__tests__/reasoning-request.test.ts), [ai-service-reasoning-policy.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/ai-service-reasoning-policy.test.ts) |
| Shared terminal-state classification | `covered` | [stream-lifecycle.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/__tests__/stream-lifecycle.test.ts), [stream-processor-lifecycle.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/__tests__/stream-processor-lifecycle.test.ts), [ai-stream-runtime.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/__tests__/ai-stream-runtime.test.ts) |
| Visible-channel hygiene for known continuation payloads | `covered` | [normalize-assistant-content.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/ai/__tests__/normalize-assistant-content.test.ts) |
| Summary/full reasoning rendering behavior | `covered` | [TimelineRenderer.reasoning-mode.test.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/components/copilot/__tests__/TimelineRenderer.reasoning-mode.test.tsx) |
| Durable continuation and recovery truth | `partially covered` | [durable-continuation.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/durable-continuation.test.ts), [run-recovery.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/run-recovery.test.ts) |
| Request-bound clarification identity, fallback order, and route telemetry | `covered` | [clarification-controller.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/clarification-controller.test.ts), [scoping-workflow.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/scoping-workflow.test.ts), [scoping-runtime.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/scoping-runtime.test.ts), [route.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/app/api/ai/stream/__tests__/route.test.ts), [chat-unification-metrics.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/lib/server/__tests__/chat-unification-metrics.test.ts) |
| `/ai` + project clarification surface parity | `covered` | [page.test.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/app/ai/__tests__/page.test.tsx), [ConversationMainView.test.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/components/project/__tests__/ConversationMainView.test.tsx), [ProjectCopilot.test.tsx](/Users/yaacovcorcos/LitRev_2026/next-app/components/__tests__/ProjectCopilot.test.tsx), [project-copilot-stream-events.test.ts](/Users/yaacovcorcos/LitRev_2026/next-app/contexts/__tests__/project-copilot-stream-events.test.ts) |
| Manual baseline scenario pack | `not yet recorded here` | Required before `FIX-012` retirement |

## Popup Non-Blocking Note

Popup remains a reduced honest subset and does not block `FIX-012` retirement. Record only reduced-subset honesty findings here when relevant.

## Closeout Decision

`FIX-012` can retire only when this evidence record shows the retirement gate in [plan-fix-012-baseline-stability.md](../plans/agent-runtime-remediation/plan-fix-012-baseline-stability.md) is satisfied.

### Current gate status

`FIX-012` retirement gate status: `not yet satisfied`

Still missing:

- recorded manual results for the baseline scenario pack on `/ai`, project main conversation, and side-panel copilot
- canonical proof that the known visible leak families no longer surface in ordinary use on the main surfaces
- canonical proof that ordinary-use recovery always converges to one bounded truthful next action
- canonical proof that default transparency is consistently understandable in ordinary use without provider reasoning
