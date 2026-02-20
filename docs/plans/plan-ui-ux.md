# UI, UX, & Layout Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Component Library:** Radix Primitives for overlays (Dialog, Popover, Menu, Listbox) combined with CSS Modules (unstyled). Sonner for toasts. TanStack Virtual for headless list virtualization.
- **Design System:** Glassmorphism (`backdrop-filter: blur`, rounded corners, soft shadows). Custom semantic CSS tokens (`tokens.css`). Typography: Outfit font.
- **Chat Layouts:**
  - `variant="page"`: Full width, transparent AI messages, tinted user messages.
  - `variant="panel"`: Copilot side-panel style.
- **Generative UI:** Artifacts (PlanCard, StudyCard, etc.) render inline as interactive components via `ArtifactWrapper`.
- **Animations:** Staggered chip animations (`@keyframes fadeInUp`), streaming cursor (dots/cursor), smooth scroll-to-bottom. Accessible defaults (`prefers-reduced-motion`).

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P0 — Trust & Correctness
- [ ] Fix route/layout composition for project pages (`memory/page.tsx` and `ledger/page.tsx` double-rendering sidebars).
- [ ] Define missing CSS tokens (`--bg-secondary`, `--border-default`) and add semantic `.btn-danger`.
- [ ] Make listbox/menu/option UIs keyboard-correct (migrate Conversation dropdown to Radix).
- [ ] Restore visible focus states everywhere (`:focus-visible`).
- [ ] Add `axe-core` to CI for automated a11y regression tests.

### P1 — Consistency & Primitives
- [ ] Standardize overlays on Radix Primitives (replace hand-rolled Modal, command palette, dropdowns).
- [ ] Non-blocking composer while streaming (keep input editable, support "Stop" + "Send anyway").
- [ ] Fix Copilot scrolling isolation across all pages (copilot panel should pin/scroll independently from main content like Draft page does).

### P2 — Features & Polish
- [ ] Tool receipt blocks per assistant turn (e.g., `Used: PubMed search · 47 results · 2.1s`).
- [ ] Inline approve/apply/undo buttons on artifacts (with toast confirmations).
- [ ] Visible error state for tool failures with "Retry last step" / "Resume run" buttons.
- [ ] Autonomy preset behavior contract badge in CopilotInput ("Reads auto, writes propose").
- [ ] Study Details Panel: Side panel from ledger links showing abstract, PDF excerpt, and a study-specific Copilot chat.
- [ ] Evidence Ledger: Add expand/unfold capability to rows for quick summaries.
- [ ] Import Study UX: Add duplicate study warning.
- [ ] Context chips above composer (show what AI sees, e.g., `Protocol`, `Ledger (42)`).

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Floating pill input boxes + Round send buttons.
- [x] Unified collapse buttons for side panels.
- [x] Streaming cursor (dots = thinking, cursor = writing).
- [x] Scroll-to-bottom sticky FAB.
- [x] Message hover actions (copy, save to notes) with focus/touch fallbacks.
- [x] Markdown code block language labels + copy buttons.
- [x] Full-width conversation layout vs side-panel routing.
- [x] 2-column dynamic suggestion chip grid.
- [x] Fix nested interactive elements (a11y standard).
- [x] Remote placebo UI search bar.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Inline citation chips `[Smith 2024]` linking to sources panel.
- [ ] Conversation list date grouping ("Today / Yesterday").
- [ ] Global toast system migration (Sonner).
- [ ] Unify `/ai` chat UI with project conversation (reduce code duplication).
- [ ] Entrance animation on newest message only.
- [ ] Mobile sidebar slide-in drawer.
- [ ] Context/prompt inspector drawer (debug panel).
- [ ] Dark mode (deferred indefinitely).
- [ ] Metadata auto-extract from PDFs on import.
- [ ] Protocol-Ledger UI Integration (show matching criteria on ledger rows).
