# Reliability A0 Brief

## Goal
Lock two deterministic blocker failures and define hard pass/fail thresholds before any behavior fixes.

- Blocker 1: dead-scroll / frozen shell interactions.
- Blocker 2: stuck stream loading after interruption.

## Scope
A0 is evidence-only.

- In scope: repro scripts, baseline capture, numeric thresholds, metric authority, flag matrix, and first patch target recommendation.
- Out of scope: feature changes, UI refactors, virtualization, architecture migrations.

## Required Outcomes
1. Repro #1 and Repro #2 are deterministic and repeatable by another engineer.
2. Baseline metrics are captured for `/project/[id]`, `/ai`, and popup.
3. Numeric thresholds are finalized and unambiguous.
4. Canary gate authority is defined (server-side authoritative; client local debug-only).
5. A1 first patch target is selected from evidence.

## Failure Definitions
- `dead_scroll`: user wheel/touch input produces no movement for >2s while content should be scrollable.
- `stuck_stream_state`: stream UI remains loading >10s after disconnect/abort/error without terminal recovery UI.
- `stream_recovery_fail`: retry/resume after interruption fails to produce visible output within timeout budget.

## Deterministic Repro Scripts

### Repro #1: Dead-scroll in project shell
1. Open `/project/<id>`.
2. Switch to view mode with visible copilot.
3. Create enough messages to overflow timeline.
4. Hover copilot non-scroll regions (header/subhead) and wheel continuously.
5. Switch between conversation/view mode.
6. Resize panel and repeat.
7. Failure signature: wheel blocked and no visible scroll owner moves for >2s.

### Repro #2: Stuck loading after interruption
1. Open `/project/<id>` and `/ai`.
2. Send a prompt expected to stream >10s.
3. Toggle offline at ~2-4s after stream start.
4. Wait 10s.
5. Restore network.
6. Failure signature: loading persists without terminal recover controls, or retry/resume fails.

## Test Matrix (A0 mandatory)
- Surfaces: `/project/[id]` conversation, `/project/[id]` view + copilot, `/ai`, popup.
- Device profiles: desktop normal CPU, desktop 4x throttle, mobile viewport simulation.
- Network profiles: normal, Fast 3G, Slow 3G, offline 5s mid-stream then restore.
- Flag combos:
  - all mobile flags off
  - `NEXT_PUBLIC_MOBILE_VP_V2=1`
  - `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=1`
  - `NEXT_PUBLIC_MOBILE_VP_V2=1` + `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=1`

## Reliability Thresholds (pass/fail)
- `dead_scroll_incident_rate` per surface: `< 0.2%` sessions
- `stuck_stream_terminal_state_rate`: `< 0.1%` runs
- `retry_success_rate_after_interrupt`: `>= 98%`
- `p95_input_to_first_visible_response`:
  - desktop normal network: `<= 800ms`
  - poor network profile: `<= 1800ms`
- `p95_long_tasks_over_200ms_per_stream`: `<= 2`

## Metric Authority
- Authoritative for canary gates: server-ingested reliability metrics.
- Debug-only: local best-effort client storage.

## A0 Execution Steps
1. Freeze env + test profiles used for baseline.
2. Run deterministic repro scripts and save timestamped evidence.
3. Execute required checks from `next-app/`.
4. Capture baseline metrics for all required matrix combinations.
5. Produce A0 recommendation for A1 first patch target.

## Required Checks
From `next-app/`:

- `npx tsc --noEmit`
- `npx vitest run`
- `npx playwright test e2e/mobile-ai-entry-smoke.spec.ts e2e/mobile-login-smoke.spec.ts`

## A0 Deliverables
- `docs/plans/reliability-a0-brief.md` (this file)
- `output/reliability/a0/baseline-<date>.json`
- `output/reliability/a0/repro-evidence-<date>.md`
- `output/reliability/a0/a1-first-patch-recommendation-<date>.md`

## Exit Criteria
1. Both blocker failures are reproducible from written steps.
2. Thresholds are numeric and accepted.
3. Baseline exists across required surfaces + flag combos.
4. A1 target is selected based on evidence, not intuition.
