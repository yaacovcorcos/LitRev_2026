# Protocol Live Sync Plan

## Purpose
Define the canonical current-state plan for protocol live sync: shared project-scoped protocol client state, local durability, immediate accepted-artifact patching where supported, and conflict-safe protocol UX.

## Status
- Active canonical owner in `docs/plans/README.md`.
- Core implementation is landed for the protocol page, shared project protocol reads, local durability, and project-copilot protocol artifact acceptance.
- This file tracks current architecture, known boundaries, and protocol-specific follow-up only. It is not an implementation diary.

## Goal + Scope

### Intended Outcome
- Protocol behaves as a live project domain rather than a page-local snapshot.
- Manual protocol edits appear immediately, survive refresh safely, and sync to the backend in the background.
- Accepted protocol artifacts update relevant protocol views immediately when the acceptance flow provides a client-safe protocol patch.
- Protocol-dependent consumers use the shared protocol slice where practical instead of waiting for manual refresh.
- Save and conflict states are visible and non-destructive.

### In Scope
- `next-app/contexts/ProjectDataContext.tsx`
- `next-app/contexts/ProtocolContext.tsx`
- `next-app/app/project/[id]/protocol/page.tsx`
- `next-app/lib/protocol-storage.ts`
- `next-app/lib/protocol-live-sync.ts`
- `next-app/lib/project-data-events.ts`
- `next-app/hooks/useProjectState.ts`
- protocol-dependent project surfaces that read protocol through `useProjectData()`
- project-copilot acceptance and undo paths for `protocol_suggestion` and `criteria_card`

### Out of Scope
- Reworking protocol schema or field taxonomy
- Changing the proposal-only contract of `update_protocol`
- Multi-user collaborative editing or CRDT-style merging
- Generalizing this pattern into an app-wide live-state framework
- Cross-surface agent-runtime parity work that is owned by `docs/plans/plan-agentic.md`

## Governance and Ownership

### AGENTS Mapping
- Intent: implementation-governance and current-state ownership for protocol live sync
- Required specialist: `docs/agents/specialists/planning-governance-specialist.md`
- Required Tier 3 retrieval:
  - `docs/plans/README.md`
  - this plan file
  - current protocol runtime files in `next-app/`

### PRD vs Plan Rule
- This is a HOW plan, not a WHAT/WHO/WHY product contract.
- `PRD.md` should remain unchanged unless protocol editing or artifact acceptance behavior changes at the product-contract level.

### Related Plan Ownership
- `docs/plans/plan-agentic.md` owns cross-surface runtime parity across `/ai`, project copilot, and popup.
- `docs/plans/plan-guided-setup.md` owns onboarding-specific protocol editing and setup flow behavior.

## Current Architecture

### Shared Protocol Domain Owner
- `ProjectDataContext` owns the canonical in-browser protocol slice for the active project.
- The slice includes:
  - `data`
  - load `state`
  - `saveState`
  - `saveError`
  - `lastSavedAtMs`
  - `lastSyncedAtMs`
  - `pendingPatch`
- `ProjectDataContext` is responsible for local durability, background sync, incoming protocol patch application, and reconciliation fetches.

### Protocol Page Adapter
- `ProtocolContext` is now a page-facing adapter over the shared protocol slice rather than a separate source of truth.
- Page-level helpers such as field focus/dirty tracking, section editing ergonomics, and save/patch actions are exposed through `ProtocolContext`, but the backing state lives in `ProjectDataContext`.

### Local Durability and Background Sync
- `protocol-storage.ts` persists a versioned protocol envelope in localStorage using the key prefix `litrev_protocol_v2`.
- Manual edits write through to localStorage immediately and queue a background backend save.
- `ProjectDataContext` attempts flushes on `pagehide` and visibility loss so protocol safety does not depend only on the debounce timer.

### Accepted Artifact Propagation
- `protocol_suggestion` and `criteria_card` artifacts are converted into a client-safe `ProtocolArtifactPatch` in `protocol-live-sync.ts`.
- The project-copilot acceptance and undo flows dispatch `dispatchProjectDataChanged(...)` with `protocolPatch` populated.
- When `NEXT_PUBLIC_PROTOCOL_LIVE_SYNC_V1` is enabled and an incoming event includes `protocolPatch`, `ProjectDataContext` applies the patch immediately and still preserves background refetch-based reconciliation.
- If no client patch is provided, `ProjectDataContext` falls back to the domain fetcher for the affected domain.

### Dependent Consumers
- `useProjectState()` reads protocol from `useProjectData()` instead of fetching protocol directly.
- The ledger route reads the shared protocol slice and warms the protocol domain when needed.
- The onboarding route still bootstraps protocol server-side via `getProtocolAction()` and passes `initialProtocol` into the onboarding client; that route is not a live protocol owner.

### Event Transport
- `project-data-events.ts` is the canonical client-side invalidation transport for project data domains.
- Protocol live sync relies on the optional `protocolPatch` field on that event to distinguish immediate protocol visibility updates from refetch-only invalidation.
- The legacy `litrev:ledger-changed` bridge remains in place for ledger listeners while that migration tail exists.

## Current Runtime Contract

### Manual Edit Flow
1. A protocol edit updates the shared slice immediately.
2. The same value is persisted locally through `saveProtocolStorageEntry(...)`.
3. `saveState` moves to `"saving"`.
4. A background save is debounced through `saveProtocolAction(...)`.
5. On success, the shared slice updates timestamps and moves to `"saved"` when no unsynced changes remain.
6. On backend failure, the visible local value stays in place and the slice moves to `"local-only"` or `"error"` depending on the failure mode.

