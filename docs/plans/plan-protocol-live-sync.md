# Protocol Live Sync Plan

## Purpose
Define the canonical implementation plan for making protocol state feel live, safe, and shared across the protocol page, copilot artifact acceptance, ledger filtering, and other protocol-dependent surfaces.

The intended end state is a single project-scoped protocol client state that updates immediately in the UI, survives refresh safely, syncs to the backend in the background, and reflects accepted copilot protocol changes without requiring a manual page refresh.

## Goal + Scope

### Problem Statement
- Manual protocol edits are currently optimistic only inside `ProtocolProvider`, but persistence depends on a debounced backend save that can be lost on refresh or route exit.
- Accepted copilot protocol proposals currently rely on the indirect path `server apply -> window event -> ProjectDataContext refetch -> ProtocolProvider re-seed`, which is eventually consistent and does not feel live.
- Protocol-dependent surfaces such as ledger criteria filtering rely on cached protocol refetches instead of a shared live protocol state.
- Protocol save failures are mostly console-only, so users can lose confidence in whether their changes actually landed.

### Intended Outcome
- Protocol is a live project domain, not a page-local document snapshot.
- Manual edits on the protocol page appear immediately and are protected against refresh loss.
- Accepted copilot protocol changes appear immediately on the protocol page if it is open.
- Protocol-dependent surfaces update immediately from shared client state, with backend refetch used for reconciliation rather than first visibility.
- Save and sync status is visible, understandable, and non-destructive.

### In Scope
- `next-app/contexts/ProtocolContext.tsx`
- `next-app/contexts/ProjectDataContext.tsx`
- `next-app/app/project/[id]/protocol/page.tsx`
- `next-app/hooks/useProjectState.ts`
- protocol-dependent consumers that currently read protocol through `useProjectData()` or direct `getProtocolAction()` calls
- Copilot artifact acceptance path for `protocol_suggestion` and `criteria_card`
- Protocol local persistence and background sync
- Protocol save-state and external-update UX
- Tests and telemetry for protocol live-sync behavior

### Out of Scope
- Reworking protocol schema or field taxonomy
- Changing the proposal-only contract of `update_protocol`
- Multi-user collaborative editing or CRDT-style merging
- Generalized live-sync state architecture for all domains in the same slice

## Governance and Repo Grounding

### AGENTS Mapping
- Intent: implementation planning only
- Required specialist: `docs/agents/specialists/planning-governance-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/README.md`
  - this plan file
  - protocol-related current-state files in `next-app/`

### PRD vs Plan Rule
- This is a HOW change, not a WHAT/WHO/WHY product change.
- `PRD.md` should remain unchanged unless the product contract for protocol editing or copilot acceptance changes.

### Current-State Evidence
- The protocol page is wrapped in `ProtocolProvider` and seeded from cached project data only through `initialData` in `next-app/app/project/[id]/protocol/page.tsx`.
- `ProtocolProvider` owns its own local protocol state and schedules a debounced backend save after `500ms` in `next-app/contexts/ProtocolContext.tsx`.
- On cleanup, `ProtocolProvider` clears the pending timer rather than flushing it, so refresh/route exit can drop edits in `next-app/contexts/ProtocolContext.tsx`.
- A local protocol storage helper already exists in `next-app/lib/protocolStorage.ts` but is not used by the current protocol page runtime.
- `next-app/hooks/useProjectState.ts` fetches protocol directly via `getProtocolAction()` because `ProtocolProvider` is page-scoped, so copilot/conversation readers currently bypass any shared client protocol slice.
- Accepted copilot protocol artifacts dispatch project-data invalidation through `next-app/hooks/useCopilotStreamActions.ts`.
- `ProjectDataContext` responds to those events by refetching protocol from the server in `next-app/contexts/ProjectDataContext.tsx`.
- Ledger criteria filtering consumes cached protocol from `ProjectDataContext`, copies it into local state, and updates only when that cached slice changes in `next-app/app/project/[id]/ledger/page.tsx`.
- Server-side artifact apply for `protocol_suggestion` and `criteria_card` writes directly to the protocol row in `next-app/lib/server/agent/artifacts.ts`.

