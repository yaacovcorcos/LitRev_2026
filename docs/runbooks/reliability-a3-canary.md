# Reliability A3 Canary Runbook

## Scope
This runbook governs rollout of A2/A3 reliability changes using `reliability.v1.*` metrics.

Responsive/mobile foundation certification is covered separately in
`docs/runbooks/responsive-foundation-certification.md`.

## Rollout control model
- `NEXT_PUBLIC_STREAM_RELIABILITY_A2` is an observability snapshot only. The client records its value in reliability dimensions; no stream-runtime branch reads it.
- Do not describe or operate that variable as a runtime rollback gate. Changing it cannot disable the stream reliability behavior.
- Scroll ownership has two real build-time behavior gates: `NEXT_PUBLIC_SCROLL_OWNERSHIP_A1` and `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`.
- There is currently no runtime cohort allowlist for this surface. Non-scroll runtime rollback therefore requires reverting the offending deployment and redeploying.

## Required telemetry signals
- `reliability.v1.stream.started`
- `reliability.v1.stream.terminal`
- `reliability.v1.stream.stuck_watchdog_fired`
- `reliability.v1.retry.clicked`
- `reliability.v1.shell.session_started`
- `reliability.v1.shell.session_ended`
- `reliability.v1.shell.dead_scroll_detected`

## Ingest integrity

- Authenticated `projectId`, `conversationId`, and `runId` attribution is not trusted directly from the client. Ingest verifies project access, conversation ownership, run ownership/project scope, and agreement between the run, conversation, and project before persisting the event.
- When a validated run supplies the canonical conversation or project scope, ingest records that server-derived scope even if the client omitted it.
- Client timestamps older than 24 hours or more than 5 minutes in the future are rejected. Canary windows and rate queries must continue to use server-owned `recordedAt`, not `clientTimestamp`.
- Anonymous public-route telemetry remains unscoped and must not include project, conversation, or run identifiers.

## Core rate definitions
- `stuck_watchdog_rate = stream.stuck_watchdog_fired / stream.started`
- `terminal_missing_rate = streams with no terminal within 45s / stream.started`
- `dead_scroll_rate = distinct shell session IDs with shell.dead_scroll_detected / distinct shell session IDs with shell.session_started`
- `retry_recovery_rate = retries that later end completed / retry.clicked`

## Dead-scroll measurement authority

The authoritative numerator is the server-ingested
`reliability.v1.shell.dead_scroll_detected` event in `ChatUnificationMetric`.
Shell detectors must emit through the canonical `recordDeadScrollIncident`
boundary in `next-app/lib/ai/reliability-telemetry.ts`.
The local `mobile_viewport_issue/dead_scroll` event is debug-only and must not be
used for promotion decisions.

A valid authoritative incident has:

- the active shell `sessionId`
- `surface = shell` and a scoped `projectId`
- input kind `wheel` or `touch`
- `blockedDurationMs >= 2000`
- the shell mode (`conversation` or `view`)

Count at most one affected session per `sessionId`, even if the detector emits
more than once. Scope numerator and denominator to the same time window and
cohort. A missing detector is not a zero-incident result: before opening a
canary window, prove the detector-to-ingest path with a controlled event outside
the promotion cohort. If that proof is absent, mark `dead_scroll_rate`
unavailable and do not promote.

Use the stored JSON payload to calculate the rate from authoritative rows:

```sql
\set canary_since_utc '2026-07-12T00:00:00Z'
\set canary_until_utc '2026-07-13T00:00:00Z'

WITH shell_events AS (
  SELECT
    "type",
    payload #>> '{payload,sessionId}' AS session_id
  FROM "ChatUnificationMetric"
  WHERE version = 1
    AND "recordedAt" >= :'canary_since_utc'::timestamptz
    AND "recordedAt" < :'canary_until_utc'::timestamptz
    -- Apply the same workspace/user/project cohort predicate here.
    AND "type" IN (
      'reliability.v1.shell.session_started',
      'reliability.v1.shell.dead_scroll_detected'
    )
), counts AS (
  SELECT
    COUNT(DISTINCT session_id) FILTER (
      WHERE "type" = 'reliability.v1.shell.session_started'
    ) AS started_sessions,
    COUNT(DISTINCT session_id) FILTER (
      WHERE "type" = 'reliability.v1.shell.dead_scroll_detected'
    ) AS dead_scroll_sessions
  FROM shell_events
  WHERE session_id IS NOT NULL
)
SELECT
  started_sessions,
  dead_scroll_sessions,
  dead_scroll_sessions::numeric / NULLIF(started_sessions, 0) AS dead_scroll_rate
FROM counts;
```

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
1. Stop stage promotion and identify the deployment or real behavior gate responsible for the regression.
2. For project-shell scroll regressions, redeploy with the affected real gate disabled: `NEXT_PUBLIC_SCROLL_OWNERSHIP_A1=0` and/or `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=0`.
3. For stream/runtime regressions without a dedicated gate, revert the offending deployment and redeploy. Do not use `NEXT_PUBLIC_STREAM_RELIABILITY_A2` as a rollback action.
4. Keep telemetry enabled and collect 2 hours of post-rollback evidence.

## Required canary matrix
Before promoting stages, run this matrix:

| Device | SCROLL_OWNERSHIP_A1 | MOBILE_SCROLL_LOCK_V2 | Required flows |
|---|---|---|---|
| Desktop | off | off | `/ai` send/stop/retry, project shell scroll |
| Desktop | on | off | project shell focus-mode switch + wheel; `/ai` send + plan execute + popup send |
| Mobile | off | on | `/ai` entry, popup send, auth path smoke |
| Mobile | on | on | project route load + scroll ownership checks |

## Promotion checklist
1. Minimum samples met for stage.
2. All thresholds pass.
3. No open P0/P1 reliability incidents.
4. Matrix run complete with evidence attached.
5. On-call sign-off recorded.
6. Dead-scroll detector-to-ingest proof exists and the authoritative rate query was run against the stage cohort.
