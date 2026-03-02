# U1.6 Burn-In Report Template

Use with:

`cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts --since=<CANARY_SINCE_UTC> --workspaceIds=<ws1,ws2> --userIds=<u1,u2> --requireScopedCohort=1 --requireRunEndPerSurface=1 --minRunIdCoveragePerSurface=0.95 --report=../docs/reports/u1-6-burn-in.md`

## Canary Metadata

- Environment: `<production|staging>`
- Owner: `<name>`
- Backup reviewer: `<name>`
- `CANARY_SINCE_UTC`: `<ISO8601>`
- Cohort workspace IDs: `<ws1,ws2 or n/a>`
- Cohort user IDs: `<u1,u2 or n/a>`
- Flags:
  - `NEXT_PUBLIC_ENABLE_CHAT_UNIFICATION_V2=<0|1>`
  - `ENABLE_CHAT_UNIFICATION_V2=<0|1>`

## Day-0 Preflight

- DB preflight complete: `<yes/no>`
- Migration command used: `<migrate deploy|migrate dev>`
- `run_end_observed` present on `ai`: `<yes/no>`
- `run_end_observed` present on `project`: `<yes/no>`
- Run-end `runId` coverage (`ai`): `<value>`
- Run-end `runId` coverage (`project`): `<value>`
- Missing runId sample review: `<summary>`

## Daily Snapshot Log (Days 1-6)

| Date (UTC) | Completed runs total | Completed `/ai` | Completed `project` | Retry continuity | Ask-user mismatch | Stuck-running violations | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| `<YYYY-MM-DD>` | `<n>` | `<n>` | `<n>` | `<rate + denom>` | `<rate + denom>` | `<rate + denom>` | `<notes>` |

## Final Strict Validation Output

Paste the full script output below:

```text
<validator output>
```

## Pass/Fail Decision

- Pass: `<yes/no>`
- If fail, blocking reasons:
  1. `<reason>`
  2. `<reason>`

## Sign-Off

- Owner sign-off: `<name/date>`
- Backup reviewer sign-off: `<name/date>`
- `U3` popup migration unlocked: `<yes/no>`
