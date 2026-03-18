# Specialist: Frontend UI

## Purpose

Use for UI behavior/styling changes, especially routes under `app/project/[id]/...`.

## Invoke When

- Editing `next-app/app/project/[id]/**`
- Editing `next-app/components/**`
- Editing `next-app/styles/**`

## Required Tier 3 Reads

- `docs/plans/plan-ux-ui.md` (or currently active UI plan)
- Any route-level docs or tests directly tied to touched files

## Guardrails

- Preserve shell embedding behavior (`isEmbeddedInProjectShell`) for project pages.
- For draft-route work under `next-app/app/project/[id]/draft/**`, do not implement UI changes without explicit user approval first.
- For any draft implementation plan with UI changes, clearly flag each UI-changing phase as approval-gated and include a warning that the user must verify the visual/interaction change before approving it.
- No visible no-op controls.
- Suggestion buttons must act (send or prefill flow).
- Prefer shared primitives in `next-app/components/ui/`.
- Use tokens from `next-app/styles/tokens.css`; avoid hardcoded palette values unless intentionally local.
- Keep accessibility baseline (labels, keyboard nav, focus visibility).
- Use semantic interactions: actions use `<button>`, navigation uses `<a>`/`<Link>`, and avoid clickable `div`/`span`.
- Keep form UX robust: visible labels or `aria-label`, appropriate input types/autocomplete, inline validation, and focus the first invalid field on submit.
- Motion/focus quality: honor `prefers-reduced-motion`, avoid `transition: all`, and never remove focus styles without an accessible replacement.
- Destructive actions require confirmation or an immediate undo path.
- Use `Intl.DateTimeFormat` and `Intl.NumberFormat` for user-facing date/number formatting.
- For content images, include explicit dimensions and lazy-load non-critical images.
- Error messages must use a calm, minimalist UI pattern: concise copy, clear next step, no noisy styling, and visual hierarchy consistent with existing tokens.

## Mandatory Workflow

1. Confirm component behavior in both desktop and mobile layouts.
2. Run a final UI audit for semantic controls, form labeling/validation, motion/focus behavior, destructive-action safeguards, and error-message presentation quality.
3. Update/add tests for meaningful behavior changes.
4. Run:
   - `npx tsc --noEmit`
   - `npx vitest run`

## Failure Modes to Watch

- Nested shell rendering or duplicate shell controls.
- Visual controls that appear actionable but do nothing.
- Route-specific regressions masked by desktop-only checks.
- Reintroducing one-off primitives where shared UI exists.
- Error states that are visually noisy, unclear, or inconsistent with token-based minimalist UI patterns.

## Handoff Checklist

- Behavior changed and why.
- Tests added/updated.
- A11y and responsive checks completed.
