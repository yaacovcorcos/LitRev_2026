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
- The homepage workspace index now has a server-first boot path:
  - `/` resolves authenticated workspace context and project-index rows on the server before first paint
  - the home route hydrates the existing client shell from that bootstrap instead of waiting on a client-side empty-first project fetch
  - `ProjectsContext` still owns post-hydration mutations and refreshes, but homepage refresh on `/` now uses the fast home-specific project-list path rather than the bootstrap-heavy auth helper
- Project entry boot is now route-aware through the shared project shell boot contract:
  - root overview entry no longer boots provider data by default
  - `protocol` deep links boot protocol only, and `ledger` deep links boot studies only
  - root conversation entry no longer uses provider eager boot; conversation state now bootstraps lazily from `useProjectState` with lightweight fallback counts and protocol-unknown routing until data settles
- The project-shell boot contract is still partial rather than universal:
  - eager boot is centralized only for `protocol` and `ledger`
  - `draft`, `notes`, and `memory` still self-bootstrap from route-local page logic after mount
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
- `/ai` now also defers history/sidebar chrome and conversation-list hydration out of the initial route chunk:
  - the history sidebar content and header chrome load behind route-local lazy boundaries
  - global workspace context and the conversation list both preload only after composer-ready, so populated closeout runs no longer pay the full sidebar fetch on first open
- The app currently remains predominantly client-rendered:
  - `15/16` route `page.tsx` files are client pages
  - shared loading is driven primarily by client providers plus server actions, not server-component data cache primitives
  - only one explicit `revalidatePath(...)` usage currently exists, in artifact review follow-up for ledger routes
- The project shell is the main lifetime boundary for project work:
  - `ProjectCopilotProvider`, `PopupChatProvider`, and `ProjectDataProvider` all persist for the lifetime of the shell under `next-app/app/project/[id]/layout.tsx`
  - boot mode is route-derived (`conversation`, `overview`, `protocol`, `ledger`, `draft`, `memory`, `notes`) via `next-app/lib/project-entry-boot-mode.ts`
- Shared project data now uses a domain-slice client cache in `next-app/contexts/ProjectDataContext.tsx`:
  - domains: `protocol`, `ledger`, `draft`, `notes`, `memory`
  - `warmDomain(...)` performs lazy first-load for idle slices
  - `invalidateDomain(...)` eagerly refetches
  - cross-surface coherence depends on the browser event bus in `next-app/lib/project-data-events.ts`
- Several route surfaces layer additional local-first durability or secondary caches on top of `ProjectDataContext`:
  - protocol: local durability envelope with `savedAtMs` / `lastSyncedAtMs`, debounced remote save, and conflict-safe incoming patch handling
  - draft: localStorage-first paint, then server/preload upgrade
  - notes: index-first sidebar seed, then full note payload fetch
  - ledger: separate `LedgerContext` cache plus provider seeding from `ProjectDataContext`
  - memory: `ProjectDataContext` preload plus route-local `ProjectMemoryContext` and lazy health-tab fetches
- `/ai` currently has the most explicit route-local performance controls:
  - dynamic imports for header/history/timeline-adjacent UI
  - idle-deferred workspace context and conversation-list loading
  - an explicit LRU timeline cache capped to the five most recently accessed conversations
- Explicit route-ready instrumentation is currently uneven across the app:
  - route-ready telemetry exists for `/`, auth entry, `/project/[id]`, and `/project/[id]/protocol`
  - `/ai` also has route-local `composer-ready` and `timeline-ready` markers
  - `ledger`, `draft`, `notes`, and `memory` still rely mainly on Web Vitals plus surface-local loading signals
- Server-side in-memory caches exist, but they are process-local and opportunistic rather than canonical:
  - citation metadata TTL cache + in-flight dedupe
  - tool idempotency replay cache
  - auth rate-limit map
  - per-project AI cache-metric accumulator
- Local browser persistence is substantial and currently doubles as durability for several surfaces:
  - protocol storage
  - draft storage
  - project-entry restore state
  - theme, workspace preferences, context-capture history/metrics, and chat panel preferences
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
  - `/project/[id]/protocol` already has explicit route-ready telemetry
  - `/` and `/project/[id]/notes` are still primarily observational shell/web-vitals coverage

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

## Remaining Quick Wins vs Structural Refactors

### Remaining Quick Wins
- Remove the remote Material Icons stylesheet from the shared shell.
- Keep shared-shell boot fetches off the first-paint path.

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

## Pending Wave Backlog

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

## Loading, Cache, and Memory Upgrade Program

### Goal
- Establish one canonical loading/cache model for the app so future work stops adding isolated local fixes and instead follows route-level freshness, preload, invalidation, and memory-retention rules.

### Current Problem Statement
- Loading policy is currently distributed across:
  - client providers
  - route-local `useEffect` fetches
  - localStorage/sessionStorage durability layers
  - process-local server `Map` caches
  - browser event-bus invalidation
- This is workable, but it means cache behavior is implicit, route-specific, and difficult to reason about as one system.

