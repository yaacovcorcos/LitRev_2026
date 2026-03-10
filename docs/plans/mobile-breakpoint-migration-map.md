# Mobile Breakpoint Migration Map

## Purpose
This document is the durable audit artifact for `MOB-FND-001`.

It records how legacy `900px`, `768px`, and `500px` breakpoint usage maps onto the long-term responsive tier contract:
- `tiny-phone <= 479px`
- `phone <= 767px`
- `compact 768px - 1199px`
- `wide >= 1200px`
- `expansive >= 1440px`

Rule meanings:
- `migrate-now`: safe to move in `MOB-FND-001`
- `transitional`: keep current behavior for now and retire in named follow-up wave
- `defer`: semantics are not yet stable enough to rewrite in `MOB-FND-001`
- `keep`: intentional and already aligned with the new contract

## `MOB-FND-013` Shared Debt Audit
| File | Rule | Current behavior | Classification | Decision | Owner |
|---|---|---|---|---|---|
| `next-app/components/AppShell.module.css` | `.appContainer` authored `min-height: 100vh` | shared shell height source-of-truth | `migrate now` | replace with shared app-height contract in PR 1 | `MOB-FND-013` |
| `next-app/components/AppShell.module.css` | `.mainContent` / `.mainContentNoPad` authored `calc(100vh - header)` | shared shell content height source-of-truth | `migrate now` | replace with shared shell-content height contract in PR 1 | `MOB-FND-013` |
| `next-app/components/AppShell.module.css` | global `@media (max-width: 900px)` shell layout rules | mixed legacy `phone-or-compact` behavior | `migrate now` | confine legacy `900px` behavior to non-`shellV2` consumers in PR 1 | `MOB-FND-013` |
| `next-app/components/Sidebar.module.css` | `.sidebar` authored `calc(100vh - header)` | shared sidebar height source-of-truth | `migrate now` | replace with shared shell-content height contract in PR 1 | `MOB-FND-013` |
| `next-app/components/Sidebar.module.css` | global `@media (max-width: 900px)` hide rule | mixed legacy `phone-or-compact` behavior | `migrate now` | confine legacy `900px` behavior to non-`responsiveV2` consumers in PR 1 | `MOB-FND-013` |
| `next-app/components/Sidebar.module.css` | `.responsiveV2` height override | duplicate shared-height branch | `migrate now` | remove once `.sidebar` consumes the shared height contract directly in PR 1 | `MOB-FND-013` |
| `next-app/components/TopBar.module.css` | global `@media (max-width: 900px)` collapse | shared primitive with route-dependent consumers | `defer unless broadly correct` | only move in PR 2 if Slice A proves the behavior is correct across consumers; otherwise defer to `MOB-002+` | `MOB-FND-013` / `MOB-002+` |
| `next-app/components/ControlsBar.module.css` | global `@media (max-width: 900px)` wrap/collapse | shared primitive with route-dependent consumers | `defer unless broadly correct` | only move in PR 2 if Slice A proves the behavior is correct across consumers; otherwise defer to `MOB-002+` | `MOB-FND-013` / `MOB-002+` |

## Transitional JS / Runtime Consumers
| File | Current breakpoint | Classification | Decision | Follow-up owner |
|---|---:|---|---|---|
| `next-app/components/mobile/MobileViewportRuntime.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional legacy mobile cutoff | transitional | `MOB-FND-002` / shell adoption |
| `next-app/app/ai/page.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional compact-or-phone behavior | transitional | chat foundation |
| `next-app/app/project/[id]/layout.tsx` | conversation-mode root scroll-lock query | `phone` via `PHONE_MEDIA_QUERY` | keep (migrated in `MOB-002` PR 1) | completed |
| `next-app/app/project/[id]/layout.tsx` | non-conversation root scroll-lock query | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional embedded/view-mode behavior | defer | route-specific workspace follow-up |
| `next-app/app/project/[id]/draft/page.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional draft toolbar behavior | transitional | chat/draft follow-up |
| `next-app/components/project/ProjectTabBar.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional interaction behavior | transitional | `MOB-FND-003` / `MOB-004` |

## Telemetry / JS Classification
| File | Current breakpoint | Classification | Decision | Follow-up owner |
|---|---:|---|---|---|
| `next-app/app/PerformanceVitalsReporter.tsx` | `768` | viewport classification drift | migrate-now | `MOB-FND-001` |
| `next-app/lib/ai/reliability-telemetry.ts` | `768` | viewport classification drift | migrate-now | `MOB-FND-001` |
| `next-app/lib/mobile/telemetry.ts` | old mobile-context helper | phone-only telemetry context | migrate-now | `MOB-FND-001` |

