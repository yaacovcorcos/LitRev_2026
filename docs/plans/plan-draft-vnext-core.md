# Draft VNext Core Plan

## Purpose
This plan finishes `DAP-01`: the Draft VNext shell and one-editor core.

The intended end state is not a visual redesign. It is a stronger draft architecture beneath the current section-first surface, so LitRev can later add page mode, scientific objects, review workflows, and agentic drafting without fighting route-level state and multiple competing editor authorities.

The product direction remains:
- preserve the current draft shell as much as possible
- keep `Section` and `Full Draft` familiar to users
- make both modes honest projections over canonical manuscript state
- move editor, route, save, and projection responsibilities out of `page.tsx`
- prepare the left support lane for the future `Evidence` / `Assets` / `Pages` / `Review` context panel without shipping that UI yet

## Goal And Scope
### Problem statement
`DAP-01` has started but is not complete. The first shipped pass added `DraftSupportPanel`, the minimal-change rollout flag, and canonical draft/manuscript synchronization during persistence. The draft route still has the central problems `DAP-01` was meant to remove:
- `next-app/app/project/[id]/draft/page.tsx` is still approximately 1,400 lines and owns too many concerns.
- `Section` mode uses one editor instance while `Full Draft` still renders section editors per visible section.
- Editor refs, route state, save scheduling, local persistence, evidence targeting, and selection/context actions are still coordinated inside the route.
- `DraftSupportPanel` has a future-mode type, but only the evidence body is implemented and there is no stable state contract for context-panel mode ownership yet.
- The route has no clean controller boundary that later `DAP-02` writing-quality work can depend on.

### Intended outcome
After this plan is implemented:
- `page.tsx` becomes mostly shell composition, layout, and high-level wiring.
- A draft controller owns load, save, route projection, local flush, dirty content tracking, and draft snapshot creation.
- A draft editor bridge owns editor registration, active editor selection, section focus, and editor update commits.
- `Section` and `Full Draft` continue to look familiar, but their behavior is backed by a stricter projection contract and explicit tests.
- The route has a typed left context-panel state contract, while visible UI remains the current evidence rail unless separately approved.
- `DAP-01` is complete enough for `DAP-02` to improve the writing experience without first untangling route ownership.

### In scope
- Route/controller extraction for the existing draft page.
- Editor authority cleanup and projection contract hardening.
- Feature-flagged burn-in for the VNext core path.
- Tests for route projection, editor handoff, local persistence, manuscript synchronization, and context-panel state contracts.
- Plan and durable memory updates.
- Git flow and cleanup.

### Out of scope
- Full visual redesign of the draft route.
- Shipping visible `Assets`, `Pages`, or `Review` tabs.
- New page-mode UI.
- New toolbar or formatting redesign.
- Scientific object insertion UI.
- Review/comment/suggestion UI.
- Database schema changes unless implementation proves a hidden persistence contract is impossible without them.

## Governance And Repo Grounding
### Routing
This planning task is governed by `planning-governance-specialist.md` because it edits `docs/plans/**`.

Future implementation will touch `next-app/app/project/[id]/draft/**`, so it must follow `frontend-ui-specialist.md` and retrieve:
- `docs/architecture/frontend-quality-bar.md`
- `docs/runbooks/frontend-review-loop.md`
- `docs/plans/README.md`
- this plan
- `docs/plans/plan-drafting-experience.md`
- `docs/plans/plan-draft-authoring-platform.md`

If the implementation touches agent runtime files, also retrieve `docs/agents/specialists/agent-runtime-specialist.md` and `docs/plans/plan-agentic.md`.

If the implementation touches Prisma schema or migrations, stop and route through `db-ops-specialist.md`.

### Current-state evidence
- `next-app/app/project/[id]/draft/page.tsx`
  - owns route projection, local load, server cache application, save scheduling, editor refs, dirty content flushing, URL synchronization, section switching, evidence targeting, context-capture actions, formatting popover state, export wiring, and final layout.
- `next-app/app/project/[id]/draft/DraftEditors.tsx`
  - already has useful shared editor pieces: `buildDraftEditorExtensions`, `BlockIdentity`, `ManuscriptSection`, `sectionIdAtPosition`, `Citation`, and `FullSectionEditor`.
