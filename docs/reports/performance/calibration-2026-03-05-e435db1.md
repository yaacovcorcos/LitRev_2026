# Performance Calibration Note

## Run Metadata
- Date: `2026-03-05`
- Commit: `e435db186849ac082afaca8261ca32869b02d182`
- GitHub run URL: `https://github.com/yaacovcorcos/LitRev_2026/actions/runs/22741557667`
- Results artifact: `output/performance/results/results-e435db186849ac082afaca8261ca32869b02d182.json`
- Baseline artifact: `output/performance/baseline/baseline-latest.json`
- Budget artifact: `output/performance/baseline/budget-thresholds.json`
- Gate mode: `warn`

## Coverage
| Route | Profile | Samples | Meets minimum? |
|---|---|---:|---|
| `/project/[id]` | `desktop-normal` | 9 | yes |
| `/project/[id]` | `mobile-mid` | 9 | yes |
| `/project/[id]/ledger` | `desktop-normal` | 9 | yes |
| `/project/[id]/ledger` | `mobile-mid` | 9 | yes |
| `/project/[id]/draft` | `desktop-normal` | 9 | yes |
| `/project/[id]/draft` | `mobile-mid` | 9 | yes |
| `/ai` | `desktop-normal` | 9 | yes |
| `/ai` | `mobile-mid` | 9 | yes |

## Threshold Misses
- `[regression] /project/[id] mobile-mid LCP: +58.33% exceeds limit=10%`
- `[regression] /project/[id]/ledger desktop-normal LCP: +63.64% exceeds limit=10%`
- `[regression] /project/[id]/ledger desktop-normal CLS: +21.43% exceeds limit=10%`
- `[regression] /project/[id]/ledger mobile-mid LCP: +568.75% exceeds limit=10%`
- `[regression] /project/[id]/ledger mobile-mid TTFB: +57.14% exceeds limit=10%`
- `[regression] /project/[id]/draft desktop-normal LCP: +37.50% exceeds limit=10%`
- `[regression] /project/[id]/draft desktop-normal INP: +33.33% exceeds limit=10%`
- `[regression] /project/[id]/draft mobile-mid LCP: +662.50% exceeds limit=10%`
- `[regression] /project/[id]/draft mobile-mid TTFB: +25.00% exceeds limit=10%`
- `[regression] /ai desktop-normal LCP: +46.67% exceeds limit=10%`
- `[regression] /ai mobile-mid LCP: +28.57% exceeds limit=10%`
- `[regression] /ai mobile-mid TTFB: +33.33% exceeds limit=10%`

## Baseline Deltas
- Largest CI-vs-baseline shifts in this run:
  - `/project/[id]/draft` `mobile-mid` `LCP`: `+424ms` (`488` vs `64`)
  - `/project/[id]/ledger` `mobile-mid` `LCP`: `+364ms` (`428` vs `64`)
  - `/project/[id]` `desktop-normal` `CLS`: `-0.131` (`0.000` vs `0.131`)
- Absolute thresholds were still clean in this run; the violations were regression-only warnings against the older baseline artifact.

## CLS Calibration Classification
- Target metric:
  - `/project/[id]` `desktop-normal` `CLS`
- Classification:
  - `probe noise`
- Reason:
  - Across the 3 completed warn-mode calibration cycles, the metric exceeded threshold in `0 of 3` runs and the max-min spread was `0.000`, which is within the `<= 0.02 CLS` probe-noise rule in `docs/plans/plan-speed-performance.md`.

## Notes
- This run met every minimum sample requirement in the mandatory CI matrix.
- The old baseline mismatch was broad enough that the right correction was to re-baseline from a CI probe artifact, not to waive the original `/project/[id]` desktop `CLS` alert.
