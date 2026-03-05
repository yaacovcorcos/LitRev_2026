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
- CI now builds a production app, starts `next start`, generates a real per-commit probe artifact, uploads it, and runs the budget checker against that artifact.
- The committed baseline is no longer synthetic:
  - `output/performance/baseline/baseline-latest.json` is probe-generated
  - a dated frozen copy also exists under `output/performance/baseline/`
- The gate is still `warn` mode, not `enforce`.
- The current highest-signal runtime issue surfaced by the real baseline is desktop `CLS` on `/project/[id]`, which is above the committed threshold.

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
  - merge behavior is still `warn` while the first real baseline stabilizes

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

## Current Baseline Snapshot
- Frozen baseline source:
  - `baseline-freeze-playwright`
- Captured at:
  - `2026-03-05T22:58:21.844Z`
- Baseline commit:
  - `535cd80114550d171cf6655c3f3749f6bb835abf`
- Sample coverage:
  - `72` total samples
  - `9` samples for each mandatory route/profile pair
- Current threshold miss:
  - `/project/[id]` `desktop-normal` `CLS = 0.131` vs budget `0.08`

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
- [ ] `SPD-001e` Keep the gate in `warn` mode for the first 3 clean CI cycles and capture variance deltas for the real probe.
- [ ] `SPD-001f` Decide whether the current `/project/[id]` desktop `CLS` over-budget state should be fixed immediately or temporarily waived before `enforce` mode.
- [ ] `SPD-002` Reduce eager project-shell warmup and sibling-route prefetch.
- [ ] `SPD-003` Dedupe overview boot-time fetches on `/project/[id]`.
- [ ] `SPD-004` Remove shared-shell render-blocking overhead.
- [ ] `SPD-005` Reduce `/ai` bundle and timeline cost.
- [ ] `SPD-006` Expand the probe matrix to nightly-only routes and slow-network coverage.
- [ ] `SPD-007` Promote the budget gate from `warn` to `enforce` once variance and waiver policy are settled.

## Recently Completed
- [x] `SPD-001a` Web Vitals reporter, route context mapping, ingestion endpoint, and privacy allowlist are implemented.
- [x] `SPD-001b` Real probe-generated baseline artifacts are committed and the seeded baseline is removed.
- [x] `SPD-001c` CI baseline/results artifact wiring is separated and guarded against same-path drift.
- [x] `SPD-001d` CI now builds a production app, generates real results artifacts, uploads them, and checks them in `warn` mode.
