# Speed and Performance Plan

## Purpose
Define the canonical execution plan for improving app speed, responsiveness, and UX smoothness across web vitals, caching, preloading, and rendering behavior.

## Current Architecture
- Performance optimization work is currently distributed across multiple feature areas and not tracked in one dedicated plan.
- The highest-risk performance surface is the project workspace route family under `next-app/app/project/[id]/...`, where server, client, and data access costs compound during navigation and interaction.
- There is no active Core Web Vitals collection path (`LCP`, `INP`, `CLS`, `TTFB`) and no enforced route-level budget gate.
- Existing telemetry focuses on reliability/event flow and does not provide a stable performance budget enforcement loop.

## Baseline and Budgets Implementation Plan (`SPD-001`)

### Success Criteria
- A reproducible baseline exists for critical routes across desktop and mobile profiles.
- Budget thresholds are committed in-repo and versioned.
- CI blocks merges when budgets regress beyond allowed tolerance.
- Local and production telemetry can answer: "which route, metric, device class regressed?"
- Gate outcomes are deterministic because one authoritative source is defined for enforcement.

### Scope and Non-Goals
- In scope: route-load and interaction performance for `LCP`, `INP`, `CLS`, `TTFB`, and selected supporting diagnostics.
- In scope: budgets for critical user journeys only (not every route in first phase).
- Not in scope: broad refactors before baseline exists; optimization work follows in `SPD-002..007`.

### Gate Authority Contract
- Authoritative gate source: synthetic CI probe outputs produced in controlled runs and validated by schema checks.
- Observational sources: production telemetry dashboards and ad hoc local profiling.
- Tie-break rule: when CI synthetic and production telemetry disagree, CI synthetic decides merge gate outcome; production deltas create follow-up investigation tasks, not immediate gate overrides.

### Metric Contract (Canonical Definitions)
- `LCP` (Largest Contentful Paint): perceived load speed of main content.
- `INP` (Interaction to Next Paint): interaction responsiveness under real input.
- `CLS` (Cumulative Layout Shift): visual stability during/after load.
- `TTFB` (Time to First Byte): backend + network initial response time.
- Supporting diagnostics (non-gating initially):
  - route transition time (`tab click -> first meaningful paint`)
  - first visible assistant token latency on copilot surfaces
  - long tasks over 200ms during active interaction windows

### Critical Route Matrix (Phase 1 Coverage)
- `/` (home/library entry)
- `/project/[id]` (conversation mode in shell)
- `/project/[id]/protocol`
- `/project/[id]/ledger`
- `/project/[id]/draft`
- `/project/[id]/notes`
- `/ai`

### Device and Network Matrix (Phase 1 Coverage)
- Desktop-normal network profile.
- Mobile-mid profile (Pixel-class viewport in Playwright).
- Slow network profile (throttled profile equivalent to "Fast 3G" class) for regression visibility.

### Budget Table (Initial Targets)
These are release-gate thresholds for p75 unless noted.

| Metric | Desktop Budget | Mobile Budget | Slow Network Budget |
|---|---:|---:|---:|
| LCP | <= 2.2s | <= 2.8s | <= 4.0s |
| INP | <= 180ms | <= 220ms | <= 300ms |
| CLS | <= 0.08 | <= 0.10 | <= 0.12 |
| TTFB | <= 600ms | <= 800ms | <= 1200ms |

Budget policy:
- New route work must not worsen any metric by more than 10% versus baseline without explicit sign-off.
- Two consecutive CI budget failures on the same route/metric block feature merges until resolved or temporarily waived.
- Waivers must be time-boxed and tracked as explicit plan items.

### Minimum Sample Thresholds
- CI synthetic enforcement minimums (required for gate validity):
  - each mandatory route/profile pair must have at least `9` successful probe runs per job
  - per route/profile metric calculation uses median and p75 from those runs
- Production telemetry sufficiency minimums (required for weekly budget review, non-gating):
  - `>= 200` events per route per day for desktop-normal profile
  - `>= 150` events per route per day for mobile profile
  - `>= 50` events per route per day for slow-network profile
- If minimums are not met, result is `insufficient-sample` (no fail gate), and the report must call this out explicitly.

### Data Collection Architecture
- Client instrumentation:
  - Add Web Vitals reporting in app root (`useReportWebVitals`) with route, project surface, viewport class, network class, and build metadata.
  - Add route-transition markers for shell tab navigation and `/ai` entry.