## Current Architecture
- `ProjectDataContext` now owns the canonical in-browser protocol slice, including local durability metadata, save state, pending external patch state, and immediate client-side artifact patch application.
- `ProtocolProvider` is now a page adapter over that shared slice rather than a separate protocol source of truth, so protocol page edits and accepted copilot protocol artifacts update the same client state immediately.
- `protocolStorage.ts` now supports a versioned metadata envelope with backward-compatible reads for legacy raw payloads, allowing refresh-safe protocol recovery without breaking migration helpers.
- `useProjectState()` now consumes shared protocol state instead of fetching protocol directly, so copilot/conversation protocol-dependent reads stay aligned with accepted protocol updates.

## Documentation Impact
- Required when implementation lands:
  - Update `docs/plans/plan-ux-ui.md` only if the final UX contract differs materially from this plan.
  - Update this plan’s `Current Architecture`, `Active Tasks`, and `Recently Completed` sections as slices land.
  - Update `docs/runbooks` only if protocol save/debug procedures or live-sync failure triage becomes operationally non-obvious.
- Deferred work stays tracked in this plan under follow-on slices rather than in ad hoc notes elsewhere.

## Minimal-Sufficient Strategy
The smallest reversible approach is to keep the existing protocol page mutation API surface intact, but move protocol visibility and persistence responsibilities into a shared project-scoped client state flow.

That means:
- reuse `ProtocolContext` for page component ergonomics
- reuse `ProjectDataContext` as the project-scoped cache owner
- reuse `protocolStorage.ts` for local durability
- reuse server-side protocol writes and artifact apply logic
- add a thin live protocol patch/reconciliation layer rather than inventing a new global store framework

This avoids a broad rewrite while still fixing the two actual product failures:
- accepted copilot protocol changes not showing up immediately
- refresh/route exit making protocol edits feel unsafe

## Reuse vs New

### Reuse
- `next-app/contexts/ProtocolContext.tsx` remains the page-facing protocol editing API.
- `next-app/contexts/ProjectDataContext.tsx` remains the project-domain cache owner.
- `next-app/lib/protocolStorage.ts` is reused for local protocol durability.
- `next-app/lib/project-data-events.ts` remains the invalidation/reconciliation transport.
- `next-app/lib/server/agent/artifacts.ts` remains the server source of truth for applied protocol proposals.

### New
- A client-safe protocol patch helper that can apply `protocol_suggestion` and `criteria_card` payloads to protocol data without waiting for a refetch.
- Shared protocol live-state methods in `ProjectDataContext`, for example:
  - set optimistic protocol data
  - patch protocol from an accepted artifact
  - mark save state / sync status
- A protocol save-status model that distinguishes local safety from backend sync.
- A versioned protocol local-storage envelope with sync metadata and backward-compatible reads.
- Conflict handling for incoming external protocol patches using explicit field-path identity and a per-field dirty/focus registry.
- A rollout gate for shared live protocol slice and immediate artifact patching.

## Decision-Complete Implementation Design

### Core Decision
Protocol should be modeled as one live project-scoped client domain with two mutation sources:
- manual page edits
- accepted copilot protocol artifacts

Both sources should update the same client state immediately. Backend save becomes asynchronous confirmation, not the first place the user sees the change.

### Target Architecture
1. `ProjectDataContext` owns the canonical in-browser protocol slice for the active project.
2. `ProtocolProvider` becomes a page adapter over that shared slice rather than an isolated source of truth.
3. Manual edits write through immediately to:
   - shared protocol slice
   - localStorage backup
   - debounced backend sync queue
4. Accepted protocol artifacts patch the shared protocol slice immediately after successful server acceptance, then trigger a background refetch for reconciliation.
5. Protocol-dependent consumers such as ledger and `useProjectState()` use the shared live protocol slice directly instead of fetching or copying stale snapshots where practical.

