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
- The workspace index currently loads immediately after session resolution through `ProjectsContext`, using a client-side `listProjectsAction()` fetch after hydration.
- Project entry boot is now route-aware through the shared project shell boot contract:
  - root overview entry no longer boots provider data by default
  - `protocol` deep links boot protocol only, and `ledger` deep links boot studies only
  - root conversation entry no longer uses provider eager boot; conversation state now bootstraps lazily from `useProjectState` with lightweight fallback counts and protocol-unknown routing until data settles
- Project shell entry no longer prefetches sibling project routes on mount; project-shell tab warming is now limited to pointer hover on the provisional `protocol` / `ledger` allowlist, while keyboard focus and coarse-pointer/mobile contexts no longer trigger speculative domain warmup.
- Workspace project entry links now disable default route prefetch, and the workspace index query is narrowed at the Prisma layer to index fields only before hydration consumes the result.
- Root overview entry keeps the header, vital signs, and workstation shells immediate while deferring the recent-activity fetch until idle.
- Root overview workstation previews now load through a single combined overview action under one auth/validation envelope, reducing preview boot-time requests from three client actions to one while preserving per-card partial failure handling.
- `/ai` now has route-local readiness instrumentation and a build-artifact bundle report:
  - `next-app/app/ai/page.tsx` records composer-ready and timeline-ready markers into `window.__litrevAiPerf`
  - `next-app/scripts/report-ai-bundle.ts` reports `/ai` entry chunk count and total JS bytes from `.next/server/app/ai.html`
- `/ai` closeout measurement is now reproducible from repo-local tooling:
  - `next-app/scripts/capture-ai-closeout.ts` captures empty and populated `/ai` scenarios against a built app
  - `next-app/scripts/compare-ai-closeout.ts` evaluates the pinned `SPD-005` thresholds against a baseline/head pair
- `/ai` also now opts into route-local lazy boundaries without forking shared copilot infrastructure:
  - the shared composer lazy-loads attachment and autonomy controls behind dynamic feature islands
  - the shared `TimelineRenderer` supports an opt-in initial visible window and readiness callback, and `/ai` uses that opt-in path while project copilot/conversation keep the default full render behavior
- Three consecutive warn-mode calibration notes are archived under `docs/reports/performance/`.
- The gate now runs in `enforce` mode with no active waivers; `output/performance/baseline/waivers.json` remains checked in as the machine-readable exception contract.
- Regression gating now requires both percentage regression and a minimum meaningful absolute delta before failing:
  - `LCP`: `75ms`
  - `INP`: `16ms`
  - `CLS`: `0.02`
  - `TTFB`: `20ms`
- The previously suspected `/project/[id]` desktop `CLS` threshold miss did not reproduce in the three authoritative CI calibration runs.

## Preload Policy

Data warmup policy:
- After login, load the workspace index only.
- After project entry, load only the data required for the active surface by default.
- Background domain warmup must be justified by measured user-facing wins.

Route prefetch policy:
- Do not prefetch sibling project routes by default on project mount.
- Route prefetch should be triggered by measured high-probability transitions or explicit user intent.
- Any added route prefetch must show that it improves follow-on navigation without harming initial entry.

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
- Current interpretation:
  - observational shell/web-vitals coverage only
  - route-ready instrumentation for `protocol` / `notes` is a separate follow-up if needed

### Budget Table
| Metric | Desktop Budget | Mobile Budget | Slow Network Budget |
|---|---:|---:|---:|
| LCP | <= 2.2s | <= 2.8s | <= 4.0s |
| INP | <= 180ms | <= 220ms | <= 300ms |
| CLS | <= 0.08 | <= 0.10 | <= 0.12 |
| TTFB | <= 600ms | <= 800ms | <= 1200ms |

Budget policy:
- Protected metrics must not regress more than `10%` versus baseline without explicit sign-off.
- Regression failures only trigger when the percentage breach also exceeds the minimum meaningful absolute delta for that metric (`LCP 75ms`, `INP 16ms`, `CLS 0.02`, `TTFB 20ms`).
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
- Active temporary waivers:
  - none

### Completion Checklist (`SPD-001`)
- [x] `SPD-001a` Web Vitals client reporter + performance telemetry endpoint + privacy allowlist implemented.
- [x] `SPD-001b` Frozen baseline artifacts committed with numeric sample thresholds.
- [x] `SPD-001c` Warn-only CI completed for 3 consecutive cycles with variance reports.
- [x] `SPD-001d` CI switched to fail-on-regression with waiver policy active.
- [x] First weekly performance review completed and documented.

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

### Wave 1: Project Entry Warmup Reduction
- Target route:
  - `/project/[id]`
- Primary metric:
  - initial-entry `LCP`
