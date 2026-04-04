# Evidence Ledger Master Plan

## Purpose
Define the canonical implementation plan for the Evidence Ledger as a product area.

This plan owns ledger-specific roadmap sequencing across:
- study list and study detail architecture
- duplicate-safe ingestion and study identity handling
- PDF/file processing UX and evidence review flows
- cross-surface evidence reuse across draft, protocol, notes, overview, and AI
- ledger-specific state ownership and performance follow-up
- future duplicate-review and evidence-expansion workflows

This plan does not replace shared owner docs:
- shared frontend doctrine stays in `docs/architecture/frontend-quality-bar.md`
- shared backend/storage/DB contracts stay in `docs/plans/plan-backend.md`
- shared performance budgets and cache-policy authority stay in `docs/plans/plan-speed-performance.md`
- shared context-capture contracts stay in `docs/plans/plan-context-capture.md`
- shared protocol-live state contracts stay in `docs/plans/plan-protocol-live-sync.md`
- shared testing execution doctrine stays in `docs/plans/plan-testing-execution.md`

## Current Architecture (Code-Verified)
- The ledger already behaves like a subsystem, not a single page:
  - list route: `next-app/app/project/[id]/ledger/page.tsx`
  - study detail route: `next-app/app/project/[id]/ledger/[studyId]/page.tsx`
  - row/presentation helpers: `next-app/app/project/[id]/ledger/StudyRow.tsx`, `next-app/app/project/[id]/ledger/LedgerStatsBar.tsx`, `next-app/app/project/[id]/ledger/useLedgerActions.ts`
- Study state is still split across two client owners:
  - `next-app/contexts/ProjectDataContext.tsx` owns the ledger domain slice for project boot/warm/invalidate behavior
  - `next-app/contexts/LedgerContext.tsx` owns a second in-memory study cache used by the ledger route
  - both still depend on `litrev:ledger-changed` compatibility events through `next-app/lib/project-data-events.ts`
- The ledger server domain is already broad:
  - `next-app/app/actions/ledger.ts` and `next-app/lib/server/ledger.ts` handle list/get/update/delete flows, canonical-study resolution after duplicate merges, soft delete, and duplicate-cluster merge rewrites
  - duplicate clustering and search-result dedupe live in `next-app/lib/server/search/dedup.ts`
- PDF/file import is intentionally decoupled:
  - `next-app/lib/server/files.ts` uploads bytes and creates `FileAsset` rows
  - `next-app/app/actions/files.ts` then enqueues follow-up processing and returns typed local schema-drift failures where applicable
  - import can currently attach a PDF to an existing study based on duplicate detection before any user confirmation step
- PDF extraction and deep analysis already use a durable queue:
  - `next-app/lib/server/study-processing.ts` owns `StudyProcessingJob` enqueue/claim/lease/retry logic and derives one `Study.processing` snapshot for all ledger surfaces
  - `next-app/app/actions/extraction.ts` and `next-app/hooks/useStudyProcessingSync.ts` keep list/detail UI in sync with durable processing truth
- Ledger state already affects other product surfaces:
  - draft evidence selection in `next-app/app/project/[id]/draft/AddEvidenceModal.tsx`
  - draft backlinks on the study detail route
  - project overview stats in `next-app/app/actions/stats.ts` and `next-app/app/project/[id]/ProjectDetailClient.tsx`
  - AI tool entrypoints in `next-app/lib/server/ai/tools/add-to-ledger.ts` and `next-app/lib/server/ai/tools/read-ledger.ts`
- Protocol and ledger are already coupled at the product level:
  - the ledger route may depend on current protocol criteria state, but `docs/plans/plan-protocol-live-sync.md` already closed the shared live-protocol contract
- Current known structural risks:
  - the list route and detail route are both large multi-responsibility client pages
  - duplicate-safe import is under-explained in the UI compared with the actual backend identity rules
  - ledger performance and correctness still pay for duplicated client ownership

## External Pattern Position
This plan adapts ideas through `docs/runbooks/external-pattern-intake.md`; it does not import code or foreign workflow assumptions directly.

