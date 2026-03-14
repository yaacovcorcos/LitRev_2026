# U1.6 Burn-In Report

Status: `canary_started_day0_waiting_for_samples`
Last reviewed: `2026-03-15`

This file is the live status and eventual sign-off record for U1.6.
The production canary window is now anchored to a real deployment baseline, but Day-0 is not yet sign-offable because the scoped cohort has not produced qualifying post-deploy `ChatUnificationMetric` samples.

## Canary Metadata

- Environment: `production`
- Promotion path: `production deployment after merge to main`
- Deployed `main` commit SHA: `402f28f1b0e99d21e8b00e1502c9bb6dcfadc943`
- Production deployment id/url:
  - `dpl_Hv4xkxxm8asXF29eHqWyXVB3V9GP`
  - `https://litrev2026-m1d5mfud0-yaacovs-projects-a4ee3dc9.vercel.app`
  - alias: `https://litrev2026-yaacovs-projects-a4ee3dc9.vercel.app`
- Owner: `yaacovcorcos`
- Backup reviewer: `pending assignment`
- `CANARY_SINCE_UTC`: `2026-03-14T23:02:20.000Z`
- Cohort workspace IDs:
  - `workspace-IQj0cBXmKu2sCADMxlGZ4dUNjUnHIsGs`
- Cohort user IDs: `n/a`
- Rollout gate:
  - `deployment-level canary`
- Notes:
  - current committed runtime does not expose a live `CHAT_UNIFICATION_V2` flag gate
  - workspace scope is the evidence filter for this window, not a runtime allowlist

## Current Status

- Production DB preflight completed successfully against the real Vercel/Supabase environment:
  - `bash scripts/db-ops.sh diagnose`
  - `npx prisma validate`
  - `npx prisma migrate status`
- Local repo validation on the canary baseline also completed successfully:
  - `npx tsc --noEmit`
  - `npx vitest run`
- Day-0 validator ran against the scoped production cohort and returned `0` qualifying rows since `CANARY_SINCE_UTC`.
- `run_end_observed` is currently absent on both `ai` and `project` for the new window, so Day-0 remains open.
- `U1.6` remains incomplete and `U3` stays blocked pending a real validator/manual pass.

## Day-0 Attempt

Command run:

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=2026-03-14T23:02:20.000Z \
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
  - expected Day-0 gate failure due to no post-deploy cohort traffic yet

## Canonical Sources

- Runbook: `docs/runbooks/chat-unification-burn-in.md`
- Report template: `docs/reports/u1-6-burn-in-template.md`
- Plan: `docs/plans/plan-chat-unification-v2.md`

## Current Decision

- Burn-in started: `yes`
- Day-0 gate passed: `no`
- Burn-in pass: `no`
- `U3` popup migration unlocked: `no`

## Next Required Step

1. Wait for real post-deploy `ai` and `project` cohort traffic inside this canary window.
2. Re-run the Day-0 validator with the same `CANARY_SINCE_UTC` and cohort workspace.
3. Assign a named backup reviewer before final sign-off.
4. Do not claim `U1.6` pass or retire `FIX-011b` until the validator/manual gate both pass.
