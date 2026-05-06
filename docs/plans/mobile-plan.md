# Mobile Plan

## Purpose
Define one canonical strategy for the entire product responsive and mobile experience.

This plan is the long-term implementation contract for how LitRev adapts across phone, compact desktop/tablet, wide desktop, and expansive layouts. Chat UX is one section within this broader plan, not the whole plan.

## Scope
- App-wide responsive UX quality and reliability.
- Shared foundations: responsive tiers, viewport handling, safe areas, scroll ownership, touch ergonomics, and shell behavior.
- Surface-specific sections: foundation, chat, onboarding, navigation, admin, and others as added.

## Current Architecture
- Shared breakpoint infrastructure now includes semantic tier exports in `next-app/lib/mobile/breakpoints.ts` and `next-app/lib/mobile/tiers.ts`; the legacy `900px` mobile query remains as an explicitly transitional contract for unmigrated shell/chat surfaces.
- Shared mobile viewport runtime exists in `next-app/components/mobile/MobileViewportRuntime.tsx` and is mounted globally from `next-app/app/providers.tsx`.
- Shared root scroll-lock policy exists in `next-app/lib/mobile/scroll-lock-policy.ts`.
- Shared responsive layout contract is now codified in `docs/plans/mobile-layout-contract.md` and backed by global CSS artifacts in `next-app/styles/tokens.css`, `next-app/styles/base.css`, and `next-app/styles/mobile-layout.css`.
- Some existing mobile-v2 surfaces are already flag-gated and default-off:
  - `NEXT_PUBLIC_MOBILE_VP_V2`
  - `NEXT_PUBLIC_MOBILE_AI_V2`
  - `NEXT_PUBLIC_MOBILE_POPUP_V2`
  - `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2`
  - `NEXT_PUBLIC_MOBILE_LEDGER_V2`
  - `NEXT_PUBLIC_MOBILE_NOTES_V2`
  - `NEXT_PUBLIC_MOBILE_DRAFT_V2`
- Shell responsive adoption is now gated behind `NEXT_PUBLIC_MOBILE_SHELL_V2`; home, auth, protocol, and admin follow-up waves are not yet organized behind dedicated public flags.
- Shared agent-platform/runtime direction exists for `/ai` and project copilot via `plan-agentic.md`; popup remains a truthful reduced subset, and later runtime sign-off/cleanup work now flows through `plan-agentic.md` and `plan-agent-quality.md`.
- Shared interaction ergonomics now use the existing `--touch-target-min` baseline across the highest-friction phone controls, including mobile nav, project tabs, toast dismiss, popup dismiss, study-file actions, export-history actions, and copilot remove/clear controls.
- Responsive foundation certification now exists as a real route-level contract for home, auth, project shell, protocol, and `/ai` entry, backed by reliability telemetry, `test:e2e:mobile:foundation`, and the responsive certification runbook.
- Required foundation certification hardening is now shipped:
  - `test:e2e:mobile:foundation` is the required blocking route-certification gate
  - broader mobile smoke runs separately as `test:e2e:mobile:smoke`
  - foundation Playwright setup uses seeded dev fixture routes for auth, home empty-workspace/workspace, sample/demo setup, blank project setup, and protocol-ready flows
  - Playwright runs with explicit E2E telemetry mode so operational reliability/performance telemetry does not ship during certification runs, with ingest logging quieted as a backstop
- Broader mobile smoke remains intentionally conservative and shallower than route-certification; the main remaining harness work is optimization and deeper coverage, not missing foundation infrastructure.
- Core route adoption of a long-term responsive contract is still incomplete:
  - app shell and sidebar now split `phone` vs `compact` behavior behind `NEXT_PUBLIC_MOBILE_SHELL_V2`, consume the shared viewport-height contract, and confine legacy `900px` shell/sidebar behavior to non-v2 consumers only
  - home now adopts the shared route/shell responsive contract across loading and workspace states, including empty authenticated workspaces, but shared `TopBar` / `ControlsBar` primitives remain explicitly transitional because their remaining `900px` behavior is not yet broadly correct across current consumers
  - login and signup now share a standalone `AuthShellFrame` that owns route height once, keeps decorative layers fixed, and gives the auth panel one inner scroll owner on phone when the keyboard shrinks the viewport
  - protocol now consumes shell height/offset once in both embedded and standalone paths; standalone `ProjectPageLayout` can switch to phone-only copilot collapse and child-owned scroll without changing the generic wrapper contract for other project pages
  - telemetry now classifies viewport as `phone` / `compact` / `desktop`, but many live surfaces still consume the transitional `900px` query until later foundation waves retire it
