---
name: frontend-ui-integration
description: Implement or extend LitRev frontend workflows in next-app/ using existing server actions/services while following project UI contracts, token-first styling, accessibility rules, and Vitest/typecheck gates.
---
# Skill: Frontend UI Integration (LitRev 2026)

## Purpose

Implement or extend LitRev user-facing workflows in the Next.js app using existing backend contracts and project conventions.

## When to use this skill

- The change is primarily UI/UX in `next-app/`.
- Existing server actions/services already support the feature, or only additive wiring is needed.
- No Prisma schema or migration work is required.

## Inputs

- Feature description and user flow.
- Target route/component paths (for example `app/project/[id]/...`, `components/...`).
- Related server entrypoints (`app/actions/...`) and service files (`lib/server/...`) if applicable.
- Design references and behavior requirements.

## Out of scope

- Prisma schema changes or migrations.
- Deploy-only work.
- Introducing a new UI framework, styling system, or component library.

## Repo conventions (required)

- App root is `next-app/` (not repo root).
- `@/` alias resolves to `next-app/`.
- Prefer shared primitives in `next-app/components/ui/` before creating one-off controls.
- Use token-first styling from `next-app/styles/tokens.css`; avoid hardcoded palette values unless intentionally local and reviewed.
- Treat control density and action placement as deliberate design decisions: default to the smallest viable control, group actions by context, and avoid promoting secondary operations into primary buttons.
- Respect route-level architecture:
  - `next-app/app/actions/` for server actions.
  - `next-app/lib/server/` for backend service logic.
  - `next-app/lib/` for shared pure logic.
- For pages under `next-app/app/project/[id]/...`, respect `isEmbeddedInProjectShell` and avoid nested shell duplication.

## Required behavior

1. Keep strong TypeScript typing for props, derived state, and server payloads.
2. Handle loading, empty, error, and success states with existing UI patterns.
3. Ensure accessibility baseline:
   - Icon-only buttons include `aria-label`.
   - Keyboard navigation remains intact.
   - Focus styles are preserved (or replaced accessibly).
4. No visible no-op controls:
   - Hide controls with unavailable behavior, or disable with explicit explanation text.
5. If suggestion chips/buttons are rendered, they must either send immediately or prefill via `prefill` + `onPrefillConsumed`.
6. Validate responsive behavior on desktop and mobile.
7. Use semantic interactive elements:
   - Use `<button>` for actions.
   - Use `<a>`/`<Link>` for navigation (avoid clickable `div`/`span` patterns).
8. Form UX baseline:
   - Inputs need visible labels or `aria-label`.
   - Use appropriate input types and autocomplete where relevant.
   - Show inline validation errors and focus first invalid field on submit.
9. Motion and feedback quality:
   - Honor `prefers-reduced-motion`.
   - Avoid `transition: all`; scope transitions to explicit properties.
   - Use subtle transitions for interactive state changes; no instant state changes for hover, focus, expand/collapse, or status feedback unless the interaction is intentionally immediate.
   - Every interactive element needs visible feedback on hover, focus, pressed, disabled, or selected states.
   - Never remove outlines/focus styles without an accessible replacement.
10. Control hierarchy and action placement:
   - Default to the smallest viable control for the job: icon-only for familiar compact actions, small text buttons for inline secondary actions, standard buttons for primary operations.
   - Header actions should be grouped together in a dedicated actions container.
   - Row actions should stay compact and context-local; prefer icon buttons or short text actions, and reveal low-priority actions on hover when appropriate.
   - Form actions should sit at the bottom of the form, with the primary action visually dominant and the secondary action clearly subordinate.
   - Inline actions should stay adjacent to the content they affect.
11. Visual restraint:
   - Limit each view or section to one clearly primary action unless the workflow genuinely requires more.
   - Prefer ghost, link-style, or icon treatments for secondary operations.
   - Button text should stay concise and task-focused; avoid long labels that read like instructions.
   - Question whether a control needs to exist at all before adding it.
12. Safety and consistency checks:
   - Destructive actions require confirmation or undo affordance.
   - Use `Intl.DateTimeFormat`/`Intl.NumberFormat` for user-facing date/number formatting.
   - For content images, include explicit dimensions; lazy-load non-critical images.
   - Keep touch targets usable on mobile even when controls are visually compact.

## Required artifacts

- Updated route/components/hooks in appropriate `next-app/` modules.
- Updated/added Vitest tests for changed behavior when UI behavior is meaningfully changed.
- Focused diffs: avoid unrelated file edits.

## Implementation checklist

1. Map the request to route-level and shared component files in `next-app/`.
2. Confirm existing server action/service contracts before changing UI wiring.
3. Reuse existing primitives in `components/ui/` and token variables from `styles/tokens.css`.
4. Implement UI updates with embedded-shell and suggestion-button constraints where relevant.
5. Run a final UI audit pass for semantic controls, form labeling, motion/focus, and destructive-action safeguards.
6. Add or update tests for meaningful behavior changes.
7. Run validation commands from `next-app/` (below).

## Verification

Run from `next-app/`:

- `npx tsc --noEmit`
- `npx vitest run`

The skill is complete when:

- Typecheck and tests pass.
- UI behavior matches requirements across normal, error, and boundary states.
- Accessibility and responsive checks pass.
- Only intended files are changed.

## Safety and escalation

- If the change requires Prisma schema/migration work, split into a separate DB-scoped task and follow `docs/runbooks/db-ops.md`.
- If product behavior expectations conflict with `AGENTS.md` UI delivery contract, follow the contract and explicitly call out the conflict.
