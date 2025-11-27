# LitRev Frontend Migration Plan (Static → Next.js/React)

Purpose: step-by-step checklist to port the existing static prototype into a Next.js/React app without changing the visual design. Delete this file when migration is complete.

## Phase 0: Repo Prep
- [x] Create Next.js app (App Router) in a `next` folder or new branch; commit scaffold only.
- [x] Copy `styles.css` (temporarily global) and root variables; include Material Icons/Outfit font links in `_app` or `layout`.
- [x] Add TypeScript for better data shape safety.

## Phase 1: Data & Types
- [x] Define interfaces: `Project`, `ProjectStatus`, `ProjectProgress`.
- [x] Define interfaces: `ChatMessage`, `NavLink`.
- [x] Move seed data from `script.js` into `src/data/projects.ts` (mock only).
- [x] Add localStorage helpers (hydrate/save projects, sort/view prefs) in `src/lib/storage.ts`.

## Phase 2: Layout & Routing Parity
- [x] Implement routes: `/` (dashboard), `/project/[id]`, `/ai`, `/library` placeholder.
- [x] Build `AppLayout` with main sidebar + mobile nav; ensure collapsed state and padding sync.
- [x] Ensure only one `<main>` landmark per page; set `aria-hidden` on inactive regions if needed.

## Phase 3: Components (reuse existing markup/classes first)
- [x] `Sidebar` + nav items (with `.nav-label`), collapse toggle, aria sync.
- [x] `TopBar` (welcome/title area).
- [x] `SortDropdown` (focusable buttons, saved preference load).
- [x] `ViewToggle`, `SearchInput`.
- [x] `ProjectGrid` and `ProjectCard` (grid/list views, status badge, harvesting progress).
- [x] `CreateProjectModal` with focus trap cleanup.
- [x] `ProjectView` (detail page) with delete confirmation and shared data.
- [x] `AIView`: chat history sidebar toggle + main chat UI (mock interactions).
- [x] `MobileNav` with “New” wired to open modal.

## Phase 4: State & Persistence
- [x] Use React state/hooks for view, sort, grid/list toggle.
- [x] Hydrate from localStorage on mount; persist changes (projects, prefs).
- [x] Wire routing to set active nav and layout padding.

## Phase 5: Styling Cleanup (post-parity)
- [x] Scope global styles → CSS Modules or keep tokens in a shared file.
- [x] Remove duplicate `.sidebar` rules; centralize control height/token vars.
- [x] Adjust list-view title widths and badge alignment using flex (no hard widths).

## Phase 6: QA Checklist
- [ ] Visual parity with current static pages.
- [ ] Keyboard/ARIA: sidebar toggles, sort menu, modal trap, chat/project sidebars `aria-expanded/hidden`.
- [ ] Routing/back/forward works across `/`, `/project/[id]`, `/ai`, `/library`.
- [ ] Persistence: projects and prefs survive reload in mock mode.

Notes:
- Keep fake-data mode until backend is ready; swap storage helpers later for real API calls.
- Avoid big refactors during parity; change structure only when necessary for React patterns.