- The main remaining mobile debt is transitional responsive behavior in shared and chat surfaces: legacy `900px` breakpoint semantics, shared JS consumers of the old cutoff, and remaining authored raw `100vh` / `calc(100vh - …)` source-of-truth rules on core shells.
- Shared responsive debt is now split into two categories:
  - high-blast shared shell/layout debt that should be retired in one last foundation cleanup wave
  - chat-shell-specific transitional debt that should be retired inside the chat follow-up contract work rather than forced into a separate fake “pre-chat” cleanup phase
- `MOB-FND-009` audit closed without a dedicated implementation wave: the admin findings captured in `docs/plans/mobile-admin-audit.md` show transitional responsive debt, but not enough user impact to justify a standalone admin rollout, and there is still no standalone settings route in the current repo.
- Project shell hides the embedded copilot pane on narrower widths; conversation mode is already the primary mobile chat surface.

## Target Responsive Architecture
Long-term, LitRev should not use a single `desktop vs mobile` switch. It should use semantic layout tiers.

### Tier Model
1. `tiny-phone`: `<= 479px`
   - Density refinements only.
   - Tighter spacing, smaller gutters, shorter labels, stronger overflow behavior.
2. `phone`: `<= 767px`
   - True phone mode.
   - Single-column layout, phone navigation patterns, bottom sheets/drawers, large touch targets, reduced secondary chrome.
3. `compact`: `768px - 1199px`
   - Compact desktop/tablet mode.
   - Still desktop-like, but condensed.
   - Sidebars may collapse, secondary panes may drawerize, controls may wrap, grids may reduce columns.
   - This tier must not automatically become a phone UI.
4. `wide`: `1200px - 1439px`
   - Standard desktop layout.
5. `expansive`: `>= 1440px`
   - Optional richer multi-pane layouts, more whitespace, and longer-form analysis surfaces.

### Tier Rules
- Width defines layout mode.
- Phone-only interaction patterns must not be triggered by width alone above the `phone` tier.
- `pointer: coarse` and `hover: none` are secondary signals for interaction polish, not the primary trigger for phone layout.
- Major shell and pane changes should be viewport-tier driven.
- Internal card/grid/control adaptation should prefer component/container-level rules where possible instead of forcing every change through app-wide breakpoints.
- The current `900px` contract is transitional. Long-term, existing `900px` usages must be classified as either `phone` or `compact` behavior.

## Section: Mobile Foundation (Current Execution Priority)
Goal: replace the transitional single-cutoff mobile model with a long-term responsive tier system before deeper per-surface polish.

Definition of done:
1. Shell, home, login/auth, and protocol use the same responsive tier model.
2. Phone mode is reserved for actual phone-width layouts, not all narrow app windows.
3. No unallowlisted core route uses raw `100vh` or `calc(100vh - …)` as the authored phone source-of-truth.
4. Core shared controls meet the `44px` touch-target rule on phone and coarse-pointer contexts.
5. Mobile and responsive regressions are observable through reliability telemetry and behavior-level e2e.
6. Chat and future surface work can build on this foundation instead of compensating for shell drift or breakpoint confusion.

## Section: Chat Experience
- Surfaces: project conversation mode (`/project/[id]`), `/ai`, popup chat.
- Goal: unify behavior and quality across history, timeline, composer, and handoff flows after the responsive foundation is stable.
- Constraint: compact widths may simplify chat chrome, but true phone interaction patterns should only appear in the `phone` tier.
- Execution note: `MOB-002` should absorb the remaining chat-shell-specific retirement of transitional `900px` and authored height behavior in `/ai`, project conversation shell, and popup where that cleanup is inseparable from the shared chat-shell contract itself.