- `next-app/app/project/[id]/draft/draft-workspace-state.ts`
  - already synchronizes section content into canonical manuscript state through `synchronizeDraftState`.
- `next-app/lib/draft-state-contracts.ts`
  - already owns draft mode, active section, full-draft visibility, and evidence-target resolution helpers.
- `next-app/lib/manuscript/schema.ts`
  - already creates manuscript section nodes, stable section node IDs, and block IDs.
- `next-app/app/project/[id]/draft/DraftSupportPanel.tsx`
  - already defines `DraftSupportPanelMode = "evidence" | "assets" | "pages" | "review"`, but only evidence is visible.
- `docs/reviews/2026-04-17-draft-vnext-minimal-change.md`
  - records what shipped in the first `DAP-01` pass and names the remaining controller/projection work.

## UI Approval Boundary
The implementation should be architecture-first and minimal-visual-change.

Allowed without a separate UI checkpoint:
- internal controller extraction
- test-only helpers
- feature flags
- non-visible state contracts
- behavior fixes that preserve the same visible interaction, such as making `Section` / `Full Draft` preserve focus and content more reliably

Requires a separate user-reviewed UI checkpoint before implementation:
- changing the visual design of the draft shell
- changing the visible `Section` / `Full Draft` control
- adding visible context-panel tabs
- changing the toolbar
- adding page mode
- changing the evidence rail layout
- changing editor spacing, typography, canvas, or panel proportions

Every implementation handoff must include:
- `Visible changes`
- `No visible changes`
- exact changed interactions, if any

## Minimal-Sufficient Strategy
Finish `DAP-01` by extracting the route into stable internal controllers first, then hardening the editor projection model behind the current UI.

This is the smallest reversible strategy because:
- the current draft page remains the production surface
- the feature flag already exists and can disable the VNext path
- existing persistence, citation compiler, export hooks, support panel, and route-state helpers are reused
- the work reduces risk before `DAP-02` introduces richer authoring UI

The plan intentionally avoids a full editor rewrite in one PR. It builds a strict foundation that lets the later one-editor manuscript editor become a controlled implementation rather than a surprise visual rewrite.

## Reuse Versus New
### Reuse
- `DraftState`, `loadDraftState`, `saveDraftState`, `createDefaultDraftState` from `next-app/lib/draft-storage.ts`
- `saveDraftAction` from `next-app/app/actions/drafts.ts`
- `synchronizeDraftState` from `draft-workspace-state.ts`
- `resolveDraftRouteProjection`, `buildCanonicalDraftRouteState`, `resolveDraftEvidenceTarget`, and related helpers from `next-app/lib/draft-state-contracts.ts`
- `DraftSupportPanel`, `DraftSidebar`, and `DraftContextRail`
- `useDraftSections`, `useDraftExport`, and `useDraftCopilot`
- `buildDraftEditorExtensions`, `sectionIdAtPosition`, and current Tiptap extensions
- `DAP-00` benchmark corpus and scripts

### New
New modules are justified only where they remove real route ownership:
- `useDraftWorkspaceController.ts`
  - owns loaded draft state, normalization, local persistence, backend save, pagehide flush, dirty content tracking, and route projection synchronization.
- `useDraftEditorBridge.ts`
  - owns editor refs, active editor identity, focus behavior, section editor content handoff, and editor update commits.
- `draft-projection-model.ts`
  - pure helpers that describe the projection state used by the route and tests.
- `draft-context-panel-state.ts`
  - pure state contract for future context-panel mode selection, defaulting to evidence.
- `DraftEditorSurface.tsx`
  - optional extraction for rendering `Section` and `Full Draft` bodies once controller boundaries are stable.

Do not add these modules if a smaller extraction proves sufficient during implementation. The end state matters more than the exact filenames.

## Implementation Design
### Controller contract
Create a controller hook that returns:
- `draft`
- `setDraft` or a narrower `updateDraft`
- `saveStatus`
- `resolvedMode`
- `routeActiveSection`
- `visibleFullDraftSectionIds`
- `fullDraftSections`
- `evidenceTargetSectionId`
- `getDraftSnapshot`
- `queueContentUpdate`
- `flushContentCommit`
- `queueUserRouteNavigation`
- `handleToggleMode`
- `handleSelectSection`

