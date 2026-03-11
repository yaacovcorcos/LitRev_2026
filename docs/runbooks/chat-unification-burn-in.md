# Chat Unification Burn-In Runbook

This runbook operationalizes `U1.6` from `docs/plans/plan-chat-unification-v2.md`.
It is the only active U1.6 burn-in operational source.
Use it before opening `U3` popup migration.

## Purpose

Provide a deterministic, auditable process for chat-unification canary validation across `/ai` and project copilot.

## Preconditions

1. Shared chat runtime phases (`U1.0`-`U1.5`) are merged to `main`.
2. Telemetry migration for `ChatUnificationMetric` is applied in the target environment.
3. Burn-in metric contract is frozen at `CHAT_UNIFICATION_METRIC_VERSION=3` for the entire canary window.
4. Cohort scope is defined:
   - `workspaceIds`, and/or
   - `userIds`.
5. The release PR or merge to `main` is complete and production deployment evidence is captured:
   - deployed `main` commit SHA
   - production deployment id/URL
6. Sign-off owner and backup reviewer are assigned.
7. One canonical `CANARY_SINCE_UTC` timestamp is captured at flag enable time immediately after production deploy/enable.

## Required Inputs

- `CANARY_SINCE_UTC`
- `CANARY_DEPLOY_SHA`
- `CANARY_DEPLOYMENT_URL`
- `CANARY_WORKSPACE_IDS` and/or `CANARY_USER_IDS`
- sign-off owner + backup reviewer

## Environment Matrix

| Environment | Migration command | Notes |
|---|---|---|
| Local development | `cd next-app && npx prisma migrate dev` | Local-only. Do not use for shared envs. |
| Shared/Staging/Production | `cd next-app && bash scripts/db-ops.sh migrate` | Safe migration path for non-local envs. |

Do not run `migrate dev` against shared databases.

## Phase 0 - DB + Deployment Preflight

Run from `next-app/`:

1. `bash scripts/db-ops.sh diagnose`
2. `npx prisma validate`
3. `npx prisma migrate status`
4. Apply migration:
   - local: `npx prisma migrate dev`
   - shared/prod: `bash scripts/db-ops.sh migrate`
5. `npx prisma migrate status`
6. `npx tsc --noEmit`
7. `npx vitest run`

Record command outputs in the run report.

## Phase 1 - Canary Enable

1. Enable `NEXT_PUBLIC_ENABLE_CHAT_UNIFICATION_V2=1` and `ENABLE_CHAT_UNIFICATION_V2=1` for the canary cohort.
2. Immediately capture timestamp:
   - `CANARY_SINCE_UTC=<ISO8601 UTC at enable time>`
3. Owner confirms cohort scope + captured `CANARY_SINCE_UTC` before Day-0 validation.
4. Reuse exactly that timestamp for all daily and final commands.

## Phase 2 - Day-0 Data Quality Gate

Run (short-window allowed only for pre-day-7 checks):

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --allowShortWindow=1 \
  --requireScopedCohort=1 \
  --requireRunEndPerSurface=1 \
  --minRunIdCoveragePerSurface=0.95 \
  --json=1
```

Required Day-0 outcomes:

1. `run_end_observed` rows present for `ai` and `project`.
2. Run-end `runId` coverage threshold met per surface (or clear remediation plan documented).
3. Missing `runId` samples are reviewed and categorized.

## Phase 3 - Daily Progress Checks (Days 1-6)

Run once daily:

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --allowShortWindow=1 \
  --requireScopedCohort=1
```

Track trend lines daily:

1. Completed run counts overall and per surface.
2. Retry continuity (server-joined) rate and matched denominator.
3. Retry join health: matched pairs, unmatched intents/completions, and match-rate.
4. Ask-user mismatch rate and denominator.
5. Stuck-running violations.
6. Manual abnormal-end recovery spot check on `/ai` and project copilot:
   - known-run disconnect clears stale progress
   - live run offers `Reconnect` or `Stop & Retry` instead of a dead-end conflict
   - terminal reconciliation does not duplicate the final assistant/error state

## Phase 4 - Final Strict Gate (Earliest at +7 Days)

Run without short-window override. Paste terminal output into a report file created from `docs/reports/u1-6-burn-in-template.md`.

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=<CANARY_SINCE_UTC> \
  --metricVersion=3 \
  --workspaceIds=<ws1,ws2> \
  --userIds=<u1,u2> \
  --requireScopedCohort=1 \
  --requireRunEndPerSurface=1 \
  --minRunIdCoveragePerSurface=0.95
```

Pass criteria:

1. Window duration is at least 7 days.
2. Completed runs: `>= 200` total, `>= 50` on each surface.
3. Retry continuity: `>= 99%`, with matched denominator `>= 30` overall and `>= 10` per surface.
4. Retry join match-rate: `>= 95%` overall and `>= 90%` per surface.
5. Burn-in window is v2-clean for `retry_model_continuity` (mixed v1+v2 window is a fail).
6. Ask-user mismatch: `= 0`, with denominator `>= 30` overall and `>= 10` per surface.
7. Stuck-running violations: `= 0`.
8. Manual abnormal-end recovery spot check passes on `/ai` and project copilot with no dead-end `ACTIVE_RUN_EXISTS` path after a reconnectable disconnect.

## Metric Integrity Rules

1. `retry_model_continuity` is authoritative only from server-joined v2 intent/completion pairs inside `metricVersion=3` data.
2. Any metric schema or metric-version change during the active burn-in window invalidates the window.
3. If invalidated, restart burn-in with a new production deploy and a new `CANARY_SINCE_UTC`.

## Failure Handling

If strict gate fails:

1. Keep `U3` blocked.
2. Export JSON for diagnostics (`--json=1`) and attach to run report.
3. Open a remediation PR scoped to the failing metric.
4. Reset/extend canary window only after remediation deployment.

## Evidence Artifacts

1. Report template: `docs/reports/u1-6-burn-in-template.md`
2. Final report output: `docs/reports/u1-6-burn-in.md`
3. Optional daily snapshots: `docs/reports/u1-6-burn-in-YYYY-MM-DD.md`

## Sign-Off Checklist

1. Owner signs the final report as pass/fail.
2. Backup reviewer independently validates thresholds and cohort scope.
3. `docs/plans/plan-chat-unification-v2.md` implementation status is updated with factual outcome.
4. Only after sign-off, start `U3` popup migration.
