# Specialist: Frontend UI

## Purpose

Use for UI behavior/styling changes, especially routes under `app/project/[id]/...`.

## Invoke When

- Editing `next-app/app/project/[id]/**`
- Editing `next-app/components/**`
- Editing `next-app/styles/**`

## Required Tier 3 Reads

- `docs/plans/codex-ui-ux-plan.md` (or currently active UI plan)
- Any route-level docs or tests directly tied to touched files

## Guardrails

- Preserve shell embedding behavior (`isEmbeddedInProjectShell`) for project pages.
- No visible no-op controls.
- Suggestion buttons must act (send or prefill flow).
- Prefer shared primitives in `next-app/components/ui/`.
- Use tokens from `next-app/styles/tokens.css`; avoid hardcoded palette values unless intentionally local.
- Keep accessibility baseline (labels, keyboard nav, focus visibility).

## Mandatory Workflow

1. Confirm component behavior in both desktop and mobile layouts.
2. Update/add tests for meaningful behavior changes.
3. Run:
   - `npx tsc --noEmit`
   - `npx vitest run`

## Failure Modes to Watch

- Nested shell rendering or duplicate shell controls.
- Visual controls that appear actionable but do nothing.
- Route-specific regressions masked by desktop-only checks.
- Reintroducing one-off primitives where shared UI exists.

## Handoff Checklist

- Behavior changed and why.
- Tests added/updated.
- A11y and responsive checks completed.
