# Codex UI/UX Execution Plan (Consolidated)

## Purpose
This is the canonical standalone UI/UX execution plan.
It consolidates all open UI/UX work into one prioritized sequence so implementation can proceed with fewer context switches.

## Coverage Guarantee
- This file includes every currently open UI/UX task in scope for LitRev.
- It is ordered for execution from stability to consistency to feature expansion.
- Deferred items are preserved at the end so nothing is lost before archival clean-up.

## Ordering Principles
1. Fix trust-breaking bugs first.
2. Resolve accessibility and interaction correctness next.
3. Standardize primitives/tokens before broad feature expansion.
4. Ship UX features and polish after foundation is stable.
5. Keep deferred items explicit and last.

## Current Architecture
- `ConversationPicker` now uses Radix `ContextMenu` for right-click interactions and keeps a separate Radix `DropdownMenu` trigger for explicit "more" actions.
- Conversation rename no longer depends on blocking browser APIs; it now uses an app-native dialog flow with optimistic title updates and rollback on failure.
- `SampleReviewCard` now follows a semantic non-nested interactive pattern (primary open button + sibling dismiss button), preserving click-anywhere behavior without invalid nested controls.
- `ResizableSplitter` is now a shared primitive for copilot panel resizing with pointer + keyboard support and ARIA-valued separator semantics, used by both standalone `ProjectPageLayout` and embedded project shell layout.
- Notes sidebar rows now use native button semantics, and Notes delete confirmation now uses shared `ConfirmDialog` instead of a hand-rolled overlay.
- Project route error boundaries now share a single `ErrorFallback` component with tokenized styling and consistent retry behavior across draft, protocol, ledger, and study-detail routes.
- Demo guidance surfaces are now context-scoped: `DemoBanner` is limited to conversation mode while `DemoGuideCard` remains view-mode only, preventing duplicate stacked guidance.
- Copilot hydration placeholders no longer render disabled-looking controls before mount; pre-mount controls are now visual placeholders with stable layout and no perceived broken state.
- The design system now includes first-class typography, shadow, z-index, and motion scales in `styles/tokens.css`, with `stylelint` warn-mode governance to surface raw value drift.
- High-traffic UI modules (`ledger`, `study detail`, `memory`, `notes`, `protocol`, `login`) now consume shared token scales for typography/motion/layering and reduced hardcoded palette/shadow usage.
- Timeline recovery UX now maps stream/plan failure messages into recoverable error cards with explicit `Retry` and `Resume` actions wired to resend the last user intent or continue unfinished plan steps.
- `/ai` standard send and plan-execution stream paths now consume the shared stream reducer + typed intents (same engine contract as project copilot), removing duplicated chunk-switch state machines while preserving project-optional `/ai` behavior.
- Thinking UX Phase 1 delta pass is active: summary-mode reasoning now opens live while streaming, `/ai` reasoning controls now honor model reasoning support tiers, and tool lifecycle cards expose clearer timing metadata without introducing new runtime semantics.

## Recently Completed
- `CUX-007` Added visible tool/run failure recovery UX by converting recoverable failures to timeline error cards and wiring `Retry`/`Resume` actions in both copilot surfaces.
- `CUX-016` Completed token-system foundation: added typography/shadow/z-index/motion scales, enabled warn-mode `stylelint` governance, and migrated high-traffic CSS modules off many hardcoded values.
- `CUX-A01` Added icon-button accessibility baseline by wiring explicit `aria-label` attributes for icon-only actions across timeline, files, exports, memory actions, ledger actions, and citation copy controls.
- `CUX-A02` Added ARIA validation wiring on key forms (`AuthScreen` magic-link email, `ConversationPicker` rename dialog, `Memory` statement input) with `aria-invalid` and linked error/help text.
- `CUX-037` Deduplicated sample guidance by rendering `DemoBanner` only in conversation mode and using in-page `DemoGuideCard` for view-mode contexts.
- `CUX-036` Removed disabled-looking hydration placeholders from `CopilotInputCore` and replaced them with non-interactive visual placeholders.
- `CUX-015` Added shared `ErrorFallback` component and migrated all project route `error.tsx` files to it.
- `CUX-001` Derived initial `focusMode` from pathname in project shell layout to eliminate deep-link flicker.
- Continued overlay standardization by replacing Notes’ custom delete overlay with shared `ConfirmDialog` (Radix AlertDialog wrapper).
- `CUX-011` Expanded accessibility coverage with splitter keyboard/semantics behavior tests and `axe` scan (`ResizableSplitter`).

