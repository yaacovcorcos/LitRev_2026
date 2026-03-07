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
- Project shell entry no longer prefetches sibling project routes on mount; tab hover/focus intent still warms route-specific project domains through `ProjectTabBar`.
- Root overview entry now keeps the header, vital signs, and workstation shells immediate while deferring the recent-activity fetch until idle; the remaining root-entry network cost is overview-owned workstation preview data tracked under `SPD-003`.
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
- [ ] `SPD-003` Dedupe overview boot-time fetches on `/project/[id]`.
  - Primary metric:
    - desktop `TTFB`
  - Target:
    - improve p75 by at least `100ms`
    - reduce boot-time request count and total boot latency on root `/project/[id]`
  - Status:
    - `SPD-002` is complete: route-aware provider boot and deferred recent activity removed the avoidable non-active-surface root-entry work, and restored root conversation entry still relies on the existing lazy `useProjectState` fallback path without eager provider boot
  - Remaining measured bottleneck:
    - overview still issues three workstation preview stats actions from `next-app/app/project/[id]/page.tsx`
  - Scope:
    - `next-app/app/project/[id]/page.tsx`
    - `next-app/app/actions/stats.ts`
  - Keep the overview first-paint contract intact:
    - header, vital signs, and workstation shells remain immediate
    - deferred modules must keep stable placeholders rather than hollow empty states
- [ ] `SPD-004` Optimize preloading and prefetch strategy:
  - Primary metric:
    - reduce unnecessary prefetch and warmup work without regressing next-intent navigation latency
  - Target:
    - keep default project entry free of sibling-route mount prefetch
    - reduce hover/focus warmup to only measured high-value domains
    - keep next-tab navigation latency regression within `<= 100ms` p75
  - Keep the post-login workspace index lightweight and limited to index fields.
  - Narrow the project list payload to lightweight index fields and add pagination or caps if workspace size grows.
  - Do not treat auth success as a trigger for heavy project-domain warmup.
  - Allow project-domain warmup only after project entry, and only for active-surface or measured high-value domains.
  - Make sibling-route `router.prefetch(...)` evidence-based rather than default-on.
  - Prefer intent-based prefetching for explicit navigation, hover intent, or last-opened-project resume.
  - Preload only truly critical above-the-fold assets and data.
  - Verify improvements on both desktop and mobile navigation flows.
- [ ] `SPD-005` Reduce `/ai` bundle and timeline cost.
- [ ] `SPD-006` Expand the probe matrix to nightly-only routes and slow-network coverage.
  - Keep nightly-only routes (`/`, `/project/[id]/protocol`, `/project/[id]/notes`) and the slow-network profile out of the PR gate until their artifacts are stable.

## Recently Completed
- [x] `SPD-002` Project entry boot cleanup is complete: route-aware provider boot, lazy conversation bootstrap, and idle-deferred recent activity removed the avoidable non-active-surface root-entry work, so the remaining `/project/[id]` cost is now explicitly overview-owned and tracked under `SPD-003`.
- [x] `SPD-002a` Project entry boot is now route-aware, and root conversation entry now bootstraps its project snapshot lazily from `useProjectState` instead of eager provider `protocol -> studies` boot; authoritative CI shows the change is safe, but `SPD-002` remains open because the root-entry `LCP` target was not met.
- [x] `SPD-001` is complete: the vitals pipeline, real baseline artifacts, calibration notes, enforce-mode gate, and first weekly review are all live and documented.
- [x] `SPD-001h` Temporary draft-route `TTFB` waivers were removed after the regression gate adopted minimum meaningful absolute delta floors and recent authoritative CI artifacts passed without waiver hits.
- [x] `SPD-001g` The first weekly performance review is documented in `docs/reports/performance/weekly-review-2026-03-06.md`, covering the first real 7-day calendar window after perf-gate activation and calling out pre-activation no-run days explicitly.
- [x] `SPD-007` Budget gate now runs in `enforce` mode, consumes `output/performance/baseline/waivers.json`, and currently has no active waivers.
- [x] `SPD-001f` The `/project/[id]` desktop `CLS` alert was resolved through calibration, not a route fix: it did not reproduce in three authoritative CI cycles, so the baseline was refreshed to a CI-native artifact instead of waiving `CLS`.
- [x] `SPD-001e` Three consecutive warn-mode CI calibration notes are archived and the numeric calibration rule is now applied from committed evidence.