### Protocol State Model
Add a richer protocol domain contract to `ProjectDataContext`:
- `data`: current protocol data shown across the app
- `state`: `idle | loading | ready | error`
- `saveState`: `idle | saving | saved | local_only | error`
- `lastSyncedAt`
- `pendingExternalPatches`

Behavioral rules:
- `data` is always the latest local user-visible protocol state.
- `saveState=saving` means local state updated and backend sync is pending.
- `saveState=local_only` means local backup succeeded but backend sync failed or is auth-blocked.
- `saveState=error` is for unrecoverable protocol load corruption, not normal transient save issues.

### Local Storage Contract
`protocolStorage.ts` cannot remain raw `ProtocolData` if restore precedence depends on sync metadata.

V1 storage envelope:
- `version: 3`
- `savedAtMs: number`
- `lastSyncedAtMs: number | null`
- `source: "protocol_page" | "artifact_patch" | "reconcile"`
- `protocol: ProtocolData`

Compatibility rules:
- `loadProtocolData()` must accept both:
  - existing raw `ProtocolData`
  - new envelope shape
- legacy raw payloads should be treated as:
  - `version: 2`
  - `savedAtMs: 0`
  - `lastSyncedAtMs: null`
  - `source: "protocol_page"`
- `hasProtocolData()` and migration callers must continue to work with both shapes

Impacted consumers:
- `next-app/lib/protocolStorage.ts`
- `next-app/lib/migrateLocalStorage.ts`
- any seeding/migration utilities that assume `loadProtocolData()` returns only raw protocol content

### Manual Edit Flow
On every protocol edit:
1. Apply the change to the shared protocol slice immediately.
2. Persist the same value to `protocolStorage.ts` immediately.
3. Mark `saveState` as `saving`.
4. Debounce backend save.
5. On backend success:
   - mark `saveState` as `saved`
   - update `lastSyncedAt`
   - optionally refresh protocol from server if reconciliation is needed
6. On backend failure:
   - keep visible local value
   - mark `saveState` as `local_only`
   - expose a retry path

### Refresh/Exit Safety
Protocol should no longer rely on the debounce timer alone.

Required safeguards:
- localStorage write-through on each edit
- flush or immediate save attempt on:
  - `pagehide`
  - visibility loss where practical
  - explicit route leave if a navigation hook is already available
- reload precedence:
  - if local protocol backup is newer than last confirmed sync for the current session, restore it first and reconcile in background

### Conflict Identity Model
Field-level conflict detection cannot rely on `activeSection` alone.

V1 field identity contract:
- scalar fields:
  - `researchQuestion`
  - `pico.population`
  - `pico.intervention`
  - `pico.comparison`
  - `pico.outcome`
  - `searchStrategy.query`
  - `methodology.timeFrameStart`
  - `methodology.timeFrameEnd`
  - `methodology.qualityAssessmentTool`
  - `methodology.qualityAssessmentNotes`
- array fields for direct single-item editing:
  - `eligibility.inclusion[<index>]`
  - `eligibility.exclusion[<index>]`
- array collection fields for whole-list replacement patches:
  - `eligibility.inclusion`
  - `eligibility.exclusion`
  - `searchStrategy.databases`
  - `methodology.studyDesigns`

Dirty/focus registry requirements in the page adapter:
- track focused field path
- track dirty field paths
- clear dirty markers on successful local commit/reconcile

Matching rules:
- `protocol_suggestion`
  - targets one explicit field path from payload
- `criteria_card`
  - targets both `eligibility.inclusion` and `eligibility.exclusion` as collection-level paths
- collection-level incoming patches conflict with any dirty child item path under that collection

### Copilot Acceptance Flow
For `protocol_suggestion` and `criteria_card`:
1. User accepts the artifact.
2. Server applies it and confirms success.
3. Client immediately patches shared protocol state from the artifact payload using a pure helper.
4. Protocol page and dependent surfaces update immediately.
5. A background `dispatchProjectDataChanged` / refetch still runs to reconcile with server truth.