### Accepted Artifact Flow
1. The server applies the accepted or undone artifact.
2. The client dispatches project-data invalidation for the changed domains.
3. If the event includes `protocolPatch` and live sync is enabled, `ProjectDataContext` applies the patch immediately.
4. A background fetch still reconciles protocol against server truth when needed.

### Conflict Contract
- Conflict detection is path-based, not section-based.
- If an incoming protocol patch targets a path that overlaps a dirty or focused local path, the patch is queued as `pendingPatch` instead of overwriting the local draft.
- The protocol page then offers `Apply incoming` or `Keep mine`.
- Applying the queued patch preserves accepted-artifact semantics without forcing a full manual refresh.

### Save and Conflict UX Contract
- The protocol page shows a compact status badge with:
  - `Saving...`
  - `Saved locally`
  - `Save failed`
  - `All changes saved`
- Conflicting incoming accepted patches surface a review banner instead of silently overwriting the current field.

## Storage and State Contract

### Protocol Storage Envelope
- `PROTOCOL_KEY_PREFIX = "litrev_protocol_v2"`
- `PROTOCOL_STORAGE_VERSION = 1`
- Current entry shape:
  - `version: 1`
  - `savedAtMs: number`
  - `lastSyncedAtMs: number`
  - `source: "legacy" | "remote" | "editor" | "artifact" | "migration" | "unknown"`
  - `protocol: ProtocolData`

### Compatibility Rules
- `loadProtocolStorageEntry()` accepts both:
  - the current envelope shape
  - legacy raw protocol payloads
- Legacy raw payloads are normalized into the current envelope with:
  - `savedAtMs: 0`
  - `lastSyncedAtMs: 0`
  - `source: "legacy"`
- `loadProtocolData()` and migration callers continue to work through the normalized entry.

### Save-State Enum
- The canonical protocol save-state values are:
  - `"idle"`
  - `"saving"`
  - `"saved"`
  - `"local-only"`
  - `"error"`

### Rollout Gate
- `NEXT_PUBLIC_PROTOCOL_LIVE_SYNC_V1` remains the deployment-scoped rollback gate.
- Default behavior when unset is enabled.
- With the flag disabled, protocol domain changes fall back to fetch/reseed behavior without immediate client patch application.

## Known Boundaries and Remaining Follow-Up
- `/ai` artifact review currently dispatches protocol-domain invalidation without attaching `protocolPatch`, so protocol views affected by `/ai` acceptance or undo still rely on refetch rather than immediate patching.
  - This is a real cross-surface parity gap.
  - Track it in `docs/plans/plan-agentic.md`, not as a duplicate active task here.
- Multi-user collaborative editing remains out of scope. The current contract is single-user editing with visible conflict handling for incoming accepted artifacts.
- `migrate-local-storage.ts` intentionally still uses `getProtocolAction()` and `saveProtocolAction()` for legacy migration flows; that is not a live-sync regression.
- The legacy ledger event bridge still exists as a compatibility tail while all listeners converge on `project-data-events.ts`.

## Verification and Triage

### Primary Verification Paths
- Edit a protocol field and confirm immediate UI update, local durability, and eventual backend sync.
- Refresh shortly after editing and confirm the local protocol value is preserved safely.
- Accept a `protocol_suggestion` or `criteria_card` from project copilot while the protocol page is open and confirm immediate field visibility.
- Trigger a conflicting accepted update while editing the same field and confirm the patch is queued rather than silently applied.
- Confirm ledger criteria-driven behavior observes the shared protocol slice without manual refresh.

### Current Test Anchors
- `next-app/contexts/__tests__/ProjectDataContext.test.tsx`
- `next-app/lib/__tests__/project-data-events.test.ts`

### Fault Boundaries
- Protocol page UX and status presentation:
  - `next-app/contexts/ProtocolContext.tsx`
  - `next-app/app/project/[id]/protocol/page.tsx`
- Shared state, patch application, local durability, and fetch reconciliation:
  - `next-app/contexts/ProjectDataContext.tsx`
  - `next-app/lib/protocol-storage.ts`
  - `next-app/lib/protocol-live-sync.ts`
  - `next-app/lib/project-data-events.ts`
- Artifact acceptance event emission:
  - `next-app/hooks/useProjectConversationStreamActions.ts`
  - `next-app/app/ai/page.tsx`
- Shared protocol readers:
  - `next-app/hooks/useProjectState.ts`
  - `next-app/app/project/[id]/ledger/page.tsx`

## Active Tasks
- None.

## Recently Completed
- `PLS-008` Added unit and integration coverage for protocol storage compatibility, protocol fetch fallback behavior, and immediate accepted-artifact patch propagation through `ProjectDataContext`.
- `PLS-007` Kept ledger and other `useProjectData()` protocol consumers on the shared live slice so protocol-dependent UI reflects current protocol state without manual refresh.
- `PLS-006` Added protocol save-state UI and conflict-safe incoming-update controls on the protocol page.
- `PLS-005` Added immediate client-side patching for accepted `protocol_suggestion` and `criteria_card` artifacts and migrated `useProjectState()` onto shared protocol reads.
- `PLS-004` Reworked `ProtocolContext` into a page adapter over shared protocol state with local durability and flush-on-exit safeguards.
- `PLS-003` Added shared live protocol slice ownership to `ProjectDataContext`, including save-state metadata, pending external patch handling, and deployment-scoped live-sync gating.
