# UI/UX Execution Plan (Canonical)

## Purpose
Single canonical tracker for UI/UX execution across `next-app` surfaces.

This file consolidates the former dual-plan tracking into `plan-ux-ui.md`.
Domain-specific execution plans remain canonical for their domains:
- Guided setup: `docs/plans/plan-guided-setup.md`
- Chat runtime unification: `docs/plans/plan-chat-unification-v2.md`
- Thinking/tool lane UX deltas: `docs/plans/plan-thinking-v2.md`
- Performance budgets and probes: `docs/plans/plan-speed-performance.md`
- Reliability blockers and thresholds: `docs/plans/reliability-a0-brief.md`

## Current Architecture (Code-Verified)
- Project route pages use `ProjectPageLayout` for shell embedding/standalone parity (`next-app/components/project/ProjectPageLayout.tsx`) and are wired from notes/memory/protocol/ledger/draft/study-detail pages.
- Streaming action safety and suggestion prefill hardening are active:
  - `useStreamingGate()` is exported from `ProjectCopilotContext`.
  - Artifact cards consume `canAct` while streaming.
  - Composer prefill uses command IDs (`prefillCommand`) to avoid same-value race/no-op behavior.
- Shared UI primitives are active:
  - `ConversationPicker` (Radix-based)
  - `ResizableSplitter` (+ a11y tests)
  - `ErrorFallback`
  - shared confirmation dialog path for destructive actions.
- Study-page copilot direct editing is now a first-class UI contract:
  - explicit mutation/fill intents on the study detail page route into the existing study-capable copilot path instead of generic chat
  - direct-safe study edits render as `auto_applied` `study_update` artifacts with no approval controls, refresh through the existing study refetch path, and surface a toast with `Undo`
  - risky or mixed study edits remain review-first through the existing `study_update` approval card flow
  - PDF-derived copilot study edits now use a preview-first non-mutating acquisition step before direct apply vs proposal selection
- Shared scoped-context UI is active:
  - `ProjectCopilot` / `CopilotInputCore` now render typed context receipts and recent-context history chips owned by `docs/plans/plan-context-capture.md`.
  - `PopupChat` shows compact context previews, keeps edit intents advisory-only via `Continue in Copilot`, and draft desktop quick actions are gated behind the dedicated context-toolbar flag rather than leaking into mobile flows.
- Main timeline surfaces now support conservative completed-turn execution-trace compaction:
  - contiguous pre-answer durable trace blocks (`tool_activity`, `checkpoint`, `artifact`) can collapse into a compact reopenable `Process details` summary above the final assistant answer.
  - the latest durable trace suffix now opens immediately inside a live `Process details` container before the assistant answer exists, then transitions into the anchored answer-level trace and auto-collapses once the answer is no longer streaming.
  - checkpoints wrap inside the chat column and use a quieter wrapped narration style inside grouped `Process details` blocks instead of the standalone divider treatment.
  - grouping is renderer-only, skips ambiguous/blocking/error cases, and leaves popup out of scope.
- Shared composer action hierarchy is active across chat surfaces:
  - `CopilotInputCore` now uses a left-edge `+` extension menu for secondary actions, keeps voice in the right-side primary action cluster beside send, and presents a real microphone-driven waveform/timer state while recording.
  - The shared composer now exposes an explicit `Auto` mode option plus sticky manual mode selection across `/ai`, main conversation, and side-panel copilot; manual mode stays visibly locked even with empty input, while `Auto` continues to resolve a concrete mode from the existing router/page context at send time.
  - Shared composer hover language stays token-based and calm, while recording/transcribing states preserve keyboard stop behavior without moving reasoning controls into the composer.
  - Recording mode now exposes two explicit actions in the shared composer cluster: a secondary `Stop dictation` control and a primary `Transcribe and send` control that queues auto-send locally, reuses the normal send path after transcription settles, and keeps requesting-permission/transcribing states non-sendable.
  - Recording-only hover/focus hints for the stop/send controls are handled locally in the composer instead of introducing a new shared tooltip system.
  - The three main chat surfaces now elevate the single live `progress` row into a compact composer-adjacent bar, suppress the matching inline progress row at render time only, and keep receipts/checkpoints/grouped PubMed sequences/errors inline in the timeline.
  - The shared live progress bar now uses a lighter composer-attached cap treatment with calmer motion, integrated count rail semantics, and host-owned seam/width alignment across `/ai`, main conversation, and side-panel copilot.
  - The attached live-progress + queued-follow-up stack now uses an explicit geometry contract: the topmost cap owns the top rounding, intermediate caps flatten into internal sections, upper caps suppress their bottom borders, and the composer owns the lower seam/body shape so the stack reads as one continuous attached surface.
  - The shared composer stack now uses host-owned `composerStackLane` wrappers for gutter, width, and centering across `/ai`, main conversation, and side-panel copilot; the shared composer/progress/queue surfaces no longer own outer horizontal margins.
  - `/ai`, main conversation, and side-panel copilot now support one explicit queued follow-up beneath live progress and above the composer: users can queue the next draft while a run is active, edit/remove it before dispatch, and auto-send it only after the current surface returns to a true idle/sendable state.
  - Voice recording now uses a dedicated canvas-based amplitude-history visualizer with a frozen transcribing duration, explicit microphone-permission pending UI, short-recording feedback, slower horizontal travel tuned with wider live-strip occupancy, capped thin-bar geometry, quieter dot-like baseline marks instead of a fixed center line, slightly wider spacing, slightly more responsive peaks, and a minimalist three-dot transcribing indicator.