- Server ingestion:
  - Add `/api/telemetry/performance` ingestion endpoint mirroring reliability telemetry guardrails (auth, schema validation, dedupe).
  - Persist to performance event store (table or durable log sink) with normalized metric schema.
- Aggregation:
  - Daily aggregate by route + device class + network class:
    - p50, p75, p95
    - sample size
    - regression delta vs baseline

### Telemetry Privacy Contract (Strict Allowlist)
- Performance telemetry payloads may include only:
  - metric identifiers (`name`, `value`, `id`, `rating`)
  - route template (sanitized path template, never raw query string)
  - surface key (`home`, `project_conversation`, `project_protocol`, `project_ledger`, `project_draft`, `project_notes`, `ai`)
  - environment dimensions (viewport class, network class, app version, commit SHA)
  - timing metadata and synthetic-run labels
- Performance telemetry payloads must never include:
  - user prompt text, assistant text, note/draft/protocol content, study abstract text
  - raw query parameters or URL fragments
  - emails, tokens, auth headers, user-entered free text
- Ingress policy:
  - reject payload keys outside allowlist
  - truncate unexpected string fields to safe bounds before logging errors
  - treat policy violations as schema errors

### SPD-001 File-Level Implementation Map
- Client emitter and route context:
  - `next-app/app/PerformanceVitalsReporter.tsx` (new)
  - `next-app/app/providers.tsx` (wire reporter)
  - `next-app/lib/performance-route-context.ts` (new)
- API route and validation:
  - `next-app/app/api/telemetry/performance/route.ts` (new)
  - `next-app/types/performance-telemetry.ts` (new)
  - `next-app/lib/server/performance-metrics.ts` (new)
  - `next-app/lib/server/__tests__/performance-metrics.test.ts` (new)
- CI and report tooling:
  - `next-app/scripts/perf-budget-check.mjs` (new)
  - `next-app/scripts/perf-baseline-report.mjs` (new)
  - `.github/workflows/*` performance gate integration (target workflow update)
- Baseline artifacts:
  - `output/performance/baseline/baseline-<YYYY-MM-DD>.json`
  - `output/performance/baseline/budget-thresholds.json`
  - `docs/reports/performance/perf-baseline-<YYYY-MM-DD>.md`

### Execution Phases
1. `SPD-001a` Instrumentation phase
- Implement client vitals emitter + ingestion endpoint + schema tests.
- Validate metric payload quality with sample captures in local + preview.

2. `SPD-001b` Baseline capture phase
- Run controlled measurements on Phase 1 route and device matrix.
- Publish initial baseline JSON and report.
- Freeze baseline commit hash reference.
- Lock numeric minimum sample thresholds in `budget-thresholds.json`.

3. `SPD-001c` Budget activation phase (warn-only)
- Add CI performance check that compares latest run to budget file.
- Set "warn-only" mode for first 3 CI cycles to calibrate noise.
- Publish variance report after each cycle.

4. `SPD-001d` Enforcement and maintenance phase (fail-gate active)
- Promote to "fail-on-regression" after stability confirmation.
- Weekly budget review.
- Refresh baseline only after explicit trigger rules are met.
- Track all budget changes as explicit plan updates with rationale.

### CI and Release Gate Policy
- PR gate (required once activated):
  - run performance probe suite against mandatory route matrix
  - compare against `budget-thresholds.json`
  - fail when hard thresholds or allowed regression deltas are exceeded
- PR mandatory routes:
  - `/project/[id]`, `/project/[id]/ledger`, `/project/[id]/draft`, `/ai`
- Nightly-only routes:
  - `/`, `/project/[id]/protocol`, `/project/[id]/notes`
- Pre-release gate:
  - verify no unresolved budget regressions in last 7 days for critical routes
  - verify sample size sufficiency (minimum volume threshold before sign-off)

### Quality Controls
- Schema validation for every metric payload at ingress.
- Event dedupe using stable event IDs.
- Drop invalid or unauthenticated payloads.
- Exclude synthetic/test-only events from production aggregates.
- Record sample size and confidence notes in each baseline report.

### Risks and Mitigations
- Risk: noisy data and false regressions in early runs.
  - Mitigation: start with controlled synthetic runs + 3-cycle warn-only CI.
- Risk: overfitting budgets to one device profile.
  - Mitigation: enforce desktop + mobile + slow-network matrix from day 1.
