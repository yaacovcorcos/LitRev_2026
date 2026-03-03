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

## Feature Flags (Default Off)

- `NEXT_PUBLIC_MOBILE_VP_V2`
- `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`
- `NEXT_PUBLIC_MOBILE_LEDGER_V2`
- `NEXT_PUBLIC_MOBILE_NOTES_V2`
- `NEXT_PUBLIC_MOBILE_DRAFT_V2`
- `NEXT_PUBLIC_MOBILE_AI_V2`
- `NEXT_PUBLIC_MOBILE_POPUP_V2`

All route migrations must be shipped behind route-specific flags and canary-validated before enabling.

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

## Canary Checklist

1. iOS Safari + Chrome Android manual pass:
   - Address bar collapse/expand does not clip content
   - Keyboard open does not hide composer/actions
   - No dead-scroll / double-scroll traps
2. Route flag rollback validated (toggle flag to `0` without code revert)
3. `npx tsc --noEmit`
4. `npx vitest run`
5. Mobile smoke e2e pass (once Playwright infra is added)

## Browser Support Notes

- Primary target: current iOS Safari + current Chrome Android.
- `dvh` support is expected in target browsers; fallback remains required for consistency.
