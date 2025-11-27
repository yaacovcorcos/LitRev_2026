# Migration Progress (Static to Next.js)

Last update: in-progress migration to Next.js while keeping the static prototype intact.

## Completed
- Bootstrap Next.js App Router project with TypeScript and ESLint (`next-app/`).
- Installed dependencies (`npm install` in `next-app/`).
- Created migration plan checklist (`MIGRATION_PLAN.md`) to track phases and parity goals.
- Ported prototype global styles into Next (`next-app/app/globals.css`).
- Swapped layout font to Outfit via `next/font`, added Material Icons link in `layout.tsx`.
- Added typed seed data (`next-app/data/projects.ts`, `next-app/types/project.ts`).
- Replaced `app/page.tsx` with the dashboard shell using mock projects to validate styles.
- Added nav/data types and storage helpers (`types/chat.ts`, `types/nav.ts`, `lib/storage.ts`).
- Componentized core pieces (Sidebar, MobileNav, ProjectGrid) and wired them into `app/page.tsx`.
- Added placeholders/routes for `/ai` and `/library`.
- Componentized the top bar and controls (sort/view) and kept stateful behavior with storage persistence.
- Added shared `AppShell` layout and applied it to dashboard, project detail, AI, and library routes.
- Built an AI page shell with chat history/sidebar and chat interface layout for parity.
- Added sidebar collapse/mobile “New” handling, modal focus trap, and project detail hydration from storage.
- Added AI tone persistence, history selection state, and maintained chat interactivity.
- Projects context now seeds defaults, exposes lookup/delete, and shares state across routes (Phase 4 complete).
- Implemented full project workspace layout with collapsible in-project sidebar, delete confirmation, and routing back to dashboard.
- Library view now supports search/sort filtering to mirror static behavior.
- Control-height tokens, list-view flex fixes, and other CSS cleanups applied via shared token/base files.
- Scoped layout/controls/cards/project/AI styles into CSS Modules, trimmed globals, and removed unused Tailwind/PostCSS deps.
- Synced AppShell collapse tokens with AI/project layouts, added modal focus restore + deep project workspace panels and admin actions.

## Next Up
- Run full parity + accessibility QA (visual diff, focus order, aria-expanded sync, browser navigation, persistence verification).
- Expand AI chat + library data sources to pull from future backend endpoints.
- Outline backend integration plan (API contracts, data loading) now that the UI baseline is stable.

## Notes
- Static prototype (`index.html`, `script.js`, `styles.css`) is parked in `archive/static-prototype/` for reference; primary app is `next-app/`. We will delete this progress file when migration is complete.