This preserves correctness while removing the visible lag from the current refetch-only model.

### Conflict Policy
Blind overwrite of the field currently being edited is not acceptable.

V1 rule:
- if an external patch targets a protocol field path or collection path not currently dirty/focused on the protocol page, apply immediately
- if it targets a dirty/focused matching path, queue it as a pending external patch and show a small review banner:
  - `Copilot updated Population`
  - actions: `Apply incoming`, `Keep mine`

This is the smallest safe conflict contract that avoids cursor-jumping and silent destructive overwrite.

### Protocol Page UX Contract
The protocol page should show:
- immediate inline field updates as the user types
- a compact save indicator in the header:
  - `Saving…`
  - `Saved`
  - `Saved locally`
  - `Sync failed`
- if an accepted copilot change lands while the page is open:
  - immediate field update when non-conflicting
  - or a pending external update banner when conflicting

### Cross-Surface UX Contract
- Accepting a protocol artifact in copilot should make the Protocol page feel live without refresh.
- Ledger criteria-dependent UI should use the updated protocol immediately.
- Copilot/conversation readers that currently use `useProjectState()` should observe the same shared live protocol state instead of direct protocol refetch.
- Notes/draft/copilot surfaces that only need protocol read access should observe the same shared client state where available, with backend refetch as fallback.

### Runtime / System Behavior
- Fewer unnecessary protocol refetches for purely local visibility updates.
- Better resilience to auth hiccups or slow network during editing.
- Reduced chance of dropped protocol edits on refresh.
- More deterministic client-side protocol state transitions, which improves debugging.

### Operational Impact
- No schema or migration work.
- No deployment sequencing concerns beyond normal UI/server action rollout.
- Telemetry should capture protocol save failures and conflict resolutions because those become first-class UX states.

### Rollout and Rollback Semantics
This change is invasive enough that rollback should not rely only on code revert.

V1 rollout gate:
- `NEXT_PUBLIC_PROTOCOL_LIVE_SYNC_V1`

Behavior:
- `off`:
  - current fetch/reseed behavior
  - no immediate artifact patching
  - no shared-slice write-through ownership switch
- `on`:
  - shared live protocol slice
  - local durability envelope
  - immediate accepted-artifact patching

Rollback:
- preferred rollback is deployment-scoped flag disable plus redeploy
- if the live-slice backing contract itself is broken, revert remains the fallback

## Long-Term Quality and Scalability

### Maintainability
- Keep protocol patch logic in one reusable helper rather than duplicating field-path mutation logic in client components.
- Preserve `ProtocolContext` public API to minimize blast radius for route components.

### Reliability
- Local write-through removes the current single point of failure around debounce timing.
- Explicit save states make failures visible instead of console-only.
- Reconciliation refetch preserves server-authoritative correctness.

### Scalability
- This design is intentionally protocol-scoped, but the pattern can later be reused for notes or other live domains if it proves out.
- Avoid introducing a heavyweight generic client-state framework before this protocol slice demonstrates clear need.

### Tradeoffs
- Keeping both shared slice state and backend reconciliation adds complexity compared to pure refetch, but it directly solves the UX problem.
- Conflict banners add UI complexity, but they are safer than silent overwrite and much smaller than full collaborative merge tooling.
- Adding a versioned storage envelope creates migration surface in `protocolStorage.ts`, but it is necessary to make restore precedence and debugging coherent.

## Execution Slicing

### Slice 1: Protocol Durability and Save State
Goal:
- make manual protocol edits refresh-safe and visibly stateful

Changes:
- wire `protocolStorage.ts` into protocol runtime
- add protocol save-state model
- flush pending saves on exit/blur where feasible

Blast Radius:
- protocol page only

Rollback:
- remove local backup wiring and return to current debounce-only path

### Slice 2: Protocol Adapter Contract
Goal:
- define the page-facing live protocol adapter before moving backing ownership

