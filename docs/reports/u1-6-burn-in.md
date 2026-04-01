# U1.6 Burn-In Report

Status: `fresh_window_open_day0_pending_manual_evidence`
Last reviewed: `2026-04-01`

This file is the single canonical live status and eventual sign-off record for U1.6.
The previous reassessment window is now superseded by a fresh window on the current production baseline.

## Canary Metadata

- Environment: `production`
- Promotion path: `production deployment after merge to main`
- Deployed `main` commit SHA: `bf15985ae28f69c16eb97d5de416dcb80293a9a9`
- Production deployment id/url:
  - `dpl_AbL89EDxLppdNsCV8SGmbimCgWGz`
  - `https://litrev2026-pk68bxtad-yaacovs-projects-a4ee3dc9.vercel.app`
  - alias: `https://litrev2026-yaacovs-projects-a4ee3dc9.vercel.app`
  - alias: `https://litrev2026-git-main-yaacovs-projects-a4ee3dc9.vercel.app`
- Owner: `yaacovcorcos`
- Backup reviewer: `pending assignment`
- `CANARY_SINCE_UTC`: `2026-03-31T06:26:24.000Z`
- Cohort workspace IDs:
  - `workspace-IQj0cBXmKu2sCADMxlGZ4dUNjUnHIsGs`
- Cohort user IDs: `n/a`
- Window basis: `fresh window on current production baseline`
- Rollout gate:
  - `deployment-level canary`
- Notes:
  - current committed runtime does not expose a live `CHAT_UNIFICATION_V2` flag gate
  - workspace scope is the evidence filter for this window, not a runtime allowlist
  - no production redeploy was required for this reset because the current production deployment already matches repo-root `origin/main`

## Current Status

- Production deployment baseline was revalidated on `2026-04-01`:
  - current repo-root `origin/main` SHA: `bf15985ae28f69c16eb97d5de416dcb80293a9a9`
  - current production deployment SHA: `bf15985ae28f69c16eb97d5de416dcb80293a9a9`
- Production DB preflight completed successfully against the real Vercel/Supabase environment by sourcing a temporary `vercel env pull` file:
  - `bash scripts/db-ops.sh diagnose`
  - `npx prisma validate`
  - `npx prisma migrate status`
- Local repo validation on the same code baseline completed successfully:
  - `npx tsc --noEmit`
  - `npx vitest run`
- Fresh-window Day-0 validator ran against the scoped production cohort and returned `0` qualifying rows since `CANARY_SINCE_UTC`.
- `run_end_observed` is currently absent on both `ai` and `project` for the new window, so Day-0 remains open.
- The baseline scenario pack has not been recorded yet under the fresh window.
- Backup reviewer assignment is still missing, so no future strict gate can be treated as sign-offable until that is fixed.
- `U1.6` remains incomplete and `U3` stays blocked pending baseline scenario evidence plus a real validator/manual pass.
- The current `FIX-011b` posture remains unchanged: no new shared-runtime code gap was identified here, so the remaining blocker is still fresh evidence/sign-off unless burn-in reveals a narrow drift that needs a separate remediation branch.

## Phase 0 Preflight

Commands run on `2026-04-01`:

- production env preflight:
  - `cd next-app && set -a && source /tmp/litrev-u16-prod.env && set +a && bash scripts/db-ops.sh diagnose`
  - `cd next-app && set -a && source /tmp/litrev-u16-prod.env && set +a && npx prisma validate`
  - `cd next-app && set -a && source /tmp/litrev-u16-prod.env && set +a && npx prisma migrate status`
- local repo validation:
  - `cd next-app && npx tsc --noEmit`
  - `cd next-app && npx vitest run`

Observed result summary:

- production DB connectivity: `passed`
- production migration status: `up to date`
- local typecheck: `passed`
- local Vitest suite: `passed`

## Day-0 Attempt

Command run:

```bash
cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts \
  --since=2026-03-31T06:26:24.000Z \
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
  - expected Day-0 short-window failure due to no scoped post-baseline traffic yet
- raw JSON artifact:
  - `docs/reports/u1-6-burn-in-2026-04-01.md`

## Baseline Scenario Evidence

No baseline scenario pack has been recorded yet for the fresh `2026-03-31` window.

To satisfy the current runbook contract, the active window still needs:

1. one completed `/ai` run
2. one completed project main-conversation run
3. one completed project side-panel copilot run
4. one retry scenario
5. one `ask_user` scenario
6. one abnormal disconnect/recovery scenario

Every future `project` row must name whether the exercised entrypoint was the main project conversation or the side-panel project copilot.

## Window Validity Decision

- Current recommendation: `continue the fresh window on the current production baseline`
- Reasoning:
  1. current production already matches repo-root `main`
  2. the active blocker is missing scoped samples, not a known deployed runtime delta
  3. the updated burn-in contract still requires baseline scenario evidence, preserved raw validator JSON, and a named backup reviewer before sign-off

## Evidence Appendix

- 2026-04-01 Day-0 raw validator JSON:
  - `docs/reports/u1-6-burn-in-2026-04-01.md`
- Future raw validator JSON artifacts:
  - store as linked dated snapshot files under `docs/reports/u1-6-burn-in-YYYY-MM-DD.md`

## Canonical Sources

- Runbook: `docs/runbooks/chat-runtime-burn-in.md`
- Report template: `docs/reports/u1-6-burn-in-template.md`
- Plan: `docs/plans/chatRuntime.md`

## Current Decision

- Burn-in started: `yes`
- Current window sign-offable: `no`
- Day-0 gate passed: `no`
- Burn-in pass: `no`
- `U3` popup migration unlocked: `no`

## Next Required Step

1. Assign a named backup reviewer before any future strict-gate result is treated as sign-offable.
2. Record the baseline scenario pack inside the scoped cohort and name the exact project entrypoint for each `project` row.
3. Preserve raw `--json=1` validator output for all future Day-0, daily, and final runs under the dated snapshot convention.
4. Rerun the daily validator once scoped traffic exists for the fresh window.
5. If a future strict gate fails because of a real runtime defect, finalize and merge that failed-window evidence PR before opening a separate remediation branch and a new burn-in window.
