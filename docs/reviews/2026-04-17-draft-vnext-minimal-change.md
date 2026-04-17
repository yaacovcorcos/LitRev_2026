# Draft VNext Minimal-Change Foundation (April 17, 2026)

## Scope
This note records the first shipped implementation pass of `DAP-01`.

The goal of this pass was not a broad redesign. It was to improve the draft route foundation while preserving the current draft shell as much as possible.

## What Shipped
- Added a dedicated `DraftSupportPanel` abstraction under `next-app/app/project/[id]/draft/DraftSupportPanel.tsx`.
- Switched the route to render the left draft rail through that abstraction instead of hard-wiring the evidence panel directly inside `page.tsx`.
- Kept the current visible left-rail behavior anchored to `Evidence` so there is no accidental redesign in this slice.
- Added the rollout gate `isDraftVNextMinimalChangeEnabled()` in `next-app/lib/feature-flags.ts`.
- Upgraded the draft route normalization path so draft snapshots and local persistence now synchronize edited section content back into the canonical manuscript model via `synchronizeDraftState(...)`.
- Added regression coverage proving persisted local draft state now keeps manuscript content synchronized after editor edits and `pagehide` flush.

## Why This Matters
Before this pass, the route could normalize citations while still leaving the canonical manuscript representation effectively downstream of the route state.

After this pass:
- the manuscript model is part of the active truth during draft persistence/snapshot flows
- the left draft support lane has a real component seam
- future work can evolve that lane into a single context panel instead of bolting on more route-owned sidebars

## What Stayed Intentionally The Same
- The current draft shell remains visually familiar.
- The top section tabs remain the orientation anchor.
- `Section` / `Full Draft` remains the current user-facing mode model.
- The right-side copilot ownership stays unchanged.
- No broad visual redesign shipped in this slice.

## What Still Remains For `DAP-01`
This pass does **not** complete the whole `DAP-01` program.

Still outstanding:
- a thinner route/controller split
- stronger single-editor / one-projection architecture for `Section` and `Full Draft`
- fuller feature-flagged burn-in comparison between the current route shell and the next controller path
- future UI-planned context-panel tabs for `Evidence`, `Assets`, `Pages`, and `Review`

## Validation
- `npm install`
- `npm run lint`
- `npx tsc --noEmit`
- `npx vitest run`
- `npx vitest run app/project/[id]/draft/__tests__/page.test.tsx`

## Follow-On
The next honest continuation is:
- keep `DAP-01` moving on route/controller extraction and projection honesty without broad visual churn
- keep later context-panel UI work approval-gated with the user before any visible tabbed panel ships