## Collaboration Phase Alignment (Claude-Compatible)
Use this map to parallelize execution between Claude and Codex without phase drift.

### Shared Phase 1 — Project Page Contract
- `CUX-001`, `CUX-002`

### Shared Phase 2 — Streaming State Contract
- `CUX-005`, `CUX-006`, `CUX-007`

### Shared Phase 3 — Semantic HTML + Shared Interaction Primitives
- `CUX-008`, `CUX-009`, `CUX-010`, `CUX-011`, `CUX-012`

### Shared Phase 4 — ConversationPicker Overhaul
- `CUX-003`, `CUX-004`

### Shared Phase 5 — Async Feedback Architecture
- `CUX-013`, `CUX-014`, `CUX-A03`

### Shared Phase 6 — UI Polish Cluster
- `CUX-015`, `CUX-036`, `CUX-037`

### Shared Phase 7 — Design System Completion
- `CUX-016`, `CUX-A01`, `CUX-A02`

### Shared Phase 8 — Architecture
- `CUX-035`

### Extended Product Phases (after shared alignment)
- Onboarding: `CUX-018`..`CUX-022`
- Draft/Citations: `CUX-023`..`CUX-026`
- Copilot UX Features: `CUX-027`..`CUX-032`
- Performance/Validation: `CUX-033`..`CUX-034`

## Parallel Ownership Matrix (Phase-by-Phase File Boundaries)
This defines who edits what so Claude and Codex can run in parallel safely.

| Shared Phase | Owner | Task IDs | Allowed File Boundaries | Locked/Do-Not-Touch by Other Agent During Phase |
|---|---|---|---|---|
| Phase 1 — Project Page Contract | Claude | `CUX-001`, `CUX-002` | `components/project/ProjectPageLayout.tsx` (new), `components/project/ProjectPageLayout.module.css` (new), `app/project/[id]/notes/page.tsx`, `app/project/[id]/memory/page.tsx`, `app/project/[id]/protocol/page.tsx`, `app/project/[id]/ledger/page.tsx`, `app/project/[id]/ledger/[studyId]/page.tsx`, `app/project/[id]/draft/page.tsx`, `app/project/[id]/layout.tsx` (only as needed for wrapper integration) | Same files, especially `app/project/[id]/layout.tsx` and all `app/project/[id]/*/page.tsx` listed |
| Phase 2 — Streaming State Contract | Claude | `CUX-005`, `CUX-006`, `CUX-007` | `contexts/ProjectCopilotContext.tsx`, `contexts/project-copilot-stream-events.ts`, `components/copilot/CopilotInputCore.tsx`, `components/ProjectCopilot.tsx`, `components/copilot/TimelineRenderer.tsx`, `components/artifacts/*.tsx`, `types/ai.ts` / `types/artifacts.ts` (if required), new `hooks/useStreamingGate.ts` (if extracted) | Same files, especially copilot context + timeline + artifacts |
| Phase 3 — Semantic HTML + Primitives | Codex | `CUX-008`, `CUX-009`, `CUX-010`, `CUX-011`, `CUX-012` | `components/ui/ResizableSplitter.tsx` (new), `components/ui/ResizableSplitter.module.css` (new), `components/project/SampleReviewCard.tsx`, `components/ProjectGrid.module.css`, `components/ConfirmDialog.tsx` / shared overlay primitives, test files under `components/**/__tests__` and `lib/__tests__` for a11y coverage | `app/project/[id]/notes/page.tsx` is reserved for Claude in Phase 1 unless explicitly handed off; avoid touching `app/project/[id]/layout.tsx` if Claude Phase 1 is open |
| Phase 4 — ConversationPicker Overhaul | Codex | `CUX-003`, `CUX-004` | `components/ui/ConversationPicker.tsx`, `components/ui/ConversationPicker.module.css`, `components/ui/__tests__/ConversationPicker*.test.tsx`, small call-site updates in `components/ProjectCopilot.tsx` / `components/project/ConversationMainView.tsx` only for prop shape compatibility | `contexts/ProjectCopilotContext.tsx` and streaming files (Claude Phase 2 lock) |
| Phase 5 — Async Feedback Architecture | Claude | `CUX-013`, `CUX-014`, `CUX-A03` | `app/providers.tsx`, `components/ui/NotificationProvider.tsx` (new), `components/ui/Toast*.tsx` (new), `hooks/useAsyncAction.ts` (new), integrations in `components/ExportModal.tsx`, `app/auth/AuthScreen.tsx`, copy/save action components | `styles/tokens.css` and broad css migration files reserved for Codex Phase 7 |
| Phase 6 — UI Polish Cluster | Codex | `CUX-015`, `CUX-036`, `CUX-037` | `components/ErrorFallback.tsx` (new), `components/ErrorFallback.module.css` (new), `app/project/[id]/draft/error.tsx`, `app/project/[id]/protocol/error.tsx`, `app/project/[id]/ledger/error.tsx`, `app/project/[id]/ledger/[studyId]/error.tsx`, `components/project/DemoBanner.tsx`, `app/project/[id]/page.tsx`, `app/project/[id]/layout.tsx` (demo dedup only), `components/copilot/CopilotInputCore.tsx` (hydration flash only) | If Claude Phase 2 is still open, `components/copilot/CopilotInputCore.tsx` remains locked until handoff |
| Phase 7 — Design System Completion | Codex | `CUX-016`, `CUX-A01`, `CUX-A02` | `styles/tokens.css`, `.stylelintrc*` (new), `styles/*.css`, key module CSS migrations (`app/project/[id]/**.module.css`, `components/**.module.css`), shared form-field primitive files | `contexts/ProjectCopilotContext.tsx` and architecture extraction targets reserved for Claude Phase 8 |
| Phase 8 — Architecture | Claude | `CUX-035` | `app/project/[id]/draft/page.tsx`, `app/project/[id]/ledger/page.tsx`, `app/project/[id]/protocol/page.tsx`, `contexts/ProjectCopilotContext.tsx`, `components/ProjectCopilot.module.css`, extracted companions in same directories | Avoid token-scale edits (`styles/tokens.css`) while Codex Phase 7 is open |