- Shared shell-contained scroll ownership is active for homepage and library workspace surfaces:
  - `AppShell` now provides a viewport-bounded shell parent, `surface-root[data-surface-height="shell"]` acts as the bounded route root, and `surface-scroll-body` remains the sole inner scroll owner.
  - Homepage workspace and library now use separate route-local layout modules on top of that shared contract, and homepage tall-list wheel scrolling is covered by a dedicated smoke test.
- Durable refresh/return-to-location behavior is still inconsistent across surfaces:
  - draft already syncs route-meaningful workspace state through URL search params, but several other surfaces still keep exact location in client-only state or local restore helpers
  - project root conversation entry still depends on `project-entry` restore heuristics and localStorage-backed conversation fallback instead of a URL-addressable conversation identity
  - `/ai` still keeps active conversation and attached project scope in route-local client state rather than the URL
  - notes keeps the selected note in client state, memory keeps the active tab in client state, onboarding keeps the current step in client state, and protocol keeps the active section in context state
  - home resume still stores the last project id rather than the last meaningful in-app location URL
- Citation hover previews now use source-aware server metadata assembly:
  - PubMed links keep PubMed-owned bibliography while resolving citation counts from NIH iCite/OCC first and Crossref second when a DOI fallback is available.
  - DOI links remain Crossref-backed, and citation preview telemetry records the actual upstream count source (`icite` or `crossref`).
  - Successful hover loads also carry server-classified resolution diagnostics, and retryable `PubMed` bibliography-only misses can now continue in the background while the card is open so citation counts appear later without mutating bibliography fields or adding noisy follow-up UI.
- Async feedback architecture is active:
  - `useAsyncAction` + `NotificationProvider` + toast live region.
- Token system is active in `styles/tokens.css` and style linting is configured in `next-app/.stylelintrc.cjs` and `next-app/package.json` (`lint:styles`).

## Consolidation Audit (2026-03-05)
Status is derived from current code references, not historical plan text.

| Legacy Item | Canonical Item | Status | Evidence |
|---|---|---|---|
| `CLU-001` | `CUX-002` | completed | `ProjectPageLayout` used by project pages |
| `CLU-002` | `CUX-005`, `CUX-006`, `CUX-007` | completed | `useStreamingGate`, `canAct`, `prefillCommand` |
| `CLU-003a` | `CUX-009` | completed | Notes page migrated and tested |
| `CLU-003b` | `CUX-010` | completed | `SampleReviewCard` separate action buttons + tests |
| `CLU-003c` | `CUX-008`, `CUX-011` | completed | `ResizableSplitter` + a11y tests |
| `CLU-004` | `CUX-003`, `CUX-004` | completed | `ConversationPicker` + tests |
| `CLU-005` | `CUX-013`, `CUX-014` | completed | `useAsyncAction`, `NotificationProvider` |
| `CLU-006b` | `CUX-036` | completed | hydration placeholder strategy in composer |
| `CLU-006c` | `CUX-015` | completed | shared `ErrorFallback` route wiring |
| `CLU-006d` | `CUX-037` | completed | demo guidance dedup behavior shipped |
| `CLU-007` | `CUX-016`, `CUX-A01`, `CUX-A02` | completed | token + stylelint + a11y form/icon baselines |
| `CLU-008` | `CUX-035` | completed | decomposition work tracked as done in shipped architecture |

## Legacy ID Mapping (Permanent)
Use this mapping for old PRs/comments referencing CLU IDs.