The current intended upstream lessons are:
- `asreview/asreview`: explicit screening state, decision visibility, progress framing, and reviewer-oriented workflow separation
- `asreview/asreview-datatools`: import normalization, dedupe discipline, and evidence-expansion utilities such as snowballing
- `IEBH/SRA2`: staged evidence-synthesis workflow separation instead of one overloaded screen
- `mjwestgate/revtools`: modular duplicate review and title/abstract screening surfaces
- `aurumz-rgb/ReviewAid` and `extralit/extralit`: schema-driven extraction, validation, confidence, and human review rather than opaque one-shot automation
- `ijmarshall/robotreviewer`: bounded PDF-to-structured-summary automation with constrained claims
- `matheus-rech/clinical-extraction-system`: provenance, annotation, and audit-trail ideas for extracted evidence
- `nealhaddaway/CitationChaser`: forward/backward citation chasing as a first-class evidence workflow

LitRev should borrow patterns, not product shape:
- do not turn the ledger into an active-learning-first screening app
- do not copy external source verbatim
- do not import multi-reviewer complexity before the single-user evidence workflow is clean
- do not weaken existing LitRev trust boundaries just because another tool is looser

## Ledger Product Contract
- The ledger is the canonical evidence workspace for a project.
- Study identity must be explicit, stable, and understandable to the user.
- File upload, PDF extraction, deep analysis, and study updates must report truthful state instead of inferred optimism.
- Preview and canonical detail are different jobs:
  - preview keeps users oriented inside the list flow
  - canonical detail remains the full study route and edit surface
- Protocol, draft, overview, notes, and AI may consume ledger state, but they must not fork ledger truth.
- Automation is assistive, not sovereign:
  - uncertain duplicate decisions require user choice
  - uncertain extracted metadata should expose provenance/confidence and stay reviewable

## Design Principles
- Keep one canonical study-identity contract across import, search, AI add-to-ledger, duplicate merge, and deep links.
- Separate preview surfaces from full-detail surfaces instead of rebuilding the whole study page inside secondary chrome.
- Prefer shared derived view/state contracts over local route-specific status vocabularies.
- Treat file upload, text extraction, and study enrichment as separate states that can succeed or fail independently.
- Collapse duplicate client owners before adding major new ledger UI complexity.
- Optimize for deliberate evidence work, not maximal automation theater.

## Recommended Execution Order
1. `LED-001` Freeze detail/navigation architecture.
2. `LED-002` Fix duplicate-safe ingestion and explicit import identity.
3. `LED-003` Consolidate state ownership and ledger-specific performance debt.
4. `LED-004` Upgrade evidence-processing review UX on top of the cleaned detail architecture.
5. `LED-005` Tighten cross-surface evidence workflows once the ledger contract is clearer.
6. Only then promote later-wave work such as duplicate workbench, citation chasing, or multi-reviewer workflows.

## Active Tasks

### `LED-001` Study Detail Architecture and Durable Navigation
- Goal:
  - make study preview, canonical detail, and URL-owned navigation coherent instead of layering a side panel onto an already overloaded detail page
- Current problem:
  - `page.tsx` and `[studyId]/page.tsx` both own too much UI/state logic, while `CUX-031` and the ledger slice of `CUX-040` are tightly coupled design problems
- Required outcome:
  - extract shared study-detail presentation/data primitives from `next-app/app/project/[id]/ledger/[studyId]/page.tsx`
  - introduce a list-route study preview surface that can power the planned side panel without duplicating business logic
  - keep `/project/[id]/ledger/[studyId]` as the canonical full-detail route
  - move only durable list state into the URL, such as core filters and any future stable view mode
  - keep selection mode, selected IDs, expanded rows, transient dialogs, and ephemeral panel chrome local-only
- Guardrails:
  - do not fork PDF processing, draft backlink, or file-management truth between preview and full detail
  - do not let local restore or panel state outrank explicit route identity

### `LED-002` Duplicate-Safe Ingestion and Study Identity
- Goal:
  - make import/add flows explicit about whether they are creating a new study, attaching to an existing study, or refusing ambiguous identity