## Recommended Parallel Waves
Use waves to minimize overlap while keeping both agents productive.

1. Wave A:
Claude: Shared Phase 1
Codex: Shared Phase 4

2. Wave B:
Claude: Shared Phase 2
Codex: Shared Phase 3 (`CUX-009` only after Claude Phase 1 merge or explicit handoff)

3. Wave C:
Claude: Shared Phase 5
Codex: Shared Phase 6 (`CUX-036` only after Claude Phase 2 merge or explicit handoff)

4. Wave D:
Codex: Shared Phase 7
Claude: Shared Phase 8 (start after Phase 7 token changes stabilize, or run with strict file lock)

## Long-Term Solution Blueprint (No Shortcut Fixes)
Use this section as implementation policy. Each item describes the durable solution and explicitly avoids temporary patches.

### Phase 0 Items
- `CUX-001` Best solution: Derive initial shell mode from route during first render and keep route->mode sync effect for later navigation. Avoid: post-mount mode flips that cause visible flash.
- `CUX-002` Best solution: Move Notes onto the same shell-embedding adapter pattern used by other project pages (shared helper/hook). Avoid: Notes-specific branching that duplicates shell logic.
- `CUX-003` Best solution: Implement controlled rename UX (inline or dialog primitive) with optimistic update + rollback. Avoid: `window.prompt` or blocking browser-native dialogs.
- `CUX-004` Best solution: Replace custom menu with Radix menu/context-menu primitive for keyboard, focus, and viewport positioning guarantees. Avoid: custom absolute-positioned popups.
- `CUX-005` Best solution: Enforce client lock + server idempotency token for artifact actions while runs are active. Avoid: debounce-only client fixes.
- `CUX-006` Best solution: Treat prefill as evented command input (`eventId`/nonce) so repeated identical clicks always apply. Avoid: string-equality-driven effects only.
- `CUX-007` Best solution: Add explicit run failure model (failed/cancelled/retryable) with checkpoint-aware recovery actions. Avoid: generic inline error text with no recovery path.

### Phase 1 Items
- `CUX-008` Best solution: Build reusable splitter component (pointer drag + keyboard arrows + ARIA-valued separator semantics). Avoid: mouse-only resize handlers.
- `CUX-009` Best solution: Convert note rows to semantic `button`/`a` controls and preserve layout through CSS. Avoid: `div role="button"` patches unless unavoidable.
- `CUX-010` Best solution: Redesign sample card with non-nested interactives (stretched-action surface + independent dismiss control). Avoid: nested button-like elements with `stopPropagation` workarounds.
- `CUX-011` Best solution: Expand `axe` coverage through shared test harness for key surfaces and include in CI gating. Avoid: one-off local accessibility checks.
- `CUX-012` Best solution: Create/extend shared overlay primitives and migrate consumers incrementally. Avoid: adding new hand-rolled modal/dropdown implementations.

