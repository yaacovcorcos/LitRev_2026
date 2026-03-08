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

## Transitional JS / Runtime Consumers
| File | Current breakpoint | Classification | Decision | Follow-up owner |
|---|---:|---|---|---|
| `next-app/components/mobile/MobileViewportRuntime.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional legacy mobile cutoff | transitional | `MOB-FND-002` / shell adoption |
| `next-app/app/ai/page.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional compact-or-phone behavior | transitional | chat foundation |
| `next-app/app/project/[id]/layout.tsx` | `900` via `MOBILE_VIEWPORT_MEDIA_QUERY` | transitional project-shell mobile behavior | transitional | `MOB-FND-003` |
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
| `next-app/components/project/ProjectTabBar.module.css` | tab-bar compact layout tweaks | `768` | likely `compact` density/layout behavior | defer | `MOB-FND-003` |
| `next-app/components/copilot/TimelineMessages.module.css` | message/timeline narrow-layout tweaks | `768` | likely `compact` or chat-specific behavior | defer | chat foundation |
| `next-app/components/PopupChat.module.css` | popup narrow-mode layout | `900` | transitional compact-or-phone behavior | defer | `MOB-005` |
| `next-app/components/PopupChat.module.css` | extra-tight popup density tweak | `500` | `tiny-phone` candidate | defer until popup redesign confirms semantics | `MOB-005` |
| `next-app/components/AppShell.module.css` | shell mobile layout | `900` | likely `compact` shell collapse, not phone-only | transitional | `MOB-FND-003` |
| `next-app/components/Sidebar.module.css` | sidebar collapse | `900` | likely `compact` | transitional | `MOB-FND-003` |
| `next-app/app/home.module.css` | home narrow layout | `900` | mixed compact + phone behavior | transitional | `MOB-FND-004` |
| `next-app/components/ProjectGrid.module.css` | project grid collapse | `900` | mixed compact + phone behavior | transitional | `MOB-FND-004` |
| `next-app/app/login/login.module.css` | login narrow layout / viewport math | `900` or route-local logic | mixed compact + phone behavior | transitional | `MOB-FND-005` |
| `next-app/app/project/[id]/protocol/protocol.module.css` | protocol narrow layout | `900` | mixed compact + phone behavior | transitional | `MOB-FND-006` |
| `next-app/components/MobileNav.module.css` | phone nav | `900` | should become phone-only | transitional | `MOB-FND-003` + `MOB-FND-007` |
| `next-app/components/TopBar.module.css` | top-bar responsive changes | `900` | compact shell behavior | transitional | `MOB-FND-003` |
| `next-app/components/UserMenu.module.css` | user menu responsive changes | `900` | compact shell behavior | transitional | `MOB-FND-003` |
| `next-app/components/ControlsBar.module.css` | controls-bar responsive changes | `900` | compact behavior | transitional | relevant surface wave |
| `next-app/components/ProjectCopilot.module.css` | project copilot responsive changes | `900` | chat/compact transitional behavior | transitional | chat foundation |
| `next-app/app/ai/ai-view.module.css` | `/ai` responsive changes | `900` | chat/compact transitional behavior | transitional | chat foundation |
| `next-app/app/project/[id]/project-shell.module.css` | project shell responsive changes | `900` | compact shell behavior | transitional | `MOB-FND-003` |
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
- Shell, home, auth, protocol, and chat waves are responsible for retiring transitional `900px` behavior surface-by-surface.
- No CSS rule should be mass-rewritten just because it contains `768`, `900`, or `500`; only semantically obvious rules are safe to migrate in the contract task.