- Current problem:
  - `next-app/lib/server/files.ts` may attach an imported PDF to an existing study using duplicate detection that the user never explicitly approved
  - current duplicate logic mixes strong identifier evidence with weaker title/year-style heuristics, but the UX does not expose that distinction
- Required outcome:
  - add an import preflight contract that classifies incoming PDFs/results as:
    - `new_study`
    - `strong_duplicate`
    - `possible_duplicate`
  - strong duplicates should be reserved for trustworthy identifiers such as DOI, PMID, or Semantic Scholar paper ID
  - title/year-style heuristics should not silently reuse an existing study without user confirmation
  - ledger import UI must let users choose:
    - attach to existing study
    - create a new study anyway
    - cancel
  - post-import receipts must clearly state what happened
  - AI/search entrypoints such as `add_to_ledger` must stay aligned with the same identity rules
- Guardrails:
  - preserve canonical-study resolution after later duplicate merges
  - do not weaken the current truthful rule that yearless search results are not silently persisted as normal ledger studies

### `LED-003` Ledger State Ownership and Performance
- Goal:
  - remove the duplicate client cache pattern that currently makes ledger correctness and performance harder to reason about
- Current problem:
  - `ProjectDataContext` and `LedgerContext` both own ledger studies, and `litrev:ledger-changed` still acts as the bridge between surfaces
  - `docs/plans/plan-speed-performance.md` already identifies ledger cache consolidation as a likely first `SPD-008f` implementation wave
- Required outcome:
  - choose one canonical client owner for ledger studies
  - reduce or remove the compatibility event bridge once the canonical owner exists
  - keep boot/warm/invalidate behavior consistent with the freshness contract in `docs/plans/plan-speed-performance.md`
  - add route/surface instrumentation where needed so ledger changes can be measured instead of guessed
  - only consider heavier tactics such as virtualization after instrumentation shows a real need
- Guardrails:
  - this plan may sequence ledger-specific work, but freshness/preload/budget authority still belongs to `docs/plans/plan-speed-performance.md`
  - do not fork project-shell route boot rules for ledger as a one-off shortcut

### `LED-004` Evidence Processing Review UX
- Goal:
  - move from “background processing exists” to “users can understand and trust what extraction/analysis did”
- Current problem:
  - the durable processing contract is good, but extracted study metadata is still not reviewable enough once work finishes
  - the system is better at surfacing queue state than at surfacing provenance, confidence, and partial uncertainty in extracted fields
- Required outcome:
  - preserve `StudyProcessingJob` as the source of queue truth
  - keep `next-app/lib/study-processing-ui.ts` as the shared status-vocabulary owner
  - add better review surfaces for extracted fields:
    - confidence and missing-field signals where available
    - clear separation between uploaded file, extracted text, and enriched study metadata
    - better actionable error copy for unreadable PDFs, storage fetch failures, and downstream analysis failures
  - make the full study detail route the primary review surface first; preview surfaces should summarize, not duplicate editor complexity
- Guardrails:
  - do not reopen the queue architecture unless reliability evidence says it is insufficient
  - provenance and reviewability matter more than squeezing in more hidden automation

### `LED-005` Cross-Surface Evidence Workflows
- Goal:
  - make the ledger feel like the evidence backbone for the workspace instead of a semi-detached table
- Current problem:
  - draft, overview, AI, and protocol already depend on ledger truth, but the workflows are uneven and sometimes under-surfaced
- Required outcome:
  - keep draft evidence selection, study backlinks, and ledger-aware AI tools aligned to the same study identity contract
  - improve list/detail affordances for draft backlinks and evidence usage, especially after `LED-001`
  - audit overview stats and lightweight previews so they still make sense after study-status and processing improvements
  - keep protocol-driven criteria filtering and screening-oriented ledger actions compatible with the canonical live protocol slice
- Guardrails:
  - do not duplicate ledger business rules in draft or AI-only code paths
  - if a cross-surface rule changes the ledger contract, update this plan and the relevant owner plan in the same task

## Deferred / Later Waves
- [ ] `LED-006` Duplicate-review and merge workbench.
  - expose duplicate clusters and merge review more directly instead of leaving duplicate resolution mostly as backend capability
