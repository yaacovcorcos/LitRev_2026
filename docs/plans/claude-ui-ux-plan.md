# Claude UI/UX Fixes Plan

## Purpose

This is Claude's execution plan for the UI stability and consistency sweep.
It complements `codex-ui-ux-plan.md` (Codex's execution checklist).
Codex's plan covers the full product roadmap (onboarding, citations, copilot features, performance).
This plan focuses on the **stability sweep** with holistic, root-cause-driven solutions.

Where Codex's plan lists items with one-liner solution blurbs, this plan
prescribes the **durable, root-cause solution** for each issue — what to
build, why that approach wins long-term, and what traps to avoid.

## Source

Joint audit by Claude and Codex (Feb 2026), cross-validated. Corrections
applied (see bottom of this file).

## Current Architecture
*How the UI domain works right now, based on actual committed code.*

- **Component Library:** Radix Primitives for overlays and menus (Dialog, AlertDialog, Popover, DropdownMenu) combined with CSS Modules (unstyled), plus `cmdk` for command palette interactions.
- **Shared Selectors:** `components/ui/ConversationPicker` is a shared conversation-selector primitive (Radix Popover + `cmdk`) used by both panel copilot and full-page conversation views.
- **Design System:** Glassmorphism (`backdrop-filter: blur`, rounded corners, soft shadows). Custom semantic CSS tokens (`tokens.css`). Typography: Lexend font.
- **Chat Layouts:**
  - `variant="page"`: Full width, transparent AI messages, tinted user messages.
  - `variant="panel"`: Copilot side-panel style.
- **Generative UI:** Artifacts (PlanCard, StudyCard, etc.) render inline as interactive components via `ArtifactWrapper`.
- **Animations:** Staggered chip animations (`@keyframes fadeInUp`), streaming cursor (dots/cursor), smooth scroll-to-bottom. Accessible defaults (`prefers-reduced-motion`).
- **Scoping UX:** `scoping_report` renders as a decision-first card with one-click actions and collapsible full analysis on both project conversation and `/ai`.
- **Mentioned Studies UX:** Assistant messages render lightweight mentioned-study chips (title/year/link + add state), with direct add-to-ledger actions and hidden metadata stripping before markdown render.
- **Home + Onboarding UX:** `/` now has a real first-run zero state (no sidebar) plus on-demand sample project entry, and quick project creation now routes into `/project/[id]/onboarding` guided setup with explicit skip-to-conversation.
- **Demo Guidance UX:** The sample project is visually distinct (badge + in-project banner) and demo-only inline guide cards are dismissible per card via localStorage.
- **Onboarding Defaults UX (Interim):** Guided setup default can be toggled from onboarding (settings-ready plumbing), while final Settings placement and per-project override UI are still pending.
- **Streaming:** Live stream handled by `contexts/project-copilot-stream-events.ts` (tool_call progress labels, tool_result status). `StreamReducer.ts` is only for history replay, not live streaming.
- **Shell contract:** All project pages use `ProjectPageLayout` wrapper (in `components/project/ProjectPageLayout.tsx`) that handles embedded-vs-standalone shell pattern, back button, and optional copilot panel. No individual page re-implements the shell contract.
- **Streaming gate:** `useStreamingGate()` hook (from `ProjectCopilotContext`) exposes `isStreaming`, `canAct`, and `streamPhase`. All artifact cards accept `canAct` and disable actions during streaming. Prefill uses a command-based pattern (`{ text, id }`) so repeated clicks always work.
- **Async feedback architecture:** `useAsyncAction()` hook (`hooks/useAsyncAction.ts`) wraps any async operation with status management (`idle|loading|success|error|cancelled`), double-execution guard, and global notification dispatch via DOM events. `NotificationProvider` (`contexts/NotificationContext.tsx`) listens for events and renders `ToastContainer` (`components/ui/Toast.tsx`) with auto-dismiss, dedup, and `aria-live` region. ExportModal and AuthScreen migrated to the hook.

## Phase Ownership (Agreed with Codex)

| Phase | Owner | Claude IDs | Codex IDs |
|-------|-------|-----------|-----------|
| Phase 1 — Project Page Contract | **Claude** | CLU-001 | CUX-001, CUX-002 |
| Phase 2 — Streaming State Contract | **Claude** | CLU-002 | CUX-005, CUX-006, CUX-007 |
| Phase 3 — Semantic HTML + Primitives | **Codex** | CLU-003 (spec) | CUX-008, CUX-009, CUX-010, CUX-011, CUX-012 |
| Phase 4 — ConversationPicker Overhaul | **Codex** | CLU-004 (spec) | CUX-003, CUX-004 |
| Phase 5 — Async Feedback Architecture | **Claude** | CLU-005 | CUX-013, CUX-014, CUX-A03 |
| Phase 6 — UI Polish Cluster | **Codex** | CLU-006 (spec) | CUX-015, CUX-036, CUX-037 |
| Phase 7 — Design System Completion | **Codex** | CLU-007 (spec) | CUX-016, CUX-A01, CUX-A02 |
| Phase 8 — Architecture Decomposition | **Claude** | CLU-008 | CUX-035 |

### Parallel Waves
- **Wave A:** Claude Phase 1 + Codex Phase 4 (zero file overlap)
- **Wave B:** Claude Phase 2 + Codex Phase 3 (Codex waits for Claude P1 merge before CUX-009)
- **Wave C:** Claude Phase 5 + Codex Phase 6 (Codex waits for Claude P2 merge before CUX-036)
- **Wave D:** Codex Phase 7 + Claude Phase 8 (Claude avoids `tokens.css` while Codex migrates)

### Handoff Protocol
When an owner finishes a phase: merge to main, post confirmation in the plan file (move items to Recently Completed), then the other agent can start dependent work on previously locked files.

## Execution Rules

- One fix per commit. Validate every commit: `npx tsc --noEmit && npx vitest run` from `next-app/`.
- `next build` fails without `BETTER_AUTH_SECRET` — expected, not a blocker.
- Behavior bugs before design debt. Group same-file changes. Define tokens before migrating modules.
- Never combine refactor + feature changes in the same commit.

---

## Root Cause Analysis

Before the fix list: most issues trace back to five missing architectural pieces.
Fixing individual symptoms without addressing these roots will just produce new
variants of the same bugs.

| Root Cause | Symptoms | Durable Fix |
|-----------|----------|-------------|
| **No shared project-page wrapper** | Notes missing shell pattern, study detail back button always visible, inconsistent back buttons, potential for duplicate AppShell nesting | `ProjectPageLayout` wrapper component |
| **No streaming state contract** | Artifact buttons spammable during streaming, suggestion chips silently no-op, prefill race conditions | `useStreamingGate()` hook from copilot context |
| **Custom divs instead of real HTML controls** | `div role="button"` in Notes, nested button in SampleReviewCard, mouse-only resize handle | Semantic HTML first policy + shared `ResizableSplitter` + `ClickableCard` primitive |
| **Incomplete design token system** | Hardcoded colors/shadows/z-index/font-sizes, animation easing drift, no governance | Complete token scales + stylelint enforcement |
| **No async feedback architecture** | No toasts, inconsistent loading patterns, silent action results, sparse aria-live | `useAsyncAction()` hook + global notification provider |

---

## Phase 1 — Project Page Contract (fixes 5 symptoms at once)

### `CLU-001` Create `ProjectPageLayout` wrapper

**Problem (root cause):** Every `app/project/[id]/*` page independently re-implements the embedded-vs-standalone pattern: import `useProjectShell`, check `isEmbeddedInProjectShell`, conditionally wrap in `AppShell`, conditionally render `BaseBackButton`, conditionally render standalone copilot. This is ~30-50 lines of boilerplate per page, and Notes forgot to implement it entirely. Study detail renders its back button unconditionally. New pages will repeat the same mistake.

**Best solution:** Create a `ProjectPageLayout` component (in `components/project/ProjectPageLayout.tsx`) that encapsulates the entire embedded/standalone contract:

```tsx
// Usage in any project page:
export default function ProtocolPage() {
  return (
    <ProjectPageLayout
      backLabel="Back to project"
      copilot={{ page: "protocol", placeholder: "Ask about protocol..." }}
    >
      {/* page content only — no shell logic needed */}
    </ProjectPageLayout>
  );
}
```

The component internally handles:
- `useProjectShell()` — reads `isEmbeddedInProjectShell`
- When embedded: renders `children` only (content-only mode)
- When standalone: wraps in `AppShell` + renders `BaseBackButton` + optionally renders `ProjectCopilot` side panel
- `copilot` prop is optional — pages like Notes and Memory that don't need a standalone copilot panel simply omit it
- Error/loading boundaries can be co-located here too

**Why this wins long-term:**
- New pages get the shell contract for free — zero boilerplate
- The contract is enforced by construction, not by convention — you can't forget it
- Changes to the shell pattern (e.g., adding a toolbar, changing copilot placement) propagate to all pages from one file
- Eliminates the entire class of "page X doesn't match page Y" inconsistencies
- Reduces each page by 30-50 lines of repeated logic

**What this replaces:**
- `UI-009` (Notes shell pattern) — Notes just wraps in `ProjectPageLayout` instead
- `UI-015` (study detail back button) — `ProjectPageLayout` handles it correctly
- The inconsistent back-button pattern across draft/protocol/ledger/memory — all migrate to the wrapper
- Future protection against new pages forgetting the pattern

**Migration order:** Start with Notes (simplest, no copilot panel). Then Memory. Then study detail. Then protocol, ledger, draft (progressively more complex, have standalone copilot). Each migration is one commit.

**Traps to avoid:**
- Don't make the wrapper too abstract — it should handle the shell contract and nothing else
- Don't force pages to restructure their internal layout — the wrapper wraps the outermost level only
- Preserve the `noMainPadding` behavior that some pages need from AppShell

---

## Phase 2 — Streaming State Contract (fixes spam-clicking, prefill, silent failures)

### `CLU-002` Add `useStreamingGate()` hook and streaming-aware artifact contract

**Problem (root cause):** The copilot context tracks `isLoading` and `isStreaming` internally, but this state never reaches artifact cards or suggestion chips. Each card renders buttons with no awareness of whether the system is busy. `PlanCard` has a bespoke `canRun` prop — every other card has nothing. Suggestion chips rely on `sendLockRef` (which works) but give no visual feedback.

**Best solution:** Expose a `useStreamingGate()` hook from the copilot context that returns:

```tsx
const { isStreaming, canAct, streamPhase } = useStreamingGate();
// isStreaming: boolean — true while a run is in progress
// canAct: boolean — false during streaming, true otherwise
// streamPhase: "idle" | "streaming" | "tool_running" | "completing"
```

Then establish a contract: every artifact card accepts a `canAct: boolean` prop. `TimelineRenderer.renderArtifactContent()` passes `canAct` derived from the hook (or from the existing `isLoading` state it already computes). Each card disables its action buttons when `!canAct`.

For suggestion chips: `SuggestionChips` and the empty-state suggestions in `TimelineRenderer` receive `disabled={!canAct}` and render visually disabled.

For prefill: replace the string-equality `useEffect` with a command-based approach. Instead of `setPrefill("some text")`, use `setPrefillCommand({ text: "some text", id: crypto.randomUUID() })`. The effect triggers on `id` change, not text equality. This makes clicking the same suggestion twice always work, with zero risk of the React "same value skip" behavior.

**Why this wins long-term:**
- Every new artifact card automatically inherits the streaming guard — it's part of the card interface
- The hook is the single source of truth for "can the user act right now" — no more scattered `isLoading` prop-drilling
- `streamPhase` enables future features: different UI during tool execution vs text streaming, progress indicators, etc.
- The prefill command pattern is robust — no microtask hacks, no counter tricks, just proper event semantics
- Codex's server-side idempotency token (CUX-005) is included: server actions that trigger AI runs accept an `idempotencyKey` (UUID, client-generated). Server checks for duplicate keys within a 5-minute window before starting a new run. This is the server complement to the client-side streaming gate.

**CUX-007 — Tool failure recovery UI:**
When `streamPhase` transitions to `"failed"` (tool_call errors, network failures, model refusals), the timeline renders an inline error block with:
- Error summary (what failed, not a raw stack trace)
- "Retry last step" button (re-dispatches the failed tool call)
- "Resume run" button (continues from last successful checkpoint, if applicable)
- The error block uses the same `ArtifactWrapper` rendering pattern for visual consistency

**What this replaces:**
- `UI-007` (artifact button disable during streaming) — all 9 vulnerable cards
- `UI-008` (suggestion chip disable + prefill hardening) — both issues
- `PlanCard`'s bespoke `canRun` pattern — unified under the same hook

**Implementation:**
1. Add `useStreamingGate()` to `ProjectCopilotContext.tsx` (derive from existing state, no new state needed)
2. Add `canAct` prop to every artifact card interface — mechanical, ~3 lines per card
3. Pass `canAct` from `TimelineRenderer.renderArtifactContent()` — one location
4. Replace `prefill` string with `prefillCommand` object in `ProjectCopilot.tsx` + `CopilotInputCore.tsx`
5. Add `disabled` to suggestion chips

**Traps to avoid:**
- `canAct` must be `true` after streaming completes — don't leave buttons permanently disabled after errors
- Don't add auto-send to the prefill flow — current fill-only behavior is intentional
- Don't break the `onPrefillConsumed` callback contract — parent still needs to clear the command

---

## Phase 3 — Semantic HTML + Shared Interaction Primitives

### `CLU-003` Fix Notes rows, SampleReviewCard, and resize handle with proper primitives

**Problem (root cause):** The codebase has three instances of building interactive controls from non-interactive elements (`div role="button"`, `div` wrapping `button`, mouse-only separator). Each is a separate bug, but they share the same root: no convention or lint rule against fake interactive elements, and no shared primitives for common patterns (clickable cards, resizable panels).

**Best solution — three sub-fixes, unified by a semantic-HTML-first rule:**

#### `CLU-003a` Notes rows → real `<button>` elements
Replace `div role="button"` at `notes/page.tsx:348` with actual `<button>` elements. Style with CSS to preserve the current layout (full-width, left-aligned text, multi-line content). A `<button>` gives Enter + Space + click for free with zero ARIA needed.

CSS adjustment: `button { all: unset; display: flex; width: 100%; cursor: pointer; text-align: left; }` plus the existing hover/active styles. This is more durable than patching the div with `e.key === " "` because:
- No risk of forgetting `preventDefault` on Space
- No ARIA attributes needed at all
- Future keyboard interactions (like focus ring) work natively
- Accessibility tools treat it correctly without any extra work

#### `CLU-003b` SampleReviewCard → stretched-link card pattern
Replace the `div role="button"` wrapper + nested `<button>` with the card pattern used by GitHub, Stripe, and most design systems: a non-interactive `<div>` card containing a visually hidden `<a>` (or `<button>`) that stretches to cover the card via `::after { position: absolute; inset: 0 }`. The dismiss button sits above it with `position: relative; z-index: 1`.

This gives click-anywhere-to-open behavior without nesting interactive elements. Screen readers see two independent controls (open + dismiss) with no nesting confusion.

#### `CLU-003c` Resize handle → `ResizableSplitter` shared component
Extract the resize logic from `layout.tsx` into a reusable `components/ui/ResizableSplitter.tsx` that handles:
- `onPointerDown` + `pointermove/pointerup` + `setPointerCapture` (replaces `onMouseDown` — covers mouse, touch, pen)
- `onKeyDown` for ArrowLeft/ArrowRight (adjusts by step size, e.g., 20px)
- `aria-valuenow`, `aria-valuemin`, `aria-valuemax` (WAI-ARIA window splitter pattern)
- `tabIndex={0}` for keyboard focusability
- Configurable `min`, `max`, `step`, `direction` props

Why a shared component: if the app ever adds another resizable panel (e.g., study detail side panel, draft outline panel), it gets correct behavior for free. The component is ~80 lines and reusable.

**Traps to avoid:**
- For Notes buttons: check that the existing CSS doesn't rely on `div`-specific layout behavior. Test that multi-line note titles still wrap correctly inside a `<button>`.
- For SampleReviewCard: the stretched link must not capture clicks on the dismiss button — test both mouse and keyboard dismiss.
- For ResizableSplitter: keep it hidden (`aria-hidden`, `tabIndex={-1}`) when the panel it controls is collapsed. The current layout already does this — preserve it.

---

## Phase 4 — ConversationPicker Overhaul

### `CLU-004` Inline rename + Radix context menu (same component, one PR)

**Problem:** `ConversationPicker` has two intertwined issues: `window.prompt()` for rename (line 212) and a custom context menu with no viewport clamping or keyboard nav (lines 200-203). Both live in the same component and share the same callback wiring.

**Best solution — do both in one PR since they share state:**

#### Inline rename
When user clicks "Rename" in the context menu, enter a controlled rename mode:
1. Set `renamingId` state to the conversation ID
2. In the conversation list, render an `<input>` in place of the title text for that item
3. The input auto-focuses, pre-filled with current title, text fully selected
4. Enter confirms (call `onRename(id, newTitle)`), Escape cancels (clear `renamingId`), blur confirms
5. Validate: reject empty/whitespace-only (shake the input or show inline error)
6. Use optimistic update: immediately show new title, revert on failure

This is better than a modal dialog because:
- Rename is a lightweight action — a modal is too heavy
- The user sees the rename happening in-place — clear spatial relationship
- No focus trap needed — the input is inline in the existing list

#### Radix ContextMenu migration
Replace the custom context menu (manual `clientX/clientY` positioning, manual click-outside listeners, no keyboard nav) with `@radix-ui/react-context-menu`. The dependency is already installed.

Key decisions:
- Right-click on a conversation item → `ContextMenu.Trigger` wrapping the list item
- The existing "more" dots button → separate `DropdownMenu.Trigger` (NOT a context menu trigger). These are semantically different: context menu = right-click surface, dropdown = explicit button. Don't conflate them.
- Menu items: Rename, Duplicate, Delete (with separator before Delete)
- Delete item gets `ContextMenu.Item` with `className={styles.dangerItem}` for red text

Radix gives you for free: viewport-aware positioning, keyboard arrow navigation, focus management, Escape to close, screen reader announcements.

**Traps to avoid:**
- The inline rename input must handle the case where the Popover closes while renaming — commit the current value on unmount (use a ref to track uncommitted value + `useEffect` cleanup)
- Radix ContextMenu triggers on right-click natively — don't add a manual `onContextMenu` handler on top of it
- Mobile: Radix ContextMenu supports long-press. Test this works on touch.

---

## Phase 5 — Async Feedback Architecture

### `CLU-005` Global notification provider + `useAsyncAction()` hook

**Problem (root cause):** The app has no centralized feedback system. Every component invents its own:
- ExportModal: button text changes to "Copied!", auto-resets after timeout
- Copy buttons: icon swap (copy → check)
- Auth: button text "Sending..." / "Signing in..."
- Save operations: no feedback at all — user doesn't know if it worked
- Errors: inline banners, sometimes with retry, sometimes not
- Screen readers: almost nothing announced (only voice input has `aria-live`)

This is not a toast library problem — it's an architecture problem. Adding Sonner (or any toast library) without a feedback architecture will just create a new flavor of ad-hoc.

**Best solution — two pieces:**

#### `useAsyncAction()` hook
A shared hook that wraps any async operation with consistent state management:

```tsx
const { status, execute, error, cancel } = useAsyncAction(async (signal) => {
  await saveProtocol(data, { signal });
}, { successMessage: "Protocol saved", cancellable: true });

// status: "idle" | "loading" | "success" | "error" | "cancelled"
// execute: () => Promise<void> — call this on button click
// cancel: () => void — only available when cancellable: true
// error: string | null
```

The hook:
- Sets `status` to `"loading"` immediately on `execute()`
- On success: sets `"success"`, dispatches a notification event, auto-resets to `"idle"` after 2s
- On error: sets `"error"`, dispatches error notification, stays in `"error"` until user retries
- Prevents double-execution while loading (built-in guard)
- Returns the status for button disabled/text changes
- **Opt-in cancellation:** When `cancellable: true`, passes an `AbortSignal` to the callback and exposes `cancel()`. Most short actions (copy, save) don't need this. Long operations (export, AI runs) opt in. No progress percentage — that requires server-side streaming, which is a separate scope.

This replaces the scattered boolean/enum patterns:
- Simple cases (`isSaving`): `const { status, execute } = useAsyncAction(save)`
- Multi-action cases (`busyGoogle`, `busyMagicLink`): each gets its own `useAsyncAction` instance
- Complex cases (ExportModal enum): the hook's enum is the same shape, just standardized

#### `NotificationProvider` + toast component
A context provider at the app root that:
- Listens for notification events dispatched by `useAsyncAction()` (or directly by components)
- Renders toasts in a fixed position (bottom-right on desktop, bottom-center on mobile)
- Includes an `aria-live="polite"` region that announces every notification to screen readers
- Supports types: `success`, `error`, `info`
- Auto-dismisses success/info after 4s, errors persist until dismissed
- Deduplicates rapid-fire identical messages (e.g., spamming copy button)

Consider Sonner for the rendering layer (already in the deferred parking lot) — but the notification event bus and `useAsyncAction()` hook are the real value. The toast library is swappable.

**What this replaces:**
- `UI-010` (toast system)
- `UI-011` (loading state standardization)
- `UI-018` (aria-live regions) — the provider includes aria-live by default
- `UI-019` partially (icon button feedback) — copy actions dispatch notifications

**Migration order:**
1. Build `useAsyncAction()` hook + `NotificationProvider` + basic toast component
2. Integrate in ExportModal first (it already has the enum pattern — easiest migration)
3. Then auth screen (multiple actions)
4. Then copy-to-clipboard actions across the app
5. Then save operations (protocol, draft, notes)

**Traps to avoid:**
- Don't remove inline error states — toasts supplement them. A form validation error should still appear next to the field, not just as a toast.
- Don't make the hook too opinionated — some components need custom status handling (ExportModal's "exporting" progress bar). The hook should be opt-in, not forced.
- Keep the toast component minimal (no heavy animations, no stacking complexity) — this renders on every page.