## Principles (Non-Negotiable)
1. One canonical responsive tier contract, not ad hoc breakpoint drift.
2. Width-based layout mode and input-capability-based interaction polish are separate concerns.
3. One viewport-height contract for phone source-of-truth containers.
4. One scroll owner per surface.
5. Primary touch targets are `44px` minimum on phone and coarse-pointer contexts.
6. Roll out high-blast layout changes in small, reversible waves.
7. Prefer extending existing contracts over introducing new framework-level abstractions.
8. Component internals should compact progressively; breakpoints should not mean a totally different app unless the tier truly changes.

## Responsive Tier Contract
### Canonical tier thresholds
- `TINY_PHONE_MAX_WIDTH = 479`
- `PHONE_MAX_WIDTH = 767`
- `COMPACT_MAX_WIDTH = 1199`
- `WIDE_MIN_WIDTH = 1200`
- `EXPANSIVE_MIN_WIDTH = 1440`

### Contract rules
- `phone` is the only tier allowed to switch to phone navigation and phone-first surface composition.
- `compact` is not mobile in the product-behavior sense; it is a condensed desktop/tablet layout.
- Existing `900px` rules must be audited and reclassified as either `phone` or `compact`.
- Existing ad hoc `768px` and `500px` rules must be replaced by shared tier exports/tokens.
- JS viewport classification, CSS breakpoints, telemetry dimensions, and responsive tests must all use the same tier contract.
- Telemetry should distinguish at least `phone`, `compact`, and `desktop`; `expansive` is optional if it proves operationally useful.
- Performance telemetry and reliability telemetry must migrate together; `PerformanceVitalsReporter.tsx` is part of the same classifier contract, not a separate follow-up.

## Viewport + Layout Contract
Operational contract reference:
- `docs/plans/mobile-layout-contract.md`

1. Prefer `dvh`-backed runtime values through `--app-height` for phone-primary height containers.
2. Keep `svh`/`vh` fallbacks for browser variance.
3. No unallowlisted core route should use raw `100vh` or `calc(100vh - …)` as the authored phone source-of-truth.
4. Fallback-only shared expressions such as `var(--app-height, 100vh)` and `var(--app-min-height, 100vh)` are acceptable.
5. Safe-area top/bottom offsets must be part of the shared shell/layout contract, not copied per route.
6. Surface-level scroll-body ownership must be explicit; route-local double-scroll patterns are defects.
7. Compact layouts should not inherit phone viewport hacks unless the route truly uses phone-style composition.

When `NEXT_PUBLIC_MOBILE_VP_V2=1`:
- `MobileViewportRuntime` sets `--app-vh` and `--app-height` for the phone tier from `visualViewport.height` (fallback: `innerHeight`).
- Updates run on `resize`, `orientationchange`, `visualViewport.resize`, and responsive-tier changes.

Allowlisted fallback uses of raw `100vh`:
- CSS variable defaults and shared fallback expressions such as `var(--app-height, 100vh)` and `var(--app-min-height, 100vh)`.
- Desktop-only contexts where phone height is not the source-of-truth.

## Scroll Contract
What already exists:
- shared breakpoint base
- shared viewport runtime
- shared root scroll-lock policy

What still needs to be standardized and adopted:
- per-tier shell scroll expectations
- surface-level scroll-body ownership
- shell-level safe-area spacing rules
- route-level height ownership
- shared header/body/footer composition rules for phone vs compact surfaces

## Interaction Contract
- `hover`-dependent affordances must have non-hover fallbacks.
- Pointer precision may tune spacing and hit-area affordances, but must not be the sole trigger for phone composition.
- Phone-only navigation patterns include bottom nav, full-height drawers, and sheet-first secondary surfaces.
- Compact layouts should prefer collapsed sidebars, wrapped controls, hidden secondary panes, and inline drawers before adopting phone patterns.
- Dense data surfaces should prefer container-driven wrapping, horizontal overflow, or row-to-card transformations instead of indiscriminate shrinking.

## Telemetry Contract
Primary decision:
- Reuse the reliability telemetry pipeline for responsive and mobile canary signals.
- Local mobile telemetry in `litrev:mobile-metrics:v1` remains debug support, not the primary canary channel.