- Risk: budget churn and weakened enforcement.
  - Mitigation: budget change requires explicit plan update and sign-off note.

### Baseline Reset Trigger Table
| Trigger | Baseline Reset Allowed | Approval Required |
|---|---|---|
| Next.js major/minor upgrade with rendering/runtime behavior impact | Yes | Eng owner + one reviewer |
| React major/minor upgrade affecting hydration/scheduling | Yes | Eng owner + one reviewer |
| CDN/runtime platform shift (Vercel region/runtime strategy change) | Yes | Eng owner + one reviewer |
| Design/system-wide asset or font loading strategy rewrite | Yes | Eng owner + one reviewer |
| Route-local optimization patch | No | N/A |
| Single feature PR with no infra/runtime change | No | N/A |

Reset rule:
- Baseline resets require a dedicated PR with before/after report artifacts and explicit rationale; never reset baseline inside unrelated feature PRs.

### Completion Checklist (`SPD-001`)
- [ ] `SPD-001a` Web Vitals client reporter + performance telemetry endpoint + privacy allowlist implemented.
- [ ] `SPD-001b` Frozen baseline artifacts committed with numeric sample thresholds.
- [ ] `SPD-001c` Warn-only CI completed for 3 consecutive cycles with variance reports.
- [ ] `SPD-001d` CI switched to fail-on-regression with waiver policy active.
- [ ] First weekly performance review completed and documented.

### Delivery Constraints for `SPD-002..007`
- All optimization work must ship as small, reversible PR waves.
- Each PR wave must target one primary route/surface and one primary bottleneck class.
- Each PR wave must include a measurable target metric delta before implementation.
- Each PR wave must include before/after evidence in report artifacts.
- If measured gain is below target and complexity is high, stop and re-scope before continuing.

## Active Tasks
- [ ] `SPD-001a` Implement metric schema, client emitter, ingestion endpoint, and strict privacy allowlist.
- [ ] `SPD-001b` Capture baseline artifacts and lock numeric sample thresholds.
- [ ] `SPD-001c` Activate warn-only CI gate for 3 calibration cycles.
- [ ] `SPD-001d` Activate fail-on-regression CI gate with waiver policy.

- [ ] `SPD-002` Deep-dive hot route performance (`next-app/app/project/[id]/...`):
  - Identify server-action waterfalls and sequential network dependencies.
  - Audit client re-render pressure and unnecessary state invalidation.
  - Eliminate duplicate data fetches across route-level boundaries.
  - Prioritize fixes by user-visible latency and interaction impact.

- [ ] `SPD-003` Standardize cache strategy and invalidation:
  - Inventory caching behavior for request, route, data, and CDN layers.
  - Normalize `fetch` cache policy usage (`force-cache`, `no-store`, `revalidate`) by data type.
  - Introduce or tighten cache tag invalidation (`revalidateTag`) for mutation paths.
  - Remove unstable cache keys and per-request variability that causes accidental misses.

- [ ] `SPD-004` Optimize preloading and prefetch strategy:
  - Ensure route prefetching is intentional for common user transitions.
  - Preload only truly critical above-the-fold assets and data.
  - Remove low-value or excessive preloading that competes with interaction-critical work.
  - Verify improvements on both desktop and mobile navigation flows.

- [ ] `SPD-005` Reduce bundle and hydration cost:
  - Audit client component boundaries and move eligible logic server-side.
  - Split or lazy-load heavy UI islands and non-critical dependencies.
  - Remove dead imports/dependencies and reduce initial JS execution path.
  - Validate route JS cost trends after each bundle reduction wave.

- [ ] `SPD-006` Improve data and query efficiency:
  - Profile Prisma queries for latency, over-fetching, and N+1 patterns.
  - Add or tune indexes for high-frequency read and filter patterns.
  - Use narrowed `select` projections and pagination where result sets are large.
  - Confirm end-to-end gains in user-facing route timings.

- [ ] `SPD-007` Improve perceived smoothness and interaction quality:
  - Add optimistic UI where write operations currently block visible feedback.
  - Use stable skeleton/loading states to avoid layout jumps.
  - Ensure interaction responsiveness work is prioritized alongside raw load-time gains.
  - Track regressions in interaction delay during iterative feature work.

## Recently Completed
- [x] Speed and performance plan initialized and linked from `docs/plans/README.md`.