## CSS Breakpoint Audit
| File | Rule | Current breakpoint | Target meaning | Decision | Follow-up owner |
|---|---|---:|---|---|---|
| `next-app/components/project/ProjectTabBar.module.css` | tab-bar phone touch-target and label-density behavior | `768` | `phone` interaction behavior | keep (migrated in `MOB-FND-007`) | completed |
| `next-app/components/copilot/TimelineMessages.module.css` | message/timeline narrow-layout tweaks | `768` | likely `compact` or chat-specific behavior | defer | chat foundation |
| `next-app/components/PopupChat.module.css` | popup narrow-mode layout | `900` | transitional compact-or-phone behavior | defer | `MOB-005` |
| `next-app/components/PopupChat.module.css` | extra-tight popup density tweak | `500` | `tiny-phone` candidate | defer until popup redesign confirms semantics | `MOB-005` |
| `next-app/components/AppShell.module.css` | shell mobile layout | `900` | split into `phone` bottom-nav behavior and `compact` collapsed-shell behavior | keep; shared shell retirement finalized in `MOB-FND-013` while legacy `900px` remains confined to non-`shellV2` consumers | completed |
| `next-app/components/Sidebar.module.css` | sidebar collapse | `900` | `compact` collapsed sidebar, `phone` hidden sidebar | keep; shared sidebar retirement finalized in `MOB-FND-013` while legacy `900px` remains confined to non-`responsiveV2` consumers | completed |
| `next-app/app/home.module.css` | home narrow layout | `900` | mixed compact + phone behavior | keep (migrated in `MOB-FND-004`) | completed |
| `next-app/components/ProjectGrid.module.css` | project grid collapse | `900` | mixed compact + phone behavior | keep (migrated in `MOB-FND-004`) | completed |
| `next-app/app/login/login.module.css` | login narrow layout / viewport math | `900` or route-local logic | mixed compact + phone behavior | keep (migrated in `MOB-FND-005`) | completed |
| `next-app/app/project/[id]/protocol/protocol.module.css` | protocol narrow layout | `900` | mixed compact + phone behavior | keep (migrated in `MOB-FND-006`) | completed |
| `next-app/components/project/ProjectPageLayout.module.css` | standalone project wrapper copilot collapse | `900` | protocol-specific wrapper behavior now split to `phone` while generic wrapper stays transitional elsewhere | keep (protocol path migrated in `MOB-FND-006`) | completed |
| `next-app/components/MobileNav.module.css` | phone nav | `900` | phone-only shell navigation | keep (migrated in `MOB-FND-003`; touch-target follow-up completed in `MOB-FND-007`) | completed |
| `next-app/components/TopBar.module.css` | top-bar responsive changes | `900` | compact shell behavior | transitional | relevant surface wave |
| `next-app/components/UserMenu.module.css` | user menu responsive changes | `900` | compact shell behavior | transitional | `MOB-FND-003` |
| `next-app/components/ControlsBar.module.css` | controls-bar responsive changes | `900` | compact behavior | transitional; home now uses scoped modifiers from `MOB-FND-004` without rewriting shared default behavior | relevant surface wave |
| `next-app/components/ProjectCopilot.module.css` | project copilot responsive changes | `900` | chat/compact transitional behavior | transitional | chat foundation |
| `next-app/app/ai/ai-view.module.css` | `/ai` responsive changes | `900` | chat/compact transitional behavior | transitional | chat foundation |
| `next-app/app/project/[id]/project-shell.module.css` | conversation-mode bottom offset | `767` | phone shell behavior | keep (migrated in `MOB-002` PR 1) | completed |
| `next-app/app/project/[id]/project-shell.module.css` | view-mode workspace/copilot collapse | `900` | route-specific workspace transitional behavior | defer | route-specific workspace follow-up |
| `next-app/app/project/[id]/project-workspace.module.css` | workspace responsive changes | `900` | compact behavior | transitional | `MOB-FND-003` |
| `next-app/app/project/[id]/onboarding/onboarding.module.css` | onboarding responsive changes | `900` | compact behavior | transitional | onboarding follow-up |
| `next-app/app/project/[id]/notes/notes.module.css` | notes responsive changes | `900` | route-specific transitional behavior | transitional | notes follow-up |
| `next-app/app/project/[id]/ledger/ledger.module.css` | ledger responsive changes | `900` | route-specific transitional behavior | transitional | ledger follow-up |
| `next-app/app/project/[id]/ledger/[studyId]/study.module.css` | study detail responsive changes | `900` | route-specific transitional behavior | transitional | ledger follow-up |
| `next-app/app/admin/admin.module.css` | admin responsive changes | `900` | compact behavior | transitional | `MOB-FND-009` |
| `next-app/components/SlimHeader.module.css` | header responsive changes | `900` | compact behavior | transitional | relevant surface wave |
| `next-app/components/markdown/CitationPreview.module.css` | citation preview responsive changes | `900` | compact behavior | transitional | relevant surface wave |

## Non-Breakpoint Width Constraint
| File | Rule | Current value | Meaning | Decision | Follow-up owner |
|---|---|---:|---|---|---|
| `next-app/app/project/[id]/memory/memory.module.css` | `max-width` content cap | `900` | content width/readability cap, not viewport tier | keep | memory follow-up if design changes |

## Notes
- `MOB-FND-001` intentionally introduces the new tier system without retargeting the legacy `900px` runtime query.
- `MOB-FND-002` adds the shared layout contract in `docs/plans/mobile-layout-contract.md` plus global safe-area and surface-role utilities, but still does not retarget transitional `900px` consumers.
- Shell, home, auth, protocol, and chat waves are responsible for retiring transitional `900px` behavior surface-by-surface.
- No CSS rule should be mass-rewritten just because it contains `768`, `900`, or `500`; only semantically obvious rules are safe to migrate in the contract task.