### Phase 2 Items
- `CUX-013` Best solution: Introduce a typed global notification bus (toast + aria-live integration + dedupe policy). Avoid: per-component ad hoc success/error banners.
- `CUX-014` Best solution: Standardize async UI states as discriminated unions (`idle/loading/success/error`) for major flows. Avoid: independent booleans that can conflict.
- `CUX-015` Best solution: Use a single shared route error fallback component with tokenized styling and consistent reset behavior. Avoid: copy-pasted inline-styled error components.
- `CUX-016` Best solution: Add missing token scales first, then migrate high-traffic modules with lint rules against hardcoded palette/z-index/shadow/motion. Avoid: piecemeal cosmetic edits without governance.
- `CUX-017` Best solution: Enforce shell layout contract where content scroll and copilot scroll are isolated containers with explicit ownership. Avoid: page-level overflow hacks.

### Phase 3 Items
- `CUX-018` Best solution: Rebuild onboarding as measurable activation flow with step analytics and clear value proposition milestones. Avoid: purely visual redesign without behavior instrumentation.
- `CUX-019` Best solution: Model `skip`/`do later` as persisted step states and resumable workflow entries. Avoid: transient UI toggles not persisted per project/user.
- `CUX-020` Best solution: Add shared contextual explainer system (content registry + reusable explainer surface). Avoid: hardcoded tooltip text scattered per page.
- `CUX-021` Best solution: Implement AI-assisted drafting actions with editable outputs + provenance markers + explicit user confirmation boundaries. Avoid: opaque auto-fill behavior.
- `CUX-022` Best solution: Define global-default + project-override resolution rules in settings model and keep one source of truth. Avoid: competing toggles in multiple surfaces.

### Phase 4 Items
- `CUX-023` Best solution: Represent citations as structured editor nodes linked to evidence records, not plain text tags. Avoid: regex-based marker injection.
- `CUX-024` Best solution: Add citation rendering pipeline (data model -> format adapters) for numbered and author-year outputs. Avoid: string replacement hacks per mode.
- `CUX-025` Best solution: Build references from citation graph and keep it auto-synced on editor mutations. Avoid: manual references lists that drift from manuscript content.
- `CUX-026` Best solution: Define publication-grade typography tokens/layout rules once and apply across editor + export surfaces. Avoid: per-component font-size tweaks.

### Phase 5 Items
- `CUX-027` Best solution: Emit and render typed tool-receipt metadata in timeline events with consistent compact UI. Avoid: parsing assistant prose for tool summaries.
- `CUX-028` Best solution: Route artifact UI actions through a central action dispatcher with optimistic state + undo window + auditability. Avoid: per-card bespoke action handlers.
- `CUX-029` Best solution: Source autonomy badge text from actual runtime policy config so UI reflects true behavior contract. Avoid: static labels disconnected from runtime settings.
- `CUX-030` Best solution: Resolve composer context chips from centralized context engine (route + filters + scope), reused across views. Avoid: duplicated per-page context derivation logic.
- `CUX-031` Best solution: Implement study details panel as route-aware reusable side panel with cached fetch layer and study-scoped copilot state. Avoid: ledger-only ad hoc panel.
- `CUX-032` Best solution: Add robust duplicate detection service (identifier + normalized metadata + fuzzy heuristics) with human-review UX before commit. Avoid: exact-title-only duplicate checks.

### Phase 6 Items
- `CUX-033` Best solution: Define performance budgets (route transition, interaction latency, loading placeholders) and enforce with repeatable measurements. Avoid: unmeasured "perceived speed" changes.
- `CUX-034` Best solution: Convert manual sign-off into release-gate checklist with explicit evidence artifacts per surface. Avoid: informal QA sign-off notes.
- `CUX-035` Best solution: Extract monoliths by domain slices (state/actions/presentation/hooks) with behavior-locking tests before and after extraction. Avoid: mixed refactor + feature edits in one PR.
- `CUX-036` Best solution: Eliminate hydration-control flash by rendering stable non-disabled visual placeholders until mount for client-only controls, then swapping without layout shift. Avoid: disabling real controls pre-mount in a way users perceive as broken UI.
- `CUX-037` Best solution: Deduplicate demo education surfaces so only one primary guidance surface appears per view context (prefer contextual in-page guidance over global redundant banners). Avoid: stacking shell-level banner and page-level guide simultaneously.

