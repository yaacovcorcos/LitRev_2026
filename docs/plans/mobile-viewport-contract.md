# Mobile Viewport + Rollout Contract

## Purpose

Define one stable mobile viewport contract before route-level UI migrations.

## Scope

- Applies to `next-app` mobile web surfaces (`/ai`, project shell, and project sub-routes).
- Defines feature flags, viewport behavior, telemetry events, and rollout gates.

## Adoption Status

- `NEXT_PUBLIC_MOBILE_VP_V2`: runtime + token contract is implemented.
- Project shell root height now supports viewport-token mode when `NEXT_PUBLIC_MOBILE_VP_V2=1`.
- `/ai` route viewport migration is independently gated by `NEXT_PUBLIC_MOBILE_AI_V2`.
- `/project/[id]/notes` mobile layout adjustments are gated by `NEXT_PUBLIC_MOBILE_NOTES_V2`.
- `/project/[id]/ledger` and `/project/[id]/ledger/[studyId]` viewport-height updates are gated by `NEXT_PUBLIC_MOBILE_LEDGER_V2`.
- `/project/[id]/draft` viewport-height updates are gated by `NEXT_PUBLIC_MOBILE_DRAFT_V2`.
- Popup chat mobile viewport adjustments are gated by `NEXT_PUBLIC_MOBILE_POPUP_V2`.
- Project-shell root scroll lock now supports flag-gated mobile unlock behavior via `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`.

## Feature Flags (Default Off)

- `NEXT_PUBLIC_MOBILE_VP_V2`
- `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`
- `NEXT_PUBLIC_MOBILE_LEDGER_V2`
- `NEXT_PUBLIC_MOBILE_NOTES_V2`
- `NEXT_PUBLIC_MOBILE_DRAFT_V2`
- `NEXT_PUBLIC_MOBILE_AI_V2`
- `NEXT_PUBLIC_MOBILE_POPUP_V2`

All route migrations must be shipped behind route-specific flags and canary-validated before enabling.

## Promotion Order (Default-Off -> Canary -> Broad)

Enable flags in this order to minimize cross-surface regressions:

1. `NEXT_PUBLIC_MOBILE_VP_V2`
2. `NEXT_PUBLIC_MOBILE_AI_V2`
3. `NEXT_PUBLIC_MOBILE_NOTES_V2`
4. `NEXT_PUBLIC_MOBILE_LEDGER_V2`
5. `NEXT_PUBLIC_MOBILE_DRAFT_V2`
6. `NEXT_PUBLIC_MOBILE_POPUP_V2`
7. `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2` (last, after route containment checks pass)

For each step:

- Enable only one new flag at a time.
- Run the canary checklist below on iOS Safari + Chrome Android.
- If any blocker appears, revert only that flag to `0` and keep previously validated flags unchanged.

### Rollback Matrix

- `/ai` regression: set `NEXT_PUBLIC_MOBILE_AI_V2=0`
- `/project/[id]/notes` regression: set `NEXT_PUBLIC_MOBILE_NOTES_V2=0`
- `/project/[id]/ledger` regression: set `NEXT_PUBLIC_MOBILE_LEDGER_V2=0`
- `/project/[id]/draft` regression: set `NEXT_PUBLIC_MOBILE_DRAFT_V2=0`
- Popup mobile regression: set `NEXT_PUBLIC_MOBILE_POPUP_V2=0`
- Mobile dead-scroll/double-scroll regression in shell: set `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=0`

## Viewport Contract

1. Prefer dynamic viewport units (`dvh`) for primary app-height containers.
2. Use `svh`/fallback strategy for browsers with inconsistent `dvh`.
3. Avoid route-local `100vh` calculations as a primary source of truth.
4. Keep a single scroll owner per screen.
5. Never rely on `html/body` global lock for mobile unless explicitly canary-gated.

### Runtime Contract (Flag-Gated)

When `NEXT_PUBLIC_MOBILE_VP_V2=1`:

- A client runtime (`MobileViewportRuntime`) updates `--app-vh` and `--app-height` from
  `window.visualViewport.height` when available, else `window.innerHeight`.
- Updates are applied on `resize`, `orientationchange`, `visualViewport.resize`, and mobile breakpoint changes.
- CSS fallback remains active:
  - `--app-height` defaults to `100vh` and upgrades to `100dvh` when supported.
  - `--app-min-height` defaults to `100vh` and upgrades to `100svh` when supported.

## Telemetry Schema

Mobile metrics are recorded with:

- `mobile_viewport_issue`
- `mobile_keyboard_overlap`
- `mobile_action_tap`
- `mobile_drawer_opened`
- `mobile_flow_completed`

Storage key: `litrev:mobile-metrics:v1` (best-effort local telemetry for canary validation).
Current authority: **debug-only local telemetry** (not a release gate source of truth until server ingest is added).

### KPI Mapping

- Use these metrics for canary debugging/trend checks only.
- Promotion/rollback decisions still require manual device validation + e2e pass.
- Task-success baseline: compute success rate from `mobile_flow_completed` where:
  - `flowId=ai_message_send`
  - `flowId=popup_continue_to_copilot`
- Mis-tap proxy baseline: compute ratio of rapid repeated `mobile_action_tap` events for the same `actionId` on the same route within 800ms.
- Current instrumented surfaces:
  - `project_shell`: mode and tab taps (`mobile_action_tap`)
  - `popup`: send tap + continue-to-copilot flow completion (`mobile_action_tap`, `mobile_flow_completed`)

## Canary Checklist

1. iOS Safari + Chrome Android manual pass:
   - Address bar collapse/expand does not clip content
   - Keyboard open does not hide composer/actions
   - No dead-scroll / double-scroll traps
2. Route flag rollback validated (toggle flag to `0` without code revert)
3. `npx tsc --noEmit`
4. `npx vitest run`
5. Mobile smoke e2e pass (`npm run test:e2e:mobile`)

## Browser Support Notes

- Primary target: current iOS Safari + current Chrome Android.
- `dvh` support is expected in target browsers; fallback remains required for consistency.