Changes:
- define `ProtocolProvider` contract over a shared slice
- add field-path dirty/focus registry
- add save-state and pending external patch API shape

Blast Radius:
- protocol page only

Rollback:
- keep existing `ProtocolProvider` contract untouched

### Slice 3: Shared Live Protocol Domain
Goal:
- move protocol visibility ownership into `ProjectDataContext`

Changes:
- add shared protocol setters/patchers
- implement backing live-slice methods consumed by `ProtocolProvider`

Blast Radius:
- protocol page plus consumers of `useProjectData().protocol`

Rollback:
- keep fetch-only `ProjectDataContext` behavior and restore page-local protocol ownership

### Slice 4: Copilot Acceptance Immediate Patch
Goal:
- make accepted protocol artifacts visible immediately without refresh

Changes:
- add client patch helper for `protocol_suggestion` and `criteria_card`
- call it from artifact acceptance success path
- keep background invalidation/refetch for reconciliation
- migrate `useProjectState()` and other direct protocol readers onto the shared live slice

Blast Radius:
- copilot acceptance path, protocol page, ledger criteria consumers

Rollback:
- disable immediate patch and fall back to event-driven refetch-only behavior

### Slice 5: Conflict UX and Cross-Surface Polish
Goal:
- prevent destructive overwrites and tighten the live experience

Changes:
- focused-field conflict detection
- pending external update banner
- ledger and other protocol-dependent consumers moved away from stale snapshot copies where needed

Blast Radius:
- protocol page UX and selected dependent surfaces

Rollback:
- revert to immediate non-conflicting patch only, with refetch for the rest

### Alternatives Considered
- Rejected: keep current architecture and only lower debounce time.
  - Reason: still loses edits on refresh and does not solve copilot acceptance lag.
- Rejected: general-purpose app-wide state rewrite for every domain.
  - Reason: too large for the problem and not minimally reversible.
- Chosen: protocol-scoped live domain with local durability and optimistic artifact patching.

## Risk and Rollback

### Primary Failure Modes
- Shared client state and server truth drift apart temporarily.
- External patch overwrites user typing.
- Save-status UI becomes noisy or misleading.
- Local backup resurrects stale protocol after a successful remote overwrite.

### Detection Signals
- protocol page shows `Saved locally` or `Sync failed`
- telemetry spikes on protocol save failure or reconciliation mismatch
- tests fail on artifact-acceptance propagation or refresh-recovery flows
- user reports of field values reverting after navigation

### Rollback Path
- Disable optimistic artifact patching and return to refetch-only propagation.
- Keep local backup if it proves low risk, since it is independently valuable.
- If shared slice migration is unstable, restore `ProtocolProvider` as page-local owner while leaving save-state instrumentation in place.
- If rollout regression is broad, set `NEXT_PUBLIC_PROTOCOL_LIVE_SYNC_V1=0` and redeploy while investigation continues.

## Verification Strategy

### Happy Path
- Manual edit on protocol page updates field immediately, survives refresh, and reaches backend.
- Accept `protocol_suggestion` in copilot while protocol page is open; field updates immediately.
- Accept `criteria_card`; eligibility lists update immediately.
- Ledger criteria filtering reflects changed protocol without manual refresh.

### Edge Cases
- Refresh within `500ms` of typing.
- Backend save failure after local edit.
- Accept protocol artifact while editing the same field on the protocol page.
- Accept protocol artifact while protocol page is closed, then navigate to it.
- Local backup newer than cached server protocol after transient auth/network issue.

### Regression Scenarios
- Existing protocol section editing interactions still work.
- Popup `update_protocol` proposal flow still remains proposal-only.
- ProjectData preload behavior does not regress into duplicate or infinite refetch loops.
- `useProjectState()` and any direct protocol readers no longer drift behind accepted protocol changes.

### Test Layers
- Unit:
  - protocol patch helper
  - save-state transitions
  - conflict detection
  - local backup precedence
- Integration:
  - `ProtocolProvider` + `ProjectDataContext`
  - copilot artifact acceptance updates protocol consumers
