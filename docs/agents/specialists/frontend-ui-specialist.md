# Specialist: Frontend UI

## Purpose

`AGENTS.md` owns route selection. This specialist governs frontend execution after the UI/frontend route has been selected.
This specialist owns repo-specific execution guardrails after routing; the frontend skill owns reusable execution procedure and handoff shape.

Use for frontend-only UX/UI changes in `next-app/` where backend contracts already exist and the task is primarily about user-facing behavior, layout, interaction, accessibility, or visual consistency.

## Invoke When

- `AGENTS.md` routes the task here because it touches `next-app/app/project/[id]/**`, `next-app/components/**`, or `next-app/styles/**`
- Extending an existing frontend workflow backed by current actions/APIs without changing schema, auth, or backend-service ownership

## Inputs

- User flow summary: what the user is trying to do and the expected outcome
- Touched routes/components: pages, feature modules, hooks, and shared UI involved
- Reused actions/APIs and types: existing server actions, route handlers, response types, or feature flags the UI depends on
- Design references: existing screens, mocks, or visual patterns to preserve or evolve
- Constraints: accessibility, responsive behavior, performance, rollout/feature-flag, and security requirements

## Required Tier 3 Reads

- `docs/architecture/frontend-quality-bar.md`
- `docs/runbooks/frontend-review-loop.md`
- `docs/plans/README.md` to identify the active relevant UI plan
- The touched route/component files and nearby tests before editing
- Any route-level docs directly tied to touched files
- If `AGENTS.md` routes platform admin UI here, also read `docs/runbooks/admin-access.md` and `docs/plans/plan-backend.md`

## Out of Scope / Escalate

- Schema, migration, or persistent data-model changes
- Authentication, authorization, or security-model changes
- New backend contracts, services, or API ownership changes
- Agent-runtime ownership changes that belong under the runtime specialist

## Guardrails

- Preserve shell embedding behavior (`isEmbeddedInProjectShell`) for project pages.
- For draft-route work under `next-app/app/project/[id]/draft/**`, do not implement UI changes without explicit user approval first.
- For any draft implementation plan with UI changes, clearly flag each UI-changing phase as approval-gated and include a warning that the user must verify the visual/interaction change before approving it.
- Preserve existing route/layout conventions unless the task explicitly changes them.
- No visible no-op controls.
- Suggestion buttons must act (send or prefill flow).
- Repo-owned frontend doctrine outranks local skills.
- Prefer shared primitives in `next-app/components/ui/`.
- Reuse existing context/hook/controller ownership before introducing new state patterns.
- Treat direct `useEffect` / `useLayoutEffect` as a smell in feature UI code.
- Direct effects remain allowed only for explicit external synchronization with DOM, browser, editor, media-query, scroll, focus, or canvas systems with clear setup/cleanup semantics.
- Do not introduce direct effects for route-critical data loading, prop/state sync, reset choreography, latest-value sync, or flag-driven orchestration.
- Prefer server/bootstrap data, reducers, keyed remounts, event handlers, derivation, and shared external-sync hooks in `next-app/hooks/`.
- Default latest-value policy is React `useEffectEvent`; do not add new generic `useLatestRef` helpers as the normal replacement pattern.
- For async or conditional flows, verify loading, empty, error, and success states using existing primitives.
- Respect feature flags and rollout mechanisms where applicable.
- Use tokens from `next-app/styles/tokens.css`; avoid hardcoded palette values unless intentionally local.
- Keep accessibility baseline (labels, keyboard nav, focus visibility).
- Use semantic interactions: actions use `<button>`, navigation uses `<a>`/`<Link>`, and avoid clickable `div`/`span`.
- Keep form UX robust: visible labels or `aria-label`, appropriate input types/autocomplete, inline validation, and focus the first invalid field on submit.
- Motion/focus quality: honor `prefers-reduced-motion`, avoid `transition: all`, and never remove focus styles without an accessible replacement.
- Destructive actions require confirmation or an immediate undo path.
- Use `Intl.DateTimeFormat` and `Intl.NumberFormat` for user-facing date/number formatting.
- For content images, include explicit dimensions and lazy-load non-critical images.
- Error messages must use a calm, minimalist UI pattern: concise copy, clear next step, no noisy styling, and visual hierarchy consistent with existing tokens.
- Avoid decorative dashboarding on task-heavy workspace surfaces and generic AI-app visual language.

## Required Behavior

- Use strong typing for props, local UI state, and reused action/API result shapes.
- For async or conditional flows, cover loading, empty, error, and success states with existing primitives.
- Ensure keyboard accessibility, focus visibility, and screen-reader clarity.
- Preserve responsive behavior across desktop and mobile layouts.
- Reuse existing route/layout/state patterns before introducing new frontend architecture.

## Required Artifacts

- Updated components, hooks, and supporting UI files in the correct feature module
- Tests for meaningful behavior or interaction changes
- Integration/component tests where the repo already uses that pattern for the touched surface
- Doc updates when behavior or workflow expectations changed

## Mandatory Workflow

1. Confirm `AGENTS.md` routed the task here and identify the exact user flow, touched routes, and reused actions/APIs.
2. Read the touched route/component implementation and nearby tests before editing.
3. Read `docs/plans/README.md` and identify the active relevant UI plan when plan context is needed.
4. Write:
   - a `visual thesis`
   - a `structure thesis`
   - an `interaction thesis`
5. Before adding any new effect, classify it:
   - external synchronization: allowed
   - anything else: redesign it
6. Prefer keyed remounts for identity resets and event handlers for user-triggered actions.
7. Run a final UI audit for semantic controls, async-state coverage when applicable, form labeling/validation, motion/focus behavior, destructive-action safeguards, and error-message presentation quality.
8. Update/add tests for meaningful behavior changes.
9. Run:
   - `npm run lint`
   - `npm run lint:styles` if CSS files were touched
   - `npm run typecheck`
   - `npm run test:vitest`

## Failure Modes to Watch

- Frontend tasks quietly expanding into backend/auth/runtime ownership.
- Nested shell rendering or duplicate shell controls.
- Visual controls that appear actionable but do nothing.
- Route-specific regressions masked by desktop-only checks.
- Missing loading/empty/error handling on async or conditional flows.
- Reintroducing one-off primitives where shared UI exists.
- Reintroducing one-off state patterns where existing controllers/hooks already own the flow.
- Error states that are visually noisy, unclear, or inconsistent with token-based minimalist UI patterns.

## Handoff Checklist

- Behavior changed and why.
- Routes/components touched.
- Existing actions/APIs reused.
- Tests added/updated.
- Commands run.
- A11y and responsive checks completed.
- Any approval-gated or follow-up items remaining.
