# Chat Runtime Burn-In Runbook

This runbook operationalizes `U1.6` from `docs/plans/chatRuntime.md`.
It is the only active U1.6 burn-in operational source.
Use it before opening `U3` popup migration.

Do not use this runbook as a substitute for baseline product rescue. If ordinary manual agent use is still exposing visible prompt/runtime leakage, obviously broken reconnect/recovery behavior, or generally unusable long-running runs, return to `FIX-012` in `docs/plans/plan-agentic.md` before opening or continuing a burn-in window.

## Purpose

Provide a deterministic, auditable process for chat-runtime canary validation across the `ai` and `project` surfaces.

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

Current repo/runtime note:
- No active `NEXT_PUBLIC_ENABLE_CHAT_UNIFICATION_V2` / `ENABLE_CHAT_UNIFICATION_V2` runtime gate is wired in committed code today.
- Until such a gate is explicitly reintroduced and documented, treat U1.6 burn-in as a deployment-level canary.
- `workspaceIds` / `userIds` remain the evidence scope filters for validation and sign-off, not a live rollout gate.
- As of the `FIX-011b` closeout delta audit on `2026-03-20`, no additional shared-runtime gap was identified beyond the shipped `run-convergence` / `run-recovery` path and current recovery/surface tests. `U1.6` remains the operational blocker for retiring `FIX-011b` only after baseline agent stability/trust is restored under `FIX-012`; until then, burn-in should not be mistaken for the primary rescue task.

## Required Inputs

- `CANARY_SINCE_UTC`
- `CANARY_DEPLOY_SHA`
- `CANARY_DEPLOYMENT_URL`
- `CANARY_WORKSPACE_IDS` and/or `CANARY_USER_IDS`
- sign-off owner + backup reviewer

The final strict gate is not sign-offable until the backup reviewer is named in the live report metadata.

## Environment Matrix

| Environment | Migration command | Notes |
|---|---|---|
| Local development | `cd next-app && npx prisma migrate dev` | Local-only. Do not use for shared envs. |
| Shared/Staging/Production | `cd next-app && bash scripts/db-ops.sh migrate` | Safe migration path for non-local envs. |

Do not run `migrate dev` against shared databases.

## Phase 0 - Fresh-Window DB + Deployment Preflight

Run this phase only when:

1. opening a fresh canary window, or
2. restarting after a deployed remediation or another evidence-affecting reset.

Do not rerun the full deployment/migration preflight when the existing window is still valid and the only blocker is lack of scoped samples.

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

1. Use the chosen production deployment as the canary baseline.
2. Immediately capture timestamp:
   - `CANARY_SINCE_UTC=<ISO8601 UTC deployment/enable time>`
3. Owner confirms cohort scope + captured `CANARY_SINCE_UTC` before Day-0 validation.
4. Reuse exactly that timestamp for all daily and final commands.
5. If a live runtime cohort gate is reintroduced later, record it explicitly in the report before using it operationally.

## Phase 1.5 - Baseline Scenario Pack

Before treating Day-0 as sign-offable, create a minimum owner-driven manual baseline inside the scoped cohort:

1. one completed `ai` run
2. one completed `project` run
3. one retry scenario
4. one ask-user scenario
5. one abnormal disconnect/recovery scenario

This baseline is part of the canonical burn-in contract. It creates deterministic early evidence; it does not replace the 7-day organic window.

Record each baseline scenario in the live report with:

1. timestamp (UTC)
2. surface
3. exact entrypoint exercised
4. scenario type
5. conversation ID and run ID when visible
6. pass/fail note

Project-surface coverage rule:

1. The validator collapses project-side telemetry under the `project` surface.
2. Manual evidence must therefore name the exact project entrypoint exercised for every `project` row.
3. By final sign-off, the active window must include at least one documented `project` row for:
   - the main project conversation entrypoint
   - the side-panel project copilot entrypoint

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
4. Baseline scenario pack is recorded in the live report.
5. Raw validator JSON is preserved in or alongside the live report.

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
6. Manual abnormal-end recovery spot check on `ai` and `project`:
   - known-run disconnect clears stale progress
   - disconnect after tool result converges without losing durable user-facing truth
   - disconnect before a paused question reaches the client restores the durable paused/question state cleanly
   - running ask-phase recovery re-surfaces as paused input instead of an active-run conflict or dead-end reconnect loop
   - live run offers `Reconnect` or `Stop & Retry` instead of a dead-end conflict
   - stale finalize-phase runs converge to one bounded next step instead of looking like healthy reconnectable work
   - recovery-required persistence failures surface truthfully and do not masquerade as clean replay parity
   - no-forward-progress detection converges to a bounded next step instead of indefinite reconnecting
   - degraded continuation is explicit and truthful when full durable recovery is unavailable
   - audited durable-continuation cases (`tool_result`, artifact state) offer `Continue` only when the server can prove the next step from persisted truth alone
   - checkpoint-backed continuation prefers a valid earlier safe boundary over later same-run replay noise when Slice 4 durable continuation alone would refuse to continue
   - invalidated checkpoints fall back cleanly to durable continuation or retry semantics instead of advertising fake checkpoint continuation
   - checkpoint continuation does not duplicate the already-completed tool step or artifact boundary it was seeded from
   - unsupported or invalidated continuation sources fall back cleanly to retry semantics instead of offering fake continuation
   - no contradictory same-run recovery/error states are visible on the same surface
   - reconnect behavior stays bounded rather than spinning indefinitely
   - terminal reconciliation does not duplicate the final assistant/error state

