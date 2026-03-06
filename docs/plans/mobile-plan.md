# Mobile Plan

## Purpose
Define one canonical strategy for the entire product mobile experience.

This plan combines execution tasks and rollout policy so mobile UX changes ship consistently and safely.
Chat UX is one section within this broader mobile plan, not the whole plan.

## Scope
- App-wide mobile UX quality and reliability.
- Shared mobile foundations: viewport, breakpoints, safe areas, scroll ownership, and touch ergonomics.
- Surface-specific sections: foundation, chat, onboarding, navigation, admin, and others as added.

## Current Architecture
- Shared mobile breakpoint infrastructure exists in `next-app/lib/mobile/breakpoints.ts`; the canonical mobile breakpoint contract is `900px` across JS media-query logic and CSS mobile breakpoints.
- Shared mobile viewport runtime exists in `next-app/components/mobile/MobileViewportRuntime.tsx` and is mounted globally from `next-app/app/providers.tsx`.
- Shared root scroll-lock policy exists in `next-app/lib/mobile/scroll-lock-policy.ts`.
- Mobile behavior is already flag-gated and default-off for several surfaces:
  - `NEXT_PUBLIC_MOBILE_VP_V2`
  - `NEXT_PUBLIC_MOBILE_AI_V2`
  - `NEXT_PUBLIC_MOBILE_POPUP_V2`
  - `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`
  - `NEXT_PUBLIC_MOBILE_LEDGER_V2`
  - `NEXT_PUBLIC_MOBILE_NOTES_V2`
  - `NEXT_PUBLIC_MOBILE_DRAFT_V2`
- Shared chat-runtime direction exists for `/ai` and project copilot via chat unification work; popup full runtime convergence remains pending (`U3` in chat unification plan).
- Core route adoption of the mobile contract is still incomplete:
  - app shell and sidebar still use raw `100vh` source-of-truth patterns
  - home and login still use route-local viewport math
  - protocol still uses route-local height ownership
  - telemetry and some responsive behavior still classify mobile at `768px`
- Project shell hides embedded copilot pane on narrow viewports; conversation mode is primary for project mobile chat.

## Section: Mobile Foundation (Current Execution Priority)
Goal: finish the cross-app mobile foundation before deeper per-surface polish.

Definition of done:
1. Shell, home, login/auth, and protocol use the same mobile breakpoint and viewport contract.
2. No unallowlisted core route uses raw `100vh` as the authored mobile source-of-truth.
3. Core shared mobile controls meet the `44px` touch-target rule.
4. Mobile regressions are observable through reliability telemetry and behavior-level mobile e2e.
5. Chat and future surface work can build on this foundation instead of compensating for shell drift.

## Section: Chat Experience
- Surfaces: project conversation mode (`/project/[id]`), `/ai`, popup chat.
- Goal: unify behavior and quality across history, timeline, composer, and handoff flows after the mobile foundation is stable.

## Principles (Non-Negotiable)
1. One canonical mobile breakpoint contract.
2. One viewport-height contract for mobile source-of-truth.
3. One scroll owner per screen.
4. Primary touch targets are `44px` minimum.
5. Roll out high-blast mobile changes in small, reversible waves.
6. Prefer extending existing contracts over introducing new framework-level abstractions.

## Breakpoint Contract
- Primary mobile breakpoint: `900px`.
- Secondary compact-phone breakpoint is allowed only if explicitly codified and documented; no ad hoc compact breakpoints.
- JS viewport classification, CSS mobile breakpoints, and telemetry dimensions must use the same shared contract.
- Existing unplanned `768px` mobile classification must be removed.

## Viewport + Layout Contract
1. Prefer `dvh`-backed runtime values through `--app-height` for mobile primary height containers.
2. Keep `svh`/`vh` fallbacks for browser variance.
3. No unallowlisted core route should use raw `100vh` as authored mobile source-of-truth.
4. Fallback-only `100vh` use inside shared contracts such as `var(--app-height, 100vh)` is acceptable.
5. Safe-area top/bottom offsets must be part of the shared shell/layout contract, not copied per route.
6. Surface-level scroll-body ownership must be explicit; route-local double-scroll patterns are defects.

When `NEXT_PUBLIC_MOBILE_VP_V2=1`:
- `MobileViewportRuntime` sets `--app-vh` and `--app-height` from `visualViewport.height` (fallback: `innerHeight`).
- Updates run on `resize`, `orientationchange`, `visualViewport.resize`, and mobile breakpoint changes.

Allowlisted fallback uses of raw `100vh`:
- CSS variable defaults and shared fallback expressions.
- Desktop-only contexts where mobile height is not the source-of-truth.

## Scroll Contract
What already exists:
- shared breakpoint base
- shared viewport runtime
- shared root scroll-lock policy

