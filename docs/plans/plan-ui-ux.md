# UI, UX, & Layout Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Component Library:** Radix Primitives for overlays and menus (Dialog, AlertDialog, Popover, DropdownMenu) combined with CSS Modules (unstyled), plus `cmdk` for command palette interactions.
- **Design System:** Glassmorphism (`backdrop-filter: blur`, rounded corners, soft shadows). Custom semantic CSS tokens (`tokens.css`). Typography: Outfit font.
- **Chat Layouts:**
  - `variant="page"`: Full width, transparent AI messages, tinted user messages.
  - `variant="panel"`: Copilot side-panel style.
- **Generative UI:** Artifacts (PlanCard, StudyCard, etc.) render inline as interactive components via `ArtifactWrapper`.
- **Animations:** Staggered chip animations (`@keyframes fadeInUp`), streaming cursor (dots/cursor), smooth scroll-to-bottom. Accessible defaults (`prefers-reduced-motion`).
- **Scoping UX:** `scoping_report` renders as a decision-first card with one-click actions and collapsible full analysis on both project conversation and `/ai`.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P0 — Trust & Correctness
- [ ] Make listbox/menu/option UIs keyboard-correct (migrate Conversation dropdown to Radix).
- [ ] Add real `axe()` scan tests and enforce them in CI (current CI runs Vitest and structural a11y invariants, but not comprehensive `axe()` scans).

### P1 — Consistency & Primitives
- [ ] Standardize overlays on Radix Primitives (replace hand-rolled Modal, command palette, dropdowns).
- [ ] Fix Copilot scrolling isolation across all pages (copilot panel should pin/scroll independently from main content like Draft page does).

### P2 — Features & Polish
- [ ] Tool receipt blocks per assistant turn (e.g., `Used: PubMed search · 47 results · 2.1s`).
- [ ] Inline approve/apply/undo buttons on artifacts (with toast confirmations).
- [ ] Visible error state for tool failures with "Retry last step" / "Resume run" buttons.
- [ ] Autonomy preset behavior contract badge in CopilotInput ("Reads auto, writes propose").
- [ ] In-chat "Mentioned studies" minimalist row under assistant turns:
  - Compact chips/list items with title + year + source link.
  - Per-item action states: `Add to ledger`, `Already in ledger`, `Adding...`, `Added`.
  - Keep interaction lightweight (not full artifact cards).
- [ ] Study Details Panel: Side panel from ledger links showing abstract, PDF excerpt, and a study-specific Copilot chat.
- [ ] Import Study UX: Add duplicate study warning.
- [ ] Context chips above composer (show what AI sees, e.g., `Protocol`, `Ledger (42)`).
- [ ] Add UI test coverage for chat-specific behavior:
  - Metadata stripping: `<!-- SCOPING_REPORT: ... -->` never appears in rendered assistant text.
  - Scoping decision-card actions trigger expected prompts/mode behavior.
  - Mentioned-study add flow and disabled/already-added states.
- [ ] Manual UX sign-off checklist (both surfaces):
  - Project conversation mode.
  - `/ai` page mode.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Markdown code block language labels + copy buttons.
- [x] Full-width conversation layout vs side-panel routing.
- [x] 2-column dynamic suggestion chip grid.
- [x] Fix nested interactive elements (a11y standard).
- [x] Remote placebo UI search bar.
- [x] Project shell embedding guard prevents double-render sidebars on `memory` and `ledger` pages.
- [x] Added semantic surface tokens (`--bg-secondary`, `--border-default`) and utility `.btn-danger`.
- [x] Restored visible focus styling via global/component `:focus-visible` rules.
- [x] Composer remains editable while streaming, with explicit "Stop generating" and "Send and interrupt" controls.
- [x] Evidence Ledger rows support expand/unfold interaction for quick in-row summaries and actions.

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
