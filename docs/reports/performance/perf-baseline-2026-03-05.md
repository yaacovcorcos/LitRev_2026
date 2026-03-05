# Performance Baseline Report

- Captured at: 2026-03-05T12:00:00Z
- Commit: uncommitted
- Source: output/performance/baseline/baseline-2026-03-05.json

| Route | Profile | Samples | LCP p75 (ms) | INP p75 (ms) | CLS p75 | TTFB p75 (ms) |
|---|---|---:|---:|---:|---:|---:|
| / | desktop-normal | 9 | 2060 | 140 | 0.04 | 430 |
| / | mobile-mid | 9 | 2520 | 190 | 0.06 | 640 |
| / | slow-network | 9 | 3560 | 260 | 0.09 | 1080 |
| /project/[id] | desktop-normal | 9 | 2140 | 160 | 0.05 | 480 |
| /project/[id] | mobile-mid | 9 | 2710 | 205 | 0.08 | 720 |
| /project/[id] | slow-network | 9 | 3810 | 286 | 0.11 | 1140 |
| /project/[id]/protocol | desktop-normal | 9 | 2190 | 170 | 0.06 | 530 |
| /project/[id]/protocol | mobile-mid | 9 | 2780 | 212 | 0.09 | 760 |
| /project/[id]/protocol | slow-network | 9 | 3920 | 294 | 0.12 | 1180 |
| /project/[id]/ledger | desktop-normal | 9 | 2180 | 176 | 0.07 | 560 |
| /project/[id]/ledger | mobile-mid | 9 | 2790 | 218 | 0.1 | 790 |
| /project/[id]/ledger | slow-network | 9 | 3980 | 298 | 0.12 | 1190 |
| /project/[id]/draft | desktop-normal | 9 | 2170 | 174 | 0.07 | 550 |
| /project/[id]/draft | mobile-mid | 9 | 2770 | 216 | 0.1 | 780 |
| /project/[id]/draft | slow-network | 9 | 3960 | 295 | 0.12 | 1180 |
| /project/[id]/notes | desktop-normal | 9 | 2160 | 171 | 0.06 | 540 |
| /project/[id]/notes | mobile-mid | 9 | 2760 | 214 | 0.09 | 770 |
| /project/[id]/notes | slow-network | 9 | 3940 | 292 | 0.12 | 1170 |
| /ai | desktop-normal | 9 | 2120 | 162 | 0.05 | 500 |
| /ai | mobile-mid | 9 | 2720 | 208 | 0.08 | 740 |
| /ai | slow-network | 9 | 3850 | 288 | 0.11 | 1150 |

## Notes
- This report is generated from the baseline JSON artifact.
- CI gate authority remains synthetic probe outputs.