What still needs to be standardized and adopted:
- surface-level scroll-body ownership
- shell-level safe-area spacing rules
- route-level height ownership
- shared mobile footer/header/body composition rules

## Telemetry Contract
Primary decision:
- Reuse the reliability telemetry pipeline for mobile canary signals.
- Local mobile telemetry in `litrev:mobile-metrics:v1` remains debug support, not the primary canary channel.

Mobile telemetry event types:
- `mobile_viewport_issue`
- `mobile_keyboard_overlap`
- `mobile_action_tap`
- `mobile_drawer_opened`
- `mobile_flow_completed`

Primary KPI lenses:
- Success rate from `mobile_flow_completed` for high-value flows.
- Mis-tap proxy from repeated `mobile_action_tap` on same action/route within `800ms`.
- Route-level mobile error concentration after each rollout wave.

## Active Tasks (Mobile Foundation)
- [ ] `MOB-FND-001` Breakpoint contract completion:
  - Replace remaining unplanned `768px` mobile behavior/classification with shared `900px` exports.
  - Decide whether `500px` remains as an explicit compact-phone breakpoint and document it if kept.
  - Normalize performance/reliability telemetry viewport classification to the shared contract.
  - Rollback: revert/redeploy only.
- [ ] `MOB-FND-002` Shared mobile layout contract:
  - Codify shared rules for `--app-height`, safe-area spacing, scroll-body ownership, touch-size tokens, and mobile gutters.
  - Add lightweight helpers or CSS utilities only if needed.
  - Do not introduce a full reusable `MobileSurfaceFrame` abstraction until at least two route adoptions prove the shape.
  - Rollback: revert/redeploy only.
- [ ] `MOB-FND-003` App shell + sidebar mobile adoption:
  - Migrate app shell and sidebar away from raw `100vh` source-of-truth patterns.
  - Make mobile nav offset and safe-area behavior part of the shell contract.
  - Preserve desktop behavior above `900px`.
  - Rollback: `NEXT_PUBLIC_MOBILE_SHELL_V2=0` and redeploy.
- [ ] `MOB-FND-004` Home mobile entry experience:
  - Adopt the shared mobile layout contract on home.
  - Fix loading, zero-state, resume, and projects entry flows to behave intentionally on phone widths.
  - Redesign the sample review card/mobile project entry treatment so it is mobile-first rather than a squeezed desktop promo card.
  - Rollback: `NEXT_PUBLIC_MOBILE_HOME_V2=0` and redeploy.
- [ ] `MOB-FND-005` Login/auth mobile shell:
  - Normalize login/auth viewport and keyboard behavior without forcing auth into the same visual shell as home or protocol.
  - Preserve auth-specific layout while adopting the shared mobile contract.
  - Rollback: `NEXT_PUBLIC_MOBILE_AUTH_V2=0` and redeploy.
- [ ] `MOB-FND-006` Protocol mobile adoption:
  - Migrate protocol to the shared mobile layout contract.
  - Align body height and scroll ownership with project shell mobile rules.
  - Rollback: `NEXT_PUBLIC_MOBILE_PROTOCOL_V2=0` and redeploy.
- [ ] `MOB-FND-007` Shared touch-target and density pass:
  - Enforce `44px` minimum targets on shared mobile controls.
  - Fix mobile nav items, tab controls, dismiss buttons, and shared icon-button patterns.
  - Move secondary/destructive actions to overflow where necessary.
  - Rollback: route-group flag rollback where available; otherwise split further or revert/redeploy.
- [ ] `MOB-FND-008` Reliability telemetry + mobile e2e certification:
  - Reuse reliability telemetry for mobile canary signals and normalize it to the `900px` contract.
  - Expand mobile e2e from smoke coverage to behavior-level coverage for home, login, project shell, and protocol.
  - Keep local mobile telemetry as debug support.
  - Rollback: telemetry code can be reverted independently; e2e changes require no rollback.
- [ ] `MOB-FND-009` Admin/settings mobile audit:
  - Audit admin/settings for actual mobile contract drift and user-impacting mobile defects.
  - Only bring admin/settings into this phase if the audit shows enough breakage to justify a dedicated rollout wave.
  - Rollback: if implemented, gate behind `NEXT_PUBLIC_MOBILE_ADMIN_V2` or defer to a later wave.

## Active Tasks (Chat Experience)
- [ ] `MOB-002` Shared mobile chat shell primitive:
  - Define reusable shell contract for chat surfaces: top bar, history drawer, timeline body, sticky safe-area composer.
  - Apply in project conversation first, then `/ai`, then popup.
- [ ] `MOB-004` Project conversation mobile hardening:
  - Ensure header/composer actions meet touch-target rules.
  - Preserve conversation picker ergonomics on narrow screens.