- [ ] `LED-007` Citation chasing and evidence expansion.
  - add forward/backward citation exploration once the core identity and import flows are trustworthy
- [ ] `LED-008` Reviewer assignment / consensus workflow.
  - explicitly deferred until the single-user ledger workflow is cleaner and better instrumented

## Testing and Quality Contract
Ledger work should follow LitRev’s existing testing philosophy: prefer high-signal contract tests in the touched layer, keep browser coverage sparse and journey-focused, and do not use broad smoke coverage as a substitute for direct regression tests.

### Required Test Shape
- Service/domain contract tests first:
  - duplicate classification and canonical-study resolution
  - import preflight outcomes
  - processing snapshot derivation and retry rules
  - URL parse/serialize rules for durable ledger state
- Server action tests second:
  - `next-app/app/actions/__tests__/files.test.ts`
  - `next-app/app/actions/__tests__/extraction.test.ts`
  - ledger action tests where route contracts change
- Focused client integration tests third:
  - ledger list interactions, side-panel preview behavior, and durable URL restoration
  - duplicate-decision flows on import
  - study detail review actions that change user-visible workflow
  - draft evidence pickers and backlinks only when the touched slice changes their behavior
- Browser smoke last, and only for canonical journeys:
  - import a PDF and reach a truthful study-processing state
  - resolve a likely duplicate during import
  - refresh/share a durable ledger URL and land in the same meaningful place
  - add evidence from ledger to draft and navigate back to canonical study detail

### Test Philosophy Guardrails
- Prefer extending existing targeted suites before adding new broad infra.
- Use real-DB tests only when Prisma/query semantics are the actual risk boundary; otherwise stay on mocked contract tests and the repo’s standard Vitest path.
- Do not add ledger-specific browser matrices unless repeated regressions justify them.
- For performance-sensitive ledger work, use the instrumentation and budgets owned by `docs/plans/plan-speed-performance.md` rather than inventing ad hoc “felt faster” checks.

### Validation Mapping
- UI-heavy ledger slices:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npx vitest run`
  - `npm run lint:styles` when CSS changes
- Backend/file/processing slices:
  - `npx tsc --noEmit`
  - `npx vitest run`
  - DB gates only when schema/migration/DB-runtime behavior actually changes, per `AGENTS.md`
- Deploy-sensitive slices:
  - follow `docs/plans/plan-backend.md`, `docs/runbooks/db-ops.md`, and release/deploy specialist rules when production rollout is involved

## Cross-Plan Guardrails
- `docs/plans/plan-ux-ui.md` owns shared UI doctrine and the cross-surface durable-navigation contract; this plan owns ledger-specific route/detail decisions within that contract.
- `docs/plans/plan-backend.md` owns shared storage, DB, auth, and queue contracts; this plan owns ledger-specific product sequencing and acceptance.
- `docs/plans/plan-speed-performance.md` owns freshness/preload/memory policy and performance budgets; this plan owns ledger-specific implementation order for cache consolidation and ledger-only acceptance detail.
- `docs/plans/plan-context-capture.md` owns ledger context-capture target builders and limits.
- `docs/plans/plan-protocol-live-sync.md` owns the shared live protocol slice used by ledger criteria/filter consumers.
- `docs/plans/plan-drafting-experience.md` owns draft authoring architecture even when it consumes ledger studies.
- `docs/plans/plan-testing-execution.md` owns shared lane taxonomy and CI policy; this plan only defines ledger-specific test expectations.

## Recently Completed
- [x] Durable ledger PDF processing shipped: queue/lease/retry truth now lives in `StudyProcessingJob`, and list/detail/files surfaces consume one shared processing snapshot.
- [x] Local dispatch fallback shipped: local non-deployed development now progresses queued processing without hidden dispatcher-secret setup.
- [x] Local import drift handling shipped: post-upload local schema drift now returns explicit `LOCAL_SCHEMA_DRIFT` guidance instead of a generic failure.
- [x] Protocol-live sync for ledger consumers shipped: protocol-dependent ledger behavior now consumes the shared live protocol slice instead of manual refresh heuristics.
- [x] Ledger single-study and multi-study context capture shipped and is now owned by `docs/plans/plan-context-capture.md`.