### Compact Current-State Matrix
| Route | Boot Trigger | Main Data Path | Local Durability / Cache | Current Warmup / Preload | Main Risk |
|---|---|---|---|---|---|
| `/` | server homepage bootstrap, then hydrated client shell | server home bootstrap -> hydrated `ProjectsContext` -> `listHomeProjectsAction()` for home refresh | sort/view prefs, last project ID, workspace-entry session flag | project links use `prefetch={false}` | local post-hydration enhancements still reorder or decorate after first paint |
| `/project/[id]` | project shell boot mode `overview` or `conversation` | `ProjectsContext` + overview stats action + optional `useProjectState()` bootstrap | project-entry restore state, project copilot provider state | recent activity defers until idle; no sibling-route prefetch | long-lived shell keeps project state resident across route changes |
| `/project/[id]/protocol` | project shell eager-boots `protocol` slice | `ProjectDataContext.protocol` -> `ProtocolContext` | protocol local durability envelope in `localStorage` with sync metadata | active-surface boot only; hover warmup from tab bar may preload this domain | local-first edits plus async remote sync create staleness/conflict complexity |
| `/project/[id]/ledger` | project shell eager-boots `ledger` slice | `ProjectDataContext.studies` seeds `LedgerContext`; page reads `LedgerContext` | in-memory `LedgerContext` cache only | tab-hover warmup may preload `ledger`; route warms `protocol` when criteria are needed | duplicated ledger state across two client caches |
| `/project/[id]/draft` | route mount | local draft state paints first, then `ProjectDataContext.draft` via `warmDomain("draft")` | substantial draft `localStorage` durability | no shell eager boot; route-local warmup only | large local payloads and editor state can grow without central retention policy |
| `/project/[id]/notes` | route mount | notes index from `ProjectDataContext` plus full note fetch in page | editor/save timers in memory; no full durable notes cache | index-first seed, then full fetch; no shell eager boot | mixed index/full-note loading path complicates freshness and loading UX |
| `/project/[id]/memory` | route mount | optional `ProjectDataContext.memory` seed -> `ProjectMemoryContext` + lazy tab fetches | route-local tab state only | no shell eager boot; health/prisma/preferences tabs lazy-load on demand | memory state is split across provider preload, route context, and tab-local fetches |
| `/ai` | route mount | route-local conversation/timeline state + server actions + stream API | history collapse + model prefs in `localStorage`; timeline cache in memory | dynamic imports; idle-deferred workspace context and conversation list; 5-entry LRU timeline cache | strongest local optimization, but still the heaviest long-session client state |

### Required Deliverables
- A route-by-route cache matrix covering:
  - boot trigger
  - source of truth
  - preload source
  - local cache layer
  - server cache layer
  - invalidation trigger
  - acceptable staleness window
- A freshness contract per domain:
  - `must_be_fresh`
  - `stale_while_revalidate`
  - `local_first_with_sync`
  - `session_only`
- A preload contract per route family:
  - never preload
  - idle preload
  - hover-intent preload
  - explicit-navigation preload
- A client memory-retention contract covering:
  - project shell lifetime
  - `/ai` conversation lifetime
  - artifact/message retention caps
  - localStorage/sessionStorage quotas and eviction rules
- An instrumentation contract for proving improvements before wider rollout.

### Sequenced Work
1. `SPD-008a` Canonical inventory and cache matrix.
   - Document the current loading and cache path for `/`, `/project/[id]`, `/project/[id]/protocol`, `/project/[id]/ledger`, `/project/[id]/draft`, `/project/[id]/notes`, `/project/[id]/memory`, and `/ai`.
   - Output is documentation-first; no architectural changes yet.
2. `SPD-008b` Freshness and invalidation contract.
   - Define what data must be fresh vs allowed to be stale.
   - Reduce duplicate invalidation paths where a single domain currently has multiple client caches.
3. `SPD-008c` Preload and warmup policy.
   - Convert current ad hoc warmup behavior into an explicit allowlist with route-specific rules.
   - Every preload rule must name the expected follow-on navigation win and the metric that justifies it.
4. `SPD-008d` Client memory-retention policy.
   - Set retention caps for `/ai` timelines, project copilot conversation state, local durable drafts/protocols, and auxiliary local caches.
   - Define which state survives navigation, tab lifetime, browser restart, and sign-out.
5. `SPD-008e` Instrumentation and acceptance gates.
   - Add the missing readiness and memory instrumentation required to verify the upgrade plan.
   - Extend evidence beyond `/ai` so project surfaces can be optimized with the same rigor.