The route should stop owning:
- save timers
- dirty section refs
- URL canonicalization refs
- local-storage flush details
- route projection reconciliation
- local/server draft normalization

The controller must preserve:
- localStorage-first paint
- server cache warm-in
- explicit draft URL state precedence over storage fallback
- `pagehide` local flush
- backend debounce save
- citation compilation and manuscript synchronization before persistence

### Editor bridge contract
Create an editor bridge that returns:
- `activeEditor`
- `sectionEditor`
- `formattingEditor`
- `registerEditor`
- `focusEditorForSection`
- `handleFocusSection`
- `handleUpdateSection`
- `insertCitation`
- `buildCurrentDraftSelectionTarget`

The bridge should own:
- active editor refs
- full-draft section editor registry
- section editor content loading when active section changes
- references read-only editability
- paragraph direction and context-action availability updates

The bridge should not own:
- project data
- persistence
- export
- support panel layout
- visible UI styling

### Projection model
The projection contract should become explicit:
- `Section` mode resolves to one writable named section or falls back to `Full Draft`.
- `Full Draft` resolves to a continuous list of contentful sections plus generated references last.
- `section` URL param in `Full Draft` is a focus target, not the projection identity.
- changing mode flushes pending content first.
- switching from `Full Draft` to `Section` focuses the same logical section when possible.
- switching from `Section` to `Full Draft` scrolls/focuses the same logical section when it is visible.
- zero writable named sections keeps `Section` disabled and targets evidence to `Whole draft`.

### One-editor completion standard
`DAP-01` should complete the foundation for one editor truth without forcing the full visual redesign.

Minimum completion standard for this plan:
- one canonical manuscript state is authoritative for persistence and snapshots
- editor updates flow through one controller path
- `Section` and `Full Draft` projections are tested against that canonical state
- the current multi-editor full-draft rendering is isolated behind the editor bridge and no longer leaks route ownership
- the route no longer directly coordinates multiple editor refs

Stretch completion, only if it can be done without visual churn:
- introduce a hidden or feature-flagged canonical manuscript editor core using `ManuscriptSection`
- use it as the internal authority for section extraction and projection tests
- keep the visible route unchanged until the user approves the later design pass

Do not ship a visible one-editor manuscript canvas without separate UI approval.

### Context panel preparation
`DraftSupportPanel` should gain a non-visible state contract:
- default mode is `evidence`
- available modes can remain `["evidence"]` in production
- future modes are typed and testable
- mode fallback is deterministic when a mode is unavailable
- no visible tabs ship in this slice

This prepares the later approved context panel:
- `Evidence`
- `Assets`
- `Pages`
- `Review`

### Feature flag and fallback
Reuse `isDraftVNextMinimalChangeEnabled()`.

Rules:
- the current behavior remains the fallback
- the new controller path can be disabled by setting `NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE=0`
- tests must cover the default enabled behavior
- if the implementation keeps any meaningful branch for disabled behavior, add a targeted regression test

## Execution Slices
### `DVX-201` Repository preflight and branch hygiene
Scope:
- start from clean `origin/main` in a dedicated task worktree
- do not use repo root for task edits
- inventory unrelated local root changes before implementation

Outputs:
- implementation branch `YY/dap-01-vnext-core`
- worktree `.worktrees/dap-01-vnext-core`
- cleanup manifest before deleting the worktree after merge

Blast radius: low.

### `DVX-202` Pure projection and context-panel contracts
Scope:
- add or harden pure helpers for projection state and context-panel mode state
- keep behavior unchanged

Likely touched paths:
- `next-app/lib/draft-state-contracts.ts`
- `next-app/app/project/[id]/draft/draft-projection-model.ts`
- `next-app/app/project/[id]/draft/draft-context-panel-state.ts`
- related tests

Acceptance:
- section/full projection cases are covered without rendering the route
- context-panel mode fallback is covered
- no visible changes

Blast radius: low.

### `DVX-203` Workspace controller extraction
Scope:
- move load, normalize, save, dirty-content, local flush, URL sync, and draft snapshot logic out of `page.tsx`
- preserve localStorage-first paint and server cache warm-in
- keep `useWindowEvent("pagehide")` behavior

Likely touched paths:
- `next-app/app/project/[id]/draft/useDraftWorkspaceController.ts`
- `next-app/app/project/[id]/draft/page.tsx`
- `next-app/app/project/[id]/draft/__tests__/page.test.tsx`
- new controller tests