- [ ] `MOB-005` Popup mobile mode redesign:
  - Phone viewports use sheet/full-height behavior.
  - Desktop compact popup remains unchanged.
  - Keep one-tap "Continue in Copilot" handoff.
- [ ] `MOB-006` Touch target and action density pass:
  - Audit timeline/composer controls to `44px` minimum targets.
  - Move secondary actions to overflow where needed.
- [ ] `MOB-007` Mobile telemetry completion:
  - Instrument project conversation drawer/send/retry flows.
  - Standardize `mobile_flow_completed` across send/retry/handoff paths.
- [ ] `MOB-008` Mobile e2e expansion:
  - Add drawer open/close/select coverage.
  - Add send/stop/retry and popup-to-copilot behavior-level tests.

## Recently Completed
- [x] `MOB-001` Breakpoint contract unification to `900px` with shared JS/CSS alignment.
- [x] `/ai` mobile-v2 history drawer behavior shipped behind `NEXT_PUBLIC_MOBILE_AI_V2`.
- [x] Popup mobile-v2 responsive behavior expanded for `<=900px`.

## Rollout Order
Enable or roll out one wave at a time:
1. `NEXT_PUBLIC_MOBILE_VP_V2`
2. `MOB-FND-001` breakpoint normalization
3. `MOB-FND-002` shared mobile layout contract
4. `NEXT_PUBLIC_MOBILE_SHELL_V2`
5. `NEXT_PUBLIC_MOBILE_HOME_V2`
6. `NEXT_PUBLIC_MOBILE_AUTH_V2`
7. `NEXT_PUBLIC_MOBILE_PROTOCOL_V2`
8. shared touch-target sweep
9. reliability telemetry + mobile e2e certification
10. chat foundation follow-up:
   - `NEXT_PUBLIC_MOBILE_AI_V2`
   - `NEXT_PUBLIC_MOBILE_NOTES_V2`
   - `NEXT_PUBLIC_MOBILE_LEDGER_V2`
   - `NEXT_PUBLIC_MOBILE_DRAFT_V2`
   - `NEXT_PUBLIC_MOBILE_POPUP_V2`
   - `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2` last

## Rollback Semantics
- `NEXT_PUBLIC_*` flags are build-time public env flags; rollback is redeploy-based by default.
- Runtime-immediate rollback only exists if runtime config service is introduced.

Rollback matrix:
- global viewport runtime regression: `NEXT_PUBLIC_MOBILE_VP_V2=0`
- shell or sidebar regression: `NEXT_PUBLIC_MOBILE_SHELL_V2=0`
- home regression: `NEXT_PUBLIC_MOBILE_HOME_V2=0`
- login/auth regression: `NEXT_PUBLIC_MOBILE_AUTH_V2=0`
- protocol regression: `NEXT_PUBLIC_MOBILE_PROTOCOL_V2=0`
- `/ai` regression: `NEXT_PUBLIC_MOBILE_AI_V2=0`
- `/project/[id]/notes` regression: `NEXT_PUBLIC_MOBILE_NOTES_V2=0`
- `/project/[id]/ledger` regression: `NEXT_PUBLIC_MOBILE_LEDGER_V2=0`
- `/project/[id]/draft` regression: `NEXT_PUBLIC_MOBILE_DRAFT_V2=0`
- popup regression: `NEXT_PUBLIC_MOBILE_POPUP_V2=0`
- shell dead-scroll/double-scroll regression in chat shells: `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=0`
- non-flagged contract cleanup waves: revert and redeploy

After changing any `NEXT_PUBLIC_*` value, redeploy to apply.

## Validation Gates
Per rollout step and per significant mobile behavior change:
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && npm run test:e2e:mobile`
4. Manual pass on iOS Safari + Chrome Android:
  - no dead/double scroll
  - keyboard does not hide primary actions
  - safe-area offsets are correct
  - home, login, shell, and protocol flows complete

Targeted validation matrix:
1. all mobile flags `0` where applicable
2. `VP=1` only
3. `VP=1` + `SHELL=1`
4. `VP=1` + `HOME=1`
5. `VP=1` + `AUTH=1`
6. `VP=1` + `PROTOCOL=1`
7. route-group combinations as each new wave is introduced
8. all relevant foundation flags `1`

## Dependencies
- `docs/plans/plan-chat-unification-v2.md`
- `docs/plans/plan-thinking-v2.md`
- `docs/runbooks/reliability-a3-canary.md`

## Future Sections (To Expand)
- Onboarding mobile UX beyond auth shell hardening.
- Non-chat project surfaces beyond protocol, notes, ledger, and draft viewport adoption.
- Admin and settings mobile usability if audit proves they belong in the foundation wave.
- Deep per-surface chat interaction polish after foundation completion.