### Deferred Items (If Activated Later)
- `CUX-D01` Best solution: Unify `/ai` and project conversation on one runtime/UI layer with context adapters. Avoid: duplicate chat stacks drifting independently.
- `CUX-D02` Best solution: Centralize motion policy via tokens + reduced-motion compatibility and event-based animation triggers. Avoid: random animation additions in isolated components.
- `CUX-D03` Best solution: Build mobile drawer as shell primitive with focus trap and gesture-safe interactions. Avoid: overlay hacks that break navigation/focus.
- `CUX-D04` Best solution: Implement inspector drawer behind explicit debug/role flag with shared context payload schema. Avoid: ad hoc debug panels leaking into production UX.
- `CUX-D05` Best solution: Run metadata extraction as an import pipeline stage with confidence + user review and retry paths. Avoid: silent background mutation of imported study metadata.
- `CUX-D06` Best solution: Use shared criteria-evaluation service to render explainable protocol-match signals on ledger rows. Avoid: duplicated protocol logic in ledger UI.
- `CUX-D07` Best solution: If dark mode is ever activated, implement token-layer theming only. Avoid: component-level color overrides.

### Audit Additions
- `CUX-A01` Best solution: Enforce icon-button labeling rule through lint/tests and shared icon-button primitive defaults. Avoid: relying on `title` for accessibility.
- `CUX-A02` Best solution: Use reusable form-field components that automatically wire label, help, and error semantics (`aria-*`). Avoid: custom validation wiring per form.
- `CUX-A03` Best solution: Centralize async status announcements in a shared live-region service integrated with notifications. Avoid: scattered per-component `aria-live` fragments.

## Phase 0 — Critical Stability & Correctness
- [ ] `CUX-002` Make Notes page shell-aware with explicit `useProjectShell` parity and embedded-content behavior.
- [ ] `CUX-005` Prevent duplicate artifact action dispatches while run/stream is active.
- [ ] `CUX-006` Harden suggestion prefill reliability (same-value click and mount timing behavior).

## Phase 1 — Accessibility & Interaction Baseline
- [ ] `CUX-012` Continue overlay standardization on shared primitives for remaining hand-rolled overlays/dropdowns.

## Phase 2 — Feedback, State, and UI System Consistency
- [ ] `CUX-013` Implement standardized async feedback (toast/notification pattern) for copy/save/delete/export/review actions.
- [ ] `CUX-014` Standardize loading/busy-state model across major UI surfaces.
- [ ] `CUX-017` Fix Copilot scrolling isolation across all pages (panel scroll independent from content area).

## Phase 3 — Onboarding UX Program
- [ ] `CUX-018` Execute Onboarding V2 redesign (home zero-state, sample entry, guided setup value clarity).
- [ ] `CUX-019` Add per-step `Skip for now` / `Do later` with resumable progression.
- [ ] `CUX-020` Add contextual `Explain this` entrypoint on each guided step.
- [ ] `CUX-021` Add AI-assisted guided actions (suggest/refine/generate) while keeping auditability/editability.
- [ ] `CUX-022` Move final onboarding controls into Settings and add per-project override UI.

## Phase 4 — Draft Authoring & Citation Experience
- [ ] `CUX-023` Add inline clickable citation markers linked to references and study deep-links.
- [ ] `CUX-024` Add citation display modes (numeric and named/year) with mapped references.
- [ ] `CUX-025` Auto-build and maintain references section from cited sources (hide raw links in prose).
- [ ] `CUX-026` Upgrade draft typography/heading/section styling to publication-grade output.

### Phase 4 — Platform Research Inputs (2026-03-01 Web Scan)
Use this as implementation guidance for `CUX-023`..`CUX-026`.

Open-source or source-available platforms (adapt implementation patterns):
- **Overleaf Community Edition / ShareLaTeX lineage (open-source self-hosted variants):** Collaborative LaTeX authoring with references and template-driven output.  
  Adapt: structured citation nodes + deterministic bibliography generation + collaborative conflict-safe editing patterns.
- **Manubot (open-source):** Git-based scholarly writing with citation-by-identifier and auto-generated references.  
  Adapt: citekey-first flow, bibliography as derived output, and strict provenance metadata.