Acceptance:
- `page.tsx` no longer owns save timers, dirty refs, or route sync refs directly
- persisted state still synchronizes canonical manuscript content after edits
- URL route state still beats storage state
- backend save error still surfaces as `saveStatus: "error"`

Blast radius: medium.

### `DVX-204` Editor bridge extraction
Scope:
- move active editor refs, section editor registration, focus behavior, content handoff, insert citation, and selection target building out of `page.tsx`
- keep the visible editor rendering stable

Likely touched paths:
- `next-app/app/project/[id]/draft/useDraftEditorBridge.ts`
- `next-app/app/project/[id]/draft/page.tsx`
- `next-app/app/project/[id]/draft/DraftEditors.tsx`
- editor bridge tests

Acceptance:
- switching sections flushes the previous section before focus moves
- switching modes preserves the active logical section where possible
- citation insertion targets the active editable editor
- references remain read-only
- selection/context target construction remains correct

Blast radius: medium.

### `DVX-205` Route composition slimming
Scope:
- reduce `page.tsx` to shell, layout, and composition
- optionally extract `DraftEditorSurface.tsx` if rendering remains too large
- keep top bar, support panel, center editor, export modal, and copilot in the same visible positions

Likely touched paths:
- `next-app/app/project/[id]/draft/page.tsx`
- `next-app/app/project/[id]/draft/DraftEditorSurface.tsx`
- `next-app/app/project/[id]/draft/__tests__/page.test.tsx`

Acceptance:
- route remains readable and ownership boundaries are obvious
- no visible layout redesign
- existing draft page tests still pass

Blast radius: medium.

### `DVX-206` Projection honesty burn-in
Scope:
- add regression coverage for mode and active-section transitions using realistic `DAP-00` fixtures where practical
- run benchmark checks against the draft corpus
- document any remaining limitation before marking `DAP-01` complete

Likely touched paths:
- `next-app/app/project/[id]/draft/__tests__/page.test.tsx`
- `next-app/lib/__tests__/draft-state-contracts.test.ts`
- `next-app/lib/draft-benchmark/**` only if a missing check is discovered
- `docs/reviews/<date>-draft-vnext-core.md`

Acceptance:
- `Section` / `Full Draft` transitions are covered
- route state precedence is covered
- local flush and backend save paths are covered
- benchmark report/check still pass

Blast radius: low/medium.

### `DVX-207` Plan completion and cleanup
Scope:
- update `plan-draft-authoring-platform.md` to mark `DAP-01` complete only when implementation acceptance passes
- update `plan-drafting-experience.md` recently completed / active task wording
- add durable review note
- remove temporary execution plan only if the user asks to treat it as completed temporary detail; otherwise keep this plan as the DAP-01 implementation contract until completion

Acceptance:
- docs describe current truth, not a diary
- no stale "still remains for DAP-01" language after completion

Blast radius: low.

## Risk And Rollback
### Primary failure modes
- editor bridge changes make focus jumpy or lose pending text
- route extraction changes URL precedence
- save controller misses a pending dirty section before route/mode switch
- context-capture selection targets point to the wrong section in `Full Draft`
- feature flag branches drift and tests only cover one path
- refactor introduces subtle route hydration or stale-closure bugs

### Detection signals
- draft page tests fail around saved state or route params
- `saveStatus` sticks on `saving`
- local reload loses the last edits
- mode switch lands on the wrong section
- generated references appear in the wrong place
- context-capture actions use the wrong section label or evidence IDs
- `npm run draft:benchmark:check` fails

### Rollback path
- disable with `NEXT_PUBLIC_DRAFT_VNEXT_MINIMAL_CHANGE=0` if the implementation keeps a disabled branch
- revert the single DAP-01 implementation PR if the refactor changes behavior unexpectedly
- keep all extraction PRs atomic so a bad slice can be reverted without undoing unrelated draft work

## Verification Strategy
### Tests
Add or update tests for:
- local draft load applies route projection
- server cached draft applies only once and preserves URL precedence
- pending editor updates flush before section switch
- pending editor updates flush before mode switch
- `pagehide` persists dirty content locally
- backend save error sets error state
- zero writable sections disables section mode and targets `Whole draft`
- `Full Draft` section focus is URL focus, not projection identity
- references section remains read-only
- citation insertion targets active section in both projections
- support panel defaults to evidence and safely ignores unavailable modes
- manuscript state remains synchronized after persistence

