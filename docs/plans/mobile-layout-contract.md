# Mobile Layout Contract

## Purpose
This document is the operational contract for `MOB-FND-002`.

It defines the shared layout semantics that responsive route waves must consume after `MOB-FND-001` established the semantic tier model. The plan tracker remains [mobile-plan.md](./mobile-plan.md); this document holds the reusable layout contract itself.

## Scope
This contract covers:
- phone height source-of-truth containers
- global safe-area variables
- shared layout roles for surface root, scroll body, and sticky footer
- shared gutter and section-gap defaults for phone vs compact layouts
- how later waves (`MOB-FND-003` through `MOB-FND-006`) should adopt the contract

This contract does not:
- retarget the transitional `900px` runtime query
- redesign route layouts
- define route-specific visual composition

## Shared Sources of Truth

### Viewport height
- Runtime-managed concern.
- Source variables:
  - `--app-vh`
  - `--app-height`
  - `--app-min-height`
- These are authored by `MobileViewportRuntime` when `NEXT_PUBLIC_MOBILE_VP_V2=1`.
- Until later responsive-foundation waves retire the transitional cutoff, runtime behavior remains keyed to the legacy `900px` query for existing consumers.

### Safe-area insets
- CSS-managed concern.
- Global aliases in `styles/tokens.css` are authoritative:
  - `--safe-area-top`
  - `--safe-area-right`
  - `--safe-area-bottom`
  - `--safe-area-left`
- These must remain direct aliases to `env(safe-area-inset-*, 0px)`.
- Routes should consume these variables, not repeat `env(...)` inline unless there is a reviewed exception.

## Tier Semantics
- `phone` is the only tier allowed to use phone-first composition patterns.
- `compact` is condensed desktop/tablet layout, not phone mode.
- `tiny-phone` is a density refinement only.

For layout contract adoption:
- phone-primary surfaces may use `--app-height` and safe-area-aware sticky footer regions
- compact surfaces should prefer normal document flow plus condensed gutters and panel collapse
- compact surfaces should not inherit phone viewport hacks by default

## Shared Layout Roles

### 1. Surface root
Role:
- owns the surface stack
- establishes shared gutters/gaps
- optionally owns phone-height behavior

Shared implementation:
- `.surface-root`
- optional attributes:
  - `data-surface-height="phone"`
  - `data-surface-height="phone-min"`
  - `data-surface-height="shell"`
  - `data-surface-gutters="responsive"`

Contract:
- `surface-root` is `display: flex`, `flex-direction: column`, `min-height: 0`
- responsive gutters and section spacing come from shared tokens
- `data-surface-height="shell"` is the shared pattern for content that lives beneath a fixed app header
- route-specific offsets should be expressed through custom properties such as `--surface-bottom-offset`, not hardcoded repeated padding math

### 2. Surface scroll body
Role:
- the one scrolling region inside a surface when a contained-scroll layout is required

Shared implementation:
- `.surface-scroll-body`
- optional attributes:
  - `data-surface-padding="responsive"`
  - `data-surface-padding="block-end"`

Contract:
- `surface-scroll-body` owns vertical scrolling
- `flex: 1` and `min-height: 0` are required to avoid double-scroll or clipping in flex layouts
- bottom padding should derive from `--surface-bottom-offset`
- routes should not create nested scroll owners unless there is a reviewed exception

### 3. Sticky footer region
Role:
- sticky bottom-safe area for composers, action bars, or footer controls

Shared implementation:
- `.surface-sticky-footer`
- optional attribute:
  - `data-surface-footer-offset="surface"`

Contract:
- sticky footer padding must derive from shared safe-area vars or `--surface-bottom-offset`
- routes may override `--surface-sticky-footer-bg` if a different background is needed
- sticky footer is for local surface controls, not for global navigation chrome

## Shared Tokens
Defined in `next-app/styles/tokens.css`:
- `--touch-target-min`
- `--phone-page-gutter`
- `--compact-page-gutter`
- `--phone-section-gap`
- `--compact-section-gap`
- `--shell-content-min-height`

Usage rules:
- token names are semantic, not route-specific
- route-level styles may override derived vars such as `--surface-bottom-offset`
- route-level styles should not redefine the global safe-area aliases

## Allowed Patterns

### Allowed phone-height pattern
```css
min-height: var(--app-height, 100vh);
```

### Allowed minimum-height fallback pattern
```css
min-height: var(--app-min-height, 100vh);
```

### Allowed shell-under-header pattern
```css
min-height: var(--shell-content-min-height);
```

### Allowed safe-area consumption pattern
```css
padding-bottom: var(--safe-area-bottom);
```

### Allowed surface override pattern
```css
--surface-bottom-offset: calc(var(--mobile-nav-offset, 0px) + var(--safe-area-bottom));
```
Only use this when the local surface truly needs to account for route-level navigation chrome.

## Disallowed Patterns
- repeating `env(safe-area-inset-bottom)` in every route without using shared vars
- using raw `100vh` as the authored phone source-of-truth on new route work
- making `compact` surfaces inherit phone-only footer/nav behavior by default
- creating more than one primary scroll owner inside a surface without explicit design review

## Adoption Guidance By Wave
- `MOB-FND-003`: app shell and sidebar now adopt shared shell-height and phone-only offset rules behind `NEXT_PUBLIC_MOBILE_SHELL_V2`; full shell scroll-owner normalization remains conservative until later route waves prove compatibility
- `MOB-FND-004`: home now uses direct route-level `surface root` ownership for loading/zero-state and shell-owned offset consumption for workspace content; sample review entry is structurally decoupled from the create-new card scaffold
- `MOB-FND-005`: login/auth should adopt the shared height and safe-area contract while keeping its own visual shell
- `MOB-FND-006`: protocol should adopt shared root/body/footer roles for its contained-scroll layout
- chat/mobile follow-up waves should use sticky footer roles for composer/action regions where applicable

## Runtime Boundary
`MOB-FND-002` does not retarget `MobileViewportRuntime` from the transitional `900px` query to `phone`. That retirement happens only in later route/shell waves after the consuming surfaces are explicitly migrated.
