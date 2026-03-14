# U1.6 Burn-In Report Template

This template is for a curated U1.6 sign-off report.  
To fill `Final Strict Validation Output`, run:

`cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts --since=<CANARY_SINCE_UTC> --metricVersion=3 --workspaceIds=<ws1,ws2> --userIds=<u1,u2> --requireScopedCohort=1 --requireRunEndPerSurface=1 --minRunIdCoveragePerSurface=0.95`

Then paste the terminal output into the section below.

## Canary Metadata

- Environment: `<production|staging>`
- Promotion path: `<release PR or merge ref to main>`
- Deployed `main` commit SHA: `<sha>`
- Production deployment id/url: `<id + https://...>`
- Owner: `<name>`
- Backup reviewer: `<name>`
- `CANARY_SINCE_UTC`: `<ISO8601>`
- Cohort workspace IDs: `<ws1,ws2 or n/a>`
- Cohort user IDs: `<u1,u2 or n/a>`
- Rollout gate:
  - `<deployment-level canary | documented runtime cohort gate>`
- Notes:
  - `<if deployment-level, note that workspace/user ids are evidence filters only>`

## Day-0 Preflight

- DB preflight complete: `<yes/no>`
- Migration command used: `<db-ops.sh migrate|migrate dev>`
- `run_end_observed` present on `ai`: `<yes/no>`
- `run_end_observed` present on `project`: `<yes/no>`
- Run-end `runId` coverage (`ai`): `<value>`
- Run-end `runId` coverage (`project`): `<value>`
- Missing runId sample review: `<summary>`
- Day-0 evidence captured (`sha/url/since/cohort`): `<yes/no>`

## Daily Snapshot Log (Days 1-6)

| Date (UTC) | Completed runs total | Completed `/ai` | Completed `project` | Retry continuity | Retry join health | Ask-user mismatch | Stuck-running violations | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| `<YYYY-MM-DD>` | `<n>` | `<n>` | `<n>` | `<rate + matched denom>` | `<match rate + unmatched counts>` | `<rate + denom>` | `<rate + denom>` | `<notes>` |

## Final Strict Validation Output

Paste the full script output below:

```text
<validator output>
```

## Pass/Fail Decision

- Pass: `<yes/no>`
- Retry metric version integrity: `<v3-clean | mixed>`
- Retry continuity status: `<authoritative | provisional(client-computed)>`
- If fail, blocking reasons:
  1. `<reason>`
  2. `<reason>`

## Sign-Off

- Owner sign-off: `<name/date>`
- Backup reviewer sign-off: `<name/date>`
- `U3` popup migration unlocked: `<yes/no>`
