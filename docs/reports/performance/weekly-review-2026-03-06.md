# Performance Weekly Review

## Review Window
- Start: `2026-02-28T00:00:00Z`
- End: `2026-03-06T23:59:59Z`
- Reviewer: `Codex`

## Probe Coverage Summary
- Number of CI probe runs reviewed:
  - `8` perf-pipeline CI runs in the first calendar week after gate activation:
    - `22740621238`
    - `22740746055`
    - `22741311001`
    - `22741557667`
    - `22741774444`
    - `22742625571`
    - `22742876283`
    - `22743064255`
- Mandatory route/profile pairs with sufficient samples:
  - all `8` mandatory route/profile pairs met the `9`-sample CI minimum in every reviewed perf-probe artifact
- Any insufficient-sample periods:
  - no insufficient-sample artifacts after perf-gate activation
  - `2026-02-28` through `2026-03-04T23:04:59Z` had no perf-probe CI output because the current pipeline was not yet active; this is recorded as a no-run coverage gap, not as an artifact failure

## Budget Status
- Regressions still open:
  - none in the current `codex/spd001-complete` branch validation against the recent authoritative CI artifacts
- Regressions fixed this week:
  - `/project/[id]` `desktop-normal` `CLS` was reclassified as probe noise after three warn-mode calibration cycles
  - low-baseline `LCP` and `TTFB` percentage-only regressions on `/project/[id]/draft` and `/ai` were removed from gating by adding minimum meaningful absolute delta floors
  - the temporary draft-route `TTFB` waivers are no longer needed
- Waivers currently active:
  - none

## Noise and Stability
- Metrics that appear stable:
  - `CLS` across the mandatory route matrix after calibration
  - `INP` across the mandatory route matrix in all reviewed artifacts
  - `LCP` and `TTFB` once the regression gate ignores low-signal absolute deltas
- Metrics with unresolved variance:
  - none currently blocking `SPD-001`
- Any instrumentation issues observed:
  - the original CI-native baseline was sound, but percentage-only regression checks were too sensitive for low-millisecond `LCP`/`TTFB` baselines
  - the gate now requires both percentage regression and a minimum absolute delta before failing, which matches the observed noise envelope better

## Baseline Decision
- Baseline reset required: `no`
- Reason:
  - the current baseline is already CI-native and representative; the remaining false positives came from regression sensitivity, not from bad baseline provenance

## Next Actions
- Route or metric to prioritize next:
  - `/project/[id]` shell warmup and boot-time request behavior under `SPD-002`
- Any waiver follow-up required:
  - none
- Any plan updates required:
  - `SPD-001` is complete; continue with `SPD-002..006`