---

## Phase 6 — UI Polish Cluster

### `CLU-006` Instant-win fixes (focusMode flicker + hydration flash + ErrorFallback + demo dedup)

These four items are independent, low-risk, and can be done in any order. Each is a single commit.

#### `CLU-006a` Fix deep-link focusMode flicker — `layout.tsx`
**Problem:** Line 50 does `useState("conversation")`, then effect flips to `"view"`.
**Solution:** `useState(() => tabFromPathname(pathname) ? "view" : "conversation")`. Keep the `useEffect` for subsequent navigations. 1-3 lines changed.

#### `CLU-006b` Fix hydration flash on copilot controls — `CopilotInputCore.tsx`
**Problem:** `hasMounted` state defers Radix rendering. Pre-mount, controls render as disabled placeholders.
**Solution:** Replace disabled placeholder buttons with invisible skeleton `<span>` elements that have the same dimensions as the real buttons (via a shared CSS class: `width`, `height`, `display: inline-flex`). The skeleton matches the surrounding background — no flash, no layout shift. Don't remove the `hasMounted` guard itself — it exists to prevent SSR/client hydration mismatch.

#### `CLU-006c` Extract `ErrorFallback` component — 5 files
**Problem:** Four identical error.tsx files with inline styles.
**Solution:** Create `components/ErrorFallback.tsx` (`"use client"`, accepts `{ error, reset, label }` props) with a CSS module using tokens. Each error.tsx becomes ~3 lines. Keep it zero-dependency — this renders during failures.