| CLU ID | Canonical CUX ID(s) |
|---|---|
| `CLU-001` | `CUX-002` |
| `CLU-002` | `CUX-005`, `CUX-006`, `CUX-007` |
| `CLU-003a` | `CUX-009` |
| `CLU-003b` | `CUX-010` |
| `CLU-003c` | `CUX-008`, `CUX-011` |
| `CLU-004` | `CUX-003`, `CUX-004` |
| `CLU-005` | `CUX-013`, `CUX-014`, `CUX-A03` |
| `CLU-006a` | `CUX-001` |
| `CLU-006b` | `CUX-036` |
| `CLU-006c` | `CUX-015` |
| `CLU-006d` | `CUX-037` |
| `CLU-007` | `CUX-016`, `CUX-A01`, `CUX-A02` |
| `CLU-008` | `CUX-035` |

## Active Tasks
### Core UI Reliability and Consistency
- [ ] `CUX-012` Finish overlay standardization on shared primitives for remaining custom overlays/dropdowns.
- [ ] `CUX-017` Verify/lock copilot scrolling isolation behavior across all project surfaces under current shell contracts.

### Copilot Product UX (UI Layer)
- [ ] `CUX-027` Add explicit tool receipt blocks per assistant turn.
- [ ] `CUX-028` Add inline approve/apply/undo artifact controls with safe confirmations.
- [ ] `CUX-029` Add autonomy contract badge in composer.
- [ ] `CUX-031` Add study details side panel from ledger links.
- [ ] `CUX-032` Add import-study duplicate warning UX.

### Durable Navigation and Refresh Restoration
- [ ] `CUX-038` Establish the URL-first durable navigation contract.
  - Problem: refresh, back/forward, and shared-link behavior are inconsistent because several surfaces still treat client state or localStorage as the authority for exact location.
  - Rules to freeze in implementation:
    - if refresh must return the user to the same place, that state belongs in the URL
    - primary content selection should use route segments
    - auxiliary UI state should use query params
    - local/session storage should keep soft UI preferences only and must never override an explicit URL
    - server-side resume should be fallback entry behavior only, not the primary refresh contract
    - popup remains ephemeral by default unless the user explicitly promotes it into a durable conversation flow
  - Exit criteria:
    - one cross-surface navigation contract exists for chat and non-chat pages
    - route identity no longer depends on heuristic local restore for exact refresh behavior

- [ ] `CUX-039` Make chat surfaces refresh-safe with URL-addressable conversation identity.
  - Scope:
    - project main conversation should move to a dedicated conversation route such as `/project/[id]/conversation/[conversationId]`
    - `/project/[id]` should stop meaning both overview and conversation based on local restore state
    - side-panel copilot should bind durable conversation identity through query params on workspace routes, while keeping width/collapse state local
    - `/ai` should bind active conversation and optional attached project scope through URL state
  - Guardrails:
    - preserve the shared runtime contract owned by `plan-chat-unification-v2.md`
    - do not let local restore override explicit deep links
  - Exit criteria:
    - refresh returns users to the same chat conversation on project and `/ai` surfaces
    - back/forward navigation is deterministic across main conversation and side copilot flows

- [ ] `CUX-040` Make project workspace surfaces refresh-safe where route state is user-meaningful.
  - Scope:
    - notes should make the selected note URL-addressable
    - memory should move active tab state into query params
    - protocol should move active section focus into query params
    - ledger should keep study detail route identity as canonical and only promote durable list state that materially affects user return position, such as core filters or view mode
  - Rules:
    - do not overfit transient selection or bulk-action state into the URL unless it is part of the actual user task
    - route segments win for primary content, query params for tabs/filters/secondary state
  - Exit criteria:
    - refresh restores the same meaningful sub-surface for notes, memory, and protocol
    - ledger list preserves only the durable state that genuinely helps users resume work

- [ ] `CUX-041` Restore onboarding and home resume through durable location, not partial heuristics.
  - Scope:
    - onboarding should bind the current step to the URL and reconcile it with persisted server progress
    - home should resume to the last meaningful in-app URL rather than only the last project id
  - Rules:
    - explicit deep links always beat home/server fallback resume
    - server-stored progress may refine or validate resume, but must not replace explicit route state
  - Exit criteria:
    - onboarding refresh returns to the same meaningful step or the correct persisted completion boundary
    - home resume reopens the correct destination URL across project, chat, and workspace surfaces

- [ ] `CUX-042` Demote heuristic restore helpers to fallback-only behavior after URL adoption.
  - Scope:
    - reduce `project-entry` local restore from “exact location authority” to fallback entry memory only
    - audit last-visited and localStorage restore keys so they no longer fight route state
    - preserve multi-tab sanity by preferring explicit URL over shared mutable local restore data
  - Exit criteria:
    - no major surface still depends on TTL-based local restore to reopen an exact location after refresh
    - remaining local restore keys behave as convenience fallback only

