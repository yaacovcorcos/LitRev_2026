# Context Capture Plan

## Purpose
Add a first-party semantic context capture layer across LitRev so users can point at the exact protocol field, study, study set, draft selection, note, or artifact they mean and launch scoped AI actions without restating context in prose.

This plan is inspired by patterns observed in [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab), but LitRev will borrow the interaction model and a few architectural ideas rather than importing the coding-tool implementation. See `OPEN_SOURCE_REFERENCES.md` for the canonical external-reference index.

## Overall Goal
The intended end state is a shared context-capture system that works across project surfaces and feeds both popup chat and the main copilot with typed, inspectable, reusable context bundles. Users should be able to capture context locally, see what will be sent to the model, remove or reuse captured context, and invoke surface-appropriate AI actions without relying on ad hoc per-page buttons or prompt stuffing.

## Goal + Scope
### Problem Statement
- Current scoped AI entry points are useful but fragmented.
- Popup context is popup-specific and limited to four shapes.
- Surface integrations are hand-written and coarse-grained.
- Main copilot has no typed context-receipt model; it only has a plain `contextDisplay` string plus prefilled text.
- LitRev lacks a reusable way to say “use exactly this field / this study / these three studies / this paragraph” across surfaces.

### Intended Outcome
- One shared semantic context model for targeted AI interactions.
- Reusable action definitions so surfaces expose the same high-value actions consistently.
- Visible context receipts/history so the user can inspect and reuse context instead of trusting invisible prompt assembly.
- A rollout path that starts with explicit, reversible affordances and only later adds richer desktop selection UI.

### In Scope
- Shared typed context targets and action contracts.
- Popup + project copilot integration for captured context.
- Existing surface migration: protocol, draft, ledger.
- New high-leverage capture surfaces: ledger multi-select, protocol criterion-level capture, notes.
- Context receipts, recent-context history, and telemetry.
- Optional desktop-only inline/anchored selection affordances behind flags.

### Out of Scope
- Arbitrary DOM overlay instrumentation.
- React source-file / component-stack inspection.
- External coding-agent relay, MCP, or editor-open workflows.
- A generic browser extension.
- Replacing the existing chat runtime or popup engine wholesale.
- Mobile hover-first interactions.

## Governance and Repo Grounding
### Governance Decision
- This is implementation planning only. `PRD.md` should not change.
- Intent maps to the planning/governance route in `AGENTS.md`.
- This plan will become the canonical tracker for context-capture implementation. Generic UI plans should reference it rather than duplicate its tasks.

### Tier 2 / Tier 3 Retrieval
- Required specialist for this planning task: `docs/agents/specialists/planning-governance-specialist.md`
- Required planning docs read for this task:
  - `docs/plans/README.md`
  - `docs/agents/universal-planning-meta-prompt.md`
  - `docs/architecture/frontend-quality-bar.md`
  - `docs/runbooks/frontend-review-loop.md`
  - `docs/plans/plan-chat-unification-v2.md`
  - `docs/plans/mobile-plan.md`

### Current-State Evidence
- Popup-scoped AI currently accepts only `study`, `criterion`, `draft_selection`, and `protocol_section` contexts in `next-app/types/popup-chat.ts`.
- Popup prompt assembly and scope injection are popup-specific in `next-app/lib/server/ai/popup-context.ts`.
- Popup tool allowlists and protocol-field restrictions are popup-specific in `next-app/lib/server/ai/popup-tool-contract.ts`.
- Protocol uses explicit section-level `Ask AI` buttons in `next-app/app/project/[id]/protocol/ProtocolSections.tsx`.
- Draft already has one useful context-aware path: selected text into popup in `next-app/app/project/[id]/draft/page.tsx`.
- Ledger already has reusable multi-select state in `next-app/app/project/[id]/ledger/page.tsx` and `next-app/app/project/[id]/ledger/useLedgerActions.ts`, but AI actions currently operate only at single-study row level.
- Notes currently have no contextual AI entry path in `next-app/app/project/[id]/notes/page.tsx`.
- Main copilot still renders a plain subhead string rather than typed context receipts in `next-app/components/ProjectCopilot.tsx`.

