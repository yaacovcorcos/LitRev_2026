# UI, UX, & Layout Plan

## Current Architecture
*How this domain works right now, based on actual committed code.*

- **Component Library:** Radix Primitives for overlays and menus (Dialog, AlertDialog, Popover, DropdownMenu) combined with CSS Modules (unstyled), plus `cmdk` for command palette interactions.
- **Shared Selectors:** `components/ui/ConversationPicker` is a shared conversation-selector primitive (Radix Popover + `cmdk`) used by both panel copilot and full-page conversation views.
- **Design System:** Glassmorphism (`backdrop-filter: blur`, rounded corners, soft shadows). Custom semantic CSS tokens (`tokens.css`). Typography: Outfit font.
- **Chat Layouts:**
  - `variant="page"`: Full width, transparent AI messages, tinted user messages.
  - `variant="panel"`: Copilot side-panel style.
- **Generative UI:** Artifacts (PlanCard, StudyCard, etc.) render inline as interactive components via `ArtifactWrapper`.
- **Animations:** Staggered chip animations (`@keyframes fadeInUp`), streaming cursor (dots/cursor), smooth scroll-to-bottom. Accessible defaults (`prefers-reduced-motion`).
- **Scoping UX:** `scoping_report` renders as a decision-first card with one-click actions and collapsible full analysis on both project conversation and `/ai`.
- **Mentioned Studies UX:** Assistant messages render lightweight mentioned-study chips (title/year/link + add state), with direct add-to-ledger actions and hidden metadata stripping before markdown render.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P0 — Trust & Correctness
- [ ] Keep expanding real `axe()` coverage for newly introduced UI flows so CI remains a reliable accessibility gate.

### P1 — Consistency & Primitives
- [ ] Continue standardizing overlays on shared primitives (replace remaining hand-rolled modal/dropdown patterns).
- [ ] Fix Copilot scrolling isolation across all pages (copilot panel should pin/scroll independently from main content like Draft page does).

### P2 — Features & Polish
- [ ] Tool receipt blocks per assistant turn (e.g., `Used: PubMed search · 47 results · 2.1s`).
- [ ] Inline approve/apply/undo buttons on artifacts (with toast confirmations).
- [ ] Visible error state for tool failures with "Retry last step" / "Resume run" buttons.
- [ ] Autonomy preset behavior contract badge in CopilotInput ("Reads auto, writes propose").
- [ ] Study Details Panel: Side panel from ledger links showing abstract, PDF excerpt, and a study-specific Copilot chat.
- [ ] Import Study UX: Add duplicate study warning.
- [ ] Context chips above composer (show what AI sees, e.g., `Protocol`, `Ledger (42)`).
- [ ] Manual UX sign-off checklist (both surfaces):
  - Project conversation mode.
  - `/ai` page mode.

## Recently Completed
*Finished work that might still be fragile or require monitoring. Prune oldest first.*

- [x] Expanded component-level `axe()` coverage beyond the initial picker scan (artifact cards now covered).
- [x] Removed canvas/noise warnings from UI a11y test output to keep failures signal-heavy.
- [x] Added chat UI coverage for metadata stripping, scoping decision-card action prompts, and mentioned-study add/duplicate state transitions.
- [x] Added explicit project-ID passthrough in `TimelineRenderer` for `/ai` route support where `useParams()` has no project id.
- [x] Migrated conversation selector UI to shared `ConversationPicker` (Radix Popover + `cmdk`) and removed hand-rolled keyboard listbox logic.
- [x] Fixed dead side-panel empty-state suggestions by wiring click -> `prefill` in `ProjectCopilot`.
- [x] Removed visible no-op artifact actions (unsupported actions now hidden unless behavior is wired).
- [x] Added first component-level `axe()` scan (`ConversationPicker`) and jsdom polyfills needed by modern UI primitives.
- [x] Replaced brittle mobile copilot hide selector (`nth-child`) with an explicit shell class (`copilotPane`).
- [x] Project shell embedding guard prevents double-render sidebars on `memory` and `ledger` pages.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Inline citation chips `[Smith 2024]` linking to sources panel.
- [ ] Global toast system migration (Sonner).
- [ ] Unify `/ai` chat UI with project conversation (reduce code duplication).
- [ ] Entrance animation on newest message only.
- [ ] Mobile sidebar slide-in drawer.
- [ ] Context/prompt inspector drawer (debug panel).
- [ ] Dark mode (deferred indefinitely).
- [ ] Metadata auto-extract from PDFs on import.
- [ ] Protocol-Ledger UI Integration (show matching criteria on ledger rows).
