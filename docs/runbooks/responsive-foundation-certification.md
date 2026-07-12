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

For public home/auth surfaces, valid route-ready and route-flow telemetry must ingest successfully without an authenticated session. A `401` or `403` on the normal `/`, `/login`, or `/signup` operational telemetry path is a regression.

Supporting performance path:
- `performance_web_vital` with viewport dimensions aligned to:
  - `phone`
  - `compact`
  - `desktop`

Local-only debug path:
- `next-app/lib/mobile/telemetry.ts`
- use for local diagnosis only, not promotion decisions

Playwright E2E mode:
- Playwright starts Next with `NEXT_PUBLIC_E2E_TEST_MODE=1` and `E2E_TEST_MODE=1`
- reliability and performance telemetry do not ship in that mode
- telemetry ingest routes suppress error logging in that mode as a backstop
- the shared foundation helper only stubs non-operational telemetry routes still outside this contract (`chat-unification`, `citation-preview`, `context-capture`)
- local `next-app/lib/mobile/telemetry.ts` storage remains best-effort and is not the primary no-ship target

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
  - `routeTemplate = "/"` with `state = "loading"` or `state = "workspace"`
- `reliability.v1.route.flow_completed`
  - `flow = "create_project"` and/or `flow = "open_sample_review"`

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
npm run typecheck
npm run test:vitest
npm run test:e2e:foundation
```

Broader mobile smoke is no longer part of the required `check` job by default.
Use it separately when mobile-sensitive code paths changed:

```bash
npm run test:smoke:mobile
```

GitHub automation contract:
- `Browser Foundation / browser-foundation` runs `test:e2e:foundation` on pushes to `main` and on pull requests that touch:
  - `next-app/app/**`
  - `next-app/components/**`
  - `next-app/styles/**`
  - `next-app/e2e/**`
  - `next-app/playwright.config.ts`
  - `next-app/package.json`
  - `next-app/package-lock.json`
  - `next-app/lib/mobile/**`
  - `next-app/lib/ai/**`
  - `next-app/lib/server/agent/**`
  - `next-app/lib/server/ai/**`
  - `next-app/contexts/**`
  - `next-app/hooks/**`
  - `next-app/types/**`
  - `next-app/app/PerformanceVitalsReporter.tsx`
  - `.github/workflows/**`
- the lane uploads `browser-foundation-playwright-report` for failure inspection
- `test:smoke:mobile` is currently a local-only adjunct lane; if a dedicated automated broader-smoke workflow is added later, update this runbook, `docs/runbooks/testing-ci-strategy.md`, and `docs/plans/plan-testing-execution.md` in the same task
- docs-only mobile plan/runbook changes do not trigger the foundation workflow by default

Foundation Playwright setup now uses seeded dev fixture routes so auth, home, sample/demo project setup, blank project setup, and protocol-ready setup do not share one ambient workspace:
- `/api/dev/quick-login`
- `/api/dev/demo-project`
- `/api/dev/test-project`
- `/api/dev/test-home-state`

Certification rule:
- `test:e2e:foundation` is allowed to run with `--workers=2` because the fixture contract is seed-aware per worker/test.
- responsive route scenarios remain mobile-project-owned; shared agent/offline scenarios run on both configured Chromium projects in the same foundation command.
- Broader `test:smoke:mobile` coverage remains conservative until non-foundation mobile flows prove the same isolation guarantees.

Required responsive behavior coverage:
- home:
  - empty workspace usable on phone
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
  - authenticated entry reaches the chat composer rather than treating a login redirect as success
  - deterministic output, tool activity, clarification, cancellation/recovery, offline, and artifact-action scenarios pass on mobile and desktop Chromium

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
3. `npm run test:e2e:foundation` passes as the required route-certification gate.
4. `npm run test:smoke:mobile` passes when the pull request or rollout wave touches mobile-sensitive code paths beyond the minimum certification routes.
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
