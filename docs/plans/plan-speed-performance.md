# Speed and Performance Plan

## Purpose
Define the canonical implementation plan for app speed, responsiveness, and stability work across Web Vitals, route boot behavior, preload policy, and route-level interaction latency.

## Current Architecture (Code-Verified)
- Web Vitals reporting is active in the app shell through `next-app/app/PerformanceVitalsReporter.tsx` and `next-app/app/providers.tsx`.
- Performance telemetry ingestion is active through `next-app/app/api/telemetry/performance/route.ts` and `next-app/lib/server/performance-metrics.ts`.
- Performance budget tooling is active through:
  - `next-app/scripts/perf-budget-check.mjs`
  - `next-app/scripts/generate-perf-results.ts`
  - `next-app/scripts/perf-baseline-report.mjs`
- CI now separates artifact roles correctly:
  - baseline: `output/performance/baseline/baseline-latest.json`
  - results: `output/performance/results/results-<sha>.json`
  - report: `docs/reports/performance/perf-baseline-latest.md`
- The budget checker now fails explicitly on:
  - same-path baseline/results inputs
  - missing baseline/results artifacts
  - malformed JSON inputs
- The budget checker now also validates a checked-in waiver file at `output/performance/baseline/waivers.json` and rejects invalid or expired waivers.
- CI now builds a production app, starts `next start`, generates a real per-commit probe artifact, uploads it, and runs the budget checker against that artifact.
- The committed baseline is probe-generated from the CI probe path:
  - `output/performance/baseline/baseline-latest.json` now mirrors the authoritative CI probe shape and provenance
  - a dated frozen copy also exists under `output/performance/baseline/`
- Three consecutive warn-mode calibration notes are archived under `docs/reports/performance/`.
- The gate now runs in `enforce` mode with one temporary, checked-in waiver for low-baseline `TTFB` regression noise on `/project/[id]/draft` `desktop-normal`.
- The previously suspected `/project/[id]` desktop `CLS` threshold miss did not reproduce in the three authoritative CI calibration runs.

## Canonical Metrics and Budgets

### Metric Contract
- `LCP`: perceived load speed of primary content.
- `INP`: interaction responsiveness.
- `CLS`: visual stability.
- `TTFB`: initial server/network response time.
- Supporting diagnostics:
  - boot-time request count
  - total boot latency
  - route transition time
  - first visible assistant token latency

### Mandatory CI Matrix
- Routes:
  - `/project/[id]`
  - `/project/[id]/ledger`
  - `/project/[id]/draft`
  - `/ai`
- Profiles:
  - `desktop-normal`
  - `mobile-mid`

### Nightly Expansion Matrix
- Routes:
  - `/`
  - `/project/[id]/protocol`
  - `/project/[id]/notes`
- Profiles:
  - `slow-network`

### Budget Table
| Metric | Desktop Budget | Mobile Budget | Slow Network Budget |
|---|---:|---:|---:|
| LCP | <= 2.2s | <= 2.8s | <= 4.0s |
| INP | <= 180ms | <= 220ms | <= 300ms |
| CLS | <= 0.08 | <= 0.10 | <= 0.12 |
| TTFB | <= 600ms | <= 800ms | <= 1200ms |

Budget policy:
- Protected metrics must not regress more than `10%` versus baseline without explicit sign-off.
- Each optimization wave must name one primary target metric before implementation.
- Baseline resets require a dedicated PR and updated report artifacts.

### Minimum Sample Thresholds
- CI gate validity:
  - `9` successful runs per mandatory route/profile pair
- Production telemetry sufficiency:
  - `>= 200` daily events per route for desktop-normal
  - `>= 150` daily events per route for mobile-mid
  - `>= 50` daily events per route for slow-network
- Below-minimum results are `insufficient-sample` and must not fail the gate.

## Gate Authority Contract
- Authoritative merge-gate source:
  - generated CI probe artifacts
- Observational sources:
  - production telemetry
  - local profiling
  - ad hoc traces
- Tie-break rule:
  - CI probe output decides merge-gate outcome
  - production-only regressions create follow-up work, not immediate gate override
- Current state:
  - artifact generation is authoritative
  - merge behavior is `enforce` with checked-in waiver support for temporary, scoped exceptions

## CI Artifact Contract
- Baseline artifact:
  - frozen reference
  - canonical path: `output/performance/baseline/baseline-latest.json`
- Results artifact:
  - generated from the current CI run
  - canonical path: `output/performance/results/results-<sha>.json`
- Report artifact:
  - human-readable markdown summary
  - never used directly as gate input

Rules:
- `--baseline` and `--results` must resolve to different files.
- CI must fail fast if either required artifact is missing.
- Results artifacts must be uploaded for inspection on every CI run.

## Calibration Contract
- Canonical calibration note location:
  - `docs/reports/performance/calibration-<YYYY-MM-DD>-<short-sha>.md`
- Canonical weekly review location:
  - `docs/reports/performance/weekly-review-<YYYY-MM-DD>.md`
- Calibration acceptance for warn-mode closeout:
  - `3` consecutive completed warn-mode CI cycles
  - each cycle must meet the minimum sample thresholds for the mandatory route/profile matrix
  - each cycle must archive a calibration note with commit SHA, artifact path, route/profile sample counts, threshold misses, and baseline deltas
- Numeric decision rule for the current `/project/[id]` `desktop-normal` `CLS` miss:
  - classify as `persistent regression` if the metric exceeds threshold in `2 of 3` completed warn-mode cycles with sufficient samples
  - classify as `probe noise` only if the metric exceeds threshold in `0 or 1 of 3` cycles and the max-min spread across those cycles is `<= 0.02 CLS`
  - otherwise classify as `unresolved variance` and keep the gate in `warn` mode until either instrumentation is tightened or the route is remediated