- **Zotero (open-source):** Reference manager with citation styles (CSL) and library organization.  
  Adapt: citation-style adapter layer (`numeric` vs `author-year`) and robust bibliographic normalization/import contracts.
- **Open Journal Systems (open-source):** Editorial/publishing workflow for scholarly journals.  
  Adapt: explicit manuscript states, review checkpoints, and publish-ready metadata validation gates.
- **Fidus Writer (open-source):** Academic collaborative editor with citation/document focus.  
  Adapt: semantic document structure (sections/figures/references) and collaboration-safe rich-text operations.
- **Quarto (open-source):** Technical/scientific publishing system with native citations and multi-format rendering.  
  Adapt: single-source document model + citation-aware export adapters (HTML/PDF/Word) with consistent output semantics.

Closed-source platforms (product ideas only; no code copying):
- **Overleaf cloud (commercial):** Polished realtime academic authoring UX around templates, references, and submission formats.  
  Borrow: low-friction writing ergonomics, template onboarding, and preview/export confidence cues.
- **Authorea (commercial):** Research writing and collaboration with publisher-oriented workflows.  
  Borrow: research-object organization and manuscript-centric collaboration flows.
- **SciSpace / Typeset (commercial) [dedupe of #5 and #9]:** AI-assisted reading/writing and formatting tools for scientific papers.  
  Borrow: AI assist entrypoints near draft workflow, citation help at point-of-writing, and format-conversion affordances.
- **Veeva + Synchrogenix + other regulatory document systems (commercial):** Regulated document lifecycle management, structured content, and traceable review/compliance.  
  Borrow: immutable audit trails for edits/approvals, section-level ownership, and strict change-history visibility.
- **Preprint platforms (mixed ecosystem; many are service platforms):** Public early manuscript dissemination and feedback loops.  
  Borrow: pre-submission readiness checks, metadata completeness checks, and export profiles for target destinations.

Implementation guardrails for Phase 4:
- Treat citations/references as first-class structured data, never string post-processing.
- Keep references fully derived from citation graph to prevent drift.
- Keep style/rendering adapters isolated from editor storage format.
- Preserve provenance and audit metadata on every citation insertion/edit/remove operation.

## Phase 5 — Copilot Product UX Features
- [ ] `CUX-027` Tool receipt blocks per assistant turn (`Used: ...` summary).
- [ ] `CUX-028` Inline approve/apply/undo artifact controls with confirmations.
- [ ] `CUX-029` Autonomy contract badge in composer (behavior transparency).
- [ ] `CUX-030` Context chips above composer (`Protocol`, `Ledger (n)`, etc.).
- [ ] `CUX-031` Study details side panel from ledger links (abstract/PDF excerpt/study chat).
- [ ] `CUX-032` Import-study duplicate warning UX.

## Phase 6 — Performance, Validation, and Refactorability
- [ ] `CUX-033` Execute UX performance program (loading-state polish, progressive rendering, transition latency reduction).
- [ ] `CUX-034` Manual UX sign-off checklist completion:
  - [ ] Project conversation mode
  - [ ] `/ai` page mode
- [ ] `CUX-035` Decompose oversized UI modules into smaller components/hooks with behavior-preserving extraction.
- [ ] `CUX-D01` Activate chat unification execution (`/ai`, project copilot, popup) via `plan-chat-unification-v2.md` with strict sequencing: close U1.6 on `/ai` + project (metric freeze + burn-in sign-off) before starting U3 popup migration.

## Phase 7 — Deferred / Parking Lot (Not Active)
- [ ] `CUX-D02` Entrance animation on newest message only.
- [ ] `CUX-D03` Mobile sidebar slide-in drawer.
- [ ] `CUX-D04` Context/prompt inspector drawer (debug panel).
- [ ] `CUX-D05` Metadata auto-extract from PDFs on import.
- [ ] `CUX-D06` Protocol-Ledger UI integration (show matching criteria on ledger rows).
- [ ] `CUX-D07` Dark mode (explicitly deferred indefinitely).

## Additional Quality Tasks
- [ ] `CUX-A03` Expand `aria-live` announcements for async status changes beyond voice input (copy/save/export/review).

## Execution Notes
- Run after each meaningful batch:
  - `cd next-app && npx tsc --noEmit`
  - `cd next-app && npx vitest run`
- Keep PRs narrow (one phase item or tightly related pair).
- For shell routes under `app/project/[id]/...`, preserve the embedded-shell contract (`isEmbeddedInProjectShell`).