#### `CLU-006d` Deduplicate demo banner + guide cards — 1-2 files
**Problem:** `DemoBanner` (shell level) + `DemoGuideCard` (page level) both show for demo projects.
**Solution:** Remove `DemoBanner` from the shell entirely. The per-page `DemoGuideCard` is more contextual and more useful — it tells users what to do on *this* specific page. The banner is redundant once guide cards exist. If the banner has information that guide cards don't, move that content into the overview page's guide card.

---

## Phase 7 — Design System Completion

### `CLU-007` Complete token system + add lint enforcement

**Problem (root cause):** The token system was started (`tokens.css` has colors, radius, spacing) but never completed (no typography, shadows, z-index, or motion tokens). Without enforcement, new code freely uses raw values, and the token system degrades over time.

**Best solution — two commits:**

#### Commit 1: Define all missing token scales in `tokens.css`

```css
/* Typography scale */
--text-xs: 11px;
--text-sm: 12px;
--text-base: 14px;
--text-md: 15px;
--text-lg: 16px;
--text-xl: 18px;
--text-2xl: 22px;
--text-3xl: 24px;
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Shadow scale */
--shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
--shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.18);
--shadow-accent: 0 4px 12px rgba(217, 116, 89, 0.15);

/* Z-index scale (documented stacking order) */
--z-base: 1;
--z-dropdown: 100;
--z-sticky: 500;
--z-sidebar: 900;
--z-header: 1000;
--z-modal-backdrop: 1500;
--z-modal: 2000;
--z-popover: 2500;
--z-toast: 3000;

/* Motion tokens */
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--duration-fast: 150ms;
--duration-base: 200ms;
--duration-slow: 300ms;

/* Missing color tokens */
--color-white: #ffffff;
--badge-conversation: #2563eb;
--badge-study: #2e7d32;
```