Telemetry classification contract:
- Stop using a single `desktop/mobile` split based on `900px`.
- Emit at least `phone`, `compact`, and `desktop` viewport classes.
- The one-time classification rebasing during transition is expected and should be noted in rollout/canary records.
- Rebase both reliability telemetry and performance telemetry viewport classification to the same tier contract.

Responsive telemetry event types:
- `mobile_viewport_issue`
- `mobile_keyboard_overlap`
- `mobile_action_tap`
- `mobile_drawer_opened`
- `mobile_flow_completed`

Primary KPI lenses:
- Success rate from `mobile_flow_completed` for high-value flows.
- Mis-tap proxy from repeated `mobile_action_tap` on the same action/route within `800ms`.
- Route-level responsive error concentration after each rollout wave.
- Regression concentration by viewport class (`phone`, `compact`, `desktop`).

## Active Tasks (Mobile Foundation)
- No active standalone foundation waves remain.
- Remaining shared/chat responsive debt now lives in the chat tranche, starting with `Phase 2 — MOB-002`.

## Active Tasks (Chat Experience)
- [ ] `Phase 2 — MOB-002` Shared responsive chat shell contract:
  - Define reusable shell contract for chat surfaces: top bar, history drawer, timeline body, sticky safe-area composer.
  - Apply in project conversation first, then `/ai`, then popup.
  - Keep `compact` behavior desktop-like where possible; reserve phone-only composition for the `phone` tier.
- [ ] `Phase 3 — MOB-004` Project conversation responsive hardening:
  - Ensure header/composer actions meet touch-target rules.
  - Preserve conversation picker ergonomics on `phone` and `compact` widths.
- [ ] `Phase 4 — MOB-005` Popup responsive mode redesign:
  - Phone viewports use sheet/full-height behavior.
  - Compact desktop popup remains anchored/desktop-like.
  - Keep one-tap `Continue in Copilot` handoff.
- [ ] `Phase 5 — MOB-006` Touch target and action density pass:
  - Audit timeline/composer controls to `44px` minimum targets.
  - Move secondary actions to overflow where needed.
- [ ] `Phase 6 — MOB-007` Responsive telemetry completion:
  - Instrument project conversation drawer/send/retry flows.
  - Standardize `mobile_flow_completed` across send/retry/handoff paths.
- [ ] `Phase 7 — MOB-008` Responsive e2e expansion:
  - Add drawer open/close/select coverage.
  - Add send/stop/retry and popup-to-copilot behavior-level tests.
  - Cover both phone and compact widths where behavior differs.

## Recently Completed
- [x] `MOB-FND-013` Shared transitional responsive debt retirement completed:
  - Retired the shared shell/sidebar authored `100vh` and `calc(100vh - …)` source-of-truth rules in favor of the shared viewport-height contract.
  - Confined legacy `900px` shell/sidebar behavior to non-v2 consumers and recorded the rule-level `migrate now` / `defer` audit in `docs/plans/mobile-breakpoint-migration-map.md`.
  - Explicitly deferred shared `TopBar` / `ControlsBar` breakpoint cleanup to later chat work because their remaining `900px` behavior is not broadly correct across current consumers.
- [x] `MOB-FND-012` Responsive telemetry test-mode cleanup completed:
  - Added explicit Playwright E2E telemetry mode through `next-app/lib/telemetry/e2e-mode.ts` and `next-app/playwright.config.ts`.
  - Disabled operational reliability/performance telemetry shipping during certification runs and suppressed ingest error logging in E2E mode as a backstop.
  - Narrowed shared Playwright helper stubbing to non-operational telemetry routes that remain outside the certification contract.
- [x] `MOB-FND-011` Seeded responsive fixture + route-state contract completed:
  - Added seeded auth, sample/demo project, blank project, and home-state setup through `next-app/e2e/helpers/foundation.ts` and dev fixture routes under `next-app/app/api/dev/`.
  - Replaced ambient UI-state discovery as test setup with deterministic seeded route-state control for empty workspace, populated workspace, project shell, and protocol-ready flows.
  - Proved foundation setup isolation well enough to allow `test:e2e:mobile:foundation` to run with `--workers=2`.
