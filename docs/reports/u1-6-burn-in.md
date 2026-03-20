# U1.6 Burn-In Report

Status: `window_reassessment_required`
Last reviewed: `2026-03-20`

This file is the live status and eventual sign-off record for U1.6.
The previously recorded canary window remains useful as historical context, but it is not currently the recommended final sign-off baseline because the recorded deployment SHA is older than repo-root `main` as of `2026-03-20`.

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
- Window basis: `existing window under reassessment`
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
- `run_end_observed` is currently absent on both `ai` and `project` for the recorded window, so Day-0 remains open.
- `U1.6` remains incomplete and `U3` stays blocked pending a real validator/manual pass.
- The recorded canary deployment SHA (`402f28f1b0e99d21e8b00e1502c9bb6dcfadc943`) is older than current repo-root `main` (`b4ceaf713a416ccecfaec4712dd0c273b36c3f3b`).
- Backup reviewer assignment is still missing, which means no final strict gate can be treated as sign-offable yet.
- Raw JSON from the 2026-03-15 Day-0 validator attempt was not preserved in this report, so that attempt is informational only under the updated runbook contract.
- A `FIX-011b` delta audit against the current shared convergence/recovery path did not identify a new shared-runtime code gap, so the remaining blocker is fresh `U1.6` evidence/sign-off unless burn-in reveals a narrow drift that still needs patching.

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

## Window Validity Decision

- Current recommendation: `open a fresh canary window unless production is intentionally still pinned to the recorded deployment`
- Reasoning:
  1. the recorded canary baseline SHA is older than current repo-root `main`
  2. the existing window has no qualifying scoped samples
  3. the updated burn-in contract now requires baseline scenario evidence, raw validator JSON preservation, and named backup-reviewer assignment before sign-off
- If production is intentionally still pinned to the recorded deployment and no deployed evidence-affecting changes have occurred since `CANARY_SINCE_UTC`, this window may be continued only after:
  1. assigning the backup reviewer
  2. executing the runbook baseline scenario pack inside the scoped cohort
  3. rerunning Day-0 with preserved `--json=1` output

## Baseline Scenario Evidence

No baseline scenario pack has been recorded yet under the updated runbook contract.

## Evidence Appendix

- 2026-03-15 Day-0 raw validator JSON: `not preserved; rerun required for sign-off-quality evidence`

## Canonical Sources

- Runbook: `docs/runbooks/chat-unification-burn-in.md`
- Report template: `docs/reports/u1-6-burn-in-template.md`
- Plan: `docs/plans/plan-chat-unification-v2.md`

## Current Decision

- Burn-in started: `yes`
- Current window sign-offable: `no`
- Day-0 gate passed: `no`
- Burn-in pass: `no`
- `U3` popup migration unlocked: `no`

## Next Required Step

1. Decide whether production is still intentionally pinned to the recorded deployment; if not, open a fresh canary window.
2. Assign a named backup reviewer before any future strict-gate result is treated as sign-offable.
3. Record the baseline scenario pack and preserve raw `--json=1` validator output for all future Day-0/daily/final runs.
4. Do not claim `U1.6` pass or retire `FIX-011b` until the validator/manual gate both pass under the updated contract.
