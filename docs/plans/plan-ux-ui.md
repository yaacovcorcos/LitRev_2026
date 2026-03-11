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
- Shared scoped-context UI is active:
  - `ProjectCopilot` / `CopilotInputCore` now render typed context receipts and recent-context history chips owned by `docs/plans/plan-context-capture.md`.
  - `PopupChat` shows compact context previews, keeps edit intents advisory-only via `Continue in Copilot`, and draft desktop quick actions are gated behind the dedicated context-toolbar flag rather than leaking into mobile flows.
- Shared composer action hierarchy is active across chat surfaces:
  - `CopilotInputCore` now uses a left-edge `+` extension menu for secondary actions, keeps voice in the right-side primary action cluster beside send, and presents a real microphone-driven waveform/timer state while recording.
  - Shared composer hover language stays token-based and calm, while recording/transcribing states preserve keyboard stop behavior without moving reasoning controls into the composer.
  - Voice recording now uses a dedicated canvas-based amplitude-history visualizer with a frozen transcribing duration, explicit microphone-permission pending UI, short-recording feedback, and slower horizontal travel tuned with capped thin-bar geometry, tighter spacing, and slightly more responsive peaks.
- Shared shell-contained scroll ownership is active for homepage and library workspace surfaces:
  - `AppShell` now provides a viewport-bounded shell parent, `surface-root[data-surface-height="shell"]` acts as the bounded route root, and `surface-scroll-body` remains the sole inner scroll owner.
  - Homepage workspace and library now use separate route-local layout modules on top of that shared contract, and homepage tall-list wheel scrolling is covered by a dedicated smoke test.
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

### Accessibility
- [ ] `CUX-A03` Expand async `aria-live` announcements coverage and consistency across remaining async UI states.

## Recently Completed
- [x] Voice recorder follow-up tuning shipped: the shared composer now shows an explicit microphone-permission pending state, surfaces too-short recordings as a calm dismissible error, preserves the frozen transcribing timer, and slows waveform travel with thinner capped bars, tighter spacing, and slightly easier-to-read peaks.
- [x] Homepage/library shell scroll contract repair shipped: `AppShell` is now viewport-bounded for contained shell pages, homepage workspace scroll is owned by the inner `surface-scroll-body`, library no longer depends on `home.module.css`, and a dedicated homepage wheel-scroll smoke guards tall-card regressions.
- [x] Composer refresh shipped on the shared chat input: secondary actions now live behind a `+` menu, voice moved beside send, hover styling was unified, and live recording shows a real waveform/timer across shared chat surfaces.
- [x] Voice recorder visualizer redesign shipped: shared chat inputs now use a premium amplitude-history canvas visualizer, keep recorded duration frozen during transcription, and no longer push waveform animation through per-frame React state.
- [x] Citation hover diagnostics and telemetry hardening: successful hover loads now retain resolver diagnostics in cache, only terminal completion/failure events persist for canary reporting, and repo-owned compatibility smoke/report scripts ship without changing the bibliography-first card UX.
- [x] Citation hover continuation now allows retryable `PubMed` bibliography-only hovers to backfill count fields after initial render while keeping the card calm and bibliography-first.
- [x] Citation hover enrichment now preserves PubMed bibliography while adding citation counts from NIH iCite/OCC with Crossref fallback and truthful telemetry provenance.
- [x] Unified UI plan governance: this file is now the single canonical UI/UX tracker.
- [x] `CUX-002` Project page shell parity via shared `ProjectPageLayout`.
- [x] `CUX-003` / `CUX-004` ConversationPicker overhaul and app-native rename/menu behavior.
- [x] `CUX-005` / `CUX-006` / `CUX-007` streaming gate, prefill reliability, and failure recovery foundation.

## Cross-Plan Dependencies (Authoritative Elsewhere)
- Guided setup/onboarding UX execution: `docs/plans/plan-guided-setup.md`.
- Draft citation-authoring UX program: tracked under domain-specific draft/protocol plans when activated.
- Chat runtime unification and rollout gates: `docs/plans/plan-chat-unification-v2.md` (`CUX-D01` dependency).
- Context capture and scoped AI entrypoints: `docs/plans/plan-context-capture.md` (owns composer context receipts/chips and cross-surface context reuse).
- Thinking/tool-lane UX deltas: `docs/plans/plan-thinking-v2.md`.
- Performance budgets and enforcement: `docs/plans/plan-speed-performance.md`.
- Reliability blocker baselines and A1 patch targeting: `docs/plans/reliability-a0-brief.md`.

## Validation Gates (for UI behavior changes)
From `next-app/`:
1. `npx tsc --noEmit`
2. `npx vitest run`
3. Mobile/a11y checks when change touches touch targets, drawers, composer, or timeline accessibility behavior.
