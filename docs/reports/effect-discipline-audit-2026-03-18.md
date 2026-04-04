# Effect Discipline Audit Baseline (2026-03-18)

## Purpose

Freeze the starting point for the effect-discipline rollout so follow-up migrations can be measured against one stable baseline instead of chat memory.

## Baseline Inventory

- Direct `useEffect` / `useLayoutEffect` call sites in `next-app/`, excluding tests: `201`
- Files with at least one direct `useEffect` / `useLayoutEffect`, excluding tests: `65`
- Highest-signal hot spots for the first migration batch:
  - `next-app/app/ai/page.tsx`
  - `next-app/contexts/ProjectConversationContext.tsx`
  - `next-app/hooks/useProjectConversationManager.ts`
  - `next-app/components/chat/ChatComposerCore.tsx`
  - `next-app/components/chat/ChatTimeline.tsx`
  - `next-app/components/PopupChat.tsx`

## Classification

The current repo contains a mix of:

- Allowed external synchronization:
  - media-query subscriptions
  - scroll ownership and measurement
  - DOM listeners and timers
  - focus management
  - popup drag positioning
  - canvas/audio and editor/widget lifecycle work
- Reset choreography:
  - conversation, scope, and popup-local state reset on identity changes
- Data loading:
  - route and panel bootstrap work still triggered from client effects
- Prop/state mirroring:
  - hydration flags, derived local mirrors, and local draft sync
- Latest-value ref mirrors:
  - refs updated only to feed async callbacks and subscriptions
- Event-trigger orchestration:
  - queued follow-up dispatch and similar `state -> effect -> action` flows

## Frozen First Migration Targets

1. Shared chat/runtime hot spots
   - `/ai`
   - project copilot runtime
   - timeline-local UI state
2. Identity/reset boundaries
   - popup runtime
   - project-layout conversation and scope restore behavior
3. Route/bootstrap data ownership
   - onboarding
   - project overview
   - study detail
   - memory tabs

## Rules for This Rollout

- Treat this as an audited hot-spot program, not a repo-wide rewrite.
- Warning-only lint comes first, then code migration, then tighter enforcement.
- Direct effects remain allowed for explicit external synchronization.
- New shared hooks should cover generic browser/DOM synchronization only; route/widget resource hooks should be introduced only when a specific migration needs them.

## Landed in This Batch

- Shared external-sync primitives were added:
  - `useHydrated`
  - `useMountEffect`
  - `useMediaQuery`
  - `useWindowEvent`
  - `useDocumentEvent`
  - `useBodyScrollLock`
  - `useIdleTask`
- Targeted warning-only lint now flags direct `useEffect` / `useLayoutEffect` imports in the first chat/runtime hot spots.
- First chat/runtime migrations landed in:
  - `/ai`
  - `ProjectConversationContext`
  - `useProjectConversationManager`
  - `ChatComposerCore`
  - `ChatTimeline`
  - `PopupChat`
- Route/bootstrap ownership now uses server bootstraps for:
  - project overview stats
  - onboarding protocol state
  - onboarding progress state
- Widget/resource ownership now uses named resource hooks for:
  - recent activity
  - project token usage
  - draft export history