6. `SPD-008f` Implementation waves.
   - Only after the contracts above are written and accepted should implementation proceed in narrow route- or domain-specific waves.

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
    - bundle bytes still regress by `5,601` bytes (`+0.4%`)
    - empty `/ai` composer-ready remains unstable and the latest post-commit closeout run measured `518 ms` (`+160 ms`, `+44.7%`)
    - populated `/ai` timeline-ready recovered to `67 ms` (`-3 ms`, `-4.3%`), so the long-history regression is no longer the dominant blocker
  - Status:
    - partial `/ai` cleanup wave merged in `#206`
    - active implementation is paused pending stronger evidence from broader perf signals, including the nightly run
  - If `/ai` becomes a priority again, the next narrow follow-up should target shared composer bundle cost, especially still-eager optional input features on `/ai`; do not fork the shared composer and do not expand shared timeline semantics again unless a later populated-route measurement shows a new regression there.
- [ ] `SPD-006` Expand the probe matrix to nightly-only routes and slow-network coverage.
  - Nightly coverage must run from the separate `nightlyRoutes` / `nightlyProfiles` matrix contract and write to `output/performance/nightly/**`; do not overload the PR-gated mandatory matrix or `output/performance/results/results-<sha>.json`.
  - Treat nightly `/` and `/project/[id]/notes` probes as shell/web-vitals observational coverage for now.
  - `/project/[id]/protocol` already emits route-ready telemetry, but nightly still uses the same artifact path and does not yet promote route-ready timing to a gated signal.
  - Keep nightly-only routes and the `slow-network` profile out of the PR gate until their artifacts are stable across consecutive nightly runs.
- [ ] `SPD-008` Create the canonical loading/cache/memory upgrade plan before implementation waves begin.
  - This task owns the repo-wide current-state model for:
    - route boot behavior
    - preload triggers
    - client/server cache layers
    - invalidation semantics
    - long-session memory retention
  - Use `docs/plans/plan-speed-performance.md` as the canonical owner; do not create a parallel cache-plan file unless this plan becomes too broad to stay legible.
  - The current code-verified findings to preserve as the starting baseline are:
    - project-shell work is lifetime-scoped under `ProjectCopilotProvider` + `PopupChatProvider` + `ProjectDataProvider`
    - shared project data uses client domain slices, not Next server-cache primitives
    - route-local persistence is already significant for protocol, draft, project-entry restore, and chat/UI preferences
    - `/ai` already has the strongest route-local performance instrumentation and an explicit LRU timeline cache
    - server-side `Map` caches are process-local only and must not be treated as global truth
  - Current checklist:
    - [x] `SPD-008a` Canonical inventory and compact current-state cache matrix are now captured in this file.
    - [ ] `SPD-008b` Freshness and invalidation contract.
    - [ ] `SPD-008c` Preload and warmup policy.
    - [ ] `SPD-008d` Client memory-retention policy.
    - [ ] `SPD-008e` Instrumentation and acceptance gates.
    - [ ] `SPD-008f` Implementation waves.
  - `SPD-008` remains planning/governance-first. Implementation work should land under follow-up tasks only after the remaining contracts above are written.

## Recently Completed
- [x] `SPD-008a` Initial loading/cache inventory is now codified directly in this file as the compact current-state matrix, so future cache work can iterate from one canonical baseline instead of ad hoc repo scans.
- [x] `SPD-004` Preload/prefetch policy is now tightened: home/workspace project links and the resume CTA disable default route prefetch, the workspace index query is narrowed at the Prisma layer to index fields only, and project-shell tab warming now removes focus/coarse-pointer speculative fetches while keeping only a provisional `protocol` / `ledger` hover allowlist.
- [x] `SPD-003` Root overview preview fetch dedupe is complete: workstation previews now load through one combined overview action with a single auth/validation boundary, and the page consumer keeps the same first-paint shell while reducing preview boot-time requests from `3` to `1`.
- [x] `SPD-002` Project entry boot cleanup is complete: route-aware provider boot, lazy conversation bootstrap, and idle-deferred recent activity removed the avoidable non-active-surface root-entry work, so the remaining `/project/[id]` cost is now explicitly overview-owned and tracked under `SPD-003`.
- [x] `SPD-002a` Project entry boot is now route-aware, and root conversation entry now bootstraps its project snapshot lazily from `useProjectState` instead of eager provider `protocol -> studies` boot; authoritative CI shows the change is safe, but `SPD-002` remains open because the root-entry `LCP` target was not met.
- [x] `SPD-001` is complete: the vitals pipeline, real baseline artifacts, calibration notes, enforce-mode gate, and first weekly review are all live and documented.
- [x] `SPD-001h` Temporary draft-route `TTFB` waivers were removed after the regression gate adopted minimum meaningful absolute delta floors and recent authoritative CI artifacts passed without waiver hits.
- [x] `SPD-001g` The first weekly performance review is documented in `docs/reports/performance/weekly-review-2026-03-06.md`, covering the first real 7-day calendar window after perf-gate activation and calling out pre-activation no-run days explicitly.
- [x] `SPD-007` Budget gate now runs in `enforce` mode, consumes `output/performance/baseline/waivers.json`, and currently has no active waivers.
- [x] `SPD-001f` The `/project/[id]` desktop `CLS` alert was resolved through calibration, not a route fix: it did not reproduce in three authoritative CI cycles, so the baseline was refreshed to a CI-native artifact instead of waiving `CLS`.