### Commands
Run from `next-app/`:
- `npm run lint`
  - catches ESLint, hooks, accessibility, and local lint governance issues.
- `npx tsc --noEmit`
  - catches type regressions across extracted controller boundaries.
- `npx vitest run`
  - catches route, hook, storage, compiler, and benchmark regressions.
- `npm run draft:benchmark:report`
  - confirms the DAP-00 corpus still produces a usable benchmark report.
- `npm run draft:benchmark:check`
  - confirms DAP-01 blocking budgets still pass.

Run `npm run lint:styles` only if CSS changes are made. CSS changes should be avoided in this plan unless the user approves a visible UI adjustment.

## Debuggability And Triage
### Fast reproduction path
Use the current demo project plus the DAP-00 benchmark fixtures.

Manual checks:
- open a project draft
- type in `Section`
- switch to `Full Draft`
- return to the same section
- reload
- verify content remains
- insert a citation from the left evidence rail
- switch to references
- verify references are read-only
- test zero-section or empty-start state if available

### First triage boundaries
- content lost after typing
  - workspace controller dirty-content queue or pagehide flush
- wrong active section after route change
  - projection helpers or URL sync
- citation inserted into wrong place
  - editor bridge active editor registry
- context action uses wrong section
  - editor bridge selection target builder
- visual movement/regression
  - route composition extraction or unintended CSS change

## Git Flow And Cleanup
### Branch start
1. In repo root, run `git fetch origin --prune`.
2. Confirm repo root `main` is not ahead or behind `origin/main`.
3. Do not use repo root for implementation if unrelated local files are dirty.
4. Create a task worktree from `origin/main`:
   - `git worktree add -b YY/dap-01-vnext-core .worktrees/dap-01-vnext-core origin/main`

### Implementation discipline
- Stage only DAP-01 files.
- Keep unrelated local work out of the implementation branch.
- Use one atomic commit unless implementation naturally requires two reviewable commits.
- Suggested commit title:
  - `refactor: finish draft vnext core`

### Before PR
Run required validation from `next-app/`:
- `npm run lint`
- `npx tsc --noEmit`
- `npx vitest run`
- `npm run draft:benchmark:report`
- `npm run draft:benchmark:check`

Then:
- `git status --short`
- `git diff --stat origin/main...HEAD`
- `git push -u origin YY/dap-01-vnext-core`
- open a PR targeting `main`

### PR body must include
- summary
- visible changes: exact list, or `None intended`
- tests/commands run
- feature flag and rollback notes
- files intentionally not touched
- remaining approval-gated UI work

### Merge and cleanup
After checks pass and the PR is mergeable:
1. Merge the PR.
2. Sync repo root `main` to `origin/main`.
3. Remove `.worktrees/dap-01-vnext-core`.
4. Delete the local branch `YY/dap-01-vnext-core`.
5. Prune deleted remote refs.
6. Confirm repo root status, while preserving any unrelated local files that predated this task.

Cleanup manifest format:
```md
Task: DAP-01 Draft VNext core
Merged PR:
Merged commit:
Removed worktree:
Deleted local branch:
Remote branch status:
Unrelated root changes preserved:
Validation commands:
```

## Completion Criteria
`DAP-01` is complete when:
- `page.tsx` no longer owns the core draft controller responsibilities.
- editor authority is isolated behind a bridge or equivalent module.
- `Section` and `Full Draft` are tested as projections over canonical draft/manuscript state.
- the current visible draft shell is preserved unless the user separately approved a UI change.
- the support panel has a typed internal path toward `Evidence` / `Assets` / `Pages` / `Review`.
- DAP-00 benchmark checks pass.
- docs describe current truth and no longer claim the larger controller/projection work remains.

## Assumptions
- The current Tiptap foundation remains in place for `DAP-01`.
- Full page-mode and polished manuscript-canvas design wait for `DAP-02` or a later approved UI phase.
- The current right project copilot remains owned by the project shell.
- The left rail remains visually evidence-first in this slice.
- The user wants high-quality internals now and the full visual design pass later.
