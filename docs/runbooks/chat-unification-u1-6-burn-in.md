# Chat Unification U1.6 Burn-In Runbook

This runbook is the operational gate for U1.6 sign-off. Use it after metric truth fixes are merged and before any U3 popup migration work.

## Scope
- Surfaces: `/ai` and project copilot only
- Environment: production (`main` deploy)
- Metric contract: `CHAT_UNIFICATION_METRIC_VERSION=3`
- Burn-in duration: 7 days from a single canonical UTC enable timestamp

## Required Inputs
- `CANARY_SINCE_UTC`: exact UTC timestamp when canary exposure started
- `CANARY_DEPLOY_SHA`: commit SHA deployed to production `main`
- `CANARY_DEPLOYMENT_URL`: production deployment URL or ID
- `CANARY_WORKSPACE_IDS` and/or `CANARY_USER_IDS`
- sign-off owner + backup reviewer

## Day 0 Procedure
1. Merge release PR: `second -> main`.
2. Deploy production from `main`.
3. Record:
   - `CANARY_DEPLOY_SHA=<main sha>`
   - `CANARY_DEPLOYMENT_URL=<production deploy url-or-id>`
   - `CANARY_SINCE_UTC=<YYYY-MM-DDTHH:MM:SS.000Z>`
   - cohort IDs (`workspaceIds` and/or `userIds`)
4. Confirm metric contract freeze (`v3`) and no schema changes pending.
5. Run day-0 gate (allow short window for immediate verification):

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --requireScopedCohort=1 \
  --requireRunEndPerSurface=1 \
  --minRunIdCoveragePerSurface=0.95 \
  --allowShortWindow=1
```

## Daily Checks (Days 1-6)

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --allowShortWindow=1
```

## Final Gate (Day 7+)
Run this no earlier than 7 full days after `CANARY_SINCE_UTC`.

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --requireScopedCohort=1 \
  --requireRunEndPerSurface=1 \
  --minRunIdCoveragePerSurface=0.95 \
  --report=../docs/reports/u1-6-burn-in.md
```

## Pass Criteria
- Completed runs: `>= 200` total, and `>= 50` per surface
- Retry continuity: `>= 99%`
- Ask-user mismatch rate: `0`
- Stuck-running tool violation rate: `0`
- Denominator minimums:
  - retry continuity: `>= 30` total and `>= 10` per surface
  - ask-user mismatch: `>= 30` total and `>= 10` per surface
- Day-0 and final run-end coverage gates pass.

## Retry Continuity Status
- Current `retry_model_continuity.preserved` is client-computed and should be treated as provisional signal.
- Final U1.6 sign-off must either:
  - land server-side expected/actual correlation truth before sign-off, or
  - explicitly mark retry continuity as provisional in the sign-off record and keep U1.6 partially open.

## Invalidation Rules
- Any change to metric schema or metric version during active burn-in invalidates the window.
- If invalidated, restart with a new production deployment and a new `CANARY_SINCE_UTC`.

## Logging Template
Record this in the sign-off issue or report:
- Date started (UTC):
- `CANARY_DEPLOY_SHA`:
- `CANARY_DEPLOYMENT_URL`:
- `CANARY_SINCE_UTC`:
- `metricVersion`:
- cohort scope:
- Day-0 command + result:
- Day-7 command + result:
- Sign-off owner:
- Backup reviewer:
