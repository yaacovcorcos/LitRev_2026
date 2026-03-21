# U1.6 Burn-In Report Template

This template is for a curated U1.6 sign-off report.
The live sign-off record remains `docs/reports/u1-6-burn-in.md`; do not create a second canonical live report.
To fill `Final Strict Validation Output`, run:

`cd next-app && npx tsx scripts/validate-chat-unification-burn-in.ts --since=<CANARY_SINCE_UTC> --metricVersion=3 --workspaceIds=<ws1,ws2> --userIds=<u1,u2> --requireScopedCohort=1 --requireRunEndPerSurface=1 --minRunIdCoveragePerSurface=0.95 --json=1`

Then preserve the raw JSON in the appendix section below and summarize the strict-gate result in prose in the decision section.
For docs-driven execution, a dated snapshot file such as `docs/reports/u1-6-burn-in-YYYY-MM-DD.md` is an acceptable way to preserve raw JSON alongside the canonical live report.

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
- Window basis: `<fresh window | unchanged existing window>`
- Rollout gate:
  - `<deployment-level canary | documented runtime cohort gate>`
- Notes:
  - `<if deployment-level, note that workspace/user ids are evidence filters only>`

## Day-0 Preflight

- DB preflight complete: `<yes/no>`
- Migration command used: `<db-ops.sh migrate|migrate dev>`
- Full preflight rerun required for this window: `<yes/no>`
- `run_end_observed` present on `ai`: `<yes/no>`
- `run_end_observed` present on `project`: `<yes/no>`
- Run-end `runId` coverage (`ai`): `<value>`
- Run-end `runId` coverage (`project`): `<value>`
- Missing runId sample review: `<summary>`
- Day-0 evidence captured (`sha/url/since/cohort`): `<yes/no>`
- Day-0 raw validator JSON artifact: `<appendix section or linked file path>`

## Baseline Scenario Evidence

| Timestamp (UTC) | Surface | Entrypoint | Scenario | Conversation ID | Run ID | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|
| `<2026-03-17T12:00:00Z>` | `<ai|project>` | `<ai page | main project conversation | side-panel project copilot>` | `<completed run|retry|ask-user|disconnect/recovery>` | `<id or n/a>` | `<id or n/a>` | `<pass|fail>` | `<notes>` |

## Daily Snapshot Log (Days 1-6)

| Date (UTC) | Completed runs total | Completed `ai` | Completed `project` | Retry continuity | Retry join health | Ask-user mismatch | Stuck-running violations | Raw JSON artifact | Notes |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| `<YYYY-MM-DD>` | `<n>` | `<n>` | `<n>` | `<rate + matched denom>` | `<match rate + unmatched counts>` | `<rate + denom>` | `<rate + denom>` | `<appendix section or linked file path>` | `<notes>` |

## Final Strict Validation Output

Paste the full raw JSON output below, or replace this block with a linked artifact path if the JSON is stored separately:

```text
<validator output>
```

## Evidence Appendix

- Final strict-gate raw validator JSON:
  - `<paste JSON here or link stored artifact path>`
- Additional daily validator artifacts:
  - `<YYYY-MM-DD -> appendix section or file path>`

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

Final gate is not sign-offable until the backup reviewer is named in the metadata above.
