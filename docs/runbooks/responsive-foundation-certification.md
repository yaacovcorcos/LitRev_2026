# Responsive Foundation Certification Runbook

## Scope
This runbook governs certification of the responsive foundation after `MOB-FND-001` through `MOB-FND-008`.

It is the operational reference for:
- route-level reliability evidence on foundation surfaces
- behavior-level responsive e2e coverage
- viewport-tier interpretation for `phone`, `compact`, and `desktop`

It does not replace the stream-focused `docs/runbooks/reliability-a3-canary.md`.

## Operational telemetry contract
Primary operational path:
- `reliability.v1.route.ready`
- `reliability.v1.route.flow_completed`
- existing `reliability.v1.shell.session_started`
- existing `reliability.v1.shell.session_ended`

Supporting performance path:
- `performance_web_vital` with viewport dimensions aligned to:
  - `phone`
  - `compact`
  - `desktop`

Local-only debug path:
- `next-app/lib/mobile/telemetry.ts`
- use for local diagnosis only, not promotion decisions

## Foundation certification surfaces
Operational telemetry surfaces:
- `home`
- `auth`
- `project`
- `protocol`
- `shell`

Required route templates:
- `/`
- `/login`
- `/signup`
- `/project/[id]`
- `/project/[id]/protocol`

`/ai` remains a required responsive non-regression smoke surface, but not a primary certification route in this runbook.

## Required route evidence
### Home
- `reliability.v1.route.ready`
  - `routeTemplate = "/"` with `state = "zero_state"` or `state = "workspace"`
- `reliability.v1.route.flow_completed`
  - `flow = "enter_workspace"` and/or `flow = "create_project"` and/or `flow = "open_sample_review"`

### Auth
- `reliability.v1.route.ready`
  - `/login` with `state = "loading"` or `state = "signin"`
  - `/signup` with `state = "loading"` or `state = "signup"`
- `reliability.v1.route.flow_completed`
  - `flow = "magic_link_requested"`

### Project shell
- `reliability.v1.route.ready`
  - `routeTemplate = "/project/[id]"`
  - `layoutMode = "embedded"` or `"standalone"`
- `reliability.v1.shell.session_started`
- `reliability.v1.shell.session_ended`

### Protocol
- `reliability.v1.route.ready`
  - `routeTemplate = "/project/[id]/protocol"`
  - `layoutMode = "embedded"` or `"standalone"`

## Required certification suite
Run from `next-app/`:

```bash
npx tsc --noEmit
npx vitest run
npm run test:e2e:mobile:foundation
```

Broader mobile smoke is no longer part of the required `check` job by default.
Use it separately when mobile-sensitive code paths changed:

```bash
npm run test:e2e:mobile:smoke
```

GitHub automation contract:
- `CI / check` runs `test:e2e:mobile:foundation`
- `Mobile Smoke / mobile-smoke` runs `test:e2e:mobile:smoke` on pull requests that touch:
  - `next-app/app/**`
  - `next-app/components/**`
  - `next-app/styles/**`
  - `next-app/e2e/**`
  - `next-app/playwright.config.ts`
  - `next-app/package.json`
  - `next-app/package-lock.json`
  - `next-app/lib/mobile/**`
  - `next-app/lib/ai/reliability-telemetry.ts`
  - `next-app/app/PerformanceVitalsReporter.tsx`
  - `.github/workflows/**`
- docs-only mobile plan/runbook changes do not trigger the broader smoke workflow by default

Required responsive behavior coverage:
- home:
  - zero-state or workspace usable on phone
  - workspace usable on compact
- auth:
  - login usable on phone
  - signup usable on phone
- project shell:
  - usable on phone
  - usable on compact
- protocol:
  - usable on phone
  - usable on compact
- `/ai`:
  - existing mobile entry smoke still passes

## Viewport interpretation
- `phone`
  - true phone layout and interaction assumptions
- `compact`
  - condensed desktop/tablet behavior
- `desktop`
  - wide and expansive layouts folded together for operational reporting

If a regression affects `compact` only, do not treat it as “mobile fixed” just because `phone` is green.

## Promotion checklist
Before declaring the responsive foundation certified:
1. Reliability route events are ingesting successfully for `home`, `auth`, `project`, and `protocol`.
2. `phone` and `compact` viewport classes both appear in telemetry during validation or canary evidence.
3. `npm run test:e2e:mobile:foundation` passes as the required route-certification gate.
4. `npm run test:e2e:mobile:smoke` passes when the pull request or rollout wave touches mobile-sensitive code paths beyond the minimum certification routes.
5. Existing `/ai` and stream reliability signals remain healthy under the current rollout.
6. No open P0/P1 responsive incidents remain on home/auth/project/protocol.

## Rollback interpretation
If a regression is isolated to:
- `phone`: inspect route-level surface contract and touch/offset behavior first
- `compact`: inspect shell/sidebar/panel tier behavior first
- `desktop`: treat as a general regression, not a mobile-foundation-specific issue

If reliability ingestion fails for the new route events:
1. revert the schema/event expansion
2. keep local debug telemetry available
3. do not claim responsive foundation certification complete