#### Commit 2: Add stylelint rules to enforce tokens

Add a `.stylelintrc.json` with custom rules that flag:
- Raw hex colors (except in `tokens.css` itself) — must use `var(--*)`
- Raw `z-index` values > 1 — must use `var(--z-*)`
- Raw `box-shadow` declarations — must use `var(--shadow-*)`

**Rollout strategy (warn-mode-first, then ratchet):**
1. All rules start as **warnings** — CI stays green, violations are visible in lint output
2. Migrate one module at a time (one commit per module)
3. Once a module is fully clean, promote its glob to **error** severity
4. Ratchet until all modules are clean — at that point, flip the global default to error

This turns the token system from "optional convention" into "enforced contract" without a big-bang migration PR.

#### Token migration (incremental, one module per commit)
After tokens are defined and lint is in place, migrate existing modules:
1. `ledger.module.css` + `study.module.css` (same domain, do together)
2. `memory.module.css`
3. `notes.module.css`
4. `protocol.module.css`
5. `login.module.css`

Each migration is one commit. Verify visually after each.

**What this replaces:**
- `UI-012` (token definitions)
- `UI-012a` (color migration)
- `UI-012b` (z-index/typography/shadow migration)
- The "inconsistent animation easing" finding
- Future drift — lint prevents regression