- E2E:
  - edit protocol, refresh, confirm persistence
  - accept protocol artifact, verify protocol page updates live

### Acceptance Signals
- No manual refresh required to see accepted copilot protocol changes.
- Refresh no longer routinely loses protocol edits.
- Users can tell whether protocol is saved remotely, saved locally, or blocked.

## Validation Mapping
- Docs-only plan change:
  - no code gate required by `AGENTS.md`
- When implementation starts, required gates from `next-app/`:
  - `npx tsc --noEmit`
    - catches type drift across `ProtocolContext`, `ProjectDataContext`, artifact payload patch helpers, and consumer components
  - `npx vitest run`
    - catches protocol state transition, live-sync, and persistence regressions

## Debuggability and Triage

### Failure Surface Signals
- protocol page save chip stuck on `Saving…`
- protocol page falls back to `Saved locally`
- accepted copilot artifact changes timeline card status but not protocol field value
- ledger still showing old criteria after accepted protocol artifact

### Fast Reproduction Path
1. Open protocol page and edit a field.
2. Refresh within one second.
3. Accept a `protocol_suggestion` from copilot while protocol page is open.
4. Navigate to ledger and inspect criteria-driven filtering.

### First Triage Steps
- Check whether the shared protocol slice changed in `ProjectDataContext`.
- Check whether local backup wrote to `protocolStorage.ts`.
- Check whether backend save returned success.
- Check whether artifact acceptance emitted immediate client patch or only refetch.
- Check whether the affected field was marked dirty/focused and the patch was queued as pending.

### Fault Boundaries
- Protocol page local UX issue: `ProtocolContext.tsx`, `protocol/page.tsx`
- Shared state / propagation issue: `ProjectDataContext.tsx`, `project-data-events.ts`
- Copilot acceptance issue: `useCopilotStreamActions.ts`
- Direct protocol-reader migration issue: `useProjectState.ts`
- Server apply issue: `lib/server/agent/artifacts.ts`
- Persistence issue: `app/actions/protocols.ts`, `lib/server/protocols.ts`, auth/session path

## Assumptions and Defaults
- Protocol remains single-user in active editing behavior for now; multi-user concurrency is out of scope.
- Proposal acceptance remains explicit; protocol changes are not auto-applied from model output.
- `protocolStorage.ts` is acceptable as a local durability layer for this domain.
- Last-write-wins is acceptable for non-conflicting field updates; conflicting focused-field overwrites require a visible choice.
- The first implementation slice should optimize for safety and visible correctness over reducing every network request.
- V1 live-sync scope includes the protocol page, ledger consumers, and `useProjectState()` readers; any remaining direct protocol fetchers discovered during implementation must either migrate in-slice or be explicitly deferred back into this plan.

## Active Tasks
- None.

## Recently Completed
- `PLS-008` Added unit/integration coverage for protocol storage envelope compatibility, protocol fetch fallback behavior, and immediate accepted-artifact patch propagation through `ProjectDataContext`.
- `PLS-007` Kept ledger and other `useProjectData()` protocol consumers on the shared live slice so protocol-dependent UI reflects current protocol state without a manual refresh path.
- `PLS-006` Added protocol save-state UI and conflict-safe incoming-update controls on the protocol page.
- `PLS-005` Added immediate client-side patching for accepted `protocol_suggestion` and `criteria_card` artifacts and migrated `useProjectState()` onto shared protocol reads.
- `PLS-004` Reworked `ProtocolProvider` into a page adapter over shared protocol state with local durability and blur-triggered flushes.
- `PLS-003` Added shared live protocol slice ownership to `ProjectDataContext`, including save-state metadata, pending external patch handling, and deployment-scoped live-sync gating.
- `PLS-002` Added a versioned `protocolStorage.ts` envelope with backward-compatible reads so legacy local protocol payloads still load correctly.
- `PLS-001` Defined the live `ProtocolProvider` contract with field-path dirty/focus tracking, pending external patch semantics, and shared save-state exposure.
