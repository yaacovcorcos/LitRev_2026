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
- **Home + Onboarding UX:** `/` now has a real first-run zero state (no sidebar) plus on-demand sample project entry, and quick project creation now routes into `/project/[id]/onboarding` guided setup with explicit skip-to-conversation.
- **Demo Guidance UX:** The sample project is visually distinct (badge + in-project banner) and demo-only inline guide cards are dismissible per card via localStorage.
- **Onboarding Defaults UX (Interim):** Guided setup default can be toggled from onboarding (settings-ready plumbing), while final Settings placement and per-project override UI are still pending.

## Active Tasks
*Work that is entirely unimplemented or currently broken.*

### P0 — Trust & Correctness
- [ ] Keep expanding real `axe()` coverage for newly introduced UI flows so CI remains a reliable accessibility gate.

### P1 — Consistency & Primitives
- [ ] Continue standardizing overlays on shared primitives (replace remaining hand-rolled modal/dropdown patterns).
- [ ] Fix Copilot scrolling isolation across all pages (copilot panel should pin/scroll independently from main content like Draft page does).
- [ ] Add final onboarding controls to Settings + project surfaces:
  - Move global default toggle for guided setup on new projects into Settings.
  - Add per-project override UI so users can opt in/out after creation.
- [ ] Upgrade Draft editor citations to support inline clickable citation markers that jump to the matching reference entry and deep-link to the study (ledger row or study page).
- [ ] Support citation display modes that hide raw links in prose: numbered citations and named/year citations (e.g., `[Smith 2024]`), both rendered with distinct styling and mapped to references.
- [ ] Auto-build/update the References section as draft content is written, with source URLs hidden behind the citation markers/reference entries (not shown inline in manuscript sentences).
- [ ] Upgrade Draft typography and heading/section styling so manuscript output looks publication-grade (not raw markdown-like).

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

- [x] Completed phase-6 polish/validation pass: refreshed demo guide copy, added a Results-section guide note, tokenized remaining onboarding/demo-guide rgba values, and revalidated with `npx tsc --noEmit` + `npx vitest run`.
- [x] Added phase-5 onboarding persistence UX wiring: guided setup default toggle (interim location), backend-driven create routing, and skip/save completion tracking.
- [x] Implemented the sample Yoga-for-Anxiety project flow with real seeded data plus reset/delete lifecycle controls.
- [x] Added demo-specific guidance surfaces (sample badge/banner and dismissible inline guide cards across overview, protocol, ledger, draft, notes, and memory).
- [x] Completed home IA + onboarding phase: zero-project first-run state, nav rename to Home, and quick-create -> guided `/project/[id]/onboarding` routing with skip path.
- [x] Expanded component-level `axe()` coverage beyond the initial picker scan (artifact cards now covered).
- [x] Removed canvas/noise warnings from UI a11y test output to keep failures signal-heavy.
- [x] Added chat UI coverage for metadata stripping, scoping decision-card action prompts, and mentioned-study add/duplicate state transitions.
- [x] Added explicit project-ID passthrough in `TimelineRenderer` for `/ai` route support where `useParams()` has no project id.
- [x] Migrated conversation selector UI to shared `ConversationPicker` (Radix Popover + `cmdk`) and removed hand-rolled keyboard listbox logic.

## Deferred / Parking Lot
*Ideas acknowledged but explicitly not active right now.*

- [ ] Global toast system migration (Sonner).
- [ ] Unify `/ai` chat UI with project conversation (reduce code duplication).
- [ ] Entrance animation on newest message only.
- [ ] Mobile sidebar slide-in drawer.
- [ ] Context/prompt inspector drawer (debug panel).
- [ ] Dark mode (deferred indefinitely).
- [ ] Metadata auto-extract from PDFs on import.
- [ ] Protocol-Ledger UI Integration (show matching criteria on ledger rows).
