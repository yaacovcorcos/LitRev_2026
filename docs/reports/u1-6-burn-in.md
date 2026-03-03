# U1.6 Burn-In Report (Day-0 Stub)

This is a prefilled Day-0 stub. Replace all `TBD_*` fields once canary is explicitly enabled.

## Canary Metadata

- Environment: `production`
- Promotion path: `TBD_PROMOTION_PATH`
- Deployed `main` commit SHA: `TBD_MAIN_SHA`
- Production deployment id/url: `TBD_PROD_DEPLOY_URL_OR_ID`
- Owner: `TBD_OWNER`
- Backup reviewer: `TBD_BACKUP_REVIEWER`
- `CANARY_SINCE_UTC`: `TBD_CONFIRM_AT_FLAG_ENABLE`
- Cohort workspace IDs: `TBD_WORKSPACE_IDS`
- Cohort user IDs: `TBD_USER_IDS`
- Flags:
  - `NEXT_PUBLIC_ENABLE_CHAT_UNIFICATION_V2=1`
  - `ENABLE_CHAT_UNIFICATION_V2=1`

## Day-0 Preflight

- Promotion PR to main: `TBD_PROMOTION_PR` (`mergedAt=TBD_MERGED_AT`)
- Main CI run: `TBD_CI_RUN` (`success`, completed `TBD_COMPLETED_AT`)
- DB preflight complete: `TBD`
- Migration command used: `TBD`
- `run_end_observed` present on `ai`: `TBD`
- `run_end_observed` present on `project`: `TBD`
- Run-end `runId` coverage (`ai`): `TBD`
- Run-end `runId` coverage (`project`): `TBD`
- Missing runId sample review: `TBD`
- Day-0 evidence captured (`sha/url/since/cohort`): `TBD`

## Day-0 Validator Command (Strict Cohort Gate)

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

## Daily Snapshot Log (Days 1-6)

| Date (UTC) | Completed runs total | Completed `/ai` | Completed `project` | Retry continuity | Retry join health | Ask-user mismatch | Stuck-running violations | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |

## Final Strict Validation Output

```text
TBD
```

## Pass/Fail Decision

- Pass: `TBD`
- Retry metric version integrity: `TBD`
- Retry continuity status: `provisional(client-computed)`
- If fail, blocking reasons:
  1. `TBD`
  2. `TBD`

## Sign-Off

- Owner sign-off: `TBD`
- Backup reviewer sign-off: `TBD`
- `U3` popup migration unlocked: `TBD`