### Accessibility
- [ ] `CUX-A03` Expand async `aria-live` announcements coverage and consistency across remaining async UI states.

## Recently Completed
- [x] Study-page copilot direct edit V1 shipped: explicit study-detail mutation intents now route into the study-capable execution path, safe field edits can auto-apply with toast + undo and read-only applied cards, risky or mixed study edits remain proposal-based, and the study page continues to refresh through its existing refetch/event path without a new optimistic store.
- [x] Shared composer mode control shipped: `/ai`, main conversation, and side-panel copilot now expose an explicit `Auto` mode plus sticky manual mode selection on the shared composer, keep manual lock visibly discoverable even with empty input, and resolve composer-originated sends/queues against the current request text instead of a stale debounced preview.
- [x] Shared queued follow-up shipped: `/ai`, main conversation, and side-panel copilot now let users queue one text-only next message while a run is active, render it as an attached composer cap beneath live progress, keep project surfaces in sync through shared context, and auto-dispatch only after the current run reaches a truly sendable idle state.
- [x] Shared live progress bar redesign shipped: the composer-adjacent progress surface is now visually attached to the composer, uses calmer activity/motion treatment, wraps long messages safely, exposes an integrated semantic progress rail when count data exists, and preserves the existing relocation/suppression contract across `/ai`, main conversation, and side-panel copilot.
- [x] Live `Process details` trace groups now appear from the start of durable process activity, stay open while the run is active or the answer is still streaming, then collapse automatically after the answer completes; grouped checkpoints now wrap correctly and render as quiet narration blocks inside the trace.
- [x] Completed-turn execution trace compaction shipped on the main timeline surfaces: eligible pre-answer tool/checkpoint/artifact blocks now collapse into a compact reopenable `Process details` summary above the final assistant answer while ambiguous, blocked, and visible failure cases stay inline.
- [x] Shared live progress relocation shipped: `/ai`, main project conversation, and embedded project copilot now show one composer-adjacent active progress bar, suppress only the matching inline progress row by local id at render time, and keep receipts/checkpoints/errors/grouped PubMed cards in the timeline.
- [x] Voice recorder follow-up tuning shipped: the shared composer now shows an explicit microphone-permission pending state, surfaces too-short recordings as a calm dismissible error, preserves the frozen transcribing timer, and slows waveform travel with thinner capped bars, tighter spacing, and slightly easier-to-read peaks.
- [x] Voice recording action UX shipped: while recording, the shared composer now exposes `Stop dictation` and `Transcribe and send`, shows local hover/focus hints for both controls, keeps requesting-permission/transcribing states non-sendable, and can auto-send through the normal composer path once transcription settles.
- [x] Homepage/library shell scroll contract repair shipped: `AppShell` is now viewport-bounded for contained shell pages, homepage workspace scroll is owned by the inner `surface-scroll-body`, library no longer depends on `home.module.css`, and a dedicated homepage wheel-scroll smoke guards tall-card regressions.
- [x] Composer refresh shipped on the shared chat input: secondary actions now live behind a `+` menu, voice moved beside send, hover styling was unified, and live recording shows a real waveform/timer across shared chat surfaces.

## Cross-Plan Dependencies (Authoritative Elsewhere)
- Guided setup/onboarding UX execution: `docs/plans/plan-guided-setup.md`.
- Draft manuscript UX, citation-authoring, review flows, and export-grade drafting architecture: `docs/plans/plan-drafting-experience.md`.
- Chat runtime unification and rollout gates: `docs/plans/plan-chat-unification-v2.md` (`CUX-D01` dependency).
- Durable navigation work in this file owns the cross-surface URL/refresh contract; `plan-chat-unification-v2.md` remains the dependency for shared chat runtime semantics rather than route identity ownership.
- Context capture and scoped AI entrypoints: `docs/plans/plan-context-capture.md` (owns composer context receipts/chips and cross-surface context reuse).
- Thinking/tool-lane UX deltas: `docs/plans/plan-thinking-v2.md`.
- Performance budgets and enforcement: `docs/plans/plan-speed-performance.md`.
- Reliability blocker baselines and A1 patch targeting: `docs/plans/reliability-a0-brief.md`.

## Validation Gates (for UI behavior changes)
From `next-app/`:
1. `npx tsc --noEmit`
2. `npx vitest run`
3. Mobile/a11y checks when change touches touch targets, drawers, composer, or timeline accessibility behavior.
