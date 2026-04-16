# U1.6 Burn-In Report

Status: `paused_on_targeted_fix_011b_remediation`
Last reviewed: `2026-04-16`

This file is the single canonical live status and eventual sign-off record for U1.6.
The previously recorded March window remains historical context only. A fresh deployment-level canary is now required because current production is running runtime-affecting code from `main` commit `266b63f612d477abee0ca38dbed1d4e72637ae53`, so the older window can no longer serve as the final sign-off baseline.

## Canary Metadata

- Environment: `production`
- Promotion path: `production deployment after merge to main`
- Deployed `main` commit SHA: `266b63f612d477abee0ca38dbed1d4e72637ae53`
- Production deployment id/url:
  - `dpl_EfSdTMDoeWaC6YDnMf1ecuTDHbhH`
  - `https://litrev2026-p4ezh0bhi-yaacovs-projects-a4ee3dc9.vercel.app`
  - alias: `https://litrev2026-yaacovs-projects-a4ee3dc9.vercel.app`
- Owner: `yaacovcorcos`
- Backup reviewer: `pending assignment`
- `CANARY_SINCE_UTC`: `2026-04-04T23:26:13.860Z`
- Cohort workspace IDs: `pending reassignment`
- Cohort user IDs: `pending reassignment`
- Window basis: `fresh window after runtime-affecting deployment`
- Rollout gate:
  - `deployment-level canary`
- Notes:
  - current committed runtime does not expose a live `CHAT_UNIFICATION_V2` flag gate
  - the previously recorded workspace scope `workspace-IQj0cBXmKu2sCADMxlGZ4dUNjUnHIsGs` now yields zero `metricVersion=3` rows in both fresh-window and recent-history probes
  - an informational unscoped probe confirms sparse v3 telemetry still exists outside that recorded scope, so the current blocker is cohort selection + evidence capture rather than a proven telemetry outage

## Current Status

- The `2026-04-05` closeout audit is no longer the full runtime truth by itself. A deeper `2026-04-16` runtime audit found targeted shared-runtime deltas that should be patched before this window is treated as sign-off work:
  - stale/replaced runs are not yet fully excluded from later writes/finalization
  - cancelled terminal truth still drifts across live stream, replay, and client lifecycle
  - blocked-card dismissal still replays as paused source-run truth instead of durable cancelled truth
  - long-lineage clarification hydration still reads the oldest scanned history window
  - post-answer auxiliary work can still retro-fail a useful completed run
- The targeted local validation battery remains green, but it is now baseline evidence for remediation work rather than proof that `FIX-011b` is code-closed:
  - `npx tsc --noEmit`
  - targeted recovery/parity Vitest battery (`99` tests across recovery/convergence/route/main-surface adapters)
- Production DB preflight completed successfully against the real Vercel/Supabase environment:
  - `bash scripts/db-ops.sh diagnose`
  - `npx prisma validate`
  - `npx prisma migrate status`
- Current production is deployment `dpl_EfSdTMDoeWaC6YDnMf1ecuTDHbhH`, built from `main` commit `266b63f`.
- A fresh-window Day-0 probe using the previously recorded workspace filter returned `0` qualifying rows since `CANARY_SINCE_UTC`, with no `run_end_observed` samples on either `ai` or `project`.
- An informational recent-history probe using that same recorded workspace filter also returned `0` `metricVersion=3` rows since `2026-03-29T00:00:00.000Z`, so the prior scoped cohort is no longer a trustworthy evidence filter.
- An informational unscoped recent-history probe found sparse `metricVersion=3` telemetry outside the recorded workspace scope, so the current window should be treated as `cohort_not_yet_selected`, not as `runtime_regression_proven`.
- `U1.6` remains incomplete and is now blocked on both targeted remediation and operational evidence:
  - the shared-runtime deltas above must be patched before the fresh window can serve as sign-off rather than bug discovery
  - intentional scoped cohort selection for the fresh window
  - a recorded baseline scenario pack on the current deployment
  - preserved raw validator JSON for the active window
  - backup reviewer assignment before any strict gate can be called sign-offable