For every `project` manual spot check, record whether the exercised entrypoint was the main project conversation or the side-panel project copilot.

Preserve raw validator JSON from each run as evidence:

1. paste it into a report appendix, or
2. store it in a dated artifact file linked from the live report

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
  --minRunIdCoveragePerSurface=0.95 \
  --json=1
```

Pass criteria:

1. Window duration is at least 7 days.
2. Completed runs: `>= 200` total, `>= 50` on each surface.
3. Retry continuity: `>= 99%`, with matched denominator `>= 30` overall and `>= 10` per surface.
4. Retry join match-rate: `>= 95%` overall and `>= 90%` per surface.
5. Burn-in window is v2-clean for `retry_model_continuity` (mixed v1+v2 window is a fail).
6. Ask-user mismatch: `= 0`, with denominator `>= 30` overall and `>= 10` per surface.
7. Stuck-running violations: `= 0`.
8. Manual abnormal-end recovery spot check passes on `ai` and `project`, with the `project` evidence explicitly naming the exercised entrypoint and no dead-end `ACTIVE_RUN_EXISTS` path after a reconnectable disconnect.
9. Recovery-required persistence failure behavior is truthful under the burn-in spot checks and does not invent full replay parity.
10. No-forward-progress detection and degraded continuation behavior both converge to one bounded user-visible next step with no contradictory same-run states.
11. Audited durable-continuation cases succeed without duplicating the already-completed durable step, and unsupported cases never advertise `Continue`.
12. Checkpoint-backed continuation prefers a valid earlier safe boundary when later same-run noise exists, and invalidated checkpoints fall back cleanly without duplicating the completed source step.
13. Phase-backed ask/finalize recovery cases stay truthful: ask-phase reconnects resolve to paused-input handoff, and stale finalize-phase reconnects resolve to bounded user action instead of indefinite reconnect.
14. Backup reviewer is assigned in the report metadata before sign-off is claimed.

## Metric Integrity and Window Validity Rules

1. `retry_model_continuity` is authoritative only from server-joined v2 intent/completion pairs inside `metricVersion=3` data.
2. Reset the active burn-in window only when a deployed change affects runtime behavior, telemetry meaning, cohort definition, or the pass/fail contract used to interpret the evidence.
3. A validator or threshold change resets the window only when it materially changes the meaning of pass/fail for the production evidence being reviewed.
4. Docs-only/report-only maintenance does not reset the window.
5. If invalidated, restart burn-in with a new production deploy and a new `CANARY_SINCE_UTC`.

## Failure Handling

If strict gate fails:

1. Keep `U3` blocked.
2. Export JSON for diagnostics (`--json=1`) and attach to run report.
3. If the active window is being tracked in a docs-only evidence PR, finalize and merge that PR as the failed-window record before opening remediation.
4. Open a remediation PR scoped to the failing metric.
5. Reset/extend canary window only after remediation deployment, using a new `CANARY_SINCE_UTC` and a new burn-in evidence branch/PR.

## Evidence Artifacts

1. Report template: `docs/reports/u1-6-burn-in-template.md`
2. Final report output: `docs/reports/u1-6-burn-in.md`
3. Optional daily snapshots: `docs/reports/u1-6-burn-in-YYYY-MM-DD.md`

## Sign-Off Checklist

1. Owner signs the final report as pass/fail.
2. Backup reviewer independently validates thresholds and cohort scope.
3. `docs/plans/chatRuntime.md` implementation status is updated with factual outcome.
4. `U3` becomes the next task only within `docs/plans/chatRuntime.md`; broader roadmap ordering still follows `docs/plans/plan-agentic.md` unless explicitly changed there.
5. Only after sign-off, start `U3` popup migration.
