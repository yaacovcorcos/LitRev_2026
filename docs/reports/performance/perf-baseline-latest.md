# Performance Baseline Report

- Captured at: 2026-03-05T23:48:16.324Z
- Commit: ead2ac8607dbbf6af2ccb6174388e0f726986d0c
- Source type: ci-probe-playwright
- Run ID: ead2ac8607dbbf6af2ccb6174388e0f726986d0c-1772754496324
- Source artifact: ../output/performance/baseline/baseline-latest.json
- Total samples: 72

| Route | Profile | Samples | LCP p75 (ms) | INP p75 (ms) | CLS p75 | TTFB p75 (ms) |
|---|---|---:|---:|---:|---:|---:|
| /project/[id] | desktop-normal | 9 | 108 | 16 | 0 | 17 |
| /project/[id] | mobile-mid | 9 | 84 | 16 | 0 | 11 |
| /project/[id]/ledger | desktop-normal | 9 | 304 | 24 | 0.017 | 13 |
| /project/[id]/ledger | mobile-mid | 9 | 400 | 16 | 0 | 11 |
| /project/[id]/draft | desktop-normal | 9 | 376 | 32 | 0.014 | 12 |
| /project/[id]/draft | mobile-mid | 9 | 512 | 16 | 0 | 11 |
| /ai | desktop-normal | 9 | 100 | 16 | 0 | 4 |
| /ai | mobile-mid | 9 | 76 | 16 | 0 | 5 |

## Route/Profile Samples
- /ai:desktop-normal: 9
- /ai:mobile-mid: 9
- /project/[id]:desktop-normal: 9
- /project/[id]:mobile-mid: 9
- /project/[id]/draft:desktop-normal: 9
- /project/[id]/draft:mobile-mid: 9
- /project/[id]/ledger:desktop-normal: 9
- /project/[id]/ledger:mobile-mid: 9

## Notes
- This report is generated from the baseline JSON artifact.
- CI gate authority is the generated probe artifact, not this markdown summary.