- [x] `MOB-FND-010` Mobile certification harness hardening completed:
  - Split required route-certification from broader smoke in `next-app/package.json`, `.github/workflows/ci.yml`, and `.github/workflows/mobile-smoke.yml`.
  - Kept `test:e2e:mobile:foundation` as the required blocking responsive foundation gate and moved broader mobile smoke to a separate workflow/status.
  - Left broader mobile smoke intentionally conservative while the foundation certification path became seeded, parallel-safe, and operationally distinct.
- [x] `MOB-FND-009` Admin/settings responsive audit completed:
  - Recorded the durable audit artifact in `docs/plans/mobile-admin-audit.md`.
  - Confirmed there is no standalone `app/settings` route in the current repo, so the present scope is admin-only.
  - Closed the task without a dedicated implementation wave because the current admin surfaces remain usable on transitional shell/layout semantics and did not show enough breakage to justify a standalone mobile rollout.
- [x] `MOB-FND-008` Reliability telemetry + responsive e2e certification completed:
  - Reused the reliability telemetry pipeline for responsive canary signals and normalized responsive route evidence to the shared tier contract.
  - Added behavior-level responsive certification coverage for home, login/signup, project shell, protocol, and `/ai` entry, backed by the dedicated `test:e2e:mobile:foundation` gate and responsive certification runbook.
  - Hardened project/home route resolution and the mobile certification helpers enough to make route-level mobile readiness observable and reproducible instead of ad hoc.
- [x] `MOB-FND-007` Shared touch-target and density pass completed:
  - Reused the existing `--touch-target-min` baseline and hardened the highest-friction shared phone controls instead of inventing a second interaction token system.
  - Increased hit areas and focus treatment for mobile nav items, project tab controls, toast/popup dismiss buttons, study-file/export actions, and copilot remove/clear affordances.
  - Kept the wave width-tier-first and limited shared primitive churn by only changing controls whose behavior is correct across current consumers.
- [x] `MOB-FND-006` Protocol responsive adoption completed:
  - Removed protocol route-local `100vh` / shell-offset recomputation and moved embedded + standalone protocol onto one shell-consumption model.
  - Added protocol-specific standalone wrapper controls so `ProjectPageLayout` can keep child-owned scroll and collapse the copilot only on the `phone` tier.
  - Retired the broad `900px` protocol fallback in favor of explicit `phone` behavior for route padding and standalone copilot collapse.
- [x] `MOB-FND-005` Login/auth responsive shell completed:
  - Added shared `AuthShellFrame` so sign-in, sign-up, and loading fallback now use one standalone route contract.
  - Replaced route-local `100vh` auth ownership with shared viewport-safe height handling and a single inner scroll owner on phone.
  - Preserved auth-specific visual composition while hardening keyboard and safe-area behavior.
- [x] `MOB-FND-004` Home responsive entry experience completed:
  - Moved loading to direct route-level surface ownership while keeping empty and populated workspace offset ownership with the shell contract.
  - Reworked home workspace entry behavior for `phone` vs `compact`, including tier-specific grid/list treatment and a structurally decoupled sample review card.
  - Added isolated extension hooks to `ControlsBar` so home-specific responsive behavior does not force a global primitive rewrite.

## Implementation Order
Build in this order:
1. `NEXT_PUBLIC_MOBILE_VP_V2`
2. `MOB-FND-001` responsive tier contract
3. `MOB-FND-002` shared responsive layout contract
4. `MOB-FND-003` app shell + sidebar responsive adoption
5. `MOB-FND-004` home responsive entry experience
6. `MOB-FND-005` login/auth responsive shell
7. `MOB-FND-006` protocol responsive adoption
8. `MOB-FND-007` shared touch-target sweep
9. `MOB-FND-008` reliability telemetry + responsive e2e certification
10. `Phase 2 — MOB-002` shared responsive chat shell contract
11. `Phase 3 — MOB-004` project conversation responsive hardening
12. `Phase 4 — MOB-005` popup responsive mode redesign
13. `Phase 5 — MOB-006` touch target and action density pass
14. `Phase 6 — MOB-007` responsive telemetry completion
15. `Phase 7 — MOB-008` responsive e2e expansion
16. optional admin/settings wave only if a future settings route or stronger admin mobile requirement justifies reopening that scope