## Waiver Contract
- The enforce-mode waiver path must be operational, not documentation-only.
- Canonical waiver file:
  - `output/performance/baseline/waivers.json`
- Each waiver entry must be machine-readable and include:
  - `route`
  - `profile`
  - `metric`
  - `approver`
  - `reason`
  - `expiresAt`
  - `followUp`
- The budget checker must fail invalid or expired waivers.
- `enforce` mode may only be activated once the current blocking regression is fixed or covered by a valid waiver entry.

## Current Baseline Snapshot
- Frozen baseline source:
  - `ci-probe-playwright`
- Captured at:
  - `2026-03-05T23:48:16.324Z`
- Baseline commit:
  - `ead2ac8607dbbf6af2ccb6174388e0f726986d0c`
- Sample coverage:
  - `72` total samples
  - `9` samples for each mandatory route/profile pair
- Calibration outcome:
  - `/project/[id]` `desktop-normal` `CLS` is classified as `probe noise` because it exceeded threshold in `0 of 3` consecutive warn-mode CI cycles and had `0.000` spread across those cycles
- Active temporary waiver:
  - `/project/[id]/draft` `desktop-normal` `TTFB` until `2026-03-20T00:00:00.000Z` while low-baseline regression sensitivity is tightened

## Quick Wins vs Structural Refactors

### Quick Wins
- Remove the remote Material Icons stylesheet from the shared shell.
- Remove the runtime admin-status fetch from the shared shell.
- Cap eager project-route prefetching and warmup behavior.
- Reduce duplicate boot-time fetches on `/project/[id]`.

### Structural Refactors
- Move route boot reads from client-side provider fetches to server-first rendering.
- Replace generic shell warmup with route-specific boot contracts.
- Split heavy client surfaces such as `/ai`, draft, and notes.
- Add timeline virtualization only where measurements justify it.

## Delivery Constraints
- Ship performance work as small, reversible PR waves.
- Each wave must target one primary route or one tightly scoped route family.
- Each wave must define:
  - primary metric target
  - acceptance signal
  - rollback trigger
  - blast radius
  - owner/escalation path

## Wave Backlog

### Wave 1: Project Shell Warmup Reduction
- Target route:
  - `/project/[id]`
- Primary metric:
  - mobile `LCP`
- Target:
  - improve p75 by at least `8%` or `150ms`
- Scope:
  - `next-app/app/project/[id]/layout.tsx`
  - `next-app/contexts/ProjectDataContext.tsx`
- Rollback trigger:
  - no meaningful gain or protected-metric regression over `5%`

### Wave 2: Project Overview Fetch Dedupe
- Target route:
  - `/project/[id]`
- Primary metric:
  - desktop `TTFB`
- Target:
  - improve p75 by at least `100ms`
  - reduce boot-time request count and total boot latency
- Scope:
  - `next-app/app/project/[id]/page.tsx`
  - `next-app/app/actions/stats.ts`
- Rollback trigger:
  - complexity grows beyond overview-only scope or mobile `LCP` regresses

### Wave 3: Shared Shell Quick Wins
- Target routes:
  - `/`
  - `/project/[id]`
- Primary metric:
  - `LCP`
- Target:
  - at least one fewer render-blocking dependency and one fewer shell boot fetch
- Scope:
  - `next-app/app/layout.tsx`
  - `next-app/components/AppShell.tsx`

### Wave 4: `/ai` Bundle and Timeline Reduction
- Target route:
  - `/ai`
- Primary metric:
  - desktop and mobile `LCP`
- Target:
  - lower initial JS cost and reduce long timeline rendering work
- Scope:
  - `/ai` route bundle boundaries
  - timeline rendering surfaces

## Active Tasks
- [ ] `SPD-001g` Complete the first weekly review only after a real 7-day observation window exists.
  - Use `docs/reports/performance/weekly-review-<YYYY-MM-DD>.md` for the canonical review artifact.
  - Do not mark the first weekly review complete early if a full week of probe output is not yet available.
- [ ] `SPD-001h` Remove the temporary `/project/[id]/draft` `desktop-normal` `TTFB` waiver.
  - Either tighten low-baseline regression handling so 1-6ms TTFB swings do not produce false positives, or prove stable CI behavior without the waiver and then delete it.
- [ ] `SPD-002` Reduce eager project-shell warmup and sibling-route prefetch.
- [ ] `SPD-003` Dedupe overview boot-time fetches on `/project/[id]`.
- [ ] `SPD-004` Remove shared-shell render-blocking overhead.
- [ ] `SPD-005` Reduce `/ai` bundle and timeline cost.
- [ ] `SPD-006` Expand the probe matrix to nightly-only routes and slow-network coverage.

## Recently Completed
- [x] `SPD-007` Budget gate now runs in `enforce` mode, consumes `output/performance/baseline/waivers.json`, and has one temporary scoped waiver for low-baseline `TTFB` noise.
- [x] `SPD-001f` The `/project/[id]` desktop `CLS` alert was resolved through calibration, not a route fix: it did not reproduce in three authoritative CI cycles, so the baseline was refreshed to a CI-native artifact instead of waiving `CLS`.
- [x] `SPD-001e` Three consecutive warn-mode CI calibration notes are archived and the numeric calibration rule is now applied from committed evidence.
- [x] `SPD-001a` Web Vitals reporter, route context mapping, ingestion endpoint, and privacy allowlist are implemented.
- [x] `SPD-001b` Real probe-generated baseline artifacts are committed and the seeded baseline is removed.
- [x] `SPD-001c` CI baseline/results artifact wiring is separated and guarded against same-path drift.
- [x] `SPD-001d` CI now builds a production app, generates real results artifacts, uploads them, and checks them in `warn` mode.