- Target:
  - reduce active-surface boot-time requests by at least `2`
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
  - overview preview-ready latency
- Target:
  - reduce root overview preview boot-time requests from `3` to `1`
  - improve preview-ready latency once all three workstation cards settle to data/empty/error state
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
  - `/ai` entry JS bytes plus populated timeline-ready latency
- Target:
  - reduce route entry JS cost and reduce long-timeline render cost without regressing composer/send behavior
- Scope:
  - `/ai` route bundle boundaries
  - shared timeline rendering surfaces used by `/ai`

## Active Tasks
- [ ] `SPD-005` Reduce `/ai` bundle and timeline cost.
  - Canonical measurement sources now exist and the first closeout run is recorded in `docs/reports/performance/ai-closeout-2026-03-07.md`:
    - `npm run perf:ai-bundle-report`
    - `npm run perf:ai-closeout-capture`
    - `npm run perf:ai-closeout-compare`
    - route-local `/ai` readiness markers in `window.__litrevAiPerf`
  - Pinned closeout thresholds:
    - bundle bytes: `>= 5%` or `50 KB` improvement
    - empty `/ai` composer-ready: `>= 10%` or `75 ms` improvement
    - populated `/ai` timeline-ready: `>= 15%` or `150 ms` improvement
  - Current measured status vs baseline commit `31d45033696c3c54d9b223bb6576fc933e22bc4c`:
    - bundle bytes improved only `0.1%`
    - empty `/ai` composer-ready regressed by `111 ms`
    - populated `/ai` timeline-ready regressed by `53 ms`
  - Next narrow follow-up should target `/ai` initial route hydration and history/sidebar cost; do not fork the shared composer and do not expand shared timeline semantics until a new populated-route measurement shows that path is still dominant.
- [ ] `SPD-006` Expand the probe matrix to nightly-only routes and slow-network coverage.
  - Nightly coverage must run from the separate `nightlyRoutes` / `nightlyProfiles` matrix contract and write to `output/performance/nightly/**`; do not overload the PR-gated mandatory matrix or `output/performance/results/results-<sha>.json`.
  - Treat nightly `/`, `/project/[id]/protocol`, and `/project/[id]/notes` probes as shell/web-vitals observational coverage for now. Route-ready instrumentation is a separate follow-up if those surfaces become active optimization targets.
  - Keep nightly-only routes and the `slow-network` profile out of the PR gate until their artifacts are stable across consecutive nightly runs.

## Recently Completed
- [x] `SPD-004` Preload/prefetch policy is now tightened: home/workspace project links and the resume CTA disable default route prefetch, the workspace index query is narrowed at the Prisma layer to index fields only, and project-shell tab warming now removes focus/coarse-pointer speculative fetches while keeping only a provisional `protocol` / `ledger` hover allowlist.
- [x] `SPD-003` Root overview preview fetch dedupe is complete: workstation previews now load through one combined overview action with a single auth/validation boundary, and the page consumer keeps the same first-paint shell while reducing preview boot-time requests from `3` to `1`.
- [x] `SPD-002` Project entry boot cleanup is complete: route-aware provider boot, lazy conversation bootstrap, and idle-deferred recent activity removed the avoidable non-active-surface root-entry work, so the remaining `/project/[id]` cost is now explicitly overview-owned and tracked under `SPD-003`.
- [x] `SPD-002a` Project entry boot is now route-aware, and root conversation entry now bootstraps its project snapshot lazily from `useProjectState` instead of eager provider `protocol -> studies` boot; authoritative CI shows the change is safe, but `SPD-002` remains open because the root-entry `LCP` target was not met.
- [x] `SPD-001` is complete: the vitals pipeline, real baseline artifacts, calibration notes, enforce-mode gate, and first weekly review are all live and documented.
- [x] `SPD-001h` Temporary draft-route `TTFB` waivers were removed after the regression gate adopted minimum meaningful absolute delta floors and recent authoritative CI artifacts passed without waiver hits.
- [x] `SPD-001g` The first weekly performance review is documented in `docs/reports/performance/weekly-review-2026-03-06.md`, covering the first real 7-day calendar window after perf-gate activation and calling out pre-activation no-run days explicitly.
- [x] `SPD-007` Budget gate now runs in `enforce` mode, consumes `output/performance/baseline/waivers.json`, and currently has no active waivers.
- [x] `SPD-001f` The `/project/[id]` desktop `CLS` alert was resolved through calibration, not a route fix: it did not reproduce in three authoritative CI cycles, so the baseline was refreshed to a CI-native artifact instead of waiving `CLS`.
- [x] `SPD-001e` Three consecutive warn-mode CI calibration notes are archived and the numeric calibration rule is now applied from committed evidence.
