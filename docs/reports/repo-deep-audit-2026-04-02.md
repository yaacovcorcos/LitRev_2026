# Repo Deep Audit — 2026-04-02

> Update 2026-04-02: The study-processing auth bypass and origin-derived dispatcher target issues documented in this audit were fixed by merged PR [#443](https://github.com/yaacovcorcos/LitRev_2026/pull/443). The remaining open security finding from that cluster is the file storage path validation issue in `next-app/lib/server/files.ts`.

## Scope

This audit is a deep repo-level review of the canonical LitRev codebase as it exists on 2026-04-02.

Included:
- repo governance and workflow docs
- `next-app/` application code
- Prisma schema and migrations
- CI/governance tooling
- plans, runbooks, and prior review artifacts

Excluded from canonical counts and architectural judgment:
- `.worktrees/**` duplicate task checkout contents
- `next-app/node_modules/**`
- `next-app/.next/**`
- `.git/**`
- `local-only-transfer-2026-04-02-102346/**`
- zip archives
- secret values inside local env files

Companion canonical file inventory:
- `docs/reports/repo-deep-audit-2026-04-02-file-inventory.txt`

## Audit Method

This report was built in three passes.

Pass 1:
- inventory and codebase sizing
- current CI, lint, test, typecheck, build, and DB-health signals
- active-plan review
- hotspot identification by file size, lint concentration, and effect/governance metrics
- prior review comparison against `docs/reviews/repo-health.md`, `docs/runbooks/repo-review-baseline.md`, and `docs/reports/diagnosis-03-02.md`

Pass 2:
- targeted read of the highest-risk runtime/UI files
- verification of critical security findings
- doc-drift cross-check against actual CI and governance tooling
- refinement of architectural conclusions and risk ordering

Pass 3:
- subsystem-by-subsystem sizing and health grading
- deeper read of auth/admin, provider/context hubs, and search/storage boundaries
- correctness scan for silent metadata corruption and test-locality gaps

## Inventory Snapshot

### Canonical footprint

- Canonical file count: `1192`
- `next-app/` file count: `1070`
- Tests in `next-app/`: `350`
- Non-test code-like files in `next-app/`: `681`

### Top-level canonical areas

- `next-app/` — main product code, tooling, schema, tests
- `docs/` — plans, runbooks, architecture, prior reviews
- `.github/` — CI and automation
- `.factory/` — local skill/adaptation helpers
- root governance and repo-contract files (`AGENTS.md`, `PRD.md`, `CLAUDE.md`, etc.)

### `next-app/` composition

- `lib/`: `488` files
- `components/`: `155` files
- `app/`: `150` files
- `eslint/`: `63` files
- `scripts/`: `48` files
- `hooks/`: `32` files
- `prisma/`: `29` files
- `types/`: `27` files
- `contexts/`: `21` files

### Largest implementation files

- `next-app/lib/server/ai/ai-service.ts` — `2817` lines
- `next-app/app/ai/page.tsx` — `2776` lines
- `next-app/components/copilot/TimelineRenderer.tsx` — `1851` lines
- `next-app/hooks/useCopilotStreamActions.ts` — `1778` lines
- `next-app/app/project/[id]/draft/page.tsx` — `1417` lines
- `next-app/contexts/ProjectDataContext.tsx` — `780` lines
- `next-app/contexts/ProjectCopilotContext.tsx` — `752` lines
- `next-app/lib/server/study-processing.ts` — `774` lines
- `next-app/lib/server/ledger.ts` — `923` lines
- `next-app/prisma/schema.prisma` — `763` lines

### Subsystem shape snapshot

- Chat/AI: `175` files, `51` tests, `41834` lines
- Agent runtime: `41` files, `12` tests, `9174` lines
- Ledger/search/files: `23` files, `3` tests, `8817` lines
- Draft: `22` files, `6` tests, `6879` lines
- Memory: `17` direct area files, with related tests concentrated outside the route slice
- Admin: `22` files, `8` tests, `2507` lines
- Auth: `13` files, `3` tests, `1813` lines
- Project data providers/contexts: `4` files, `2178` lines

## Executive Assessment

LitRev is an ambitious, unusually well-documented repo with strong governance intent, serious testing effort, and clear subsystem thinking. The project is not “messy by default”; it is “overstretched by success.” The codebase has grown faster than its decomposition boundaries.

The strongest parts of the repo are:
- durable written operating contracts (`AGENTS.md`, plan registry, runbooks)
- meaningful custom governance tooling under `next-app/eslint/`
- broad Vitest coverage and real CI enforcement for governance phases, tests, typecheck, and build
- explicit production-vs-local DB contracts and migration discipline
- comparatively disciplined auth/admin slices relative to the rest of the product surface
- good evidence that the team is actively auditing itself rather than relying on chat memory

The weakest parts of the repo are:
- a handful of very large cross-cutting runtime/UI files that still centralize too much behavior
- a red legacy full-repo lint baseline despite green governance slices
- partially completed product programs across too many fronts at once
- several stale review docs that no longer reflect current repo reality
- at least two still-critical security bugs in production-sensitive code

Bottom line:
- architecture quality is above average in intent and documentation
- implementation quality is mixed but salvageable
- governance maturity is strong
- decomposition maturity is not yet strong enough for the current product surface area
- the repo is workable today, but its main risks now come from hotspot concentration, incomplete convergence, and stale local truth in docs

## What Is Strong

### 1. The repo has real governance, not just aspirations

Evidence:
- `AGENTS.md` is concrete and operational.
- `docs/plans/README.md` clearly separates active canonical plans from archive/supporting material.
- `docs/runbooks/github-flow.md`, `docs/runbooks/db-ops.md`, and `docs/runbooks/db-architecture.md` are actionable, not decorative.
- `next-app/eslint/` contains repo-local rules, docs, tests, and layered configs.
- CI enforces governance slices through `.github/workflows/ci.yml` and `npm run governance:ci-required`.

Assessment:
- This is one of the healthiest parts of the repo.
- The team has already turned multiple architecture values into executable checks.
- That dramatically reduces “agent drift” risk compared with most repos.

### 2. Test coverage is broad and structurally embedded

Evidence:
- `350` test files in `next-app/`.
- Strong coverage in `lib/`, `components/`, `app/`, and governance tooling.
- Governance rules themselves are tested.
- CI runs Prisma migrations, typecheck, governance gates, Vitest, and build.

Assessment:
- This is a real strength.
- The repo is not under-tested; it is unevenly decomposed.
- The presence of tests is not the problem. The main problem is that some high-churn files still carry too much policy and orchestration in one place.

### 3. Database discipline is much better than average

Evidence:
- Explicit separation of `DATABASE_URL` vs `DIRECT_URL` in docs and scripts.
- Migration safety paths (`db-ops.sh`, `migrate-deploy-safe.sh`, `migrate-if-prod.sh`).
- Prisma schema/migrations are treated as governed artifacts.
- Production drift and index verification are explicitly documented.

Assessment:
- DB operations are treated seriously.
- The database contract is clearer than many other parts of the repo.
- The main DB risk is not migration chaos; it is surrounding service-layer complexity and a few security bugs at storage/dispatch boundaries.

### 4. Auth/admin code is comparatively healthy and should be treated as a model, not a rescue zone

Evidence:
- `next-app/lib/server/auth/claim.ts`
- `next-app/lib/server/auth/session.ts`
- `next-app/lib/server/admin/platform-admin-mutations.ts:55`
- `next-app/app/api/admin/users/[userId]/platform-admin/route.ts`

Why it matters:
- the repo is not uniformly weak
- some backend slices already show the target quality bar: explicit transactions, row locking, last-admin protection, centralized session context, and thin route handlers

Assessment:
- This area is large, but it is more coherent than the hotspot surfaces.
- It should inform refactors elsewhere instead of being grouped with the repo’s main problem areas.

## Critical Findings

### 1. P0 security: internal study-processing route can be authorized by a forgeable header

Evidence:
- `next-app/app/api/internal/study-processing/route.ts:17`
- `next-app/app/api/internal/study-processing/route.ts:18`

Current behavior:
- production requests are accepted when `x-vercel-cron` merely exists
- no secret validation is tied to that branch

Why it matters:
- header presence is not a trustworthy authorization mechanism
- this protects a privileged internal job path

Impact:
- unauthorized external triggering of internal processing work

Assessment:
- This is still a top-tier bug and should be fixed before treating the internal job surface as trustworthy.

### 2. P0 security: dispatcher prefers request `Origin` over trusted base URL while sending internal bearer token

Evidence:
- `next-app/lib/server/study-processing.ts:751`
- `next-app/lib/server/study-processing.ts:754`
- `next-app/lib/server/study-processing.ts:759`
- `next-app/lib/server/study-processing.ts:765`

Current behavior:
- `kickStudyProcessingDispatcher()` tries to read `origin` from request headers
- if present, that origin becomes the dispatch target
- the internal token is sent to that computed target

Why it matters:
- this creates an SSRF/token-exfiltration class risk
- untrusted origin-derived dispatch should never outrank the server’s trusted internal base URL

Impact:
- leakage of `STUDY_PROCESSING_INTERNAL_TOKEN`
- unintended dispatch to hostile targets

Assessment:
- This is the single most dangerous architectural bug found in operational code.

### 3. P1 security/data isolation: file storage path tenancy validation is too weak

Evidence:
- `next-app/lib/server/files.ts:126`
- `next-app/lib/server/files.ts:128`

Current behavior:
- `createFileAsset()` validates project ownership via substring inclusion

Why it matters:
- substring checks are not namespace-safe
- attacker-crafted paths can satisfy `includes()` without actually belonging to the intended project prefix

Impact:
- cross-tenant file-path confusion risk

Assessment:
- Lower severity than the two dispatcher/auth bugs above, but still important and should be hardened.

### 4. P2 correctness: PubMed parsing fabricates publication year when the source year is missing or unparseable

Evidence:
- `next-app/lib/server/search/pubmed.ts:215`
- `next-app/lib/server/search/pubmed.ts:216`
- `next-app/lib/server/search/pubmed.ts:229`
- `next-app/lib/server/__tests__/pubmed.test.ts:231`

Current behavior:
- `parseYear()` returns `new Date().getFullYear()` when `pubDate` is absent
- it also returns the current year when parsing fails

Why it matters:
- this silently turns unknown metadata into false metadata
- downstream UI, search ranking, or trust decisions can treat fabricated recency as truth

Impact:
- incorrect article metadata
- misleading sort/filter behavior
- hidden data-quality regression because the value looks valid

Assessment:
- This is not as severe as the security bugs, but it is a real correctness issue and a good example of “truthful degradation” not being fully enforced in adapters.

### 5. The repo’s biggest architectural issue is hotspot concentration, not lack of patterns

Evidence:
- `next-app/lib/server/ai/ai-service.ts` — `2817` lines, centralizing provider selection, context assembly, retry logic, tool execution, runtime bookkeeping, tracing, autonomy, clarification, and recovery
- `next-app/app/ai/page.tsx` — `2776` lines, centralizing route UI, local persistence, perf tracking, history logic, model controls, recovery, routing, and stream state
- `next-app/components/copilot/TimelineRenderer.tsx` — `1851` lines, centralizing artifact rendering, markdown rendering, tool receipts, scroll/windowing behavior, error boundaries, and inline actions
- `next-app/hooks/useCopilotStreamActions.ts` — `1778` lines, centralizing stream mutation, recovery, artifact actions, navigation, telemetry, and abnormal-end handling
- `next-app/app/project/[id]/draft/page.tsx` — `1417` lines
- `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts` — `913` lines

Why it matters:
- these files are not just large; they are multi-owner files with mixed abstraction levels
- regression risk and onboarding difficulty both increase sharply when UI orchestration, persistence, recovery, and product policy coexist in one unit

Assessment:
- This is the repo’s main medium-term architecture problem.
- The codebase already knows the right direction — shared runtimes, governed hooks, named controllers, server bootstraps — but those patterns have not yet fully won in the hotspot surfaces.

### 6. The legacy lint baseline is still red enough to hide real signal

Current measured baseline:
- `npm run lint` => `241 problems (129 errors, 112 warnings)`

Concentrated error hotspots:
- `lib/server/__tests__/memory-retrieval.test.ts` — `28` errors
- `lib/server/__tests__/conversation-extractor.test.ts` — `11` errors
- `lib/server/search/pubmed.ts` — `10` errors
- `lib/server/__tests__/memory-health.test.ts` — `9` errors
- `lib/server/admin/__tests__/platform-admin-bootstrap.test.ts` — `6` errors
- production-file errors also remain in `app/actions/conversations.ts`, `lib/server/files.ts`, `lib/server/admin/platform-admin-mutations.ts`, `lib/server/agent/run.ts`, provider adapters, and `lib/server/ai/tracing.ts`

Why it matters:
- the repo’s governed slices are healthier than the raw baseline
- but the still-red full baseline makes broad cleanup and future enforcement risky
- it also increases audit noise and hides new regressions among old ones

Assessment:
- This has improved a lot versus the March review baseline, but it is still a meaningful repo-health problem.
- The repo should not promote full `npm run lint` to required CI yet, but it also should not stop working the backlog down.

### 7. There is clear documentation drift in the review layer

Evidence:
- `docs/reviews/repo-health.md` still says lint is not part of required CI merge gating
- `.github/workflows/ci.yml` now runs `npm run governance:ci-required`
- `docs/reports/effect-discipline-audit-2026-03-18.md` reports `201` direct effects / `65` files
- `node scripts/lint-governance-audit.mjs` now reports `246` direct effects across the governed surface and `478` source files / `310` test files
- `docs/reviews/repo-health.md` still reports a much older lint baseline (`523` errors / `591` warnings)

Why it matters:
- the repo has done real work, but some review docs still present the older state
- future reviewers can overstate some problems and miss newer ones if they trust stale review summaries

Assessment:
- This is a governance correctness issue, not a cosmetic one.
- In a repo that relies heavily on docs as load-bearing context, stale review docs are part of the defect surface.

## Architectural Assessment By Layer

### App Router and product surfaces

Strengths:
- route structure is coherent and product-oriented
- project shell, onboarding, protocol, ledger, draft, memory, and AI surfaces are all explicit
- dynamic imports and code splitting are used in heavy chat surfaces

Weaknesses:
- `/ai` is still too large and too stateful in one route component
- draft route logic is split between a giant page and a giant controller, which is an improvement over one blob but still not a stable ownership model
- some routes still rely on client effect bootstrap/reset patterns despite strong repo doctrine against effect-driven orchestration
- homepage bootstrapping still uses dense effect-driven coordination as well

Evidence:
- `next-app/app/ai/page.tsx:357`
- `next-app/app/ai/page.tsx:369`
- `next-app/app/ai/page.tsx:378`
- `next-app/app/project/[id]/draft/page.tsx:184`
- `next-app/app/project/[id]/draft/page.tsx:192`
- `next-app/app/project/[id]/draft/page.tsx:202`
- `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts:169`
- `next-app/app/HomeClient.tsx:109`
- `next-app/app/HomeClient.tsx:347`

Assessment:
- Product architecture is conceptually strong but operationally top-heavy.

### Context/provider layer

Strengths:
- project-scoped providers exist for real reasons
- domain slices in `ProjectDataContext` are sensible
- `ProjectCopilotContext` is at least partially extracting logic into hooks

Weaknesses:
- `ProjectDataContext` and `ProjectCopilotContext` still mix storage, server I/O, timers, UI-facing state, and orchestration concerns
- controllers and contexts are still doing too much direct lifecycle coordination
- the repo’s direct-effect burden is primarily a client-surface problem, not a server-surface problem

Evidence:
- `next-app/contexts/ProjectDataContext.tsx`
- `next-app/contexts/ProjectCopilotContext.tsx`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/contexts/ProjectDataContext.tsx:456`
- `next-app/contexts/ProjectDataContext.tsx:677`
- `next-app/contexts/ProjectCopilotContext.tsx:171`
- `next-app/contexts/ProjectCopilotContext.tsx:237`

Assessment:
- The repo has started extracting logic into hooks, but several hooks are now “portable god objects” rather than cleanly bounded behavior modules.
- A second-pass code scan found `165` direct effects in `136` client files versus only `9` direct effects in `411` non-client files, which sharpens the problem statement: this is mostly route/provider lifecycle complexity, not backend hook misuse.

### Server/service layer

Strengths:
- server-side responsibilities are explicitly separated into `lib/server/**`
- there is meaningful domain structuring for memory, auth, agent runtime, search, chat runtime, admin, and storage
- logging and telemetry abstractions exist
- auth/admin service code is more coherent than the repo average
- many high-value backend behaviors have dedicated tests, even when tests are centralized rather than co-located

Weaknesses:
- `lib/server/ai/ai-service.ts` is too central
- several service files still mix orchestration, persistence, policy, and transport logic in one place
- provider-specific adapters still carry repetitive normalization/parsing behavior
- search/storage/study-processing boundaries still contain a few “small line count, high consequence” bugs

Evidence:
- `next-app/lib/server/ai/ai-service.ts`
- `next-app/lib/server/study-processing.ts`
- `next-app/lib/server/ledger.ts`
- `next-app/lib/server/search/pubmed.ts`
- `next-app/lib/server/__tests__/ai-service-run-finalization.test.ts`
- `next-app/lib/server/__tests__/ai-service-reasoning-policy.test.ts`
- `next-app/lib/server/__tests__/scoping-ai-service.test.ts`
- `next-app/lib/server/__tests__/tool-call-sanitization.test.ts`
- `next-app/lib/server/__tests__/tool-filtering.test.ts`

Assessment:
- The service layer has good nouns but not enough runtime segmentation around the heaviest verbs.
- It would be inaccurate to call the whole backend under-tested; the deeper issue is concentration of responsibility and some weak boundary decisions in a few operational files.

### Governance/tooling layer

Strengths:
- best-in-class relative to repo size
- custom rules are documented and tested
- CI is meaningful
- governance phases were actually completed rather than hand-waved

Weaknesses:
- legacy repo-health docs are stale
- broad lint remains red
- `111` raw console calls still exist in the governed surface according to the governance audit, with `92` on the UI/client side
- the repo has both a sophisticated governance system and a still-noisy full baseline, which creates two parallel truths
- raw console volume is not evenly distributed; scripts and client/product state surfaces account for far more of it than core server runtime code

Assessment:
- This layer is strong, but it needs follow-through in documentation and baseline reduction.

## Subsystem Deep Dive

### Auth and admin

Assessment:
- healthier than repo average
- transactional posture is careful
- route handlers are mostly thin and policy-bearing code is centralized intentionally

Notes:
- `setPlatformAdminStatus()` uses a serializable transaction, row locking, and explicit last-admin protection.
- legacy claim handling is large, but it is structured around one bounded migration problem rather than arbitrary cross-domain accretion.
- this slice should be preserved as a positive reference point.

### Agent runtime

Assessment:
- large but more modular than the chat/UI surfaces
- still complex, but complexity is distributed across more files with clearer nouns

Notes:
- the area carries a real plan burden (`plan-agentic.md`) and still has a lot of active work open
- however, it reads more like an evolving subsystem than a collapsed single-file implementation

### Chat and AI runtime

Assessment:
- the repo’s heaviest active complexity zone
- strongest concentration of oversized files, stateful UI composition, and ongoing roadmap convergence

Notes:
- tests exist and are meaningful
- the main risk is not lack of tests but excessive coordination density in a few route/hook/render files

### Draft surface

Assessment:
- mid-migration in the right direction
- cleaner than a pure route blob, but still not fully converged on stable ownership boundaries

Notes:
- current architecture shows real intent: controller extraction, manuscript normalization, export/checkpoint contracts
- route and controller layers still share too much boot/reset/orchestration work

### Memory

Assessment:
- backend investment is deeper than first glance suggests
- UI and route surfaces are still heavy, but the domain model and tests are substantial

Notes:
- area-local counts understate testing because many memory tests live in central `lib/server/__tests__/` suites and provider tests under `contexts/__tests__/`.
- the main risk is not absence of backend verification; it is operational complexity and still-red lint/test fixtures in memory-heavy suites.

### Ledger, search, files, and study processing

Assessment:
- operationally sensitive slice with uneven quality
- carries both strong product importance and the highest concentration of security/correctness boundary bugs found in this review

Notes:
- `study-processing` and `files` contain the most urgent open security defects.
- `pubmed.ts` is also the clearest example of a “looks fine, lies quietly” adapter bug.

### Project data and provider hubs

Assessment:
- valuable abstractions, but still acting as lifecycle and persistence junction boxes

Notes:
- `ProjectDataContext`, `ProjectCopilotContext`, and conversation/draft hooks remain major integration hubs.
- these are the most likely places for future regressions when product programs overlap.

### Database/schema layer

Strengths:
- disciplined migration/runbook story
- clear environment topology
- schema appears intentionally modeled for product concerns, not accidental growth

Weaknesses:
- schema and migration maturity are stronger than some adjacent service-layer code
- that mismatch means operational DB discipline can still be undermined by service/auth/storage mistakes

Assessment:
- DB architecture is not the weak link.
- boundary logic around jobs, files, and internal dispatch is the weak link.

## Runtime/UI Hotspot Notes

### `/ai` route

`next-app/app/ai/page.tsx` is the clearest example of successful product evolution outgrowing a single component boundary.

Observed responsibilities in one file include:
- model selection and persistence
- history/sidebar state
- route performance marks
- timeline orchestration
- recovery handling
- abnormal-end handling
- metrics/reliability instrumentation
- routing and restore behavior
- mobile variation logic

Assessment:
- this file should be decomposed further into route bootstrap, conversation/session controller, UI composition, and recovery/telemetry slices
- it is currently too important to safely change casually

### Timeline renderer

`next-app/components/copilot/TimelineRenderer.tsx` is doing too many jobs for a render surface.

Observed responsibilities include:
- markdown rendering
- artifact rendering
- tool-receipt grouping and summarization
- error-boundary logic
- scroll notifications
- timeline windowing
- inline artifact actions
- stateful confirmation UI

Assessment:
- the renderer should become a thinner composition shell over multiple specialized presenters
- otherwise every new artifact/tool/timeline behavior keeps increasing one already-critical file’s fragility

### Draft surface

The draft area shows both good intent and unfinished convergence.

Evidence:
- a dedicated controller exists: `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts`
- the page is still very large: `next-app/app/project/[id]/draft/page.tsx`
- both files still contain bootstrapping, normalization, and state reset behavior

Assessment:
- the draft surface is likely mid-migration from route-heavy orchestration toward a cleaner controller model
- it is not done yet
- this is one of the most obvious “good direction, incomplete execution” areas in the repo

## Plans And Incomplete Programs

The repo is carrying several major unfinished programs simultaneously.

### Highest-impact open plan areas

Agent/runtime:
- `docs/plans/plan-agentic.md`
- open work includes continuation, idempotency envelopes, reasoning transparency completion, lazy context loading, centralized context budget policy, delegation matrix, telemetry, run board, continuation tokens, eval harnesses, rollout templates, SLOs, and incident playbooks

Chat runtime:
- `docs/plans/chat-runtime.md`
- open work includes `U1.6` replay parity/burn-in sign-off, popup migration to shared engine, and shadow cleanup

UI/UX:
- `docs/plans/plan-ux-ui.md`
- open work includes overlay standardization, scroll isolation certification, durable URL semantics, refresh-safe conversation/project navigation, onboarding/home resume, and async `aria-live` coverage

Drafting:
- `docs/plans/plan-drafting-experience.md`
- open work includes comments/suggestions/compare-restore, citation palette/diagnostics, inline AI review flows, mobile/a11y/performance certification, and telemetry/support states

Backend:
- `docs/plans/plan-backend.md`
- open work includes rollout stabilization, onboarding backend enablement, performance work, and AI cache metrics persistence

Guided setup:
- `docs/plans/plan-guided-setup.md`
- almost the entire execution program is still open

Performance:
- `docs/plans/plan-speed-performance.md`
- `/ai` bundle reduction and canonical loading/cache/memory work remain open

Memory:
- `docs/plans/plan-memory.md`
- deployed-environment pgvector rollout validation is still open

Assessment:
- the repo has a credible strategy, but too many major tracks are still open at once
- this increases the chance that files become temporary integration hubs for multiple unfinished epics
- this is likely the root cause behind several giant “do everything” files

## Quality Metrics Snapshot

### Verified healthy

- `npx tsc --noEmit` passes
- `npx vitest run` passes (`337` test files, `2128` tests passed, `11` skipped)
- `npm run build` passes
- Prisma validate/migrate status pass locally
- local DB smoke test passes with `RUN_DB_TESTS=1`
- governance rule tests pass

### Still unhealthy or noisy

- `npm run lint` fails: `129` errors, `112` warnings
- `npm run lint:styles` passes with warnings only (`22` warnings)
- governance audit still reports:
  - `246` direct effects
  - `111` raw console calls
  - `92` UI/client raw console calls
  - `27` default exports
- second-pass split of non-test code found:
  - `165` direct effects in client files
  - `9` direct effects in non-client files
  - `69` raw console calls in client files
  - `109` raw console calls in non-client files, heavily influenced by scripts/tooling

Assessment:
- repo correctness gates are decent
- repo cleanliness gates are mixed
- governance slices are healthier than the broad baseline
- tests are broad, but many subsystem assurances are centralized in shared suites rather than sitting adjacent to the heaviest implementation files

## File-Level Risk Groups

### Group A — highest-risk implementation hotspots

- `next-app/lib/server/ai/ai-service.ts`
- `next-app/app/ai/page.tsx`
- `next-app/components/copilot/TimelineRenderer.tsx`
- `next-app/hooks/useCopilotStreamActions.ts`
- `next-app/app/project/[id]/draft/page.tsx`
- `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts`
- `next-app/contexts/ProjectDataContext.tsx`
- `next-app/contexts/ProjectCopilotContext.tsx`

Reason:
- size + orchestration density + cross-cutting behavior + active roadmap pressure

### Group B — high-risk operational boundaries

- `next-app/app/api/internal/study-processing/route.ts`
- `next-app/lib/server/study-processing.ts`
- `next-app/lib/server/files.ts`
- `next-app/lib/server/search/pubmed.ts`
- `next-app/lib/server/ai/tracing.ts`

Reason:
- security, transport, storage, provider, or tracing correctness concentrated in single files

### Group C — healthy governance/tooling core

- `.github/workflows/ci.yml`
- `next-app/eslint/**`
- `next-app/scripts/check-runtime-test-impact.mjs`
- `next-app/scripts/lint-governance-audit.mjs`
- `docs/plans/plan-lint-governance.md`

Reason:
- unusually mature and consistent relative to the rest of the codebase

### Group D — comparatively healthy backend slices

- `next-app/lib/server/auth/**`
- `next-app/lib/server/admin/**`
- `next-app/app/api/admin/**`
- `next-app/app/api/auth/**`

Reason:
- clearer transactional boundaries
- thinner route handlers
- fewer signs of architectural distress than the main runtime/UI hotspots

### Group E — docs requiring truth refresh

- `docs/reviews/repo-health.md`
- `docs/reports/effect-discipline-audit-2026-03-18.md`
- portions of older diagnosis/review artifacts where the repo has materially moved on

Reason:
- current claims no longer fully match CI/governance/runtime reality

## Overall Architecture Grade

### Strategy and documentation

Grade: `A-`

Reason:
- strong operating model
- strong plan and runbook discipline
- real executable governance

### Decomposition and ownership boundaries

Grade: `C+`

Reason:
- too many giant mixed-responsibility hotspots
- several migrations toward cleaner ownership exist but are incomplete

### Runtime correctness posture

Grade: `B-`

Reason:
- broad tests, typecheck, and build are green
- but security bugs and large orchestration files keep risk elevated

### Governance maturity

Grade: `A`

Reason:
- custom lint architecture, tests, CI wiring, and plan discipline are all real and useful

### Current repo health

Grade: `B-`

Reason:
- workable and actively governed
- still carrying enough security debt, lint debt, and hotspot concentration to warrant focused cleanup before major further expansion

## Recommended Priority Order

### Do immediately

1. Fix the two P0 study-processing security bugs.
2. Harden storage-path validation in `lib/server/files.ts`.
3. Stop fabricating current-year PubMed metadata when the source year is unknown.
4. Refresh stale review docs so the repo’s durable truth matches current CI/governance reality.

### Do next

5. Reduce the blast radius of the top hotspot files rather than broad-refactoring the whole repo.
6. Keep paying down the legacy lint baseline, especially production-file errors.
7. Narrow the number of active large programs being pushed through the same runtime/UI surfaces at once.

### Do after that

8. Continue convergence of `/ai`, popup, and project copilot onto thinner shared runtime contracts.
9. Finish the draft-surface ownership migration so page/controller/editor/resource boundaries become clearer.
10. Split “living review summary” docs from historical snapshots more aggressively so stale summaries don’t linger.

## Final Conclusion

LitRev is not a chaotic repo. It is a repo with unusually good self-awareness that is now hitting the limits of a few oversized implementation surfaces.

The project’s best asset is that it already has the right instincts:
- write the rules down
- encode the rules in tooling
- test the rules
- review the repo repeatedly
- keep plans explicit

The project’s biggest risk is that some of the most important product paths still rely on giant coordination files to hold multiple unfinished initiatives together.

If the team fixes the security bugs, updates stale review docs, and keeps decomposing the hotspot runtime/UI files in priority order, this repo can continue scaling without losing its current strengths.
