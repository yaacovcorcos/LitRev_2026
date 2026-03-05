# Performance Baseline Report

- Captured at: 2026-03-05T22:58:21.844Z
- Commit: 535cd80114550d171cf6655c3f3749f6bb835abf
- Source type: baseline-freeze-playwright
- Run ID: 535cd80114550d171cf6655c3f3749f6bb835abf-1772751501844
- Source artifact: ../output/performance/baseline/baseline-latest.json
- Total samples: 72

| Route | Profile | Samples | LCP p75 (ms) | INP p75 (ms) | CLS p75 | TTFB p75 (ms) |
|---|---|---:|---:|---:|---:|---:|
| /project/[id] | desktop-normal | 9 | 92 | 16 | 0.131 | 20 |
| /project/[id] | mobile-mid | 9 | 48 | 16 | 0 | 13 |
| /project/[id]/ledger | desktop-normal | 9 | 176 | 24 | 0.014 | 13 |
| /project/[id]/ledger | mobile-mid | 9 | 64 | 16 | 0 | 7 |
| /project/[id]/draft | desktop-normal | 9 | 256 | 24 | 0.014 | 50 |
| /project/[id]/draft | mobile-mid | 9 | 64 | 16 | 0 | 8 |
| /ai | desktop-normal | 9 | 60 | 16 | 0 | 4 |
| /ai | mobile-mid | 9 | 56 | 16 | 0 | 3 |

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