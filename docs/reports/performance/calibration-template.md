# Performance Calibration Note Template

Copy this template to `docs/reports/performance/calibration-<YYYY-MM-DD>-<short-sha>.md`.

## Run Metadata
- Date:
- Commit:
- GitHub run URL:
- Results artifact:
- Baseline artifact:
- Budget artifact:
- Gate mode: `warn`

## Coverage
| Route | Profile | Samples | Meets minimum? |
|---|---|---:|---|
| `/project/[id]` | `desktop-normal` |  |  |
| `/project/[id]` | `mobile-mid` |  |  |
| `/project/[id]/ledger` | `desktop-normal` |  |  |
| `/project/[id]/ledger` | `mobile-mid` |  |  |
| `/project/[id]/draft` | `desktop-normal` |  |  |
| `/project/[id]/draft` | `mobile-mid` |  |  |
| `/ai` | `desktop-normal` |  |  |
| `/ai` | `mobile-mid` |  |  |

## Threshold Misses
- List each `[threshold]` or `[regression]` issue exactly as emitted by the checker.
- If none, write `None`.

## Baseline Deltas
- Summarize only the largest route/profile/metric deltas that matter for closeout.

## CLS Calibration Classification
- Target metric:
  - `/project/[id]` `desktop-normal` `CLS`
- Classification:
  - `persistent regression`
  - `probe noise`
  - `unresolved variance`
- Reason:
  - reference the numeric rule in `docs/plans/plan-speed-performance.md`

## Notes
- Call out anything that would block moving from `warn` to `enforce`.