## Fresh Window Probe

Command run:

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=2026-04-04T23:26:13.860Z \
  --metricVersion=3 \
  --workspaceIds=workspace-IQj0cBXmKu2sCADMxlGZ4dUNjUnHIsGs \
  --allowShortWindow=1 \
  --requireScopedCohort=1 \
  --requireRunEndPerSurface=1 \
  --minRunIdCoveragePerSurface=0.95 \
  --json=1
```

Observed result summary:

- `rowsAnalyzed = 0`
- `run_end_observed` samples:
  - `ai = 0`
  - `project = 0`
- run-end `runId` coverage:
  - `ai = n/a`
  - `project = n/a`
- outcome:
  - the fresh deployment window is open, but Day-0 is not yet meaningful because the carried-forward scoped cohort appears stale

## Window Validity Decision

- Current recommendation: `pause burn-in closeout work until the targeted FIX-011b remediation lands, then continue the fresh 2026-04-04 deployment window only if the deployment is still current enough to serve as the sign-off basis`
- Reasoning:
  1. current production is `266b63f612d477abee0ca38dbed1d4e72637ae53`, not the older March deployment recorded in the prior report
  2. the `2026-04-16` deeper runtime audit found a targeted shared-runtime delta that should be fixed before burn-in resumes as sign-off work
  3. the previously recorded scoped workspace now yields zero fresh-window and recent-history v3 rows
  4. unscoped v3 telemetry still exists, so the empty scoped probe still indicates stale cohort selection rather than a confirmed telemetry outage
- The fresh window may remain valid on the current deployment only if the targeted remediation lands on the same deployment line and the owner can still finalize cohort scope on that deployment; otherwise reopen the window with a new `CANARY_SINCE_UTC`.

## Baseline Scenario Evidence

No baseline scenario pack has been recorded yet for the current deployment window.

When the current window becomes active:

1. keep this file as the only canonical live report
2. record the exact entrypoint exercised for every baseline row
3. ensure the `project` surface covers both the main project conversation and side-panel project copilot entrypoints at least once during the active window
4. preserve raw validator JSON in or alongside this report; the default storage convention for this execution remains dated snapshot files under `docs/reports/u1-6-burn-in-YYYY-MM-DD.md`

## Evidence Appendix

- 2026-04-05 raw validator/probe artifacts:
  - `docs/reports/u1-6-burn-in-2026-04-05.md`
- 2026-03-15 Day-0 raw validator JSON:
  - `not preserved; historical March attempt remains informational only`
- Future raw validator JSON artifacts:
  - default storage convention for this execution: linked dated snapshot files under `docs/reports/u1-6-burn-in-YYYY-MM-DD.md`

## Canonical Sources

- Runbook: `docs/runbooks/chat-runtime-burn-in.md`
- Report template: `docs/reports/u1-6-burn-in-template.md`
- Plan: `docs/plans/chat-runtime.md`

## Current Decision

- Burn-in started: `yes`
- Current window sign-offable: `no`
- Day-0 gate passed: `no`
- Burn-in pass: `no`
- `U3` popup migration unlocked: `no`

## Next Required Step

1. Patch the targeted `FIX-011b` shared-runtime deltas before using this window as sign-off evidence.
2. Reassess whether the current production deployment remains the right basis for the fresh window after remediation lands.
3. Assign a named backup reviewer before any future strict-gate result is treated as sign-offable.
4. Intentionally choose the current scoped cohort (`workspaceIds` and/or `userIds`) instead of reusing the stale March workspace filter.
5. Record the baseline scenario pack on the current production deployment, including the exact `project` entrypoint for every `project` row.
6. Rerun Day-0 with the refreshed scope and preserve raw `--json=1` output in or alongside this report.
7. Continue the daily/final runbook checks and do not retire `FIX-011b` until the validator/manual gate both pass under the fresh window contract.