## Rollout / Enablement Order
Enable in production one wave at a time:
1. `NEXT_PUBLIC_MOBILE_VP_V2`
2. `MOB-FND-001` and `MOB-FND-002` land dark or with revert/redeploy-only semantics; they do not require new public flags.
3. For `MOB-FND-003`, `MOB-FND-004`, `MOB-FND-005`, `MOB-FND-006`, and optional `MOB-FND-009`:
   - if that wave adds a dedicated public flag, canary it behind that real flag and use that flag for rollback
   - if that wave does not add a dedicated public flag, treat rollout as revert/redeploy-only
4. `MOB-FND-010`, `MOB-FND-011`, and `MOB-FND-012` are already completed internal certification/observability work and are not remaining rollout steps.
5. `MOB-FND-013` is complete; remaining breakpoint/height retirement that is inseparable from chat shells now belongs to `Phase 2 — MOB-002` and later chat waves.
6. Existing chat/mobile-v2 flags continue to roll out only after the foundation is stable:
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
- shell or sidebar regression: disable the dedicated shell flag if one is introduced in that wave; otherwise revert/redeploy
- home regression: disable the dedicated home flag if one is introduced in that wave; otherwise revert/redeploy
- login/auth regression: disable the dedicated auth flag if one is introduced in that wave; otherwise revert/redeploy
- protocol regression: disable the dedicated protocol flag if one is introduced in that wave; otherwise revert/redeploy
- `/ai` regression: `NEXT_PUBLIC_MOBILE_AI_V2=0`
- `/project/[id]/notes` regression: `NEXT_PUBLIC_MOBILE_NOTES_V2=0`
- `/project/[id]/ledger` regression: `NEXT_PUBLIC_MOBILE_LEDGER_V2=0`
- `/project/[id]/draft` regression: `NEXT_PUBLIC_MOBILE_DRAFT_V2=0`
- popup regression: `NEXT_PUBLIC_MOBILE_POPUP_V2=0`
- shell dead-scroll/double-scroll regression in chat shells: `NEXT_PUBLIC_MOBILE_SCROLL_LOCK_V2=0`
- shared touch-target regression: route-group flag rollback where available; otherwise revert and redeploy
- reliability or performance telemetry regression: revert telemetry code independently
- non-flagged contract cleanup waves: revert and redeploy

After changing any `NEXT_PUBLIC_*` value, redeploy to apply.

## Validation Gates
Per rollout step and per significant responsive behavior change:
1. `cd next-app && npx tsc --noEmit`
2. `cd next-app && npx vitest run`
3. `cd next-app && npm run test:e2e:mobile:foundation`
4. `cd next-app && npm run test:e2e:mobile` for the broader mobile smoke suite when the wave affects shared mobile flows beyond the minimum certification routes
5. Manual pass on iOS Safari + Chrome Android:
  - no dead/double scroll
  - keyboard does not hide primary actions
  - safe-area offsets are correct
  - home, login, shell, and protocol flows complete
6. Manual responsive pass on desktop/tablet widths:
  - compact layouts do not collapse into phone UI prematurely
  - multi-pane desktop layouts degrade progressively instead of abruptly

Targeted validation matrix:
1. `390px` phone width
2. `480px` tiny-phone boundary
3. `768px` compact boundary
4. `900px` legacy breakpoint sanity check
5. `1024px` compact tablet/narrow desktop
6. `1200px` wide boundary
7. `1440px` expansive boundary
8. relevant flag combinations as each new wave is introduced

## Dependencies
- `docs/plans/plan-agentic.md`
- `docs/plans/plan-agent-quality.md`
- `docs/runbooks/reliability-a3-canary.md`

## Future Sections (To Expand)
- Onboarding mobile UX beyond auth shell hardening.
- Non-chat project surfaces beyond protocol, notes, ledger, and draft responsive adoption.
- Admin and settings responsive usability if audit proves they belong in the foundation wave.
- Deep per-surface chat interaction polish after foundation completion.
