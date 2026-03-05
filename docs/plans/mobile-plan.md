# Mobile Plan

## Purpose
Define one canonical mobile strategy for the entire product mobile experience.

This plan combines execution tasks and rollout policy so mobile UX changes ship consistently and safely.
Chat UX is one section within this broader mobile plan.

## Scope
- App-wide mobile UX quality and reliability.
- Shared mobile foundations (viewport, breakpoints, scroll ownership, touch ergonomics).
- Surface-specific sections (chat, onboarding, navigation, admin, and others as added).

## Current Architecture
- Shared chat-runtime direction exists for `/ai` and project copilot via chat unification work; popup full runtime convergence remains pending (`U3` in chat unification plan).
- Mobile behavior is flag-gated and default-off:
  - `NEXT_PUBLIC_MOBILE_VP_V2`
  - `NEXT_PUBLIC_MOBILE_AI_V2`
  - `NEXT_PUBLIC_MOBILE_POPUP_V2`
  - `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`
  - `NEXT_PUBLIC_MOBILE_LEDGER_V2`
  - `NEXT_PUBLIC_MOBILE_NOTES_V2`
  - `NEXT_PUBLIC_MOBILE_DRAFT_V2`
- Canonical mobile breakpoint contract is `900px` across JS media-query logic and CSS mobile breakpoints.
- Project shell hides embedded copilot pane on narrow viewports; conversation mode is primary for project mobile chat.

## Section: Chat Experience (Current Focus)
- Surfaces: project conversation mode (`/project/[id]`), `/ai`, popup chat.
- Goal: unify behavior and quality across history, timeline, composer, and handoff flows.

## Principles (Non-Negotiable)
1. One chat engine, multiple shells; no per-surface runtime drift.
2. One mobile interaction model for history, timeline, and composer.
3. One scroll owner per screen.
4. Primary touch targets are 44px minimum.
5. Roll out behind flags with canary validation and explicit rollback.

## Viewport + Scroll Contract
1. Prefer `dvh` for primary app-height containers.
2. Keep `svh`/`vh` fallbacks for browser variance.
3. Avoid route-local `100vh` as source-of-truth.
4. Never rely on global `html/body` lock on mobile unless explicitly canary-gated.

When `NEXT_PUBLIC_MOBILE_VP_V2=1`:
- `MobileViewportRuntime` sets `--app-vh` and `--app-height` from `visualViewport.height` (fallback: `innerHeight`).
- Updates run on `resize`, `orientationchange`, `visualViewport.resize`, and mobile breakpoint changes.

## Telemetry Contract
Mobile telemetry event types:
- `mobile_viewport_issue`
- `mobile_keyboard_overlap`
- `mobile_action_tap`
- `mobile_drawer_opened`
- `mobile_flow_completed`

Storage is debug-only local telemetry (`litrev:mobile-metrics:v1`) until server ingest is added.

Primary KPI lenses:
- Success rate from `mobile_flow_completed` for `ai_message_send` and `popup_continue_to_copilot`.
- Mis-tap proxy from repeated `mobile_action_tap` on same action/route within 800ms.

## Active Tasks (Chat Experience)
- [ ] `MOB-002` Shared mobile chat shell primitive:
  - Define reusable shell contract (top bar, history drawer, timeline body, sticky safe-area composer).
  - Apply in project conversation first, then `/ai`, then popup.
- [ ] `MOB-004` Project conversation mobile hardening:
  - Ensure header/composer actions meet touch-target rules.
  - Preserve conversation picker ergonomics on narrow screens.
- [ ] `MOB-005` Popup mobile mode redesign:
  - Phone viewports use sheet/full-height behavior.
  - Desktop compact popup remains unchanged.
  - Keep one-tap "Continue in Copilot" handoff.
- [ ] `MOB-006` Touch target and action density pass:
  - Audit timeline/composer controls to 44px minimum targets.
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
Enable flags in this order (one new flag at a time):
1. `NEXT_PUBLIC_MOBILE_VP_V2`
2. `NEXT_PUBLIC_MOBILE_AI_V2`
3. `NEXT_PUBLIC_MOBILE_NOTES_V2`
4. `NEXT_PUBLIC_MOBILE_LEDGER_V2`
5. `NEXT_PUBLIC_MOBILE_DRAFT_V2`
6. `NEXT_PUBLIC_MOBILE_POPUP_V2`
7. `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2` (last)

## Rollback Semantics
- `NEXT_PUBLIC_*` flags are build-time public env flags; rollback is redeploy-based by default.
- Runtime-immediate rollback only exists if runtime config service is introduced.

Rollback matrix:
- `/ai` regression: `NEXT_PUBLIC_MOBILE_AI_V2=0`
- `/project/[id]/notes` regression: `NEXT_PUBLIC_MOBILE_NOTES_V2=0`
- `/project/[id]/ledger` regression: `NEXT_PUBLIC_MOBILE_LEDGER_V2=0`
- `/project/[id]/draft` regression: `NEXT_PUBLIC_MOBILE_DRAFT_V2=0`
- popup regression: `NEXT_PUBLIC_MOBILE_POPUP_V2=0`
- shell dead-scroll/double-scroll regression: `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=0`

After changing any `NEXT_PUBLIC_*` value, redeploy to apply.

## Validation Gates
Per rollout step and per significant mobile behavior change:
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && npm run test:e2e:mobile`
4. Manual pass on iOS Safari + Chrome Android:
  - no dead/double scroll
  - keyboard does not hide composer/actions
  - drawer interactions deterministic
  - send/retry/handoff flows complete

Targeted flag interaction matrix:
1. all mobile flags `0` (baseline)
2. `VP=1` only
3. `VP=1` + `AI=1`
4. `VP=1` + `POPUP=1`
5. `VP=1` + `SCROLL_LOCK=1`
6. all of `VP/AI/POPUP/SCROLL_LOCK=1`

## Dependencies
- `docs/plans/plan-chat-unification-v2.md`
- `docs/plans/plan-thinking-v2.md`
- `docs/runbooks/reliability-a3-canary.md`

## Future Sections (To Expand)
- Core app shell/navigation (home, projects index, mobile nav ergonomics).
- Onboarding and authentication mobile UX.
- Non-chat project surfaces (`protocol`, `ledger`, `draft`, `notes`, `memory`) beyond viewport/flag rollout.
- Admin and settings mobile usability.