### React Grab Pattern Extraction
Steal:
- Action/registry model from `packages/react-grab/src/core/plugin-registry.ts` in [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab/tree/main/packages/react-grab/src/core)
- Typed action/session contracts from `packages/react-grab/src/types.ts` in [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/types.ts)
- Multi-target selection/history concepts from `packages/react-grab/src/utils/get-elements-in-drag.ts` and `packages/react-grab/src/utils/history-storage.ts` in [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab/tree/main/packages/react-grab/src/utils)
- Anchored follow-up/session model from `packages/react-grab/src/core/agent/manager.ts` in [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/core/agent/manager.ts)

Adapt, not copy:
- Multi-selection heuristics
- Recent-context history
- Anchored action affordances

Reject:
- DOM-to-source/component symbolication in `packages/react-grab/src/core/context.ts` from [`aidenybai/react-grab`](https://github.com/aidenybai/react-grab/blob/main/packages/react-grab/src/core/context.ts)
- File-opening/editor integration
- MCP/relay/provider bridge packages
- Overlay freeze/pointer management complexity
- Solid implementation and arbitrary-website assumptions

## Documentation Impact and Updates
- This task updates:
  - `docs/plans/plan-context-capture.md` (new canonical plan)
  - `docs/plans/README.md` (index entry)
  - `docs/plans/plan-ux-ui.md` (remove duplicated ownership of composer context chips and keep only active UI-plan dependency on this plan where needed)
- During implementation, documentation updates must be included in the same PRs as behavior changes:
  - `docs/plans/plan-ux-ui.md` when active UI execution tracking for context-capture slices changes
  - `docs/architecture/frontend-quality-bar.md` when context-capture work changes durable frontend doctrine or anti-pattern guidance
  - `docs/runbooks/frontend-review-loop.md` when context-capture work changes the shared frontend review workflow
  - `docs/plans/mobile-plan.md` if mobile interaction rules change
  - `docs/plans/plan-chat-unification-v2.md` only if context transport/runtime contracts change
- `PRD.md` remains unchanged unless context capture changes the product contract rather than the implementation.

## Minimal-Sufficient Strategy
Build semantic context capture on top of LitRev’s domain objects, not on top of generic DOM discovery.

Why this is the smallest reversible approach:
- It reuses existing popup and copilot pathways instead of inventing a new runtime.
- It starts from already-typed project entities and page state.
- It can migrate existing coarse entry points first, before adding any new UI complexity.
- It allows desktop enhancement later without making mobile or popup behavior depend on hover/overlay mechanics.

## Reuse vs New
### Reuse
- `PopupChatContext` launching pattern and popup shell.
- Existing prompt helpers such as `buildStudyContext`, `buildLocationContext`, and `sanitizeContext`.
- Existing popup tool-guard pattern for protocol-scoped editing.
- Existing ledger multi-select state.
- Existing draft selected-text extraction.
- Existing copilot prefill path and pending-user-input infrastructure.

### New
- Shared `ContextCaptureTarget` contract, independent of popup.
- Shared `ContextCaptureAction` catalog and target-to-action mapping.
- Shared context formatter/adapters used by popup and main copilot.
- Composer receipts/chips and recent-context history.
- Optional desktop anchored context-action affordance.
- Telemetry for context capture open/send/reuse/failure flows.

## Decision-Complete Implementation Design
### 1. Core Contracts
Add a new shared context-capture domain:
- `next-app/types/context-capture.ts`
- `next-app/lib/context-capture/actions.ts`
- `next-app/lib/context-capture/format.ts`
- `next-app/lib/context-capture/history.ts`

Introduce typed targets:
- `protocol_section`
- `protocol_field`
- `protocol_criterion`
- `draft_selection`
- `study`
- `study_set`
- `note`
- `note_selection`
- `artifact`
- `assistant_message`

Each target must carry:
- `projectId`
- stable entity references (`studyId`, `noteId`, `artifactId`, etc.) where applicable
- human-readable label/icon/preview
- structured context payload, not just raw prompt text
- optional scope hints (`sectionKey`, `criterionType`, cited study IDs, allowed protocol fields)

### 2. Popup and Copilot Adapters
Do not expand popup-specific types forever, but make the v1 transport boundary explicit.

V1 decision:
- Keep `PopupChatContext` as a compatibility transport, not the shared source of truth.
- Popup supports only the popup-safe typed subset in v1:
  - `study`
  - `draft_selection`
  - `protocol_section`
  - `protocol_criterion` via the existing `criterion` popup shape
- `study_set`, `note`, `note_selection`, `artifact`, `assistant_message`, and any `protocol_field` target that cannot map to current popup scope rules launch to the main copilot first.
- Do not flatten unsupported target kinds into opaque prompt text just to force them through popup.

Add adapter functions:
- `contextTargetToPopupContext()` returning `PopupChatContext | null`
- `contextTargetsToPromptBlock()`
- `contextTargetsToComposerReceipts()`

Migration rule:
- Create `ContextCaptureTarget` first at the surface layer.
- If `contextTargetToPopupContext()` returns `null`, route the action to main copilot instead of degrading the target shape.

Result:
- Popup and main copilot share the same semantic target model.
- Popup remains lightweight and scope-safe.
- Richer bundles land in main copilot until a future popup transport upgrade is justified.
- Future shared chat-runtime migration is easier because the semantic contract is no longer popup-owned.

### 3. Server Formatting and Scope Rules
Add a new server formatter such as:
- `next-app/lib/server/ai/context-capture.ts`

Responsibilities:
- Convert one or more context targets into a compact, bounded prompt block.
- Reuse existing prompt helpers for studies and location context.
- Enforce truncation and token budgets per target type.
- Prefer structured bundles over dumping raw text.

Rules:
- One selected study can still populate `studyId` in chat options when appropriate.
- `study_set` must remain a bundle, not a fake single-study scope.
- `study_set` is capped at 6 studies in v1.
- If the user selects more than 6 studies, batch AI actions should be disabled with explicit UI copy telling the user to narrow the selection.
- If unexpected input still produces a `study_set` above the cap, the formatter should keep the first 6 study IDs in stable selection order and append an explicit omission note.
- Protocol-scoped targets may optionally attach allowlisted field hints.
- Read-only capture should not silently widen mutation permissions.

Popup-specific tool restrictions stay popup-only at first. If later the main copilot supports action-specific scope guards, share the guard logic rather than duplicating popup-specific branches.

### 4. Shared Action Model
Borrow the react-grab plugin/action idea, but implement the smallest static version first.

Create a shared action catalog:
- `ask_ai`
- `send_to_copilot`
- `compare_selected_studies`
- `summarize_for_notes`
- `refine_protocol_field`
- `check_claim_support`
- `rewrite_selection`

Each action definition should declare:
- supported target kinds
- launch mode (`popup`, `prefill`, `immediate_send`)
- optional tool/scope hints
- label, icon, telemetry name

Do not build a dynamic plugin system yet. Use a typed registry object first. If multiple modules need to extend it later, then promote it to a true registration API.

### 5. Surface Integration Plan
#### Protocol
Current state is section-level only.

Steal and adapt:
- exact-field capture
- criterion-level capture
- anchored follow-up near the active field on desktop

Implementation:
- Replace raw `openPopupChat()` payload creation with shared target builders.
- Add criterion-row actions for inclusion/exclusion items.
- Keep section-level Ask AI as the broad fallback.

#### Draft
Current state already has selected-text capture.

Steal and adapt:
- richer selection receipts
- anchored follow-up bubble
- reuse history for “ask about last selection again”

Implementation:
- Expand draft selection payload to include:
  - selected text
  - surrounding text window
  - active section metadata
  - cited study IDs when detectable
- Support actions:
  - rewrite
  - check support
  - summarize
  - send to copilot

#### Ledger
Current state has single-study popup and existing multi-select state.

Steal and adapt:
- multi-target capture
- selection history
- batch action affordances

Implementation:
- Add `study_set` target builder from `validSelectedIds`.
- Treat 2-6 selected studies as the only valid `study_set` range in v1.
- Above 6 selected studies, keep selection mode but suppress compare/synthesize actions until the set is narrowed.
- Surface compare/synthesize/screening rationale actions when selection mode has active items.
- Preserve the single-study Ask AI action for low-friction use.
- Do not add lasso/drag selection in v1; reuse the existing select mode first.

#### Notes
Current state has no contextual AI entry point.

Implementation:
- Add note-level capture first.
- Add note-text selection later if editor APIs are stable enough.
- Support sending note content into main copilot with visible receipts.
- Defer popup note support until popup transport is intentionally broadened.

#### Artifacts and Timeline
Later slice:
- allow artifact/message rows to become context targets
- “Use this as context” should create receipts rather than forcing the user to copy text manually

### 6. Receipts, Chips, and History
This is the most directly reusable pattern from react-grab.

LitRev should show:
- active context receipts above the composer
- remove/reorder controls where relevant
- recent context history for fast reuse

History design:
- store recent targets in `sessionStorage`, keyed by `projectId` and user/session namespace when available
- treat history as ephemeral: 60-minute TTL from last write, then drop entries on read
- cap at 8 recent entries
- store domain references and bounded previews, never raw DOM selectors or full source text
- persist only minimal previews by kind:
  - `study`: label/citation only
  - `study_set`: count plus up to 3 study labels
  - `protocol_section`, `protocol_field`, `protocol_criterion`: label plus section metadata, never full protocol body
  - `draft_selection`: excerpt only, max 120 characters
  - `note`, `note_selection`, `artifact`, `assistant_message`: label plus excerpt only, max 80 characters
- clear active attached receipts on project switch
- clear persisted history on explicit sign-out/session-loss path when available; if that hook is not reliable yet, keep persistence disabled rather than storing longer-lived sensitive text
- clear invalid/deleted references gracefully

Receipt design:
- compact chips in composer
- expanded preview in popup header/body when needed
- no invisible context injection

### 7. Desktop vs Mobile Interaction Model
Hard rule:
- Desktop can add anchored/contextual affordances later.
- Mobile must rely on explicit buttons, drawers, sheets, or menus.

Do not port react-grab’s hover-first model to mobile.

Initial mobile-safe defaults:
- explicit action buttons only
- no floating hover toolbar
- popup/sheet behavior reuses existing mobile popup rules

### 8. Telemetry and Operability
Add lightweight product telemetry:
- `context_capture_opened`
- `context_capture_sent`
- `context_capture_reused`
- `context_capture_removed`
- `context_capture_scope_mismatch`
- `context_capture_action_failed`

These events should include:
- surface
- target kinds
- action id
- project scope
- whether launch target was popup or main copilot

### 9. Feature Flags
Use staged deployment rollout:
- `NEXT_PUBLIC_CONTEXT_CAPTURE_V1`
- `NEXT_PUBLIC_CONTEXT_HISTORY_V1`
- `NEXT_PUBLIC_CONTEXT_TOOLBAR_V1`

Semantics:
- These flags are deployment-scoped env gates, consistent with current repo patterns such as `next-app/lib/agent/feature-flags.ts`.
- Rollout is per deployment, not per user cohort.
- Rollback is redeploy-based, not instant runtime canary control.
- If true per-user canaries become necessary later, add a separate server-evaluated rollout mechanism rather than overloading the env-flag plan.

Rollout order:
1. Foundation + migrated existing entry points
2. Ledger multi-select and notes entry points
3. Receipts/history
4. Desktop anchored toolbar

## Long-Term Quality and Scalability
### Maintainability
- One target model prevents continued popup-specific union sprawl.
- One action catalog prevents copy-pasted per-surface AI button logic.

### Scalability
- Domain-typed targets scale better than raw strings as more surfaces gain contextual AI.
- The model supports future artifact/message/memory capture without new transport patterns.

### Reliability
- Explicit receipts reduce hidden-context confusion.
- Reusing stable entity IDs is more robust than selector-based reacquisition.
- Existing coarse entry points remain as fallbacks during rollout.

### Operability
- Feature flags enable deployment-scoped rollout and redeploy-based rollback.
- Telemetry makes scope mismatches and dead actions observable.

### Security / Compliance
- Context formatting must preserve project scoping and avoid cross-project lookups.
- Mutation-capable actions must keep explicit scope guards, especially for protocol edits.
- No new external providers or data-sharing surfaces are introduced.

### Tradeoffs
- This plan deliberately avoids generic DOM capture, which means fewer “magic” affordances at first.
- The result is less flashy than react-grab, but much safer and more maintainable for LitRev’s product domain.

## Execution Slicing
### Slice 1 — Foundation Contract
Scope:
- Add `ContextCaptureTarget` types
- Add formatter/adapters
- Add action catalog
- Add flags
- Lock popup-safe subset and main-copilot fallback behavior

Touched paths:
- `next-app/types/context-capture.ts`
- `next-app/lib/context-capture/**`
- `next-app/lib/server/ai/context-capture.ts`
- `next-app/types/popup-chat.ts`

Blast radius:
- low to medium
- mostly additive

Rollback:
- redeploy with flags off, keep old popup payload creators

### Slice 2 — Migrate Existing Entry Points
Scope:
- Protocol section buttons
- Draft selected-text action
- Single-study ledger Ask AI

Touched paths:
- `next-app/app/project/[id]/protocol/ProtocolSections.tsx`
- `next-app/app/project/[id]/draft/page.tsx`
- `next-app/app/project/[id]/ledger/StudyRow.tsx`
- popup adapters

Blast radius:
- medium
- visible but reversible

Rollback:
- revert call-site adapters to existing direct popup context payloads

### Slice 3 — New High-Leverage Targets
Scope:
- Protocol criterion-level capture
- Ledger `study_set` from existing selection mode
- Note-level capture

Touched paths:
- `next-app/app/project/[id]/protocol/**`
- `next-app/app/project/[id]/ledger/**`
- `next-app/app/project/[id]/notes/page.tsx`

Blast radius:
- medium
- new UX on important surfaces

Rollback:
- keep context target infrastructure but hide new actions by flag

### Slice 4 — Receipts and Recent History
Scope:
- Composer chips
- Popup receipts
- Recent-context reuse

Touched paths:
- `next-app/components/ProjectCopilot.tsx`
- `next-app/components/copilot/CopilotInput.tsx`
- `next-app/components/copilot/CopilotInputCore.tsx`
- `next-app/components/PopupChat.tsx`
- `next-app/contexts/ProjectCopilotContext.tsx`

Blast radius:
- medium to high
- shared UI surface work

Rollback:
- disable receipts/history flags while keeping target capture underneath

### Slice 5 — Desktop Anchored Affordances
Scope:
- anchored context-action bubble for draft/protocol desktop use

Blast radius:
- high UI complexity
- desktop-only at first

Rollback:
- disable `NEXT_PUBLIC_CONTEXT_TOOLBAR_V1`

### Alternatives Considered
Chosen:
- semantic target model layered on existing LitRev flows

Rejected:
- import/use `react-grab` directly
- build arbitrary DOM hover overlay first
- continue adding ad hoc popup unions per page
- ship lasso/drag selection before reusing existing multi-select state

## Current Architecture
- Shared context-capture contracts now live in `next-app/types/context-capture.ts` and `next-app/lib/context-capture/**`, including typed targets, target builders, history rules, feature flags, action registry, and telemetry helpers.
- The chat stream route now accepts `options.contextTargets`, validates that every target matches the active `projectId`, and formats them server-side through `next-app/lib/server/ai/context-capture.ts` as bounded reference text that is explicitly treated as untrusted input before calling the model.
- Popup remains intentionally limited to the popup-safe subset via `contextTargetToPopupContext()`, while richer targets fall through to the main copilot with visible receipts instead of being flattened into opaque prompt text.
- Project copilot state now carries attached context targets, bounded session-history reuse, and prefill commands; typed context attachments are restored in conversation/timeline hydration rather than being treated as file attachments.
- Protocol, draft, ledger, and notes now emit shared targets: protocol sections/fields/criteria, draft selections, single-study and multi-study ledger bundles, and note-level capture. `study_set` is capped at 6 studies in UI + formatter logic.
- Desktop-only draft quick actions are gated by `NEXT_PUBLIC_CONTEXT_TOOLBAR_V1` and suppressed on mobile/coarse-pointer viewports. Popup headers now show compact context previews, and successful sign-out clears stored context history across project scopes.

## Active Tasks
- None currently. Add new items only if rollout feedback justifies broader popup transport, artifact/message entrypoints, or richer desktop affordances.

## Risk + Rollback
### Primary Failure Modes
- Wrong or stale context attached to the model.
- Prompt bloat from oversized context bundles.
- Confusing overlap between popup context and main copilot context.
- Mobile regressions if desktop affordances leak into narrow viewports.
- Silent mutation scope widening for protocol targets.

### Detection Signals
- Context receipts do not match the user’s selected entity.
- Popup header label mismatches underlying target.
- Telemetry shows `context_capture_scope_mismatch`.
- Protocol edits attempt disallowed fields from scoped actions.
- Mobile tap/retry behavior regresses after context UI additions.

### Rollback Path
- Redeploy with `NEXT_PUBLIC_CONTEXT_CAPTURE_V1=0` to revert to legacy entry points.
- Redeploy with `NEXT_PUBLIC_CONTEXT_HISTORY_V1=0` to remove reuse/history UI only.
- Redeploy with `NEXT_PUBLIC_CONTEXT_TOOLBAR_V1=0` to remove desktop anchored affordances only.
- Keep legacy popup context creators available until Slice 4 burn-in is stable.

## Verification Strategy
### Test Matrix
Happy path:
- protocol section/criterion -> popup ask
- protocol field -> main copilot action
- draft selection -> popup/copilot
- single study -> popup
- study set -> compare/synthesize action
- note -> send to copilot with receipts

Edge cases:
- deleted study/note in recent history
- empty or tiny draft selection
- oversized note/selection truncation
- oversized `study_set` blocked or trimmed deterministically
- history TTL expiry and sign-out clearing
- criterion capture when criterion text changes during interaction
- context removal before send

Regression scenarios:
- legacy popup flows still work with flags off
- ask-user continuation still resumes correctly when context targets are attached
- main copilot retry path preserves selected model and attached context receipts

### Test Layers
- unit:
  - target builders
  - formatter/truncation rules
  - action filtering
  - popup adapter
  - history serialization
- integration/component:
  - popup header/receipt rendering
  - composer chips/remove behavior
  - ledger multi-select action availability
  - protocol criterion action menus
- e2e:
  - protocol, draft, ledger, notes flows
  - mobile popup and explicit action behavior

### Acceptance Signals
- Users can launch scoped AI actions without rewriting context in free text.
- Visible receipts always match selected entities.
- Existing fallback buttons remain usable during rollout.
- No cross-surface runtime drift or duplicated transport logic emerges.

## Validation Mapping
When implementation begins, from `next-app/`:
1. `npx tsc --noEmit`
   - catches contract drift across new target/action types and shared adapters
2. `npx vitest run`
   - catches formatter, reducer, adapter, and component regressions
3. `npm run test:e2e:mobile` when mobile popup/composer behavior changes
   - catches interaction-model regressions not visible in unit tests
4. manual desktop + mobile checks on protocol, draft, ledger, notes, popup
   - catches affordance discoverability and context mismatch issues

## Debuggability + Triage
### Failure Surface Signals
- UI:
  - wrong receipt label
  - missing receipt
  - disabled/incorrect action menu
  - popup showing the wrong context title
- logs/telemetry:
  - `context_capture_scope_mismatch`
  - `context_capture_action_failed`
  - existing stream failure telemetry on popup/copilot paths

### Fast Reproduction Path
1. Select a known study or criterion.
2. Launch popup and verify receipt/header.
3. Remove and re-add context.
4. Send to popup and to main copilot.
5. Repeat with flags off to compare legacy behavior.

### Probable Fault Boundaries
- wrong preview or label:
  - target builders / adapter layer
- wrong prompt body:
  - server formatter
- wrong available actions:
  - action catalog / target matching
- wrong scope restrictions:
  - popup tool guard or future shared scope guard
- missing chips/history:
  - client state persistence layer

### First Owner and Escalation Boundary
- Primary owner during implementation: UI/chat integration owners
- Escalate to agent runtime owners only if chat transport or shared reducer contracts must change

## Assumptions / Defaults
- Start with explicit visible affordances; no keyboard-first interaction model in v1.
- Reuse existing ledger select mode before inventing drag/lasso selection.
- Keep popup as the fast scoped interaction shell for popup-safe targets only; main copilot handles broader bundles and richer follow-up.
- Notes get note-level capture before note-text selection.
- Rollout is deployment-scoped via env flags; true runtime canaries are not part of v1.
- Memory/artifact/message capture is valuable but later than protocol/draft/ledger/notes.
- `PRD.md` remains unchanged because this is a HOW change, not a WHAT/WHY change.

## Recently Completed
- [x] `CTX-006` Shipped desktop-only draft context quick actions behind `NEXT_PUBLIC_CONTEXT_TOOLBAR_V1`, with mobile/coarse-pointer suppression and shared action-registry wiring.
- [x] `CTX-005` Added context-capture telemetry events and a validated telemetry ingestion route, and verified fallback behavior when popup-safe routing is unavailable.
- [x] `CTX-004` Added composer receipts, popup previews, bounded session-history reuse, and typed conversation/timeline attachment hydration for captured context.
- [x] `CTX-003` Added protocol criterion capture, ledger multi-study capture with a hard cap of 6, and note-level capture into the main copilot.
- [x] `CTX-002` Migrated protocol section actions, draft selection capture, and single-study ledger entry points onto shared target builders and adapters.
- [x] `CTX-001` Added the shared context-capture domain, popup-safe adapter boundary, feature flags, and server-side context formatting contract.
