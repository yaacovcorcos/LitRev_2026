# Reliability A3 Canary Runbook

## Scope
This runbook governs rollout of A2/A3 reliability changes using `reliability.v1.*` metrics.

## Rollout control model
- Deployment-level gate: `NEXT_PUBLIC_STREAM_RELIABILITY_A2`
- Optional runtime cohort gate: user/workspace allowlist from runtime config.
- If runtime cohort gate is not enabled, rollback requires redeploy.

## Required telemetry signals
- `reliability.v1.stream.started`
- `reliability.v1.stream.terminal`
- `reliability.v1.stream.stuck_watchdog_fired`
- `reliability.v1.retry.clicked`
- `reliability.v1.shell.session_started`
- `reliability.v1.shell.session_ended`

## Core rate definitions
- `stuck_watchdog_rate = stream.stuck_watchdog_fired / stream.started`
- `terminal_missing_rate = streams with no terminal within 45s / stream.started`
- `dead_scroll_rate = deadlock signals / shell.session_started`
- `retry_recovery_rate = retries that later end completed / retry.clicked`

## Staged sample minimums
Use these minimum sample sizes before making pass/fail decisions.

| Stage | Cohort | Minimum stream.started | Minimum shell.session_started | Minimum hold |
|---|---|---:|---:|---|
| Stage 0 | Internal | 300 | 120 | 4h |
| Stage 1 | 5% | 1,000 | 400 | 12h |
| Stage 2 | 25% | 3,000 | 1,200 | 24h |
| Stage 3 | 50% | 6,000 | 2,500 | 48h |
| Stage 4 | 100% | n/a (observe) | n/a (observe) | 48h post-rollout |

## Pass thresholds
Apply once minimum sample size for the stage is met.

| Metric | Threshold |
|---|---|
| `stuck_watchdog_rate` | `< 0.10%` |
| `terminal_missing_rate` | `< 0.10%` |
| `dead_scroll_rate` | `< 0.20%` |
| `retry_recovery_rate` | `>= 95%` |

## Rollback triggers
Rollback when one of the following occurs:
1. Any threshold violation for 2 consecutive 30-minute windows.
2. A reproducible P0 freeze/stuck-loading regression.
3. 3 or more independent user reports of dead-scroll within 1 hour for same surface.

## Rollback actions
1. If runtime cohort gate exists: disable cohort immediately.
2. Else: redeploy with `NEXT_PUBLIC_STREAM_RELIABILITY_A2=0`.
3. Keep telemetry enabled and collect 2 hours of post-rollback evidence.

## Required canary matrix
Before promoting stages, run this matrix:

| Device | A1 | A2 | MOBILE_SCROLL_LOCK_V2 | Required flows |
|---|---|---|---|---|
| Desktop | off | off | off | `/ai` send/stop/retry, project shell scroll |
| Desktop | on | off | off | project shell focus-mode switch + wheel |
| Desktop | on | on | off | `/ai` send + plan execute + popup send |
| Mobile | off | on | on | `/ai` entry, popup send, auth path smoke |
| Mobile | on | on | on | project route load + scroll ownership checks |

## Promotion checklist
1. Minimum samples met for stage.
2. All thresholds pass.
3. No open P0/P1 reliability incidents.
4. Matrix run complete with evidence attached.
5. On-call sign-off recorded.