---

## Phase 8 — Architecture (long-term, don't rush)

### `CLU-008` Decompose monolith pages

**Targets:** `draft/page.tsx` (1900+), `ledger/page.tsx` (1000+), `protocol/page.tsx` (900+), `ProjectCopilotContext.tsx` (1600+), `ProjectCopilot.module.css` (2161 lines).

**Best solution:** Extract by domain slice, not by arbitrary size limits:
- **State + hooks** → co-located `use*.ts` hook files (e.g., `useDraftState.ts`, `useDraftActions.ts`)
- **Sub-sections of the page** → co-located components (e.g., `DraftToolbar.tsx`, `DraftSectionNav.tsx`)
- **CSS** → split by component (each extracted component gets its own `.module.css`)

Rules:
- Write a snapshot test for the page's rendered output BEFORE extracting
- Extract one logical chunk per commit
- Each extraction must pass `tsc` and `vitest` before the next
- Never change behavior during extraction — purely mechanical moves
- After all extractions, the page.tsx file should be ~200-400 lines: imports, layout composition, and the return statement

**Why not now:** This is the riskiest work in the plan. Do it after Phases 1-7 have stabilized the foundations. Extracting from a moving target creates merge conflicts and regressions.

---

## Verified Corrections (from cross-review)

These findings from the initial audit were corrected during cross-validation:

1. **"Tool calls are invisible" — WRONG.** `StreamReducer.ts` is not the active streaming path — it's only used for history replay via `messagesToTimeline()`. The live stream is handled by `contexts/project-copilot-stream-events.ts` (lines 179-196), which properly renders tool_call progress labels and tool_result status updates. No fix needed.

2. **"Notes page breaks embedded shell" — OVERSTATED.** Not a runtime break: the parent `layout.tsx:186` already wraps all children in `<AppShell>`, so Notes renders correctly inside the shell. It IS a consistency gap (no standalone fallback, no back button), hence addressed by `CLU-001` (ProjectPageLayout) rather than a standalone fix.

3. **"No aria-live regions" — PARTIALLY WRONG.** There IS an `aria-live="polite"` region at `CopilotInputCore.tsx:463` for voice recording status. Correct statement: aria-live is sparse — present for voice input, missing for streaming, export, copy, and errors. Addressed holistically by `CLU-005` (NotificationProvider includes aria-live).

---

## Cross-Reference: Claude → Codex IDs

| Claude | Codex | Description |
|--------|-------|-------------|
| CLU-001 | CUX-001, CUX-002 | ProjectPageLayout (shell contract + back buttons + Notes) |
| CLU-002 | CUX-005, CUX-006, CUX-007 | Streaming gate + artifact safety + prefill hardening + failure recovery |
| CLU-003a | CUX-009 | Notes rows → real buttons |
| CLU-003b | CUX-010 | SampleReviewCard → stretched-link pattern |
| CLU-003c | CUX-008 | ResizableSplitter shared component |
| CLU-004 | CUX-003, CUX-004 | ConversationPicker overhaul |
| CLU-005 | CUX-013, CUX-014, CUX-A03 | Async feedback architecture |
| CLU-006a | CUX-001 | focusMode flicker |
| CLU-006b | CUX-036 | Hydration flash |
| CLU-006c | CUX-015 | ErrorFallback |
| CLU-006d | CUX-037 | Demo dedup |
| CLU-007 | CUX-016 | Token system + lint enforcement |
| CLU-008 | CUX-035 | Monolith decomposition |

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] **Phase 5 (CLU-005):** Built `useAsyncAction()` hook + `NotificationProvider` + `ToastContainer` with aria-live. Migrated ExportModal and AuthScreen. 19 new tests (11 hook + 8 context).
- [x] **Phase 2 (CLU-002):** Added `useStreamingGate()` hook, threaded `canAct` to all 10 artifact cards, replaced prefill string with command-based pattern, disabled suggestion chips during streaming.
- [x] **Phase 1 (CLU-001):** Created `ProjectPageLayout` wrapper, migrated all 6 project pages, removed ~200 lines of duplicated shell logic, fixed study detail back button bug.
- [x] Completed phase-6 polish/validation pass: refreshed demo guide copy, added a Results-section guide note, tokenized remaining onboarding/demo-guide rgba values.
- [x] Added phase-5 onboarding persistence UX wiring: guided setup default toggle (interim location), backend-driven create routing, and skip/save completion tracking.
- [x] Implemented the sample Yoga-for-Anxiety project flow with real seeded data plus reset/delete lifecycle controls.
- [x] Completed home IA + onboarding phase: zero-project first-run state, nav rename to Home, and quick-create -> guided `/project/[id]/onboarding` routing with skip path.
